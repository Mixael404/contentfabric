import { z } from 'zod';

export const DraftSchema = z.object({
  title: z.string().describe('Заголовок поста, до 80 символов, без точки в конце и без эмодзи'),
  body: z
    .string()
    .describe(
      'Текст поста в ограниченном Markdown: **жирный**, _курсив_, [текст](url), строки "- " для списков, строки "> " для цитат. Абзацы разделяются пустой строкой. Без заголовков и HTML.',
    ),
  image_strategy: z
    .enum(['source', 'stock'])
    .describe(
      '"source" — пост о конкретном событии или новости, и фото нужно взять со страницы источника; "stock" — тема общая, подойдёт стоковое фото',
    ),
  image_source_url: z
    .string()
    .nullable()
    .describe('При image_strategy="source": точный URL статьи из sources, с которой брать фото. Иначе null'),
  image_query: z.string().describe('2-5 английских слов для поиска стокового фото: конкретная визуальная сцена. Заполняется всегда как запасной вариант'),
  image_alt: z.string().describe('Одно предложение о том, что изображено на картинке'),
  sources: z
    .array(
      z.object({
        title: z.string().describe('Короткое название источника'),
        url: z.string().describe('Точный URL источника'),
      }),
    )
    .describe('Реально использованные источники'),
  hashtags: z.array(z.string()).describe('2-4 хэштега в формате #слово'),
});

export type Draft = z.infer<typeof DraftSchema>;
