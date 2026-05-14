# Phase 3 — Security Hardening Design Spec

**Date:** 2026-05-14
**Owner:** Paweł Tkocz
**Status:** Approved for implementation
**Related milestone:** v1.0, Phase 3 (Security Hardening)

## Context

Phase 1 (Settings shell + Konto) and Phase 2 (IGDB Integrations panel) are shipped. Phase 3 adds production-grade hardening on top of the validated baseline:

- Mutating `/api/*` routes have no per-user rate limit today (better-auth only protects `/api/auth/*`).
- No CSRF defense middleware exists for `/api/*`; only `CORS` allowlist constrains browsers.
- Better-auth session cookie uses its default `SameSite=Lax`; we want `Strict`.
- `BETTER_AUTH_SECRET: z.string().min(32)` happily accepts the sentinel value `replace-with-32-byte-random-aaaaaaaaaa` shipped in `.env.example`.

Phase 2 implementation diverged from the original spec on one point: `aes-256-gcm-cipher.ts` derives the AES key via HKDF-SHA256 from `BETTER_AUTH_SECRET` instead of a separate `SETTINGS_ENC_KEY` env var. The user has accepted this as the new truth — `.planning/*` documentation will be updated in this phase rather than fighting the code.

## Goal

Land four layered security improvements in a single commit on `main`, with regression tests pinning the behavior:

1. Origin-allowlist CSRF guard on mutating `/api/*`.
2. Per-user fixed-window mutation rate limit (60 req/min) on mutating `/api/*`.
3. Session cookie hardened to `SameSite=Strict`.
4. Env validation rejects the example sentinel `BETTER_AUTH_SECRET`.

Plus: bring `.planning/*` documentation in line with the actual cipher implementation (one keyed root: `BETTER_AUTH_SECRET`).

## Non-goals

- No change to better-auth's existing rate limit on `/api/auth/*` (already 100/60s, 5/60s on `/sign-in/email`).
- No new `SETTINGS_ENC_KEY` env var. The HKDF-from-`BETTER_AUTH_SECRET` design stands.
- No multi-tenant abstraction or per-route threshold knob — single global limit (60/min) covers every mutating endpoint. A `{ limit?: number }` option may be added later if needed; not in this phase.
- No replacement of the auto-migrate-on-boot mechanism (that is Phase 5 / BE-01).
- No frontend changes. SPA is unaffected; same-origin requests stay legal under all four new rules.
- No external rate-limit storage (Redis etc.). SQLite is the persistent store; in-process Bun is acceptable for a single-user single-deploy app.

## Architecture

### Middleware order in `apps/api/src/index.ts`

```
/health                                  ← bez auth/CORS (unchanged)
requestContext()                         ← unchanged
cors(/api/*)                             ← unchanged
/api/auth/*  →  auth.handler             ← unchanged (better-auth owns rate-limit here)
─────────────  NEW  ─────────────
originGuard(/api/*)                      ← NEW. Origin allowlist check for mutating methods
requireAuth(per-feature)                 ← unchanged
mutationRateLimit(per-feature)           ← NEW. Per-user SQLite fixed-window for mutating methods
requireUploadPermission(/api/upload/*)   ← unchanged
idempotencyKeyMiddleware (route-local)   ← unchanged
→ handler
```

Rationale:
- `originGuard` is mounted BEFORE `requireAuth` so foreign-origin attacks are rejected without a session lookup.
- `mutationRateLimit` is mounted AFTER `requireAuth` because it needs `c.get('user').id`.
- Both middleware ignore safe methods (`GET`, `HEAD`, `OPTIONS`). Reads are not rate-limited or origin-checked.

`/api/auth/*` is NOT touched by these new middleware — better-auth keeps owning that surface end-to-end.

## Changes

### 1. `originGuard` — `apps/api/src/routes/middleware/origin-guard.ts` (NEW)

~25 lines. Reads `Origin` request header.

