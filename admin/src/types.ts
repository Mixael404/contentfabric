export type RunStatus = 'pending' | 'running' | 'awaiting_review' | 'publishing' | 'published' | 'failed' | 'skipped';
export type PostStatus = 'draft' | 'awaiting_review' | 'approved' | 'published' | 'discarded' | 'failed';

export interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  systemPrompt: string;
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  webSearch: boolean;
  searchContextSize: 'low' | 'medium' | 'high';
  scheduleTimes: string[];
  timezone: string;
  language: string;
  telegramChatId: string | null;
  maxChatId: string | null;
  mode: 'auto' | 'review';
  imageProvider: 'auto' | 'unsplash' | 'pexels' | 'pixabay' | 'none';
  imageSourceMode: 'model' | 'stock' | 'article';
  imageRequired: boolean;
  maxBodyLength: number;
  recentTopicsLimit: number;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string | null;
  lastRun: { id: string; status: RunStatus; stage: string | null; createdAt: string; error: string | null } | null;
}

export type CampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt' | 'lastRun'>;

export interface RunSummary {
  id: string;
  campaignId: string;
  campaignName: string;
  trigger: 'schedule' | 'manual' | 'regenerate';
  scheduledAt: string;
  status: RunStatus;
  stage: string | null;
  forceReview: boolean;
  error: string | null;
  postId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface LogEntry {
  t: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
  data?: unknown;
}

export interface Publication {
  id: string;
  channel: 'telegram' | 'max';
  target: string;
  status: 'pending' | 'sent' | 'failed';
  externalMessageId: string | null;
  error: string | null;
  sentAt: string | null;
}

export interface Media {
  id: string;
  provider: string;
  providerId: string;
  pageUrl: string | null;
  author: string | null;
  authorUrl: string | null;
  width: number;
  height: number;
  url: string;
  publicUrl: string | null;
}

export interface Post {
  id: string;
  runId: string;
  campaignId: string;
  campaignName?: string;
  title: string;
  bodyMarkdown: string;
  imageQuery: string | null;
  imageAlt: string | null;
  sources: { title: string; url: string }[];
  hashtags: string[];
  draft: Record<string, unknown>;
  model: string;
  usage: Record<string, unknown> | null;
  mediaId: string | null;
  telegramHtml: string;
  telegramMode: 'photo_caption' | 'text_preview' | 'text_only';
  maxHtml: string;
  plainText: string;
  status: PostStatus;
  createdAt: string;
  media: Media | null;
  publications: Publication[];
}

export interface RunDetail extends Omit<RunSummary, 'campaignName'> {
  log: LogEntry[];
  campaign: { id: string; name: string; timezone: string; mode: 'auto' | 'review' } | null;
  post: Post | null;
}

export interface MaxChat {
  chatId: string;
  title: string | null;
  type: 'channel' | 'chat' | 'dialog';
  link: string | null;
  status: 'active' | 'removed';
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Status {
  version: string;
  telegram: { configured: boolean; botUsername: string | null };
  max: { configured: boolean; insecureTls: boolean; running: boolean; botName: string | null; knownChats: number };
  review: { viaTelegram: boolean; adminChatId: string | null };
  imageProviders: string[];
  publicBaseUrl: string | null;
  defaultModel: string;
  scheduler: { enabled: boolean; lastTickAt: string | null; tickSeconds: number; graceMinutes: number };
  queue: { concurrency: number; pending: number; waiting: number; activeCampaigns: string[] };
  runs: Record<string, number>;
}
