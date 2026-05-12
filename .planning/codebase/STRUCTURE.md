# Codebase Structure

*Last updated: 2026-05-12*

## Directory Layout

```
apex/
├── apps/
│   ├── api/                              # @apex/api — Bun + Hono backend
│   │   ├── data/                         # SQLite file `apex.db` (gitignored)
│   │   ├── drizzle/                      # Generated SQL migrations 0000…0004
│   │   ├── scripts/                      # One-off scripts (e.g. backfill-external-ids.ts)
│   │   ├── src/
│   │   │   ├── index.ts                  # HTTP entrypoint + cron + shutdown
│   │   │   ├── wiring.ts                 # Composition root (singletons)
│   │   │   ├── routes/                   # Hono sub-routers + middleware
│   │   │   │   ├── middleware/
│   │   │   │   ├── _problem-json.ts      # RFC 7807 helpers
│   │   │   │   ├── _make-dictionary-router.ts
│   │   │   │   └── *.ts (games, platforms, genres, developers, …)
│   │   │   ├── application/              # Use cases (one verb per file)
│   │   │   │   ├── games/                # create-/update-/delete-/list-/get-/move-to-collection
│   │   │   │   ├── dictionary/           # make-dictionary-use-cases factory
│   │   │   │   ├── idempotency/
│   │   │   │   ├── cover-storage/
│   │   │   │   ├── export/  import/
│   │   │   │   └── shared/transaction-runner.ts
│   │   │   ├── domain/                   # Pure model (no Drizzle, no Hono, no Zod)
│   │   │   │   ├── games/                # game.ts, new-game.ts, game-update.ts, VOs
│   │   │   │   ├── platforms/  genres/  developers/  dictionary/  import/
│   │   │   │   └── shared/result.ts
│   │   │   └── infrastructure/           # Adapters
│   │   │       ├── db/                   # client.ts, schema.ts, auth-schema.ts, seed.ts
│   │   │       ├── auth/                 # better-auth + auth-config
│   │   │       ├── games/  dictionary/   # Drizzle repository implementations
│   │   │       ├── idempotency/  import/
│   │   │       ├── igdb/                 # http client, breaker, token store, adapter
│   │   │       ├── metadata/             # caching provider, rate limiter, cache repo
│   │   │       ├── cover-storage/        # UploadThing adapter + upload allowlist
│   │   │       ├── logging/              # logger + request-context middleware
│   │   │       ├── cron/                 # cron-lock
│   │   │       └── config/               # env.ts, providers.ts, cover-hosts.ts
│   │   ├── drizzle.config.ts
│   │   ├── package.json                  # @apex/api
│   │   └── tsconfig.json
│   └── client/                           # @apex/client — Vite + React 18 SPA
│       ├── index.html
│       ├── postcss.config.js
│       ├── tailwind.config.js
│       ├── vite.config.ts                # `@` alias + /api proxy
│       ├── components.json               # shadcn config
│       ├── src/
│       │   ├── main.tsx                  # Router + QueryClient + Toaster
│       │   ├── types.ts                  # Client-side DTOs
│       │   ├── pages/                    # Route components (games, wishlist, …)
│       │   ├── components/
│       │   │   ├── ui/                   # shadcn primitives (button, input, sheet, …)
│       │   │   ├── layout/               # app-layout, app-header, sidebar, auth-layout
│       │   │   ├── auth/                 # protected-route
│       │   │   └── *.tsx                 # Feature components (data-table, game-form, …)
│       │   ├── hooks/                    # use-game-draft, use-import, use-export, …
│       │   └── lib/                      # api.ts, queries.ts, api-fetch.ts, auth-client.ts
│       ├── DESIGN.md
│       └── package.json                  # @apex/client
├── packages/
│   └── shared/                           # @apex/shared
│       ├── src/
│       │   ├── index.ts                  # Barrel
│       │   ├── import-schema-v{1..4}.ts  # Versioned Zod schemas
│       │   ├── import-schema-external.ts
│       │   └── import-types.ts
│       └── package.json
├── docs/                                 # Project docs
├── .planning/                            # GSD planning artifacts
├── .claude/   .agents/   .impeccable/    # Agent/skill configs
├── package.json                          # Root workspace (apps/*, packages/*)
├── tsconfig.base.json                    # Strict TS, ES2022, Bundler resolution
├── biome.json                            # Lint + format config
├── bun.lock
├── DESIGN.md  PRODUCT.md  README.md
└── skills-lock.json
```

