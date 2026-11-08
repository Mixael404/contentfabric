import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Campaign, Post } from '../db/schema.js';
import { getPost } from '../db/repo.js';
import { escapeHtml } from '../content/render.js';
import { TelegramPublisher } from '../publishers/telegram.js';
import type { RenderedPost } from '../publishers/publisher.js';
import { bot } from '../telegram/bot.js';

export interface ReviewHandlers {
  approve(postId: string, actor: string): Promise<string>;
  regenerate(postId: string, actor: string): Promise<string>;
  skip(postId: string, actor: string): Promise<string>;
}

const CB_PREFIX = 'rv';

function adminChatId(): string | null {
  return config.ADMIN_TELEGRAM_CHAT_ID?.trim() || null;
}

export function registerReviewCallbacks(handlers: ReviewHandlers): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}:(approve|regenerate|skip):([0-9a-f-]+)$`), async (ctx) => {
    const admin = adminChatId();
    if (!admin || String(ctx.from.id) !== admin && String(ctx.chat?.id) !== admin) {
      await ctx.answerCallbackQuery({ text: 'Нет доступа' });
      return;
    }
    const [, action, postId] = ctx.match as RegExpMatchArray;
    const actor = `tg:${ctx.from.username ?? ctx.from.id}`;
    try {
      await ctx.answerCallbackQuery({ text: 'Принято' });
      const result = await handlers[action as keyof ReviewHandlers](postId, actor);
      await ctx.editMessageText(`${ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : ''}\n\n${result}`.trim(), {
        reply_markup: undefined,
      }).catch(() => undefined);
    } catch (err) {
      logger.error({ err, action, postId }, 'review callback failed');
      await ctx.reply(`Ошибка: ${err instanceof Error ? err.message : String(err)}`).catch(() => undefined);
    }
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(`Ваш chat id: <code>${ctx.chat.id}</code>\nУкажите его в ADMIN_TELEGRAM_CHAT_ID, чтобы получать черновики на модерацию.`, {
      parse_mode: 'HTML',
    });
  });

  bot.catch((err) => logger.error({ err: err.error }, 'telegram bot error'));
}

export function startReviewBot(): void {
  // Long polling only handles admin callbacks and /start; publishing uses bot.api directly.
  bot
    .start({
      allowed_updates: ['callback_query', 'message'],
      onStart: (me) => logger.info({ username: me.username }, 'telegram review bot polling started'),
    })
    .catch((err) => logger.error({ err }, 'telegram polling stopped (check TELEGRAM_BOT_TOKEN and that only one instance is running)'));
}

export async function stopReviewBot(): Promise<void> {
  await bot.stop().catch(() => undefined);
}

/**
 * Sends the real rendered post to the admin chat followed by a control message
 * with Publish / Regenerate / Skip buttons. Returns the control message id.
 */
export async function sendReviewRequest(
  post: Post,
  campaign: Campaign,
  rendered: RenderedPost,
  meta: { truncated: boolean },
): Promise<string | null> {
  const admin = adminChatId();
  if (!admin) return null;

  const publisher = new TelegramPublisher(bot.api);
  await publisher.send(admin, rendered);

  const targets = [
    campaign.telegramChatId ? `Telegram ${escapeHtml(campaign.telegramChatId)}` : null,
    campaign.maxChatId ? `Max ${escapeHtml(campaign.maxChatId)}${config.maxEnabled ? '' : ' (отключён)'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const lines = [
    `📝 <b>${escapeHtml(campaign.name)}</b> · черновик готов`,
    `Модель: ${escapeHtml(post.model)} · картинка: ${post.mediaId ? 'есть' : 'нет'} · формат TG: ${post.telegramMode}`,
    `Каналы: ${targets || 'не указаны'}`,
    meta.truncated ? '⚠️ Текст был обрезан до лимита' : null,
    config.PUBLIC_BASE_URL ? `<a href="${config.PUBLIC_BASE_URL}/runs/${post.runId}">Открыть в админке</a>` : null,
  ].filter(Boolean);

  const kb = new InlineKeyboard()
    .text('✅ Опубликовать', `${CB_PREFIX}:approve:${post.id}`)
    .text('🔁 Перегенерировать', `${CB_PREFIX}:regenerate:${post.id}`)
    .row()
    .text('⛔ Пропустить', `${CB_PREFIX}:skip:${post.id}`);

  const msg = await bot.api.sendMessage(admin, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
  return String(msg.message_id);
}

/** Replaces the buttons on the control message with the final outcome. */
export async function finalizeReviewMessage(post: Post, outcome: string): Promise<void> {
  const admin = adminChatId();
  const fresh = getPost(post.id) ?? post;
  if (!admin || !fresh.reviewMessageId) return;
  try {
    await bot.api.editMessageReplyMarkup(admin, Number(fresh.reviewMessageId), { reply_markup: undefined });
    await bot.api.sendMessage(admin, `${outcome}\n<b>${escapeHtml(fresh.title)}</b>`, {
      parse_mode: 'HTML',
      reply_parameters: { message_id: Number(fresh.reviewMessageId) },
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    logger.debug({ err }, 'could not finalize review message');
  }
}
