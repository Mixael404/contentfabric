import { config } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/client.js';
import { markInterruptedRuns } from './db/repo.js';
import { buildApp } from './http/app.js';
import { initBot } from './telegram/bot.js';
import { registerReviewCallbacks, startReviewBot, stopReviewBot } from './review/telegram-review.js';
import { approvePost, regeneratePost, skipPost } from './review/actions.js';
import { startScheduler, stopScheduler } from './scheduler/scheduler.js';
import { drainQueue } from './scheduler/queue.js';
import { configuredImageProviders } from './images/index.js';

async function main() {
  runMigrations();
  const interrupted = markInterruptedRuns();
  if (interrupted) logger.warn({ interrupted }, 'runs interrupted by a previous shutdown were marked failed');

  logger.info(
    {
      maxEnabled: config.maxEnabled,
      reviewViaTelegram: config.reviewViaTelegram,
      imageProviders: configuredImageProviders(),
      publicBaseUrl: config.PUBLIC_BASE_URL ?? null,
      concurrency: config.MAX_CONCURRENCY,
    },
    'content-fabric starting',
  );
  if (configuredImageProviders().length === 0) logger.warn('no image provider keys configured: posts will go out without pictures');

  await initBot();
  registerReviewCallbacks({ approve: approvePost, regenerate: regeneratePost, skip: skipPost });
  startReviewBot();

  const app = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });

  startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    stopScheduler();
    await stopReviewBot();
    await drainQueue(30_000);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal error on startup');
  process.exit(1);
});
