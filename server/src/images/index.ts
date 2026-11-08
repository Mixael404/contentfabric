import { config } from '../config.js';
import { logger } from '../logger.js';
import type { ImageCandidate, ImageProvider } from './provider.js';
import { UnsplashProvider } from './unsplash.js';
import { PexelsProvider } from './pexels.js';
import { PixabayProvider } from './pixabay.js';

export type ImageProviderSetting = 'auto' | 'unsplash' | 'pexels' | 'pixabay' | 'none';

const registry = new Map<string, ImageProvider>();
if (config.UNSPLASH_ACCESS_KEY) registry.set('unsplash', new UnsplashProvider(config.UNSPLASH_ACCESS_KEY));
if (config.PEXELS_API_KEY) registry.set('pexels', new PexelsProvider(config.PEXELS_API_KEY));
if (config.PIXABAY_API_KEY) registry.set('pixabay', new PixabayProvider(config.PIXABAY_API_KEY));

export function configuredImageProviders(): string[] {
  return Array.from(registry.keys());
}

export function resolveImageProviders(setting: ImageProviderSetting): ImageProvider[] {
  if (setting === 'none') return [];
  if (setting === 'auto') return Array.from(registry.values());
  const p = registry.get(setting);
  if (!p) throw new Error(`Провайдер картинок "${setting}" не настроен (нет API-ключа в .env)`);
  return [p];
}

export interface PickOptions {
  exclude: Set<string>; // provider:providerId
  minWidth?: number;
}

function isAcceptable(c: ImageCandidate, opts: PickOptions): boolean {
  if (opts.exclude.has(`${c.provider}:${c.providerId}`)) return false;
  if (c.width < (opts.minWidth ?? 800)) return false;
  const ratio = c.width / c.height;
  return ratio >= 1.1 && ratio <= 2.4;
}

function queryVariants(query: string): string[] {
  const words = query
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const variants = [words.join(' ')];
  if (words.length > 3) variants.push(words.slice(0, 3).join(' '));
  if (words.length > 2) variants.push(words.slice(0, 2).join(' '));
  return Array.from(new Set(variants.filter(Boolean)));
}

/**
 * Tries each provider in order with progressively simpler queries and
 * returns the first acceptable candidate together with its provider.
 */
export async function findImage(
  providers: ImageProvider[],
  query: string,
  opts: PickOptions,
): Promise<{ candidate: ImageCandidate; provider: ImageProvider } | null> {
  for (const provider of providers) {
    for (const q of queryVariants(query)) {
      try {
        const candidates = await provider.search(q, { perPage: 12 });
        const pick = candidates.find((c) => isAcceptable(c, opts));
        if (pick) return { candidate: pick, provider };
        logger.debug({ provider: provider.name, q, n: candidates.length }, 'no acceptable image candidates');
      } catch (err) {
        logger.warn({ err, provider: provider.name, q }, 'image search failed');
      }
    }
  }
  return null;
}

export type { ImageCandidate, ImageProvider };
