# IGDB metadata enrichment — plan

Synthesis of three agent reviews (DDD, backend/enterprise-web, UX) plus IGDB API docs (via Context7). Read top-to-bottom; tradeoffs and open questions at the end.

## Goal

When a user adds a game by **title + platform**, the system queries IGDB and returns candidate matches. The user picks one (or skips). The picked candidate's **cover URL, release year, and developer** are stored on the `Game`. IGDB responses are cached locally; IGDB outages must not block creating a game.

## Scope (MVP)

- Single provider: IGDB only. Provider abstraction in place so it can be swapped/extended later.
- Single user, low traffic. No queues, no Redis, no S3 rehosting.
- Two-step add flow: search → pick → create. Enrichment is **not** synchronous inside `POST /api/games`.
- Re-match button on the game detail page for existing games.

## Key architectural decisions

### 1. Domain model — vendor-neutral value object on `Game`, no separate aggregate

Add `ExternalMetadataRef` value object on `Game` with fields `{ providerName: 'igdb', providerId: string, matchedAt: Date }` (whole VO nullable). Do **not** create a `GameMetadata` aggregate — provider-derived facts are attributes of the user's game, not an entity with independent lifecycle.

**Vendor neutrality is enforced from this layer outward.** The domain VO, the persistence columns the domain reads, and the use-case signatures must NEVER contain the word "Igdb". Vendor names are legal **only** inside the adapter module (`infrastructure/igdb/`). The principle: every contract that survives a provider swap must be vendor-neutral; every contract with "Igdb" in it is a contract you'll have to break when RAWG/MobyGames is added.

- `providerId` is `string` (not `number`) — IGDB ids fit; RAWG/MobyGames use strings/slugs. Stringify at the adapter boundary.
- `providerName` is a string-literal union: today `'igdb'`, tomorrow `'igdb' | 'rawg'`. Domain code reads `providerId` only; the discriminator matters only inside the adapter.

**Naming caveat:** the existing column `external_id` on `games` already means "public-facing UUID" (see `apps/api/src/domain/games/game-repository.ts:37` `findByExternalId`). Use **`metadataRef`** as the property name and **`metadata_provider` / `metadata_provider_id` / `metadata_matched_at`** as columns — never `externalId`, never `externalRef`.

### 2. Provider port + DTO (in `domain/`)

```ts
// apps/api/src/domain/games/game-metadata-provider.ts
export type ProviderName = 'igdb'; // widened to 'igdb' | 'rawg' | … as providers are added

export interface GameMetadataCandidate {
  readonly providerName: ProviderName;
  readonly providerId: string;
  readonly title: string;
  readonly developer: string | null;
  readonly releaseYear: number | null;
  readonly coverImageUrl: string | null;
  readonly platformNames: readonly string[]; // for client disambiguation
}

export type GameMetadataProviderError =
  | { kind: 'unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'invalid_response' };

export interface GameMetadataProvider {
  search(query: { title: string; platform: string; limit?: number }):
    Promise<Result<readonly GameMetadataCandidate[], GameMetadataProviderError>>;
}
```

DTO is plain primitives (no value objects) — this is unverified data from outside; it becomes value objects only when merged into `Game`.

### 3. Cache as decorator adapter, not aggregate

`CachingGameMetadataProvider` wraps the real `IgdbGameMetadataProvider`. Cache table is an infrastructure concern; domain never sees it.

### 4. Use cases

- `SearchGameMetadata` — input: title + platform; output: candidates (or `degraded:true` if provider unreachable).
- `EnrichGameMetadata` — input: `{ gameId, providerName, providerId, snapshot }`; merges into existing `Game`. Signature is vendor-neutral: when RAWG is added later, only the `ProviderName` union widens.
- `CreateGame` stays unchanged. **No metadata-provider call inside it** — that's the contract that makes graceful degradation free.

### 5. Two-step API flow

| Step | Client | Server |
|---|---|---|
| 1 | User submits title + platform | `GET /api/games/metadata/candidates?title=…&platformId=…` → `{ candidates, degraded, reason }` |
| 2 | User picks candidate (or skips) | — |
| 3 | Client calls existing `POST /api/games` with the extra fields (`coverImage`, `releaseYear`, `developer`, `providerName`, `providerId`) | `CreateGame` writes the row; never calls metadata provider |

**Why two-step:** auto-picking the top match is wrong (e.g., "Resident Evil 4" remake vs. original); single-step would either misclassify or block create on flaky IGDB.

## Backend technical design

### Module layout

