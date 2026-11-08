import { Agent, FormData, fetch as undiciFetch } from 'undici';
import { logger } from '../logger.js';
import { sleep } from '../telegram/bot.js';
import type { Publisher, PublishResult, RenderedPost } from './publisher.js';

interface MaxUploadUrl {
  url: string;
}
interface MaxImageUpload {
  photos?: Record<string, { token: string }>;
}
interface MaxMessageResponse {
  message?: { body?: { mid?: string } };
}
interface MaxError {
  code?: string;
  message?: string;
}

/**
 * Max (VK) Bot API publisher. Flow: POST /uploads?type=image -> upload bytes as
 * multipart field "data" -> token -> POST /messages with image attachment.
 */
export class MaxPublisher implements Publisher {
  readonly channel = 'max' as const;
  private readonly dispatcher: Agent | undefined;

  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    insecureTls = false,
  ) {
    // The Max API uses a certificate from the Russian national CA; either mount it via
    // NODE_EXTRA_CA_CERTS or (dev only) disable verification for this client.
    this.dispatcher = insecureTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  }

  private async request<T>(path: string, init: { method?: string; body?: string | FormData; headers?: Record<string, string> } = {}): Promise<T> {
    const res = await undiciFetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: this.token, Accept: 'application/json', ...(init.headers ?? {}) },
      body: init.body as never,
      dispatcher: this.dispatcher,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json ?? {}) as MaxError;
      const e = new Error(`Max API ${res.status} ${path}: ${err.code ?? ''} ${err.message ?? text.slice(0, 200)}`) as Error & { code?: string; status?: number };
      e.code = err.code;
      e.status = res.status;
      throw e;
    }
    return json as T;
  }

  async uploadImage(buffer: Buffer, fileName: string): Promise<string> {
    const { url } = await this.request<MaxUploadUrl>('/uploads?type=image', { method: 'POST' });
    const form = new FormData();
    form.append('data', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), fileName);
    const res = await undiciFetch(url, {
      method: 'POST',
      headers: { Authorization: this.token },
      body: form,
      dispatcher: this.dispatcher,
    });
    if (!res.ok) throw new Error(`Max upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as MaxImageUpload;
    const first = data.photos ? Object.values(data.photos)[0] : undefined;
    if (!first?.token) throw new Error('Max upload: в ответе нет токена картинки');
    return first.token;
  }

  async send(target: string, post: RenderedPost): Promise<PublishResult> {
    const chatId = target.trim();
    const attachments: unknown[] = [];
    if (post.image) {
      const token = await this.uploadImage(post.image.buffer, post.image.fileName);
      attachments.push({ type: 'image', payload: { token } });
    }
    const body = JSON.stringify({
      text: post.maxHtml,
      format: 'html',
      ...(attachments.length ? { attachments } : {}),
    });

    // Freshly uploaded attachments may still be processing: retry with backoff.
    const delays = [1500, 3000, 5000, 8000, 12000];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.request<MaxMessageResponse>(`/messages?chat_id=${encodeURIComponent(chatId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        return { messageId: res.message?.body?.mid ?? 'unknown' };
      } catch (err) {
        const e = err as Error & { code?: string; status?: number };
        const retryable = e.code === 'attachment.not.ready' || e.status === 429 || (e.status ?? 0) >= 500;
        if (!retryable || attempt >= delays.length) throw err;
        logger.debug({ attempt, code: e.code }, 'max send retry');
        await sleep(delays[attempt]);
      }
    }
  }
}