## Directory Purposes

**`apps/api/src/routes/`**
- Purpose: HTTP adapters (Hono sub-routers).
- Contains: One file per resource (`games.ts`, `platforms.ts`, `genres.ts`, `developers.ts`, `export.ts`, `import.ts`, `me.ts`, `upload.ts`, `games-metadata.ts`, `health.ts`), `middleware/`, internal helpers prefixed `_` (`_problem-json.ts`, `_make-dictionary-router.ts`).
- Key files: `apps/api/src/routes/games.ts`, `apps/api/src/routes/_problem-json.ts`.

**`apps/api/src/application/`**
- Purpose: Use cases — one verb per file.
- Contains: `games/<verb>-game.ts`, `dictionary/make-dictionary-use-cases.ts`, `idempotency/`, `cover-storage/`, `export/`, `import/`, `shared/transaction-runner.ts`.
- Key files: `apps/api/src/application/games/create-game.ts`, `apps/api/src/application/games/enrich-game-metadata.ts`.

**`apps/api/src/domain/`**
- Purpose: Pure model layer; no framework imports.
- Contains: Aggregates (`game.ts`), value objects (`game-value-objects.ts`, `cover-image-url.ts`, `release-year-range.ts`, `external-metadata-ref.ts`), invariants (`game-invariants.ts`), repository ports (`*-repository.ts`), `dictionary/`, `shared/result.ts`.
- Key files: `apps/api/src/domain/games/game.ts`, `apps/api/src/domain/games/game-repository.ts`.

**`apps/api/src/infrastructure/`**
- Purpose: Adapters for external systems (DB, auth, HTTP clients, storage, logging, cron).
- Contains: `db/`, `auth/`, `games/`, `dictionary/`, `idempotency/`, `igdb/`, `metadata/`, `cover-storage/`, `import/`, `logging/`, `cron/`, `config/`.
- Key files: `apps/api/src/infrastructure/db/client.ts`, `apps/api/src/infrastructure/db/schema.ts`, `apps/api/src/infrastructure/auth/auth.ts`.

**`apps/api/drizzle/`**
- Purpose: Generated migration SQL.
- Generated: Yes (via `bun run db:generate`).
- Committed: Yes.

**`apps/api/data/`**
- Purpose: Local SQLite file `apex.db` (WAL).
- Generated: Yes (auto-created at boot).
- Committed: No.

**`apps/client/src/pages/`**
- Purpose: Top-level route components plus their tightly-coupled siblings (`games-columns.tsx`, `games-grid.tsx`, `games-mobile-list.tsx`, `wishlist-columns.tsx`).
- Contains: One file per route, kebab-case (`games.tsx`, `wishlist.tsx`, `game-edit.tsx`, `game-view.tsx`, `dictionaries.tsx`, `data.tsx`, `login.tsx`, `register.tsx`).

**`apps/client/src/components/`**
- Purpose: Reusable UI components (kebab-case).
- Contains:
  - `ui/` — shadcn primitives, **never edited by hand** (also ignored by Biome via `**/components/ui/**`).
  - `layout/` — `app-layout`, `app-header`, `sidebar`, `auth-layout`.
  - `auth/` — `protected-route`.
  - Feature components at the root (`data-table`, `game-form`, `add-game-dialog`, `metadata-match-picker`, etc.).

