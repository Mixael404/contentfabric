import { useEffect, useState } from 'react';
import { fmtDate, get, post, put } from '../api';
import Badge from '../components/Badge';
import type { Status } from '../types';

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [guide, setGuide] = useState<string>('');
  const [isDefault, setIsDefault] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    get<Status>('/status').then(setStatus).catch(() => undefined);
    get<{ text: string; isDefault: boolean }>('/settings/style-guide')
      .then((r) => {
        setGuide(r.text);
        setIsDefault(r.isDefault);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    try {
      const r = await put<{ text: string; isDefault: boolean }>('/settings/style-guide', { text: guide });
      setIsDefault(r.isDefault);
      setMsg({ kind: 'ok', text: 'Стайлгайд сохранён. Применится к следующим генерациям.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const reset = async () => {
    if (!confirm('Вернуть стайлгайд по умолчанию?')) return;
    const r = await post<{ text: string; isDefault: boolean }>('/settings/style-guide/reset');
    setGuide(r.text);
    setIsDefault(r.isDefault);
  };

  return (
    <>
      <div className="page-head">
        <h1>Настройки и статус</h1>
      </div>
      {msg && (
        <div className={`alert ${msg.kind}`} onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}

      <div className="card">
        <h2>Состояние сервиса</h2>
        {!status ? (
          <div className="muted">Загрузка…</div>
        ) : (
          <div className="grid-3">
            <div className="stat">
              <div className="k">Telegram бот</div>
              <div className="v">{status.telegram.botUsername ? `@${status.telegram.botUsername}` : <Badge status="off" label="не подключён" />}</div>
            </div>
            <div className="stat">
              <div className="k">Max</div>
              <div className="v">
                {status.max.configured ? (
                  <>
                    <Badge status="on" label={status.max.botName ?? 'включён'} />
                    <div className="muted small">каналов, куда добавлен бот: {status.max.knownChats}</div>
                  </>
                ) : (
                  <Badge status="off" label="нет MAX_BOT_TOKEN" />
                )}
              </div>
            </div>
            <div className="stat">
              <div className="k">Модерация в Telegram</div>
              <div className="v">{status.review.viaTelegram ? `chat ${status.review.adminChatId}` : <Badge status="off" label="ADMIN_TELEGRAM_CHAT_ID не задан" />}</div>
            </div>
            <div className="stat">
              <div className="k">Провайдеры картинок</div>
              <div className="v">{status.imageProviders.length ? status.imageProviders.join(', ') : <Badge status="off" label="не настроены" />}</div>
            </div>
            <div className="stat">
              <div className="k">Публичный URL</div>
              <div className="v small">{status.publicBaseUrl ?? <span className="muted">не задан (превью берутся с CDN провайдера)</span>}</div>
            </div>
            <div className="stat">
              <div className="k">Планировщик</div>
              <div className="v small">
                {status.scheduler.enabled ? `тик каждые ${status.scheduler.tickSeconds} с, окно ${status.scheduler.graceMinutes} мин` : 'выключен'}
                <div className="muted">последний тик: {fmtDate(status.scheduler.lastTickAt)}</div>
              </div>
            </div>
            <div className="stat">
              <div className="k">Очередь</div>
              <div className="v small">
                параллельно до {status.queue.concurrency} · в работе {status.queue.pending} · ждут {status.queue.waiting}
              </div>
            </div>
            <div className="stat">
              <div className="k">Запуски по статусам</div>
              <div className="v small">
                {Object.entries(status.runs).map(([k, v]) => (
                  <span key={k} style={{ marginRight: 8 }}>
                    <Badge status={k} /> {v}
                  </span>
                ))}
                {Object.keys(status.runs).length === 0 && <span className="muted">пока нет</span>}
              </div>
            </div>
            <div className="stat">
              <div className="k">Модель по умолчанию</div>
              <div className="v mono">{status.defaultModel}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card form">
        <h2>
          Общий стайлгайд оформления {isDefault && <span className="muted small">(по умолчанию)</span>}
        </h2>
        <div className="hint muted small">
          Добавляется к системному промпту каждой кампании. Плейсхолдеры: <code>{'{{date}}'}</code>, <code>{'{{language}}'}</code>, <code>{'{{max_body_length}}'}</code>.
          Разметка, которую понимает рендер: **жирный**, _курсив_, [ссылка](url), списки «- », цитаты «&gt; ».
        </div>
        <div className="field">
          <textarea className="tall" style={{ minHeight: 420 }} value={guide} onChange={(e) => setGuide(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn primary" onClick={save}>
            Сохранить
          </button>
          <button className="btn" onClick={reset}>
            Сбросить к умолчанию
          </button>
        </div>
      </div>
    </>
  );
}
