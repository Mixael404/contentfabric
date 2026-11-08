import { z } from 'zod';
import { isValidTimezone, parseScheduleTimes } from '../utils/time.js';

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const CampaignInput = z
  .object({
    name: z.string().trim().min(1, 'Укажите название').max(200),
    enabled: z.boolean().default(true),
    systemPrompt: z.string().trim().min(1, 'Укажите системный промпт'),
    model: z.string().trim().min(1, 'Укажите модель'),
    reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).default('low'),
    webSearch: z.boolean().default(true),
    searchContextSize: z.enum(['low', 'medium', 'high']).default('medium'),
    scheduleTimes: z.union([z.array(z.string()), z.string()]).default([]),
    timezone: z.string().trim().default('Europe/Moscow'),
    language: z.string().trim().min(2).max(32).default('ru'),
    telegramChatId: optionalText,
    maxChatId: optionalText,
    mode: z.enum(['auto', 'review']).default('review'),
    imageProvider: z.enum(['auto', 'unsplash', 'pexels', 'pixabay', 'none']).default('auto'),
    imageSourceMode: z.enum(['model', 'stock', 'article']).default('model'),
    imageRequired: z.boolean().default(false),
    maxBodyLength: z.number().int().min(300).max(3500).default(2500),
  })
  .superRefine((v, ctx) => {
    if (!isValidTimezone(v.timezone)) ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Неизвестная таймзона (IANA, например Europe/Moscow)' });
    try {
      parseScheduleTimes(v.scheduleTimes);
    } catch (err) {
      ctx.addIssue({ code: 'custom', path: ['scheduleTimes'], message: err instanceof Error ? err.message : 'Некорректное расписание' });
    }
    if (v.enabled && !v.telegramChatId && !v.maxChatId) {
      ctx.addIssue({ code: 'custom', path: ['telegramChatId'], message: 'Для включённой кампании укажите хотя бы один канал' });
    }
  });

export type CampaignInputT = z.infer<typeof CampaignInput>;

export const RunNowInput = z.object({
  forceReview: z.boolean().default(false),
});

export const StyleGuideInput = z.object({
  text: z.string().min(1),
});

export function formatZodError(err: z.ZodError): { message: string; issues: { path: string; message: string }[] } {
  const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return { message: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; '), issues };
}
