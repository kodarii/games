# IGDB enrichment — Faza 4: Adapter + cache + use cases + routes + wiring

## Goal
Połącz infrastrukturę z fazy 3 z use case'ami i routami. Konkretnie: napisz IGDB adapter (Apicalypse query, mapowanie response → DTO), caching decorator (vendor-neutralny), use cases `SearchGameMetadata` + `EnrichGameMetadata`, dwa nowe routes Hono z auth, i podepnij wszystko w `wiring.ts`.

## Definition of Done
- [ ] `GET /api/games/metadata/candidates?title=X&platform=Y` zwraca `{ candidates, degraded, reason?, staleAt? }` — auth-required
- [ ] `PATCH /api/games/:externalId/metadata` zapisuje snapshot na grę usera — auth-required, IDOR-safe (404 jeśli gra nie należy do usera)
- [ ] Wszystkie testy zielone: `bun test`
- [ ] `bun run check` + lint czyste
- [ ] Integration test: GET `/api/games/metadata/candidates` happy path returns 200 with `degraded:false` and non-empty candidates
- [ ] Integration test: GET same input twice — second call hits cache (fake-IGDB server request count = 1)
- [ ] Integration test: fake-IGDB returns 500 three times → response `{candidates:[], degraded:true, reason:'provider_down'}`
- [ ] Integration test: cache pre-populated + fake-IGDB returns 500 → response includes `staleAt` ISO timestamp and `degraded:false`
- [ ] Test snapshot/golden file dla Apicalypse body (bytes-exact assertion)
- [ ] Test 404 dla PATCH na obcą grę (IDOR)
- [ ] Auth-coverage test: GET `/api/games/metadata/candidates?title=X&platform=PS2` BEZ auth cookie zwraca 401. Asserts że literal-before-param mount w `games.ts` dziedziczy `requireAuth` z `app.use('/api/games/*', requireAuth)`. Bez tego testu przyszły contributor może mount sub-router gdzie indziej i silently strip auth.
- [ ] `grep -r "igdb" apps/api/src/application` → PUSTO (use cases vendor-neutralne)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. `bun test`, `bun run check`.
**Hono:** routy w `apps/api/src/routes/games.ts`. Auth middleware na `/api/games/*` zarejestrowany w `apps/api/src/index.ts:42`.
**Wzór auth/error handling:** `apps/api/src/routes/games.ts:127-138` (POST /api/games) — `c.get('user').id`, walidacja przez Zod w use case, mapping `invalid_input` → `zodIssuesToProblemJson`, `domain` → `domainProblem`, fallback → `internalProblem`.
**Wzór IDOR:** `apps/api/src/domain/games/game-repository.ts:37 findByExternalId(userId, externalId)` — repo scope'uje po userId. Use case musi go używać.
**Wzór use case:** `apps/api/src/application/games/create-game.ts` — Zod parse → domain logic → repo save → zwrot Result. `apps/api/src/application/games/update-game.ts` — read-then-write z IDOR check.
**Wzór logowania:** istniejący kod używa `console.log(JSON.stringify({...}))` (zobacz `games.ts:111-122`) — to jest project logger. Stosuj ten sam format.

### Step 0: Pobierz dokumentację (Context7)
**OBOWIĄZKOWE — odpal te zapytania przed pisaniem kodu:**
1. `mcp__context7__resolve-library-id` z query `"IGDB API"` → wybierz id z fazy 3 (Twitch IGDB)
2. `mcp__context7__query-docs` z library id + pytanie:  
   `"Apicalypse query syntax — fields, search, where, limit; how to query /games endpoint with cover and involved_companies; image_id URL template t_cover_big"`
3. `mcp__context7__query-docs` z library id + pytanie:  
   `"IGDB v4 /games endpoint response shape for fields cover.image_id, first_release_date, involved_companies.company.name, involved_companies.developer, platforms.name"`

Jeśli MCP nie działa, w README sekcja "Resolutions (IGDB docs pass)" (`docs/plans/igdb-enrichment/README.md` linie 379–409) zawiera skondensowany kontrakt.

Dodatkowo:
4. `mcp__context7__resolve-library-id` z query `"hono"` + `mcp__context7__query-docs` z pytaniem: `"router collision when /:param overlaps with literal path segment — how to mount sub-router so literal path takes priority"`

