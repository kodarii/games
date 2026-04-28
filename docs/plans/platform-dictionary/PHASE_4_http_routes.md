---
name: Phase 4 HTTP Routes
description: routes/platforms.ts (GET/POST/DELETE) + mount za requireAuth + smoke test
type: plan
---

# Platform Dictionary — Faza 4: HTTP Routes

## Goal
Eksponować słownik platform jako REST API:
- `GET /api/platforms` — lista platform zalogowanego usera
- `POST /api/platforms` — `{ name: string }` → 201 z platformą lub 409 (name_taken) / 400 (validation)
- `DELETE /api/platforms/:id` — 200 z usuniętą lub 404 (not_found / cudza) / 409 (in_use)

Mount za `requireAuth` w `src/index.ts`. Również: dopiąć `PlatformRepository`
do `CreateGame` / `UpdateGame` w `src/routes/games.ts` (te use case'y po fazie 3
mają drugi argument konstruktora — trzeba go dostarczyć tutaj).

## Definition of Done
- [ ] `bun run check` z `apps/api` → 0 błędów
- [ ] `bun test apps/api` → wszystkie testy zielone
- [ ] Plik `src/routes/platforms.ts` istnieje i jest zamontowany w `index.ts` przez `app.route('/api/platforms', platforms)`
- [ ] `app.use('/api/platforms/*', requireAuth)` PRZED `app.route(...)` w `index.ts`
- [ ] `routes/platforms.ts` używa `Hono<{ Variables: AuthVariables }>` (typowane `c.var.user`)
- [ ] W `routes/games.ts` `createGame` i `updateGame` dostają `new DrizzlePlatformRepository()` jako drugi argument
- [ ] Smoke test (curl): user A POST 'Wii U' → 201; user A POST 'Wii U' → 409; user A GET → lista zawiera 'Wii U'; user A POST `/api/games` z `platform: 'Wii U'` → 201; DELETE platformy 'Wii U' → 409 (in_use)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, `bun run check`, `bun run dev`)
**Katalog roboczy:** `apps/api`
**Auth:** `src/routes/middleware/require-auth.ts` ustawia `c.var.user` (typ `AuthVariables`).
**Mount pattern:** w `src/index.ts` games są montowane przez `app.use('/api/games/*', requireAuth); app.route('/api/games', games)`. Replikuj.

## Design decisions
- Status codes:
  - `POST /api/platforms`: 201 ok, 400 invalid_input/domain, 409 name_taken
  - `DELETE /api/platforms/:id`: 200 ok, 404 not_found (też dla cudzej — nie ujawniamy istnienia), 409 in_use
  - `GET /api/platforms`: 200 z arrayem `Platform[]` (po `.toJSON()`)
- `routes/platforms.ts` typowane `Hono<{ Variables: AuthVariables }>` (jak `games.ts`).
- Instancje use case'ów tworzone na poziomie modułu (jak w `routes/games.ts`).
- `Platform.toJSON()` istnieje od fazy 1 → handler odpowiada `c.json(platform.toJSON())` lub po prostu `c.json(platform)` (Hono JSON.stringify wywoła `toJSON`).
- Frontend zmiany — NIE w tej fazie. Frontend w fazie 5.

## Relevant files (edit only these)
- `src/routes/platforms.ts` — nowy plik z handlerami
- `src/index.ts` — mount za requireAuth
- `src/routes/games.ts` — wstrzyknięcie `DrizzlePlatformRepository` do `CreateGame` i `UpdateGame`

## Files to read but NOT edit
- `src/routes/games.ts` — wzorzec handlerów (struktura, mapowanie błędów na status codes)
- `src/routes/middleware/require-auth.ts` — typ `AuthVariables`
- `src/index.ts` — gdzie mount auth + games
- `src/application/platforms/*.ts` — sygnatury use case'ów z fazy 3
- `src/infrastructure/platforms/drizzle-platform-repository.ts` — z fazy 2

## Steps

### Step 0: Pobierz dokumentację Hono (Context7)
**Co robimy:** użyj Context7:
- `hono`: "route handler json body status code"
- `hono`: "Variables generic type for context user"
**Rezultat:** wiesz dokładnie jak `c.var.user` i `c.json(value, statusCode)` działają w aktualnej wersji Hono.

### Step 1: `routes/platforms.ts`
**Co robimy:**
1. Utwórz `src/routes/platforms.ts`:
   ```ts
   import { Hono } from 'hono';
   import { CreatePlatform } from '../application/platforms/create-platform';
   import { DeletePlatform } from '../application/platforms/delete-platform';
   import { ListPlatforms } from '../application/platforms/list-platforms';
   import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
   import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
   import type { AuthVariables } from './middleware/require-auth';

   const platformRepo = new DrizzlePlatformRepository();
   const gameRepo = new DrizzleGameRepository();
   const createPlatform = new CreatePlatform(platformRepo);
   const listPlatforms = new ListPlatforms(platformRepo);
   const deletePlatform = new DeletePlatform(platformRepo, gameRepo);

   export const platforms = new Hono<{ Variables: AuthVariables }>();

   platforms.get('/', async (c) => {
     const userId = c.get('user').id;
     const list = await listPlatforms.execute(userId);
     return c.json(list);
   });

   platforms.post('/', async (c) => {
     const userId = c.get('user').id;
     const body = await c.req.json();
     const result = await createPlatform.execute(body, userId);
     if (!result.ok) {
       const e = result.error;
       if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
       if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
       if (e.kind === 'name_taken') return c.json({ error: 'name_taken' }, 409);
       return c.json({ error: 'unknown error' }, 500);
     }
     return c.json(result.value, 201);
   });

   platforms.delete('/:id', async (c) => {
     const id = Number(c.req.param('id'));
     if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);
     const userId = c.get('user').id;
     const result = await deletePlatform.execute(id, userId);
     if (!result.ok) {
       const e = result.error;
       if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
       if (e.kind === 'in_use') return c.json({ error: 'in_use' }, 409);
       return c.json({ error: 'unknown error' }, 500);
     }
     return c.json(result.value);
   });
   ```
