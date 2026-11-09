import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from './client.js';
import type { Campaign, Media, NewCampaign, NewMedia, NewPost, NewRun, Post, Publication, Run } from './schema.js';
import { newId, nowIso } from '../utils/ids.js';

const { campaigns, runs, posts, publications, media, settings } = schema;

// ---------- campaigns ----------

export function listCampaigns(): Campaign[] {
  return db.select().from(campaigns).orderBy(campaigns.createdAt).all();
}

export function listEnabledCampaigns(): Campaign[] {
  return db.select().from(campaigns).where(eq(campaigns.enabled, true)).all();
}

export function getCampaign(id: string): Campaign | undefined {
  return db.select().from(campaigns).where(eq(campaigns.id, id)).get();
}

export function createCampaign(data: Omit<NewCampaign, 'id' | 'createdAt' | 'updatedAt'>): Campaign {
  const now = nowIso();
  const row: NewCampaign = { ...data, id: newId(), createdAt: now, updatedAt: now };
  db.insert(campaigns).values(row).run();
  return getCampaign(row.id)!;
}

export function updateCampaign(id: string, data: Partial<Omit<NewCampaign, 'id' | 'createdAt'>>): Campaign | undefined {
  db.update(campaigns)
    .set({ ...data, updatedAt: nowIso() })
    .where(eq(campaigns.id, id))
    .run();
  return getCampaign(id);
}

export function deleteCampaign(id: string): void {
  db.transaction((tx) => {
    tx.delete(publications).where(eq(publications.campaignId, id)).run();
    tx.delete(posts).where(eq(posts.campaignId, id)).run();
    tx.delete(runs).where(eq(runs.campaignId, id)).run();
    tx.delete(campaigns).where(eq(campaigns.id, id)).run();
  });
}

// ---------- runs ----------

export function getRun(id: string): Run | undefined {
  return db.select().from(runs).where(eq(runs.id, id)).get();
}

export function createRun(data: Omit<NewRun, 'id' | 'createdAt' | 'log'>): Run {
  const row: NewRun = { ...data, id: newId(), createdAt: nowIso(), log: '[]' };
  db.insert(runs).values(row).run();
  return getRun(row.id)!;
}

/** Insert a scheduled run unless the slot already exists. Returns the run if created. */
export function createScheduledRunIfMissing(data: Omit<NewRun, 'id' | 'createdAt' | 'log'> & { slotKey: string }): Run | null {
  const row: NewRun = { ...data, id: newId(), createdAt: nowIso(), log: '[]' };
  const res = db.insert(runs).values(row).onConflictDoNothing({ target: runs.slotKey }).run();
  return res.changes > 0 ? getRun(row.id)! : null;
}

export function updateRun(id: string, data: Partial<Omit<NewRun, 'id'>>): void {
  db.update(runs).set(data).where(eq(runs.id, id)).run();
}

export interface RunLogEntry {
  t: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
  data?: unknown;
}

export function appendRunLog(id: string, entry: Omit<RunLogEntry, 't'>): void {
  const run = getRun(id);
  if (!run) return;
  const log: RunLogEntry[] = JSON.parse(run.log || '[]');
  log.push({ t: nowIso(), ...entry });
  db.update(runs).set({ log: JSON.stringify(log) }).where(eq(runs.id, id)).run();
}

export function listPendingRuns(): Run[] {
  return db.select().from(runs).where(eq(runs.status, 'pending')).orderBy(runs.scheduledAt).all();
}

export function listRuns(opts: { campaignId?: string; status?: string; limit?: number } = {}): Run[] {
  const conds = [];
  if (opts.campaignId) conds.push(eq(runs.campaignId, opts.campaignId));
  if (opts.status) conds.push(eq(runs.status, opts.status));
  const q = db
    .select()
    .from(runs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(runs.createdAt))
    .limit(opts.limit ?? 100);
  return q.all();
}

export function lastRunForCampaign(campaignId: string): Run | undefined {
  return db.select().from(runs).where(eq(runs.campaignId, campaignId)).orderBy(desc(runs.createdAt)).limit(1).get();
}

