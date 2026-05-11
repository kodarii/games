# IGDB enrichment — Faza 3: IGDB HTTP infrastructure (token + client + rate limit)

## Goal
Zbuduj prymitywy infrastrukturalne do gadania z IGDB: Twitch OAuth token store (DB-backed, in-process memo), HTTP client z timeoutem/retry/circuit-breakerem, rate limiter (4 req/s + 8 in-flight concurrency cap). To są BUDULCE — adapter providera + cache decorator + use cases przyjdą w fazie 4.

## Definition of Done
- [ ] Wszystkie nowe testy zielone: `bun test apps/api/src/infrastructure/igdb/`
- [ ] Wszystkie testy z fazy 1+2 dalej zielone: `bun test`
- [ ] `bun run check` czyste, `bun run lint` czyste (jeśli istnieje skrypt lint)
- [ ] Plik `apps/api/src/infrastructure/igdb/igdb-http-client.ts` eksportuje `IgdbHttpClient` z metodą `post(path: string, body: string): Promise<Response>` która: dokleja headery `Client-ID`, `Authorization: Bearer …`, robi timeout/retry/breaker/rate-limit
- [ ] Plik `apps/api/src/infrastructure/igdb/igdb-token-store.ts` eksportuje `IgdbTokenStore` z metodą `getValidToken(): Promise<string>` (refresh-on-expire, single-flight lock)
- [ ] Plik `apps/api/src/infrastructure/metadata/rate-limiter.ts` eksportuje vendor-neutralny `TokenBucketRateLimiter` (reusable dla innych providerów)
- [ ] Plik `igdb-token-store.ts` zawiera komentarz na górze pliku: `// Single-process assumption: in-process Promise lock prevents concurrent refresh WITHIN this process only. Horizontal scale-out would race on DB write; revisit if deployed to >1 instance.`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm). `bun test`, `bun run check`.
**HTTP:** Native `fetch` (NIE axios, NIE node-fetch). Bun ma globalny `fetch`.
**Mockowanie fetcha w testach:** zastrzyknij fetch jako dependency do testowanego klienta. NIE używaj `vi.mock('global')` — zamiast tego konstruktor klienta przyjmuje `fetchImpl: typeof fetch = fetch` z defaultem.
**DB:** Bun-SQLite + Drizzle. Tabela `igdbOauthToken` ze schematu — pole `id` (zawsze 1), `accessToken`, `expiresAt` (timestamp), `obtainedAt` (timestamp).
**Config:** czytaj `env` z `apps/api/src/infrastructure/config/env.ts` (z fazy 1). NIE czytaj `process.env` bezpośrednio.

### Step 0: Pobierz dokumentację (Context7)
**OBOWIĄZKOWE — odpal te zapytania przed pisaniem kodu:**
1. `mcp__context7__resolve-library-id` z query `"IGDB API"` → wybierz Twitch IGDB API docs (lub najbliższy match)
2. `mcp__context7__query-docs` z library id + pytanie:  
   `"Twitch OAuth client credentials grant — request body, response shape, expires_in value, capitalization of Authorization header"`
3. `mcp__context7__query-docs` z tym samym id + pytanie:  
   `"IGDB rate limiting — concurrent in-flight cap, requests per second, 429 retry-after header behavior"`

Jeśli MCP context7 nie zwraca sensownych wyników, polegaj na sekcji "Resolutions (IGDB docs pass)" w `docs/plans/igdb-enrichment/README.md` (linie 379–409 oryginału) — tam jest cały skondensowany kontrakt.