```ts
import type { MiddlewareHandler } from 'hono';
import { problemResponse } from '../_problem-json';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function originGuard(allowedOrigins: ReadonlySet<string>): MiddlewareHandler {
  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) {
      return next();
    }
    const origin = c.req.header('origin');
    if (!origin || !allowedOrigins.has(origin)) {
      return problemResponse(c, {
        type: '/errors/csrf-rejected',
        title: 'Forbidden',
        status: 403,
        detail: 'Origin header missing or not allowlisted',
      });
    }
    return next();
  };
}
```

Wiring in `index.ts`: mount globally after the existing `cors()` block, **before** any `requireAuth`:

```ts
app.use('/api/*', originGuard(corsAllowlist));
```

`corsAllowlist` is the existing `Set<string>` built from `env.CORS_ORIGIN` at module top.

Add new stable problem-json type URI to `_problem-json.ts` if it tracks a constant set:
```ts
// '/errors/csrf-rejected' added to the registry
```

### 2. `mutationRateLimit` — `apps/api/src/routes/middleware/mutation-rate-limit.ts` (NEW)

Per-user fixed-window counter. Window = 60 seconds. Default limit = 60 mutations / minute.

**Persistence:** new SQLite table.

Migration `apps/api/drizzle/00XX_rate_limit_buckets.sql` (auto-applied on boot today; Phase 5 will move to a separate script):

```sql
CREATE TABLE rate_limit_buckets (
  user_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX rate_limit_buckets_window_start_idx ON rate_limit_buckets(window_start);
```

Drizzle schema in `apps/api/src/infrastructure/db/schema.ts` adds:

```ts
export const rateLimitBuckets = sqliteTable(
  'rate_limit_buckets',
  {
    userId: text('user_id').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.windowStart] }),
    windowStartIdx: index('rate_limit_buckets_window_start_idx').on(t.windowStart),
  }),
);
```

**Middleware logic:**

```ts
import type { MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { rateLimitBuckets } from '../../infrastructure/db/schema';
import { problemResponse } from '../_problem-json';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

type Deps = {
  db: typeof import('../../infrastructure/db/client').db;
  now: () => number;
  limit?: number;
};

export function mutationRateLimit(deps: Deps): MiddlewareHandler {
  const limit = deps.limit ?? DEFAULT_LIMIT;
  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) {
      return next();
    }
    const user = c.get('user') as { id: string } | undefined;
    if (!user) {
      // Should not happen — requireAuth runs first. Fail closed.
      return problemResponse(c, {
        type: '/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Rate limit could not resolve user',
      });
    }
    const nowMs = deps.now();
    const windowStart = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;

    const result = await deps.db
      .insert(rateLimitBuckets)
      .values({ userId: user.id, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBuckets.userId, rateLimitBuckets.windowStart],
        set: { count: sql`${rateLimitBuckets.count} + 1` },
      })
      .returning({ count: rateLimitBuckets.count });

    const currentCount = result[0]?.count ?? limit + 1;
    if (currentCount > limit) {
      const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - nowMs) / 1000);
      c.header('Retry-After', String(retryAfterSeconds));
      return problemResponse(c, {
        type: '/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: `Mutation rate limit exceeded (${limit}/min)`,
        retryAfterSeconds,
      });
    }
    return next();
  };
}
```

**Wiring** in `index.ts`: instantiate once via `wiring.ts`, then mount per-feature alongside `requireAuth`:

```ts
const rateLimitMutations = mutationRateLimit({ db, now: () => Date.now() });

app.use('/api/games/*', requireAuth);
app.use('/api/games/*', rateLimitMutations);
app.route('/api/games', games);

app.use('/api/platforms/*', requireAuth);
app.use('/api/platforms/*', rateLimitMutations);
app.route('/api/platforms', platforms);

// ... same for genres, developers, export, import, me, integrations, upload
```

Order matters: `requireAuth` must run first so `mutationRateLimit` can read `c.get('user')`.

