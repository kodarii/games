# External Integrations

**Analysis Date:** 2026-05-12

## APIs & External Services

**Game Metadata (IGDB):**
- IGDB (Twitch-owned games database) - used to search and enrich game metadata (titles, covers, platforms, developers, release dates)
  - Base URL: `https://api.igdb.com/v4` (`apps/api/src/wiring.ts:203`)
  - SDK/Client: Custom HTTP client `apps/api/src/infrastructure/igdb/igdb-http-client.ts` using global `fetch` with Apicalypse plain-text bodies
  - Headers: `client-id`, `Authorization: Bearer <token>`, `accept: application/json`, `content-type: text/plain`
  - Auth: Twitch OAuth2 client-credentials grant at `https://id.twitch.tv/oauth2/token` (`apps/api/src/infrastructure/igdb/igdb-token-store.ts:6`)
  - Env vars: `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` (optional - feature disabled at wiring time when missing; `searchGameMetadata`/`enrichGameMetadata` become `null`, routes return 503)
  - Adapter: `IgdbGameMetadataProvider` (`apps/api/src/infrastructure/igdb/igdb-game-metadata-provider.ts`) with zod schemas for response validation
  - Resilience: Token bucket rate limiter (capacity 4, refill 250ms), circuit breaker (5 failures/60s window, half-open after 30s), in-flight semaphore (default 8), retries on 429/5xx/network with exponential backoff + jitter, honors `Retry-After`, single forced token refresh on 401
  - Token persistence: `igdb_oauth_token` table via `DrizzleIgdbTokenStorage`; refreshed when <24h to expiry
  - Caching: `CachingGameMetadataProvider` wraps adapter; positive TTL `IGDB_CACHE_TTL_DAYS` (default 30d), negative TTL 1d
  - Platform name mapping: `apps/api/src/infrastructure/igdb/igdb-platform-map.ts`

**File Upload (UploadThing):**
- UploadThing - cover image hosting/CDN
  - SDK: `uploadthing` ^7.7.4, server `UTApi` (`apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`)
  - Operations: `uploadFiles`, `deleteFiles`, `listFiles` (paged at 500)
  - URL form: `https://utfs.io/f/<key>` and arbitrary `*.ufs.sh` subdomains
  - Env var: `UPLOADTHING_TOKEN` (required, min 1 char)
  - Route: `POST /api/upload/cover` (`apps/api/src/routes/upload.ts`); enforces 5 MiB max, MIME allowlist `image/jpeg|png|webp`
  - Disabled gracefully: when token missing, `coverStorage` is `null` and route returns 503 `problem+json`

**Provider registry:** `SUPPORTED_PROVIDERS = ['igdb']` in `apps/api/src/infrastructure/config/providers.ts` (single source of truth for adding future providers like RAWG/MobyGames)

## Data Storage

**Databases:**
- SQLite (single file, embedded)
  - Connection: `bun:sqlite` (`new Database(DB_PATH)`) with `PRAGMA journal_mode = WAL` (`apps/api/src/infrastructure/db/client.ts:19`)
  - Client/ORM: Drizzle ORM via `drizzle-orm/bun-sqlite`
  - Path: `apps/api/data/apex.db` (created automatically if directory missing)
  - Migrations: `apps/api/drizzle/*.sql` (17 migrations, 0000–0017), auto-applied on boot via `drizzle-orm/bun-sqlite/migrator`
  - Schemas: `apps/api/src/infrastructure/db/schema.ts` (game domain), `apps/api/src/infrastructure/db/auth-schema.ts` (better-auth)
  - Migration tooling: `drizzle-kit` CLI (`bun db:generate`, `bun db:migrate`); config in `apps/api/drizzle.config.ts`

**File Storage:**
- UploadThing (see above) - cover images only
- Local filesystem: SQLite db files only (`apex.db`, `apex.db-shm`, `apex.db-wal`)

**Caching:**
- In-process metadata cache backed by SQLite (`MetadataCacheRepository` in `apps/api/src/infrastructure/metadata/metadata-cache-repository.ts`, table from migration `0014_add_metadata_tables.sql`)
- No Redis / Memcached

## Authentication & Identity

