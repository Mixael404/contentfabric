import type { ImageCandidate, ImageProvider } from './provider.js';
import { fetchJson } from './provider.js';

interface PixabayHit {
  id: number;
  pageURL: string;
  tags: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
}

export class PixabayProvider implements ImageProvider {
  readonly name = 'pixabay';
  constructor(private readonly apiKey: string) {}

  async search(query: string, opts: { perPage?: number; signal?: AbortSignal } = {}): Promise<ImageCandidate[]> {
    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('q', query);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'horizontal');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('min_width', '1000');
    url.searchParams.set('per_page', String(Math.max(3, opts.perPage ?? 10)));
    const data = await fetchJson<{ hits: PixabayHit[] }>(url.toString(), { signal: opts.signal });
    return data.hits.map((h) => ({
      provider: this.name,
      providerId: String(h.id),
      downloadUrl: h.largeImageURL,
      // Pixabay asks not to hotlink; previews should go through our own media URL.
      hotlinkUrl: null,
      width: h.imageWidth,
      height: h.imageHeight,
      author: h.user,
      authorUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`,
      pageUrl: h.pageURL,
      description: h.tags,
    }));
  }
}
