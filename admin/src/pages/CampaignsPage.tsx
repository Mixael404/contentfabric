import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtDate, get, patch, post } from '../api';
import Badge from '../components/Badge';
import type { Campaign } from '../types';

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => get<Campaign[]>('/campaigns').then(setItems).catch((e) => setMsg({ kind: 'error', text: e.message })), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const toggle = async (c: Campaign) => {
    try {
      await patch(`/campaigns/${c.id}/enabled`, { enabled: !c.enabled });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const runNow = async (c: Campaign, forceReview: boolean) => {
    try {
      const res = await post<{ run: { id: string }; queued: boolean; note: string | null }>(`/campaigns/${c.id}/run`, { forceReview });
      setMsg({ kind: 'ok', text: `Запуск «${c.name}» поставлен в очередь${res.note ? `: ${res.note}` : ''}` });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Кампании</h1>
        <div className="actions">
          <Link to="/campaigns/new" className="btn primary">
            + Новая кампания
          </Link>
        </div>
      </div>
      {msg && (
        <div className={`alert ${msg.kind}`} onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        {items === null ? (
          <div className="empty">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="empty">
            Кампаний пока нет. <Link to="/campaigns/new">Создайте первую</Link>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Вкл</th>
                <th>Название</th>
                <th>Расписание</th>
                <th>Каналы</th>
                <th>Модель</th>
                <th>Режим</th>
                <th>Следующий</th>
                <th>Последний запуск</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input type="checkbox" className="toggle" checked={c.enabled} onChange={() => toggle(c)} title={c.enabled ? 'Выключить' : 'Включить'} />
                  </td>
                  <td>
                    <Link to={`/campaigns/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                    <div className="small muted">{c.timezone}</div>
                  </td>
                  <td>
                    <div className="chips">
                      {c.scheduleTimes.length ? c.scheduleTimes.map((t) => <span key={t} className="chip">{t}</span>) : <span className="muted">—</span>}
                    </div>
                  </td>
                  <td className="small">
                    {c.telegramChatId && <div>TG {c.telegramChatId}</div>}
                    {c.maxChatId && <div>Max {c.maxChatId}</div>}
                    {!c.telegramChatId && !c.maxChatId && <span className="muted">не указаны</span>}
                  </td>
                  <td className="mono">
                    {c.model}
                    {c.reasoningEffort !== 'none' && <div className="muted small">reasoning: {c.reasoningEffort}</div>}
                  </td>
                  <td>
                    <Badge status={c.mode === 'review' ? 'awaiting_review' : 'published'} label={c.mode === 'review' ? 'модерация' : 'авто'} />
                  </td>
                  <td className="nowrap small">{c.enabled ? fmtDate(c.nextRunAt, c.timezone) : <span className="muted">выключена</span>}</td>
                  <td className="small">
                    {c.lastRun ? (
                      <div className="row" style={{ gap: 6 }}>
                        <Badge status={c.lastRun.status} />
                        <Link to={`/runs/${c.lastRun.id}`}>{fmtDate(c.lastRun.createdAt, c.timezone)}</Link>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {c.lastRun?.error && <div className="muted" title={c.lastRun.error}>{c.lastRun.error.slice(0, 60)}</div>}
                  </td>
                  <td className="nowrap">
                    <button className="btn sm" onClick={() => runNow(c, true)} title="Сгенерировать и показать на модерации, не публикуя автоматически">
                      Черновик
                    </button>{' '}
                    <button className="btn sm primary" onClick={() => runNow(c, false)} title={c.mode === 'auto' ? 'Сгенерировать и опубликовать' : 'Сгенерировать (режим кампании: модерация)'}>
                      Запустить
                    </button>{' '}
                    <button className="btn sm" onClick={() => navigate(`/runs?campaignId=${c.id}`)}>
                      Запуски
                    </button>
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