**`apps/client/src/lib/`**
- Purpose: Cross-page helpers — HTTP, queries, URL state, utilities.
- Key files: `apps/client/src/lib/api-fetch.ts`, `apps/client/src/lib/api.ts`, `apps/client/src/lib/queries.ts`, `apps/client/src/lib/query-client.ts`, `apps/client/src/lib/auth-client.ts`, `apps/client/src/lib/url-state.ts`, `apps/client/src/lib/games-list-state.ts`, `apps/client/src/lib/utils.ts`.

**`apps/client/src/hooks/`**
- Purpose: Custom React hooks (`use-*`).
- Key files: `apps/client/src/hooks/use-game-draft.ts`, `apps/client/src/hooks/use-import.ts`, `apps/client/src/hooks/use-export.ts`, `apps/client/src/hooks/use-igdb-status.ts`, `apps/client/src/hooks/use-mobile.tsx`.

**`packages/shared/`**
- Purpose: Cross-app contracts (currently only versioned import/export schemas).
- Key files: `packages/shared/src/index.ts` (barrel), `packages/shared/src/import-schema-v4.ts` (current), `packages/shared/src/import-schema-external.ts`.

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts` — HTTP server, cron, graceful shutdown.
- `apps/client/src/main.tsx` — SPA bootstrap, router, providers.

**Configuration:**
- `apps/api/src/infrastructure/config/env.ts` — Zod-parsed process env (fails fast).
- `apps/api/src/infrastructure/config/providers.ts` — supported metadata providers.
- `apps/api/src/infrastructure/config/cover-hosts.ts` — cover URL host allowlist.
- `apps/api/drizzle.config.ts` — drizzle-kit settings.
- `apps/client/vite.config.ts` — `@` alias + `/api` proxy.
- `apps/client/tailwind.config.js`, `apps/client/postcss.config.js`, `apps/client/components.json`.
- Root: `tsconfig.base.json`, `biome.json`, `package.json`, `bun.lock`.

**Core Logic:**
- `apps/api/src/wiring.ts` — composition root, all singletons.
- `apps/api/src/domain/games/game.ts` — central aggregate.
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — persistence.
- `apps/client/src/lib/api-fetch.ts` — single client HTTP funnel.

**Testing:**
- API unit tests are co-located: `apps/api/src/**/*.test.ts` (e.g. `create-game.test.ts`, `delete-game.test.ts`, `games.idor.test.ts`).
- Integration tests in `apps/api/src/routes/__tests__/*.int.test.ts` and `apps/api/src/infrastructure/games/drizzle-game-repository.test.ts`.
- Client tests under `apps/client/src/lib/__tests__/`.

## Naming Conventions

**Files (TypeScript):** `kebab-case.ts` / `kebab-case.tsx`. Internal/private route helpers prefixed with `_` (e.g. `_problem-json.ts`, `_make-dictionary-router.ts`).

**Use-case files:** `<verb>-<aggregate>.ts` → `create-game.ts`, `update-game.ts`, `enrich-game-metadata.ts`, `move-to-collection.ts`.

**Repository implementations:** `drizzle-<aggregate>-repository.ts` → `drizzle-game-repository.ts`, `drizzle-import-repository.ts`.

**React components:** kebab-case files, PascalCase exports (`add-game-dialog.tsx` exporting `AddGameDialog`).

**Pages:** kebab-case (`game-edit.tsx`), PascalCase export ending in `Page` (`GameEditPage`).

**Hooks:** kebab-case `use-*` file, camelCase export (`use-game-draft.ts` → `useGameDraft`).

**Tests:** `*.test.ts` (unit, co-located), `*.int.test.ts` (integration in `__tests__/`), `*.explain.test.ts` (SQLite EXPLAIN harness).

**Domain types/classes:** PascalCase (`Game`, `NewGame`, `GameUpdate`, `ReleaseYearRange`, `ExternalMetadataRef`).

**Result-error discriminators:** snake_case `kind` strings (`'invalid_input'`, `'platform_invalid'`, `'optimistic_lock'`, `'cache_miss'`, `'snapshot_mismatch'`).

**Problem-JSON type URIs:** `/errors/<kebab-name>` (`/errors/validation`, `/errors/optimistic-lock`).

**Log event names:** dot-separated, lower snake-case segments (`igdb.breaker.open`, `cleanup.orphans.completed`, `shutdown.drain.timeout`).

**Directories:** kebab-case for multi-word (`cover-storage/`, `metadata/`); single-word lower (`games`, `routes`).

## Where to Add New Code

**New API resource (e.g. `tags`):**
- Domain: `apps/api/src/domain/tags/tag.ts`, `apps/api/src/domain/tags/tag-repository.ts` (interface).
- Application: `apps/api/src/application/tags/<verb>-tag.ts`, returning `Result`.
- Infrastructure: `apps/api/src/infrastructure/tags/drizzle-tag-repository.ts`.
- Wiring: Register repos + use cases in `apps/api/src/wiring.ts`.
- Routes: `apps/api/src/routes/tags.ts`, mount in `apps/api/src/index.ts` with `app.use('/api/tags/*', requireAuth); app.route('/api/tags', tags)`.
- DB: Add table to `apps/api/src/infrastructure/db/schema.ts`, run `bun run db:generate`.

**New dictionary kind:**
- Schema table in `apps/api/src/infrastructure/db/schema.ts`.
- Domain constants (kind, max-length) in `apps/api/src/domain/<kind>/<kind>.ts`.
- One `makeDictionaryUseCases({ … })` block in `apps/api/src/wiring.ts`.
- A `apps/api/src/routes/<kind>.ts` exporting `makeDictionaryRouter({ useCases })`.

**New use case for an existing aggregate:** add `apps/api/src/application/<aggregate>/<verb>-<aggregate>.ts`, wire it in `apps/api/src/wiring.ts`, expose via the existing route file.

**New client page:**
- Page: `apps/client/src/pages/<name>.tsx` exporting `<Name>Page`.
- Route: add to the router tree in `apps/client/src/main.tsx` (under `ProtectedRoute → AppLayout` for authed routes).
- Data: extend `apps/client/src/lib/api.ts` with typed wrappers and `apps/client/src/lib/queries.ts` with TanStack Query hooks; never call `fetch` directly.

**New shared UI component:** `apps/client/src/components/<name>.tsx`. shadcn primitives belong in `components/ui/` and are added via the shadcn CLI (don't edit them by hand — they are ignored by Biome).

**New utility:**
- Client cross-cutting: `apps/client/src/lib/utils.ts` (or a new `apps/client/src/lib/<topic>.ts`).
- API cross-cutting that is *not* domain: an `infrastructure/` subdirectory.
- Reused across client + API: `packages/shared/src/<name>.ts` and re-export from `packages/shared/src/index.ts`.

**New migration:** `bun run db:generate` (drizzle-kit) — never edit existing migration files in `apps/api/drizzle/`.

**New env var:** Add to `apps/api/src/infrastructure/config/env.ts` Zod schema; the rest of the app reads from the exported `env`.

## Special Directories

**`apps/client/src/components/ui/`:**
- Purpose: shadcn-generated primitives.
- Generated: Yes (via shadcn CLI, see `apps/client/components.json`).
- Committed: Yes.
- Note: Excluded from Biome (`biome.json` → `**/components/ui/**`). Do not hand-edit.

**`apps/api/drizzle/`:**
- Purpose: SQL migrations.
- Generated: Yes (via `bun run db:generate`).
- Committed: Yes.
- Note: Excluded from Biome (`apps/api/drizzle/**`).

**`apps/api/data/`:**
- Purpose: Local SQLite file.
- Generated: Yes (created at boot).
- Committed: No.

**`apps/api/src/infrastructure/db/auth-schema.ts`:**
- Purpose: better-auth-generated schema.
- Generated: Yes (via `@better-auth/cli`).
- Committed: Yes.
- Note: Excluded from Biome (`biome.json` ignore list).

**`.planning/`:** GSD workflow artifacts (this file lives here).

**`.claude/`, `.agents/`, `.impeccable/`:** Agent + skill configurations. Excluded from Biome.
