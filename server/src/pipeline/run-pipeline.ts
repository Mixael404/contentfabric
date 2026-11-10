import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  appendRunLog,
  createPost,
  createPublication,
  getCampaign,
  getPost,
  getRun,
  recentMediaProviderIds,
  updatePost,
  updatePublication,
  updateRun,
} from '../db/repo.js';
import type { Campaign, Media, Post, Run } from '../db/schema.js';
import { bodyPlainLength, composePost, type ImageCredit, type Source } from '../content/compose.js';
import { generateDraft, shortenDraft, type EffortSetting } from '../llm/openai.js';
import type { Draft } from '../llm/schema.js';
import { findImage, resolveImageProviders, type ImageProviderSetting } from '../images/index.js';
import { findArticleImage } from '../images/article.js';
import { storeImage } from '../media/storage.js';
import { getPublisher } from '../publishers/index.js';
import type { Channel } from '../publishers/publisher.js';
import { nowIso } from '../utils/ids.js';
import { buildInput, buildInstructions } from './context.js';
import { buildRenderedPost } from './render-post.js';
import { finalizeReviewMessage, sendReviewRequest } from '../review/telegram-review.js';

class RunLogger {
  constructor(
    private readonly runId: string,
    private readonly campaignName: string,
  ) {}
  info(msg: string, data?: unknown) {
    appendRunLog(this.runId, { level: 'info', msg, data });
    logger.info({ runId: this.runId, campaign: this.campaignName, data }, msg);
  }
  warn(msg: string, data?: unknown) {
    appendRunLog(this.runId, { level: 'warn', msg, data });
    logger.warn({ runId: this.runId, campaign: this.campaignName, data }, msg);
  }
  error(msg: string, data?: unknown) {
    appendRunLog(this.runId, { level: 'error', msg, data });
    logger.error({ runId: this.runId, campaign: this.campaignName, data }, msg);
  }
}

function setStage(runId: string, stage: string) {
  updateRun(runId, { stage });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number, log: RunLogger, label: string): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts) log.warn(`${label}: попытка ${i} не удалась, повтор`, { error: errorMessage(err) });
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}

async function urlAlive(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (res.status === 405 || res.status === 403) return true; // HEAD not allowed, assume alive
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function mergeSources(draft: Draft, citations: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of [...draft.sources, ...citations]) {
    let url: string;
    try {
      url = new URL(s.url.trim()).toString();
    } catch {
      continue;
    }
    const key = url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: s.title?.trim() || '', url });
  }
  return out.slice(0, 5);
}

type ImageSourceMode = 'model' | 'stock' | 'article';

/**
 * Chooses the picture for a post.
 *  - article: lead image (og:image) of the source article, with attribution;
 *  - stock: Unsplash/Pexels/Pixabay by the model's image_query.
 * The model decides per post in 'model' mode; stock is always the fallback.
 */
async function pickImage(
  campaign: Campaign,
  draft: Draft,
  sources: Source[],
  log: RunLogger,
): Promise<{ media: Media; credit: ImageCredit | null } | null> {
  if (campaign.imageProvider === 'none') {
    log.info('Картинка отключена для кампании');
    return null;
  }
  const exclude = recentMediaProviderIds(campaign.id);
  const mode = campaign.imageSourceMode as ImageSourceMode;
  const wantsArticle = mode === 'article' || (mode === 'model' && draft.image_strategy === 'source');

  if (wantsArticle) {
    const urls = [draft.image_source_url, ...sources.map((s) => s.url)].filter((u): u is string => Boolean(u));
    log.info('Модель выбрала фото из источника', { strategy: draft.image_strategy, url: draft.image_source_url ?? sources[0]?.url ?? null });
    try {
      const candidate = await findArticleImage(urls, { exclude });
      if (candidate) {
        const media = await storeImage(candidate, campaign.id);
        log.info('Картинка взята из источника', { page: media.pageUrl, size: `${media.width}x${media.height}` });
        return { media, credit: { label: media.author ?? 'источник', url: media.pageUrl ?? urls[0] } };
      }
      log.warn('У источников не нашлось подходящего фото, беру сток');
    } catch (err) {
      log.warn('Не удалось взять фото из источника, беру сток', { error: errorMessage(err) });
    }
  } else if (mode === 'model') {
    log.info('Модель выбрала стоковое фото', { query: draft.image_query });
  }

  const providers = resolveImageProviders(campaign.imageProvider as ImageProviderSetting);
  if (providers.length === 0) {
    log.info('Нет настроенных провайдеров стоковых картинок');
    if (campaign.imageRequired) throw new Error('Картинка обязательна, но взять её неоткуда');
    return null;
  }
  try {
    const found = await findImage(providers, draft.image_query, { exclude });
    if (!found) throw new Error(`Не найдено подходящих картинок по запросу "${draft.image_query}"`);
    const media = await storeImage(found.candidate, campaign.id);
    await found.provider.onUse?.(found.candidate);
    log.info('Картинка подобрана на стоке', { provider: media.provider, author: media.author, page: media.pageUrl, size: `${media.width}x${media.height}` });
    return { media, credit: null };
  } catch (err) {
    if (campaign.imageRequired) throw err;
    log.warn('Картинка не найдена, пост выйдет без неё', { error: errorMessage(err) });
    return null;
  }
}