**Auth Provider:**
- Better Auth ^1.6.9 (`apps/api/src/infrastructure/auth/auth.ts`)
  - Adapter: `drizzleAdapter(db, { provider: 'sqlite' })`
  - Method: Email + password only (`emailAndPassword.enabled: true`, `minPasswordLength: 8`, `autoSignIn: true`)
  - Routes mounted at: `POST|GET /api/auth/*` (`apps/api/src/index.ts:55`)
  - Trusted origins from `CORS_ORIGIN` env list, validated by `validateAuthConfig` (`apps/api/src/infrastructure/auth/auth-config.ts`)
  - Rate limiting: enabled built-in; global `100/60s`, `/sign-in/email` overridden to `5/60s`
  - Client: `better-auth/react` `createAuthClient()` → `signIn`, `signUp`, `signOut`, `useSession` (`apps/client/src/lib/auth-client.ts`)
  - Session enforcement: `requireAuth` middleware (`apps/api/src/routes/middleware/require-auth.ts`) guards all `/api/*` except `/api/auth/*` and `/health`
  - Upload also requires `requireUploadPermission` (`apps/api/src/routes/middleware/require-upload-permission.ts`)
  - Env vars: `BETTER_AUTH_SECRET` (min 32 chars), `BETTER_AUTH_URL`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry / Rollbar / Datadog integrations)

**Logs:**
- Custom structured logger (`apps/api/src/infrastructure/logging/logger.ts`) - `baseLogger.event(name, fields)` / `.error({ event, err })`
- Request context middleware (`apps/api/src/infrastructure/logging/request-context-middleware.ts`) - per-request correlation
- Log level controlled by `LOG_LEVEL` env (`debug|info|warn|error`, default `info`)
- Auth header redaction helper `redactAuthHeaders` (`apps/api/src/infrastructure/igdb/igdb-http-client.ts:262`)

**Health Probes:**
- `GET /health` mounted BEFORE CORS and request-context middleware so Kubernetes-style probes always succeed (`apps/api/src/index.ts:30`); pings DB with `SELECT 1`

## CI/CD & Deployment

**Hosting:**
- Self-hosted VPS (deployment over SSH)

**CI Pipeline:**
- GitHub Actions workflow: `.github/workflows/deploy.yml`
- Trigger: push to `main`
- Runner: `ubuntu-latest`
- Action: `appleboy/ssh-action@v1` invokes `/root/apex/scripts/deploy.sh` on the remote host
- Secrets required (GitHub repo secrets): `VPS_HOST`, `VPS_SSH_KEY`, `VPS_SSH_PORT`
- No explicit lint/test/typecheck job — quality gates run locally (`bun lint`, `bun typecheck`, `bun test`)

**Graceful shutdown:**
- SIGTERM/SIGINT handlers in `apps/api/src/index.ts:127` drain HTTP server, close SQLite, bound by `SHUTDOWN_DRAIN_MS` (default 25 s) so k8s SIGKILL never finds a draining process

## Environment Configuration

**Required env vars (API will fail to boot if missing):**
- `BETTER_AUTH_SECRET` (>=32 chars)
- `BETTER_AUTH_URL`
- `CORS_ORIGIN` (CSV)
- `UPLOADTHING_TOKEN`

**Optional / feature-gated:**
- `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` - omitting either disables metadata feature; API boots normally and metadata routes return 503
- `IGDB_TIMEOUT_MS`, `IGDB_CACHE_TTL_DAYS`, `LOG_LEVEL`, `SHUTDOWN_DRAIN_MS`, `IDEMPOTENCY_TTL_HOURS`, `PORT`, `HOSTNAME`

**Secrets location:**
- Local dev: `.env` files in `apps/api/` (gitignored; not committed)
- Production: managed on VPS host filesystem; GitHub secrets only used for SSH deploy credentials
- Validation: All env vars parsed by zod at startup (`apps/api/src/infrastructure/config/env.ts:36`) — invalid env aborts boot

## Webhooks & Callbacks

**Incoming:**
- None detected (no `/webhook*` routes; UploadThing used in server-side direct-upload mode via `UTApi.uploadFiles`, not via signed-URL callbacks)

**Outgoing:**
- IGDB: `POST` requests to `https://api.igdb.com/v4/{games,...}` (Apicalypse bodies)
- Twitch OAuth: `POST https://id.twitch.tv/oauth2/token` for client-credentials grant
- UploadThing: SDK-mediated requests (URLs handled internally by `uploadthing/server`)

## CORS & Network Boundaries

**CORS allowlist (`apps/api/src/index.ts:39`):**
- Origins: exact match against `Set(env.CORS_ORIGIN)` - reflects matching origin, rejects others
- `credentials: true`, methods `POST|GET|OPTIONS|PUT|DELETE`, headers `Content-Type`, exposes `Content-Length`, preflight `maxAge: 600`
- Scope: only `/api/*` is wrapped; `/`, `/health` are exempt

**Allowed cover image hosts (`apps/api/src/infrastructure/config/cover-hosts.ts`):**
- Exact: `images.igdb.com`, `utfs.io`
- Suffix wildcard: `.ufs.sh` (UploadThing subdomain CDN)
- Used by `EnrichGameMetadata` to validate inbound cover URLs before persisting

---

*Integration audit: 2026-05-12*