**Cron sweep.** Existing cron infrastructure (`apps/api/src/infrastructure/cron/` + scheduled in `apps/api/src/index.ts:96`) currently sweeps orphan covers. Add a second sweep:

```ts
// In wiring.ts or a new application/rate-limit-sweep.ts
async function sweepRateLimitBuckets(now: number): Promise<void> {
  const cutoff = now - 2 * WINDOW_MS; // keep current + previous window
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, cutoff));
}
```

Scheduled every 5 minutes alongside cover-orphan sweep. Same cron-lock owner mechanism.

**Concurrency:** SQLite WAL serializes writes; `ON CONFLICT DO UPDATE` is atomic. Two concurrent mutations in the same window from the same user cannot both insert and both count as 1 — one becomes the update.

**Window-boundary race:** A request at `12:00:59.999` and one at `12:01:00.001` fall in different windows; worst case a user gets 120 mutations in 2 seconds. Accepted: this is single-user app where the threat model is runaway frontend / flood from outside, not surgical evasion.

### 3. Session cookie `SameSite=Strict` — `apps/api/src/infrastructure/auth/auth.ts`

Better-auth `advanced` block:

```ts
export const auth = betterAuth({
  baseURL: config.baseURL,
  secret: config.secret,
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  trustedOrigins: [...config.trustedOrigins],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'strict',
    },
  },
});
```

**Verification step during implementation:** use Context7 to confirm the exact `advanced.*` key name for the installed better-auth version (`^1.6.9`). If `defaultCookieAttributes` is wrong, the correct path may be `advanced.cookies.session.attributes.sameSite = 'strict'` or similar. The implementer MUST verify before coding.

**Regression risk:** SPA and API are same-origin (`Bun.serve :3001` serves the Vite static build in prod; in dev the Vite proxy keeps cookies same-origin). `SameSite=Strict` does NOT break this flow. Existing sign-in tests confirm cookie issuance and reuse — they will pass under Strict.

### 4. Sentinel deny-list — `apps/api/src/infrastructure/config/env.ts`

```ts
const SENTINEL_SECRETS = ['replace-with-32-byte-random-aaaaaaaaaa'] as const;

const envSchema = z.object({
  IGDB_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  IGDB_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(30),
  UPLOADTHING_TOKEN: z.string().min(1),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .refine(
      (s) => !SENTINEL_SECRETS.includes(s as (typeof SENTINEL_SECRETS)[number]),
      { message: 'BETTER_AUTH_SECRET equals the example sentinel — generate a real 32-byte secret' },
    ),
  BETTER_AUTH_URL: z.string().url(),
  CORS_ORIGIN: csvList,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().positive().default(25_000),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
});
```

This single refine protects both:
- Auth signing (better-auth uses the raw secret)
- Integration encryption (HKDF derives the AES key from it)

A bad secret crashes boot with a Zod error containing the message above — fail-fast.

### 5. Documentation alignment

Update `.planning/*` to reflect the actual cipher implementation (HKDF-from-`BETTER_AUTH_SECRET`):

- **`.planning/PROJECT.md`**
  - Line 43 (`Sekrety integracji szyfrowane at-rest…`): reword to remove `SETTINGS_ENC_KEY`; describe HKDF-from-`BETTER_AUTH_SECRET`.
  - Lines 120-121 (architecture decisions table): collapse the two rows into one, noting that the encryption root key derives from `BETTER_AUTH_SECRET` via HKDF-SHA256. Mark **Validated** (Phase 2 shipped).

- **`.planning/REQUIREMENTS.md`**
  - INT-03: reword to `Sekrety integracji są zaszyfrowane at-rest w SQLite (AES-GCM, klucz derived przez HKDF-SHA256 z BETTER_AUTH_SECRET)`. Mark `[x]`.
  - SEC-07: strikethrough or remove. Replace with a note: `~~SEC-07~~ — Resolved by HKDF-from-BETTER_AUTH_SECRET (Phase 2) + sentinel deny-list (SEC-04)`. Mark `[x]`.
  - SEC-V2-02: reword `Skrypt rotate-secret (re-encrypt-all dla rotacji BETTER_AUTH_SECRET)`.