/** Generation part of the pipeline: context -> draft -> validate -> image -> render -> review|publish. */
export async function executeRun(runId: string): Promise<void> {
  const run = getRun(runId);
  if (!run || run.status !== 'pending') return;
  const campaign = getCampaign(run.campaignId);
  if (!campaign) {
    updateRun(runId, { status: 'failed', error: 'Кампания не найдена', finishedAt: nowIso() });
    return;
  }
  const log = new RunLogger(runId, campaign.name);
  updateRun(runId, { status: 'running', startedAt: nowIso(), stage: 'context' });
  log.info('Запуск начат', { trigger: run.trigger, model: campaign.model });
  let createdPostId: string | null = null;

  try {
    const instructions = buildInstructions(campaign);
    const input = buildInput(campaign);

    setStage(runId, 'generate');
    const gen = await withRetry(
      () =>
        generateDraft({
          model: campaign.model,
          reasoningEffort: campaign.reasoningEffort as EffortSetting,
          webSearch: campaign.webSearch,
          searchContextSize: campaign.searchContextSize as 'low' | 'medium' | 'high',
          instructions,
          input,
        }),
      2,
      log,
      'Генерация',
    );
    let draft = gen.draft;
    log.info('Черновик получен', { title: draft.title, searchCalls: gen.searchCalls, usage: gen.usage });

    setStage(runId, 'validate');
    const bodyLen = bodyPlainLength(draft.body);
    if (bodyLen > campaign.maxBodyLength * 1.15) {
      log.warn(`Текст длиннее лимита (${bodyLen} > ${campaign.maxBodyLength}), сокращаю`);
      try {
        draft = await shortenDraft(campaign.model, draft, campaign.maxBodyLength);
        log.info('Текст сокращён', { newLength: bodyPlainLength(draft.body) });
      } catch (err) {
        log.warn('Сократить не удалось, лишние абзацы будут отрезаны при рендере', { error: errorMessage(err) });
      }
    }
    const merged = mergeSources(draft, gen.citations);
    const sources: Source[] = [];
    for (const s of merged) {
      if (await urlAlive(s.url)) sources.push(s);
      else log.warn('Источник недоступен, исключён', { url: s.url });
    }

    setStage(runId, 'image');
    const picked = await pickImage(campaign, draft, sources, log);
    const mediaId = picked?.media.id ?? null;
    const imageCredit = picked?.credit ?? null;

    setStage(runId, 'render');
    const composed = composePost(
      { title: draft.title, bodyMarkdown: draft.body, sources, hashtags: draft.hashtags, imageCredit },
      Boolean(mediaId),
      { showSources: campaign.showSources },
    );
    if (composed.truncated) log.warn('Пост обрезан до лимита мессенджера');

    const needsReview = campaign.mode === 'review' || run.forceReview;
    const post = createPost({
      runId,
      campaignId: campaign.id,
      title: draft.title,
      bodyMarkdown: draft.body,
      imageQuery: draft.image_query,
      imageAlt: draft.image_alt,
      sources: JSON.stringify(sources),
      hashtags: JSON.stringify(draft.hashtags),
      draftJson: JSON.stringify(draft),
      model: campaign.model,
      usage: JSON.stringify(gen.usage ?? null),
      mediaId,
      telegramHtml: composed.telegramHtml,
      telegramMode: composed.telegramMode,
      maxHtml: composed.maxHtml,
      plainText: composed.plainText,
      status: needsReview ? 'awaiting_review' : 'approved',
    });
    createdPostId = post.id;
    updateRun(runId, { postId: post.id });
    log.info('Пост собран', { telegramMode: composed.telegramMode, chars: composed.plainText.length });

    if (needsReview) {
      setStage(runId, 'review');
      updateRun(runId, { status: 'awaiting_review' });
      if (config.reviewViaTelegram) {
        try {
          const rendered = await buildRenderedPost(post);
          const msgId = await sendReviewRequest(post, campaign, rendered, { truncated: composed.truncated });
          if (msgId) updatePost(post.id, { reviewMessageId: msgId });
          log.info('Черновик отправлен на модерацию в Telegram');
        } catch (err) {
          log.warn('Не удалось отправить черновик админу в Telegram, модерация доступна в веб-интерфейсе', {
            error: errorMessage(err),
          });
        }
      } else {
        log.info('Ожидает модерации в веб-интерфейсе (ADMIN_TELEGRAM_CHAT_ID не задан)');
      }
      return;
    }

    await publishPost(post.id, { actor: 'auto' });
  } catch (err) {
    const message = errorMessage(err);
    log.error('Запуск завершился ошибкой', { error: message });
    updateRun(runId, { status: 'failed', error: message, finishedAt: nowIso() });
    if (createdPostId) updatePost(createdPostId, { status: 'failed' });
  }
}

