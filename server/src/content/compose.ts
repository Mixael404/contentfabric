import { parseBlocks, parseInline, stripBlockLinks, stripLinks, type Block } from './ir.js';
import { escapeHtml, renderBlocks, renderInline, visibleLength, type Target } from './render.js';

export interface Source {
  title: string;
  url: string;
}

export interface ImageCredit {
  label: string;
  url: string;
}

export interface PostParts {
  title: string;
  bodyMarkdown: string;
  sources: Source[];
  hashtags: string[];
  /** Attribution for pictures taken from a source article */
  imageCredit?: ImageCredit | null;
}

export const TELEGRAM_CAPTION_LIMIT = 1024;
export const TELEGRAM_TEXT_LIMIT = 4096;
export const MAX_TEXT_LIMIT = 4000;

export type TelegramMode = 'photo_caption' | 'text_preview' | 'text_only';

export interface ComposeOptions {
  /**
   * Render the sources footer, the photo credit and inline links.
   * When false the post goes out without a single link: the footer is
   * dropped and markdown links are reduced to their text.
   */
  showSources: boolean;
}

export interface ComposedPost {
  telegramHtml: string;
  maxHtml: string;
  plainText: string;
  telegramMode: TelegramMode;
  truncated: boolean;
}

export function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const cleaned = raw.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!cleaned) continue;
    const tag = `#${cleaned}`;
    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out.slice(0, 6);
}

function shortSourceTitle(s: Source): string {
  const t = s.title?.trim();
  if (t && t.length <= 48) return t;
  if (t) return `${t.slice(0, 45).trimEnd()}…`;
  try {
    return new URL(s.url).hostname.replace(/^www\./, '');
  } catch {
    return s.url;
  }
}

function renderSources(sources: Source[], target: Target): string {
  if (sources.length === 0) return '';
  const items = sources.slice(0, 5).map((s) => {
    const label = shortSourceTitle(s);
    if (target === 'plain') return label;
    return `<a href="${escapeHtml(s.url)}">${escapeHtml(label)}</a>`;
  });
  const prefix = target === 'plain' ? 'Источники: ' : '📎 <i>Источники:</i> ';
  return prefix + items.join(' · ');
}

function renderCredit(credit: ImageCredit | null | undefined, target: Target): string {
  if (!credit) return '';
  if (target === 'plain') return `Фото: ${credit.label}`;
  return `📷 <i>Фото:</i> <a href="${escapeHtml(credit.url)}">${escapeHtml(credit.label)}</a>`;
}

function renderTitle(title: string, target: Target, opts: ComposeOptions): string {
  let inline = parseInline(title.trim());
  if (!opts.showSources) inline = stripLinks(inline);
  if (target === 'plain') return renderInline(inline, 'plain');
  return `<b>${renderInline(inline, target)}</b>`;
}

function assemble(parts: PostParts, blocks: Block[], target: Target, opts: ComposeOptions): string {
  const footer = opts.showSources
    ? [renderSources(parts.sources, target), renderCredit(parts.imageCredit, target)].filter(Boolean).join('\n')
    : '';
  const sections = [
    renderTitle(parts.title, target, opts),
    renderBlocks(blocks, target),
    footer,
    parts.hashtags.length ? (target === 'plain' ? parts.hashtags.join(' ') : escapeHtml(parts.hashtags.join(' '))) : '',
  ].filter((s) => s.trim().length > 0);
  return sections.join('\n\n');
}

/**
 * Builds the final markup for every target, trimming trailing body blocks
 * only if the hard messenger limits would otherwise be exceeded.
 */
export function composePost(parts: PostParts, hasImage: boolean, opts: ComposeOptions): ComposedPost {
  const normalized: PostParts = { ...parts, hashtags: normalizeHashtags(parts.hashtags) };
  let blocks = parseBlocks(parts.bodyMarkdown);
  if (!opts.showSources) blocks = stripBlockLinks(blocks);
  let truncated = false;

  const build = () => ({
    telegramHtml: assemble(normalized, blocks, 'telegram', opts),
    maxHtml: assemble(normalized, blocks, 'max', opts),
    plainText: assemble(normalized, blocks, 'plain', opts),
  });

  let built = build();
  // Hard limits: Telegram text 4096 (minus 1 for the invisible preview link), Max 4000.
  while (
    blocks.length > 1 &&
    (visibleLength(built.telegramHtml) > TELEGRAM_TEXT_LIMIT - 1 || visibleLength(built.maxHtml) > MAX_TEXT_LIMIT)
  ) {
    blocks = blocks.slice(0, -1);
    truncated = true;
    built = build();
  }

  const tgLen = visibleLength(built.telegramHtml);
  let telegramMode: TelegramMode = 'text_only';
  if (hasImage) telegramMode = tgLen <= TELEGRAM_CAPTION_LIMIT ? 'photo_caption' : 'text_preview';

  return { ...built, telegramMode, truncated };
}

export function bodyPlainLength(bodyMarkdown: string): number {
  return renderBlocks(parseBlocks(bodyMarkdown), 'plain').length;
}