- **`.planning/ROADMAP.md`**
  - Phase 2 Goal line: drop `SETTINGS_ENC_KEY` mention; reword to "encrypted at-rest with an AES key derived from BETTER_AUTH_SECRET via HKDF-SHA256".
  - Phase 2 Success Criteria #6: drop the `SETTINGS_ENC_KEY` boot fail-fast clause. The remaining `BETTER_AUTH_SECRET min(32)` check covers it.

- **`.planning/STATE.md`**
  - Line 72: remove the explicit "separate `SETTINGS_ENC_KEY` env-var (not derived from `BETTER_AUTH_SECRET`)" bullet. Replace with: `Integration secrets encrypted at-rest (AES-GCM); AES key derived via HKDF-SHA256 from BETTER_AUTH_SECRET (single root secret)`.

- **`CLAUDE.md`** (project conventions)
  - In the Configuration / Environment section, add a brief note under `BETTER_AUTH_SECRET`: `Also used as the root key for integration-secret encryption (via HKDF-SHA256). Rotating it invalidates all encrypted integration credentials — re-enter them via Settings UI.`
  - In the Constraints section, update the line about IGDB integration to remove any `SETTINGS_ENC_KEY` reference (none currently — verify before editing).

### 6. Tests

**Test framework:** `bun:test`. Convention: integration tests live as `*.int.test.ts` in `apps/api/src/routes/__tests__/`.

**`apps/api/src/routes/__tests__/csrf-origin-guard.int.test.ts`** — SEC-06

- `POST /api/games` with `Origin: https://evil.example.com` (and valid cookie) → status 403, body `type: '/errors/csrf-rejected'`.
- `POST /api/games` with **no** `Origin` header → status 403.
- `POST /api/games` with `Origin: http://localhost:5173` (allowlisted) → 201 (proceeds normally).
- `GET /api/games` with `Origin: https://evil.example.com` → 200 (reads are NOT origin-checked).

**`apps/api/src/routes/__tests__/rate-limit.int.test.ts`** — SEC-05

- Inject a controllable `now()` into `mutationRateLimit` deps.
- 60 sequential `POST /api/games` for the same user, all within one window → each returns 201.
- 61-st `POST /api/games` → 429, body `type: '/errors/rate-limited'`, header `Retry-After` present and numeric.
- Advance `now()` past the window boundary → 62-nd `POST` returns 201 again.
- 60 × `POST` + 100 × `GET` in one window → all succeed (GET not counted).
- Two different users in the same window do not interfere with each other.

**`apps/api/src/infrastructure/config/__tests__/env.test.ts`** — sentinel deny-list

- Parsing env with `BETTER_AUTH_SECRET = 'replace-with-32-byte-random-aaaaaaaaaa'` and otherwise-valid values → Zod throws with the sentinel message.
- Parsing env with a real 32-byte random string → succeeds.

**Cookie SameSite=Strict** — extend existing sign-in test (likely in `apps/api/src/infrastructure/auth/__tests__/`). After a successful sign-in, assert the `Set-Cookie` header contains `SameSite=Strict` (case-insensitive substring match).

## Commit

Single commit on `main` (per user preference):

```
fix(security): origin guard, per-user rate limit, SameSite=Strict, sentinel deny-list

- New middleware: originGuard rejects mutating /api/* with foreign/missing Origin (403)
- New middleware: mutationRateLimit caps mutating /api/* at 60/min/user (429 + Retry-After)
- Migration: rate_limit_buckets table + cron sweep (2-window TTL)
- Session cookie now SameSite=Strict (better-auth advanced cookie config)
- env.ts Zod refine: deny BETTER_AUTH_SECRET == sentinel
- Docs: align planning/* with actual HKDF-from-BETTER_AUTH_SECRET cipher impl
- Integration tests: SEC-05 (rate-limit 429), SEC-06 (CSRF 403), env sentinel
```