2. `bun run check` z `apps/api` → 0 błędów.
**Rezultat:** routes platforms istnieją, kompilują się.

### Step 2: Mount w `index.ts`
**Co robimy:**
1. W `src/index.ts`:
   - Import: `import { platforms } from './routes/platforms';`
   - Po linii `app.use('/api/games/*', requireAuth);` dodaj `app.use('/api/platforms/*', requireAuth);`
   - Po linii `app.route('/api/games', games);` dodaj `app.route('/api/platforms', platforms);`
2. `bun run check` → 0 błędów.
**Rezultat:** routes podłączone do appki za auth.

### Step 3: Wstrzyknij `PlatformRepository` do gier
**Co robimy:**
1. W `src/routes/games.ts`:
   - Import: `import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';`
   - Dodaj `const platformRepo = new DrizzlePlatformRepository();`
   - Zmień:
     ```ts
     const createGame = new CreateGame(repo);
     const updateGame = new UpdateGame(repo);
     ```
     na:
     ```ts
     const createGame = new CreateGame(repo, platformRepo);
     const updateGame = new UpdateGame(repo, platformRepo);
     ```
2. `bun run check` → 0 błędów. `bun test apps/api` → wszystko zielone.
**Rezultat:** game routes używają walidacji przez słownik.

### Step 4: Smoke test (E2E manual przez curl)
**Co robimy:**
1. Uruchom `bun run dev` z `apps/api`.
2. Zaloguj się jako user A (UI lub curl) i zapisz cookie:
   ```bash
   curl -i -c /tmp/cookies-A.txt -X POST http://localhost:3001/api/auth/sign-in/email \
     -H 'Content-Type: application/json' \
     -d '{"email":"a@a.com","password":"abcdef12"}'
   ```
3. **Lista pusta:**
   ```bash
   curl -b /tmp/cookies-A.txt http://localhost:3001/api/platforms
   ```
   Oczekiwane: `[]`.
4. **Dodaj 'Wii U':**
   ```bash
   curl -i -b /tmp/cookies-A.txt -X POST http://localhost:3001/api/platforms \
     -H 'Content-Type: application/json' -d '{"name":"Wii U"}'
   ```
   Oczekiwane: 201, body `{ id, userId, name: "Wii U" }`.
5. **Duplikat:**
   ```bash
   curl -i -b /tmp/cookies-A.txt -X POST http://localhost:3001/api/platforms \
     -H 'Content-Type: application/json' -d '{"name":"Wii U"}'
   ```
   Oczekiwane: 409, `{"error":"name_taken"}`.
6. **Dodaj grę z 'Wii U':**
   ```bash
   curl -i -b /tmp/cookies-A.txt -X POST http://localhost:3001/api/games \
     -H 'Content-Type: application/json' \
     -d '{"title":"Mario Kart 8","developer":"Nintendo","releaseYear":2014,"platform":"Wii U","format":"physical"}'
   ```
   Oczekiwane: 201.
7. **Próba usunięcia używanej platformy:**
   ```bash
   curl -i -b /tmp/cookies-A.txt -X DELETE http://localhost:3001/api/platforms/<id-wii-u>
   ```
   Oczekiwane: 409, `{"error":"in_use"}`.
8. **Dodanie gry z nieistniejącą platformą:**
   ```bash
   curl -i -b /tmp/cookies-A.txt -X POST http://localhost:3001/api/games \
     -H 'Content-Type: application/json' \
     -d '{"title":"X","developer":"Y","releaseYear":2020,"platform":"Foobar","format":"digital"}'
   ```
   Oczekiwane: 400, `{"error":"validation","domain":{"kind":"platform_invalid","value":"Foobar"}}`.
9. **Cudza platforma → 404 (loguj jako user B, próbuj usunąć id user A):**
   ```bash
   curl -i -b /tmp/cookies-B.txt -X DELETE http://localhost:3001/api/platforms/<id-user-A>
   ```
   Oczekiwane: 404.
**Rezultat:** API działa end-to-end.

## If you get stuck
- Jeżeli `c.var.user` jest typu `unknown` — zapomniałeś przekazać `Variables: AuthVariables` w generic do `new Hono(...)` (Step 1).
- Jeżeli wszystkie endpointy zwracają 401 — sprawdź kolejność w `index.ts`: `app.use('/api/platforms/*', requireAuth)` MUSI być PRZED `app.route('/api/platforms', platforms)`.
- Jeżeli POST gry z `platform: 'Wii U'` zwraca 400 mimo że dodałeś platformę — sprawdź czy `routes/games.ts` rzeczywiście używa zaktualizowanej `CreateGame` z `platformRepo` (Step 3) i czy serwer został zrestartowany.
- Po 2 próbach: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
