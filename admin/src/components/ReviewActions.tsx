import { useState } from 'react';
import { post as apiPost } from '../api';

export default function ReviewActions({ postId, onDone }: { postId: string; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: 'approve' | 'regenerate' | 'skip') => {
    if (action === 'skip' && !confirm('Пропустить этот пост? Он не будет опубликован.')) return;
    setBusy(action);
    setError(null);
    try {
      const res = await apiPost<{ result: string }>(`/posts/${postId}/${action}`);
      onDone(res.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="row">
        <button className="btn ok" disabled={!!busy} onClick={() => act('approve')}>
          ✅ Опубликовать
        </button>
        <button className="btn" disabled={!!busy} onClick={() => act('regenerate')}>
          🔁 Перегенерировать
        </button>
        <button className="btn danger" disabled={!!busy} onClick={() => act('skip')}>
          ⛔ Пропустить
        </button>
      </div>
      {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
