import type { ImageCandidate, ImageProvider } from './provider.js';
import { fetchJson } from './provider.js';

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: { original: string; large2x: string; large: string };
}

export class PexelsProvider implements ImageProvider {
  readonly name = 'pexels';
  constructor(private readonly apiKey: string) {}

  async search(query: string, opts: { perPage?: number; signal?: AbortSignal } = {}): Promise<ImageCandidate[]> {
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('per_page', String(opts.perPage ?? 10));
    const data = await fetchJson<{ photos: PexelsPhoto[] }>(url.toString(), {
      headers: { Authorization: this.apiKey },
      signal: opts.signal,
    });
    return data.photos.map((p) => ({
      provider: this.name,
      providerId: String(p.id),
      downloadUrl: p.src.large2x,
      hotlinkUrl: p.src.large2x,
      width: p.width,
      height: p.height,
      author: p.photographer,
      authorUrl: p.photographer_url,
      pageUrl: p.url,
      description: p.alt || undefined,
    }));
  }
}
