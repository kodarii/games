---
name: Phase 2 Infrastructure + HTTP
description: Implementacja DrizzleGameRepository.listAll + route GET /api/export z download header
type: plan
---

# Export Data — Faza 2: Infrastructure + HTTP

## Goal
Wystawić eksport jako endpoint `GET /api/export` (auth required), zwracający
`ExportSnapshot` jako JSON z nagłówkiem `Content-Disposition: attachment` aby
przeglądarka zaproponowała zapis pliku. Do tego zaimplementować
`DrizzleGameRepository.listAll(userId)` (w fazie 1 jest stub).

## Definition of Done
- [ ] `DrizzleGameRepository.listAll(userId)` zwraca wszystkie gry usera, posortowane po `id` ASC (stabilne)
- [ ] Endpoint `GET /api/export` zwraca 200 z body JSON odpowiadającym `ExportSnapshot`
- [ ] Response ma nagłówek `Content-Type: application/json; charset=utf-8`
- [ ] Response ma nagłówek `Content-Disposition: attachment; filename="apex-export-YYYY-MM-DD.json"` (data z `exportedAt`)
- [ ] Endpoint wymaga sesji (Better-Auth) — bez auth → 401 (przez middleware `requireAuth`)
- [ ] Smoke test ręczny: `curl -i -b cookies.txt http://localhost:3001/api/export` → 200, JSON, header attachment, gry tylko zalogowanego usera
- [ ] `bun test` (cały api) → wszystko zielone
- [ ] `bun run check` → 0 błędów

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**Katalog roboczy:** `apps/api`
**ORM:** Drizzle (SQLite). Schemat tabel: `apps/api/src/infrastructure/db/schema.ts`. `games_user_id_idx` istnieje — listAll po user_id idzie po indeksie.
**HTTP:** Hono. Wzorzec routingu w `src/index.ts`: `app.use('/api/<x>/*', requireAuth); app.route('/api/<x>', router)`.
**Auth middleware:** `src/routes/middleware/require-auth.ts` ustawia `c.get('user')` na zalogowanego usera (Better-Auth session). Brak sesji → middleware sam zwraca 401.

## Design decisions
- `listAll` pobiera wszystkie wiersze JEDNYM zapytaniem — kolekcje są małe (rzędy 10²–10³). Brak streamowania, brak paginacji.
- Sortowanie w `listAll` po `id ASC` — domena dalej i tak posortuje deterministycznie w `toSnapshot`. Sort SQL daje stabilność dla testów infrastruktury.
- `Content-Disposition: attachment` — żeby przeglądarka zaprezentowała dialog zapisu pliku, a nie wyświetliła JSON w taby. Filename `apex-export-YYYY-MM-DD.json` (data lokalna z `exportedAt.slice(0, 10)`).
- Brak query params — eksport zawsze pełny. Filtry dodamy w v2 jeśli realny use case się pojawi (YAGNI).
- Route handler **maks. ~20 linii**: pobierz `userId`, wywołaj `executeData.execute(userId)`, ustaw nagłówki, zwróć JSON. Logikę trzymamy w use case (faza 1).
- Singletony repo i use case w `routes/export.ts` — analogicznie do `routes/games.ts` (te same `DrizzleGameRepository`/`DrizzlePlatformRepository`).
- **Bezpieczeństwo:** `userId = c.get('user').id`. NIGDY z query/body. IDOR-prevention: use case ogranicza do `userId` z sesji.
- Brak `try/catch` w route — Hono globalnie loguje błędy. Jeśli use case rzuci → 500. To MVP-acceptable; dodanie `app.onError` to osobny temat (enterprise resilience).

## Step 0: Pobierz dokumentację (Context7)
**Co robimy:** użyj Context7 MCP:
- `drizzle-orm`: "select all rows by foreign key with order by"
- `hono`: "set response headers Content-Disposition Content-Type and return json"

(Jeśli MCP Context7 niedostępny — pobierz oficjalne docs z webu i zacytuj w komentarzu w PR. NIE pisz API z pamięci.)

**Rezultat:** masz świeże API Drizzle i Hono na czole.

## Relevant files (edit only these)
- `src/infrastructure/games/drizzle-game-repository.ts` — implementuj `listAll` (zastąp stub z fazy 1)
- `src/routes/export.ts` — NOWY plik: route handler
- `src/index.ts` — zarejestruj middleware `requireAuth` na `/api/export/*` i podepnij router

## Files to read but NOT edit
- `src/index.ts` — wzorzec rejestracji route + middleware (zobacz jak `games` i `platforms`)
- `src/routes/games.ts` — wzorzec route z DI repo + use case + auth user z context
- `src/routes/middleware/require-auth.ts` — typ `AuthVariables`, jak `c.get('user')` jest typowane
- `src/application/export/export-data.ts` — use case z fazy 1
- `src/application/export/export-snapshot.ts` — kształt `ExportSnapshot`
- `src/infrastructure/games/drizzle-game-repository.ts` — pozostałe metody (wzorzec mapowania row → Game)
- `src/infrastructure/db/schema.ts` — definicja `gamesTable`

