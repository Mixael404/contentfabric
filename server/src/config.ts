import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// src/config.ts and dist/config.js both sit one level below the server package dir.
const serverDir = fileURLToPath(new URL('..', import.meta.url));
export const repoRoot = path.resolve(serverDir, '..');

// Load .env from the current directory first, then server/, then the repository root
// (so `npm run dev` inside server/ and `node server/dist/index.js` from the root both work).
for (const candidate of [path.resolve(process.cwd(), '.env'), path.resolve(serverDir, '.env'), path.resolve(repoRoot, '.env')]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate, quiet: true });
}

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  // Relative paths are resolved against the repository root (where .env lives), not the cwd.
  DATA_DIR: z.string().default('data'),
  LOG_LEVEL: z.string().default('info'),

  ADMIN_USER: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, '') : undefined)),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().optional(),
  DEFAULT_MODEL: z.string().default('gpt-5.1'),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ADMIN_TELEGRAM_CHAT_ID: z.string().optional(),

  MAX_BOT_TOKEN: z.string().optional(),
  MAX_API_BASE_URL: z.string().url().default('https://platform-api2.max.ru'),
  MAX_INSECURE_TLS: bool,

  UNSPLASH_ACCESS_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  PIXABAY_API_KEY: z.string().optional(),

  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().min(5).default(30),
  MISFIRE_GRACE_MINUTES: z.coerce.number().int().min(1).default(30),
  SCHEDULER_DISABLED: bool,
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  maxEnabled: boolean;
  reviewViaTelegram: boolean;
  mediaDir: string;
  dbPath: string;
};

function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  const env = parsed.data;
  const maxToken = env.MAX_BOT_TOKEN?.trim();
  const dataDir = path.resolve(repoRoot, env.DATA_DIR);
  return {
    ...env,
    DATA_DIR: dataDir,
    MAX_BOT_TOKEN: maxToken || undefined,
    maxEnabled: Boolean(maxToken),
    reviewViaTelegram: Boolean(env.ADMIN_TELEGRAM_CHAT_ID?.trim()),
    mediaDir: path.join(dataDir, 'media'),
    dbPath: path.join(dataDir, 'content-fabric.sqlite'),
  };
}

export const config = loadConfig();
