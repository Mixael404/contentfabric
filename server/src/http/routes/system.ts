import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { countRunsByStatus, listMaxChats } from '../../db/repo.js';
import { maxPollerStatus } from '../../max/poller.js';
import { configuredImageProviders } from '../../images/index.js';
import { listModels } from '../../llm/openai.js';
import { publisherStatus } from '../../publishers/index.js';
import { queueStats } from '../../scheduler/queue.js';
import { schedulerStatus } from '../../scheduler/scheduler.js';
import { getBotUsername } from '../../telegram/bot.js';
import { DEFAULT_STYLE_GUIDE, getStyleGuide, saveStyleGuide } from '../../content/style-guide.js';
import { StyleGuideInput, formatZodError } from '../schemas.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async () => ({
    version: '0.1.0',
    telegram: { ...publisherStatus().telegram, botUsername: getBotUsername() },
    max: { ...publisherStatus().max, ...maxPollerStatus(), knownChats: listMaxChats().filter((c) => c.status === 'active').length },
    review: { viaTelegram: config.reviewViaTelegram, adminChatId: config.ADMIN_TELEGRAM_CHAT_ID ?? null },
    imageProviders: configuredImageProviders(),
    publicBaseUrl: config.PUBLIC_BASE_URL ?? null,
    defaultModel: config.DEFAULT_MODEL,
    scheduler: schedulerStatus(),
    queue: queueStats(),
    runs: countRunsByStatus(),
  }));

  app.get('/models', async () => ({ models: await listModels(), defaultModel: config.DEFAULT_MODEL }));

  /** Channels and chats the Max bot has been added to (learned from bot_added events). */
  app.get('/max/chats', async () => listMaxChats());

  app.get('/settings/style-guide', async () => ({ text: getStyleGuide(), isDefault: getStyleGuide() === DEFAULT_STYLE_GUIDE }));

  app.put('/settings/style-guide', async (req, reply) => {
    const parsed = StyleGuideInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(formatZodError(parsed.error));
    saveStyleGuide(parsed.data.text);
    return { text: parsed.data.text, isDefault: parsed.data.text === DEFAULT_STYLE_GUIDE };
  });

  app.post('/settings/style-guide/reset', async () => {
    saveStyleGuide(DEFAULT_STYLE_GUIDE);
    return { text: DEFAULT_STYLE_GUIDE, isDefault: true };
  });
}
