# Games Filter & Sort — Faza 5: Routes (repeated params + ujednolicony error handler + observability)

## Goal
W route handlerze `/games` parsuj **repeated query params** (`?platforms=A&platforms=B`) jako tablice i przekaż do use case. Dodaj globalny Hono error handler dla `ZodError` → 400 RFC 7807. **Migruj POST/PUT/DELETE na ten sam kształt błędu walidacji** (Option A — jeden kontrakt błędu w całym API). Dodaj structured log z `filterShape` (booleans + counts), bez raw search/platform values. Dodaj DoS pre-check (413 dla absurdalnej liczby parametrów).

## Definition of Done
- [ ] `apps/api/src/routes/games.ts` używa `c.req.queries('platforms')` / `c.req.queries('formats')` (repeated params, NIE CSV)
- [ ] Wszystkie błędy walidacji w `routes/games.ts`, `routes/genres.ts`, `routes/developers.ts` zwracają **ten sam** kształt RFC 7807: `{ type, title, status, detail, issues }`
- [ ] Stary kształt `{ error: 'validation', issues }` znika z całego `apps/api/src/routes/`
- [ ] Globalny `app.onError` łapie `ZodError` (rzucone z `listGames.execute` przez `.parse()`)
- [ ] Helper `zodIssuesToProblemJson(issues)` w `apps/api/src/routes/_problem-json.ts` (NOWY) — używany w POST/PUT do mapowania `Result.err({ kind: 'invalid_input', issues })`
- [ ] DoS pre-check: jeśli `c.req.queries('platforms')?.length > 100` → 413 przed Zod
- [ ] Log po sukcesie zawiera `userId`, `durationMs`, `total`, `filterShape` — NIE raw search ani platform values
- [ ] Test routes: `apps/api/src/routes/games.test.ts` (NOWY lub rozszerzenie istniejącego) z 4 case'ami (3 walidacja + 1 happy)
- [ ] Test sprawdza że POST/PUT z bad payload też zwraca RFC 7807 (NIE stary `{error:'validation'}`)
- [ ] `bun test apps/api/` zielone
- [ ] `bun run --cwd apps/api typecheck` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, NIE npm)
**Framework:** Hono — `c.req.queries(key)` zwraca `string[] | undefined` dla repeated params; `c.json(...)`; global handler przez `app.onError(...)`
**Walidacja:** Zod 4 — sprawdź exact API w Zod 4 (`error.issues`, `ZodError` instance check)

### Step 0: Pobierz dokumentację
Użyj Context7:
- Hono: "queries vs query, repeated query parameters, c.req.queries"
- Hono: "global error handler app.onError, custom error response"
- Hono: "logger middleware structured logging"
- Zod 4: "ZodError instance check, issues format"

## Design decisions
- **Multi-value filter encoding: repeated params, nie CSV.** Dlaczego: nazwy platform są user-defined (`"Sega CD, Genesis Mini"`, `"Game Boy / Color"` itd.) i przecinek to legalny znak w URL. CSV split byłby footgunem. `formats` jest enumem bez przecinków, ale dla spójności też repeated.
- **Single error shape (Option A — Migration):** wszystkie błędy walidacji w API zwracają RFC 7807:
  ```json
  { "type": "/errors/validation", "title": "Invalid input",
    "status": 400, "detail": "...", "issues": [...] }
  ```
  Trasowanie:
  - `listGames` (GET /games) — `.parse()` w use case rzuca `ZodError` → globalny `app.onError` mapuje na RFC 7807.
  - `createGame`, `updateGame` — `.safeParse()` w use case zwraca `Result.err({ kind: 'invalid_input', issues })`. Route handler woła helper `zodIssuesToProblemJson(issues)` → ten sam JSON shape.
  - `kind: 'domain'` (np. `name_taken` w genres/developers) → mapuj na `{ type: '/errors/domain', title: '...', status: 400/409, detail: ... }` (jednorazowo określ jaki status code per error kind).
- **DoS pre-check:** zanim Zod zaczyna parsować, sprawdź `c.req.queries('platforms')?.length > 100` → 413. Powód: złośliwy klient może wysłać `?platforms=X` 10 000 razy — Hono parsuje wszystko PRZED Zod (memory pressure). 100 to ceiling 5x większy niż `.max(20)` ze schematu.
- **Logger:** użyj istniejącego loggera projektu (sprawdź `wiring.ts`, `index.ts`). Jeśli brak — `console.log(JSON.stringify(...))` (pino w osobnym tickecie). Format:
  ```ts
  log({ event: 'games.list', userId, durationMs, total, filterShape });
  ```
  gdzie `filterShape = { hasSearch: bool, searchLen: number, platforms: number, formats: number, hasYearRange: bool }`.
- NIE loguj `search` value (PII), NIE loguj `platforms` (low-risk, ale spójnie nie logujemy raw values).

