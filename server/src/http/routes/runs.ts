import type { FastifyInstance } from 'fastify';
import { getCampaign, getMedia, getPost, getRun, listPosts, listPublicationsForPost, listRuns } from '../../db/repo.js';
import type { Post } from '../../db/schema.js';
import { mediaPublicUrl } from '../../media/storage.js';
import { approvePost, regeneratePost, skipPost } from '../../review/actions.js';

function serializePost(p: Post) {
  const media = p.mediaId ? getMedia(p.mediaId) : undefined;
  return {
    ...p,
    sources: JSON.parse(p.sources || '[]'),
    hashtags: JSON.parse(p.hashtags || '[]'),
    draft: JSON.parse(p.draftJson || '{}'),
    usage: p.usage ? JSON.parse(p.usage) : null,
    media: media
      ? {
          ...media,
          // Served by this app; the admin UI is same-origin so a relative URL works even without PUBLIC_BASE_URL.
          url: `/media/${media.fileName}`,
          publicUrl: mediaPublicUrl(media),
        }
      : null,
    publications: listPublicationsForPost(p.id),
  };
}

export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { campaignId?: string; status?: string; limit?: string } }>('/runs', async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const runs = listRuns({ campaignId: req.query.campaignId, status: req.query.status, limit });
    const names = new Map<string, string>();
    return runs.map((r) => {
      if (!names.has(r.campaignId)) names.set(r.campaignId, getCampaign(r.campaignId)?.name ?? '—');
      return { ...r, log: undefined, campaignName: names.get(r.campaignId) };
    });
  });

  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const run = getRun(req.params.id);
    if (!run) return reply.code(404).send({ message: 'Запуск не найден' });
    const campaign = getCampaign(run.campaignId);
    const post = run.postId ? getPost(run.postId) : undefined;
    return {
      ...run,
      log: JSON.parse(run.log || '[]'),
      campaign: campaign ? { id: campaign.id, name: campaign.name, timezone: campaign.timezone, mode: campaign.mode } : null,
      post: post ? serializePost(post) : null,
    };
  });

  app.get<{ Querystring: { campaignId?: string; status?: string; limit?: string } }>('/posts', async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 300);
    return listPosts({ campaignId: req.query.campaignId, status: req.query.status, limit }).map((p) => ({
      ...serializePost(p),
      campaignName: getCampaign(p.campaignId)?.name ?? '—',
    }));
  });

  app.get<{ Params: { id: string } }>('/posts/:id', async (req, reply) => {
    const post = getPost(req.params.id);
    if (!post) return reply.code(404).send({ message: 'Пост не найден' });
    return serializePost(post);
  });

  const actions = { approve: approvePost, regenerate: regeneratePost, skip: skipPost } as const;
  for (const [name, fn] of Object.entries(actions)) {
    app.post<{ Params: { id: string } }>(`/posts/:id/${name}`, async (req, reply) => {
      try {
        const result = await fn(req.params.id, 'web:admin');
        return { ok: true, result };
      } catch (err) {
        return reply.code(400).send({ message: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}