## Design decisions
- **Cache key liczony w CACHING DECORATOR, nie w adapterze IGDB.** Klucz: `sha256(providerName + ':' + normalizedTitle + ':' + rawPlatformName)`. Platform → IGDB id translation żyje w adapterze i NIE wchodzi do klucza. Powód: cache vendor-neutralny, decoupled od platform-id mapping table.
- **Title normalization:** `String.prototype.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')`. Strip wiodące/końcowe znaki interpunkcyjne. Helper w `infrastructure/metadata/normalize-title.ts`.
- **TTL:** positive results 30 dni (`env.IGDB_CACHE_TTL_DAYS`), negative results (empty candidates) 24h. Powód: typos/obscure titles inaczej palą rate-limit budget przy każdej próbie; 24h daje recovery dla nowych wydań.
- **Stale-while-error:** jeśli provider call fail + jest WSZYSTKO w cache (nawet poza TTL) → zwróć stale candidates z `degraded: false` i `staleAt: ISO` timestampem. Brak cache + fail → `degraded: true, candidates: []`. Powód: lepszy UX niż failing gdy mamy jakiekolwiek dane.
- **Apicalypse query (literal):**
  ```
  fields name, cover.image_id, first_release_date, involved_companies.company.name, involved_companies.developer, platforms.name;
  search "<title>";
  where platforms = (<igdbPlatformId>);
  limit 10;
  ```
  Bez `sort` — Apicalypse `search` jest incompatible z `sort`. Adapter MUSI mieć inline comment ostrzegający przyszłego contributora.
- **Cover URL build:** `https://images.igdb.com/igdb/image/upload/t_cover_big/<image_id>.jpg`. Tylko `.jpg` (NIE `.png`/`.webp`). Thumbnail token (jeśli użyjesz w przyszłości): `t_cover_small`, NIE `t_thumb`.
- **Platform filter STRICT, no fallback.** Jeśli empty result → zwróć empty (UI pokaże "No matches"). Brak drugiego IGDB call bez filtra.
- **Unknown platform (brak w `IGDB_PLATFORM_IDS` map):** zwróć `{ candidates: [], degraded: true, reason: 'platform_unsupported' }`. NIE wywołuj IGDB.
- **Use case `SearchGameMetadata` jest vendor-neutralny:** signature przyjmuje `{ title, platform }`, używa portu `GameMetadataProvider` (faza 2). Wewnątrz wciska Zod input validation. **`userId` is intentionally NOT a parameter** — search has no per-game scope. Route handler captures `c.get('user').id` for logging only (`event:'igdb.search.request'`) i jako hook na future per-user rate-limit budget — bez zmiany kontraktu use case'a.
- **Use case `EnrichGameMetadata` jest vendor-neutralny:** signature `{ externalId, userId, providerName, providerId, snapshot }`. WEWNĄTRZ wywołuje `gameRepository.findByExternalId(userId, externalId)` — jeśli null → `err({kind: 'not_found'})`. Potem `game.applyMetadata(snapshot, ref)`, potem `repo.save`. IDOR-safe.
- **Trust model (MVP):** server NIE re-waliduje snapshot fields przeciw IGDB cache w `EnrichGameMetadata`. TODO w komentarzu (multi-user later). Reason: hobby scale, single user.
- **Crash-safety note:** SQLite single-row UPDATE w `EnrichGameMetadata` jest atomic na tym samym connectionie — partial on-disk state niemożliwy. Response-loss podczas flush skutkuje tylko `metadata_matched_at` drift przy client retry, co jest accepted (patrz PATCH idempotency note). Idempotency-key header NIE jest wymagany at MVP scale.
- **Cache write failures są non-fatal:** loguj `event: 'igdb.cache.write_failed'` (warn) i zwracaj live candidates anyway. Lepiej serve correct data bez cache niż zfailować request.
- **Title normalization is intentionally coarse.** Strips diacritics, lowercases, trims, collapses whitespace, strips leading/trailing punctuation only. Middle punctuation (colons, parentheses, ampersands) is preserved. Different normalized forms produce different cache rows. Genuinely ambiguous titles (`Resident Evil 4` = 2005 vs 2023 remake) są resolved by user via "Edit search" path w PHASE 5 — NIE przez precision tuning tutaj.
- **Route mounting (CRITICAL):** `/api/games/metadata/candidates` byłby zjedzony przez `games.get('/:externalId')` w `routes/games.ts:151`. Rozwiązanie: zarejestruj sub-router METADATA W `games.ts` PRZED route `:externalId`. Tj. wewnątrz `games.ts` dodaj `games.route('/metadata', gamesMetadataRouter)` PRZED linią `games.get('/:externalId', …)`. Auth middleware (`app.use('/api/games/*', requireAuth)` w index.ts:42) złapie automatycznie.
- **PATCH route:** `PATCH /api/games/:externalId/metadata` — definiuj W TYM SAMYM `games.ts` (obok PUT `/:externalId`), NIE w `games-metadata.ts`. Powód: różny verb + extra segment = no collision, ale logicznie należy z innymi `:externalId` routes.
- **Response shape (DEFINITIVE):** `{ candidates: GameMetadataCandidate[], degraded: boolean, reason?: 'provider_down' | 'platform_unsupported' | 'rate_limited', staleAt?: string }`.
- **`limit` cap:** 10 server-side. UI scrolluje powyżej ~5.
- **Logging:** dodaj structured logs (`console.log(JSON.stringify({event: '...', ...}))`):
  - `igdb.search` (info): cacheHit, degraded, durationMs
  - `igdb.search.request` (info, w route handler PRZED use case): userId, title, platform — audit trail per user
  - `igdb.search.stale_served` (warn, w `SearchGameMetadata`): cache hit served bo provider failed; payload {cacheKey, staleAt} — capacity-planning signal
  - `igdb.enrich` (info, w PATCH route on success): userId, externalId, providerId, durationMs — match audit trail
  - `igdb.token.refresh` (info): durationMs, ok
  - `igdb.breaker.open|close` (warn): failures
  - `igdb.http` (warn na 4xx≠401, error na persistent 5xx): status, retries
  - `igdb.rate_limited` (info): waitedMs
  - `igdb.cache.write_failed` (warn, w caching decorator catch): cacheKey, err.message (NIE pełny error object — może zawierać headers) — degraded cache, non-fatal
  - `security.idor_attempt` (warn, w PATCH route gdy use case zwraca not_found): userId, externalId, route — enumeration signal
  - **NIE loguj access tokena. NIE loguj PII. NIE loguj `Authorization` headera (patrz Token redaction w fazie 3 constraints).**
