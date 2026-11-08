import type { TelegramMode } from '../content/compose.js';

export type Channel = 'telegram' | 'max';

export interface RenderedImage {
  buffer: Buffer;
  /** Publicly reachable URL for link previews (own media URL or provider CDN), if any */
  previewUrl: string | null;
  fileName: string;
}

export interface RenderedPost {
  telegramHtml: string;
  maxHtml: string;
  plainText: string;
  telegramMode: TelegramMode;
  image: RenderedImage | null;
}

export interface PublishResult {
  messageId: string;
}

export interface Publisher {
  readonly channel: Channel;
  send(target: string, post: RenderedPost): Promise<PublishResult>;
}
