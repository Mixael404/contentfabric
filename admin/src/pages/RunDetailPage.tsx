import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fmtDate, fmtDuration, get } from '../api';
import Badge from '../components/Badge';
import ReviewActions from '../components/ReviewActions';
import TelegramPreview from '../components/TelegramPreview';
import type { RunDetail } from '../types';

export default function RunDetailPage() {
  const { id } = useParams();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'telegram' | 'max' | 'draft'>('telegram');

  const load = useCallback(() => get<RunDetail>(`/runs/${id}`).then(setRun).catch((e) => setError(e.message)), [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (run && ['pending', 'running', 'publishing'].includes(run.status)) load();
    }, 4000);
    return () => clearInterval(t);
  }, [load, run]);

  if (error) return <div className="alert error">{error}</div>;
  if (!run) return <div className="empty">Загрузка…</div>;
  const post = run.post;

  return (
    <>
      <div className="page-head">
        <h1>
          Запуск · {run.campaign ? <Link to={`/campaigns/${run.campaign.id}`}>{run.campaign.name}</Link> : '—'} <Badge status={run.status} />
        </h1>
        <div className="actions">
          <Link to="/runs" className="btn">
            ← Все запуски
          </Link>
          <button className="btn" onClick={load}>
            Обновить
          </button>
        </div>
      </div>
      {notice && <div className="alert ok">{notice}</div>}
      {run.error && <div className={`alert ${run.status === 'failed' ? 'error' : 'info'}`}>{run.error}</div>}

      <div className="grid-3">
        <div className="stat">
          <div className="k">Создан / план</div>
          <div className="v">{fmtDate(run.scheduledAt, run.campaign?.timezone)}</div>
        </div>
        <div className="stat">
          <div className="k">Этап</div>
          <div className="v mono">{run.stage ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="k">Длительность</div>
          <div className="v">{fmtDuration(run.startedAt, run.finishedAt) || '—'}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div>
          {post ? (
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>
                  Пост <Badge status={post.status} />
                </h2>
                <div className="row" style={{ gap: 4 }}>
                  {(['telegram', 'max', 'draft'] as const).map((t) => (
                    <button key={t} className={`btn sm${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>
                      {t === 'telegram' ? 'Telegram' : t === 'max' ? 'Max HTML' : 'JSON модели'}
                    </button>
                  ))}
                </div>
              </div>
              {tab === 'telegram' && <TelegramPreview post={post} />}
              {tab === 'max' && <pre>{post.maxHtml}</pre>}
              {tab === 'draft' && <pre>{JSON.stringify(post.draft, null, 2)}</pre>}

              {post.status === 'awaiting_review' && (
                <div style={{ marginTop: 14 }}>
                  <ReviewActions
                    postId={post.id}
                    onDone={(m) => {
                      setNotice(m);
                      setTimeout(load, 800);
                    }}
                  />
                </div>
              )}

              <div style={{ marginTop: 14 }} className="small">
                <div>
                  <span className="muted">Модель:</span> <span className="mono">{post.model}</span>
                  {post.usage && 'total_tokens' in post.usage && (
                    <>
                      {' '}
                      · <span className="muted">токенов:</span> {String(post.usage.total_tokens)}
                    </>
                  )}
                </div>
                {post.imageQuery && (
                  <div>
                    <span className="muted">Запрос картинки:</span> {post.imageQuery}
                  </div>
                )}
                {post.sources.length > 0 && (
                  <div>
                    <span className="muted">Источники:</span>{' '}
                    {post.sources.map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ' · '}
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title || s.url}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {post.publications.length > 0 && (
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Канал</th>
                      <th>Цель</th>
                      <th>Статус</th>
                      <th>Сообщение / ошибка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {post.publications.map((p) => (
                      <tr key={p.id}>
                        <td>{p.channel}</td>
                        <td className="mono">{p.target}</td>
                        <td>
                          <Badge status={p.status} />
                        </td>
                        <td className="small">{p.status === 'sent' ? `id ${p.externalMessageId} · ${fmtDate(p.sentAt)}` : p.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="card">
              <h2>Пост</h2>
              <div className="muted">{['pending', 'running'].includes(run.status) ? 'Генерация ещё идёт…' : 'Пост не был создан'}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Журнал</h2>
          <div className="log">
            {run.log.length === 0 && <div className="muted">Пока пусто</div>}
            {run.log.map((l, i) => (
              <div key={i} className={`log-line ${l.level}`}>
                <span className="muted mono">{new Date(l.t).toLocaleTimeString('ru-RU')}</span>
                <span className="lvl">{l.level}</span>
                <div>
                  {l.msg}
                  {l.data !== undefined && l.data !== null && <pre>{JSON.stringify(l.data, null, 1)}</pre>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