Approximate file footprint (~14 files):

- **New (4):** `routes/middleware/origin-guard.ts`, `routes/middleware/mutation-rate-limit.ts`, `drizzle/00XX_rate_limit_buckets.sql`, `routes/__tests__/csrf-origin-guard.int.test.ts`, `routes/__tests__/rate-limit.int.test.ts` (+ `config/__tests__/env.test.ts` if not present)
- **Modified (~6):** `index.ts`, `infrastructure/config/env.ts`, `infrastructure/auth/auth.ts`, `routes/_problem-json.ts`, `infrastructure/db/schema.ts`, cron init (`wiring.ts` or `infrastructure/cron/*`), existing sign-in test (cookie assertion)
- **Docs (5):** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `CLAUDE.md`

## Risks

- **Better-auth cookie-config API name.** `advanced.defaultCookieAttributes.sameSite = 'strict'` is a best-guess for version `^1.6.9`. Implementer MUST verify via Context7 before coding; fallback path is `advanced.cookies.session.attributes.sameSite`. If neither exists, escalate.
- **Migration applied on boot.** The new `rate_limit_buckets` table is created automatically because `client.ts:25` runs `migrate()` at startup. The existing DB is unaffected (the migration is additive). Phase 5 will later split migrations out of boot.
- **Cron sweep registration.** A second cron task lives in the same in-process scheduler as orphan-cover sweep. Ensure the lock-owner naming convention (`HOSTNAME-pid-uuid`) does not collide; share the same owner string and add the sweep alongside the existing one.
- **Sign-in regression under `SameSite=Strict`.** Same-origin SPA → no risk in practice. The existing sign-in/sign-out integration tests already exercise the cookie round-trip — they must pass without modification.
- **Idempotency interaction.** `idempotencyKeyMiddleware` is route-local and runs AFTER `mutationRateLimit`. A retried request with the same Idempotency-Key still consumes the rate-limit bucket (the limit is on attempts, not on logical operations). Accepted: this is the safer default and matches "rate-limit prevents floods", not "rate-limit prevents redundant work".
- **Concurrent boot with two replicas.** Not applicable today (single-process VPS deploy). If we ever scale out, the SQLite-backed rate-limit becomes a hot spot; document as a known limit in code comments.
- **Sentinel deny-list as a Validated baseline check.** The deny-list runs on every boot, not just deployment. Local dev with the sentinel will fail-fast — desired. Document the migration step (replace `.env.example` value during local setup) in CLAUDE.md if not already covered.

## Acceptance criteria

1. `POST /api/games` from foreign Origin → 403 with `type: '/errors/csrf-rejected'`. Verified by `csrf-origin-guard.int.test.ts`.
2. 61-st mutating request from a single user inside one minute → 429 with `type: '/errors/rate-limited'` and a numeric `Retry-After` header. Verified by `rate-limit.int.test.ts`.
3. Booting with `BETTER_AUTH_SECRET = 'replace-with-32-byte-random-aaaaaaaaaa'` → Zod throws with a clear message naming the sentinel. Verified by `env.test.ts`.
4. After successful sign-in, the `Set-Cookie` header contains `SameSite=Strict`. Verified by extending the existing sign-in test.
5. Existing `games.test.ts`, `games.idor.test.ts`, idempotency, sign-in / sign-out, and IGDB tests all still pass — no regression introduced.
6. `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, and `CLAUDE.md` no longer reference `SETTINGS_ENC_KEY` (except possibly in a historical note explaining the design shift). `grep -rn 'SETTINGS_ENC_KEY' .planning CLAUDE.md` returns no actionable mentions.
7. Single commit on `main` with the prescribed message.
