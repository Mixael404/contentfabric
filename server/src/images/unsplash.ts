import type { ImageCandidate, ImageProvider } from './provider.js';
import { fetchJson } from './provider.js';

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string; full: string; regular: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

export class UnsplashProvider implements ImageProvider {
  readonly name = 'unsplash';
  constructor(private readonly accessKey: string) {}

  async search(query: string, opts: { perPage?: number; signal?: AbortSignal } = {}): Promise<ImageCandidate[]> {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');
    url.searchParams.set('per_page', String(opts.perPage ?? 10));
    const data = await fetchJson<{ results: UnsplashPhoto[] }>(url.toString(), {
      headers: { Authorization: `Client-ID ${this.accessKey}`, 'Accept-Version': 'v1' },
      signal: opts.signal,
    });
    return data.results.map((p) => ({
      provider: this.name,
      providerId: p.id,
      downloadUrl: `${p.urls.raw}&w=1600&q=85&fm=jpg&fit=max`,
      hotlinkUrl: `${p.urls.raw}&w=1600&q=85&fm=jpg&fit=max`,
      width: p.width,
      height: p.height,
      author: p.user.name,
      authorUrl: p.user.links.html,
      pageUrl: p.links.html,
      description: p.description ?? p.alt_description ?? undefined,
      trackingUrl: p.links.download_location,
    }));
  }

  async onUse(candidate: ImageCandidate): Promise<void> {
    if (!candidate.trackingUrl) return;
    // Unsplash API guidelines require triggering the download endpoint when a photo is used.
    await fetch(candidate.trackingUrl, { headers: { Authorization: `Client-ID ${this.accessKey}` } }).catch(() => undefined);
  }
}
