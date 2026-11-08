import PQueue from 'p-queue';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Run } from '../db/schema.js';
import { executeRun, publishPost } from '../pipeline/run-pipeline.js';
import { getPost, getRun, updatePost, updateRun } from '../db/repo.js';
import { nowIso } from '../utils/ids.js';

/**
 * Worker pool: at most MAX_CONCURRENCY jobs in flight globally, and jobs of the
 * same campaign run strictly one after another (so the anti-repeat context stays
 * accurate and a channel never receives two posts at once).
 *
 * Per-campaign ordering is enforced *before* a job enters the pool, so a waiting
 * job never occupies a worker slot and the pool cannot deadlock.
 */
const queue = new PQueue({ concurrency: config.MAX_CONCURRENCY });
const campaignChains = new Map<string, Promise<void>>();
const queuedRuns = new Set<string>();
const queuedPublishes = new Set<string>();

function runSerialized(campaignId: string, job: () => Promise<void>): Promise<void> {
  const prev = campaignChains.get(campaignId) ?? Promise.resolve();
  const next: Promise<void> = prev
    .catch(() => undefined)
    .then(() => queue.add(job))
    .then(() => undefined);
  const tracked = next.finally(() => {
    if (campaignChains.get(campaignId) === tracked) campaignChains.delete(campaignId);
  });
  campaignChains.set(campaignId, tracked);
  return tracked;
}

export function enqueueRun(run: Run): boolean {
  if (queuedRuns.has(run.id)) return false;
  queuedRuns.add(run.id);
  void runSerialized(run.campaignId, async () => {
    try {
      await executeRun(run.id);
    } catch (err) {
      logger.error({ err, runId: run.id }, 'unhandled pipeline error');
      updateRun(run.id, { status: 'failed', error: err instanceof Error ? err.message : String(err), finishedAt: nowIso() });
    } finally {
      queuedRuns.delete(run.id);
    }
  });
  return true;
}

export function enqueuePublish(postId: string, campaignId: string, actor: string): boolean {
  if (queuedPublishes.has(postId)) return false;
  queuedPublishes.add(postId);
  void runSerialized(campaignId, async () => {
    try {
      await publishPost(postId, { actor });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId }, 'publish job failed');
      const post = getPost(postId);
      if (post) {
        updatePost(postId, { status: 'failed' });
        const run = getRun(post.runId);
        if (run) updateRun(run.id, { status: 'failed', error: message, finishedAt: nowIso() });
      }
    } finally {
      queuedPublishes.delete(postId);
    }
  });
  return true;
}

export function queueStats() {
  return {
    concurrency: config.MAX_CONCURRENCY,
    pending: queue.pending,
    waiting: Math.max(0, queuedRuns.size + queuedPublishes.size - queue.pending),
    activeCampaigns: Array.from(campaignChains.keys()),
  };
}

export async function drainQueue(timeoutMs = 60_000): Promise<void> {
  await Promise.race([queue.onIdle(), new Promise((r) => setTimeout(r, timeoutMs))]);
}
