# Game Create Form Rebuild — Faza 1: `/metadata/status` endpoint

## Goal
Dodaj endpoint `GET /api/games/metadata/status` zwracający `{ igdbConfigured: boolean }`.
Frontend użyje go w fazie 3 żeby zdecydować czy włączać autocomplete IGDB w formularzu.
Faza musi też wystawić flagę `igdbConfigured` z `wiring.ts`, tak żeby route mogło ją
przeczytać bez ponownego parsowania `process.env`.

## Definition of Done
- [ ] `GET /api/games/metadata/status` zwraca 200 z body `{ igdbConfigured: true }` gdy `IGDB_CLIENT_ID` i `IGDB_CLIENT_SECRET` są niepuste w env, w przeciwnym razie `{ igdbConfigured: false }`.
- [ ] Endpoint jest pod tym samym routerem co `/candidates` (mount `games.route('/metadata', ...)` w `apps/api/src/routes/games.ts`), więc full path = `/api/games/metadata/status`.
- [ ] Endpoint wymaga auth (jest pod istniejącym auth middleware podpiętym wyżej w `games` routerze — sprawdź to czytając obecny `routes/games.ts`).
- [ ] Test integracyjny w `apps/api/src/routes/__tests__/games-metadata.int.test.ts` pokrywa oba przypadki (`igdbConfigured: true` i `false`).
- [ ] `bun test` zielone, `bun run check` czyste, `bun run lint` czyste.

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`).
**Stack:** Hono router, Better-Auth middleware (już podłączone na poziomie `routes/games.ts`).
**Env source of truth:** `apps/api/src/infrastructure/config/env.ts` — Zod schema, eksportuje `env`.
`IGDB_CLIENT_ID` i `IGDB_CLIENT_SECRET` są obecnie `z.string().min(1)`, czyli teoretycznie zawsze obecne. W tej fazie traktujemy `igdbConfigured` jako "czy env ma niepuste oba klucze" — zwracamy `true`. Mimo to chcemy endpoint zwracający dynamicznie, więc opieramy się o wartość z `wiring.ts`, nie hardcode `true`.

### Step 0: Pobierz dokumentację
Użyj Context7 jeśli MCP dostępny:
- Hono: "route handler returning JSON in a sub-router"
- Bun test + Hono: "request integration test pattern with app.request"
Jeśli MCP nie ma — wystarczy spojrzeć na istniejące `apps/api/src/routes/games-metadata.ts` i `apps/api/src/routes/__tests__/games-metadata.int.test.ts` — wzoruj się na nich.

### Relevant files (edit only these)
- `apps/api/src/wiring.ts` — dodaj `export const igdbConfigured: boolean = env.IGDB_CLIENT_ID.length > 0 && env.IGDB_CLIENT_SECRET.length > 0;` w sekcji IGDB.
- `apps/api/src/routes/games-metadata.ts` — dodaj parametr `readonly igdbConfigured: boolean` w `GamesMetadataRouterDeps` i nowy handler `r.get('/status', ...)`.
- `apps/api/src/routes/games.ts` — przekaż `igdbConfigured` przy wywołaniu `createGamesMetadataRouter`.
- `apps/api/src/routes/__tests__/games-metadata.int.test.ts` — dodaj testy dla `/status`.

### Files to read but NOT edit
- `apps/api/src/infrastructure/config/env.ts` — żeby zobaczyć kształt env.
- `apps/api/src/routes/games-metadata.ts` (przed edycją) — żeby zobaczyć obecny router i jego DI.
- `apps/api/src/routes/games.ts` — żeby zobaczyć gdzie router jest mountowany i jak działa auth.
- `apps/api/src/routes/__tests__/games-metadata.int.test.ts` — żeby zobaczyć jak zestawiony jest test integracyjny (jaki bootstrap, jaki helper auth, jak app.request się robi).

## Design decisions
- `igdbConfigured` jest wartością wyliczaną RAZ w `wiring.ts` z env i wstrzykiwaną do routera. NIE czytaj `process.env` ani `env` bezpośrednio w route handlerze — to łamie wzorzec DI używany przez resztę routerów.
- Endpoint NIE waliduje query/body — to czysty GET zwracający stałą boolean wartość per proces.
- Endpoint wymaga zalogowanego użytkownika (auth middleware już jest pięterko wyżej na `games`), żeby nie ujawniać informacji o konfiguracji integracji anonimowym callerom.
- Response shape jest minimalny: `{ igdbConfigured: boolean }`. Brak `degraded`, brak `reason` — to nie ma być healthcheck. Frontend ma tylko zdecydować czy pokazywać UI autocomplete'a.

## Constraints
- TDD: NAJPIERW dopisz dwa testy w `games-metadata.int.test.ts` (RED), POTEM zaimplementuj.
- NIE dodawaj nowego pliku routera — `/status` ma żyć w tym samym `games-metadata.ts` co `/candidates`.
- Route handler max ~10 linii — tylko `return c.json({ igdbConfigured: deps.igdbConfigured }, 200)`.
- NIE zmieniaj sygnatury `searchGameMetadata` ani `SearchGameMetadata` — to nie temat tej fazy.
- NIE dotykaj frontendu — fronted dotyka faza 2 i 3.
- NIE zmieniaj Zod schemy w `env.ts` — `IGDB_CLIENT_ID/SECRET` zostają wymagane na poziomie startu procesu. `igdbConfigured` po prostu sprawdza `length > 0` (defensywnie — gdyby ktoś kiedyś zluzował schemę).

## Steps

### Step 1: Testy (RED)
**Co robimy:**
1. Otwórz `apps/api/src/routes/__tests__/games-metadata.int.test.ts`. Zobacz jak istniejące testy budują app (prawdopodobnie helper który tworzy `Hono` app z auth middleware i mountowanym routerem).
2. Dodaj `describe('GET /api/games/metadata/status', ...)` z dwoma testami:
   - "returns igdbConfigured: true when wired with true" — buduje app z `createGamesMetadataRouter({ searchGameMetadata: <fake>, igdbConfigured: true })`, woła `app.request('/api/games/metadata/status', { headers: <auth> })`, oczekuje 200 i body `{ igdbConfigured: true }`.
   - "returns igdbConfigured: false when wired with false" — analogiczny test z `igdbConfigured: false`.
3. `bun test apps/api/src/routes/__tests__/games-metadata.int.test.ts` → RED (nowe testy failują bo handler nie istnieje, a `createGamesMetadataRouter` jeszcze nie przyjmuje `igdbConfigured`).
**Rezultat:** testy istnieją i FAILUJĄ z sensowną przyczyną (TypeScript error na brakującym polu w `Deps` jest OK — wtedy najpierw rozszerz `Deps`, ale handlera jeszcze NIE pisz; testy mają failować na 404 albo na nieobecnym handlerze).

### Step 2: Rozszerz router + wiring (GREEN)
**Co robimy:**
1. W `apps/api/src/routes/games-metadata.ts`:
   - Dodaj `readonly igdbConfigured: boolean;` do `GamesMetadataRouterDeps`.
   - Dodaj handler `r.get('/status', (c) => c.json({ igdbConfigured: deps.igdbConfigured }, 200));`.
2. W `apps/api/src/wiring.ts`:
   - Dodaj `export const igdbConfigured = env.IGDB_CLIENT_ID.length > 0 && env.IGDB_CLIENT_SECRET.length > 0;` w sekcji IGDB (po `igdbHttpClient`).
3. W `apps/api/src/routes/games.ts`:
   - Zaimportuj `igdbConfigured` z `../wiring` (jeśli `games.ts` używa już `searchGameMetadata` z wiring — pójdzie tym samym kanałem; jeśli używa DI parametru — przekaż przez ten parametr).
   - Wywołanie `createGamesMetadataRouter({ searchGameMetadata, igdbConfigured })`.
4. `bun test` → wszystko GREEN (nowe testy + cały istniejący suite).
5. `bun run check` + `bun run lint` → czyste.
**Rezultat:** endpoint działa, testy przechodzą, typecheck/lint czyste.

### Step 3: Smoke test ręczny (opcjonalny)
**Co robimy:**
1. `bun run dev` w `apps/api` (lub odpowiednik repo).
2. Zaloguj się przez UI (potrzebny cookie sesji), albo użyj istniejącego helpera testowego z curl.
3. `curl -b cookies.txt http://localhost:<port>/api/games/metadata/status` → `{"igdbConfigured":true}`.
**Rezultat:** endpoint odpowiada poprawnie pod realnym mountem.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>
Zakończ pracę.