## Constraints
- NIE dotykaj struktury `gamesTable` ani migracji — `listAll` to czysty SELECT.
- NIE rób `try/catch` żeby ukryć błędy. Niech rzucą.
- NIE dodawaj walidacji input (brak inputu — userId z sesji).
- NIE umieszczaj logiki biznesowej w route. Route TYLKO: parsuj kontekst → wywołaj use case → ustaw response.
- NIE wstawiaj `Date` do testów infra — tu nie ma testów; smoke test jest manualny przez curl.
- Filename w `Content-Disposition` MUSI być w cudzysłowach: `attachment; filename="apex-export-2026-04-29.json"` (RFC 6266).

## Steps

### Step 1: `DrizzleGameRepository.listAll`
**Co robimy:**
1. Otwórz `src/infrastructure/games/drizzle-game-repository.ts`. Znajdź stub `listAll` (jeśli jest z fazy 1) lub dodaj nową metodę.
2. Implementacja:
   ```ts
   async listAll(userId: string): Promise<Game[]> {
     const rows = await db
       .select()
       .from(gamesTable)
       .where(eq(gamesTable.userId, userId))
       .orderBy(asc(gamesTable.id));
     return rows.map((row) => this.mapRowToGame(row));
   }
   ```
   Importy `asc` i `eq` z `drizzle-orm` powinny już być w pliku — sprawdź i dodaj `asc` jeśli brakuje.
3. `bun run check` z `apps/api` → 0 błędów.
4. Jeżeli istnieją testy infra (nie wymóg — fakat sprawdź): `bun test apps/api/src/infrastructure` — powinny być GREEN. Brak — pomiń.
**Rezultat:** repo umie pobrać wszystkie gry usera.

### Step 2: Route `GET /api/export`
**Co robimy:**
1. Utwórz `src/routes/export.ts`:
   ```ts
   import { Hono } from 'hono';
   import { ExportData } from '../application/export/export-data';
   import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
   import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
   import type { AuthVariables } from './middleware/require-auth';

   const gameRepo = new DrizzleGameRepository();
   const platformRepo = new DrizzlePlatformRepository();
   const exportData = new ExportData(gameRepo, platformRepo);

   export const exportRoute = new Hono<{ Variables: AuthVariables }>();

   exportRoute.get('/', async (c) => {
     const userId = c.get('user').id;
     const snapshot = await exportData.execute(userId);
     const date = snapshot.exportedAt.slice(0, 10); // YYYY-MM-DD
     c.header('Content-Type', 'application/json; charset=utf-8');
     c.header('Content-Disposition', `attachment; filename="apex-export-${date}.json"`);
     return c.body(JSON.stringify(snapshot, null, 2));
   });
   ```
2. `bun run check` → 0 błędów.
**Rezultat:** route plik gotowy, ale jeszcze niezarejestrowany.

### Step 3: Rejestracja w `src/index.ts` + smoke test
**Co robimy:**
1. Otwórz `src/index.ts`. Po blokach `games` i `platforms` dodaj:
   ```ts
   import { exportRoute } from './routes/export';
   ...
   app.use('/api/export/*', requireAuth);
   app.route('/api/export', exportRoute);
   ```
   UWAGA na kolejność — middleware `use` musi być PRZED `route`.
2. Uruchom serwer: `bun run dev` (z `apps/api`).
3. Zaloguj się (przez UI lub curl do `/api/auth/...`) — uzyskaj cookie sesji do `cookies.txt`.
4. Smoke test:
   ```bash
   curl -i -b cookies.txt http://localhost:3001/api/export
   ```
   Oczekiwane:
   - `HTTP/1.1 200 OK`
   - `Content-Type: application/json; charset=utf-8`
   - `Content-Disposition: attachment; filename="apex-export-YYYY-MM-DD.json"`
   - Body: poprawny JSON z `version: 1`, `exportedAt`, `platforms[]`, `games[]` — TYLKO usera z sesji
5. Bez cookie:
   ```bash
   curl -i http://localhost:3001/api/export
   ```
   Oczekiwane: `401`.
6. `bun test` → wszystko zielone (testy z fazy 1 nie powinny regresować).
**Rezultat:** endpoint działa end-to-end na backendzie.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- 401 mimo zalogowania w UI → cookie nie jest wysyłane przez curl. Pamiętaj o `-b cookies.txt`. Albo testuj przez przeglądarkę: otwórz DevTools → Network → wpisz `http://localhost:3001/api/export` w nowej karcie.
- CORS przy testowaniu z frontendu lokalnie → frontend leci na `localhost:5173`, API na `localhost:3001`. CORS dla `/api/*` jest skonfigurowany w `src/index.ts` (`credentials: true`). Sprawdź czy `/api/export` łapie się pod ten wildcard (powinno).
- Filename z polskimi znakami → nie używaj. `apex-export-DATE.json` jest ASCII-safe.
- `c.body(JSON.stringify(...))` vs `c.json(...)` → `c.json` ustawia content-type sam i overwrite'uje twój. Użyj `c.body` + ręcznie ustawione headery.