```
apps/api/src/
  domain/games/
    game-metadata-provider.ts        # vendor-neutral port + DTO
    external-metadata-ref.ts         # vendor-neutral value object
    cover-image-url.ts               # value object (replaces bare string)
  application/games/
    search-game-metadata.ts          # vendor-neutral use case
    enrich-game-metadata.ts          # vendor-neutral use case
  infrastructure/metadata/
    caching-game-metadata-provider.ts # decorator (vendor-neutral)
    metadata-cache-repository.ts      # operates on `metadata_cache` table
    rate-limiter.ts                   # generic token bucket (reusable)
  infrastructure/igdb/                # vendor-flavored area — IGDB names are legal here
    igdb-config.ts                   # zod-parsed env (IGDB_*)
    igdb-http-client.ts              # fetch wrapper (timeout/retry/breaker/rate-limit)
    igdb-token-store.ts              # Twitch OAuth token cache (DB-backed)
    igdb-platform-map.ts             # local platform name -> IGDB platform id
    igdb-game-metadata-provider.ts   # GameMetadataProvider impl
  routes/
    games-metadata.ts                # GET /api/games/metadata/candidates
```

The split between `infrastructure/metadata/` and `infrastructure/igdb/` is deliberate: the caching decorator + cache repo + rate limiter must work with any provider, so they get a vendor-neutral home. Anything genuinely IGDB-specific (Twitch OAuth, Apicalypse query DSL, IGDB platform id map) lives under `infrastructure/igdb/`.

### OAuth token (Twitch)

- Endpoint: `POST https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials`
- Response: `{ access_token, expires_in (~60d), token_type: "bearer" }`
- Storage: single-row `igdb_oauth_token` table + in-process memo. DB-backed so restart doesn't burn tokens.
- Refresh: when `expires_at - now < 1 day`, or on 401 → invalidate, refresh once, retry the original request once. Concurrent-refresh lock (single in-flight `Promise<Token>`).

### HTTP client

- Native `fetch`, no axios.
- Timeout: `AbortSignal.timeout(5000)` for IGDB v4; 8s for the token endpoint.
- Retries: max 2, only on 429 / 5xx / network error. Backoff: `200ms * 2^attempt + jitter(0..150ms)`. Honor `Retry-After`.
- Circuit breaker per host: open after 5 consecutive failures in 60s, half-open after 30s.
- Headers: `Client-ID`, `Authorization: Bearer …`, `Accept: application/json`, `Content-Type: text/plain` (Apicalypse query body).

### Rate limiter

Process-singleton token bucket: capacity 4, refill 1 token / 250ms (slightly under 4 req/s). `await limiter.acquire()` before each IGDB call. Token endpoint not throttled.

### Cache schema (new Drizzle tables)

```ts
metadataCache: {                     // vendor-neutral
  id: integer pk,
  provider: text notNull,            // 'igdb' today, 'rawg' tomorrow
  providerPlatformId: text notNull,  // string — IGDB ids fit, RAWG slugs fit
  normalizedTitle: text notNull,
  cacheKey: text notNull,            // sha256(provider + ':' + normalizedTitle + ':' + providerPlatformId)
  candidatesJson: text notNull,
  fetchedAt: integer timestamp notNull,
}
// uniqueIndex on (provider, cacheKey)

igdbOauthToken: {                    // vendor-specific BY DESIGN — Twitch OAuth shape ≠ other providers
  id: integer pk,                    // single row
  accessToken: text notNull,
  expiresAt: integer timestamp notNull,
  obtainedAt: integer timestamp notNull,
}
```

TTL via `fetched_at` (default stale = 30 days), no background eviction. Normalize: `toLowerCase().trim().replace(/\s+/g,' ').stripDiacritics()`.

`igdb_oauth_token` keeps its IGDB name on purpose: every provider has a different auth model (RAWG uses an API key header, MobyGames uses a different OAuth shape, etc.) — generalizing the table now would be premature abstraction. Each new provider gets its own auth-state table.

### Schema delta on `games` table

Add three vendor-neutral columns:

- `metadata_provider TEXT NULL` — `'igdb'` today
- `metadata_provider_id TEXT NULL` — string id from the provider
- `metadata_matched_at TEXT NULL` — ISO timestamp

Don't touch `external_id` (already means "public-facing UUID"). Don't add `igdb_id` — that name leaks the vendor into the persistence shape that the domain reads.

### Local platform → IGDB platform id

Static map in code. Local set is small and rarely changes (PS2/PS3/SWITCH/…). Unmapped platform → skip enrichment, log warn, return `degraded: true, reason: 'platform_unsupported'`.

```ts
export const IGDB_PLATFORM_IDS: Record<string, number> = {
  PS2: 8, PS3: 9, PS4: 48, PS5: 167, SWITCH: 130, /* … */
};
```

### Apicalypse search query

```
fields name, cover.image_id, first_release_date, involved_companies.company.name, involved_companies.developer, platforms.name;
search "Resident Evil 4";
where platforms = (8);
limit 10;
```

Cover URL built from `cover.image_id`: `https://images.igdb.com/igdb/image/upload/t_cover_big/<image_id>.jpg`. Release year derived from `first_release_date` (unix seconds). Developer = `involved_companies` where `developer = true`, take first.

### Error matrix

