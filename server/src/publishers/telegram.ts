import { GrammyError, InputFile, type Api } from 'grammy';
import { sleep } from '../telegram/bot.js';
import type { Publisher, PublishResult, RenderedPost } from './publisher.js';

export function normalizeTelegramTarget(target: string): number | string {
  const t = target.trim();
  if (/^-?\d+$/.test(t)) return Number(t);
  return t.startsWith('@') ? t : `@${t}`;
}

async function withTelegramRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof GrammyError && err.error_code === 429) {
        const wait = (err.parameters.retry_after ?? 5) * 1000;
        await sleep(Math.min(wait, 60_000));
        continue;
      }
      if (err instanceof GrammyError && err.error_code >= 500) {
        await sleep(2000 * (i + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export class TelegramPublisher implements Publisher {
  readonly channel = 'telegram' as const;
  constructor(private readonly api: Api) {}

  async send(target: string, post: RenderedPost): Promise<PublishResult> {
    const chatId = normalizeTelegramTarget(target);

    if (post.image && post.telegramMode === 'photo_caption') {
      const img = post.image;
      const msg = await withTelegramRetry(() =>
        this.api.sendPhoto(chatId, new InputFile(img.buffer, img.fileName), {
          caption: post.telegramHtml,
          parse_mode: 'HTML',
        }),
      );
      return { messageId: String(msg.message_id) };
    }

    if (post.image && post.telegramMode === 'text_preview' && post.image.previewUrl) {
      const url = post.image.previewUrl;
      // Invisible link at the very start + explicit preview URL: Telegram shows the
      // picture above the text, which lets a post carry up to 4096 characters with an image.
      const text = `<a href="${url}">&#8203;</a>${post.telegramHtml}`;
      const msg = await withTelegramRetry(() =>
        this.api.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          link_preview_options: { url, prefer_large_media: true, show_above_text: true },
        }),
      );
      return { messageId: String(msg.message_id) };
    }

    const msg = await withTelegramRetry(() =>
      this.api.sendMessage(chatId, post.telegramHtml, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    );
    return { messageId: String(msg.message_id) };
  }
}
