---
name: Phase 4 HTTP Routes
description: Wyciągnięcie userId z sesji Better-Auth i wstrzyknięcie do use case'ów + smoke test
type: plan
---

# Game User Ownership — Faza 4: HTTP Routes (auth context → use cases)

## Goal
W `routes/games.ts` wyciągnąć `userId` z `c.var.user.id` (ustawione przez
`requireAuth` middleware) i przekazać do każdego use case. Po fazie 4 zalogowany
user widzi i CRUD-uje wyłącznie SWOJE gry. Cudze gry zwracają 404.

## Definition of Done
- [ ] `bun run check` (z `apps/api`) → czyste
- [ ] `bun test apps/api` → wszystko zielone
- [ ] `routes/games.ts` używa `Hono<{ Variables: AuthVariables }>` (typowane c.var.user)
- [ ] Każdy handler (GET list, GET :id, POST, PUT :id, DELETE :id) odczytuje `c.var.user.id` i przekazuje do `.execute()`
- [ ] Smoke test (manual lub curl) przechodzi: user A widzi tylko swoje gry, user B widzi tylko swoje, próba `GET /api/games/<id-usera-A>` jako user B → 404

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, `bun run check`, `bun run dev`)
**Katalog roboczy:** `apps/api`
**Auth middleware:** `src/routes/middleware/require-auth.ts` ustawia `c.set('user', session.user)` i `c.set('session', session.session)`. Typ `AuthVariables` jest tam wyeksportowany.
**Index:** `src/index.ts` montuje `requireAuth` na `/api/games/*` PRZED `app.route('/api/games', games)` — czyli każdy handler dostaje `c.var.user`.
**Frontend:** wszystkie żądania do `/api/games` idą z `credentials: 'include'`. Cookies z Better-Auth są tam OK; nie trzeba zmian po stronie klienta.

## Design decisions
- `routes/games.ts` musi typować `Hono<{ Variables: AuthVariables }>` żeby `c.var.user` był typowany (nie `unknown`). Bez tego TypeScript nie zna `c.var.user.id`.
- Wartość `c.var.user` w runtime jest gwarantowana przez middleware (zwraca 401 zanim handler odpali). Nie potrzebujemy dodatkowych assertion-ów w handlerach.
- Frontend nie wymaga zmian: backend filtruje listę i zwraca 404 dla cudzych zasobów. Brak ujawniania, że gra istnieje. Jedyne, co user zobaczy, to "not found" przy próbie wbicia w URL z cudzym id.
- NIE ruszamy `seedGamesIfEmpty` (z fazy 2 powinien być już wyłączony). Każdy nowy user zaczyna z pustą listą.

## Relevant files (edit only these)
- `src/routes/games.ts`

## Files to read but NOT edit
- `src/routes/middleware/require-auth.ts` — definicja `AuthVariables`
- `src/index.ts` — sprawdzenie, że middleware jest zamontowany przed routes
- `src/application/games/*.ts` — sygnatury z fazy 3

## Steps

### Step 1: Otypuj Hono routes z AuthVariables
**Co robimy:**
1. W `src/routes/games.ts`:
   - Dodaj import: `import { type AuthVariables } from './middleware/require-auth';` (uwaga na ścieżkę względną — middleware jest w `./middleware/require-auth`, więc to działa)
   - Zmień `export const games = new Hono();` na `export const games = new Hono<{ Variables: AuthVariables }>();`
2. `bun run check` → kompiluje się.
**Rezultat:** w handlerach `c.var.user` jest typowane jako `User`.

### Step 2: Wstrzyknij userId do `ListGames`
**Co robimy:**
1. W handlerze `games.get('/', async (c) => {...})`:
   - Dodaj `const userId = c.var.user.id;` na górze handlera
   - Drugi argument do `listGames.execute({ ... }, userId)`
**Rezultat:** lista filtruje per user.

