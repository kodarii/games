# Auth (rejestracja + logowanie) — Faza 2: Backend integracja (handler + middleware)

## Goal
Wmontuj handler better-auth do Hono pod `/api/auth/**`, napisz middleware `requireAuth` używające `auth.api.getSession({ headers })`, ochroń `/api/games/*` tym middlewarem, skonfiguruj CORS z `credentials: true` dla origin frontu (Vite 5173). Po tej fazie endpointy better-auth są dostępne (signup/signin/signout/get-session/...) i `/api/games/*` zwraca 401 bez ważnej sesji.

## Definition of Done
- [ ] `bun test` — istniejące testy `games` zielone (nic nie zepsute)
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] `POST /api/auth/sign-up/email` z `{ email, password, name }` → 200 z `{ user, token }` + Set-Cookie sesyjne
- [ ] `POST /api/auth/sign-in/email` z `{ email, password }` → 200 z `{ user, token }` + Set-Cookie
- [ ] `POST /api/auth/sign-out` z cookie → 200 + cookie wyczyszczone
- [ ] `GET /api/auth/get-session` z cookie → 200 `{ user, session }`; bez cookie → 200 `null` (better-auth zwraca null, nie 401)
- [ ] `GET /api/games` BEZ cookie → 401 `{ error: 'unauthorized' }`; z ważnym cookie → 200
- [ ] `POST /api/games` BEZ cookie → 401; z ważnym cookie → 201
- [ ] Cookie ma `HttpOnly`, `SameSite=Lax`, `Path=/`, w produkcji `Secure` (potwierdza to better-auth defaultowo, nie konfigurujemy ręcznie)
- [ ] Smoke test ręczny w `curl` (lista poniżej w Step 4) przechodzi end-to-end

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run --filter '*' typecheck`, `bun run --cwd apps/api dev`, `bun run lint`)
**Architektura:** Hono routing + better-auth handler. ZERO custom use-case'ów `RegisterUser`/`LoginUser`/`LogoutUser` — to wszystko zapewnia better-auth pod `/api/auth/**`.
**Wzorzec referencyjny:** `apps/api/src/routes/games.ts` (handlery Hono, mapowanie błędów, response shape). Ten styl zostaje dla `/api/games`. NIE tworzymy `apps/api/src/routes/auth.ts` — better-auth handler eksponujemy bezpośrednio.

## Design decisions
- **Handler better-auth pod `/api/auth/**`** (uwaga: `**`, nie `*`, bo better-auth używa wielo-segmentowych ścieżek typu `/api/auth/sign-in/email`). Route Hono: `app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw))`.
- **`requireAuth` middleware** — czyta sesję przez `auth.api.getSession({ headers: c.req.raw.headers })`. Jeśli `null` → 401. Jeśli ok → `c.set('user', session.user)` + `c.set('session', session.session)`. Routes pobierają przez `c.get('user')`.
- **Hono ContextVariableMap typowanie** — używamy `Hono<{ Variables: { user: ...; session: ... } }>`. Albo lokalnie w app, albo przez `declare module 'hono' { interface ContextVariableMap { ... } }` w pliku middleware. Wybierz opcję lokalnego typowania `Hono<{ Variables: ... }>` — jest czystsza i nie wycieka globalnie.
- **`/api/games/*` chronione** przez `app.use('/api/games/*', requireAuth)`, ZAREJESTROWANE PRZED `app.route('/api/games', games)`. better-auth handler MUSI być zaroutowany PRZED tym middlewarem (żeby `/api/auth/**` nie został przechwycony — chociaż w praktyce nie matchuje pattern `/api/games/*`, ale lepsza kolejność dla czytelności).
- **CORS** — better-auth wymaga `credentials: true` żeby cookie szło cross-origin (Vite na 5173, API na 3001). Zmieniamy `app.use('/api/*', cors())` na:
  ```ts
  app.use('/api/*', cors({
    origin: 'http://localhost:5173',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }));
  ```
- **Origin-check (CSRF) better-auth** — biblioteka samodzielnie waliduje, że origin requestu jest na liście `trustedOrigins` (skonfigurowane w `auth.ts` w fazie 1). Bez tego POST z 5173 do 3001 dostanie 403. Jeśli tak się dzieje: wróć do fazy 1 i sprawdź `trustedOrigins`.
- **Brak własnego cookie helpera** — better-auth ustawia cookie samodzielnie w response handlera. NIE używamy `setCookie`/`deleteCookie` z `hono/cookie`. Cookie name jest skonfigurowane przez bibliotekę (defaultowo `better-auth.session_token`).
- **Error model na `/api/games/*`**: 401 zwracamy z naszego middleware'a (`{ error: 'unauthorized' }`). Inne błędy zostawiamy jak są (route'y games już je obsługują). better-auth handler sam mapuje swoje błędy (`USER_ALREADY_EXISTS`, `INVALID_EMAIL_OR_PASSWORD`, etc.) na własne JSON response — NIE tłumaczymy ich w naszej warstwie.

### Step 0: Pobierz dokumentację
Użyj Context7 PRZED kodowaniem:
1. `better-auth` — pytanie: "Hono integration: app.on(['POST','GET'], '/api/auth/**', auth.handler), middleware reading auth.api.getSession({ headers: c.req.raw.headers }), Hono Variables for user/session, cors with credentials"
2. `hono` — pytanie: "app.on with multiple methods and ** wildcard path, Hono<{ Variables }> generic for context state, cors middleware with credentials true, app.use middleware on path pattern, order of route vs middleware"

NIE pisz kodu zanim nie pobierzesz docs Context7. better-auth API integration changes between versions, a Hono middleware ordering jest delikatne.

### Relevant files (edit only these)
- `apps/api/src/routes/middleware/require-auth.ts` — **NEW** — middleware Hono używający `auth.api.getSession`
- `apps/api/src/index.ts` — zmiana CORS, wmontowanie handlera better-auth, podpięcie middleware'a, typowanie `Hono<{ Variables }>`

### Files to read but NOT edit
- `apps/api/src/infrastructure/auth/auth.ts` — instancja `auth` (faza 1)
- `apps/api/src/infrastructure/db/auth-schema.ts` — schemat tabel (faza 1)
- `apps/api/src/routes/games.ts` — handlery games, NIE ruszamy logiki, tylko nakładamy middleware
- `apps/api/src/index.ts` (przed edycją) — obecny setup Hono z `cors()` i `app.route('/api/games', games)`

## Constraints
- NIE pisz `apps/api/src/routes/auth.ts` z własnymi handlerami login/register/logout — to anti-goal. Endpointy `/api/auth/*` zapewnia better-auth handler, my tylko mountujemy.
- NIE pisz własnych use-case'ów w `apps/api/src/application/auth/*` — fazy nie zostawiają przestrzeni na taki kod. Jeśli stamtąd zostały pliki z wcześniejszych iteracji: usuń (sanity check fazy 1 step 5 powinien był to złapać).
- NIE używaj `hono/cookie` `setCookie`/`getCookie` w naszym kodzie — better-auth zarządza cookie samodzielnie. Czytanie sesji TYLKO przez `auth.api.getSession({ headers })`.
- Kolejność w `apps/api/src/index.ts`: CORS → logger → handler better-auth (`/api/auth/**`) → `requireAuth` middleware (`/api/games/*`) → `app.route('/api/games', games)`. Dokładnie tak. Nie zamieniaj.
- Middleware musi być `async` i wywoływać `await next()` po `c.set(...)`. Jeśli zapomnisz `await next()` — 401 + zawieszony request.
- Route handler max ~30 linii — to się nie zmienia. games handlery są już w tym budżecie.
- TS: `Hono<{ Variables: { user: typeof auth.$Infer.Session.user; session: typeof auth.$Infer.Session.session } }>` — używaj `auth.$Infer.Session`, NIE pisz typów ręcznie. Better-auth eksportuje pomocniczy generic.
- Test z fazy 1 (typecheck/lint/migracje) MUSI dalej przechodzić. Jeśli `db:migrate` failuje po edycji `client.ts` (jeżeli musiałeś dodać schema do drizzle clienta) — sprawdź czy nie nadpisałeś istniejącej konfiguracji.

## Steps

### Step 1: Middleware `requireAuth`
**Pliki:** `apps/api/src/routes/middleware/require-auth.ts`

**Co robimy:**
1. Stwórz katalog jeśli nie istnieje: `mkdir -p apps/api/src/routes/middleware`.
2. Stwórz `require-auth.ts`:
   ```ts
   import type { MiddlewareHandler } from 'hono';
   import { auth } from '../../infrastructure/auth/auth';

   export type AuthVariables = {
     user: typeof auth.$Infer.Session.user;
     session: typeof auth.$Infer.Session.session;
   };

   export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
     const session = await auth.api.getSession({ headers: c.req.raw.headers });
     if (!session) {
       return c.json({ error: 'unauthorized' }, 401);
     }
     c.set('user', session.user);
     c.set('session', session.session);
     await next();
   };
   ```
3. `bun run --filter '*' typecheck` — czyste. Middleware jeszcze nigdzie nie podpięty.

**Rezultat:** Middleware gotowe, typowanie kontekstu zdefiniowane, jeden punkt prawdy o stanie auth.

### Step 2: Wmontowanie handlera better-auth + middleware w `index.ts`
**Pliki:** `apps/api/src/index.ts`

**Co robimy:**
1. Edytuj `apps/api/src/index.ts`:
   ```ts
   import { Hono } from 'hono';
   import { cors } from 'hono/cors';
   import { logger } from 'hono/logger';
   import { auth } from './infrastructure/auth/auth';
   import { seedGamesIfEmpty } from './infrastructure/db/seed';
   import { games } from './routes/games';
   import { requireAuth, type AuthVariables } from './routes/middleware/require-auth';

   const app = new Hono<{ Variables: AuthVariables }>();

   app.use('*', logger());

   app.use(
     '/api/*',
     cors({
       origin: 'http://localhost:5173',
       credentials: true,
       allowHeaders: ['Content-Type', 'Authorization'],
       allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
       exposeHeaders: ['Content-Length'],
       maxAge: 600,
     }),
   );

   app.get('/', (c) => c.json({ name: 'apex-api', status: 'ok' }));
   app.get('/api/health', (c) => c.json({ status: 'ok' }));

   app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw));

   app.use('/api/games/*', requireAuth);
   app.route('/api/games', games);

   await seedGamesIfEmpty();

   const port = Number(process.env.PORT ?? 3001);

   export default {
     port,
     fetch: app.fetch,
   };

   console.log(`apex-api listening on http://localhost:${port}`);
   ```
2. **Krytyczne punkty kolejności:**
   - `cors` PRZED handlerem better-auth (preflight OPTIONS musi przejść przez cors).
   - `app.on(... '/api/auth/**' ...)` PRZED `app.use('/api/games/*', requireAuth)` — żeby auth route'y nie wpadły w żadne nasze middleware, ale w praktyce `/api/auth/**` nie matchuje `/api/games/*`, więc to defensive ordering.
   - `app.use('/api/games/*', requireAuth)` PRZED `app.route('/api/games', games)` — Hono stosuje middleware tylko jeśli zarejestrowany przed route'em z tym samym matcherem.
3. `bun run --filter '*' typecheck` — czyste.
4. `bun run lint` — czyste.
5. `bun run --cwd apps/api dev` — serwer startuje, w logach `apex-api listening on http://localhost:3001`. Jeśli błąd `BETTER_AUTH_SECRET is required` → faza 1 step 1 (`.env`).

**Rezultat:** Backend kompletny. Endpointy auth dostępne, games chronione.

### Step 3: Smoke test ręczny (curl)
**Co robimy:**
W jednym terminalu zostaw `bun run --cwd apps/api dev`. W drugim:

1. **Próba bez sesji — 401:**
   ```bash
   curl -i http://localhost:3001/api/games
   # → HTTP/1.1 401 Unauthorized
   # → {"error":"unauthorized"}
   ```

2. **Sign-up:**
   ```bash
   curl -i -X POST http://localhost:3001/api/auth/sign-up/email \
     -H 'Content-Type: application/json' \
     -H 'Origin: http://localhost:5173' \
     -d '{"email":"smoke@test.com","password":"password123","name":"Smoke Test"}' \
     -c /tmp/apex.cookies
   # → 200 z { user, token }, Set-Cookie: better-auth.session_token=...
   ```
   (Header `Origin: http://localhost:5173` musi pasować do `trustedOrigins` z `auth.ts` — bez niego dostaniesz 403 origin mismatch.)

3. **Get-session:**
   ```bash
   curl -i http://localhost:3001/api/auth/get-session \
     -H 'Origin: http://localhost:5173' \
     -b /tmp/apex.cookies
   # → 200 { "user": {...}, "session": {...} }
   ```

4. **Games z cookie — 200:**
   ```bash
   curl -i http://localhost:3001/api/games \
     -H 'Origin: http://localhost:5173' \
     -b /tmp/apex.cookies
   # → 200, lista gier (zaseed'owana)
   ```

5. **Sign-out:**
   ```bash
   curl -i -X POST http://localhost:3001/api/auth/sign-out \
     -H 'Origin: http://localhost:5173' \
     -b /tmp/apex.cookies -c /tmp/apex.cookies
   # → 200, Set-Cookie: better-auth.session_token=; Max-Age=0
   ```

6. **Po wylogowaniu — 401:**
   ```bash
   curl -i http://localhost:3001/api/games \
     -H 'Origin: http://localhost:5173' \
     -b /tmp/apex.cookies
   # → 401 unauthorized
   ```

7. **Sign-in z istniejącym kontem:**
   ```bash
   curl -i -X POST http://localhost:3001/api/auth/sign-in/email \
     -H 'Content-Type: application/json' \
     -H 'Origin: http://localhost:5173' \
     -d '{"email":"smoke@test.com","password":"password123"}' \
     -c /tmp/apex.cookies
   # → 200, ponownie cookie
   ```

8. **Bad credentials:**
   ```bash
   curl -i -X POST http://localhost:3001/api/auth/sign-in/email \
     -H 'Content-Type: application/json' \
     -H 'Origin: http://localhost:5173' \
     -d '{"email":"smoke@test.com","password":"wrong"}'
   # → 401 / 400 z error.code = INVALID_EMAIL_OR_PASSWORD
   ```

**Rezultat:** Pełny happy-path + edge cases zweryfikowane manualnie. Faza 2 zamknięta.

### Step 4: Final sanity check
**Co robimy:**
1. `bun test` — istniejące testy `games` zielone.
2. `bun run --filter '*' typecheck` — czyste.
3. `bun run lint` — czyste.
4. `grep -RE "from '\\./auth/(register-user|login-user|logout-user|get-current-user)'" apps/api/src` — ZERO wyników (nie zostało nic z poprzedniego planu).
5. `ls apps/api/src/application 2>/dev/null` — tylko `games/` (bez `auth/`).
6. `ls apps/api/src/domain 2>/dev/null` — tylko `games/`, `shared/` (bez `auth/`).

**Rezultat:** Backend gotowy do integracji z frontem (faza 3). API spec poniżej.

**API spec po fazie 2:**
```
POST /api/auth/sign-up/email     body: { email, password, name }   → 200 { user, token } + Set-Cookie
POST /api/auth/sign-in/email     body: { email, password }         → 200 { user, token } + Set-Cookie
POST /api/auth/sign-out          cookie required                    → 200 + cookie cleared
GET  /api/auth/get-session       cookie optional                    → 200 { user, session } | null
... (full list endpointów better-auth: change-password, update-user, list-sessions, ... — niewykorzystywane w fazie 3)

GET  /api/games                  cookie required                    → 200 | 401
POST /api/games                  cookie required                    → 201 | 401
... (wszystkie /api/games/* za requireAuth)
```

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- 403 z `/api/auth/sign-up/email` mimo poprawnego body — `Origin` header nie matchuje `trustedOrigins` w `auth.ts`. W curl dodaj `-H 'Origin: http://localhost:5173'`. Z przeglądarki request automatycznie ma Origin, więc to problem tylko w curl smoke teście.
- 404 z `/api/auth/sign-up/email` — handler zarejestrowany jako `'/api/auth/*'` zamiast `'/api/auth/**'`. Better-auth używa multi-segment paths, single `*` matchuje tylko jeden segment. ZAWSZE używaj `**`.
- TS narzeka na `c.set('user', ...)` — `Hono` instance nie ma typowania Variables. Zmień `new Hono()` na `new Hono<{ Variables: AuthVariables }>()` w `index.ts`.
- `auth.$Infer.Session` undefined — wersja better-auth starsza niż wprowadzenie helpera. Sprawdź wersję w `package.json`. Workaround: ręcznie `type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>` i wyciągnij `user`/`session` z tego.
- 401 z `/api/games` mimo poprawnego cookie — middleware `requireAuth` zarejestrowany PO `app.route('/api/games', games)`. Hono evaluuje route'y w kolejności rejestracji. Przesuń `app.use('/api/games/*', requireAuth)` PRZED `app.route(...)`.
- CORS preflight OPTIONS dostaje 405 — `cors` middleware zarejestrowany PO route'ach albo nie pokrywa metody OPTIONS. Sprawdź że `cors({...})` jest na `/api/*` i `allowMethods` zawiera `'OPTIONS'`.
- W przeglądarce cookie nie zapisuje się po sign-up — sprawdź: backend `cors({ credentials: true })`, frontend `fetch(..., { credentials: 'include' })` (faza 3), `SameSite=Lax` (defaultowe better-auth). Bez tego trio cookie nie wsiądzie. Otwórz DevTools → Network → response z `/api/auth/sign-up/email` → header Set-Cookie powinien być widoczny.
- `auth.api.getSession({ headers: c.req.raw.headers })` zwraca null mimo cookie — sprawdź czy `headers` to faktycznie `Headers` instance (nie zwykły object). `c.req.raw.headers` to native `Request.headers` — to powinno działać. Jeśli nie: `console.log(c.req.raw.headers.get('cookie'))` — czy widzisz cookie?
- `db:migrate` zwrócił error przy próbie startu serwera — auto-migrate w `client.ts` próbuje zaaplikować migrację z fazy 1, która już jest w DB (jeśli uruchomiłeś `db:migrate` ręcznie wcześniej). To jest OK — `migrate()` jest idempotentne, `__drizzle_migrations` table śledzi co już aplikowane. Jeśli error inny: usuń `apps/api/data/apex.db` i pozwól auto-migrate odbudować od zera (TYLKO w dev, NIGDY nie usuwaj prod DB).
