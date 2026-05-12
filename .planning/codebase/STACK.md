# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript ^5.6.3 - Used across all workspaces (api, client, shared); strict mode enabled in `tsconfig.base.json`

**Secondary:**
- SQL (Drizzle migrations in `apps/api/drizzle/*.sql`) - Schema migrations
- HTML/CSS - `apps/client/index.html`, Tailwind CSS in `apps/client/src/index.css`

## Runtime

**Environment:**
- Bun (server) - `apps/api` runs on `Bun.serve` (`apps/api/src/index.ts:84`), uses `bun:sqlite` native driver, `bun:test` for tests
- Node.js / Browser (client) - `apps/client` is a Vite-built SPA; dev/build runs under Node-compatible tooling
- API tsconfig declares `"types": ["bun"]` (`apps/api/tsconfig.json`)

**Package Manager:**
- Bun (workspaces enabled in root `package.json`)
- Lockfile: `bun.lock` present at repo root
- Workspaces: `apps/*`, `packages/*`

## Frameworks

**Core (API):**
- Hono ^4.6.12 - HTTP framework (`apps/api/src/index.ts`)
- Drizzle ORM ^0.45.2 - SQLite ORM (`drizzle-orm/bun-sqlite`)
- Better Auth ^1.6.9 - Authentication with `drizzleAdapter` (`apps/api/src/infrastructure/auth/auth.ts`)

**Core (Client):**
- React ^18.3.1 + ReactDOM ^18.3.1
- React Router DOM ^6.28.0 - `createBrowserRouter` (`apps/client/src/main.tsx`)
- TanStack Query ^5.99.2 - Server-state cache (`apps/client/src/lib/query-client.ts`)
- TanStack Table ^8.21.3 - Tables (project rule: all tables via `@/components/data-table.tsx`)
- Tailwind CSS ^3.4.17 + shadcn/ui (style: `new-york`, base color: `neutral`) - see `apps/client/components.json`
- Radix UI primitives - alert-dialog, checkbox, dialog, dropdown-menu, popover, separator, slider, slot, tooltip
- Better Auth React client (`better-auth/react`) - `apps/client/src/lib/auth-client.ts`

**Testing:**
- `bun:test` - Built-in Bun test runner; co-located `*.test.ts` files (e.g. `apps/api/src/routes/games.test.ts`, `apps/api/src/infrastructure/**/__tests__/*`)
- No separate test framework (no Jest / Vitest config files)

**Build/Dev:**
- Vite ^5.4.11 - Client dev server (`apps/client/vite.config.ts`), port 5173, proxies `/api` → `http://localhost:3001`
- `@vitejs/plugin-react` ^4.3.4
- Drizzle Kit ^0.31.10 - Migration generator (`db:generate`, `db:migrate`)
- PostCSS ^8.4.49 + Autoprefixer ^10.4.20
- `tailwindcss-animate` ^1.0.7

## Key Dependencies

**Critical:**
- `hono` ^4.6.12 - HTTP routing and middleware (cors, body-limit) in API
- `better-auth` ^1.6.9 - Email+password auth with built-in rate limiting (`/sign-in/email`: 5/60s)
- `drizzle-orm` ^0.45.2 + `better-sqlite3` ^12.9.0 - Persistence (Bun also uses `bun:sqlite` natively)
- `zod` ^4.3.6 - Schema validation in env, request bodies, IGDB responses (shared across api/client/shared)
- `uploadthing` ^7.7.4 - Cover image storage SDK (`UTApi` in `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`)

**Infrastructure:**
- `@tanstack/react-query` ^5.99.2 - Client query client (`staleTime: 30_000`, `retry: 1`)
- `@tanstack/react-table` ^8.21.3 - Server-side paged/sorted tables
- `react-router-dom` ^6.28.0 - SPA routing
- `sonner` ^1.7 - Toast notifications (`<Toaster richColors position="top-center" />`)
- `lucide-react` ^1.14.0 - Icon set
- `class-variance-authority` ^0.7.1, `clsx` ^2.1.1, `tailwind-merge` ^2.5.5 - Styling helpers
- `vaul` ^1.1 - Drawer primitive
- `@apex/shared` - Internal workspace package (zod schemas shared between api+client)

## Configuration

**Environment (API, validated via zod in `apps/api/src/infrastructure/config/env.ts`):**
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

**Env file presence:** `.env*` files are gitignored; not detected at repo root during analysis.

**Build:**
- API: `bun build src/index.ts --target=bun --outdir=dist`
- Client: `tsc -b && vite build` → `apps/client/dist`
- TypeScript strict mode (`tsconfig.base.json`): `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`

**Linting/Formatting:**
- Biome 1.9.4 (`biome.json`) - lint + format
- Settings: 2-space indent, line width 100, single quotes (JSX double), semicolons always, trailing commas all
- Ignores: `**/dist`, `**/node_modules`, `**/components/ui/**`, `apps/api/src/infrastructure/db/auth-schema.ts`, `apps/api/drizzle/**`
- Linter rules: `noNonNullAssertion: off`, `noExplicitAny: warn`, `noSvgWithoutTitle: off`, `noForEach: off`

## Platform Requirements

**Development:**
- Bun runtime (required - workspace + `bun:sqlite` + `bun:test`)
- SQLite database file auto-created at `apps/api/data/apex.db` with WAL mode (`apps/api/src/infrastructure/db/client.ts:20`)
- Migrations auto-applied on first DB access (`apps/api/src/infrastructure/db/client.ts:26`)
- Ports: API `:3001`, Vite client `:5173`

**Production:**
- VPS deploy via SSH (`.github/workflows/deploy.yml` uses `appleboy/ssh-action@v1`)
- Triggered by push to `main`, runs `/root/apex/scripts/deploy.sh` on the VPS
- Graceful shutdown handler (`apps/api/src/index.ts:127`): SIGTERM/SIGINT, bounded by `SHUTDOWN_DRAIN_MS`, closes SQLite cleanly
- In-process cron sweep every hour for orphan covers (`apps/api/src/index.ts:96`)

---

*Stack analysis: 2026-05-12*
