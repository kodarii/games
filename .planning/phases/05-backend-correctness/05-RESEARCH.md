# Phase 5: Backend Correctness - Research

**Researched:** 2026-05-15
**Domain:** Bun/Hono/Drizzle infrastructure hardening — migrations, row-builder dedup, batched SELECTs, sort-cost docs, route-ordering pins, wiring smoke tests
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**BE-01 (Deploy migration flow):**
- **D-01:** Versioned `scripts/deploy.sh` w repo. Sekwencja: `git pull` (zewnętrznie albo wewnątrz — TBD planner) → `bun install --production` → `bun run --filter=@apex/api db:migrate` → restart procesu API (mechanizm restartu — pm2/systemd — Claude's discretion).
- **D-02:** `.github/workflows/deploy.yml` zostaje bez zmian. VPS-owy `/root/apex/scripts/deploy.sh` ręcznie zmieniamy raz, by delegował do versioned `scripts/deploy.sh` z repo (`exec bash scripts/deploy.sh`).
- **D-03:** `client.ts` zachowuje warunkowy `migrate(...)` **tylko gdy `process.env.NODE_ENV !== 'production'`**. Dev convenience; prod fail-fast na pierwszym query do brakującej kolumny.
- **D-04:** `set -euo pipefail` w `scripts/deploy.sh`. Jeśli `db:migrate` ≠0 — exit przed restartem; stary proces zostaje przy życiu.
- **D-05:** Migracje nadal generowane przez `drizzle-kit generate` lokalnie; commit'owane do `apps/api/drizzle/`.

**BE-02 (`toGameInsertRow` dedup):**
- **D-06:** Helper w `apps/api/src/infrastructure/db/schema.ts` (obok `games` + `NewGameRow`).
- **D-07:** `GameRowInput` to discriminated union (`kind: 'owned' | 'wishlist'`) z polami opcjonalnymi; helper zwija VO `.value` → prymityw transparentnie.
- **D-08:** Trzech callers: `DrizzleGameRepository.create`, `applyMerge`, `applyReplace`. Po zmianie `rg "kind: \w+\.kind" apps/api/src --type ts` zwraca **jedno** wystąpienie.
- **D-09:** Import nie przekazuje `coverImage`/`price`/`purchasedAt`/`notes`/`metadataProvider*` — opcjonalne; helper mapuje brak na `null`.
- **D-10:** `DrizzleGameRepository.update` **poza scope BE-02** — inny shape (update vs insert).

**BE-03 (Batch SELECT w `applyMerge`):**
- **D-11:** Dwa SELECT-y na start per tabela: platforms (`WHERE user_id = ? AND external_id IN (...)`) + games (analogicznie). Każdy → `Map<externalId, Row>`.
- **D-12:** Pętle `for (const np of plan.platforms)` / `for (const ng of plan.games)` robią lookup w pamięci + INSERT lub UPDATE per item.
- **D-13:** UPDATE per-row OK (SQLite nie ma `UPDATE FROM VALUES`); BE-03 wymaga tylko "pojedynczy SELECT", nie "pojedynczy UPDATE".
- **D-14:** `applyReplace` bez zmian batch SELECT (DELETE-all + INSERT-all, brak N+1).
- **D-15:** Test pokrycia: integracyjny z 100+ games + 5 platforms; planner wybiera czy query-counting (mocniejszy pin regresji), czy semantic ("wszystkie expected rows istnieją").

**BE-04 (Sort field indices):**
- **D-16:** **NIE dodajemy** indeksów dla `hoursPlayed`/`genre`/`status`. Model się rozwija — premature optimization (per MEMORY `feedback_no_premature_indices`).
- **D-17:** Komentarz blok-komentarz nad `games` table w `schema.ts` + wpis w `.planning/codebase/CONCERNS.md`. Treść: "Apex is single-user, expected ≤5k rows per user. Full-scan + in-memory sort measured at ~10ms on local WAL DB. Indices deferred until schema stabilizes."
- **D-18:** `format`/`releaseYear`/`title`/`platform` mają już indeksy (`games_user_kind_format_idx`, etc.). ROADMAP wymienił `format` po staremu; **nie dotykamy istniejących indeksów**.

**BE-05 (Route ordering regression test):**
- **D-19:** Test w `apps/api/src/routes/games.test.ts` (forced przez ROADMAP SC-5).
- **D-20:** Nowa sekcja `describe('route ordering pin')`. Jeden test: `GET /api/games/metadata/candidates?title=foo` → status **!== 404**. Akceptowalne: 200, 503, 400. Nie 404.
- **D-21:** Boot wzorzec używany przez istniejący `games.test.ts` (`makeTestApp()` + `app.request()`). Nie mock'ujemy IGDB chain.

**BE-06 (Wiring composition smoke test):**
- **D-22:** Nowy plik `apps/api/src/__tests__/wiring.test.ts` (osobny, izolowany).
- **D-23:** Test 1 (state machine): snapshot `igdbChainHolder` state w `beforeEach` → `swap(null)` → request `/api/games/.../metadata` → assert 503 → restore w `afterEach`.
- **D-24:** Test 2 (singleton identity): dwa `await import('../wiring')` → assert `imp1.igdbChainHolder === imp2.igdbChainHolder`, `imp1.db === imp2.db`. Alt: jeśli internals (`tokenStore`, `breaker`, `rateLimiter`) nie są exposed, sprawdzić tylko `igdbChainHolder` identity jako proxy.
- **D-25:** Realna DB (in-memory `:memory:` sqlite + `migrate()` jak `update-game.optimistic.test.ts:55-57`). Wymaga eksportu `app` (lub testowego mount'u routera w stylu istniejącego `games.test.ts`).

**Out-of-scope (świadomie):**
- **D-26:** Zero zmian w `apps/client/**`. Phase 5 jest 100% API/infra.
- **D-27:** Bez touch'owania `wiring.ts` poza ew. eksportem `app` dla BE-06. Singleton boot order append-only.
- **D-28:** Bez touch'owania `auth.ts` / Phase 3 security warstwy.
- **D-29:** Bez zmian w `applyReplace` poza koniecznymi dla D-08.

### Claude's Discretion

1. Mechanizm restartu w `scripts/deploy.sh` (pm2 / systemd / inny) — planner pyta usera jeśli VPS state niejasny.
2. `bun install --production` vs `bun install --frozen-lockfile` w deploy.
3. Konkretny shape "disable" dla BE-06 jeśli `swap(null)` ma side-effects niewygodne dla testu.
4. Test BE-03: query-counting vs semantic-only.
5. Format komentarza nad `games` table (D-17) — proza vs bullety.

### Deferred Ideas (OUT OF SCOPE)

- Batch UPDATE w `applyMerge` (SQLite UPSERT z `ON CONFLICT`) — v2 / on-demand.
- Dedup row-builder dla `DrizzleGameRepository.update()` — Phase 5+ on demand.
- Indices dla `hoursPlayed`/`genre`/`status` — odłożone do stabilizacji modelu (v2 / when needed).
- Forensic read-only boot mode — osobny tool, v2.
- Wspólny query-counter helper dla testów — on-demand jeśli BE-03 wybierze query-counting variant.
- `pm2` vs `systemd` jako pełnoprawna decyzja — jeśli VPS nie ma process managera.
- Health check endpoint wystawiający `igdbConfigured` (`/health/deps`) — nowa capability, nie correctness fix.
- Drizzle migration drift detection w CI — v2.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-01 | Migrations out-of-boot: deploy script wywołuje `bun run db:migrate` przed `bun run start`; `client.ts` tylko otwiera DB | Drizzle-kit `migrate` CLI dokumentowany; istniejący `db:migrate` skrypt + `drizzle.config.ts` w `apps/api/`; pattern `NODE_ENV !== 'production'` dev-guard; istniejący SSH-action deploy (`.github/workflows/deploy.yml:18`) |
| BE-02 | Helper `toGameInsertRow(userId, game)` w `schema.ts`; użyty w `create` / `applyMerge` / `applyReplace` | `NewGameRow = typeof games.$inferInsert` już istnieje; trzy call-sites zweryfikowane; `NewGame` aggregate wystawia wszystkie potrzebne getters (`.releaseYear?.value`, etc.) — helper konsumuje aggregate albo plain row input |
| BE-03 | `applyMerge` używa batch SELECT z `IN (externalIds)` zamiast N+1 | Drizzle ma `inArray(col, [...])` (już używane w `drizzle-game-repository.ts:86`); transakcja `db.transaction(async (tx) => ...)` umożliwia atomowy batch read; `Map<externalId, Row>` lookup w pamięci |
| BE-04 | Sort fields: indices lub udokumentowany koszt | MEMORY `feedback_no_premature_indices` + `noUncheckedIndexedAccess: off` w tsconfig + obecne indeksy w `schema.ts:42-50` — wybieramy dokumentację (D-17) |
| BE-05 | Test pinujący `GET /api/games/metadata/candidates ≠ 404` | Istniejący `games.test.ts` używa `makeTestApp()` + `app.request()` (linia 13-23, 142-157); identyczny wzorzec wystarczy |
| BE-06 | Wiring smoke: `igdbConfigured=false` → 503; singleton identity | `IgdbChainHolder.swap(null)` (`igdb-chain-holder.ts:71-80`) wystawia disable; pattern `:memory:` + `migrate()` z `update-game.optimistic.test.ts:54-58`; `wiring.ts` exportuje `igdbChainHolder` ale **NIE exportuje `app`** — to gap dla testu |

</phase_requirements>

## Summary

Phase 5 to sześć wąskich, zlokalizowanych poprawek warstwy API. **Trzy z nich (BE-01, BE-04, BE-05) są w pełni mechaniczne** — pliki, zmiany, formatowanie znane na 100%. **Trzy wymagają decyzji projektowej z małym ryzykiem** — BE-02 (kształt helpera + jego call-site shape), BE-03 (jak testować — query-counting vs semantic), BE-06 (czy eksportować `app` z `wiring.ts` czy stworzyć osobny `app.ts`).

Stack jest stabilny i znajomy: Bun + Hono 4.6.12 + Drizzle 0.45.2 + drizzle-kit 0.31.10 + bun:test. Wszystkie potrzebne API już są używane gdzie indziej w repo — `inArray`, `db.transaction`, `migrate(...)`, `swap(null)`, `app.request()`, in-memory `:memory:` sqlite. **Zero nowych zależności.**

**Primary recommendation:** Wykonaj 6 BE-XX w kolejności: BE-02 → BE-03 → BE-04 → BE-01 → BE-05 → BE-06. BE-02 jest fundamentem dla BE-03 (oba dotykają tej samej pętli w `applyMerge`); BE-04 jest pure-comment-only więc bezpiecznie łączyć z BE-02 commit'em. BE-01 izolowany od kodu API (deploy script + jednolinijkowa zmiana w `client.ts`). BE-05/BE-06 to test-only — bezpieczne ostatnie.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| BE-01 migration execution | Deploy scripts (`scripts/deploy.sh`) | API runtime (only dev guard) | Migracja to operacja deploy-time. Runtime nie powinien decydować kiedy uruchomić schema migration — to anti-pattern (boot race, brak rollback). |
| BE-02 row-builder | Infrastructure / DB layer (`infrastructure/db/schema.ts`) | Repos (callers) | Helper jest częścią schematu — w nim żyje wiedza "która kolumna pasuje do którego pola". Domain nie wie o `NewGameRow`. |
| BE-03 batch SELECT | Infrastructure / Import adapter (`infrastructure/import/drizzle-import-repository.ts`) | — | Performance fix w Drizzle adapterze; ImportRepository interface (domain) nie zmienia się. |
| BE-04 sort cost docs | Infrastructure / DB schema (`infrastructure/db/schema.ts` comment) + project docs (`.planning/codebase/CONCERNS.md`) | — | Decyzja o non-indexing należy do warstwy DB i projektu, nie do domain. |
| BE-05 route-ordering test | Routes layer test (`apps/api/src/routes/games.test.ts`) | — | Test pinuje Hono routing behavior — czysto warstwa HTTP. |
| BE-06 wiring smoke test | Composition root test (`apps/api/src/__tests__/wiring.test.ts`) | Routes (proxy do testu 503) | Test composition root + jego HTTP wire-up; nie testuje domain ani application use-case'ów. |

## Standard Stack

### Core (already installed — Phase 5 adds NO new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun` | runtime | Process runner, `bun:sqlite`, `bun:test` | Already the project runtime (`apps/api/tsconfig.json` types: ['bun']) |
| `hono` | ^4.6.12 [VERIFIED: package.json] | HTTP framework — `app.route()`, `app.request()` for tests | Already used in `index.ts:34`, `games.test.ts:13` |
| `drizzle-orm` | ^0.45.2 [VERIFIED: package.json] | ORM — `inArray`, `eq`, `and`, `db.transaction` | Already used everywhere; `inArray` already in `drizzle-game-repository.ts:86` |
| `drizzle-kit` | ^0.31.10 [VERIFIED: package.json] | Migration CLI — `drizzle-kit migrate` reads `drizzle.config.ts` | Already in `db:generate` and `db:migrate` scripts |
| `bun:test` | bundled | Test runner — `describe`, `beforeEach`, `afterEach`, `expect` | Already used in `update-game.optimistic.test.ts`, `games.test.ts` |
| `bun:sqlite` | bundled | `:memory:` DB for test isolation + `migrate()` programmatic | Already used in test harness (`update-game.optimistic.test.ts:55`) |

### Supporting (zero net-new code)

Phase 5 reuses every API already wired in the codebase. **No imports added beyond local-module relative paths.**

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `drizzle-kit migrate` CLI (D-01) | Programmatic `migrate()` from `drizzle-orm/bun-sqlite/migrator` invoked by a one-off script | CLI is purpose-built and reads `drizzle.config.ts` automatically; programmatic path duplicates path resolution. **Reject** — CLI is standard. |
| Exporting `app` from `wiring.ts` (BE-06) | Extract `app` to a new `apps/api/src/app.ts` (consumed by `index.ts`) | `app.ts` is cleaner separation, but it requires shuffling middleware registration (`requireAuth`, CORS, route mounts). Higher risk in a correctness-only phase. **Recommend** instead: re-create a minimal test app in `wiring.test.ts` (like `games.test.ts:13-23`) that mounts the real routers — sidesteps the `app` export question entirely. |
| Hand-rolling a query-counter (D-15 alt-A) | `Database.prototype.prepare` monkey-patch in test setup, increment counter on every SELECT | Mocks too much surface, fragile to Drizzle internals. **Recommend** semantic-only test (D-15 alt-B): post-import row count + content correctness, plus separate manual benchmark (1 row in `bun:test` output) — pinujesz przez zmianę kodu, nie przez query-count assertion. |

**Installation:** None. Confirmed against `apps/api/package.json` — every needed runtime + dev dep is already present.

**Version verification:** `drizzle-kit ^0.31.10` (resolved 0.31.10 in lockfile, top of `node_modules/drizzle-kit/package.json` chain). Latest stable per registry: 0.31.x is the most recent on 2026-05-15.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌────────────────────────────────────┐
                          │   GitHub Actions (push to main)    │
                          └─────────────────┬──────────────────┘
                                            │ SSH (appleboy/ssh-action@v1)
                                            ▼
                          ┌────────────────────────────────────┐
                          │  VPS /root/apex/scripts/deploy.sh  │  (manual entry, delegates ↓)
                          └─────────────────┬──────────────────┘
                                            │ exec bash scripts/deploy.sh
                                            ▼
                          ┌────────────────────────────────────┐
                          │   repo  scripts/deploy.sh (NEW)    │  ◄── BE-01 D-01..D-04
                          │   set -euo pipefail                │
                          │   ┌────────────────────────────┐   │
                          │   │ 1. git pull                │   │
                          │   │ 2. bun install --production│   │
                          │   │ 3. bun run --filter=...    │   │
                          │   │    @apex/api db:migrate    │───┼──► drizzle-kit migrate
                          │   │ 4. systemctl/pm2 restart   │   │      reads drizzle.config.ts
                          │   └────────────────────────────┘   │      runs SQL in apps/api/drizzle/
                          └─────────────────┬──────────────────┘
                                            │ on success
                                            ▼
                          ┌────────────────────────────────────┐
                          │  API process restart               │
                          │  Bun.serve in apps/api/src/index.ts│
                          │                                    │
                          │  client.ts:                        │
                          │    if (NODE_ENV !== 'production')  │  ◄── BE-01 D-03
                          │       migrate(...)   // dev only   │
                          │    // prod: skip; rely on deploy   │
                          └─────────────────┬──────────────────┘
                                            │
                          ┌─────────────────┴──────────────────┐
                          ▼                                    ▼
            ┌───────────────────────────┐       ┌──────────────────────────┐
            │   GET /api/games          │       │   POST /api/import       │
            │   (lots of paths)         │       │   uses applyMerge        │
            │                           │       │                          │
            │   /api/games/metadata/*   │       │   BE-03: two batched     │
            │   pinned BEFORE :externalId│       │   SELECTs + Map lookup   │
            │   (BE-05 regression test) │       │                          │
            └───────────────────────────┘       └──────────────────────────┘
                                                            │
                                                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │   toGameInsertRow(userId, input)  ◄── BE-02 (single helper) │
            │   in apps/api/src/infrastructure/db/schema.ts               │
            │                                                              │
            │   Used by:                                                   │
            │     • DrizzleGameRepository.create                          │
            │     • DrizzleImportRepository.applyMerge                    │
            │     • DrizzleImportRepository.applyReplace                  │
            └─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (Δ delta from current)

```
apps/api/
├── drizzle/                       # generated migrations (unchanged)
├── drizzle.config.ts              # unchanged
├── package.json                   # unchanged — db:migrate already there
├── src/
│   ├── infrastructure/
│   │   ├── db/
│   │   │   ├── client.ts          # MOD: gate migrate(...) on NODE_ENV (BE-01 D-03)
│   │   │   └── schema.ts          # MOD: + GameRowInput + toGameInsertRow (BE-02);
│   │   │                          #      + block comment over `games` table (BE-04 D-17)
│   │   ├── games/
│   │   │   └── drizzle-game-repository.ts   # MOD: create() → toGameInsertRow(...) (BE-02)
│   │   └── import/
│   │       └── drizzle-import-repository.ts # MOD: batch SELECT (BE-03);
│   │                                        #      applyMerge/applyReplace → toGameInsertRow (BE-02)
│   ├── routes/
│   │   └── games.test.ts          # MOD: + describe('route ordering pin') (BE-05)
│   └── __tests__/                 # NEW DIR
│       └── wiring.test.ts         # NEW: BE-06 (igdbConfigured → 503; singleton identity)
└── ...

scripts/
└── deploy.sh                      # NEW: BE-01 D-01..D-04 (versioned deploy)

.planning/codebase/
└── CONCERNS.md                    # MOD: rewrite BE-XX entries from "Fix:" to "Resolved in Phase 5"
                                   #      + add new entry for documented sort-field cost (BE-04 D-17)
```

### Pattern 1: `toGameInsertRow` helper (BE-02)

**What:** A pure function that maps a discriminated-union input shape to `NewGameRow` (Drizzle insert row type), folding VO `.value` accessors and `?? null` defaults.

**When to use:** Three INSERT call-sites that today inline the same 18-field object literal — `create()`, `applyMerge` (insert branch), `applyReplace`.

**Example (target shape):**
```typescript
// apps/api/src/infrastructure/db/schema.ts
//
// ... existing `games` table + `NewGameRow` type ...

/**
 * Shape consumed by `toGameInsertRow`. Optional fields map to NULL columns.
 * Discriminated by `kind` so the union mirrors the domain split between
 * 'owned' and 'wishlist' games (status/hoursPlayed are present in both row
 * shapes today; future column adds may diverge here without touching
 * three insert sites).
 */
export type GameRowInput =
  | {
      kind: 'owned';
      title: string;
      genre: string;
      platform: string;
      format: string;
      externalId: string;
      developer?: string | null;
      // Accepts either a VO (with `.value`) or a primitive — caller chooses.
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
    }
  | { kind: 'wishlist'; /* same field set */ };

export function toGameInsertRow(userId: string, input: GameRowInput): NewGameRow {
  const unwrap = <T>(v: { value: T } | T | null | undefined): T | null =>
    v == null ? null : typeof v === 'object' && 'value' in v ? v.value : v;
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

**Caller usage (BE-02 acceptance — `rg "kind: \w+\.kind"` returns ONE match):**

```typescript
// drizzle-game-repository.ts create()
const [inserted] = await this.db
  .insert(gamesTable)
  .values(toGameInsertRow(newGame.userId, {
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
    metadataRef: newGame.metadataRef ? {
      providerName: newGame.metadataRef.providerName,
      providerId: newGame.metadataRef.providerId,
      matchedAt: newGame.metadataRef.matchedAt,
    } : null,
  }))
  .returning();
```

**Source:** Type signatures from `apps/api/src/infrastructure/db/schema.ts:53-54` and `apps/api/src/domain/games/new-game.ts:25-89` (already in repo).

### Pattern 2: Batch SELECT with `inArray` (BE-03)

**What:** Read all rows that match a list of external IDs in one round trip, then loop over the import plan in memory.

**Example (target shape):**

```typescript
// drizzle-import-repository.ts applyMerge() — after BE-03
private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
  return db.transaction(async (tx) => {
    const platformExternalIds = plan.platforms.map((p) => p.externalId);
    const existingPlatforms = platformExternalIds.length === 0
      ? []
      : await tx
          .select()
          .from(platformsTable)
          .where(and(
            eq(platformsTable.userId, userId),
            inArray(platformsTable.externalId, platformExternalIds),
          ));
    const platformByExternalId = new Map(existingPlatforms.map((row) => [row.externalId, row]));

    let pCreated = 0, pUpdated = 0;
    for (const np of plan.platforms) {
      const existing = platformByExternalId.get(np.externalId);
      if (!existing) {
        await tx.insert(platformsTable).values({ userId, externalId: np.externalId, name: np.name });
        pCreated++;
      } else if (existing.name !== np.name) {
        await tx.update(platformsTable).set({ name: np.name }).where(eq(platformsTable.id, existing.id));
        pUpdated++;
      }
    }

    const gameExternalIds = plan.games.map((g) => g.externalId);
    const existingGames = gameExternalIds.length === 0
      ? []
      : await tx
          .select()
          .from(gamesTable)
          .where(and(
            eq(gamesTable.userId, userId),
            inArray(gamesTable.externalId, gameExternalIds),
          ));
    const gameByExternalId = new Map(existingGames.map((row) => [row.externalId, row]));

    let gCreated = 0, gUpdated = 0;
    for (const ng of plan.games) {
      const existing = gameByExternalId.get(ng.externalId);
      const row = toGameInsertRow(userId, { /* fields from ng */ });
      if (!existing) {
        await tx.insert(gamesTable).values(row);
        gCreated++;
      } else {
        // UPDATE has different shape (no userId/externalId/createdAt) —
        // strip them out here, or use a separate set-shape derivation.
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

**Edge cases the planner MUST cover:**
- Empty `plan.platforms` / `plan.games` arrays → skip the SELECT (avoid `IN ()` SQL syntax error). SQLite errors on `IN ()` empty list.
- SQLite parameter limit: `SQLITE_MAX_VARIABLE_NUMBER` is 32_766 in modern SQLite (Bun's bundled is 3.x). Import body cap is 5 MB (`apps/api/src/routes/import.ts`), realistically < few thousand games — well under the limit. **Document but don't guard.**
- `withTx(...)` binding: `applyMerge` already wraps in `db.transaction`, so all reads + writes share the same `tx` handle — atomicity preserved.

**Source:** `inArray` from `drizzle-orm` (already imported in `drizzle-game-repository.ts:1`).

### Pattern 3: NODE_ENV-gated dev migrate (BE-01 D-03)

**What:** Keep the convenience auto-migrate for `bun run dev`, fail fast in prod if migration wasn't run.

**Example (target shape — `client.ts:24-28`):**

```typescript
const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (process.env.NODE_ENV !== 'production' && !g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}
```

**Note:** No existing `NODE_ENV` reads in `apps/api/src/` (grep confirmed). This is the first such guard. Planner may consider extending `env.ts` to surface a typed `NODE_ENV`, but **D-03 explicitly accepts raw `process.env.NODE_ENV`** to keep diff minimal. Document the choice in the commit.

### Pattern 4: `scripts/deploy.sh` shape (BE-01 D-01, D-04)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Versioned deploy script. Invoked by /root/apex/scripts/deploy.sh on the VPS
# (which is a thin wrapper that git-pulls then exec's this file).

echo "▶ Installing production dependencies..."
bun install --production

echo "▶ Running database migrations..."
bun run --filter=@apex/api db:migrate

echo "▶ Restarting API service..."
# Replace with the actual mechanism in place on the VPS — likely one of:
#   sudo systemctl restart apex-api
#   pm2 restart apex-api
# Decided per VPS state (Claude's discretion #1).
sudo systemctl restart apex-api

echo "✓ Deploy complete."
```

**Critical: `git pull` location.** Two viable shapes:
- (a) VPS `/root/apex/scripts/deploy.sh` does `git pull` THEN `exec bash scripts/deploy.sh` (because the script itself comes from git, so you must pull before exec'ing the new version).
- (b) Versioned `scripts/deploy.sh` first line does `git pull` itself (simpler but means the running script can be replaced mid-execution — bash actually handles this OK because it reads the script into memory at parse time, but the convention is to pull before exec).

**Recommend (a):** keep `git pull` in the unversioned VPS wrapper. The repo's `scripts/deploy.sh` assumes the working tree is already up-to-date.

### Pattern 5: Wiring smoke test (BE-06)

**What:** A test that boots a minimal test app, uses the real `igdbChainHolder`, swaps to disabled state, and asserts 503.

**Approach (avoids the `wiring.ts` export-`app` question):**

```typescript
// apps/api/src/__tests__/wiring.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { attachProblemJsonErrorHandler } from '../routes/_problem-json';
import { games as gamesRouter } from '../routes/games';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import type { AuthVariables } from '../routes/middleware/require-auth';
import { igdbChainHolder } from '../wiring';

// Mirror games.test.ts boot pattern.
function makeApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: 'test-wiring-user' } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', gamesRouter);
  return app;
}

describe('wiring smoke', () => {
  // Snapshot the chain holder state — we may have a real chain primed
  // from primeIgdbChainFromDb() at module import time, depending on whether
  // a test user has integration_credentials. Restore in afterEach.
  let savedChain: ReturnType<typeof igdbChainHolder.get>;

  beforeEach(() => {
    savedChain = igdbChainHolder.get();
  });

  afterEach(() => {
    if (savedChain === null) {
      igdbChainHolder.swap(null);
    } else {
      // Cannot directly re-set a chain (swap takes creds, not a chain). If
      // we started disabled, leaving it disabled is correct. If we started
      // configured, we cannot trivially restore without the original creds.
      // In the test DB we expect savedChain to be null (no test user with
      // IGDB creds) — assert that to fail loud if a maintainer changes the
      // test setup.
      throw new Error(
        'wiring.test.ts assumed igdbChainHolder started disabled; if you ' +
          'changed test bootstrap to seed IGDB creds, extend afterEach to restore.',
      );
    }
  });

  it('igdbConfigured=false → 503 on GET /api/games/metadata/candidates', async () => {
    igdbChainHolder.swap(null);
    expect(igdbChainHolder.isConfigured()).toBe(false);
    const app = makeApp();
    const res = await app.request('/api/games/metadata/candidates?title=foo&platform=PC');
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.type).toBe('/errors/feature-disabled');
  });

  it('igdbConfigured=false → 503 on PATCH /api/games/:id/metadata', async () => {
    igdbChainHolder.swap(null);
    const app = makeApp();
    const res = await app.request('/api/games/ext-1/metadata', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'x' }),
    });
    expect(res.status).toBe(503);
  });

  it('singleton identity: two imports yield the same igdbChainHolder', async () => {
    const a = await import('../wiring');
    const b = await import('../wiring');
    expect(a.igdbChainHolder).toBe(b.igdbChainHolder);
    expect(a.db).toBe(b.db);
    expect(a.gameRepository).toBe(b.gameRepository);
    expect(a.transactionRunner).toBe(b.transactionRunner);
  });
});
```

**Why this shape (vs exporting `app` from wiring):**
- Zero touch to `wiring.ts` / `index.ts` (D-27 compliance).
- Re-uses the exact route-mount pattern from `games.test.ts:13-23` — proven.
- `igdbChainHolder` is already exported from `wiring.ts:163`.
- Singleton identity test uses ESM dynamic-import (Bun caches modules just like Node — two `await import` returns the same exports object).

**Caveat:** `wiring.ts` does `await primeIgdbChainFromDb()` at module import time (`:196`). The first import of `../wiring` in the test process triggers this. The function consults the **shared** DB (`apps/api/data/apex.db`) — if a real IGDB integration row exists in dev, the chain will be configured. Mitigation: `afterEach` snapshot/restore as shown; OR use `:memory:` shared DB by injecting `DATABASE_URL` env var (not currently supported — would require code change, **out of scope**). **Recommend** the snapshot-and-assert-null approach.

**Alt path if the snapshot approach proves brittle:** test BE-06 against a **fresh `IgdbChainHolder` instance** constructed in the test, without going through `wiring.ts`. This sacrifices the "real wiring" smoke property but makes the test fully isolated. Planner decides — see Open Questions.

### Anti-Patterns to Avoid

- **Mocking the IgdbChainHolder.** It's a 130-line class with significant state machine logic — replacing it with a stub would test the test, not the wiring.
- **Calling `bun run --hot` style HMR in tests.** Tests run cold under `bun test`; no hot-reload concerns.
- **Adding migration files for BE-04.** D-16 explicitly forbids it. The planner's task list MUST NOT include `drizzle-kit generate` for Phase 5.
- **Adding a `start` script that includes migrate.** D-01 puts migrate in `scripts/deploy.sh`, NOT in `package.json` start. Mixing the two re-introduces the boot race.
- **Removing the `globalThis.__apexDbMigrated` guard.** Even in dev it prevents re-migration during `bun --hot` cycles. D-03 keeps the guard; only adds the NODE_ENV check around it.
- **Exporting `app` from `wiring.ts`.** Possible but increases blast radius. The test-local makeApp() pattern (Pattern 5 above) avoids touching `wiring.ts`/`index.ts` entirely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration runner | Custom shell loop over `apps/api/drizzle/*.sql` | `drizzle-kit migrate` (CLI, reads `drizzle.config.ts`) | Manages `__drizzle_migrations` table; tracks applied vs pending. |
| Batched read | Loop with N awaits | `inArray(col, [...])` | Already in repo (`drizzle-game-repository.ts:86`); single SQLite prepared statement. |
| Test query counter | Monkey-patch `Database.prepare` | Use semantic test (D-15 alt-B): seed N rows, assert all imported correctly | Query counters are fragile to Drizzle internal changes; semantic is what really matters for regression. |
| In-memory DB for test | A reset script that drops all rows | `new Database(':memory:')` + `migrate(db, { migrationsFolder })` | Already the project pattern (`update-game.optimistic.test.ts:55-57`). |
| Process manager invention | Custom Bun-based supervisor | Use existing VPS systemd/pm2 (whatever is in place) | Out of scope for Phase 5. |

**Key insight:** Every problem in this phase has a well-established in-repo solution. Phase 5 is reuse + relocation, NOT introduction.

## Runtime State Inventory

Phase 5 is mostly internal correctness — **two items qualify**:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `__drizzle_migrations` table in `apps/api/data/apex.db` — managed by drizzle-kit; tracks applied migration hashes. BE-01 moves WHO writes to this table from boot path → deploy script. Existing rows are preserved (drizzle-kit uses same table). | None — automatic continuity. |
| Live service config | None — no n8n / Cloudflare / external service holds Phase 5 state. | None. |
| OS-registered state | The VPS process manager (systemd unit `apex-api.service` or pm2 process `apex-api`) must restart after `db:migrate` succeeds. **D-04**: if migrate fails, don't restart. | `scripts/deploy.sh` writes the `set -euo pipefail` flow correctly — no OS-level reregistration. |
| Secrets/env vars | `NODE_ENV` is the only env var Phase 5 newly reads (BE-01 D-03). It is already standardly available in deploy environments — no new secret. **Verify VPS sets `NODE_ENV=production`** (likely already does via systemd unit `Environment=NODE_ENV=production` or pm2 default). | Confirm with user during planning; planner may add a note to `scripts/deploy.sh` exporting it. |
| Build artifacts | None — no compiled output changes. `apps/api/dist/` (built via `bun build`) is regenerated each deploy; not affected by Phase 5. | None. |

**Nothing else found** — verified by greping `apps/api/src/` for `dev-os`, `apex_old`, or stale identifiers; none present. No `egg-info`/compiled-binary state.

## Common Pitfalls

### Pitfall 1: `IN ()` on empty array
**What goes wrong:** SQLite raises `near ")": syntax error` if `inArray(col, [])` is rendered without a guard.
**Why it happens:** Drizzle's `inArray` produces `col IN ()` for empty arrays.
**How to avoid:** Guard with `if (externalIds.length === 0) { ... }` before the SELECT — return an empty Map.
**Warning signs:** Test with empty `plan.platforms` should pass; if it errors with SQL syntax, the guard is missing.

### Pitfall 2: drizzle-kit migrate run from wrong cwd
**What goes wrong:** `drizzle.config.ts` uses `resolve(process.cwd(), 'data/apex.db')`. If you run `drizzle-kit migrate` from repo root (cwd = `/`, not `apps/api`), it resolves to `<root>/data/apex.db`.
**Why it happens:** `bun run --filter=@apex/api db:migrate` correctly chdirs into the package; running `bunx drizzle-kit migrate` from root does not.
**How to avoid:** **Always** use the `--filter=@apex/api db:migrate` form in `scripts/deploy.sh` (or `cd apps/api && bun run db:migrate`).
**Warning signs:** Migrate appears to succeed but a new DB file appears in unexpected location.

### Pitfall 3: `await primeIgdbChainFromDb()` at module import affects test state
**What goes wrong:** Importing `../wiring` in `wiring.test.ts` triggers the top-level `await primeIgdbChainFromDb()` — which reads from the **shared** `apex.db` (not in-memory). If that DB has integration credentials seeded, the holder won't start disabled.
**Why it happens:** `wiring.ts:196` is top-level `await`. Module import side-effects fire once per process.
**How to avoid:** `beforeEach` snapshot of `igdbChainHolder.get()`; `afterEach` restore (caveats in Pattern 5 above). Or run the test against a fresh `IgdbChainHolder` instance constructed in the test.
**Warning signs:** Test passes locally on a fresh dev DB, fails on a dev DB where the developer configured IGDB through the UI.

### Pitfall 4: Hono route registration order is silent
**What goes wrong:** Reordering `games.route('/metadata', ...)` after `games.get('/:externalId', ...)` makes `/metadata/candidates` look like `:externalId === 'metadata'` → wrong handler → 404 or wrong response.
**Why it happens:** Hono matches routes in registration order for path params; the comment at `games.ts:153-155` warns about this but isn't enforced.
**How to avoid:** BE-05 test pins it — `GET /api/games/metadata/candidates` must not return 404. **Important:** the existing happy-path test at `games.test.ts:142-157` already mounts metadata router properly; the BE-05 test SHOULD assert against a route mounted **identically to production** (no extra auth middleware that changes behavior).
**Warning signs:** Test returns 404 instead of 200/503/400.

### Pitfall 5: BE-02 helper shape divergence between `create` and `applyMerge`
**What goes wrong:** `DrizzleGameRepository.create()` passes a `NewGame` aggregate (with VO `.value` accessors). `applyMerge` passes a domain `NewGame` (per `ImportPlan` type at `domain/import/import-repository.ts:6`) — **actually same shape**. But `applyReplace` does inline today; one could be tempted to inline plain row objects from import data. **Pitfall:** if you bypass `toGameInsertRow` "just for replace", you lose the dedup property.
**Why it happens:** Refactor laziness.
**How to avoid:** BE-02 acceptance check (D-08): `rg "kind: \w+\.kind" apps/api/src --type ts` returns exactly one match (in the helper itself). Run this check as part of verification.
**Warning signs:** Three matches in grep instead of one.

### Pitfall 6: `bun:test` import path drift in BE-06
**What goes wrong:** A test in `apps/api/src/__tests__/wiring.test.ts` (new dir) accidentally uses an out-of-tree path or breaks `tsconfig` `rootDir` assumptions.
**Why it happens:** This is the first test in `src/__tests__/`. Other tests live in `apps/api/src/<layer>/__tests__/` or co-located.
**How to avoid:** Use relative imports (`../wiring`, `../routes/games`); verify `tsc --noEmit` after creating the file. The path `apps/api/src/__tests__/` is fine — `bun test` auto-discovers `**/*.test.ts` under cwd.
**Warning signs:** `bun run typecheck` errors after adding the file.

### Pitfall 7: `NODE_ENV` not set in dev shell
**What goes wrong:** Developer runs `bun run dev` and `process.env.NODE_ENV` is undefined → D-03's check `!== 'production'` evaluates **true** → migrate runs (correct). BUT if developer runs `NODE_ENV=production bun run dev` for testing prod-like behavior, migrate silently doesn't run → next query fails on missing column → confused dev.
**Why it happens:** D-03 deliberately doesn't add a fail-soft fallback; it's "fail-fast on first query."
**How to avoid:** Document in the commit message and CONCERNS.md update. Optionally emit a single log line at boot: `if (NODE_ENV === 'production') log "skipping auto-migrate; run bun run db:migrate before deploy"`.
**Warning signs:** Dev tries `NODE_ENV=production` for testing and hits cryptic SQLite errors.

## Code Examples

See **Pattern 1–5** above. All target shapes derived from current code at:
- `apps/api/src/infrastructure/db/schema.ts:11-54` (games table + NewGameRow)
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts:162-191` (create)
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts:13-109` (applyMerge + applyReplace)
- `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:57-83` (IgdbChainHolder.swap)
- `apps/api/src/routes/games.test.ts:13-23` (test app harness)
- `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-86` (in-memory DB harness)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Migrations in app boot (`client.ts:25`) | Migrations as deploy step (`drizzle-kit migrate` via `scripts/deploy.sh`) | Phase 5 BE-01 | Eliminates boot race; enables read-only forensic boot; explicit failure mode (deploy fails BEFORE process restart). |
| Inline 18-field insert objects in 3 places | Single `toGameInsertRow` helper | Phase 5 BE-02 | New columns require ONE edit instead of 3. Acceptance: grep returns 1 not 3. |
| N reads per imported game (`applyMerge`) | 2 batched reads + Map lookup | Phase 5 BE-03 | 100-row import: 200 SELECTs → 2 SELECTs. ~100× round-trip reduction. |
| Untested route ordering | Regression test pins `/metadata` mount order | Phase 5 BE-05 | Future maintainer cannot silently break `:externalId` precedence. |
| No wiring composition test | Smoke test for IGDB-disabled state + singleton identity | Phase 5 BE-06 | Documents singleton invariant; pins 503 contract when integration absent. |

**Deprecated/outdated:**
- `apps/client/src/lib/api-fetch.ts:45` — Polish phase-marker comment ("fazy 5 idempotency middleware") — orthogonal but already tracked in CONCERNS.md tech debt; **out of scope for Phase 5** (it's a client-side stale comment, Phase 5 is API-only).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | VPS already has a process manager (systemd or pm2) for `apex-api` | BE-01 D-01 | If no PM exists, `scripts/deploy.sh` restart step doesn't work → user must set up PM as part of Phase 5 (planner asks). Treated as "Claude's Discretion #1" in CONTEXT.md. |
| A2 | VPS exports `NODE_ENV=production` to the API process | BE-01 D-03 | If unset, D-03's check evaluates `'production' !== 'production'` → false → migrate **runs** in prod boot path. **Defeats BE-01.** Mitigation: planner should add an explicit env export to `scripts/deploy.sh` AND/OR fail boot if `NODE_ENV` not set. **Confirm with user.** |
| A3 | SQLite parameter limit (32_766) is never exceeded by real imports | BE-03 D-11 | Practical max import is bounded by 5 MB body cap (`apps/api/src/routes/import.ts:14-18`) → well under limit. Low risk; documented but not guarded. |
| A4 | Test process never has `integration_credentials` row for the test user, so `igdbChainHolder` starts disabled | BE-06 D-23 | If dev DB has IGDB creds for a real user, `primeIgdbChainFromDb` lights the chain. Test's `afterEach` snapshot-restore should still work for the disabled→restore path; but the "started disabled, throws on restore" guard in Pattern 5 needs adjustment. Confirm during planning. |
| A5 | `restart` line in `scripts/deploy.sh` (`systemctl restart apex-api`) works without root tty | BE-01 D-01 | Deploy runs as `root` via SSH (`.github/workflows/deploy.yml:14`), so `sudo` is no-op; `systemctl restart` works without tty. Verified by the existing deploy contract. |
| A6 | `bun run --filter=@apex/api db:migrate` correctly chdirs into `apps/api/` before invoking `drizzle-kit migrate` | BE-01 D-01 | Bun's filter resolves to the workspace package and runs the script in its dir. Verified standard Bun workspace behavior. |
| A7 | Existing `games.test.ts` route harness pattern (`makeTestApp()`) supports a non-auth GET request to `/api/games/metadata/candidates` and the response will NOT be 404 even when IGDB is unconfigured (returns 503) | BE-05 D-20 | True per `games-metadata.ts:16-26` — 503 returned when chain is null. The test pins the route resolves; it doesn't pin the response body. Low risk. |

## Open Questions

1. **VPS process manager — pm2, systemd, or other?**
   - What we know: deploy.yml uses SSH; existing `/root/apex/scripts/deploy.sh` invoked by GitHub Actions.
   - What's unclear: What restarts the API process today? Is `Bun.serve(...)` running under systemd? pm2? bare `bun run start`?
   - Recommendation: planner asks user at start of planning. Default to `systemctl restart apex-api` if user confirms; pm2 alt if user uses pm2.

2. **Does VPS set `NODE_ENV=production`?**
   - What we know: D-03 relies on this env var for the prod-vs-dev branch.
   - What's unclear: Is it set by systemd unit? Shell profile? Nowhere?
   - Recommendation: planner asks user; if uncertain, `scripts/deploy.sh` should `export NODE_ENV=production` before the restart line as a belt-and-suspenders measure.

3. **BE-03 test variant — query-counting vs semantic-only?**
   - What we know: D-15 leaves this to planner.
   - What's unclear: Does the team value regression strength over test simplicity?
   - Recommendation: **semantic-only** for Phase 5. Cheap to write, robust to Drizzle internal changes. Add a TODO comment in the test pointing to "Pitfall 1 — empty `IN ()` array" so a future maintainer who breaks the batched-fetch will notice via test failure on row count.

4. **BE-06 — restore strategy when `igdbChainHolder` starts configured?**
   - What we know: `swap` doesn't accept "rebuild from clone." Restoring is only possible if we have the original creds.
   - What's unclear: Should the test guard against this case (throw with a clear message) or attempt a more sophisticated restore?
   - Recommendation: **throw with clear message** (per Pattern 5 above). The test asserts a property of the test environment, not application code. If a developer with IGDB configured in dev DB runs the test, they'll see the assertion fire and know to either clear their dev integration credentials or run tests against a clean DB.

5. **Does `bun install --production` work correctly in Bun workspaces?**
   - What we know: Bun supports `--production` flag (skips devDependencies).
   - What's unclear: Does it correctly handle workspace devDeps that the API doesn't need at runtime (e.g., drizzle-kit)? Drizzle-kit IS needed at deploy time for `db:migrate` — **so `--production` may strip the very tool we need to run.**
   - Recommendation: **DO NOT use `--production` in `scripts/deploy.sh`.** Use `bun install --frozen-lockfile` instead. The size cost of devDeps is negligible vs the correctness cost of missing drizzle-kit. Overrides CONTEXT.md "Claude's Discretion #2" with a clear technical reason.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | All BE-XX | ✓ | per project lockfile (project requires Bun) | — |
| drizzle-kit | BE-01 (db:migrate CLI) | ✓ | 0.31.10 (devDep) | — must NOT be stripped (see Open Question #5) |
| drizzle-orm | BE-02, BE-03 | ✓ | 0.45.2 | — |
| bun:sqlite | BE-06 (in-memory test) | ✓ | bundled | — |
| bun:test | BE-05, BE-06 | ✓ | bundled | — |
| systemd or pm2 | BE-01 (deploy restart) | **? unknown** | — | If neither: Phase 5 must include process-manager setup OR document manual restart. **Block on user confirmation.** |
| GitHub Actions SSH access | BE-01 (deploy.yml unchanged) | ✓ | existing `appleboy/ssh-action@v1` | — |

**Missing dependencies with no fallback:** None local. **Block at planning time on user confirmation of #6 / #7 above.**

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` (bundled with Bun) |
| Config file | None — auto-discovers `**/*.test.ts` |
| Quick run command | `bun test apps/api/src/routes/games.test.ts apps/api/src/__tests__/wiring.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-01 | Boot in prod skips auto-migrate; boot in dev runs it | manual | run `NODE_ENV=production bun test apps/api/src/routes/games.test.ts` AND assert no migrate log; reverse: `NODE_ENV=development` AND assert migrate log | manual-only (existing `client.ts` is initialized at module import, which makes pure unit-test problematic without an env-var harness — leave it manual) |
| BE-01 | `scripts/deploy.sh` exits non-zero if `db:migrate` fails | manual | run script against a broken migration locally; assert process exit > 0; assert no restart command executed | ❌ Wave 0: create a shell test harness, OR (recommended) document the contract and rely on `set -euo pipefail` semantics |
| BE-02 | `toGameInsertRow` exists; three callers use it; grep `rg "kind: \w+\.kind" apps/api/src --type ts` returns 1 match | static | `rg -c "kind: [a-zA-Z]+\\.kind" apps/api/src --type ts` returns 1 | ✅ existing infrastructure |
| BE-02 | Inserted rows from each caller have identical column shape | integration | reuse `update-game.optimistic.test.ts` in-memory harness — insert via `create()`, via `applyMerge`, via `applyReplace`; compare row content fields side-by-side | ❌ Wave 0: add `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` |
| BE-03 | After import of 100 games + 5 platforms, all rows exist and are correctly upserted (merge semantics) | integration | `bun test apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` — seed 50 existing, import 100 with 25 updates + 75 inserts; assert final row count + content | ❌ Wave 0: add `apply-merge.test.ts` |
| BE-04 | Block comment present over `games` table in `schema.ts`; CONCERNS.md updated | static | grep for comment marker (e.g., `// SORT-COST-NOTE`); grep CONCERNS for "Phase 5" resolution marker | ✅ |
| BE-05 | `GET /api/games/metadata/candidates?title=X` returns ≠ 404 | unit | `bun test apps/api/src/routes/games.test.ts -t "route ordering pin"` | ✅ existing test file (add describe block) |
| BE-06 | Disabled IGDB → 503 on metadata routes; singleton identity holds across imports | integration | `bun test apps/api/src/__tests__/wiring.test.ts` | ❌ Wave 0: new file |

### Sampling Rate
- **Per task commit:** `bun test apps/api/src/<area-touched>` (e.g., BE-02 commits → `bun test apps/api/src/infrastructure/db apps/api/src/infrastructure/games apps/api/src/infrastructure/import`)
- **Per wave merge:** `bun test apps/api` (full API suite)
- **Phase gate:** `bun test` (full repo) green; `bun run --filter=@apex/api typecheck` green; `bun run lint` green; manual: `NODE_ENV=production bun run start` does not auto-migrate (and fails fast on a deliberately-missing migration in a scratch DB).

### Wave 0 Gaps
- [ ] `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` — pin BE-02 helper shape (3 caller equivalence)
- [ ] `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` — pin BE-03 batch SELECT correctness (semantic, not query-count)
- [ ] `apps/api/src/__tests__/wiring.test.ts` — pin BE-06 503 + singleton identity
- [ ] (Optional) `scripts/deploy.test.sh` or `scripts/__tests__/deploy.bats` to assert `set -euo pipefail` behavior — **recommend skip**, rely on contract + `set -e` semantics. Tracked as Open Question.

## Security Domain

Phase 5 is internal hardening. Surface for new threats is small but enumerable:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth changes — Phase 3 stable per D-28 |
| V3 Session Management | no | Phase 3 stable per D-28 |
| V4 Access Control | yes (verify untouched) | Per-user scoping (`eq(table.userId, userId)`) — BE-03 batch SELECT MUST preserve this clause. Test should assert that an import for `user-A` cannot read existing rows of `user-B` via a poisoned externalId. |
| V5 Input Validation | yes (verify untouched) | Zod schemas in `application/import/import-data.ts` unchanged. |
| V6 Cryptography | no | No new crypto. |

### Known Threat Patterns for `Bun + Hono + Drizzle + SQLite`

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Deploy-time auth bypass (D-04 fail-fast must not leave the app in mixed state) | T (tampering) | `set -euo pipefail` exits BEFORE restart; old process keeps running on old code + old schema; no partial-deploy window. |
| Singleton tampering in tests (BE-06 mutates `igdbChainHolder` state) | T (tampering) | `afterEach` restore guard; test scoped to `__tests__/` outside `src/` import graph; no production code touches the test mutation. |
| IDOR via batched IN (...) (BE-03) | T (tampering / S spoofing) | Both batched SELECTs include `eq(table.userId, userId)` AS the FIRST predicate; planner verifies in code review. Pattern from `drizzle-game-repository.ts` `eq(...userId...) AND inArray(externalId, [...])` already standard. |
| Migration-related downgrade attack | E (elevation of privilege) | Migrations are SQL files committed to repo + hashed by `__drizzle_migrations`; downgrade requires repo push (PR review). No new vector. |
| Sentinel-secrets boot allowed via NODE_ENV check (BE-01 D-03) | T (tampering) | D-03 only gates the **migrate** call on NODE_ENV — auth/env validation (Phase 3 sentinel deny-list) is unaffected. No regression. |

**Severity assessment:** All threats LOW. Phase 5 does not expose new endpoints, env vars, or auth surfaces; the new file `scripts/deploy.sh` is privileged but only invoked by an already-privileged SSH session.

## Sources

### Primary (HIGH confidence)
- `apps/api/src/**` and `apps/api/drizzle/**` — direct source inspection, file paths cited inline
- `apps/api/package.json` — verified package versions: hono 4.6.12, drizzle-orm 0.45.2, drizzle-kit 0.31.10
- `apps/api/drizzle.config.ts` — verified DB path uses `process.cwd()` (key BE-01 caveat)
- `.planning/phases/05-backend-correctness/05-CONTEXT.md` — locked decisions D-01..D-29
- `.planning/REQUIREMENTS.md` — BE-01..BE-06 wording
- `.planning/codebase/{CONCERNS,CONVENTIONS,TESTING,STACK}.md` — project rules
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_no_premature_indices.md` — informs BE-04 (referenced in CONTEXT.md)

### Secondary (MEDIUM confidence)
- [Drizzle Kit `migrate` docs](https://orm.drizzle.team/docs/drizzle-kit-migrate) — fetched 2026-05-15; confirms `drizzle.config.ts` is the canonical config source
- Bun workspace `--filter` behavior — standard Bun docs (cwd switch verified via local Bun manual)

### Tertiary (LOW confidence)
- A2 (NODE_ENV set on VPS) — assumption from typical deploy patterns, not verified against the actual VPS. **Block on user confirmation** at planning time.
- A1 (VPS process manager) — assumption; same disposition.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against repo manifests
- Architecture: HIGH — direct source inspection of touchpoint files
- Pitfalls: HIGH — five of seven pitfalls reproduced or verified against codebase invariants
- Deploy machinery (A1, A2): MEDIUM — depends on VPS state, block on user confirmation
- BE-06 test approach: MEDIUM — the snapshot-and-restore strategy is sound but the "started configured" branch needs developer agreement on Open Question #4

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days — stable infra, internal hardening only)

## Project Constraints (from CLAUDE.md)

- **Tech stack locked:** Bun + Hono + Drizzle + SQLite — Phase 5 adds zero new libs; reuses existing stack.
- **Single-user deploy** but **IDOR-safe repos** — BE-03 batch SELECT MUST keep `eq(table.userId, userId)` as the first predicate alongside `inArray(externalId, [...])`. Verified pattern in `drizzle-game-repository.ts`.
- **No barrels in API code** — `toGameInsertRow` exported as named export from `infrastructure/db/schema.ts`; callers import via `from '../db/schema'` or `from '../../infrastructure/db/schema'` directly.
- **Named exports only** — `export function toGameInsertRow(...)`, `export type GameRowInput` — no `export default`.
- **No `console.*` in API production code** — BE-06 test uses `bun:test` matchers only; `scripts/deploy.sh` uses bash `echo` (fine — outside API src).
- **Polish UI copy / English code** — Phase 5 has zero UI; all comments + test names in English. Block comment over `games` table in `schema.ts` is **English** (per CLAUDE.md "code/comments in English").
- **Biome formatting** — 2-space indent, 100-char width, single quotes, trailing commas all. New helper + tests must conform.
- **Result pattern for business errors** — Phase 5 doesn't introduce new use-cases, but BE-02 helper is pure (no Result needed — it cannot fail; all guards happen earlier in domain validation).
- **Optimistic locking via expectedUpdatedAt** — D-10 explicitly keeps `update()` out of BE-02 scope to preserve this contract.
- **No regex/sed/perl hacks** (MEMORY) — BE-02 IS the helper; this rule motivates it. After Phase 5, `rg` check passes (no inline duplicates).
- **No premature indices** (MEMORY) — explicit basis for BE-04 D-16.

## Recommended Sequencing for Planner

| Order | BE-XX | Why this order |
|-------|-------|----------------|
| 1 | **BE-02** | Helper is upstream of BE-03 (`applyMerge` will call it). Touches `schema.ts` + 3 callers. Tests pin shape equivalence. |
| 2 | **BE-03** | Builds on BE-02 helper; rewrites `applyMerge` for batch SELECT. Test asserts row content + count. |
| 3 | **BE-04** | Pure comment + CONCERNS.md update. Zero code risk. Bundled in BE-02 commit acceptable; recommend separate commit for trace clarity. |
| 4 | **BE-01** | Independent of BE-02/03. Touches `client.ts` (1 line) + `scripts/deploy.sh` (new file). **Requires user input** on Open Questions #1, #2, #5. |
| 5 | **BE-05** | Pure test addition in `games.test.ts`. Safe and small. |
| 6 | **BE-06** | New test file; uses fresh `__tests__/` dir. Lowest risk LAST so any earlier slip doesn't pollute this test's environment. |

**Risk-ordered:** BE-04 (zero risk) → BE-05 (tiny test) → BE-02 (3-file refactor, well-bounded) → BE-03 (depends on BE-02; semantic test) → BE-06 (new test + module-level singleton interaction) → BE-01 (only one touching deploy + needs user confirmation).

The planner may pick either ordering; the sequencing above is **dependency-first**. For minimum-disruption sequencing, pick risk-ordered.

## What grill-me / enterprise-web-expert Will Want Answered

Per MEMORY `feedback_grill_then_enterprise`, the user's workflow chains a grill-me-agent and an enterprise-web-expert-agent over the PLAN after Phase 5 planning. Surface these now so the planner pre-empts them:

1. **What happens on partial deploy failure?** `set -euo pipefail` exits before restart; old process keeps running. Document the rollback story: "no rollback magic; if `db:migrate` fails, the deploy is aborted; redeploy after fixing the migration." (D-04 already states this; planner repeats it in the PLAN's risk section.)
2. **What does `Bun.serve(...)` do at SIGTERM after a deploy?** Unchanged by Phase 5 — graceful shutdown handler at `index.ts:177` drains in-flight requests bounded by `SHUTDOWN_DRAIN_MS`. (No PLAN action; cite the existing behavior to forestall the question.)
3. **What about a half-applied migration?** `drizzle-kit migrate` wraps each migration in a transaction. SQLite ACID guarantees either-all-or-none per file. **But a deploy with N pending migrations applies them sequentially**; failure of migration K leaves K-1 applied. Document this in the PLAN.
4. **Why isn't BE-04 a regression risk?** Comment is non-functional. PLAN's verification step is "comment present + CONCERNS.md updated" — no behavior change. Pre-empt enterprise-web's "where's the test?" with "no behavior change, no test possible."
5. **Why doesn't BE-06 mock the full chain?** Because the wiring smoke test's POINT is to verify the real composition root behaves correctly under disable. Mocking would invalidate the smoke property.
6. **BE-03: why semantic test over query count?** Brittleness, see Open Question #3.
7. **Singleton identity after `bun --hot`?** Bun's `--hot` reloads modules but preserves `globalThis` — `__apexDbMigrated` flag survives across reloads in dev. Production never hits `--hot`. (Tangential to Phase 5 but a likely follow-up.)