### Relevant files (edit only these)
- `apps/api/src/routes/games.ts` — listGames + ujednolicenie POST/PUT
- `apps/api/src/routes/genres.ts` — ujednolicenie POST + DELETE error shapes
- `apps/api/src/routes/developers.ts` — ujednolicenie POST + DELETE error shapes
- `apps/api/src/routes/_problem-json.ts` (NOWY) — helper `zodIssuesToProblemJson`, `domainErrorToProblemJson`
- `apps/api/src/index.ts` LUB `apps/api/src/wiring.ts` — globalny error handler (sprawdź gdzie aplikacja jest tworzona)
- `apps/api/src/routes/games.test.ts` (NOWY) lub istniejący test pliku

### Files to read but NOT edit
- `apps/api/src/index.ts` — punkt startowy Hono, gdzie middleware
- `apps/api/src/wiring.ts` — DI dla use case'ów
- `apps/api/src/application/games/list-games.ts` — schema z Fazy 3
- `apps/api/src/application/games/create-game.ts` / `update-game.ts` — zwracają `Result.err({ kind: 'invalid_input', issues })`
- `apps/client/src/lib/*.ts` — sprawdź czy frontend nigdzie nie czyta starego `{error:'validation'}` shape (jeśli tak, poinformuj — Faza 8 dorobi handling RFC 7807)

## Constraints
- NIE ładuj logiki biznesowej do route handlera. Tylko: parse query → przekaż do use case → zmapuj wynik.
- NIE rzucaj ZodError jako 500 — global handler musi go złapać i zwrócić 400.
- NIE loguj raw search/platform values. Tylko booleans/counts.
- NIE używaj CSV parsingu nigdzie w API. `c.req.queries(key)` daje array natywnie.
- NIE zostawiaj starego `{ error: 'validation', issues }` w żadnym route. Migration jest atomowa w tym PR — albo wszystko, albo nic. „Globalny handler" który łapie tylko jeden route to antywzorzec.
- NIE migruj kontraktu other-than-validation błędów (404, 409, 500) — to osobny ticket. Tylko walidacja → RFC 7807.

## Steps

### Step 1: Helper `zodIssuesToProblemJson`
**Co robimy:**
1. Utwórz `apps/api/src/routes/_problem-json.ts`:
   ```ts
   import type { ZodIssue } from 'zod';

   export type ProblemJson = {
     type: string;
     title: string;
     status: number;
     detail: string;
     issues?: ZodIssue[];
   };

   export function zodIssuesToProblemJson(issues: ZodIssue[]): ProblemJson {
     return {
       type: '/errors/validation',
       title: 'Invalid input',
       status: 400,
       detail: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
       issues,
     };
   }

   export function domainProblem(detail: string, status = 400): ProblemJson {
     return {
       type: '/errors/domain',
       title: 'Domain rule violation',
       status,
       detail,
     };
   }
   ```
2. Plik kompiluje się, brak unused exports.

**Rezultat:** wspólny mapper kształtów błędów.

### Step 2: Globalny error handler dla ZodError
**Co robimy:**
1. Znajdź gdzie tworzony jest Hono app (`apps/api/src/index.ts`). Zidentyfikuj instancję `const app = new Hono()`.
2. Dodaj `app.onError(...)`:
   ```ts
   import { ZodError } from 'zod';
   import { zodIssuesToProblemJson } from './routes/_problem-json';

   app.onError((err, c) => {
     if (err instanceof ZodError) {
       return c.json(zodIssuesToProblemJson(err.issues), 400);
     }
     console.error('[unhandled]', err);
     return c.json(
       { type: '/errors/internal', title: 'Internal server error', status: 500, detail: 'Unexpected error' },
       500,
     );
   });
   ```
3. Sprawdź że `apps/api/src/index.ts` eksportuje to samo `app` którego używają testy.

**Rezultat:** Hono app ma globalny error handler dla ZodError.

