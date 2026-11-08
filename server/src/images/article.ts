import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '../logger.js';
import type { ImageCandidate } from './provider.js';

/**
 * Extracts the lead image of a news article (Open Graph / Twitter card meta tags)
 * and returns it as an ImageCandidate with the bytes already downloaded.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MIN_WIDTH = 600;
const MIN_HEIGHT = 315;
const SKIP_URL_RE = /(logo|placeholder|default[-_]?(og|share|image)|(^|[/_-])share[-_.]|social[-_]default|avatar|favicon|sprite|icon[-_.]|blank\.|pixel\.|1x1)/i;
/** Real photos compress to far more bytes per pixel than a logo on a flat background. */
const MIN_BYTES_PER_PIXEL = 0.02;
const META_TAG_RE = /<(meta|link)\b[^>]*>/gi;
const ATTR_RE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const IMAGE_META_KEYS = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchLimited(url: string, accept: string, maxBytes: number, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: accept, 'Accept-Language': 'ru,en;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (!res.body) throw new Error('empty body');
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
    return { buf: Buffer.concat(chunks), contentType, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/** Returns candidate image URLs from a page, most authoritative first. */
export function extractPageImages(html: string, baseUrl: string): string[] {
  const head = html.slice(0, 400_000);
  const found = new Map<string, number>(); // url -> priority
  for (const tag of head.match(META_TAG_RE) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
    let raw: string | undefined;
    let priority = 99;
    if (tag.toLowerCase().startsWith('<meta')) {
      const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
      const idx = IMAGE_META_KEYS.indexOf(key);
      if (idx === -1 || !attrs.content) continue;
      raw = attrs.content;
      priority = idx;
    } else if ((attrs.rel ?? '').toLowerCase() === 'image_src' && attrs.href) {
      raw = attrs.href;
      priority = 50;
    }
    if (!raw) continue;
    try {
      const abs = new URL(raw.trim(), baseUrl).toString();
      if (!/^https?:/.test(abs)) continue;
      if (!found.has(abs) || found.get(abs)! > priority) found.set(abs, priority);
    } catch {
      /* ignore malformed url */
    }
  }
  return Array.from(found.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([u]) => u);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function tryImage(imageUrl: string, pageUrl: string): Promise<ImageCandidate | null> {
  const { buf, contentType } = await fetchLimited(imageUrl, 'image/avif,image/webp,image/*,*/*;q=0.8', MAX_IMAGE_BYTES, 20_000);
  if (buf.byteLength === 0) return null;
  if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) return null;
  const meta = await sharp(buf, { failOn: 'none' }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
  const ratio = width / height;
  if (ratio < 0.9 || ratio > 2.6) return null;
  if (buf.byteLength / (width * height) < MIN_BYTES_PER_PIXEL) {
    logger.debug({ imageUrl, width, height, bytes: buf.byteLength }, 'article image looks like a flat graphic, skipped');
    return null;
  }
  return {
    provider: 'article',
    providerId: createHash('sha1').update(imageUrl).digest('hex').slice(0, 16),
    downloadUrl: imageUrl,
    hotlinkUrl: imageUrl,
    width,
    height,
    author: hostOf(pageUrl),
    authorUrl: pageUrl,
    pageUrl,
    description: undefined,
    bytes: buf,
  };
}

export interface ArticleImageOptions {
  exclude: Set<string>;
  maxPages?: number;
}

/**
 * Walks the given article URLs in order and returns the first lead image that
 * passes the size/ratio checks, or null when none of the pages yields one.
 */
export async function findArticleImage(pageUrls: string[], opts: ArticleImageOptions): Promise<ImageCandidate | null> {
  const seen = new Set<string>();
  const pages = pageUrls.filter((u) => {
    if (!/^https?:\/\//i.test(u) || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  for (const pageUrl of pages.slice(0, opts.maxPages ?? 4)) {
    let images: string[];
    try {
      const { buf, contentType, finalUrl } = await fetchLimited(pageUrl, 'text/html,application/xhtml+xml', MAX_HTML_BYTES, 15_000);
      if (!/html|xml/i.test(contentType)) continue;
      images = extractPageImages(buf.toString('utf8'), finalUrl);
    } catch (err) {
      logger.debug({ err, pageUrl }, 'article page fetch failed');
      continue;
    }
    for (const imageUrl of images.slice(0, 3)) {
      if (SKIP_URL_RE.test(imageUrl)) continue;
      try {
        const candidate = await tryImage(imageUrl, pageUrl);
        if (!candidate) continue;
        if (opts.exclude.has(`${candidate.provider}:${candidate.providerId}`)) continue;
        return candidate;
      } catch (err) {
        logger.debug({ err, imageUrl }, 'article image fetch failed');
      }
    }
  }
  return null;
}
