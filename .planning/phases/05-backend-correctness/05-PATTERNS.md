# Phase 5: Backend Correctness — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 8 (4 new + 4 modified) + 1 docs file
**Analogs found:** 8 / 8 (every target maps to an in-repo precedent)

---

## File Classification

| Target File | New / Mod | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|---|
| `scripts/deploy.sh` | NEW | deploy script | batch | `.github/workflows/deploy.yml` (caller); none in-repo for the bash itself | role-match (caller only) |
| `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` | NEW | infrastructure test | request-response (insert + readback) | `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-86` | exact (harness reuse) |
| `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` | NEW | integration test | CRUD batch | `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-86` (in-memory harness) | exact |
| `apps/api/src/__tests__/wiring.test.ts` | NEW | composition smoke test | request-response (Hono `app.request`) | `apps/api/src/routes/games.test.ts:13-23, 142-157` (test app harness) | exact |
| `apps/api/src/infrastructure/db/client.ts` | MOD | infrastructure config | boot-time side-effect | self (lines 24-28) | self |
| `apps/api/src/infrastructure/db/schema.ts` | MOD | schema + helper | transform (domain → row) | self (`games` table + `NewGameRow` at lines 11-54); existing helpers `make-drizzle-dictionary-repository.ts` | exact |
| `apps/api/src/infrastructure/games/drizzle-game-repository.ts` | MOD | repository | CRUD | self (lines 162-191 `create()`) | self |
| `apps/api/src/infrastructure/import/drizzle-import-repository.ts` | MOD | repository | batch / CRUD | self (lines 13-67 `applyMerge`, 68-109 `applyReplace`); `drizzle-game-repository.ts:1, 85-88` for `inArray` import pattern | exact |
| `apps/api/src/routes/games.test.ts` | MOD | route test | request-response | self (`describe('GET /api/games/metadata/candidates — auth coverage')` at lines 142-157) | exact |
| `.planning/codebase/CONCERNS.md` | MOD | docs | n/a | self (lines 12-21, 77-85, 99-108, 120-122, 162-164) | self |

**Note on `IgdbChainHolder.swap(null)`:** the API already exists at `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:71-83` — Phase 5 does **not** need to add it. The `null` branch resets the breaker and clears the chain. No source-file change required for BE-06 wiring.

---

## Pattern Assignments

### 1. `scripts/deploy.sh` (NEW — bash deploy script)

**Closest analog:** `.github/workflows/deploy.yml` — defines the contract this script must satisfy. The repo has **no existing bash scripts**, so we follow the bash idioms baked into Bun's published examples and project's general "explicit, step-by-step logs" brand.

**Caller contract** — `.github/workflows/deploy.yml:1-17` (verbatim, unchanged in Phase 5):
```yaml
name: Deploy to VPS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_SSH_PORT }}
          script: /root/apex/scripts/deploy.sh
```

**Existing `db:migrate` script** — `apps/api/package.json:11`:
```json
"db:migrate": "drizzle-kit migrate"
```