- **Migration ordering (z fazy 1):** kolumny `metadata_*` są już w schemacie. `Game.fromPersistence` z fazy 2 już je czyta. Tutaj tylko aktywujemy ich zapis przez PATCH.
- **PATCH idempotency:** akceptujemy timestamp drift — `metadata_matched_at` updatuje się przy każdym PATCH, nawet jeśli reszta identyczna. Brak idempotency-key headera (single user).

### Relevant files (edit only these)
- `apps/api/src/infrastructure/metadata/normalize-title.ts` — NOWY helper
- `apps/api/src/infrastructure/metadata/metadata-cache-repository.ts` — NOWY (operuje na tabeli `metadata_cache`)
- `apps/api/src/infrastructure/metadata/caching-game-metadata-provider.ts` — NOWY decorator
- `apps/api/src/infrastructure/metadata/__tests__/caching-game-metadata-provider.test.ts` — NOWE
- `apps/api/src/infrastructure/metadata/__tests__/normalize-title.test.ts` — NOWE
- `apps/api/src/infrastructure/igdb/igdb-platform-map.ts` — NOWY (static map + `mapPlatform(name): number | null`)
- `apps/api/src/infrastructure/igdb/igdb-game-metadata-provider.ts` — NOWY (implementuje port)
- `apps/api/src/infrastructure/igdb/__tests__/igdb-game-metadata-provider.test.ts` — NOWE (mock fetch, golden Apicalypse body)
- `apps/api/src/application/games/search-game-metadata.ts` — NOWY use case
- `apps/api/src/application/games/__tests__/search-game-metadata.test.ts` — NOWE
- `apps/api/src/application/games/enrich-game-metadata.ts` — NOWY use case
- `apps/api/src/application/games/__tests__/enrich-game-metadata.test.ts` — NOWE (IDOR + happy)
- `apps/api/src/routes/games-metadata.ts` — NOWY sub-router dla GET `/candidates`
- `apps/api/src/routes/games.ts` — dodaj `.route('/metadata', …)` PRZED `:externalId` oraz `.patch('/:externalId/metadata', …)` obok PUT
- `apps/api/src/wiring.ts` — instancjuj cały łańcuch (tokenStore → http client → adapter → caching decorator → use cases → wstrzyknij do routerów)
- `apps/api/src/routes/games.idor.test.ts` — DODAJ test PATCH /:externalId/metadata IDOR