| Failure | Endpoint behavior | User sees |
|---|---|---|
| Missing creds at boot | `wiring.ts` throws → process exits | (ops only) |
| IGDB 401 | refresh once, retry; if still bad → `degraded:true` | "Couldn't reach IGDB, you can still add the game manually" |
| IGDB 429 / 5xx (after retries) | breaker opens → `degraded:true` | same |
| Timeout / network | `degraded:true` | same |
| Unknown platform | `degraded:true, reason:'platform_unsupported'` | same |
| Empty result | `200 { candidates: [] }`, not degraded | "No matches — fill in manually" |
| Bad input | 400 Problem+JSON | validation error |

`POST /api/games` itself never calls IGDB → cannot fail because of IGDB.

### Env config

New vars: `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, optional `IGDB_TIMEOUT_MS` (default 5000), `IGDB_CACHE_TTL_DAYS` (default 30).

Introduce a typed config module `apps/api/src/infrastructure/config/env.ts` with zod schema. Migrate `UPLOADTHING_TOKEN`, `BETTER_AUTH_*` into it in the same PR — small and contained.

### Testing

- Unit: use-case consumers with in-memory fake provider.
- Unit: `IgdbGameMetadataProvider` with mocked `fetch` — Apicalypse body, headers, cover URL building, 401-refresh path, retry/backoff matrix.
- Unit: rate limiter (fake timers), circuit breaker state.
- Integration: real Drizzle + local Hono fake-IGDB server. Cache writes, `degraded:true` paths.
- **Do NOT hit real IGDB in CI.** Optional manual smoke script gated by `IGDB_LIVE=1`.

## Frontend UX design

### Two-step in the existing `AddGameDialog`

Reuse `apps/client/src/components/add-game-dialog.tsx`. Step 1 (title + platform + cover color) stays. On submit, swap dialog body to **Step 2: candidate picker**. Confirm or skip → then call `POST /api/games`.

Mobile: convert to bottom `Drawer` (matches existing filter/sort pattern). Desktop: keep centered dialog, widen to ~520px in step 2.

### Candidate card

```
┌────────────────────────────────────────────────┐
│  ┌──────┐  Resident Evil 4                     │
│  │ 64×  │  2005 · Capcom                       │
│  │ 86px │  [GameCube] [PS2] [Wii] +3           │
│  └──────┘                              [ Use ] │
└────────────────────────────────────────────────┘
```

Whole card clickable; selected state = 2px accent border + tint. Skeleton on loading (3 rows).

### States

- **No matches:** "No IGDB matches for '<title>'" + buttons **Continue without match** (primary) and **Edit search** (returns to step 1).
- **IGDB down:** inline amber banner at top of step 2: "Couldn't reach IGDB. You can still add the game manually." + single **Continue without match** primary button. No retry loop, no scary modal.
- **Skip:** always-available secondary link bottom-left of step 2: **"Skip — enter manually"**.

### After picking

Don't auto-close to step 3. Reveal a compact preview card under the picker with a **Change** link and primary button changes to **Add to collection**. Hint: "You can edit details after adding." Full editing happens post-create in `game-form.tsx`.

### Re-match on existing games

Single button on the game detail page in the cover meta column:
- **"Find IGDB match"** (primary, when cover/year/developer empty)
- **"Re-match on IGDB"** (ghost, when fields populated)

Opens the same step-2 picker preloaded with current title + platform.

### Attribution

Quiet. Single small caption under the cover on detail page: *"Cover via IGDB"*. Longer credit in About/Settings: "Game metadata powered by IGDB.com".

### Microcopy

| Where | Copy |
|---|---|
| Step 1 submit | **Find match** |
| Step 2 header | **Choose a match** / *We found these on IGDB* |
| Per-candidate CTA | **Use** (selected: **Selected**) |
| Confirm button | **Add to collection** |
| Skip link | **Skip — enter manually** |
| No matches | **No IGDB matches for '<title>'** |
| IGDB down | **Couldn't reach IGDB. You can still add the game manually.** |
| Detail page | **Find IGDB match** / **Re-match on IGDB** |

### Anti-patterns to avoid

- ❌ Auto-applying the top match (RE4 remake vs. original).
- ❌ Inline title autocomplete (cramped, rate-limit-hostile, hides metadata).
- ❌ Optimistic create + retroactive enrich banner (visual instability, cover color set in step 1 gets clobbered).
- ❌ Full-screen wizards.
- ❌ Blocking error modals.
- ❌ Saving "find match later" as a separate path — `Skip` already covers it.

## Open questions / tradeoffs to resolve before implementation

1. **Filter candidates by platform at query time?** Backend agent recommends `where platforms = (X)` in the Apicalypse query; UX agent recommends NOT filtering and showing all platform badges so the user disambiguates. **Proposed compromise:** filter by IGDB platform id; if result is empty, retry once without the filter and label the result set "Other platforms" in the UI. This handles regional/edition mismatches without flooding.

2. **`CoverImageUrl` value object** — DDD recommended replacing the bare `string` for `coverImage` with a VO. Worth doing as part of this work, or defer? Recommend: **include** (it's a 30-line addition and the URL parsing is exactly what an IGDB URL needs to be checked against).

3. **Typed config module migration** — backend recommends migrating UploadThing + Better-Auth env reads into the new zod-validated config module in the same PR. Recommend: **yes, in the same PR** — small, contained, reduces drift.

4. **Static IGDB platform map source-of-truth** — code constant vs. DB-seeded? Recommend: **code constant** — greppable, no migration story, the user's local platform list is also user-defined.

5. **Where does the re-match button live on the detail page?** Need to look at the existing game detail page layout to decide exact placement; deferred to implementation.

## Phased implementation order

| Phase | Deliverable |
|---|---|
| 1 | Schema migration: `igdb_id`, `igdb_matched_at` on `games`; new `igdb_metadata_cache` and `igdb_oauth_token` tables. Typed config module. |
| 2 | Domain port + value objects (`GameMetadataProvider`, `IgdbGameRef`, `CoverImageUrl`). |
| 3 | Infrastructure: HTTP client, token store, rate limiter, IGDB adapter, caching decorator, platform map. Unit tests with mocked `fetch`. |
| 4 | Use cases (`SearchGameMetadata`, `EnrichGameMetadata`) + Hono route + integration tests with fake IGDB server. |
| 5 | Frontend: extend `AddGameDialog` with step-2 picker (responsive Drawer/Dialog). New `IgdbCandidateCard` and `IgdbMatchPicker` components. |
| 6 | Re-match button on game detail page. |
| 7 | Manual smoke test against real IGDB; attribution copy in About/Settings. |

## Files this plan touches

**New (vendor-neutral):**
- `apps/api/src/domain/games/game-metadata-provider.ts`
- `apps/api/src/domain/games/external-metadata-ref.ts`
- `apps/api/src/domain/games/cover-image-url.ts`
- `apps/api/src/application/games/search-game-metadata.ts`
- `apps/api/src/application/games/enrich-game-metadata.ts`
- `apps/api/src/infrastructure/config/env.ts`
- `apps/api/src/infrastructure/metadata/caching-game-metadata-provider.ts`
- `apps/api/src/infrastructure/metadata/metadata-cache-repository.ts`
- `apps/api/src/infrastructure/metadata/rate-limiter.ts`
- `apps/api/src/routes/games-metadata.ts`
- `apps/api/drizzle/0014_add_metadata_tables.sql`
- `apps/client/src/components/metadata-candidate-card.tsx`
- `apps/client/src/components/metadata-match-picker.tsx`

**New (IGDB-specific adapter — vendor names legal):**
- `apps/api/src/infrastructure/igdb/igdb-config.ts`
- `apps/api/src/infrastructure/igdb/igdb-http-client.ts`
- `apps/api/src/infrastructure/igdb/igdb-token-store.ts`
- `apps/api/src/infrastructure/igdb/igdb-platform-map.ts`
- `apps/api/src/infrastructure/igdb/igdb-game-metadata-provider.ts`

**Modified:**
- `apps/api/src/domain/games/game.ts` — add `metadataRef` prop + `applyMetadata()` method
- `apps/api/src/infrastructure/db/schema.ts` — add `metadata_provider`, `metadata_provider_id`, `metadata_matched_at` cols + new `metadata_cache` and `igdb_oauth_token` tables
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — handle new cols
- `apps/api/src/wiring.ts` — instantiate new provider chain + use cases
- `apps/api/src/index.ts` — mount new route
- `apps/api/.env.example` — document new env vars
- `apps/client/src/components/add-game-dialog.tsx` — two-step state machine + responsive shell
- Game detail page — Find/Re-match button

## Resolutions

Decision log from grilling pass. Each line: decision + one-line reason.

### Naming inconsistency fix

- **Phase 1 column / table names corrected.** Phase 1 row uses `metadata_provider`, `metadata_provider_id`, `metadata_matched_at`, and `metadata_cache` — never `igdb_id` / `igdb_matched_at` / `igdb_metadata_cache`. The vendor-neutral names from §1 are canonical; the Phase 1 row was a stale draft. Reason: vendor names in column/table identifiers leak the vendor into the persistence shape that the domain reads, which is the exact contract §1 protects.

### Explicit open questions

1. **Platform filter: strict, no fallback.** Apicalypse query keeps `where platforms = (X)`; on empty result the UI shows the existing "No matches" state (with "Edit search" + "Continue without match"). No second IGDB call without the filter. Reason: the retry-without-filter compromise doubles cache surface and request cost for marginal UX gain; the user-driven "Edit search" path already exists.
2. **`CoverImageUrl` VO: include in this PR.** Validates non-empty `https://` URL only; does not enforce IGDB-specific shape (UploadThing URLs flow through the same VO). Reason: 30-line addition, removes a bare `string` from the domain, and unifies validation for both cover sources.
3. **Typed config module: same PR, scoped.** Migrate `IGDB_*`, `UPLOADTHING_TOKEN`, `BETTER_AUTH_*` into `infrastructure/config/env.ts` (zod). Do not migrate anything else. Reason: small, contained, prevents drift; single-file revert if needed.
4. **Platform map: code constant + helper.** Static `Record<string, number>` in `infrastructure/igdb/igdb-platform-map.ts`, accessed via `mapPlatform(name): number | null` that normalizes (`toUpperCase().replace(/\s+/g, '_')`). Reason: local platforms are user-defined dictionary entries; a DB-seeded map creates circular ownership. Code constant is greppable and migration-free.
5. **Re-match button placement: below "Upload cover" in the cover meta column** of `game-view.tsx`. Reason: spatially adjacent to the cover (the primary asset being enriched); matches the existing affordance pattern in the same column.