## Design decisions
- **Twitch OAuth endpoint:** `POST https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials`. Response: `{ access_token: string, expires_in: number /* sekundy, ~5_587_808 */, token_type: 'bearer' }`. Authorization header hardcode na `'Bearer '` (capital B) — NIE templatuj z `token_type` (zawsze `lowercase` w response).
- **Token storage:** jedna row w `igdb_oauth_token`. Refresh gdy `expiresAt - now < 1 day`, lub przy 401 z IGDB. In-process memo (`Promise<Token>` lock) żeby concurrent calls nie wywoływały podwójnego refresha. **Persist order: DB `INSERT OR REPLACE` first, THEN memo update on DB write success. If DB write throws, the inflight Promise rejects and the next caller restarts the full Twitch+DB cycle. Never update the memo before the DB write succeeds — otherwise a process crash leaves the next process believing it has a token that does not exist in the DB.**
- **401 handling:** rozróżnij `expired_token` (refresh + retry once) od `invalid_client_id / revoked_app` (no retry, surface as `unavailable`). Distinction by response body inspection (Twitch zwraca `{ message: 'invalid client', status: 401 }` lub podobnie — sprawdź w docs). W razie wątpliwości: pierwszy 401 → refresh + retry once; drugi 401 z tym samym żądaniem → no retry, surface as `unavailable`.
- **HTTP retry policy:** max 2 retry. Retry tylko na 429 / 5xx / network error. Backoff: `200ms * 2^attempt + jitter(0..150ms)`. Honoruj `Retry-After` header (sekundy lub HTTP date).
- **Circuit breaker per host:** otwórz po 5 kolejnych failures w oknie 60s; half-open po 30s. Klucze osobne: `api.igdb.com` i `id.twitch.tv` (żeby IGDB outage nie wywalał auth breakera). State PROCESS-LOCAL, in-memory (resetuje się na deploy). Breaker open → `{kind:'unavailable'}` natychmiast, bez kolejkowania.
- **Breaker observability:** `CircuitBreaker` constructor przyjmuje opcjonalny `onStateChange(next, prev)` callback. Breaker wywołuje go DOKŁADNIE RAZ per state transition (closed→open, open→half-open, half-open→closed, half-open→open). Wiring przekazuje callback który emituje structured log `{event:'igdb.breaker.open'|'igdb.breaker.close', failures, host}`. **NIE loguj wewnątrz `canRequest()`** — produkuje log per zablokowany call podczas outage'u.
- **Rate limiter scope:** single process-wide singleton instancjowany w `wiring.ts`. At single-user MVP scale to jest correct. Known limitation: jeden heavy concurrent user może starve other users. Gdy user count > 5 active, partycjonuj bucket per `userId` (`Map<userId, TokenBucketRateLimiter>`) — NIE instancjuj per-request limiters w use case (to łamie abstrakcję).
- **Rate limiter:** Token bucket: capacity 4, refill 1 token / 250ms. Vendor-neutralny — `TokenBucketRateLimiter` w `infrastructure/metadata/`.
- **Concurrency cap:** `MAX_INFLIGHT = 8` semaphore W KLIENCIE HTTP (nie w rate limiterze) — bo bucket pozwala na momentary burst który może przekroczyć 8 jeśli responses są wolne. Token endpoint NIE jest throttled ani capped — to inny host.
- **Timeouts:** IGDB calls = `AbortSignal.timeout(env.IGDB_TIMEOUT_MS)` (default 5000ms). Token endpoint = 8000ms (dłużej, bo to one-time-per-60-days operacja).
- **Headers IGDB:** `Client-ID: <env.IGDB_CLIENT_ID>`, `Authorization: Bearer <token>`, `Accept: application/json`, `Content-Type: text/plain` (Apicalypse). Body jest plain text (NIE JSON).
- **Single-flight token refresh:** trzymaj `private inflightRefresh: Promise<string> | null` w `IgdbTokenStore`. Jeśli refresh już trwa, drugi caller czeka na to samo Promise.

### Relevant files (edit only these)
- `apps/api/src/infrastructure/metadata/rate-limiter.ts` — NOWY vendor-neutralny rate limiter
- `apps/api/src/infrastructure/metadata/__tests__/rate-limiter.test.ts` — NOWE testy (fake timers)
- `apps/api/src/infrastructure/igdb/igdb-token-store.ts` — NOWY
- `apps/api/src/infrastructure/igdb/__tests__/igdb-token-store.test.ts` — NOWE testy
- `apps/api/src/infrastructure/igdb/igdb-http-client.ts` — NOWY
- `apps/api/src/infrastructure/igdb/__tests__/igdb-http-client.test.ts` — NOWE testy
- `apps/api/src/infrastructure/igdb/circuit-breaker.ts` — NOWY (lub umieść inline w http-client jeśli prościej — twoja decyzja, ale wydziel jeśli >40 linii)
- `apps/api/src/infrastructure/igdb/__tests__/circuit-breaker.test.ts` — NOWE testy

### Files to read but NOT edit
- `apps/api/src/infrastructure/config/env.ts` (z fazy 1)
- `apps/api/src/infrastructure/db/schema.ts` (znasz tabelę `igdbOauthToken`)
- `apps/api/src/infrastructure/db/client.ts` (jak inni używają `db`)
- `apps/api/src/domain/games/game-metadata-provider.ts` (z fazy 2 — znasz error union `GameMetadataProviderError`)

