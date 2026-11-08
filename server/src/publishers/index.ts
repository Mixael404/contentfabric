import { config } from '../config.js';
import { bot } from '../telegram/bot.js';
import { MaxPublisher } from './max.js';
import type { Channel, Publisher } from './publisher.js';
import { TelegramPublisher } from './telegram.js';

const publishers = new Map<Channel, Publisher>();
publishers.set('telegram', new TelegramPublisher(bot.api));
if (config.maxEnabled && config.MAX_BOT_TOKEN) {
  publishers.set('max', new MaxPublisher(config.MAX_BOT_TOKEN, config.MAX_API_BASE_URL, config.MAX_INSECURE_TLS));
}

export function getPublisher(channel: Channel): Publisher | undefined {
  return publishers.get(channel);
}

export function publisherStatus() {
  return {
    telegram: { configured: true },
    max: { configured: config.maxEnabled, insecureTls: config.MAX_INSECURE_TLS },
  };
}

export { TelegramPublisher } from './telegram.js';
export { MaxPublisher } from './max.js';
export type { Publisher, RenderedPost, Channel } from './publisher.js';
