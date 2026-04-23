import Database from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../../data');
const DB_PATH = resolve(DB_DIR, 'apex.db');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

let sqlite: Database;

function initDb(dbPath: string) {
  sqlite = new Database(dbPath);
  const check = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='games'")
    .get();
  if (!check) {
    sqlite.exec(`
      CREATE TABLE games (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        title TEXT NOT NULL,
        developer TEXT NOT NULL,
        genre TEXT NOT NULL,
        release_year INTEGER NOT NULL,
        platform TEXT NOT NULL,
        edition TEXT,
        hours_played INTEGER DEFAULT 0 NOT NULL,
        status TEXT DEFAULT 'Backlog' NOT NULL,
        created_at INTEGER
      )
    `);
  }
}

if (!existsSync(DB_PATH)) {
  initDb(DB_PATH);
} else {
  sqlite = new Database(DB_PATH);
}

sqlite!.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle({ client: sqlite! });

export { sqlite };
