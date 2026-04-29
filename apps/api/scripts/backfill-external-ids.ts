// Run from apps/api: bun run scripts/backfill-external-ids.ts
import { eq, isNull } from 'drizzle-orm';
import { db } from '../src/infrastructure/db/client';
import { games, platforms } from '../src/infrastructure/db/schema';

async function backfill(table: typeof games | typeof platforms, label: string) {
  const rows = await db.select({ id: table.id }).from(table).where(isNull(table.externalId));
  console.log(`[${label}] rows missing external_id: ${rows.length}`);
  for (const row of rows) {
    await db.update(table).set({ externalId: crypto.randomUUID() }).where(eq(table.id, row.id));
  }
  console.log(`[${label}] backfilled ${rows.length} rows`);
}

await backfill(games, 'games');
await backfill(platforms, 'platforms');
process.exit(0);