**Concrete shape to write** (from RESEARCH.md Pattern 4 + D-01, D-04 + Open Q #5):
```bash
#!/usr/bin/env bash
set -euo pipefail

# Versioned deploy. The unversioned /root/apex/scripts/deploy.sh on the VPS
# is a thin wrapper that `git pull`s and then `exec bash scripts/deploy.sh`.
# This file assumes the working tree is already up-to-date.

echo "▶ Installing dependencies (frozen lockfile)..."
bun install --frozen-lockfile   # NOT --production: drizzle-kit is devDep

echo "▶ Running database migrations..."
bun run --filter=@apex/api db:migrate

echo "▶ Restarting API service..."
sudo systemctl restart apex-api   # or pm2 restart apex-api — confirm with user

echo "✓ Deploy complete."
```

**Adaptation notes:**
- `set -euo pipefail` — any step failing aborts BEFORE the restart line (D-04). The `db:migrate` failing means the old process keeps running on old code + old DB schema.
- **Use `--frozen-lockfile`, NOT `--production`** (RESEARCH Open Q #5): `drizzle-kit` is a devDep, and `--production` would strip it, breaking the migrate step.
- `bun run --filter=@apex/api db:migrate` chdirs into `apps/api` before invoking `drizzle-kit migrate` (Pitfall 2). Do **not** call `drizzle-kit migrate` from repo root.
- Restart mechanism is **Claude's Discretion #1** — confirm `systemctl` vs `pm2` with user during planning.
- File mode after creation: `chmod +x scripts/deploy.sh` (git tracks the executable bit).
- **No imports** — this is bash.

---

### 2. `apps/api/src/infrastructure/db/client.ts` (MOD — NODE_ENV gate)

**Closest analog:** self. The diff is one line.

**Current code** — `apps/api/src/infrastructure/db/client.ts:19-30`:
```typescript
const sqlite = new Database(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });

const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (!g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}

export { sqlite };
```

**Target shape** (D-03):
```typescript
const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (process.env.NODE_ENV !== 'production' && !g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}
```

**Adaptation notes:**
- Keep the `__apexDbMigrated` flag (Anti-Pattern: removing it breaks `bun --hot`).
- Use raw `process.env.NODE_ENV` (D-03 explicitly accepts this; do not refactor to extend `infrastructure/config/env.ts`).
- Verify the VPS systemd unit sets `Environment=NODE_ENV=production` (Open Q #6, RESEARCH Assumption A2). Planner adds an explicit `export NODE_ENV=production` to `scripts/deploy.sh` as belt-and-suspenders.
- No new imports.

---

### 3. `apps/api/src/infrastructure/db/schema.ts` (MOD — add `GameRowInput` + `toGameInsertRow` + block comment)

**Closest analog:** self. The `games` table definition and `NewGameRow` type are already exported here. The helper is appended directly after the table.

**Existing table + insert type** — `apps/api/src/infrastructure/db/schema.ts:11-54`:
```typescript
export const games = sqliteTable(
  'games',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('owned'),
    title: text('title').notNull(),
    developer: text('developer'),
    genre: text('genre').notNull(),
    releaseYear: integer('release_year'),
    platform: text('platform').notNull(),
    edition: text('edition'),
    hoursPlayed: integer('hours_played'),
    status: text('status'),
    format: text('format').notNull().default('digital'),
    coverColor: text('cover_color'),
    coverImage: text('cover_image'),
    price: integer('price'),
    purchasedAt: text('purchased_at'),
    notes: text('notes'),
    metadataProvider: text('metadata_provider'),
    metadataProviderId: text('metadata_provider_id'),
    metadataMatchedAt: text('metadata_matched_at'),
    externalId: text('external_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index('games_user_id_idx').on(table.userId),
    uniqueIndex('games_user_id_external_id_unq').on(table.userId, table.externalId),
    index('games_user_kind_idx').on(table.userId, table.kind),
    index('games_user_kind_platform_idx').on(table.userId, table.kind, table.platform),
    index('games_user_kind_format_idx').on(table.userId, table.kind, table.format),
    index('games_user_kind_releaseyear_idx').on(table.userId, table.kind, table.releaseYear),
    index('games_user_kind_title_idx').on(table.userId, table.kind, table.title),
  ],
);

export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;
```

**Companion TSDoc style** — `schema.ts:159-170` (idempotencyKeys block comment is the precedent for table-level prose):
```typescript
/**
 * Idempotency-Key cache for mutating endpoints (RFC: Idempotency-Key header).
 *
 * Composite PRIMARY KEY (key, user_id) scopes uniqueness per-user so two
 * different accounts can independently reuse the same client-generated key
 * without colliding. Only 2xx responses are stored — 5xx must remain
 * retryable. `request_hash` lets us detect "same key, different body" and
 * answer with a 409 conflict per Stripe's convention.
 * ...
 */
```

**Target additions** (D-06, D-07, D-09, D-17 — paste **after** line 54):

```typescript
/**
 * Sort-cost note (BE-04, Phase 5).
 *
 * Apex is single-user, expected ≤5k rows per user. Sorting by
 * `hoursPlayed`, `genre`, or `status` performs an in-memory sort after a
 * filtered scan (no covering index). Measured at ~10ms on local WAL DB
 * with 5k rows — acceptable while the model continues to evolve.
 * Adding indices is deferred until the schema stabilises; premature
 * indices on fields likely to be reshaped cost a migrate-add + migrate-drop
 * round trip with no user benefit. See feedback_no_premature_indices.
 *
 * Already indexed: title, platform, format, releaseYear (each scoped by
 * (user_id, kind, ...)).
 */
// Block comment lands directly above `export const games = sqliteTable(...)`.

/**
 * Shape consumed by `toGameInsertRow`. Optional fields map to NULL columns.
 * Discriminated by `kind` so the union mirrors the domain split between
 * 'owned' and 'wishlist'. New columns added here MUST also be wired into
 * `toGameInsertRow` — that's the single edit point three INSERT call-sites
 * pivot on (D-06, D-08).
 */
export type GameRowInput = {
  kind: 'owned' | 'wishlist';
  externalId: string;
  title: string;
  genre: string;
  platform: string;
  format: string;
  developer?: string | null;
  releaseYear?: { value: number } | number | null;
  edition?: string | null;
  hoursPlayed?: { value: number } | number | null;
  status?: string | null;
  coverColor?: string | null;
  coverImage?: string | null;
  price?: { value: number } | number | null;
  purchasedAt?: { value: string } | string | null;
  notes?: string | null;
  metadataRef?: { providerName: string; providerId: string; matchedAt: Date } | null;
};

export function toGameInsertRow(userId: string, input: GameRowInput): NewGameRow {
  const unwrap = <T>(v: { value: T } | T | null | undefined): T | null => {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in (v as object)) return (v as { value: T }).value;
    return v as T;
  };
  return {
    userId,
    externalId: input.externalId,
    kind: input.kind,
    title: input.title,
    developer: input.developer ?? null,
    genre: input.genre,
    releaseYear: unwrap(input.releaseYear),
    platform: input.platform,
    edition: input.edition ?? null,
    hoursPlayed: unwrap(input.hoursPlayed),
    status: input.status ?? null,
    format: input.format,
    coverColor: input.coverColor ?? null,
    coverImage: input.coverImage ?? null,
    price: unwrap(input.price),
    purchasedAt: unwrap(input.purchasedAt),
    notes: input.notes ?? null,
    metadataProvider: input.metadataRef?.providerName ?? null,
    metadataProviderId: input.metadataRef?.providerId ?? null,
    metadataMatchedAt: input.metadataRef?.matchedAt.toISOString() ?? null,
  };
}
```

**Adaptation notes:**
- Block comment lives **above** `export const games = sqliteTable(...)` at line 11 (BE-04 D-17).
- `GameRowInput` is **single-shape**, not a discriminated union of two separate object types — RESEARCH Pattern 1 originally proposed `kind: 'owned' | { kind: 'wishlist'; ... }` but since both shapes carry the same fields, a single object with `kind: 'owned' | 'wishlist'` is simpler. Acceptance grep (`rg "kind: \w+\.kind"` returns 1) is satisfied either way.
- **Imports needed:** none new — `NewGameRow` already declared at line 54.
- Conform to Biome formatting: 2-space indent, single quotes, trailing commas, line width 100.

---

### 4. `apps/api/src/infrastructure/games/drizzle-game-repository.ts` (MOD — `create()` uses helper)

**Closest analog:** self.

**Current code** — `apps/api/src/infrastructure/games/drizzle-game-repository.ts:162-191`:
```typescript
async create(newGame: NewGame): Promise<Game> {
  const metadataRef = newGame.metadataRef;
  const [inserted] = await this.db
    .insert(gamesTable)
    .values({
      externalId: newGame.externalId,
      kind: newGame.kind,
      userId: newGame.userId,
      title: newGame.title,
      developer: newGame.developer ?? null,
      genre: newGame.genre,
      releaseYear: newGame.releaseYear?.value ?? null,
      platform: newGame.platform,
      edition: newGame.edition ?? null,
      hoursPlayed: newGame.hoursPlayed?.value ?? null,
      status: newGame.status ?? null,
      format: newGame.format,
      coverColor: newGame.coverColor ?? null,
      coverImage: newGame.coverImage ?? null,
      price: newGame.price?.value ?? null,
      purchasedAt: newGame.purchasedAt?.value ?? null,
      notes: newGame.notes ?? null,
      metadataProvider: metadataRef?.providerName ?? null,
      metadataProviderId: metadataRef?.providerId ?? null,
      metadataMatchedAt: metadataRef?.matchedAt.toISOString() ?? null,
    })
    .returning();

  return this.mapRowToGame(inserted);
}
```

**Target shape** (D-08):
```typescript
async create(newGame: NewGame): Promise<Game> {
  const [inserted] = await this.db
    .insert(gamesTable)
    .values(
      toGameInsertRow(newGame.userId, {
        kind: newGame.kind,
        externalId: newGame.externalId,
        title: newGame.title,
        developer: newGame.developer,
        genre: newGame.genre,
        releaseYear: newGame.releaseYear,
        platform: newGame.platform,
        edition: newGame.edition,
        hoursPlayed: newGame.hoursPlayed,
        status: newGame.status,
        format: newGame.format,
        coverColor: newGame.coverColor,
        coverImage: newGame.coverImage,
        price: newGame.price,
        purchasedAt: newGame.purchasedAt,
        notes: newGame.notes,
        metadataRef: newGame.metadataRef
          ? {
              providerName: newGame.metadataRef.providerName,
              providerId: newGame.metadataRef.providerId,
              matchedAt: newGame.metadataRef.matchedAt,
            }
          : null,
      }),
    )
    .returning();

  return this.mapRowToGame(inserted);
}
```

**Adaptation notes:**
- `NewGame`'s VO getters (`releaseYear`, `hoursPlayed`, `price`, `purchasedAt`) return `ReleaseYear | null`, `HoursPlayed | null`, etc. The helper's `unwrap` handles `{ value }` objects, primitives, and null.
- `ExternalMetadataRef` instance has `providerName`, `providerId`, `matchedAt` getters — confirmed via `apps/api/src/domain/games/new-game.ts:55-66`.
- **Imports to add:** add `toGameInsertRow` to the existing `from '../db/schema'` line — current import (line 18-19):
  ```typescript
  import type { GameRow } from '../db/schema';
  import { games as gamesTable } from '../db/schema';
  ```
  becomes:
  ```typescript
  import type { GameRow } from '../db/schema';
  import { games as gamesTable, toGameInsertRow } from '../db/schema';
  ```
- **Do NOT touch** `update()` (lines 193-229) or `saveMetadata()` (lines 231-259) — D-10 keeps them out of scope.

---

### 5. `apps/api/src/infrastructure/import/drizzle-import-repository.ts` (MOD — batch SELECT + helper)

**Closest analog:** self for the call-site shape; `drizzle-game-repository.ts:1, 85-88` for `inArray` usage pattern.

**Current code** — `drizzle-import-repository.ts:1-67` (`applyMerge`) and `:68-109` (`applyReplace`):
```typescript
import { and, eq, sql } from 'drizzle-orm';
import type { ImportMode, ImportReport } from '@apex/shared';
import type { ImportPlan, ImportRepository } from '../../domain/import/import-repository';
import { db } from '../db/client';
import { games as gamesTable, platforms as platformsTable } from '../db/schema';

// ... applyMerge — per-platform SELECT (lines 17-21) and per-game SELECT (lines 33-37):
const [existing] = await tx
  .select()
  .from(platformsTable)
  .where(and(eq(platformsTable.userId, userId), eq(platformsTable.externalId, np.externalId)))
  .limit(1);
// ... and similarly for games — N+1 reads.
```

**`inArray` precedent** — `drizzle-game-repository.ts:1` and `:85-88`:
```typescript
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
// ...
const platformFilter =
  platforms && platforms.length > 0 ? inArray(gamesTable.platform, platforms) : undefined;
const formatFilter =
  formats && formats.length > 0 ? inArray(gamesTable.format, formats) : undefined;
```

**Target shape for `applyMerge`** (D-11, D-12, plus Pitfall 1 empty-array guard):
```typescript
import { and, eq, inArray, sql } from 'drizzle-orm';
// ... other imports unchanged ...
import { games as gamesTable, platforms as platformsTable, toGameInsertRow } from '../db/schema';

private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
  return db.transaction(async (tx) => {
    // ── Platforms: batched read ──────────────────────────────────────────
    const platformExternalIds = plan.platforms.map((p) => p.externalId);
    const existingPlatforms =
      platformExternalIds.length === 0
        ? []
        : await tx
            .select()
            .from(platformsTable)
            .where(
              and(
                eq(platformsTable.userId, userId),
                inArray(platformsTable.externalId, platformExternalIds),
              ),
            );
    const platformByExternalId = new Map(existingPlatforms.map((row) => [row.externalId, row]));

    let pCreated = 0;
    let pUpdated = 0;
    for (const np of plan.platforms) {
      const existing = platformByExternalId.get(np.externalId);
      if (!existing) {
        await tx
          .insert(platformsTable)
          .values({ userId, externalId: np.externalId, name: np.name });
        pCreated++;
      } else if (existing.name !== np.name) {
        await tx
          .update(platformsTable)
          .set({ name: np.name })
          .where(eq(platformsTable.id, existing.id));
        pUpdated++;
      }
    }

    // ── Games: batched read ──────────────────────────────────────────────
    const gameExternalIds = plan.games.map((g) => g.externalId);
    const existingGames =
      gameExternalIds.length === 0
        ? []
        : await tx
            .select()
            .from(gamesTable)
            .where(
              and(
                eq(gamesTable.userId, userId),
                inArray(gamesTable.externalId, gameExternalIds),
              ),
            );
    const gameByExternalId = new Map(existingGames.map((row) => [row.externalId, row]));

    let gCreated = 0;
    let gUpdated = 0;
    for (const ng of plan.games) {
      const existing = gameByExternalId.get(ng.externalId);
      const row = toGameInsertRow(userId, {
        kind: ng.kind,
        externalId: ng.externalId,
        title: ng.title,
        developer: ng.developer,
        genre: ng.genre,
        releaseYear: ng.releaseYear,
        platform: ng.platform,
        edition: ng.edition,
        hoursPlayed: ng.hoursPlayed,
        status: ng.status,
        format: ng.format,
        coverColor: ng.coverColor,
        // coverImage/price/purchasedAt/notes/metadataRef omitted — D-09:
        // import row does not carry these; helper defaults them to null.
      });
      if (!existing) {
        await tx.insert(gamesTable).values(row);
        gCreated++;
      } else {
        // UPDATE shape excludes userId/externalId/kind/createdAt — strip
        // before .set(). Same row shape, narrower update surface.
        const { userId: _u, externalId: _e, kind: _k, ...updateSet } = row;
        await tx.update(gamesTable).set(updateSet).where(eq(gamesTable.id, existing.id));
        gUpdated++;
      }
    }

    return {
      mode: 'merge',
      platforms: { created: pCreated, updated: pUpdated },
      games: { created: gCreated, updated: gUpdated },
    };
  });
}
```

**Target shape for `applyReplace`** (D-08 — uses helper; D-14 — no batch SELECT change):
```typescript
private async applyReplace(userId: string, plan: ImportPlan): Promise<ImportReport> {
  return db.transaction(async (tx) => {
    const [{ count: gDel = 0 } = {}] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(gamesTable)
      .where(eq(gamesTable.userId, userId));
    const [{ count: pDel = 0 } = {}] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(platformsTable)
      .where(eq(platformsTable.userId, userId));

    await tx.delete(gamesTable).where(eq(gamesTable.userId, userId));
    await tx.delete(platformsTable).where(eq(platformsTable.userId, userId));

    for (const np of plan.platforms) {
      await tx
        .insert(platformsTable)
        .values({ userId, externalId: np.externalId, name: np.name });
    }
    for (const ng of plan.games) {
      await tx.insert(gamesTable).values(
        toGameInsertRow(userId, {
          kind: ng.kind,
          externalId: ng.externalId,
          title: ng.title,
          developer: ng.developer,
          genre: ng.genre,
          releaseYear: ng.releaseYear,
          platform: ng.platform,
          edition: ng.edition,
          hoursPlayed: ng.hoursPlayed,
          status: ng.status,
          format: ng.format,
          coverColor: ng.coverColor,
        }),
      );
    }

    return {
      mode: 'replace',
      platforms: { created: plan.platforms.length, updated: 0, deleted: pDel },
      games: { created: plan.games.length, updated: 0, deleted: gDel },
    };
  });
}
```

**Adaptation notes:**
- Empty array guard (`length === 0 ? [] : await tx.select()...`) is **mandatory** — SQLite errors with `near ")": syntax error` on `IN ()` (Pitfall 1). The semantic test in `apply-merge.test.ts` MUST cover this.
- **Per-user filter preserved** in both `WHERE` clauses (`eq(table.userId, userId) AND inArray(table.externalId, [...])`). Security baseline (V4 ASVS) unchanged.
- Transaction binding (`tx`) shared across all reads + writes — atomicity intact.
- `NewGame` (domain aggregate) carries VO accessors; `toGameInsertRow` `unwrap` collapses them transparently — no change needed in the `for…of` body shape compared to the old inline.
- **New imports:** add `inArray` to the existing `drizzle-orm` import; add `toGameInsertRow` to the existing `'../db/schema'` import.

---

### 6. `apps/api/src/routes/games.test.ts` (MOD — add route-ordering pin)

**Closest analog:** self. Lines 142-157 (`describe('GET /api/games/metadata/candidates — auth coverage')`) is the proof-of-concept of mounting `games` router with manual `requireAuth` and `app.request()`-ing the metadata path.

**Existing analog block** — `routes/games.test.ts:142-157`:
```typescript
describe('GET /api/games/metadata/candidates — auth coverage', () => {
  it('returns 401 when no auth cookie / session is present', async () => {
    // Mount the full games router behind the SAME requireAuth middleware
    // used in production (apps/api/src/index.ts:42). With no cookie, the
    // middleware short-circuits to 401 BEFORE the metadata sub-router has
    // a chance to handle the request. Asserts that a future contributor
    // who mounts the metadata router differently cannot silently strip
    // the auth requirement.
    const { requireAuth } = await import('./middleware/require-auth');
    const noAuthApp = new Hono<{ Variables: AuthVariables }>();
    attachProblemJsonErrorHandler(noAuthApp);
    noAuthApp.use('/api/games/*', requireAuth);
    noAuthApp.route('/api/games', games);
    const res = await noAuthApp.request('/api/games/metadata/candidates?title=X&platform=PS2');
    expect(res.status).toBe(401);
  });
});
```

**Existing harness with seeded user** — `routes/games.test.ts:13-23`:
```typescript
function makeTestApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', games);
  return app;
}
```

**Target shape — append a new `describe` block** (D-19, D-20, D-21):
```typescript
describe('route ordering pin', () => {
  // BE-05: `/metadata/*` MUST be registered BEFORE `/:externalId` in
  // routes/games.ts. If a future maintainer reorders the registrations,
  // GET /api/games/metadata/candidates resolves to `:externalId === 'metadata'`
  // → 404. This test fails the moment that regression lands.
  //
  // Acceptable statuses: 200 (IGDB chain primed + match), 503 (chain null),
  // 400 (validation), 401 (auth strips). NOT 404.
  it('GET /api/games/metadata/candidates does not resolve to :externalId', async () => {
    const res = await app.request('/api/games/metadata/candidates?title=foo&platform=PC');
    expect(res.status).not.toBe(404);
  });
});
```

**Adaptation notes:**
- Use the same `app` from `beforeAll` (line 54). The seeded user middleware (line 17) ensures we bypass auth; the test asserts route precedence, not auth precedence.
- **Acceptable** statuses listed in the comment for future debuggers: 200 / 503 / 400. In the current test environment with no IGDB seeded, expect **503** with `body.type === '/errors/feature-disabled'` (per `games-metadata.ts:18-26`). We assert only "≠ 404" — strict enough to catch the regression, loose enough not to flap on environment changes.
- No new imports needed — `app`, `expect`, `describe`, `it` already in scope.

---

### 7. `apps/api/src/__tests__/wiring.test.ts` (NEW — composition smoke test)

**Closest analog:** `apps/api/src/routes/games.test.ts:13-23, 142-157` for the makeTestApp pattern; `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-86` for in-memory harness (though wiring.test reuses the real `db` import side-effects, NOT a `:memory:` DB — see Pitfall 3).

**Test app pattern** — `routes/games.test.ts:13-23` (already quoted above).

**Test 1: chain swap → 503** — adapt the auth-coverage test (lines 142-157):
```typescript
const { requireAuth } = await import('./middleware/require-auth');
const noAuthApp = new Hono<{ Variables: AuthVariables }>();
attachProblemJsonErrorHandler(noAuthApp);
noAuthApp.use('/api/games/*', requireAuth);
noAuthApp.route('/api/games', games);
const res = await noAuthApp.request('/api/games/metadata/candidates?title=X&platform=PS2');
expect(res.status).toBe(401);
```

**IgdbChainHolder API** — `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:57-83`:
```typescript
export class IgdbChainHolder {
  private chain: IgdbChain | null = null;
  private breaker: CircuitBreaker | null = null;

  constructor(private readonly deps: IgdbChainHolderDeps) {}

  get(): IgdbChain | null { return this.chain; }
  isConfigured(): boolean { return this.chain !== null; }

  swap(creds: { clientId: string; clientSecret: string } | null): void {
    if (creds === null) {
      if (this.breaker !== null) { this.breaker.reset(); }
      this.breaker = null;
      this.chain = null;
      this.deps.logger.event('igdb.chain.cleared', {});
      return;
    }
    this.chain = this.build(creds);
    this.deps.logger.event('igdb.chain.configured', {});
  }
  // ...
}
```

**Target shape** (D-22, D-23, D-24; full file):
```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from '../routes/_problem-json';
import { games as gamesRouter } from '../routes/games';
import type { AuthVariables } from '../routes/middleware/require-auth';
import { igdbChainHolder } from '../wiring';

const TEST_USER_ID = `test-wiring-${crypto.randomUUID()}`;

function makeApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', gamesRouter);
  return app;
}

describe('wiring smoke (BE-06)', () => {
  let savedChain: ReturnType<typeof igdbChainHolder.get>;

  beforeEach(() => {
    // `wiring.ts` does `await primeIgdbChainFromDb()` at import time —
    // that side-effect ran once when bun:test loaded this module. Snapshot
    // whatever state it left and restore after each test.
    savedChain = igdbChainHolder.get();
  });

  afterEach(() => {
    if (savedChain === null) {
      igdbChainHolder.swap(null);
    } else {
      throw new Error(
        'wiring.test.ts assumed igdbChainHolder started disabled; if you ' +
          'changed test bootstrap to seed IGDB creds, extend afterEach to restore.',
      );
    }
  });

  it('chain=null → 503 on GET /api/games/metadata/candidates', async () => {
    igdbChainHolder.swap(null);
    expect(igdbChainHolder.isConfigured()).toBe(false);
    const app = makeApp();
    const res = await app.request('/api/games/metadata/candidates?title=foo&platform=PC');
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.type).toBe('/errors/feature-disabled');
  });

  it('chain=null → 503 on PATCH /api/games/:externalId/metadata', async () => {
    igdbChainHolder.swap(null);
    const app = makeApp();
    const res = await app.request('/api/games/ext-1/metadata', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'x' }),
    });
    expect(res.status).toBe(503);
  });

  it('singleton identity: re-importing wiring returns the same instances', async () => {
    const a = await import('../wiring');
    const b = await import('../wiring');
    expect(a.igdbChainHolder).toBe(b.igdbChainHolder);
    expect(a.db).toBe(b.db);
    expect(a.gameRepository).toBe(b.gameRepository);
    expect(a.transactionRunner).toBe(b.transactionRunner);
  });
});
```

**Imports needed (relative — no barrels per CLAUDE.md):**
- `bun:test` — `afterEach`, `beforeEach`, `describe`, `expect`, `it`
- `hono` — `Hono`
- `../infrastructure/logging/request-context-middleware` — `requestContext`
- `../routes/_problem-json` — `attachProblemJsonErrorHandler`
- `../routes/games` — `games` (renamed to `gamesRouter` to avoid shadowing)
- `../routes/middleware/require-auth` — `AuthVariables` (type-only)
- `../wiring` — `igdbChainHolder` (and via dynamic import for the identity test, the full module)

**Adaptation notes:**
- **Do NOT** wrap with `:memory:` SQLite — `wiring.ts` opens `apps/api/data/apex.db` at import time; we ride that. The test is hermetic enough because it only swaps the chain holder and asserts route behavior; no DB writes.
- The `afterEach` "throw if started configured" guard (RESEARCH Pattern 5 + Open Q #4) lets a developer with seeded IGDB creds in dev know to either clear creds or run tests against a clean DB.
- Singleton identity uses ESM dynamic import; Bun caches modules just like Node — same exports object on repeated `import('../wiring')`.
- **No need to touch `wiring.ts`** — `igdbChainHolder` and `db` are already exported (lines 36, 163).

---

### 8. `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` (NEW — helper pin)

**Closest analog:** `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-86` — in-memory SQLite + migrate harness.

**Existing harness** — `update-game.optimistic.test.ts:49-86`:
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

describe('UpdateGame optimistic locking', () => {
  let sqlite: Database;
  let db: ReturnType<typeof drizzle<typeof gameSchema & typeof authSchema>>;
  let repo: DrizzleGameRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    repo = new DrizzleGameRepository(db);
    // ... seed platform + game ...
  });

  afterEach(() => {
    sqlite.close();
  });
  // ...
});
```

**Test goals** (BE-02 acceptance — RESEARCH §Phase Requirements → Test Map):
- Insert via `toGameInsertRow` directly; assert all 18 columns populated correctly.
- Insert via `DrizzleGameRepository.create` (which calls helper); compare resulting row.
- Insert via `applyMerge` for a single game; compare resulting row to the helper output.
- All three inserts produce **identical** row shapes given equivalent inputs.

**Adaptation notes:**
- `MIGRATIONS_DIR` is `resolve(__dirname, '../../../../drizzle')` from `src/application/games/__tests__`. For `src/infrastructure/db/__tests__/` the relative path is `'../../../../drizzle'` (same depth — 4 levels up to `apps/api/`).
- **`auth-schema`** must be included in the drizzle schema bag because `games.userId` references `user.id` with FK cascade — the migrator needs both schemas mounted (see `update-game.optimistic.test.ts:50, 56`).
- Seed a `user` row (via raw `db.insert(authUser)`) before inserting games — FK constraint. Pattern from `update-game.optimistic.test.ts:63-67` (which seeds a platform; for FK on `user.id` you may need to insert into `authSchema.user` first OR disable FK enforcement via `sqlite.exec('PRAGMA foreign_keys = OFF;')` for the test).
- **Imports needed:**
  ```typescript
  import Database from 'bun:sqlite';
  import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
  import { dirname, resolve } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { eq } from 'drizzle-orm';
  import { drizzle } from 'drizzle-orm/bun-sqlite';
  import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
  import { NewGame } from '../../../domain/games/new-game';
  import * as authSchema from '../auth-schema';
  import * as gameSchema from '../schema';
  import { games as gamesTable, toGameInsertRow } from '../schema';
  import { DrizzleGameRepository } from '../../games/drizzle-game-repository';
  import { DrizzleImportRepository } from '../../import/drizzle-import-repository';
  ```

---

### 9. `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` (NEW — batch SELECT semantic pin)

**Closest analog:** same in-memory harness as `update-game.optimistic.test.ts:49-86`. RESEARCH Open Q #3 recommends **semantic-only** (no query counting).

**Test goals** (BE-03 acceptance — D-15 alt-B):
- Seed 50 existing games + 5 existing platforms for `USER_ID`.
- Build an `ImportPlan` with 100 games (25 overlap with existing → updates; 75 new → inserts) and 5 platforms (3 overlap, 2 new).
- Call `repo.apply(USER_ID, plan, 'merge')`.
- Assert returned `ImportReport.games.created === 75`, `updated === 25`.
- Assert `ImportReport.platforms.created === 2`, `updated === 3` (when names change) **or** `updated === 0` (when names match — depends on seed data; pick either, document).
- Assert row count `SELECT count(*) FROM games WHERE user_id = USER_ID` is 50 + 75 = 125.
- **Edge case 1**: empty plan (`platforms: [], games: []`) → no SELECT errors, report `created/updated = 0`.
- **Edge case 2**: per-user scoping — seed games for `USER_B`; verify `applyMerge` for `USER_A` does NOT touch `USER_B`'s rows (RESEARCH §V4 Access Control).

**Adaptation notes:**
- `DrizzleImportRepository` uses the **module-level `db`** (`drizzle-import-repository.ts:4`), not a constructor-injected handle. So the test cannot pass a `:memory:` DB into the repo directly without refactoring the repo.
- **Two options:**
  - **(a)** Accept the dependency on the real `apex.db`. Use a unique `USER_ID = test-merge-${crypto.randomUUID()}` to isolate; `afterAll` cleans `games` + `platforms` where `user_id = TEST_USER_ID`. This is the same approach `routes/games.test.ts:11, 57-58` uses. **Recommended** — no source change to `drizzle-import-repository.ts`.
  - **(b)** Refactor `DrizzleImportRepository` to accept a `db` handle via constructor (mirroring `DrizzleGameRepository`). Larger blast radius; out of scope for Phase 5.
- Planner: pick **(a)**. Document in the test header that this is a real-DB integration test (consistent with `routes/games.test.ts` precedent).
- **Imports needed:**
  ```typescript
  import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
  import { and, count, eq } from 'drizzle-orm';
  import { db } from '../../db/client';
  import { games as gamesTable, platforms as platformsTable } from '../../db/schema';
  import { DrizzleImportRepository } from '../drizzle-import-repository';
  import { NewGame } from '../../../domain/games/new-game';
  import { NewPlatform } from '../../../domain/platforms/platform';
  ```
- Use `NewGame.create({...})` to construct domain aggregates for `ImportPlan.games` (since `applyMerge` consumes the domain shape).

---

### 10. `.planning/codebase/CONCERNS.md` (MOD — mark sections resolved)

**Closest analog:** self.

**Sections to update** (5 entries + 1 new):

| Current location | Current heading | Target action |
|---|---|---|
| `:12-15` | "Migrations run unconditionally on every process boot" | Rewrite "Fix:" line → "**Resolved in Phase 5 (BE-01)** — auto-migrate gated by `NODE_ENV !== 'production'`; `scripts/deploy.sh` runs `bun run --filter=@apex/api db:migrate` ahead of restart." |
| `:17-20` | "Row-builder for games/platforms duplicated 3×" | Rewrite "Fix:" line → "**Resolved in Phase 5 (BE-02)** — `toGameInsertRow(userId, input)` in `apps/api/src/infrastructure/db/schema.ts`; all three call-sites use it." |
| `:77-80` | "Import-merge is N+1 reads inside a transaction" | Rewrite "Fix:" line → "**Resolved in Phase 5 (BE-03)** — `applyMerge` reads all rows via `inArray(externalId, [...])` (2 SELECTs total) and loops in memory; per-row UPDATEs retained intentionally (D-13)." |
| `:82-85` | "Missing indices for some sort fields" | Rewrite "Fix:" line → "**Resolved in Phase 5 (BE-04, accepted cost)** — block comment over `games` table in `schema.ts` documents ~10ms full-scan sort on `hoursPlayed`/`genre`/`status`; revisit when schema stabilises. See `feedback_no_premature_indices`." |
| `:99-103` | "Singleton wiring graph in `apps/api/src/wiring.ts`" | Add line under "Test gap: no test for composition." → "**Test gap closed in Phase 5 (BE-06)** — `apps/api/src/__tests__/wiring.test.ts` pins `igdbConfigured=false → 503` and singleton identity." |
| `:105-108` | "Hono route ordering is registration-sensitive" | Rewrite "Fix:" line → "**Resolved in Phase 5 (BE-05)** — `describe('route ordering pin')` in `routes/games.test.ts` asserts `GET /api/games/metadata/candidates` ≠ 404." |

**Adaptation notes:**
- **Style consistency** — the existing entries use bullet lists with `- File:`, `- ...`, `- Fix:`. Replace `- Fix:` with `- **Resolved in Phase 5 (BE-XX):** ...`. Keep file/line references.
- Do **not** delete the resolved entries — they document history. Just append the resolution marker.
- Update `*Last updated:*` line at top to `2026-05-15`.

---

## Shared Patterns (apply across multiple files)

### A. In-memory SQLite test harness

**Source:** `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:1-86`

**Apply to:** Any new test that needs schema-aware DB without writing to `apex.db`.

```typescript
import Database from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as authSchema from '../../../infrastructure/db/auth-schema';
import * as gameSchema from '../../../infrastructure/db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof gameSchema & typeof authSchema>>;

beforeEach(() => {
  sqlite = new Database(':memory:');
  db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
});

afterEach(() => {
  sqlite.close();
});
```

**Phase 5 consumers:** `to-game-insert-row.test.ts` (if planner chooses isolated DB) — but **not** `apply-merge.test.ts` (constrained by module-level `db` in `DrizzleImportRepository`, see file #9 notes), and **not** `wiring.test.ts` (must use the real wiring `db` import side-effect).

---

### B. Hono `app.request()` test harness (real route stack, mock user)

**Source:** `apps/api/src/routes/games.test.ts:13-23`

**Apply to:** Any new test that needs to fire requests at routes without booting `Bun.serve`.

```typescript
import { Hono } from 'hono';
import { attachProblemJsonErrorHandler } from './_problem-json';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import { games } from './games';
import type { AuthVariables } from './middleware/require-auth';

const TEST_USER_ID = `test-${crypto.randomUUID()}`;

function makeTestApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', games);
  return app;
}
```

**Phase 5 consumers:** `wiring.test.ts` (BE-06) and the new `describe('route ordering pin')` in `games.test.ts` (BE-05 — reuses existing `app` from `beforeAll`).

---

### C. Per-user scoping in repository queries (V4 ASVS)

**Source:** every method in `apps/api/src/infrastructure/games/drizzle-game-repository.ts` (e.g. lines 153-158).

**Apply to:** **All** new SELECTs in `applyMerge`. The Phase 5 batch SELECT MUST include both `eq(table.userId, userId)` AND `inArray(table.externalId, [...])` — the existing pattern uses `and(...)` to compose:

```typescript
async findByExternalId(userId: string, externalId: string): Promise<Game | null> {
  const [row] = await this.db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, externalId)))
    .limit(1);
  return row ? this.mapRowToGame(row) : null;
}
```

**Phase 5 consumers:** `drizzle-import-repository.ts` `applyMerge` (file #5 above) — **both** the platforms SELECT and the games SELECT.

---

### D. Result + named-exports + relative imports (CLAUDE.md core)

**Source:** project-wide convention. See `CLAUDE.md §Module Design`.

- `export function toGameInsertRow(...)` — named export only.
- Import via concrete file path: `from '../db/schema'`, never `from '../db'` (no barrels in API).
- No throws for business errors (helper is pure; no failure mode).

**Phase 5 consumers:** every new file and every modified import line.

---

### E. Biome formatting (CLAUDE.md §Formatting Rules)

- 2-space indent, single quotes for TS, semicolons always, trailing commas, line width 100, arrow parens always.
- Imports auto-organized — when adding `inArray` to an existing `drizzle-orm` import or `toGameInsertRow` to an existing `'../db/schema'` import, run `bun run format` after editing.

**Phase 5 consumers:** every modified TS file. Run `bun run lint` and `bun run format` at the end of each task.

---

## No Analog Found

None. Every Phase 5 target has either a same-file precedent (modifications) or a copy-and-adapt sibling (new tests). The bash script for `scripts/deploy.sh` is the closest to "no analog" but is fully specified by RESEARCH Pattern 4 plus the unchanged `.github/workflows/deploy.yml` contract.

---

## Metadata

**Analog search scope:**
- `apps/api/src/infrastructure/**` (db, games, import, igdb, integrations, logging, cron, config, metadata)
- `apps/api/src/routes/**`
- `apps/api/src/application/**/__tests__/**`
- `apps/api/package.json`
- `.github/workflows/deploy.yml`
- `.planning/codebase/CONCERNS.md`

**Files scanned:** ~22 files read in full or in load-bearing ranges.

**Pattern extraction date:** 2026-05-15

**Confidence:** HIGH. Every concrete excerpt is line-cited; the planner can paste directly into PLAN actions with `${analogFile}:${lineRange}` callouts.
