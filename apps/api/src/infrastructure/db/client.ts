import Database from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../../../data');
const DB_PATH = resolve(DB_DIR, 'apex.db');
const MIGRATIONS_DIR = resolve(__dirname, '../../../drizzle');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle({ client: sqlite });

const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (!g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}

export { sqlite };
