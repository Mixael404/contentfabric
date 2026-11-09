import type { FastifyInstance } from 'fastify';
import { DateTime } from 'luxon';
import {
  createCampaign,
  createRun,
  deleteCampaign,
  getCampaign,
  lastRunForCampaign,
  listCampaigns,
  updateCampaign,
} from '../../db/repo.js';
import type { Campaign } from '../../db/schema.js';
import { nextSlot, parseScheduleTimes } from '../../utils/time.js';
import { nowIso } from '../../utils/ids.js';
import { enqueueRun } from '../../scheduler/queue.js';
import { CampaignInput, RunNowInput, formatZodError, type CampaignInputT } from '../schemas.js';

export function serializeCampaign(c: Campaign) {
  const times: string[] = JSON.parse(c.scheduleTimes || '[]');
  const last = lastRunForCampaign(c.id);
  return {
    ...c,
    scheduleTimes: times,
    nextRunAt: c.enabled ? (nextSlot(times, c.timezone, DateTime.utc())?.toISO() ?? null) : null,
    lastRun: last ? { id: last.id, status: last.status, stage: last.stage, createdAt: last.createdAt, error: last.error } : null,
  };
}

function toRow(input: CampaignInputT) {
  return {
    name: input.name,
    enabled: input.enabled,
    systemPrompt: input.systemPrompt,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    webSearch: input.webSearch,
    searchContextSize: input.searchContextSize,
    scheduleTimes: JSON.stringify(parseScheduleTimes(input.scheduleTimes)),
    timezone: input.timezone,
    language: input.language,
    telegramChatId: input.telegramChatId,
    maxChatId: input.maxChatId,
    mode: input.mode,
    imageProvider: input.imageProvider,
    imageSourceMode: input.imageSourceMode,
    imageRequired: input.imageRequired,
    maxBodyLength: input.maxBodyLength,
    recentTopicsLimit: input.recentTopicsLimit,
  };
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/campaigns', async () => listCampaigns().map(serializeCampaign));

  app.get<{ Params: { id: string } }>('/campaigns/:id', async (req, reply) => {
    const c = getCampaign(req.params.id);
    if (!c) return reply.code(404).send({ message: 'Кампания не найдена' });
    return serializeCampaign(c);
  });

  app.post('/campaigns', async (req, reply) => {
    const parsed = CampaignInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(formatZodError(parsed.error));
    const c = createCampaign(toRow(parsed.data));
    return reply.code(201).send(serializeCampaign(c));
  });

  app.put<{ Params: { id: string } }>('/campaigns/:id', async (req, reply) => {
    if (!getCampaign(req.params.id)) return reply.code(404).send({ message: 'Кампания не найдена' });
    const parsed = CampaignInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(formatZodError(parsed.error));
    const c = updateCampaign(req.params.id, toRow(parsed.data));
    return serializeCampaign(c!);
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean } }>('/campaigns/:id/enabled', async (req, reply) => {
    const c = getCampaign(req.params.id);
    if (!c) return reply.code(404).send({ message: 'Кампания не найдена' });
    const enabled = Boolean(req.body?.enabled);
    if (enabled && !c.telegramChatId && !c.maxChatId) return reply.code(400).send({ message: 'Сначала укажите канал для публикации' });
    return serializeCampaign(updateCampaign(c.id, { enabled })!);
  });

  app.delete<{ Params: { id: string } }>('/campaigns/:id', async (req, reply) => {
    if (!getCampaign(req.params.id)) return reply.code(404).send({ message: 'Кампания не найдена' });
    deleteCampaign(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/campaigns/:id/run', async (req, reply) => {
    const c = getCampaign(req.params.id);
    if (!c) return reply.code(404).send({ message: 'Кампания не найдена' });
    const parsed = RunNowInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send(formatZodError(parsed.error));
    const run = createRun({
      campaignId: c.id,
      trigger: 'manual',
      scheduledAt: nowIso(),
      slotKey: null,
      status: 'pending',
      forceReview: parsed.data.forceReview,
    });
    const started = enqueueRun(run);
    return reply.code(202).send({ run, queued: started, note: started ? null : 'Кампания сейчас занята, запуск выполнится следом' });
  });
}