### Implicit issues found

- **DB engine premise: codebase is Bun-SQLite, not Postgres.** Plan's drizzle schema uses `integer pk` / `text` / `integer timestamp`, which is SQLite-compatible — implementation as written is correct. Do not introduce Postgres-only types (`serial`, `uuid`, `jsonb`) in the migration.
- **Cache key location: computed in the caching decorator, not the IGDB adapter.** Key = `sha256(providerName + ':' + normalizedTitle + ':' + rawPlatformName)`. Platform-name → IGDB-id mapping lives in the adapter and does NOT enter the cache key. Reason: keeps cache vendor-neutral and decouples cache from the platform-id translation table.
- **Title normalization: `String.prototype.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')`.** Strip leading/trailing punctuation. Helper in `infrastructure/metadata/normalize-title.ts`. Reason: JS has no built-in `stripDiacritics`; NFKD + Unicode property escape is the standard.
- **Negative results cached with shorter TTL (24h).** Empty `candidates: []` is cached separately; positive results keep the 30-day TTL. Reason: typos / obscure titles otherwise burn rate-limit budget on every retry; 24h gives recovery for new releases.
- **Stale-while-error: serve stale cache on provider failure.** If any cache entry exists (even past TTL) and the provider call fails, return cached candidates with `degraded: false` and a `staleAt` ISO timestamp in the response. No cache + provider fail → `degraded: true, candidates: []`. Reason: better UX than failing when we have any data.
- **Circuit breaker state: process-local, in-memory.** Resets on deploy. Reason: single-user single-process; persistence adds zero value at this scale.
- **Breaker-open behavior: short-circuit immediately, no queueing.** Use case returns `{kind:'unavailable'}` → endpoint returns `{candidates:[], degraded:true, reason:'provider_down'}`. Reason: the amber-banner UX already handles this; queueing only delays the same answer.
- **Concurrent token refresh: in-process `Promise<Token>` lock only.** Document that horizontal scaling will need a DB advisory lock. Reason: single-process now; YAGNI on the distributed lock.
- **Trust model on `POST /api/games` snapshot: trust client at MVP.** Server does NOT re-validate snapshot fields against the IGDB cache on initial create. Add TODO for multi-user. Reason: hobby scale, single user, no abuse vector worth mitigating now.
- **`EnrichGameMetadata` is used only by re-match.** Initial create folds the snapshot into `POST /api/games`. Re-match calls a new `PATCH /api/games/:externalId/metadata` endpoint that invokes `EnrichGameMetadata`. Reason: avoids two writes on create; keeps `CreateGame` IGDB-free as designed.
- **Auth: `GET /api/games/metadata/candidates` and `PATCH /api/games/:externalId/metadata` are auth-required.** Reason: search costs rate-limit budget; everything else in the app is auth-gated.
- **Response shape (definitive):** `{ candidates: GameMetadataCandidate[], degraded: boolean, reason?: 'provider_down' | 'platform_unsupported' | 'rate_limited', staleAt?: string }`. Reason: covers all six cases in the error matrix without ambiguity.
- **Candidate cap: `limit 10` server-side; UI scrolls past ~5 visible.** Reason: short cards; vertical scroll is fine in both Drawer and Dialog.
- **`CoverImageUrl` VO: `https://` + non-empty path only.** No vendor-shape enforcement. Reason: same VO must accept IGDB and UploadThing URLs.
- **Migration ordering: Phase 1 ships `0014_add_metadata_tables.sql` with NO code that reads the new columns.** `Game.fromPersistence` extension lands in Phase 2. New columns are NULL; no backfill. Reason: keeps each phase independently revertible.
- **Game deletion does NOT touch the metadata cache.** Cache survives so re-adding the same game is fast. Reason: cache is keyed by (provider, title, platform), independent of game rows.
- **IGDB attribution: caption + About is sufficient; add `https://www.igdb.com/` link in About copy.** Reason: matches IGDB ToS minimum without UI bloat.
- **Step state: held in component state, not URL.** URL keeps `?add=1` only. React-Query caches the picker fetch by `(title, platform)`. Reason: matches existing dialog pattern; URL stays clean.
- **Responsive shell: CSS-driven Dialog, no `vaul`.** At `<sm:`, content is `inset-x-0 bottom-0 rounded-t-2xl rounded-b-none` (bottom sheet); at `sm:` and up, centered 520px. Reason: avoids adding a dependency for a one-off responsive change.
- **Cover URL host distinction: re-match prompts before overwriting user-uploaded covers.** If existing `coverImage` host is `images.igdb.com`, overwrite silently. If host is the UploadThing host, show "Replace your uploaded cover with the IGDB cover?" confirm. Reason: never silently destroy user-uploaded work.
- **Orphan cover cleanup: filter to UploadThing-host URLs only.** IGDB-hosted URLs are stateless on our side and must be skipped by the cron. Reason: prevents the cleanup job from trying to delete IGDB images it doesn't own.
- **`(metadata_provider, metadata_provider_id)` is NOT unique.** Multi-platform games legitimately share an IGDB id. No constraint, no index until a feature requires it. Reason: avoid premature indexing; multiple rows per IGDB id is correct.
- **Reuse existing `cover_image` column for IGDB URLs.** No new column; `metadata_provider` distinguishes the source. Reason: same column shape (HTTPS URL string), no migration needed for the cover itself.
- **Image hotlinking: keep IGDB URLs as-is, do not rehost.** Reason: IGDB allows hotlinking with attribution; rehosting via UploadThing is wasted bandwidth at this scale.
- **Manual smoke script: `apps/api/scripts/smoke-igdb.ts`, gated by `IGDB_LIVE=1`.** Reason: makes the "do not hit real IGDB in CI" rule operational with a clear escape hatch.
- **Test coverage additions:** stale-while-error path, negative-result cache TTL, title-normalization edge cases (diacritics, mixed case, punctuation), cache-key collision absence. Reason: these are the highest-risk paths not already in the listed test matrix.