### Files to read but NOT edit
- `apps/api/src/routes/games.ts` (cały — znaj wzór auth/error/IDOR)
- `apps/api/src/routes/middleware/require-auth.ts`
- `apps/api/src/application/games/create-game.ts` (wzór Zod + Result)
- `apps/api/src/application/games/update-game.ts` (wzór IDOR check)
- `apps/api/src/routes/_problem-json.ts`
- `apps/api/src/wiring.ts` (cały — żeby wiedzieć gdzie wstrzyknąć)
- `apps/api/src/domain/games/game-metadata-provider.ts` (port + DTO + `GameMetadataSearchHit` — sfinalizowany w PHASE 2; **NIE modyfikuj w tej fazie**)
- `apps/api/src/index.ts` (mount routes)

## Constraints
- TDD: test → impl per step
- Route handler max ~20 linii: parse → use case → response. ZERO logiki biznesowej w routerze.
- Use case `EnrichGameMetadata` MUSI wywołać `findByExternalId(userId, externalId)` przed mutacją — bez tego IDOR
- Zod parse w use case (NIE w routerze) — jak w `create-game.ts`
- Caching decorator NIE wie nic o IGDB-platform-id ani tokenach — operuje tylko na `GameMetadataProvider` (port z fazy 2)
- **Unknown platform handling (single resolved decision):** jeśli `mapPlatform(name) === null`, `IgdbGameMetadataProvider.search` zwraca `err({ kind: 'platform_unsupported' })` BEZ wywoływania fetcha. Wariant `platform_unsupported` już istnieje w `GameMetadataProviderError` (zdefiniowany w PHASE 2). Use case `SearchGameMetadata` mapuje ten error na response `{ candidates: [], degraded: true, reason: 'platform_unsupported' }`. Adapter NIE zwraca `ok([])` dla unknown platform — ta ambiguity (empty result vs unsupported) rozstrzygnięta na poziomie typu przez error variant.
- Apicalypse query body — assertion bytes-exact w teście (golden file). Zmień fields tylko z mocnym powodem; każda zmiana zmienia test.
- Image URL build helper żyje w `igdb-game-metadata-provider.ts` jako prywatna funkcja `buildCoverUrl(imageId: string)`.

## Steps

### Step 1: Helpers + cache repo + caching decorator + testy (RED → GREEN)
**Co robimy:**
1. `normalize-title.ts`:
   ```ts
   export function normalizeTitle(raw: string): string {
     return raw.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
   }
   ```
   Test: `'Pokémon: Red & Blue!  '` → `'pokemon: red & blue'` (zostawia środkowe znaki, strip wiodące/końcowe). Sprawdź też diacritics (`'café'` → `'cafe'`), case (`'ABC'` → `'abc'`), multi-space (`'a   b'` → `'a b'`).
2. `metadata-cache-repository.ts`:
   ```ts
   export class MetadataCacheRepository {
     constructor(private db: Database) {}
     async get(provider: string, cacheKey: string): Promise<{ candidates: GameMetadataCandidate[]; fetchedAt: Date } | null>
     async upsert(provider: string, cacheKey: string, candidates: GameMetadataCandidate[]): Promise<void>
   }
   ```
   Read: SELECT WHERE provider=? AND cache_key=? LIMIT 1. JSON.parse candidates_json.
   Write: INSERT OR REPLACE (lub Drizzle equivalent z `onConflictDoUpdate`).
