import { DateTime } from 'luxon';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { createScheduledRunIfMissing, listEnabledCampaigns, listPendingRuns } from '../db/repo.js';
import { parseScheduleTimes, slotsForDays } from '../utils/time.js';
import { enqueueRun } from './queue.js';

let timer: NodeJS.Timeout | null = null;
let lastTickAt: string | null = null;
let ticking = false;

/**
 * Every tick: materialise due schedule slots as runs (idempotent via slot key),
 * record slots missed beyond the grace window, then hand pending runs to the queue.
 */
export function tick(): void {
  if (ticking) return;
  ticking = true;
  const now = DateTime.utc();
  try {
    for (const campaign of listEnabledCampaigns()) {
      let times: string[] = [];
      try {
        times = parseScheduleTimes(JSON.parse(campaign.scheduleTimes || '[]'));
      } catch (err) {
        logger.warn({ err, campaign: campaign.name }, 'invalid schedule, skipping');
        continue;
      }
      if (times.length === 0) continue;
      const createdAt = DateTime.fromISO(campaign.createdAt, { zone: 'utc' });
      for (const slot of slotsForDays(times, campaign.timezone, now, [-1, 0])) {
        if (slot.at > now || slot.at < createdAt) continue;
        const lateMinutes = now.diff(slot.at).as('minutes');
        const slotKey = `${campaign.id}|${slot.key}`;
        if (lateMinutes <= config.MISFIRE_GRACE_MINUTES) {
          const run = createScheduledRunIfMissing({
            campaignId: campaign.id,
            trigger: 'schedule',
            scheduledAt: slot.at.toISO()!,
            slotKey,
            status: 'pending',
            forceReview: false,
          });
          if (run) logger.info({ campaign: campaign.name, slot: slot.key }, 'scheduled run created');
        } else {
          const run = createScheduledRunIfMissing({
            campaignId: campaign.id,
            trigger: 'schedule',
            scheduledAt: slot.at.toISO()!,
            slotKey,
            status: 'skipped',
            forceReview: false,
            error: `Слот пропущен: сервис не был активен (опоздание ${Math.round(lateMinutes)} мин)`,
            finishedAt: now.toISO()!,
          });
          if (run) logger.warn({ campaign: campaign.name, slot: slot.key }, 'missed slot recorded');
        }
      }
    }

    for (const run of listPendingRuns()) enqueueRun(run);
    lastTickAt = now.toISO();
  } catch (err) {
    logger.error({ err }, 'scheduler tick failed');
  } finally {
    ticking = false;
  }
}

export function startScheduler(): void {
  if (config.SCHEDULER_DISABLED) {
    logger.warn('scheduler disabled via SCHEDULER_DISABLED');
    return;
  }
  tick();
  timer = setInterval(tick, config.SCHEDULER_TICK_SECONDS * 1000);
  logger.info({ everySeconds: config.SCHEDULER_TICK_SECONDS, graceMinutes: config.MISFIRE_GRACE_MINUTES }, 'scheduler started');
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function schedulerStatus() {
  return { enabled: !config.SCHEDULER_DISABLED, lastTickAt, tickSeconds: config.SCHEDULER_TICK_SECONDS, graceMinutes: config.MISFIRE_GRACE_MINUTES };
}