## Resolutions (IGDB docs pass)

### Verified-correct
- Twitch OAuth: `POST https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials` returning `{ access_token, expires_in, token_type: "bearer" }`; `expires_in` is ~60d (observed ~5,587,808s) — matches plan §"OAuth token (Twitch)".
- Required headers `Client-ID: …` and `Authorization: Bearer …` (capitalization matters) — matches plan §"HTTP client".
- Apicalypse syntax: `fields …;`, `search "…";`, `where platforms = (X);`, `limit N;`; statements end with `;` (Apicalypse / Syntax).
- Field paths `cover.image_id`, `first_release_date` (unix seconds), `involved_companies.company.name`, `involved_companies.developer`, `platforms.name` are all valid IGDB v4 fields.
- `involved_companies.developer = true` is the documented way to identify the developer entry.
- Platform IDs verified against IGDB `/platforms`: PS2=8, PS3=9, PS4=48, PS5=167, Switch=130.
- `429 Too Many Requests` is the documented response when exceeding the rate limit; `Retry-After` honoring is the recommended practice.
- IGDB v4 base URL `https://api.igdb.com/v4`; query body is plain Apicalypse text (not JSON).
- IGDB allows hotlinking images from `images.igdb.com` with attribution — plan's "do not rehost" decision stands.