## Constraints
- TDD: każdy step ma test (RED) → implementacja (GREEN)
- NIE wrzucaj logiki cache do tej fazy (cache to faza 4)
- NIE wrzucaj logiki IGDB Apicalypse query do tej fazy (to faza 4)
- HTTP client NIE wie nic o Apicalypse — przyjmuje `path: string` i `body: string` i odpala fetch
- Token store NIE pisze do innej tabeli niż `igdb_oauth_token`
- `TokenBucketRateLimiter` MA BYĆ vendor-neutralny — nie importuj nic IGDB-specyficznego
- Concurrency semaphore w HTTP clientcie żyje w PAMIĘCI procesu — pojedyncza instancja singleton; nie persystuj
- Wszystkie nowe pliki pod `infrastructure/igdb/` MOGĄ używać słowa "Igdb" w nazwach — tam jest legalne
- Wszystkie pliki pod `infrastructure/metadata/` MUSZĄ być vendor-neutralne (zero "Igdb" w identyfikatorach)
- NIE używaj globalnego `fetch` w testach klienta — wstrzykuj `fetchImpl` przez konstruktor
- **Token redaction:** żaden log statement pod `infrastructure/igdb/**` ani `infrastructure/metadata/**` NIE MOŻE zawierać wartości `Authorization` headera ani raw access tokena. Zbuduj mały helper `redactAuthHeaders(headers): Record<string,string>` który zastępuje `Authorization` przez `'[REDACTED]'` i używaj go wszędzie gdzie shape requesta wchodzi do loga. Dodaj regresyjny test w `igdb-http-client.test.ts`: dowolna ścieżka błędu testowana powyżej NIE produkuje log output zawierający test token literal.

## Steps

### Step 1: TokenBucketRateLimiter (vendor-neutralny) + testy
**Co robimy:**
1. Napisz `rate-limiter.test.ts` z fake timers (Bun ma `mock.useFakeTimers`/`setSystemTime` lub użyj prostego sterowanego `now()` injectowanego do konstruktora):
   - `new TokenBucketRateLimiter({ capacity: 4, refillIntervalMs: 250, now })` zaczyna z 4 tokenami
   - 4 × `acquire()` → wszystkie natychmiast resolve
   - 5-ty `acquire()` → pending; po advance time o 250ms → resolve
   - po 1000ms idle bucket jest pełny (4 tokeny) — kolejne 4 acquire natychmiast
   - FIFO order: 5-ty acquire zwalnia się PRZED 6-tym (sprawdź kolejnością .then)
2. Zaimplementuj `TokenBucketRateLimiter`:
   ```ts
   export class TokenBucketRateLimiter {
     constructor(opts: { capacity: number; refillIntervalMs: number; now?: () => number }) { ... }
     async acquire(): Promise<void> { ... }
   }
   ```
   - Trzymaj `tokens: number`, `lastRefillAt: number`, kolejkę `waiters: Array<() => void>`
   - W `acquire`: refill (oblicz ile czasu minęło / refillIntervalMs, dodaj tokeny do capacity), jeśli `tokens > 0` decrement + return, else push waitera do kolejki
   - Wewnętrzny `tick()` na `setTimeout` budzi kolejkę: refill, while waiters && tokens > 0 → shift + resolve + decrement, schedule kolejnego tick'a jeśli kolejka niepusta
3. `bun test apps/api/src/infrastructure/metadata/__tests__/rate-limiter.test.ts` → GREEN.

**Rezultat:** Reusable rate limiter, vendor-neutralny.

### Step 2a: CircuitBreaker — testy (RED)
**Co robimy:**
1. Napisz `circuit-breaker.test.ts`:
   - Stan: `closed` początkowo
   - 5 kolejnych `recordFailure()` w oknie 60s → stan `open`, `canRequest()` zwraca false
   - Po 30s w `open` → przejście do `half-open`, `canRequest()` zwraca true
   - W `half-open`: `recordSuccess()` → `closed`. `recordFailure()` → `open` ponownie.
   - `recordSuccess()` w stanie `closed` resetuje licznik failures
   - **`onStateChange` callback fire-on-transition test:** mock callback, run pełen cykl (closed→open→half-open→closed→half-open→open), assert że callback wywołany DOKŁADNIE 4 razy z poprawnymi `(next, prev)` parami. `canRequest()` w stable state (nie transition) NIE wywołuje callbacka.
2. `bun test` → RED.

### Step 2b: CircuitBreaker — implementacja (GREEN)
**Co robimy:**
1. Zaimplementuj `CircuitBreaker`:
   ```ts
   export class CircuitBreaker {
     constructor(opts: {
       failureThreshold: number;
       windowMs: number;
       halfOpenAfterMs: number;
       now?: () => number;
       onStateChange?: (next: 'closed'|'open'|'half-open', prev: 'closed'|'open'|'half-open') => void;
     }) {}
     canRequest(): boolean
     recordSuccess(): void
     recordFailure(): void
     get state(): 'closed' | 'open' | 'half-open'
   }
   ```
   Callback wywoływany TYLKO przy transition (porównaj prev != next), nigdy w `canRequest`.
2. `bun test apps/api/src/infrastructure/igdb/__tests__/circuit-breaker.test.ts` → GREEN.

