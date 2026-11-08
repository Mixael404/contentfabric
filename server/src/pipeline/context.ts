import { recentPublishedTitles } from '../db/repo.js';
import type { Campaign } from '../db/schema.js';
import { renderStyleGuide } from '../content/style-guide.js';
import { todayHuman } from '../utils/time.js';

export function buildInstructions(campaign: Campaign): string {
  const date = todayHuman(campaign.timezone, campaign.language.startsWith('ru') ? 'ru' : 'en');
  const guide = renderStyleGuide({ date, language: campaign.language, maxBodyLength: campaign.maxBodyLength });
  const recent = recentPublishedTitles(campaign.id, 15);
  const recentBlock = recent.length
    ? `\n\n## Уже опубликованные темы (не повторяй их)\n${recent.map((t) => `- ${t}`).join('\n')}`
    : '';
  return `${campaign.systemPrompt.trim()}\n\n${guide}${recentBlock}`;
}

export function buildInput(campaign: Campaign): string {
  const date = todayHuman(campaign.timezone, campaign.language.startsWith('ru') ? 'ru' : 'en');
  return (
    `Сегодня ${date}. Подготовь один новый пост для канала по теме кампании «${campaign.name}». ` +
    (campaign.webSearch
      ? 'Сначала найди через веб-поиск актуальную информацию и 2–4 надёжных источника, затем напиши пост строго по схеме.'
      : 'Напиши пост строго по схеме.')
  );
}