3. Test `caching-game-metadata-provider.test.ts` (mock'uj inner provider i cache repo):
   - Cache miss + provider returns 3 candidates → repo.upsert called, returns ok(3 candidates)
   - Cache hit fresh (within positive TTL) → inner NOT called, returns cached
   - Cache hit fresh negative (empty, within 24h TTL) → inner NOT called, returns ok([])
   - Cache hit stale (past TTL) + provider returns ok([…]) → inner called, repo updated, returns new
   - Cache hit stale + provider returns err(unavailable) → returns ok(staleCandidates) with `staleAt` (TEST: caller widzi to przez return shape — patrz niżej)
   - Cache miss + provider returns err(unavailable) → returns err(unavailable)
   - **Stale-while-error contract (single resolved decision):** port `GameMetadataProvider.search` zwraca `Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>>` gdzie `GameMetadataSearchHit = { candidates, fetchedAt }` — ten shape jest LOCKED w PHASE 2 (NIE modyfikuj portu w tej fazie). Caching decorator implementuje port: na cache hit zwraca `ok({ candidates, fetchedAt: cachedRow.fetchedAt })`; na cache miss + provider success robi upsert i zwraca `ok({ candidates, fetchedAt: now })`; na cache miss + provider error propaguje error. Use case `SearchGameMetadata` obsługuje stale-while-error: jeśli decorator zwraca `err` ORAZ `cacheRepo.get(provider, key)` zwraca (possibly stale) row, use case buduje response `{ candidates: cached.candidates, degraded: false, staleAt: cached.fetchedAt.toISOString() }` (use case czyta cache repo bezpośrednio dla tego fallback path).
4. Implementuj caching decorator wg powyższego.
5. `bun test apps/api/src/infrastructure/metadata/__tests__/` → GREEN.

**Rezultat:** cache działa, stale handling exposed do use case'a.

### Step 2: IGDB adapter (Apicalypse, platform map, response → DTO) + golden test
**Co robimy:**
1. `igdb-platform-map.ts`:
   ```ts
   const MAP: Record<string, number> = {
     PS2: 8, PS3: 9, PS4: 48, PS5: 167, SWITCH: 130,
     // …rozszerz o platformy z apps/api/scripts/backfill-external-ids.ts albo z listy w README §"Local platform → IGDB platform id"
   };
   export function mapPlatform(name: string): number | null {
     const key = name.toUpperCase().replace(/\s+/g, '_');
     return MAP[key] ?? null;
   }
   ```
2. Test `igdb-game-metadata-provider.test.ts`:
   - **Golden:** mock `IgdbHttpClient.post` żeby zwracał fixture'owy JSON. Sprawdź EXACT bytes body wysłane do `.post('/games', body)` — body to literal Apicalypse string. Złap go w mock i `expect(body).toBe(expected)` gdzie `expected` jest hardcoded string z zoom w komentarzu.
   - happy path: input `{title:"Resident Evil 4", platform:"PS2"}` → 2 candidates, każdy ma `providerName: 'igdb'`, `providerId` z `String(igdbGame.id)`, `title`, `developer` (znajdź `involved_companies` gdzie `developer === true`, weź `.company.name`; jeśli brak → null), `releaseYear` (z `first_release_date` unix → `new Date(_*1000).getFullYear()`; null → null), `coverImageUrl: buildCoverUrl(cover.image_id)` lub null, `platformNames: platforms.map(p=>p.name)`.
   - unknown platform input ("RETROCONSOLE") → `err({ kind: 'platform_unsupported' })` (po dodaniu wariantu do unii — patrz Constraints)
   - http client throws `IgdbHttpError({kind:'unavailable'})` → `err({kind:'unavailable'})`
   - http client throws `IgdbHttpError({kind:'rate_limited'})` → `err({kind:'rate_limited'})`
   - response z brakującym fieldem → `err({kind:'invalid_response'})`. Walidacja Zodem inside adapter.
3. Implementuj `IgdbGameMetadataProvider` używając `IgdbHttpClient` z fazy 3. NIE wywołuj fetcha bezpośrednio — tylko przez http client. Sprawdź `mapPlatform` przed wywołaniem.
4. `buildCoverUrl(imageId)`: `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`.
5. Zod schema response w pliku adapter (`igdbGameSchema = z.object({ id: z.number(), name: z.string(), cover: z.object({image_id: z.string()}).optional(), first_release_date: z.number().optional(), platforms: z.array(z.object({name: z.string()})).optional(), involved_companies: z.array(z.object({developer: z.boolean(), company: z.object({name: z.string()})})).optional() })`).
6. **Komentarz w adapterze:** `// IGDB Apicalypse: search is INCOMPATIBLE with sort. Do NOT add a 'sort' clause next to 'search'.`
7. `bun test apps/api/src/infrastructure/igdb/__tests__/igdb-game-metadata-provider.test.ts` → GREEN.

**Rezultat:** adapter mapuje IGDB response → vendor-neutralne DTO + golden body assertion.

### Step 3: Use cases + testy (RED → GREEN)
**Co robimy:**
1. Test `search-game-metadata.test.ts` (in-memory fake provider, in-memory fake cache repo):
   - Happy: fake provider zwraca 3 → use case zwraca `{ candidates: 3, degraded: false }`
   - Provider err `unavailable`: cache miss → `{ candidates: [], degraded: true, reason: 'provider_down' }`. Cache hit (stale) → `{ candidates: stale, degraded: false, staleAt: ISO }`.
   - Provider err `rate_limited`: → `{ candidates: [], degraded: true, reason: 'rate_limited' }` (cache miss); stale fallback jeśli cache hit.
   - Provider err `platform_unsupported` (lub brak mapowania): → `{ candidates: [], degraded: true, reason: 'platform_unsupported' }`
   - Empty positive result: → `{ candidates: [], degraded: false }` (UI pokaże "no matches"; brak `reason`)
   - Zod input invalid (puste title) → `err({ kind: 'invalid_input', issues })`
2. Implementuj `search-game-metadata.ts`:
   ```ts
   const schema = z.object({ title: z.string().trim().min(1), platform: z.string().trim().min(1) });
   export class SearchGameMetadata {
     constructor(private provider: GameMetadataProvider, private cache: MetadataCacheRepository) {}
     async execute(input: unknown): Promise<Result<{candidates, degraded, reason?, staleAt?}, {kind:'invalid_input', issues} | {kind:'internal'}>> { ... }
   }
   ```
3. Test `enrich-game-metadata.test.ts` (in-memory fake repo, real domain logic):
   - Happy: existing Game, snapshot → applyMetadata → save → return updated game
   - IDOR: gra należy do innego usera → `err({kind: 'not_found'})`
   - Snapshot.coverImageUrl z malicious host → domain rzuca err → use case zwraca `err({kind:'domain', error})`
   - providerId empty → Zod fail
4. Implementuj `enrich-game-metadata.ts`:
   ```ts
   const schema = z.object({
     providerName: z.literal('igdb'),
     providerId: z.string().trim().min(1),
     snapshot: z.object({
       coverImageUrl: z.string().nullable(),
       releaseYear: z.number().int().nullable(),
       developer: z.string().nullable(),
     }),
   });
   export class EnrichGameMetadata {
     constructor(private repo: GameRepository) {}
     async execute(externalId: string, input: unknown, userId: string): Promise<Result<Game, {...}>> {
       // 1. parse schema
       // 2. const game = await repo.findByExternalId(userId, externalId); if !game → err not_found
       // 3. const ref = ExternalMetadataRef.create({providerName, providerId, matchedAt: new Date()})
       // 4. const next = game.applyMetadata(snapshot, ref.value)
       // 5. await repo.save(next.value) — sprawdź jaką metodę ma repo (save / update — patrz update-game.ts)
       // 6. return ok(next.value)
       // TODO(multi-user): re-validate snapshot against cache before save
     }
   }
   ```
5. `bun test apps/api/src/application/games/__tests__/` → GREEN.

**Rezultat:** use cases gotowe.

### Step 4: Routes + wiring + integration test
**Co robimy:**
1. `apps/api/src/routes/games-metadata.ts` (sub-router dla GET):
   ```ts
   import { Hono } from 'hono';
   import type { SearchGameMetadata } from '../../application/games/search-game-metadata';

   export function createGamesMetadataRouter(deps: { searchGameMetadata: SearchGameMetadata }) {
     const r = new Hono<{ Variables: { user: { id: string } } }>();
     r.get('/candidates', async (c) => {
       const userId = c.get('user').id;
       const title = c.req.query('title') ?? '';
       const platform = c.req.query('platform') ?? '';
       const result = await deps.searchGameMetadata.execute({ title, platform });
       if (!result.ok) {
         if (result.error.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(result.error.issues), 400);
         return c.json(internalProblem('unknown error'), 500);
       }
       return c.json(result.value, 200);
     });
     return r;
   }
   ```
2. **CONSTRAINT (verified against codebase):** `apps/api/src/routes/games.ts` NIE używa factory `createGamesRouter(deps)`. Używa module-scoped importów z `apps/api/src/wiring.ts` (np. `import { createGame } from '../wiring'` przy `games.ts:4`; `index.ts:9` robi `import { games } from './routes/games'`). **NIE refaktoryzuj na factory.** Zamiast tego:
   1. W `apps/api/src/wiring.ts` dodaj dwa kolejne exported singletons obok istniejących (~linia 32): `export const searchGameMetadata = new SearchGameMetadata(cachingProvider, cacheRepo);` oraz `export const enrichGameMetadata = new EnrichGameMetadata(gameRepository);`.
   2. W `apps/api/src/routes/games.ts` na górze pliku dodaj import: `import { searchGameMetadata, enrichGameMetadata } from '../wiring';`.
   3. Użyj ich bezpośrednio w handlerach (ten sam wzór co `createGame.execute(...)`).
   4. `apps/api/src/index.ts:9` import zostaje as-is — brak factory hand-off.

   **HARD CONSTRAINT — ROUTE ORDER (Hono jest registration-order; naruszenie zwraca 404 lub matchuje wrong handler):**
   1. Otwórz `apps/api/src/routes/games.ts`. Znajdź linię `games.get('/:externalId', …)` (obecnie ~linia 151).
   2. **PRZED** tą linią zarejestruj metadata sub-router: `games.route('/metadata', createGamesMetadataRouter({ searchGameMetadata }))`.
   3. Dodaj integration test który failuje jeśli order odwrócony: GET `/api/games/metadata/candidates?title=X&platform=PS2` MUSI zwrócić 200, NIE 404 ani "game not found" 404 z `:externalId` handlera.

   DODAJ obok PUT `:externalId` nowy PATCH:
   ```ts
   games.patch('/:externalId/metadata', async (c) => {
     const externalId = c.req.param('externalId');
     const userId = c.get('user').id;
     const body = await c.req.json();
     const result = await enrichGameMetadata.execute(externalId, body, userId);
     if (!result.ok) {
       const e = result.error;
       if (e.kind === 'not_found') {
         console.log(JSON.stringify({ event: 'security.idor_attempt', userId, externalId, route: 'PATCH /games/:externalId/metadata' }));
         return c.json({ error: 'not found' }, 404);
       }
       if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
       if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
       // e.error is GameValidationError | CoverImageUrlError — both are discriminated unions
       // with a `kind: string` field, structurally compatible with domainProblem's signature
       // `(error: { kind: string } | string, status?: number)` — no narrowing required.
       return c.json(internalProblem('unknown error'), 500);
     }
     console.log(JSON.stringify({ event: 'igdb.enrich', userId, externalId, providerId: body?.providerId }));
     return c.json(toGameResponse(result.value), 200);
   });
   ```

   W `games-metadata.ts` (GET handler) dodaj logging userId PRZED execute:
   ```ts
   const userId = c.get('user').id;
   console.log(JSON.stringify({ event: 'igdb.search.request', userId, title, platform }));
   const result = await deps.searchGameMetadata.execute({ title, platform });
   ```
3. `wiring.ts` — zbuduj cały łańcuch (dodaj EXPORTED singletons obok istniejących):
   ```ts
   import { env } from './infrastructure/config/env';  // top of file from phase 1
   // ...
   const igdbBreaker = new CircuitBreaker({
     failureThreshold: 5, windowMs: 60_000, halfOpenAfterMs: 30_000,
     onStateChange: (next, prev) => console.log(JSON.stringify({ event: next === 'open' ? 'igdb.breaker.open' : 'igdb.breaker.close', host: 'api.igdb.com', from: prev, to: next })),
   });
   const tokenStore = new IgdbTokenStore({ db, clientId: env.IGDB_CLIENT_ID, clientSecret: env.IGDB_CLIENT_SECRET });
   const rateLimiter = new TokenBucketRateLimiter({ capacity: 4, refillIntervalMs: 250 });
   const httpClient = new IgdbHttpClient({ baseUrl: 'https://api.igdb.com/v4', clientId: env.IGDB_CLIENT_ID, tokenStore, rateLimiter, breaker: igdbBreaker, timeoutMs: env.IGDB_TIMEOUT_MS });
   const rawProvider = new IgdbGameMetadataProvider({ httpClient });
   const cacheRepo = new MetadataCacheRepository(db);
   const cachingProvider = new CachingGameMetadataProvider({ inner: rawProvider, cacheRepo, positiveTtlDays: env.IGDB_CACHE_TTL_DAYS, negativeTtlDays: 1 });
   export const searchGameMetadata = new SearchGameMetadata(cachingProvider, cacheRepo);
   export const enrichGameMetadata = new EnrichGameMetadata(gameRepository);
   ```
   `routes/games.ts` importuje te singletons bezpośrednio (NIE factory).
4. Integration test (nowy plik `apps/api/src/routes/__tests__/games-metadata.int.test.ts`):
   - Postaw lokalny fake-IGDB Hono server (`new Hono().post('/games', c => c.json([{id:1, name:'X', …}]))`), słuchaj na losowym porcie.
   - Inject `fetchImpl` do `IgdbHttpClient` żeby pukać w `http://localhost:<port>` zamiast `api.igdb.com`. (Wymaga że `baseUrl` jest configurable per test — już jest.)
   - Test 1: `GET /api/games/metadata/candidates?title=X&platform=PS2` (auth header set per istniejący test helper) → 200, candidates length 1, degraded false. Cache row exists.
   - Test 2: drugi call ten sam input → fake server NIE dostaje requesta (count requestów = 1), response z cache, degraded false.
   - Test 3: fake server zwraca 500 trzy razy → response `{candidates:[], degraded:true, reason:'provider_down'}`. Drugi call (po wpisie cache z testu 1) → response z `staleAt`.
5. Dodaj test PATCH IDOR do `apps/api/src/routes/games.idor.test.ts` (istniejący plik — NIE twórz nowego): userA tworzy grę, userB próbuje PATCH `/api/games/<externalId>/metadata` → 404. Użyj istniejących helperów/fixturów w tym pliku.
6. Dodaj test auth-coverage (DoD): unauthenticated `GET /api/games/metadata/candidates?title=X&platform=PS2` zwraca 401. Test może żyć w `apps/api/src/routes/games.test.ts` lub osobnym pliku — wzór per istniejący auth coverage test.
7. **Graceful shutdown: OUT OF SCOPE.** Existing shutdown handler w `apps/api/src/index.ts:88-91` wywołuje `process.exit(0)` natychmiast. In-flight HTTP responses i IGDB calls umierają z procesem. Acceptable at hobby scale — no SLA dla client-facing aborts. Revisit gdy dojdzie load balancer lub deploy-without-downtime requirement. **NIE dodawaj AbortController w tej fazie** — dodaje plumbing surface (signal threaded through IgdbHttpClient + wiring + tests) bez wartości na current scale.
8. `bun test` → wszystko zielone. `bun run check` czyste. Test handlowy: `curl -H "Cookie: …" "http://localhost:3000/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2"` zwraca JSON.

**Rezultat:** Backend feature-complete. Frontend (faza 5) konsumuje te dwa endpointy.

### Step 4 — Nice-to-have (skip if blocked, NOT part of DoD)
Te dwa items NIE blokują DoD. Jeśli `IGDB_LIVE` credentials są niedostępne lub graceful-shutdown wiring jest non-trivial, skip i note w handoff.

1. Manual smoke script `apps/api/scripts/smoke-igdb.ts` — wywołuje real `IgdbGameMetadataProvider.search({title:'Resident Evil 4', platform:'PS2'})` z env vars, wypisuje wyniki, exit. Gated przez `if (process.env.IGDB_LIVE !== '1') { console.log('skipped'); process.exit(0); }`. Dodaj `"smoke:igdb": "IGDB_LIVE=1 bun run scripts/smoke-igdb.ts"` do `apps/api/package.json` scripts.
2. Graceful shutdown wiring — patrz Step 4 punkt 7 wyżej, decyzja: OUT OF SCOPE.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co dokładnie nie działa, jaki błąd dostałeś, jaka twoja hipoteza co jest przyczyną>
Zakończ pracę. Nie próbuj obejść problemu w inny sposób.
