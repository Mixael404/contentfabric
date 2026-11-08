import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Single bot instance shared by the publisher and the review flow. */
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

let botUsername: string | null = null;

export async function initBot(): Promise<string | null> {
  try {
    await bot.init();
    botUsername = bot.botInfo.username;
    logger.info({ username: botUsername }, 'telegram bot initialised');
  } catch (err) {
    logger.error({ err }, 'failed to initialise telegram bot (check TELEGRAM_BOT_TOKEN)');
  }
  return botUsername;
}

export function getBotUsername(): string | null {
  return botUsername;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
