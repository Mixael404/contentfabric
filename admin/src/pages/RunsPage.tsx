import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fmtDate, fmtDuration, get } from '../api';
import Badge from '../components/Badge';
import type { Campaign, RunSummary } from '../types';

const TRIGGER: Record<RunSummary['trigger'], string> = { schedule: 'расписание', manual: 'вручную', regenerate: 'перегенерация' };

export default function RunsPage() {
  const [params, setParams] = useSearchParams();
  const campaignId = params.get('campaignId') ?? '';
  const status = params.get('status') ?? '';
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const navigate = useNavigate();

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (campaignId) q.set('campaignId', campaignId);
    if (status) q.set('status', status);
    q.set('limit', '200');
    return get<RunSummary[]>(`/runs?${q}`).then(setRuns).catch(() => undefined);
  }, [campaignId, status]);

  useEffect(() => {
    get<Campaign[]>('/campaigns').then(setCampaigns).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };

  return (
    <>
      <div className="page-head">
        <h1>Запуски</h1>
        <div className="actions">
          <select className="btn" value={campaignId} onChange={(e) => setFilter('campaignId', e.target.value)}>
            <option value="">Все кампании</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="btn" value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Все статусы</option>
            {['pending', 'running', 'awaiting_review', 'publishing', 'published', 'failed', 'skipped'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {runs === null ? (
          <div className="empty">Загрузка…</div>
        ) : runs.length === 0 ? (
          <div className="empty">Запусков нет</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Создан</th>
                <th>Кампания</th>
                <th>Триггер</th>
                <th>Статус</th>
                <th>Этап</th>
                <th>Длительность</th>
                <th>Ошибка / комментарий</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/runs/${r.id}`)}>
                  <td className="nowrap small">{fmtDate(r.createdAt)}</td>
                  <td>
                    <Link to={`/campaigns/${r.campaignId}`} onClick={(e) => e.stopPropagation()}>
                      {r.campaignName}
                    </Link>
                  </td>
                  <td className="small">
                    {TRIGGER[r.trigger]}
                    {r.forceReview && r.trigger === 'manual' && <span className="muted"> (черновик)</span>}
                  </td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td className="mono">{r.stage ?? '—'}</td>
                  <td className="small nowrap">{fmtDuration(r.startedAt, r.finishedAt)}</td>
                  <td className="small muted" style={{ maxWidth: 420 }}>
                    {r.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
