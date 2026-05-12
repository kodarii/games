<!-- GSD:project-start source:PROJECT.md -->
## Project

**Apex — Game Collection Tracker**

Prywatny tracker kolekcji gier wideo dla jednego użytkownika. Pozwala zarządzać posiadanymi grami (status, platforma, okładka, data zakupu, cena) i planować przyszłe zakupy przez wishlist. Narzędzie klasy Linear / Raycast — interfejs służy danym, nie odwraca od nich uwagi.

**Core Value:** Właściciel zawsze wie co ma i co chce kupić, i może to sprawdzić w kilka sekund — precyzja, szybkość, fokus.

### Constraints

- **Tech stack**: Bun + Hono + Drizzle + SQLite + React + Tailwind + shadcn + Better Auth + UploadThing + IGDB — nie wymieniamy, rozszerzamy
- **Single-user model**: cała aplikacja zaprojektowana per-user (IDOR-safe repos) ale w praktyce jeden użytkownik na deploy — żadnych multitenant abstrakcji
- **Deployment**: VPS przez SSH (`.github/workflows/deploy.yml` + `appleboy/ssh-action`); single-process — `Bun.serve` na :3001, Vite SPA serwowane statycznie
- **Persistence**: SQLite single-file (`apps/api/data/apex.db`, WAL); migracje w `apps/api/drizzle/`
- **Język UI**: polski (PRODUCT.md, copy w UI). Kod, komentarze, commit-messages — angielski (zgodnie z istniejącą konwencją)
- **Brand**: Linear/Raycast — precyzja, gęstość z oddechem, dane mówią same za siebie. Zero dark-gamer estetyki, zero gamifikacji
- **Backwards compat**: istniejąca kolekcja musi działać po deployu (one-time seed dla IGDB env-varów, migracje wsteczne kompatybilne)
- **Security baseline**: nie obniżamy istniejących zabezpieczeń (per-user scoping, optimistic locking, idempotency); dodajemy CSRF + rate-limit jako warstwy ponad
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ^5.6.3 - Used across all workspaces (api, client, shared); strict mode enabled in `tsconfig.base.json`
- SQL (Drizzle migrations in `apps/api/drizzle/*.sql`) - Schema migrations
- HTML/CSS - `apps/client/index.html`, Tailwind CSS in `apps/client/src/index.css`
## Runtime
- Bun (server) - `apps/api` runs on `Bun.serve` (`apps/api/src/index.ts:84`), uses `bun:sqlite` native driver, `bun:test` for tests
- Node.js / Browser (client) - `apps/client` is a Vite-built SPA; dev/build runs under Node-compatible tooling
- API tsconfig declares `"types": ["bun"]` (`apps/api/tsconfig.json`)
- Bun (workspaces enabled in root `package.json`)
- Lockfile: `bun.lock` present at repo root
- Workspaces: `apps/*`, `packages/*`
## Frameworks
- Hono ^4.6.12 - HTTP framework (`apps/api/src/index.ts`)
- Drizzle ORM ^0.45.2 - SQLite ORM (`drizzle-orm/bun-sqlite`)
- Better Auth ^1.6.9 - Authentication with `drizzleAdapter` (`apps/api/src/infrastructure/auth/auth.ts`)
- React ^18.3.1 + ReactDOM ^18.3.1
- React Router DOM ^6.28.0 - `createBrowserRouter` (`apps/client/src/main.tsx`)
- TanStack Query ^5.99.2 - Server-state cache (`apps/client/src/lib/query-client.ts`)
- TanStack Table ^8.21.3 - Tables (project rule: all tables via `@/components/data-table.tsx`)
- Tailwind CSS ^3.4.17 + shadcn/ui (style: `new-york`, base color: `neutral`) - see `apps/client/components.json`
- Radix UI primitives - alert-dialog, checkbox, dialog, dropdown-menu, popover, separator, slider, slot, tooltip
- Better Auth React client (`better-auth/react`) - `apps/client/src/lib/auth-client.ts`
- `bun:test` - Built-in Bun test runner; co-located `*.test.ts` files (e.g. `apps/api/src/routes/games.test.ts`, `apps/api/src/infrastructure/**/__tests__/*`)
- No separate test framework (no Jest / Vitest config files)
- Vite ^5.4.11 - Client dev server (`apps/client/vite.config.ts`), port 5173, proxies `/api` → `http://localhost:3001`
- `@vitejs/plugin-react` ^4.3.4
- Drizzle Kit ^0.31.10 - Migration generator (`db:generate`, `db:migrate`)
- PostCSS ^8.4.49 + Autoprefixer ^10.4.20
- `tailwindcss-animate` ^1.0.7
## Key Dependencies
- `hono` ^4.6.12 - HTTP routing and middleware (cors, body-limit) in API
- `better-auth` ^1.6.9 - Email+password auth with built-in rate limiting (`/sign-in/email`: 5/60s)
- `drizzle-orm` ^0.45.2 + `better-sqlite3` ^12.9.0 - Persistence (Bun also uses `bun:sqlite` natively)
- `zod` ^4.3.6 - Schema validation in env, request bodies, IGDB responses (shared across api/client/shared)
- `uploadthing` ^7.7.4 - Cover image storage SDK (`UTApi` in `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`)
- `@tanstack/react-query` ^5.99.2 - Client query client (`staleTime: 30_000`, `retry: 1`)
- `@tanstack/react-table` ^8.21.3 - Server-side paged/sorted tables
- `react-router-dom` ^6.28.0 - SPA routing
- `sonner` ^1.7 - Toast notifications (`<Toaster richColors position="top-center" />`)
- `lucide-react` ^1.14.0 - Icon set
- `class-variance-authority` ^0.7.1, `clsx` ^2.1.1, `tailwind-merge` ^2.5.5 - Styling helpers
- `vaul` ^1.1 - Drawer primitive
- `@apex/shared` - Internal workspace package (zod schemas shared between api+client)
## Configuration
- `BETTER_AUTH_SECRET` (required, min 32 chars)
- `BETTER_AUTH_URL` (required, must be URL)
- `CORS_ORIGIN` (required, CSV list of allowed origins)
- `UPLOADTHING_TOKEN` (required, min 1)
- `IGDB_CLIENT_ID` (optional - feature disabled when missing)
- `IGDB_CLIENT_SECRET` (optional - feature disabled when missing)
- `IGDB_TIMEOUT_MS` (default 5000)
- `IGDB_CACHE_TTL_DAYS` (default 30)
- `LOG_LEVEL` (`debug`|`info`|`warn`|`error`, default `info`)
- `SHUTDOWN_DRAIN_MS` (default 25_000)
- `IDEMPOTENCY_TTL_HOURS` (default 24)
- `PORT` (default 3001, read via `process.env.PORT` in `apps/api/src/index.ts:82`)
- `HOSTNAME` (used to form cron lock owner id in `apps/api/src/wiring.ts:224`)
- API: `bun build src/index.ts --target=bun --outdir=dist`
- Client: `tsc -b && vite build` → `apps/client/dist`
- TypeScript strict mode (`tsconfig.base.json`): `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`
- Biome 1.9.4 (`biome.json`) - lint + format
- Settings: 2-space indent, line width 100, single quotes (JSX double), semicolons always, trailing commas all
- Ignores: `**/dist`, `**/node_modules`, `**/components/ui/**`, `apps/api/src/infrastructure/db/auth-schema.ts`, `apps/api/drizzle/**`
- Linter rules: `noNonNullAssertion: off`, `noExplicitAny: warn`, `noSvgWithoutTitle: off`, `noForEach: off`
## Platform Requirements
- Bun runtime (required - workspace + `bun:sqlite` + `bun:test`)
- SQLite database file auto-created at `apps/api/data/apex.db` with WAL mode (`apps/api/src/infrastructure/db/client.ts:20`)
- Migrations auto-applied on first DB access (`apps/api/src/infrastructure/db/client.ts:26`)
- Ports: API `:3001`, Vite client `:5173`
- VPS deploy via SSH (`.github/workflows/deploy.yml` uses `appleboy/ssh-action@v1`)
- Triggered by push to `main`, runs `/root/apex/scripts/deploy.sh` on the VPS
- Graceful shutdown handler (`apps/api/src/index.ts:127`): SIGTERM/SIGINT, bounded by `SHUTDOWN_DRAIN_MS`, closes SQLite cleanly
- In-process cron sweep every hour for orphan covers (`apps/api/src/index.ts:96`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Tooling
- Config: `biome.json`
- Scripts: `bun run lint` (= `biome check .`), `bun run format` (= `biome format --write .`)
## Formatting Rules (Biome)
| Rule | Setting |
|---|---|
| Indent | 2 spaces |
| Line width | 100 |
| JS/TS quotes | single `'foo'` |
| JSX quotes | double `"foo"` |
| Semicolons | always |
| Trailing commas | all |
| Arrow parens | always `(x) => …` |
| Imports | auto-organized (`organizeImports.enabled = true`) |
- `style/noNonNullAssertion`: **off** — `!` allowed
- `suspicious/noExplicitAny`: **warn** — discouraged, not blocking. Add inline biome-ignore with rationale when used (see `apps/api/src/routes/_problem-json.ts:62`)
- `a11y/noSvgWithoutTitle`: off
- `complexity/noForEach`: off
## Naming Patterns
- TS modules: `kebab-case.ts` — `create-game.ts`, `drizzle-game-repository.ts`, `game-value-objects.ts`
- React components: `kebab-case.tsx` — `game-form.tsx`, `data-table.tsx`, `add-platform-dialog.tsx`
- Tests: `<name>.test.ts` (co-located OR sibling `__tests__/`) — both coexist; new tests prefer `__tests__/`
- Integration tests: `<name>.int.test.ts` (`apps/api/src/routes/__tests__/idempotency.int.test.ts`)
- Snapshot tests: `<name>.snapshot.test.ts`
## Import Organization
## Error Handling
- Validation/business-rule failures **return `err(...)`, never throw**.
- All use-case `execute()` signatures return `Promise<Result<Success, FooError>>`.
- Canonical usage: `apps/api/src/application/games/create-game.ts`.
## Validation
- Validation lives at the **application-layer boundary**, not in routes.
- Prefer `safeParse` + `Result` over `.parse()` (which throws).
- Tagged unions: `z.discriminatedUnion('kind', [OwnedSchema, WishlistSchema])`.
- Coerce strings at the edge: `z.coerce.number().int().min(1970).max(2100)`.
- Cross-field invariants: `.refine((d) => d.from <= d.to, { path: ['from'], message: '...' })`.
## Logging
- **No `console.*` in API production code.** The only `console.log` lives inside the logger module itself as the default sink (`logger.ts:127`); tests inject their own sink.
- Request-scoped child loggers attach `requestId`, `userId` via `requestContext()` middleware. Access via `c.get('logger') as Logger`.
## Function Design
- Pure where possible; side effects live in `infrastructure/` adapters and `routes/`.
- **Constructor-injected dependencies** for use-cases:
- Single public method per use-case (`execute`).
- Aggregates are immutable; mutating methods return a new instance (`Game.applyMetadata` → `Result<Game, ...>`).
- Keep helpers module-private unless reused (e.g. `escapeLikeWildcards` in `list-games.ts`).
## Module Design
- **Named exports only.** No `export default` in `src/` (defaults appear only in `vite.config.ts`, `drizzle.config.ts`, etc.).
- **No barrel `index.ts` files** in API code — every import names the exact file (`from '../../domain/games/game'`). Maintains DDD-layer visibility.
- Shared cross-package types live in `@apex/shared` (`packages/shared/src/index.ts` re-exports import schemas/types).
- Client uses `@/components/...` / `@/lib/...` aliases; sub-folders (`components/ui`, `components/auth`, `components/layout`) imported by file, not via barrels.
## Comments
- `apps/api/src/application/games/delete-game.ts:9-19` — long TSDoc explains why cover cleanup is intentionally deferred to a cron (race conditions).
- TSDoc on public domain methods and exported interfaces (`Game.moveToCollection`, `Logger`, `ApiError`, `apiFetch`).
- Biome-ignore directives are always accompanied by a rationale: `// biome-ignore lint/suspicious/noExplicitAny: Hono generic shape varies per app instance.`
## Domain Modelling Conventions
- **Private constructor + static factory.** `new Game(...)` is private; callers use `Game.fromPersistence(row)` (trusted) or `NewGame.create(props)` (validating, returns `Result`).
- **Value objects wrap primitives** with `create(...)` (validates, returns `Result`) and `fromTrusted(...)` (skips validation, hydration only). Access raw via `.value`. Examples: `ReleaseYear`, `HoursPlayed`, `Price`, `PurchasedAt`, `CoverImageUrl`, `ExternalMetadataRef`.
- **Aggregates are immutable.** Mutating methods return a fresh instance wrapped in `Result`.
- **Repository interfaces live in `domain/`**, Drizzle implementations in `infrastructure/`.
- **Optimistic locking:** pass `expectedUpdatedAt: Date` on `update`/`delete`/`saveMetadata`. Infra throws `OptimisticLockError`; use-cases catch and return `err({ kind: 'conflict' })`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| HTTP entrypoint | Boot Bun.serve, mount routes, graceful shutdown, cron tick | `apps/api/src/index.ts` |
| Composition root | Instantiate repos, use cases, IGDB chain, idempotency middleware | `apps/api/src/wiring.ts` |
| Auth | better-auth + Drizzle adapter; rate-limited `/sign-in/email` | `apps/api/src/infrastructure/auth/auth.ts` |
| Auth gate (HTTP) | Resolve session, attach `user`/`session`/`logger` to context | `apps/api/src/routes/middleware/require-auth.ts` |
| Game aggregate | Encapsulate invariants, `applyMetadata`, `moveToCollection` | `apps/api/src/domain/games/game.ts` |
| Game repository (port) | Read/write game rows; optimistic update/delete; per-user filtering | `apps/api/src/domain/games/game-repository.ts` |
| Game repository (adapter) | Drizzle implementation; LIKE escaping; `withTx` binding | `apps/api/src/infrastructure/games/drizzle-game-repository.ts` |
| Dictionary subsystem | Generic CRUD factory shared by platforms / genres / developers | `apps/api/src/application/dictionary/make-dictionary-use-cases.ts`, `apps/api/src/routes/_make-dictionary-router.ts` |
| IGDB metadata chain | tokenStore → http client (breaker + rate limiter) → adapter → caching decorator → use cases | `apps/api/src/infrastructure/igdb/*`, `apps/api/src/infrastructure/metadata/*` |
| Cover storage | UploadThing adapter + orphan-cleanup cron | `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`, `apps/api/src/application/cover-storage/cleanup-orphans.ts` |
| Idempotency | Hashed request fingerprint, replay cached response, TTL sweep | `apps/api/src/routes/middleware/idempotency-key.ts`, `apps/api/src/infrastructure/idempotency/drizzle-idempotency-key-repository.ts` |
| SPA shell | React Router v6 with `AuthLayout` (public) and `ProtectedRoute → AppLayout` (private) | `apps/client/src/main.tsx`, `apps/client/src/components/auth/protected-route.tsx`, `apps/client/src/components/layout/app-layout.tsx` |
| Data fetching | TanStack Query hooks built on `apiFetch` (cookie auth + RFC 7807 parsing) | `apps/client/src/lib/queries.ts`, `apps/client/src/lib/api.ts`, `apps/client/src/lib/api-fetch.ts` |
| Shared contracts | Zod schemas for import/export snapshots (v1..v4 + external) | `packages/shared/src/index.ts` |
## Pattern Overview
- Bun monorepo (`workspaces: ["apps/*", "packages/*"]`) — `@apex/api`, `@apex/client`, `@apex/shared`.
- Domain layer is pure TypeScript: no Drizzle, no Hono, no Zod (Zod only lives in `application/` at the boundary).
- Use cases are classes with `execute(input, userId)` returning `Result<T, E>` — no throws for business errors.
- Repositories: interfaces in `domain/`, `Drizzle<Aggregate>Repository` in `infrastructure/`, transactional binding via `withTx(tx)`.
- Cross-aggregate atomicity via the `TransactionRunner` port (`apps/api/src/application/shared/transaction-runner.ts`).
- Optimistic concurrency on `Game` via `expectedUpdatedAt` → `OptimisticLockError` → HTTP 409 problem+json.
- Per-user row scoping enforced at the repo layer (every query includes `eq(table.userId, …)`); routes get `userId` from `c.get('user').id`.
- IGDB chain composed in `wiring.ts` only when both credentials are present; otherwise endpoints return 503 and the rest of the API boots normally.
## Layers
- Purpose: Map HTTP I/O ↔ use-case I/O; produce RFC 7807 problem+json.
- Location: `apps/api/src/routes/`
- Contains: Hono sub-routers, middleware, problem-json helpers.
- Depends on: `application/` (via `wiring.ts`).
- Used by: `apps/api/src/index.ts`.
- Purpose: Validate input, orchestrate domain + repositories, run transactions, return `Result`.
- Location: `apps/api/src/application/`
- Contains: `idempotency/`, `shared/`, `cover-storage/`, `dictionary/`, `export/`, `import/`, `games/`.
- Depends on: domain interfaces only.
- Purpose: Aggregates, value objects, invariants, repository ports.
- Location: `apps/api/src/domain/`
- Contains: `games/`, `platforms/`, `genres/`, `developers/`, `dictionary/`, `import/`, `shared/result.ts`.
- Purpose: Drizzle repos, auth, IGDB, UploadThing, logging, cron, config.
- Location: `apps/api/src/infrastructure/`
- Contains: `db/`, `auth/`, `games/`, `dictionary/`, `idempotency/`, `igdb/`, `metadata/`, `cover-storage/`, `import/`, `logging/`, `cron/`, `config/`.
- Purpose: Import/export Zod schemas reused by client + API.
- Location: `packages/shared/src/`
- Purpose: Render pages, mutate via fetch, cache reads with TanStack Query.
- Location: `apps/client/src/`
- Contains: `pages/`, `components/` (feature + `ui/` shadcn + `layout/` + `auth/`), `hooks/`, `lib/`.
## Data Flow
### Primary Request Path — `GET /api/games`
### Mutating Request Path — `POST /api/games`
### Metadata Enrichment Path — `POST /api/games/:id/metadata`
### Background — Orphan Cover Cleanup
- Server: SQLite (`apps/api/data/apex.db`), WAL mode, migrations auto-run at boot (`apps/api/src/infrastructure/db/client.ts:25`).
- Process: `wiring.ts` holds singletons (repos, use cases, circuit breaker, rate limiter, token store, cron lock).
- Client: TanStack Query cache (`apps/client/src/lib/query-client.ts`); URL state via `useUrlState` (`apps/client/src/lib/url-state.ts`); session via `useSession` from better-auth/react.
## Key Abstractions
## Entry Points
## Architectural Constraints
- **Threading:** Single-threaded Bun event loop per process. SQLite WAL + serialized writes via Drizzle.
- **Global state:** Module-level singletons in `apps/api/src/wiring.ts`; module-level `db` and `sqlite` singletons in `apps/api/src/infrastructure/db/client.ts`; `globalThis.__apexDbMigrated` flag.
- **Per-user scoping:** Every game/dictionary/cover query MUST include `eq(table.userId, userId)`. Coverage verified by `apps/api/src/routes/games.idor.test.ts`.
- **Optimistic concurrency:** Mutating use cases re-read aggregate, capture `updatedAt`, pass to `repo.update/saveMetadata/delete`. `OptimisticLockError` → 409.
- **Idempotency:** All mutating routes use `idempotencyKeyMiddleware`. Clients generate one UUID per logical operation, reuse on retry.
- **CORS:** `corsAllowlist` from `CORS_ORIGIN` (CSV). `/health` mounted before CORS.
- **IGDB optional:** `igdbConfigured` gates the chain; off → 503 from search/enrich endpoints, rest of API boots fine.
- **Circular imports:** None observed.
## Anti-Patterns
### Skipping `wiring.ts` and `new`-ing dependencies in routes
### Throwing for business errors
### Forgetting per-user filtering
### Multi-aggregate writes outside `TransactionRunner.run`
### Calling `fetch` directly on the client
### Regex/sed-as-DRY-bandage
## Error Handling
- `Result.ok=false` carries `{ kind, ...payload }`; routes `switch` on `kind`.
- `OptimisticLockError` is the only exception used as control flow — caught at the route boundary → 409.
- Network errors on the client normalize to `ApiError` with `status=0`.
- Structured logger emits event names (e.g. `igdb.breaker.open`, `cleanup.orphans.completed`).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| caveman | > Ultra-compressed communication mode. Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy. Supports intensity levels: lite, full (default), ultra, wenyan-lite, wenyan-full, wenyan-ultra. Use when user says "caveman mode", "talk like caveman", "use caveman", "less tokens", "be brief", or invokes /caveman. Also auto-triggers when token efficiency is requested. | `.claude/skills/caveman/SKILL.md` |
| coding-plan-for-local-agents | > Pisz markdown-owe plany zadań programistycznych zoptymalizowane pod lokalne/otwarte coding agents klasy Gemma 3/4 27B, GLM-4.6 (Big Pickle w OpenCode Zen), Qwen Coder, DeepSeek Coder, Kimi K2, MiniMax M2 i podobnych open-weight modeli. Triggeruj zawsze gdy użytkownik prosi o plan, TODO, task breakdown, spec implementacyjny, workflow lub instrukcje krok-po-kroku dla zadania kodowania, które ma być wykonane przez inny model/agenta — szczególnie gdy wymienia: OpenCode, Big Pickle, GLM, Gemma, Qwen, DeepSeek, Ollama, LM Studio, lokalny model, open-weight, sub-agent, coding agent. Triggeruj też gdy użytkownik planuje wykonanie wieloetapowego taska w innej sesji/agencie niż bieżąca rozmowa. Plany pisane są jako FAZY (osobne pliki po 3-4 kroki), vertical slice z DDD, TDD, separation of concerns w React, Context7 do docs, stack: Bun + Hono + Drizzle + Better-Auth + React + Radix + Tailwind. NIE używaj gdy plan jest dla człowieka-dewelopera ani gdy użytkownik prosi o implementację. | `.claude/skills/coding-plan-for-local-agents/SKILL.md` |
| ddd-expert | > Senior DDD expert for large, multi-team projects. Trigger for: bounded contexts, aggregates, domain events, event storming, context maps, ubiquitous language, CQRS, domain services, repositories, value objects, strategic/tactical design, messy domain modelling, microservices team boundaries. Trigger for integration patterns: outbox, saga, idempotency, payment integrations (Stripe, PayU, Przelewy24), email/SMS services, webhooks, dual-write problems. Trigger for architectural layering: ports and adapters, hexagonal/clean/onion architecture, dependency inversion, layer violations, domain testability. Trigger for domain policy questions: specification pattern, strategy pattern, pricing rules, discount policies, eligibility rules, fraud detection, business rule composition. Do NOT wait for an explicit "use DDD" request — trigger whenever the problem involves complex domain logic, integration reliability, or architectural layering in a large system. | `.claude/skills/ddd-expert/SKILL.md` |
| ddd-reviewer | > Dociekliwy, krytyczny reviewer implementacji DDD. Triggeruj zawsze gdy: użytkownik pokazuje kod do review, pyta o jakość implementacji DDD, chce sprawdzić czy kod jest zgodny z DDD, prosi o ocenę architektury, pokazuje strukturę projektu, warstwy, bounded contexty, agregaty, serwisy domenowe, repozytoria lub eventy. Triggeruj nawet jeśli użytkownik nie wymienia wprost "DDD" — wystarczy że pokazuje kod domenowy, serwisy aplikacyjne, repozytoria lub pyta "czy to dobrze zaprojektowane". Ten skill wychodzi z założenia, że każdy kod ma błędy i szuka ich aktywnie. Nie używaj do ogólnych pytań o teorię DDD bez pokazanego kodu — użyj wtedy ddd-expert. | `.claude/skills/ddd-reviewer/SKILL.md` |
| enterprise-web-expert | \| Senior enterprise web application architect. Stack: Bun + HonoJS + Drizzle + PostgreSQL + Better-Auth. Trigger when user: asks about enterprise web app architecture or API design; needs help with error handling, crash recovery, or structured logging; asks about authentication/authorization (Better-Auth, JWT, RBAC, IDOR, sessions); needs transaction management, Outbox/Saga pattern, or idempotency; asks about service communication, circuit breakers, or retries; wants graceful shutdown, health checks, or lifecycle management; shows backend code for review or security audit; mentions production-readiness, resilience, or distributed systems. Also trigger for Bun, Hono, Drizzle, or Better-Auth questions. Use even without "enterprise" — trigger whenever backend code needs to handle real-world failures. | `.claude/skills/enterprise-web-expert/SKILL.md` |
| grill-me | Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me". | `.claude/skills/grill-me/SKILL.md` |
| run-plan | > Run a phased implementation plan autonomously by spawning a fresh typescript-principal-agent subagent per phase. Use when the user has a plan split across multiple `phase-*.md` (or `*-phase.md`, `01-*.md`, etc.) files in a directory and wants the plan executed end-to-end without manually launching an agent per phase. Each phase runs in an isolated context window so the main conversation does not degrade. Trigger when the user says "run plan", "wykonaj plan", "odpal fazy", "uruchom plan z katalogu X", "wykonaj plan z docs/plans/...", or invokes `/run-plan <path>`. Do NOT use to *write* a plan (that's `coding-plan-for-local-agents`), nor to run a single file (just spawn the agent directly). | `.claude/skills/run-plan/SKILL.md` |
| ux-ui-expert | > Senior UX/UI designer and React frontend expert. Trigger this skill whenever the user wants to design or build a modern, beautiful, and functional web application UI using React, Tailwind CSS, and shadcn/ui — with mobile-first and responsive (desktop) design. Use even when the user just says "zaprojektuj", "stwórz aplikację", "zrób UI", "zrób interfejs", "design aplikacji", or asks for a component, screen, dashboard, form, or any interface in React/Tailwind/shadcn. Trigger for partial requests too: "zrób ładny login", "strona główna SaaS", "dashboard admina". This skill produces production-ready, mobile-first React code with Tailwind + shadcn/ui that looks polished, modern, and is genuinely usable on both mobile and desktop. Always use this skill over the generic frontend-design skill when the stack is React + Tailwind + shadcn. | `.claude/skills/ux-ui-expert/SKILL.md` |
| shadcn | Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "create an app with --preset", or "switch to --preset". | `.agents/skills/shadcn/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