### Step 3: Rozszerz route handler GET /games + DoS pre-check
**Co robimy:**
1. Edytuj `apps/api/src/routes/games.ts`. Zastąp obecny `games.get('/', ...)`:
   ```ts
   games.get('/', async (c) => {
     const userId = c.get('user').id;
     const t0 = Date.now();

     // Anti-DoS: cap total items in array params before Zod sees them
     const rawPlatforms = c.req.queries('platforms');
     const rawFormats = c.req.queries('formats');
     if ((rawPlatforms?.length ?? 0) > 100 || (rawFormats?.length ?? 0) > 100) {
       return c.json(
         {
           type: '/errors/payload-too-large',
           title: 'Too many filter values',
           status: 413,
           detail: 'platforms/formats must each have at most 100 entries',
         },
         413,
       );
     }

     const result = await listGames.execute(
       {
         search: c.req.query('search'),
         kind: c.req.query('kind'),
         page: c.req.query('page'),
         perPage: c.req.query('perPage'),
         sort: c.req.query('sort'),
         dir: c.req.query('dir'),
         platforms: rawPlatforms,                  // string[] | undefined
         formats: rawFormats,                      // string[] | undefined
         releaseYearFrom: c.req.query('releaseYearFrom'),
         releaseYearTo: c.req.query('releaseYearTo'),
       },
       userId,
     );

     const search = c.req.query('search') ?? '';
     const filterShape = {
       hasSearch: search.length > 0,
       searchLen: search.length,
       platforms: rawPlatforms?.length ?? 0,
       formats: rawFormats?.length ?? 0,
       hasYearRange: !!(c.req.query('releaseYearFrom') || c.req.query('releaseYearTo')),
     };
     console.log(JSON.stringify({
       event: 'games.list',
       userId,
       durationMs: Date.now() - t0,
       total: result.total,
       page: result.page,
       sort: c.req.query('sort'),
       dir: c.req.query('dir'),
       filterShape,
     }));

     return c.json({ ...result, items: result.items.map(toGameResponse) });
   });
   ```
2. Zwróć uwagę: NIE robimy żadnego CSV split. `c.req.queries(key)` natywnie daje array dla `?platforms=A&platforms=B`.

**Rezultat:** GET /games używa repeated params + DoS pre-check + structured log.

### Step 4: Migruj POST/PUT/DELETE na RFC 7807 (Option A)
**Co robimy:**
1. W `apps/api/src/routes/games.ts` zastąp wszystkie `c.json({ error: 'validation', issues: e.issues }, 400)`:
   ```ts
   import { zodIssuesToProblemJson, domainProblem } from './_problem-json';

   // POST /
   if (!result.ok) {
     const e = result.error;
     if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
     if (e.kind === 'domain') return c.json(domainProblem(String(e.error)), 400);
     return c.json({ type: '/errors/internal', title: 'Internal', status: 500, detail: 'unknown' }, 500);
   }
   ```
   To samo dla PUT.
2. To samo w `apps/api/src/routes/genres.ts` i `apps/api/src/routes/developers.ts` — zamień każde `c.json({ error: 'validation', issues: e.issues }, 400)` i `c.json({ error: 'validation', domain: e.error }, 400)` na helpery.
3. **NIE migruj** błędów typu `not_found`/`name_taken`/`in_use` — to osobny scope. Zostaw je jak są (`{ error: 'name_taken' }, 409`).
4. Po zmianie: `grep -rn "error: 'validation'" apps/api/src/routes/` musi zwrócić **0 wyników**. Jeśli zwraca cokolwiek — migracja niekompletna.

**Rezultat:** wszystkie 400 walidacyjne w `/games`, `/genres`, `/developers` mają ten sam JSON shape.

### Step 5: Test routes (RED → GREEN)
**Co robimy:**
1. Sprawdź czy istnieje test dla routes (`grep -r "describe.*games.get\|app.request.*'/games" apps/api/src/`). Jeśli tak — rozszerz. Jeśli nie — utwórz `apps/api/src/routes/games.test.ts` z testami:
   - `400 RFC 7807 on releaseYearFrom > releaseYearTo` — `GET /games?releaseYearFrom=2030&releaseYearTo=2000` → status 400, body ma `type: '/errors/validation'`, `issues: [...]`. **Asercja kluczowa:** `expect(body).not.toHaveProperty('error')` (stary kształt zniknął).
   - `400 RFC 7807 on platforms > 20` — `GET /games?` z 21 repeated params → 400 RFC 7807.
   - `413 on platforms > 100` — `GET /games?` z 101 repeated params → 413, `type: '/errors/payload-too-large'`.
   - `200 with valid filters via repeated params` — `?platforms=PC&platforms=PS5&formats=digital&releaseYearFrom=2010&releaseYearTo=2020` → 200, items odfiltrowane.
   - `400 RFC 7807 on POST /games with bad payload` — POST z `{title: ''}` → 400, body ma `type: '/errors/validation'` (nie `{error:'validation'}`). **To weryfikuje migrację Option A.**
2. Użyj Hono test API: `await app.request('/games?...', { headers: { Cookie: '<auth>' } })`. Jeśli auth jest skomplikowany — zamockuj middleware lub użyj fixture user/session.
3. Aby zbudować URL z repeated params w teście: `const sp = new URLSearchParams(); for (const p of ['PC','PS5']) sp.append('platforms', p); await app.request('/games?'+sp.toString(), ...)`.
4. `bun test apps/api/src/routes/games.test.ts` → GREEN.
5. `bun test apps/api/` całość → GREEN. Jeśli istniejące testy `routes/games.post`/`routes/genres` padają bo asercjowały `body.error === 'validation'` — zaktualizuj je do nowego shape (`body.type === '/errors/validation'`). To część migracji.

**Rezultat:** route ma testy walidacji + happy path + 413 + Option A weryfikacja; wszystko zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
