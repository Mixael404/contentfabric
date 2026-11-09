import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, del, get, post, put } from '../api';
import type { Campaign, CampaignInput, Status } from '../types';

const DEFAULT_TIMES = ['09:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

function Field({
  name,
  label,
  hint,
  errors,
  children,
}: {
  name?: string;
  label: string;
  hint?: string;
  errors: Record<string, string>;
  children: ReactNode;
}) {
  const err = name ? errors[name] : undefined;
  return (
    <div className={`field${err ? ' error' : ''}`}>
      <label>{label}</label>
      {children}
      {err ? <div className="err">{err}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

const emptyCampaign = (model: string): CampaignInput => ({
  name: '',
  enabled: true,
  systemPrompt: '',
  model,
  reasoningEffort: 'low',
  webSearch: true,
  searchContextSize: 'medium',
  scheduleTimes: DEFAULT_TIMES,
  timezone: 'Europe/Moscow',
  language: 'ru',
  telegramChatId: '',
  maxChatId: '',
  mode: 'review',
  imageProvider: 'auto',
  imageSourceMode: 'model',
  imageRequired: false,
  maxBodyLength: 2500,
  recentTopicsLimit: 60,
});

export default function CampaignEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [form, setForm] = useState<CampaignInput | null>(null);
  const [timesText, setTimesText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get<{ models: string[]; defaultModel: string }>('/models')
      .then((r) => {
        setModels(r.models);
        if (isNew) {
          setForm(emptyCampaign(r.defaultModel));
          setTimesText(DEFAULT_TIMES.join(', '));
        }
      })
      .catch(() => {
        if (isNew) {
          setForm(emptyCampaign('gpt-5.1'));
          setTimesText(DEFAULT_TIMES.join(', '));
        }
      });
    get<Status>('/status').then(setStatus).catch(() => undefined);
    if (!isNew) {
      get<Campaign>(`/campaigns/${id}`)
        .then((c) => {
          setForm({ ...c, telegramChatId: c.telegramChatId ?? '', maxChatId: c.maxChatId ?? '' });
          setTimesText(c.scheduleTimes.join(', '));
        })
        .catch((e) => setMsg({ kind: 'error', text: e.message }));
    }
  }, [id, isNew]);

  const parsedTimes = useMemo(
    () =>
      Array.from(
        new Set(
          timesText
            .split(/[,\s;]+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => {
              const m = t.match(/^(\d{1,2}):(\d{2})$/);
              return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t;
            }),
        ),
      ).sort(),
    [timesText],
  );

  if (!form) return <div className="empty">Загрузка…</div>;

  const set = <K extends keyof CampaignInput>(k: K, v: CampaignInput[K]) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    setErrors({});
    setMsg(null);
    const payload = { ...form, scheduleTimes: parsedTimes };
    try {
      const saved = isNew ? await post<Campaign>('/campaigns', payload) : await put<Campaign>(`/campaigns/${id}`, payload);
      setMsg({ kind: 'ok', text: 'Сохранено' });
      if (isNew) navigate(`/campaigns/${saved.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.issues) {
        setErrors(Object.fromEntries(e.issues.map((i) => [i.path || '_', i.message])));
      }
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Удалить кампанию «${form.name}» вместе с историей запусков?`)) return;
    await del(`/campaigns/${id}`);
    navigate('/campaigns');
  };

  const runNow = async (forceReview: boolean) => {
    try {
      const res = await post<{ run: { id: string } }>(`/campaigns/${id}/run`, { forceReview });
      navigate(`/runs/${res.run.id}`);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const imageProviders = status?.imageProviders ?? [];

  return (
    <>
      <div className="page-head">
        <h1>{isNew ? 'Новая кампания' : form.name || 'Кампания'}</h1>
        <div className="actions">
          {!isNew && (
            <>
              <button className="btn" onClick={() => runNow(true)}>
                Сгенерировать черновик
              </button>
              <button className="btn" onClick={() => runNow(false)}>
                Запустить сейчас
              </button>
              <button className="btn danger" onClick={remove}>
                Удалить
              </button>
            </>
          )}
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="grid-2">
        <div>
          <div className="card form">
            <h2>Основное</h2>
            <Field errors={errors} name="name" label="Название (компания / канал)">
              <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Например: Финансы для ИП" />
            </Field>
            <Field
              errors={errors}
              name="systemPrompt"
              label="Системный промпт кампании"
              hint="Тема, аудитория, тон, запреты. Правила оформления и JSON-формат добавляются автоматически из общего стайлгайда (Настройки)."
            >
              <textarea
                className="tall"
                value={form.systemPrompt}
                onChange={(e) => set('systemPrompt', e.target.value)}
                placeholder={'Ты ведёшь Telegram-канал о личных финансах для предпринимателей в России. Пиши о налогах, банках, инвестициях и экономии. Тон: дружелюбный эксперт, без воды. Не давай индивидуальных инвестиционных рекомендаций...'}
              />
            </Field>
            <div className="grid-2">
              <Field errors={errors} name="language" label="Язык поста">
                <input type="text" value={form.language} onChange={(e) => set('language', e.target.value)} />
              </Field>
              <Field errors={errors} name="maxBodyLength" label="Макс. длина текста, символов" hint="Для поста с картинкой и текстом до 4096 символов. Для подписи к фото нужно ≤ 1024.">
                <input type="number" min={300} max={3500} value={form.maxBodyLength} onChange={(e) => set('maxBodyLength', Number(e.target.value))} />
              </Field>
            </div>
            <Field
              errors={errors}
              name="recentTopicsLimit"
              label="Память о прошлых постах, шт."
              hint="Сколько последних заголовков (с датой и первым хэштегом) модель видит, чтобы не повторять темы и чередовать типы постов. 60 при 6 постах в день это 10 дней. 0 отключает."
            >
              <input type="number" min={0} max={300} value={form.recentTopicsLimit} onChange={(e) => set('recentTopicsLimit', Number(e.target.value))} />
            </Field>
          </div>

          <div className="card form">
            <h2>Модель</h2>
            <Field errors={errors} name="model" label="Модель OpenAI" hint="Список подтягивается из вашего аккаунта. Веб-поиск не работает с gpt-4.1-nano и с gpt-5 при minimal reasoning.">
              <input type="text" list="models" value={form.model} onChange={(e) => set('model', e.target.value)} />
              <datalist id="models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <div className="grid-2">
              <Field errors={errors} label="Reasoning effort" hint="Только для gpt-5 / o-серии">
                <select value={form.reasoningEffort} onChange={(e) => set('reasoningEffort', e.target.value as CampaignInput['reasoningEffort'])}>
                  <option value="none">не задавать</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </Field>
              <Field errors={errors} label="Глубина веб-поиска">
                <select value={form.searchContextSize} onChange={(e) => set('searchContextSize', e.target.value as CampaignInput['searchContextSize'])}>
                  <option value="low">low (дешевле)</option>
                  <option value="medium">medium</option>
                  <option value="high">high (дороже)</option>
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={form.webSearch} onChange={(e) => set('webSearch', e.target.checked)} />
              Использовать веб-поиск при генерации
            </label>
          </div>
        </div>

        <div>
          <div className="card form">
            <h2>Расписание</h2>
            <Field errors={errors} name="scheduleTimes" label="Точки запуска (HH:mm через запятую)">
              <input type="text" value={timesText} onChange={(e) => setTimesText(e.target.value)} placeholder="09:00, 12:00, 14:00, 16:00, 18:00, 20:00" />
              <div className="chips" style={{ marginTop: 6 }}>
                {parsedTimes.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            </Field>
            <Field errors={errors} name="timezone" label="Таймзона (IANA)">
              <input type="text" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Europe/Moscow" />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
              Кампания включена
            </label>
          </div>

          <div className="card form">
            <h2>Каналы публикации</h2>
            <Field errors={errors} name="telegramChatId" label="Telegram канал" hint="@username публичного канала или числовой id (-100…). Бот должен быть администратором канала.">
              <input type="text" value={form.telegramChatId ?? ''} onChange={(e) => set('telegramChatId', e.target.value)} placeholder="@my_channel" />
            </Field>
            <Field
              errors={errors}
              name="maxChatId"
              label="Max канал (chat_id)"
              hint={status && !status.max.configured ? 'MAX_BOT_TOKEN не задан: публикация в Max будет пропущена, значение сохранится на будущее.' : 'Числовой chat_id канала в Max.'}
            >
              <input type="text" value={form.maxChatId ?? ''} onChange={(e) => set('maxChatId', e.target.value)} placeholder="123456789" />
            </Field>
          </div>

          <div className="card form">
            <h2>Публикация и картинки</h2>
            <Field errors={errors} label="Режим" hint="Модерация: черновик приходит админу в Telegram и в раздел «На модерации». Авто: публикуется сразу.">
              <select value={form.mode} onChange={(e) => set('mode', e.target.value as CampaignInput['mode'])}>
                <option value="review">Модерация перед публикацией</option>
                <option value="auto">Автопубликация</option>
              </select>
            </Field>
            <Field
              errors={errors}
              label="Откуда брать картинку"
              hint="Фото из статьи-источника публикуется с подписью «Фото: сайт». Если у статьи нет подходящего фото, берётся сток."
            >
              <select value={form.imageSourceMode} onChange={(e) => set('imageSourceMode', e.target.value as CampaignInput['imageSourceMode'])}>
                <option value="model">Решает модель: событие → фото из источника, общая тема → сток</option>
                <option value="article">Всегда сначала из источника, потом сток</option>
                <option value="stock">Только сток</option>
              </select>
            </Field>
            <Field errors={errors} label="Стоковый провайдер" hint={imageProviders.length ? `Настроены: ${imageProviders.join(', ')}` : 'Ключи провайдеров не заданы в .env: стоковых картинок не будет.'}>
              <select value={form.imageProvider} onChange={(e) => set('imageProvider', e.target.value as CampaignInput['imageProvider'])}>
                <option value="auto">Авто (все настроенные по очереди)</option>
                <option value="unsplash">Unsplash</option>
                <option value="pexels">Pexels</option>
                <option value="pixabay">Pixabay</option>
                <option value="none">Без картинок вообще</option>
              </select>
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={form.imageRequired} onChange={(e) => set('imageRequired', e.target.checked)} />
              Картинка обязательна (иначе запуск завершится ошибкой, а не постом без картинки)
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
