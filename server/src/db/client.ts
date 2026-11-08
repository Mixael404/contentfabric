import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.mkdirSync(config.mediaDir, { recursive: true });

const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;

export function runMigrations(): void {
  const migrationsFolder = path.resolve(fileURLToPath(new URL('../../drizzle', import.meta.url)));
  migrate(db, { migrationsFolder });
  logger.info({ dbPath: config.dbPath }, 'database migrated');
}

export { schema };