### Amended
- Image file extension → `.jpg` only on the canonical URL pattern (Images section + reference impls). The plan's "`.jpg` / `.png` / `.webp`" hedge is wrong: the documented template is `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg`. Drop `.png`/`.webp` from `CoverImageUrl` validation expectations.
- Retina suffix → `_2x` appended to the size token (e.g. `t_cover_big_2x`), NOT `@2x` as the brief suggested. Pattern: `t_{size}_2x/{image_id}.jpg` (Images / retina).
- Rate limit phrasing → "4 req/s **plus up to 8 concurrent open requests**" per Client-ID/token. Plan's token-bucket (capacity 4, refill 1/250ms) is fine for the 4 req/s ceiling but should also cap in-flight to 8 — add a concurrency semaphore alongside the bucket.
- `Content-Type: text/plain` — not strictly required by the docs (the public examples send raw Apicalypse without specifying it), but harmless and matches community wrappers. Keep, but mark as belt-and-suspenders, not mandatory.
- Thumb token choice for ~64×86 — `t_cover_small` (90×128) is the closest documented size; `t_thumb` is 90×90 (square, wrong aspect). Use `t_cover_small` (or `t_cover_small_2x` for retina) for the candidate-card thumb. Stored cover stays `t_cover_big` (227×320) — adequate; bump to `t_cover_big_2x` if detail page needs sharper rendering.
- `limit` cap → documented max is **500** (default 10), not unbounded. Plan's `limit 10` is well within range; document the 500 ceiling for future bulk paths.
- Search + sort incompatibility → Apicalypse docs state "search does not work with sorting". The plan's query has no `sort`, so it's fine, but add a guardrail comment in the adapter so a future contributor doesn't add `sort` next to `search`.