interface Target {
  channel: Channel;
  target: string;
}

function resolveTargets(campaign: Campaign, log: RunLogger): Target[] {
  const targets: Target[] = [];
  if (campaign.telegramChatId?.trim()) targets.push({ channel: 'telegram', target: campaign.telegramChatId.trim() });
  if (campaign.maxChatId?.trim()) {
    if (config.maxEnabled) targets.push({ channel: 'max', target: campaign.maxChatId.trim() });
    else log.info('Max пропущен: MAX_BOT_TOKEN не задан');
  }
  return targets;
}

/** Publishing part of the pipeline; used directly (auto mode) or after approval. */
export async function publishPost(postId: string, opts: { actor: string }): Promise<void> {
  const post = getPost(postId);
  if (!post) throw new Error('Пост не найден');
  const run = getRun(post.runId);
  const campaign = getCampaign(post.campaignId);
  if (!run || !campaign) throw new Error('Запуск или кампания не найдены');
  if (post.status === 'published') return;
  const log = new RunLogger(run.id, campaign.name);

  updateRun(run.id, { status: 'publishing', stage: 'publish' });
  updatePost(post.id, { status: 'approved' });
  log.info('Публикация начата', { actor: opts.actor });

  const targets = resolveTargets(campaign, log);
  if (targets.length === 0) {
    const msg = 'Нет каналов для публикации (укажите Telegram и/или Max канал в кампании)';
    log.error(msg);
    updateRun(run.id, { status: 'failed', error: msg, finishedAt: nowIso() });
    updatePost(post.id, { status: 'failed' });
    return;
  }

  const rendered = await buildRenderedPost(post);
  const results: { channel: Channel; ok: boolean; error?: string }[] = [];

  await Promise.all(
    targets.map(async (t) => {
      const pub = createPublication({
        postId: post.id,
        runId: run.id,
        campaignId: campaign.id,
        channel: t.channel,
        target: t.target,
        status: 'pending',
        externalMessageId: null,
        error: null,
        sentAt: null,
      });
      const publisher = getPublisher(t.channel);
      if (!publisher) {
        updatePublication(pub.id, { status: 'failed', error: 'Публикатор не настроен' });
        results.push({ channel: t.channel, ok: false, error: 'Публикатор не настроен' });
        return;
      }
      try {
        const res = await publisher.send(t.target, rendered);
        updatePublication(pub.id, { status: 'sent', externalMessageId: res.messageId, sentAt: nowIso() });
        results.push({ channel: t.channel, ok: true });
        log.info(`Опубликовано в ${t.channel}`, { target: t.target, messageId: res.messageId });
      } catch (err) {
        const message = errorMessage(err);
        updatePublication(pub.id, { status: 'failed', error: message });
        results.push({ channel: t.channel, ok: false, error: message });
        log.error(`Ошибка публикации в ${t.channel}`, { target: t.target, error: message });
      }
    }),
  );

  const okCount = results.filter((r) => r.ok).length;
  const summary = results.map((r) => `${r.channel}: ${r.ok ? 'ок' : `ошибка (${r.error})`}`).join('; ');
  if (okCount === 0) {
    updateRun(run.id, { status: 'failed', error: `Публикация не удалась. ${summary}`, finishedAt: nowIso() });
    updatePost(post.id, { status: 'failed' });
    await finalizeReviewMessage(post, `❌ Публикация не удалась\n${summary}`).catch(() => undefined);
    return;
  }
  updateRun(run.id, {
    status: 'published',
    error: okCount < results.length ? `Частично: ${summary}` : null,
    finishedAt: nowIso(),
  });
  updatePost(post.id, { status: 'published' });
  await finalizeReviewMessage(post, okCount < results.length ? `⚠️ Опубликовано частично\n${summary}` : `✅ Опубликовано\n${summary}`).catch(
    () => undefined,
  );
}

export type { Run, Post };