export function markInterruptedRuns(): number {
  const res = db
    .update(runs)
    .set({ status: 'failed', error: 'Прервано перезапуском сервиса', finishedAt: nowIso() })
    .where(inArray(runs.status, ['running', 'publishing']))
    .run();
  return res.changes;
}

// ---------- posts ----------

export function getPost(id: string): Post | undefined {
  return db.select().from(posts).where(eq(posts.id, id)).get();
}

export function createPost(data: Omit<NewPost, 'id' | 'createdAt' | 'updatedAt'>): Post {
  const now = nowIso();
  const row: NewPost = { ...data, id: newId(), createdAt: now, updatedAt: now };
  db.insert(posts).values(row).run();
  return getPost(row.id)!;
}

export function updatePost(id: string, data: Partial<Omit<NewPost, 'id' | 'createdAt'>>): Post | undefined {
  db.update(posts)
    .set({ ...data, updatedAt: nowIso() })
    .where(eq(posts.id, id))
    .run();
  return getPost(id);
}

export function listPosts(opts: { campaignId?: string; status?: string; limit?: number } = {}): Post[] {
  const conds = [];
  if (opts.campaignId) conds.push(eq(posts.campaignId, opts.campaignId));
  if (opts.status) conds.push(eq(posts.status, opts.status));
  return db
    .select()
    .from(posts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit ?? 100)
    .all();
}

export interface RecentTopic {
  title: string;
  /** First hashtag of the post, used as its type marker (e.g. #новости) */
  tag: string | null;
  createdAt: string;
}

export function recentTopics(campaignId: string, limit = 60): RecentTopic[] {
  if (limit <= 0) return [];
  return db
    .select({ title: posts.title, hashtags: posts.hashtags, createdAt: posts.createdAt })
    .from(posts)
    .where(and(eq(posts.campaignId, campaignId), inArray(posts.status, ['published', 'approved', 'awaiting_review'])))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .all()
    .map((r) => {
      let tag: string | null = null;
      try {
        const tags = JSON.parse(r.hashtags || '[]') as string[];
        const first = tags.find((t) => t && t.trim());
        if (first) tag = `#${first.trim().replace(/^#+/, '')}`;
      } catch {
        tag = null;
      }
      return { title: r.title, tag, createdAt: r.createdAt };
    });
}

export function recentMediaProviderIds(campaignId: string, limit = 60): Set<string> {
  const rows = db
    .select({ provider: media.provider, providerId: media.providerId })
    .from(media)
    .where(eq(media.campaignId, campaignId))
    .orderBy(desc(media.createdAt))
    .limit(limit)
    .all();
  return new Set(rows.map((r) => `${r.provider}:${r.providerId}`));
}

// ---------- publications ----------

export function createPublication(data: Omit<Publication, 'id' | 'createdAt'>): Publication {
  const row = { ...data, id: newId(), createdAt: nowIso() };
  db.insert(publications).values(row).run();
  return row;
}

export function updatePublication(id: string, data: Partial<Publication>): void {
  db.update(publications).set(data).where(eq(publications.id, id)).run();
}

export function listPublicationsForPost(postId: string): Publication[] {
  return db.select().from(publications).where(eq(publications.postId, postId)).all();
}

// ---------- media ----------

export function getMedia(id: string): Media | undefined {
  return db.select().from(media).where(eq(media.id, id)).get();
}

export function createMedia(data: Omit<NewMedia, 'id' | 'createdAt'>): Media {
  const row: NewMedia = { ...data, id: newId(), createdAt: nowIso() };
  db.insert(media).values(row).run();
  return getMedia(row.id)!;
}

// ---------- settings ----------

export function getSetting(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

export function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: nowIso() } })
    .run();
}

export function countRunsByStatus(): Record<string, number> {
  const rows = db.select({ status: runs.status, n: sql<number>`count(*)` }).from(runs).groupBy(runs.status).all();
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}
