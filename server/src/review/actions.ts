import { createRun, getCampaign, getPost, getRun, updatePost, updateRun } from '../db/repo.js';
import { nowIso } from '../utils/ids.js';
import { enqueuePublish, enqueueRun } from '../scheduler/queue.js';
import { finalizeReviewMessage } from './telegram-review.js';
import { appendRunLog } from '../db/repo.js';

function requireReviewable(postId: string) {
  const post = getPost(postId);
  if (!post) throw new Error('Пост не найден');
  if (post.status !== 'awaiting_review') throw new Error(`Пост уже обработан (статус: ${post.status})`);
  const run = getRun(post.runId);
  if (!run) throw new Error('Запуск не найден');
  return { post, run };
}

export async function approvePost(postId: string, actor: string): Promise<string> {
  const { post, run } = requireReviewable(postId);
  updatePost(post.id, { status: 'approved' });
  appendRunLog(run.id, { level: 'info', msg: 'Пост одобрен', data: { actor } });
  enqueuePublish(post.id, post.campaignId, actor);
  return '⏳ Отправлено на публикацию';
}

export async function skipPost(postId: string, actor: string): Promise<string> {
  const { post, run } = requireReviewable(postId);
  updatePost(post.id, { status: 'discarded' });
  updateRun(run.id, { status: 'skipped', error: `Пропущен (${actor})`, finishedAt: nowIso() });
  appendRunLog(run.id, { level: 'info', msg: 'Пост пропущен', data: { actor } });
  await finalizeReviewMessage(post, '⛔ Пропущено').catch(() => undefined);
  return '⛔ Пропущено';
}

export async function regeneratePost(postId: string, actor: string): Promise<string> {
  const { post, run } = requireReviewable(postId);
  const campaign = getCampaign(post.campaignId);
  if (!campaign) throw new Error('Кампания не найдена');
  updatePost(post.id, { status: 'discarded' });
  updateRun(run.id, { status: 'skipped', error: `Отправлен на перегенерацию (${actor})`, finishedAt: nowIso() });
  appendRunLog(run.id, { level: 'info', msg: 'Запрошена перегенерация', data: { actor } });
  const newRun = createRun({
    campaignId: campaign.id,
    trigger: 'regenerate',
    scheduledAt: nowIso(),
    slotKey: null,
    status: 'pending',
    forceReview: true,
  });
  enqueueRun(newRun);
  await finalizeReviewMessage(post, '🔁 Перегенерация запущена').catch(() => undefined);
  return '🔁 Перегенерация запущена, новый черновик придёт отдельным сообщением';
}