### Step 2c: IgdbTokenStore — testy (RED)
**Co robimy:**
1. Napisz `igdb-token-store.test.ts` (mock'uj `fetchImpl` i `db`):
   - Pierwszy `getValidToken()` z pustą tabelą → fetch do Twitch, INSERT row, return access_token
   - Drugi `getValidToken()` z świeżym tokenem w tabeli (expiresAt w przyszłości > 1 day) → ZERO fetchy, return cached
   - `getValidToken()` z tokenem expiringat-soon (< 1 day do expires) → refresh, UPDATE row
   - 401 case z Twitch przy refresh → throw / err (caller obsłuży)
   - Concurrent: dwie równoległe `getValidToken()` z pustą tabelą → fetch wywołany TYLKO RAZ (single-flight)
   - **Persist order test:** mock DB write żeby rzucał błąd po fetchu Twitch → assert że inflight Promise rejects + memo NIE jest ustawiony (kolejne wywołanie ponownie fetchuje Twitch)
2. `bun test` → RED.

### Step 2d: IgdbTokenStore — implementacja (GREEN)
**Co robimy:**
1. Zaimplementuj `IgdbTokenStore`:
   ```ts
   // Single-process assumption: in-process Promise lock prevents concurrent refresh WITHIN this process only.
   // Horizontal scale-out would race on DB write; revisit if deployed to >1 instance.
   export class IgdbTokenStore {
     constructor(opts: { db: Database; clientId: string; clientSecret: string; fetchImpl?: typeof fetch; now?: () => Date }) {}
     async getValidToken(): Promise<string>
     async forceRefresh(): Promise<string>  // wywoływane przez http client przy 401
   }
   ```
   - Memoize `inflightRefresh: Promise<string> | null`
   - DB read: `SELECT * FROM igdb_oauth_token WHERE id = 1 LIMIT 1`
   - DB write: `INSERT OR REPLACE INTO igdb_oauth_token (id, access_token, expires_at, obtained_at) VALUES (1, ?, ?, ?)` — **najpierw DB INSERT, dopiero potem memo update**
   - Twitch fetch z timeoutem 8000ms
2. `bun test apps/api/src/infrastructure/igdb/__tests__/igdb-token-store.test.ts` → GREEN.

**Rezultat:** TokenStore działa, single-flight działa, breaker działa, persist order safe.

### Step 3: IgdbHttpClient (timeout + retry + breaker + rate limit + concurrency) + testy
**Co robimy:**
1. Napisz `igdb-http-client.test.ts` (mock fetchImpl):
   - Happy path: 200 → resolve z Response
   - 401 raz → token forceRefresh → retry → 200 → resolve. (fetchImpl wywołany 2× dla tego samego requestu)
   - 401 dwa razy z rzędu → reject jako `unavailable`-equivalent (np. throw `IgdbHttpError({ kind: 'unavailable' })`)
   - 429 z `Retry-After: 1` → backoff 1000ms+ → retry → 200 → resolve (sprawdź że delay przynajmniej 1000ms)
   - 500 → backoff → retry → 500 → backoff → retry → 500 → reject. Sprawdź łącznie 3 fetch calls (1 original + 2 retries).
   - Network error (fetch throws) → retry, max 2
   - Breaker OPEN przed wywołaniem → fetch NIE odpalony, throw `unavailable`
   - Concurrency cap: 10 równoległych calls, mock fetchImpl który nigdy nie resolve'uje → po sprawdzeniu obecnie wykonujących, 8 ma fetch w toku, 2 są zablokowane na semaphore
2. Zaimplementuj `IgdbHttpClient`:
   ```ts
   export class IgdbHttpClient {
     constructor(opts: {
       baseUrl: string;             // 'https://api.igdb.com/v4'
       clientId: string;
       tokenStore: IgdbTokenStore;
       rateLimiter: TokenBucketRateLimiter;
       breaker: CircuitBreaker;
       timeoutMs: number;
       fetchImpl?: typeof fetch;
       maxInflight?: number;        // 8
     }) {}
     async post(path: string, body: string): Promise<Response>
   }
   ```
   - Wewnątrz `post`: sprawdź breaker, await rate limiter, await semaphore acquire, try { token = await tokenStore.getValidToken(); fetch with headers + AbortSignal; if 401 && !alreadyRetried → forceRefresh + retry once; if 429/5xx → schedule retry per backoff; on success record breaker success; on terminal failure record breaker failure } finally { semaphore release }
   - Semaphore = `Math.max(0, maxInflight - inflight)` z kolejką waiters; prosta implementacja inline (~20 linii)
3. `bun test apps/api/src/infrastructure/igdb/__tests__/igdb-http-client.test.ts` → GREEN
4. `bun test` (cały) → wszystko zielone.
5. `bun run check` czyste.

**Rezultat:** HTTP client gotowy. Faza 4 podepnie go pod adapter providera.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co dokładnie nie działa, jaki błąd dostałeś, jaka twoja hipoteza co jest przyczyną>
Zakończ pracę. Nie próbuj obejść problemu w inny sposób.