### Step 3: Wstrzyknij userId do `GetGame`
**Co robimy:**
1. W handlerze `games.get('/:id', ...)`:
   - `const userId = c.var.user.id;`
   - `const result = await getGame.execute(id, userId);`
**Rezultat:** GET /:id zwraca 404 dla cudzej gry.

### Step 4: Wstrzyknij userId do `CreateGame`
**Co robimy:**
1. W handlerze `games.post('/', ...)`:
   - `const userId = c.var.user.id;`
   - `const result = await createGame.execute(body, userId);`
**Rezultat:** stworzona gra ma `userId = sessionUser.id`.

### Step 5: Wstrzyknij userId do `UpdateGame`
**Co robimy:**
1. W handlerze `games.put('/:id', ...)`:
   - `const userId = c.var.user.id;`
   - `const result = await updateGame.execute(id, body, userId);`
**Rezultat:** PUT cudzej gry zwraca 404.

### Step 6: Wstrzyknij userId do `DeleteGame`
**Co robimy:**
1. W handlerze `games.delete('/:id', ...)`:
   - `const userId = c.var.user.id;`
   - `const result = await deleteGame.execute(id, userId);`
**Rezultat:** DELETE cudzej gry zwraca 404.

### Step 7: Typecheck + testy
**Co robimy:**
1. `bun run check` z `apps/api` → 0 błędów
2. `bun test apps/api` → 100% zielone
**Rezultat:** kod kompiluje się i testy przechodzą.

### Step 8: Smoke test (E2E manual)
**Co robimy:**
1. Z poziomu `apps/api`: `bun run dev`
2. W drugim terminalu odpal `apps/client` jeśli chcesz UI; albo curl-em:
3. **Scenariusz weryfikacji:**
   - Zarejestruj/zaloguj jako user A (UI → /register → /login)
   - Dodaj 2 gry przez UI (`/games/new`)
   - Wyloguj się
   - Zarejestruj user B
   - Wejdź na `/games` → lista PUSTA (user B nie widzi gier user A) ✓
   - Dodaj 1 grę jako user B
   - Wejdź na `/games` → widzisz tylko 1 grę ✓
   - W URL bezpośrednio wejdź na `/games/<id-z-user-A>` → "not found" / 404 ✓
4. Curl alternatywa (zakładając że masz `cookies-A.txt` i `cookies-B.txt` po logowaniu):
   ```bash
   # User A — login zapisze cookie
   curl -i -c cookies-A.txt -X POST http://localhost:3001/api/auth/sign-in/email \
     -H 'Content-Type: application/json' \
     -d '{"email":"a@a.com","password":"abcdef12"}'

   # User A widzi swoje gry
   curl -b cookies-A.txt http://localhost:3001/api/games

   # User B nie widzi gier user A
   curl -b cookies-B.txt http://localhost:3001/api/games

   # User B nie może zobaczyć szczegółu gry user A — oczekiwany 404
   curl -i -b cookies-B.txt http://localhost:3001/api/games/1
   ```
**Rezultat:** ownership działa end-to-end.

## If you get stuck
- Jeżeli `c.var.user` jest typu `unknown` lub TS marudzi — zapomniałeś przekazać `Variables: AuthVariables` w generic do `new Hono(...)` (Step 1).
- Jeżeli wszystkie GET-y zwracają 401 — sprawdź czy w `index.ts` masz `app.use('/api/games/*', requireAuth);` PRZED `app.route('/api/games', games);`. Powinno tak być po fazie auth, sprawdź na wszelki wypadek.
- Jeżeli user B widzi gry user A — najpewniej PHASE_2 (filtr w repo) lub PHASE_3 (przekazanie userId do query) nie zadziałało. Wróć i sprawdź.
- Po 2 próbach jak coś nie działa: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`

## Po fazie 4
Cała ścieżka domain → infra → application → HTTP wymusza ownership. Gry są
prywatne per user. Frontend nie wymaga zmian. Można przygotować PR.
