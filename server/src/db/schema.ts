import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(),
  /** 'none' | 'low' | 'medium' | 'high' */
  reasoningEffort: text('reasoning_effort').notNull().default('low'),
  webSearch: integer('web_search', { mode: 'boolean' }).notNull().default(true),
  /** 'low' | 'medium' | 'high' */
  searchContextSize: text('search_context_size').notNull().default('medium'),
  /** JSON array of "HH:mm" */
  scheduleTimes: text('schedule_times').notNull().default('[]'),
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  language: text('language').notNull().default('ru'),
  telegramChatId: text('telegram_chat_id'),
  maxChatId: text('max_chat_id'),
  /** 'auto' | 'review' */
  mode: text('mode').notNull().default('review'),
  /** Stock provider: 'auto' | 'unsplash' | 'pexels' | 'pixabay' | 'none' (none = no images at all) */
  imageProvider: text('image_provider').notNull().default('auto'),
  /** Where the picture comes from: 'model' (model decides per post) | 'stock' | 'article' (source first, stock fallback) */
  imageSourceMode: text('image_source_mode').notNull().default('model'),
  imageRequired: integer('image_required', { mode: 'boolean' }).notNull().default(false),
  maxBodyLength: integer('max_body_length').notNull().default(2500),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull(),
    /** 'schedule' | 'manual' | 'regenerate' */
    trigger: text('trigger').notNull(),
    scheduledAt: text('scheduled_at').notNull(),
    /** campaignId|YYYY-MM-DD|HH:mm for scheduled runs, null otherwise */
    slotKey: text('slot_key'),
    /** 'pending' | 'running' | 'awaiting_review' | 'publishing' | 'published' | 'failed' | 'skipped' */
    status: text('status').notNull().default('pending'),
    stage: text('stage'),
    forceReview: integer('force_review', { mode: 'boolean' }).notNull().default(false),
    error: text('error'),
    /** JSON array of log entries */
    log: text('log').notNull().default('[]'),
    postId: text('post_id'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('runs_slot_key_idx').on(t.slotKey),
    index('runs_campaign_idx').on(t.campaignId, t.createdAt),
    index('runs_status_idx').on(t.status),
  ],
);

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    campaignId: text('campaign_id').notNull(),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    imageQuery: text('image_query'),
    imageAlt: text('image_alt'),
    /** JSON array of {title,url} */
    sources: text('sources').notNull().default('[]'),
    /** JSON array of strings */
    hashtags: text('hashtags').notNull().default('[]'),
    /** Raw model output JSON */
    draftJson: text('draft_json').notNull(),
    model: text('model').notNull(),
    /** JSON usage object */
    usage: text('usage'),
    mediaId: text('media_id'),
    telegramHtml: text('telegram_html').notNull(),
    /** 'photo_caption' | 'text_preview' | 'text_only' */
    telegramMode: text('telegram_mode').notNull(),
    maxHtml: text('max_html').notNull(),
    plainText: text('plain_text').notNull(),
    /** 'draft' | 'awaiting_review' | 'approved' | 'published' | 'discarded' | 'failed' */
    status: text('status').notNull().default('draft'),
    reviewMessageId: text('review_message_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('posts_campaign_idx').on(t.campaignId, t.createdAt), index('posts_status_idx').on(t.status)],
);

export const publications = sqliteTable(
  'publications',
  {
    id: text('id').primaryKey(),
    postId: text('post_id').notNull(),
    runId: text('run_id').notNull(),
    campaignId: text('campaign_id').notNull(),
    /** 'telegram' | 'max' */
    channel: text('channel').notNull(),
    target: text('target').notNull(),
    /** 'pending' | 'sent' | 'failed' */
    status: text('status').notNull().default('pending'),
    externalMessageId: text('external_message_id'),
    error: text('error'),
    sentAt: text('sent_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('publications_post_idx').on(t.postId)],
);

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id'),
    provider: text('provider').notNull(),
    providerId: text('provider_id').notNull(),
    sourceUrl: text('source_url').notNull(),
    hotlinkUrl: text('hotlink_url'),
    pageUrl: text('page_url'),
    author: text('author'),
    authorUrl: text('author_url'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    mimeType: text('mime_type').notNull(),
    bytes: integer('bytes').notNull(),
    /** path relative to DATA_DIR/media */
    fileName: text('file_name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('media_campaign_idx').on(t.campaignId, t.createdAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Publication = typeof publications.$inferSelect;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
