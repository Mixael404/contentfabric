export interface ImageCandidate {
  provider: string;
  providerId: string;
  /** Full-size URL to download */
  downloadUrl: string;
  /** CDN URL (~1080-1600px) suitable for messenger link previews, if the provider allows hotlinking */
  hotlinkUrl: string | null;
  width: number;
  height: number;
  author?: string;
  authorUrl?: string;
  pageUrl?: string;
  description?: string;
  /** Pre-fetched bytes (used by generating providers in the future) */
  bytes?: Buffer;
  /** Provider-specific URL to hit when the image is actually used (e.g. Unsplash download tracking) */
  trackingUrl?: string;
}

export interface ImageProvider {
  readonly name: string;
  search(query: string, opts?: { perPage?: number; signal?: AbortSignal }): Promise<ImageCandidate[]>;
  /** Hook called when a candidate was actually used (e.g. Unsplash download tracking). */
  onUse?(candidate: ImageCandidate): Promise<void>;
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { ...init, signal: init.signal ?? ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
