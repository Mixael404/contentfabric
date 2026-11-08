import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ReasoningEffort } from 'openai/resources/shared';
import type { Tool } from 'openai/resources/responses/responses';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { DraftSchema, type Draft } from './schema.js';

export const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL });

export type EffortSetting = 'none' | 'low' | 'medium' | 'high';

export function supportsReasoning(model: string): boolean {
  return /^(gpt-[5-9]|o\d)/i.test(model);
}

export interface GenerateParams {
  model: string;
  reasoningEffort: EffortSetting;
  webSearch: boolean;
  searchContextSize: 'low' | 'medium' | 'high';
  instructions: string;
  input: string;
}

export interface Citation {
  title: string;
  url: string;
}

export interface GenerateResult {
  draft: Draft;
  citations: Citation[];
  usage: unknown;
  responseId: string;
  searchCalls: number;
}

function reasoningParam(model: string, effort: EffortSetting) {
  if (!supportsReasoning(model) || effort === 'none') return undefined;
  return { effort: effort as ReasoningEffort };
}

export async function generateDraft(p: GenerateParams): Promise<GenerateResult> {
  const tools: Tool[] = p.webSearch ? [{ type: 'web_search', search_context_size: p.searchContextSize }] : [];
  const reasoning = reasoningParam(p.model, p.reasoningEffort);

  const response = await client.responses.parse({
    model: p.model,
    instructions: p.instructions,
    input: p.input,
    tools,
    ...(reasoning ? { reasoning } : {}),
    text: { format: zodTextFormat(DraftSchema, 'post_draft') },
  });

  const draft = response.output_parsed;
  if (!draft) {
    const refusal = response.output
      .filter((o) => o.type === 'message')
      .flatMap((m) => m.content)
      .find((c) => c.type === 'refusal');
    throw new Error(refusal && refusal.type === 'refusal' ? `Модель отказалась: ${refusal.refusal}` : 'Модель не вернула структурированный ответ');
  }

  const citations: Citation[] = [];
  let searchCalls = 0;
  for (const item of response.output) {
    if (item.type === 'web_search_call') searchCalls += 1;
    if (item.type !== 'message') continue;
    for (const c of item.content) {
      if (c.type !== 'output_text') continue;
      for (const a of c.annotations) {
        if (a.type === 'url_citation') citations.push({ title: a.title, url: a.url });
      }
    }
  }

  logger.debug({ model: p.model, responseId: response.id, searchCalls, usage: response.usage }, 'draft generated');
  return { draft, citations, usage: response.usage, responseId: response.id, searchCalls };
}

export async function shortenDraft(model: string, draft: Draft, maxBodyLength: number): Promise<Draft> {
  const response = await client.responses.parse({
    model,
    instructions: `Ты редактор. Сократи поле body поста до ${maxBodyLength} символов, сохранив смысл, структуру абзацев, разрешённую разметку и стиль. Остальные поля верни без изменений. Отвечай строго по схеме.`,
    input: JSON.stringify(draft),
    ...(supportsReasoning(model) ? { reasoning: { effort: 'low' as ReasoningEffort } } : {}),
    text: { format: zodTextFormat(DraftSchema, 'post_draft') },
  });
  if (!response.output_parsed) throw new Error('Не удалось сократить пост');
  return response.output_parsed;
}

const FALLBACK_MODELS = ['gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'];
const MODEL_FILTER = /^(gpt-(4\.1|4o|[5-9])|o\d)/;
const MODEL_EXCLUDE = /(realtime|audio|transcribe|tts|image|embedding|moderation|search-preview|codex|instruct|chat-latest|-\d{4}-\d{2}-\d{2}$|gpt-4\.1-nano)/;

let modelsCache: { at: number; list: string[] } | null = null;

export async function listModels(): Promise<string[]> {
  if (modelsCache && Date.now() - modelsCache.at < 10 * 60_000) return modelsCache.list;
  try {
    const ids: string[] = [];
    for await (const m of client.models.list()) {
      if (MODEL_FILTER.test(m.id) && !MODEL_EXCLUDE.test(m.id)) ids.push(m.id);
    }
    const list = ids.sort().reverse();
    modelsCache = { at: Date.now(), list: list.length ? list : FALLBACK_MODELS };
  } catch (err) {
    logger.warn({ err }, 'failed to list OpenAI models, using fallback list');
    modelsCache = { at: Date.now(), list: FALLBACK_MODELS };
  }
  return modelsCache.list;
}
