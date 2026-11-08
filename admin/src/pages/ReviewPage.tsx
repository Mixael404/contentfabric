import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, get } from '../api';
import ReviewActions from '../components/ReviewActions';
import TelegramPreview from '../components/TelegramPreview';
import type { Post } from '../types';

export default function ReviewPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => get<Post[]>('/posts?status=awaiting_review&limit=100').then(setPosts).catch(() => undefined), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <div className="page-head">
        <h1>На модерации {posts && posts.length > 0 && <span className="muted">({posts.length})</span>}</h1>
        <div className="actions">
          <button className="btn" onClick={load}>
            Обновить
          </button>
        </div>
      </div>
      {notice && (
        <div className="alert ok" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {posts === null ? (
        <div className="empty">Загрузка…</div>
      ) : posts.length === 0 ? (
        <div className="card empty">Нет черновиков, ожидающих решения</div>
      ) : (
        posts.map((p) => (
          <div className="card" key={p.id}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <strong>{p.campaignName}</strong> <span className="muted small">· {fmtDate(p.createdAt)} · </span>
                <Link to={`/runs/${p.runId}`} className="small">
                  запуск и журнал
                </Link>
              </div>
            </div>
            <div className="grid-2">
              <TelegramPreview post={p} />
              <div>
                <ReviewActions
                  postId={p.id}
                  onDone={(m) => {
                    setNotice(m);
                    setTimeout(load, 800);
                  }}
                />
                <div className="small" style={{ marginTop: 14 }}>
                  {p.sources.length > 0 && (
                    <div>
                      <span className="muted">Источники:</span>{' '}
                      {p.sources.map((s, i) => (
                        <span key={s.url}>
                          {i > 0 && ' · '}
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title || s.url}
                          </a>
                        </span>
                      ))}
                    </div>
                  )}
                  <div>
                    <span className="muted">Модель:</span> <span className="mono">{p.model}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
