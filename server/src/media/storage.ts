import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { createMedia } from '../db/repo.js';
import type { Media } from '../db/schema.js';
import type { ImageCandidate } from '../images/provider.js';

const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
const TARGET_WIDTH = 1600;

async function download(url: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'content-fabric/0.1' } });
    if (!res.ok) throw new Error(`Не удалось скачать картинку: HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_DOWNLOAD_BYTES) throw new Error('Картинка слишком большая');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Картинка слишком большая');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads (or takes pre-fetched bytes), normalises to JPEG within Telegram's
 * photo constraints, stores it on disk and records it in the DB.
 */
export async function storeImage(candidate: ImageCandidate, campaignId: string): Promise<Media> {
  const raw = candidate.bytes ?? (await download(candidate.downloadUrl));
  const image = sharp(raw, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error('Не удалось прочитать размеры картинки');

  const processed = await image
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = processed.info;
  // Telegram photo limits: width+height <= 10000, ratio <= 20.
  if (width + height > 10000 || Math.max(width, height) / Math.min(width, height) > 20) {
    throw new Error('Пропорции картинки не подходят для Telegram');
  }

  const id = crypto.randomUUID();
  const fileName = `${id}.jpg`;
  await fs.mkdir(config.mediaDir, { recursive: true });
  await fs.writeFile(path.join(config.mediaDir, fileName), processed.data);

  return createMedia({
    campaignId,
    provider: candidate.provider,
    providerId: candidate.providerId,
    sourceUrl: candidate.downloadUrl,
    hotlinkUrl: candidate.hotlinkUrl,
    pageUrl: candidate.pageUrl ?? null,
    author: candidate.author ?? null,
    authorUrl: candidate.authorUrl ?? null,
    width,
    height,
    mimeType: 'image/jpeg',
    bytes: processed.data.byteLength,
    fileName,
  });
}

export function mediaFilePath(m: Media): string {
  return path.join(config.mediaDir, m.fileName);
}

export async function readMediaBuffer(m: Media): Promise<Buffer> {
  return fs.readFile(mediaFilePath(m));
}

/** Public URL of the stored file, if the service is reachable from the internet. */
export function mediaPublicUrl(m: Media): string | null {
  return config.PUBLIC_BASE_URL ? `${config.PUBLIC_BASE_URL}/media/${m.fileName}` : null;
}

/** Best URL for a messenger link preview: own public URL first, provider CDN second. */
export function mediaPreviewUrl(m: Media): string | null {
  return mediaPublicUrl(m) ?? m.hotlinkUrl ?? null;
}
