import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: db:backup <target-path>');
  process.exit(1);
}

const sourcePath = resolve(import.meta.dir, '..', 'data', 'apex.db');
// Read/write open — required for PRAGMA wal_checkpoint(TRUNCATE).
// Caller (scripts/deploy.sh) stops apex-api before invoking, so there is no
// contention for the write lock. Quiesce-safe, NOT concurrent-writer-safe.
const db = new Database(sourcePath);

// Force any non-checkpointed WAL frames into the main DB file BEFORE
// VACUUM INTO. Without this the snapshot could miss the latest commits.
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

// VACUUM INTO produces a defragmented snapshot — single file, no WAL/SHM
// sidecars. ~50ms for a <100MB DB.
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

console.log(`[backup] snapshot written: ${target}`);