### New requirements surfaced from docs
- 401 handling must distinguish **expired token** (refresh + retry once) from **invalid Client-ID / revoked app** (no retry, surface as `unavailable`). Plan's "refresh once, retry once" is right for the first; add an explicit non-retry branch for the second based on response body inspection.
- The token endpoint `id.twitch.tv` lives on a different host than `api.igdb.com` — the per-host circuit breaker must keep them as separate keys (otherwise IGDB outages will trip the auth breaker and vice versa). Plan already says "per-host"; call this out explicitly in the breaker config.
- Concurrency cap of **8 in-flight requests** must be enforced regardless of the 4 req/s bucket (the bucket alone allows momentary bursts that exceed 8 if responses are slow). Add `MAX_INFLIGHT = 8` semaphore in `igdb-http-client.ts`.
- Apicalypse `limit` default is **10** when omitted — plan's `limit 10;` is a no-op in the happy case but worth keeping explicit for clarity and future-proofing if defaults change.
- IGDB images are served only over HTTPS from `images.igdb.com`; `CoverImageUrl` VO should additionally accept this exact host (alongside the UploadThing host) and reject other hosts when `metadata_provider = 'igdb'` is set — defends against a malicious client snapshot pointing `coverImage` at an arbitrary URL during create.
- Attribution: Twitch/IGDB ToS requires visible attribution wherever IGDB data is shown. Plan's "caption + About" is sufficient, but the About copy must include a clickable link to `https://www.igdb.com/` (already in §Resolutions but worth re-confirming as a hard ToS requirement, not a nicety).
- The `t_cover_small` token (not `t_thumb`) is the correct choice for the candidate-card thumb — record this as a constant in `igdb-image-url.ts` so the picker and detail page agree.
- Twitch OAuth response `token_type` is literally `"bearer"` (lowercase) — when constructing the `Authorization` header, hard-code `"Bearer "` rather than templating from the response, matching the docs' explicit warning about capitalization.

## Resolutions (enterprise-web final pass)

### Verified-OK
- Auth pattern matches existing routes: `requireAuth` middleware at `apps/api/src/routes/middleware/require-auth.ts:9` populates `c.get('user')`; `apps/api/src/routes/games.ts:128` shows the canonical `c.get('user').id` extraction — new `GET /metadata/candidates` and `PATCH /:externalId/metadata` use the same.
- Better-Auth session is read once per request via `auth.api.getSession({ headers })` — no token-refresh / session-rotation hazards added by this plan.
- Drizzle migration numbering: next number is `0014` (last shipped is `0013_add_games_filter_indexes.sql` at `apps/api/drizzle/`); plan's `0014_add_metadata_tables.sql` is correct.
- SQLite migration style matches plan: existing migrations use raw `ALTER TABLE` + `CREATE INDEX IF NOT EXISTS` with `--> statement-breakpoint` (see `0011_add_notes.sql`, `0013_add_games_filter_indexes.sql`).
- Migrate-on-boot semantics already enforced in `apps/api/src/infrastructure/db/client.ts:25-28` — adding columns/tables is automatic on next process start; no manual step.
- ProblemJSON contract already exists (`apps/api/src/routes/_problem-json.ts`) — re-use `domainProblem` / `zodIssuesToProblemJson` / `internalProblem` for the new endpoints; no new error format needed.
- Health-check independence: `app.get('/api/health', …)` at `index.ts:38` is a static `200 ok` — leaving IGDB out of it is the right call (non-critical dependency).
- Outbox / dual-write: not applicable. `EnrichGameMetadata` is a single-row update on `games`; no event publication, no second store.
- Single-process circuit-breaker / token-store memo is fine for current Bun-SQLite single-user deployment.
- IDOR pattern: existing routes pass `userId` into use cases (`getGame.execute(externalId, userId)` at `games.ts:154`); `findByExternalId(userId, externalId)` at `game-repository.ts:37` already scopes by user. New `PATCH` follows the same shape — covered by extending `games.idor.test.ts`.

### Gaps to address
- **Hono route collision: `/metadata/candidates` will be eaten by `games.get('/:externalId')`** — `apps/api/src/routes/games.ts:151` matches any single segment under `/api/games/`, so `GET /api/games/metadata/candidates` resolves "metadata" as `externalId` and 404s. Fix: register the metadata sub-router INSIDE `games.ts` BEFORE the `:externalId` routes (e.g. `games.route('/metadata', gamesMetadata)` placed above line 151), OR mount it as a separate top-level route `app.route('/api/games/metadata', gamesMetadata)` ABOVE line 43 in `index.ts`. The plan must specify which.
- **PATCH route shape conflicts the same way.** `PATCH /api/games/:externalId/metadata` is unambiguous (different verb + extra segment), but the handler must live in the same router as `:externalId` routes or be registered after a path-prefix split. Document explicitly that the new `PATCH` lives in `games.ts` (next to `PUT /:externalId`), not in `games-metadata.ts`.
- **Auth middleware ordering for the new sub-router.** `index.ts:42` (`app.use('/api/games/*', requireAuth)`) covers any path under `/api/games/`, so both endpoints are auth-gated automatically — but ONLY if the new router is mounted under `/api/games`. If a contributor instead adds `app.route('/api/games-metadata', …)`, auth is silently dropped. Add a one-line note: "metadata routes MUST be mounted under `/api/games` to inherit `requireAuth`."
- **Zod validation location is unspecified.** Existing routes parse `body` ad-hoc and rely on use-case zod schemas (see `createGame.execute(body, userId)` at `games.ts:130`). New endpoints should follow the same pattern: zod schema lives in the use-case (`SearchGameMetadata`, `EnrichGameMetadata`), the route just forwards `c.req.query()` / `await c.req.json()`. State this in the plan to avoid drift.
- **IDOR check for PATCH is implicit.** Plan never says "verify game belongs to user before mutating". Fix: `EnrichGameMetadata.execute({ externalId, userId, providerName, providerId, snapshot })` MUST call `gameRepository.findByExternalId(userId, externalId)` first and return `not_found` if null — same shape as `UpdateGame`. Add this requirement under §"Use cases".
- **Crash mid-token-refresh / mid-cache-write hazards.**
  - Token refresh: in-process lock + DB-backed `igdb_oauth_token` is fine, but the write must happen in a single SQLite statement (`INSERT OR REPLACE` or `UPDATE`). If process dies mid-refresh after Twitch returns but before DB write, next boot calls Twitch again and overwrites — no corruption, just one wasted token. Acceptable; document as such.
  - Cache write after a successful IGDB call but before response flush: `metadata_cache` row exists, response never sent. Next call hits cache — correct behaviour. No hazard.
  - `EnrichGameMetadata` writes only the `games` row; no dual-write.
- **Structured logging is not specified.** Existing code uses `console.log(JSON.stringify({...}))` (see `games.ts:111-122`) — that IS the project's logger. New components should follow the same shape. Add to plan: log `{event: 'igdb.token.refresh', durationMs, ok}` (info), `{event: 'igdb.search', cacheHit, degraded, durationMs}` (info), `{event: 'igdb.breaker.open' | 'igdb.breaker.close', failures}` (warn), `{event: 'igdb.rate_limited', waitedMs}` (info), `{event: 'igdb.http', status, retries}` (warn on 4xx≠401, error on persistent 5xx). One line per call; no PII; no IGDB token in any log line.
- **Idempotency of PATCH `/:externalId/metadata`.** Re-matching the same `(providerName, providerId)` overwrites three columns + `metadata_matched_at`. That's idempotent in effect (same input → same final state), but `matched_at` changes on every call. Decide and document: either (a) update `matched_at` only when the snapshot differs, or (b) accept timestamp drift. Recommend (b) for simplicity; no idempotency-key header needed at single-user scale.
- **Graceful shutdown drains nothing right now.** `index.ts:88-91` clears the cleanup timer and calls `process.exit(0)` — does NOT wait for in-flight requests, IGDB fetches, or breaker timers. Fix: add an `AbortController` shared by IGDB client; on SIGTERM call `controller.abort()` then `setTimeout(() => process.exit(0), 5000)`. Otherwise a SIGTERM during a 5s IGDB call kills the request mid-flight (no data loss here, but breaker state is also lost — fine since it's in-memory by design).
- **Env validation does not exist yet.** `wiring.ts:12` reads `process.env.UPLOADTHING_TOKEN ?? ''` with no validation; `auth.ts` reads Better-Auth env vars directly. Plan mandates a new `infrastructure/config/env.ts` — but does NOT specify it must be imported FIRST in `wiring.ts` (and transitively in `index.ts`) so a missing `IGDB_CLIENT_ID` crashes BEFORE Hono routes register. Make the boot order explicit: `import './infrastructure/config/env'` at the top of `wiring.ts`; the module's top-level zod parse throws on import.
- **`IGDB_LIVE=1` smoke script has no runner entry.** Plan says `apps/api/scripts/smoke-igdb.ts` but the project has no `package.json` script for it (see existing `scripts/backfill-external-ids.ts` — also has no runner entry, which is the same gap). Fix: add `"smoke:igdb": "IGDB_LIVE=1 bun run scripts/smoke-igdb.ts"` to `apps/api/package.json` so the escape hatch is discoverable.
- **Apicalypse query-body snapshot test is missing from the test list.** Plan lists "Apicalypse body" as a unit-test concern but doesn't call out a snapshot/golden-file assertion. A literal-string assertion against the exact bytes sent to `api.igdb.com/v4/games` (with platform-id substitution as the only variable) prevents silent regressions when fields are reordered or added. Add explicitly under §Testing.

### Nice-to-have / defer
- Per-host rate-limit budget tracking via `Retry-After` header echo into structured logs — useful for debugging but not required at single-user scale.
- DLQ / persisted retry queue for failed enrichments — defer; the re-match button is the manual retry channel.
- OpenTelemetry tracing across the use-case → adapter → IGDB chain — defer; correlation ID + structured logs are sufficient at this scale.
- Distributed token-refresh lock (DB advisory lock or `SELECT … FOR UPDATE`) — defer until horizontal scaling, already noted in §Resolutions.
- `/api/health/ready` separate from `/api/health` (live vs. ready split) — defer; single endpoint is enough for a single-process deployment.
- Rate-limit budget metric exposed via a debug endpoint — defer.
