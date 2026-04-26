# Auth (rejestracja + logowanie) — Faza 2: Backend Infra + API

## Goal
Zbuduj infrastrukturę i endpointy auth: schemat DB (`users`, `sessions`), Drizzle adaptery repozytoriów, BunPasswordHasher (Bun.password / argon2id), use case'y `RegisterUser` / `LoginUser` / `LogoutUser` / `GetCurrentUser`, route'y `/api/auth/*` z cookie-based session, oraz middleware `requireAuth` chroniący `/api/games/*`.

## Definition of Done
- [ ] `bun test` — WSZYSTKIE testy zielone (domain z fazy 1, application z fazy 2, istniejące games)
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] `bun run --cwd apps/api db:generate` wyprodukowało migrację z tabelami `users` i `sessions`, a `db:migrate` ją zaaplikował (na lokalnej `apps/api/data/apex.db`)
- [ ] `POST /api/auth/register { email, password }` → 201 z `{ user, session }` + Set-Cookie `apex_session=...`
- [ ] `POST /api/auth/login { email, password }` → 200 z `{ user, session }` + Set-Cookie
- [ ] `POST /api/auth/logout` → 204 + cookie wyczyszczone (Max-Age=0)
- [ ] `GET /api/auth/me` z cookie → 200 `{ user }`; bez cookie albo z wygasłym → 401
- [ ] `GET /api/games` BEZ cookie → 401; z ważnym cookie → 200
- [ ] `User.toJSON()` w response NIE zawiera `passwordHash` (test integration to potwierdza)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run --filter '*' typecheck`, `bun run --cwd apps/api db:generate`, `bun run --cwd apps/api db:migrate`, `bun run lint`)
**ORM:** Drizzle (bun:sqlite). Schema w `apps/api/src/infrastructure/db/schema.ts`. Migracje generowane przez `bunx drizzle-kit generate` (skrypt `db:generate`), apply przez `db:migrate`. Pliki migracji w `apps/api/drizzle/`.
**Walidacja inputu:** Zod w use case'ach (`safeParse` → `err({ kind: 'invalid_input', issues: [...] })`).
**Hashing:** `Bun.password.hash(plain, { algorithm: 'argon2id' })` i `Bun.password.verify(plain, hash)` — wbudowane w Bun, ZERO dependencies. Nie instaluj bcrypt/argon2.
**Wzorzec referencyjny:** `apps/api/src/application/games/create-game.ts` (use case + Zod), `apps/api/src/infrastructure/games/drizzle-game-repository.ts` (adapter), `apps/api/src/routes/games.ts` (route handler), `apps/api/src/application/games/create-game.test.ts` (test use case z fake repo).

## Design decisions
- **Session token w HttpOnly cookie** `apex_session`. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age = 30 * 24 * 60 * 60` (30 dni). `Secure` jeśli `process.env.NODE_ENV === 'production'`. NIE w localStorage, NIE w body response (token w body tylko dla testów / debug — opcjonalne).
- **TTL sesji = 30 dni absolute** (stała `SESSION_TTL_MS` w `apps/api/src/application/auth/constants.ts`). Brak sliding window.
- **`requireAuth` middleware**: czyta cookie `apex_session`, wywołuje `GetCurrentUser.execute(token)`, jeśli `ok` → `c.set('user', user)`, jeśli `err` → `c.json({ error: 'unauthorized' }, 401)`. Routes pobierają `c.get('user')`.
- **`/api/games/*` chronione** przez `requireAuth`. Dodajemy w `apps/api/src/index.ts`: `app.use('/api/games/*', requireAuth)`. Auth route'y (`/api/auth/*`) ROUTOWANE PRZED tym middlewarem i NIE chronione (rejestracja/login muszą być publiczne).
- **Email uniqueness** egzekwujemy na poziomie DB (`unique` constraint na kolumnie `email`). Use case `RegisterUser` najpierw sprawdza `findByEmail` → jeśli exists → `err({ kind: 'email_taken' })`. Race condition (dwóch userów rejestrujących równocześnie) lokalnie nieistotny (SQLite single-writer), ale i tak łapiemy `unique constraint failed` z Drizzle i mapujemy na `email_taken`.
- **Min hasła = 8 znaków** (Zod `.min(8)`). Brak innych wymagań (no max, no special chars). Walidacja w Zod schema use case'a, NIE w domenie.
- **Response shape**: `{ user: { id, email, createdAt }, session: { token, expiresAt } }`. `user` to `User.toJSON()` (BEZ passwordHash). `session` to `Session.toJSON()` (token jest publiczny, klient i tak go ma w cookie — w body dla wygody klienta).
- **Logout** usuwa session z DB I czyści cookie. Idempotentne — brak cookie/zła wartość → 204.
- **Error model na route'ach** (ten sam wzorzec co `games.ts`):
  - `invalid_input` → 400 `{ error: 'validation', issues }`
  - `email_taken` → 409 `{ error: 'email_taken' }`
  - `invalid_credentials` → 401 `{ error: 'invalid_credentials' }`
  - `unauthorized` (brak/wygasły session) → 401 `{ error: 'unauthorized' }`
  - `domain` → 400 `{ error: 'validation', domain: e.error }`
  - inne → 500 `{ error: 'unknown error' }`
- **Stała `SESSION_COOKIE = 'apex_session'`** w jednym miejscu (`apps/api/src/application/auth/constants.ts`) — używana zarówno w route handlers jak i middleware.

### Step 0: Pobierz dokumentację
Użyj Context7 (resolve-library-id + query-docs) DOKŁADNIE TYCH:
1. `drizzle-orm` — pytanie: "sqlite-core: define table with UNIQUE constraint on text column, foreign key with ON DELETE CASCADE, indexes, integer timestamp mode"
2. `hono` — pytanie: "read cookie from request, set cookie with HttpOnly + SameSite + Max-Age, use middleware on path prefix, c.set/c.get for context state"
3. `zod` — pytanie: "object schema with email validation and min length, safeParse error issues format"

NIE pisz kodu zanim nie pobierzesz docs Context7 dla tych trzech bibliotek. Drizzle `unique`, Hono cookie API i Zod `.email()` mogły zmienić API między wersjami w `apps/api/package.json` (`drizzle-orm@^0.45`, `hono@^4.6`, `zod@^4.3`).

### Relevant files (edit only these)
- `apps/api/src/infrastructure/db/schema.ts` — dopisz tabele `users`, `sessions` (NIE ruszaj `games`)
- `apps/api/drizzle/<auto>.sql` — wygenerowana migracja (NIE pisać ręcznie, generuj przez `db:generate`)
- `apps/api/src/infrastructure/auth/drizzle-user-repository.ts` — **NEW**
- `apps/api/src/infrastructure/auth/drizzle-session-repository.ts` — **NEW**
- `apps/api/src/infrastructure/auth/bun-password-hasher.ts` — **NEW**
- `apps/api/src/application/auth/constants.ts` — **NEW** — `SESSION_COOKIE`, `SESSION_TTL_MS`
- `apps/api/src/application/auth/register-user.ts` — **NEW** — Zod + use case
- `apps/api/src/application/auth/login-user.ts` — **NEW**
- `apps/api/src/application/auth/logout-user.ts` — **NEW**
- `apps/api/src/application/auth/get-current-user.ts` — **NEW**
- `apps/api/src/application/auth/__tests__/register-user.test.ts` — **NEW** (fake repos + fake hasher)
- `apps/api/src/application/auth/__tests__/login-user.test.ts` — **NEW**
- `apps/api/src/application/auth/__tests__/get-current-user.test.ts` — **NEW**
- `apps/api/src/routes/auth.ts` — **NEW** — handlery + cookie helper
- `apps/api/src/routes/middleware/require-auth.ts` — **NEW**
- `apps/api/src/index.ts` — wmontuj `/api/auth` routes i middleware na `/api/games/*`

### Files to read but NOT edit
- `apps/api/src/domain/auth/*` — wszystko z fazy 1 (typy, agregaty, porty)
- `apps/api/src/domain/shared/result.ts`
- `apps/api/src/infrastructure/db/client.ts` — istniejący `db` Drizzle client
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — wzorzec adaptera
- `apps/api/src/application/games/create-game.ts` — wzorzec use case + Zod
- `apps/api/src/application/games/create-game.test.ts` — wzorzec testu use case z fake repo
- `apps/api/src/routes/games.ts` — wzorzec route handler (passthrough, mapowanie błędów)
- `apps/api/drizzle.config.ts` — config drizzle-kit

## Constraints
- TDD per use case: NAJPIERW test z fake repo + fake hasher (RED), POTEM impl (GREEN). 3 testy use case zgodnie z DoD.
- Route handler max ~30 linii — TYLKO: parsuj request → wywołaj use case → ustaw cookie → response. ZERO logiki domenowej w route.
- Repository adapter mapuje DB row ↔ domain aggregate przez `User.fromPersistence` / `Session.fromPersistence`. NIE zwraca rows na zewnątrz.
- Middleware `requireAuth` używa `GetCurrentUser` use case'a — NIE czyta DB bezpośrednio. To jeden punkt prawdy.
- NIE wystawiaj `passwordHash` w żadnym response. Adapter user repo zwraca `User` (domain), `User.toJSON()` go pomija — to gwarancja domeny.
- Cookie ustawiaj przez `setCookie` z `hono/cookie` (NIE ręcznie `c.header('Set-Cookie', ...)`). Czytaj przez `getCookie`.
- Stałe (`SESSION_COOKIE`, `SESSION_TTL_MS`) zaimportowane z jednego miejsca, NIE zduplikowane.
- ID użytkownika to `string` (UUID) w schemacie Drizzle: `text('id').primaryKey()`. NIE `integer({ autoIncrement: true })`.
- Foreign key `sessions.user_id` → `users.id` z `onDelete: 'cascade'`. Usunięcie usera kasuje jego sesje.
- Email w DB w lowercase (już znormalizowany przez VO `Email`). `unique` na kolumnie `email`.
- Test bezpieczeństwa w `register-user.test.ts`: po rejestracji `result.value.user.toJSON()` NIE ma `passwordHash` — assertem `expect(JSON.stringify(result.value.user)).not.toContain('argon')` (Bun.password tworzy hashe `$argon2id$...`).
- Migrację SQL generuje Drizzle — NIE pisz ręcznie. Plik trafia do `apps/api/drizzle/`.

## Steps

### Step 1: DB schema + migracja + repos + hasher adapter
**Pliki:** `apps/api/src/infrastructure/db/schema.ts`, `apps/api/drizzle/<auto>.sql`, `apps/api/src/infrastructure/auth/{drizzle-user-repository,drizzle-session-repository,bun-password-hasher}.ts`

**Co robimy:**
1. W `schema.ts` dopisz (NIE ruszaj `games`):
   ```ts
   export const users = sqliteTable('users', {
     id: text('id').primaryKey(),
     email: text('email').notNull().unique(),
     passwordHash: text('password_hash').notNull(),
     createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
   });

   export const sessions = sqliteTable('sessions', {
     token: text('token').primaryKey(),
     userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
     expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
     createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
   });

   export type UserRow = typeof users.$inferSelect;
   export type NewUserRow = typeof users.$inferInsert;
   export type SessionRow = typeof sessions.$inferSelect;
   export type NewSessionRow = typeof sessions.$inferInsert;
   ```
2. Wygeneruj migrację: `bun run --cwd apps/api db:generate` (powstanie `apps/api/drizzle/0002_*.sql` z `CREATE TABLE users`, `CREATE TABLE sessions`, `CREATE UNIQUE INDEX users_email_unique`).
3. Zaaplikuj: `bun run --cwd apps/api db:migrate`.
4. `apps/api/src/infrastructure/auth/drizzle-user-repository.ts`:
   ```ts
   import { eq } from 'drizzle-orm';
   import { db } from '../db/client';
   import { users } from '../db/schema';
   import { NewUser, User } from '../../domain/auth/user';
   import type { UserRepository } from '../../domain/auth/user-repository';

   export class DrizzleUserRepository implements UserRepository {
     async findByEmail(email: string): Promise<User | null> {
       const r = await db.select().from(users).where(eq(users.email, email)).limit(1);
       if (r.length === 0) return null;
       return User.fromPersistence({ id: r[0].id, email: r[0].email, passwordHash: r[0].passwordHash, createdAt: r[0].createdAt });
     }
     async findById(id: string): Promise<User | null> { /* analogicznie */ }
     async create(newUser: NewUser): Promise<User> {
       const [row] = await db.insert(users).values({
         id: newUser.id,
         email: newUser.email.value,
         passwordHash: newUser.passwordHash.value,
         createdAt: newUser.createdAt,
       }).returning();
       return User.fromPersistence({ id: row.id, email: row.email, passwordHash: row.passwordHash, createdAt: row.createdAt });
     }
   }
   ```
5. `apps/api/src/infrastructure/auth/drizzle-session-repository.ts`: analogicznie — `findByToken`, `create(session: Session)`, `deleteByToken`.
6. `apps/api/src/infrastructure/auth/bun-password-hasher.ts`:
   ```ts
   import { PasswordHash } from '../../domain/auth/password-hash';
   import type { PasswordHasher } from '../../domain/auth/password-hasher';

   export class BunPasswordHasher implements PasswordHasher {
     async hash(plain: string): Promise<PasswordHash> {
       const value = await Bun.password.hash(plain, { algorithm: 'argon2id' });
       return PasswordHash.fromTrusted(value);
     }
     async verify(plain: string, hash: PasswordHash): Promise<boolean> {
       return Bun.password.verify(plain, hash.value);
     }
   }
   ```
7. `bun run --filter '*' typecheck` → czyste. Repos i hasher kompilują się.

**Rezultat:** DB ma tabele, adaptery gotowe, migracja na dysku.

### Step 2: Use cases + testy (RED → GREEN)
**Pliki:** `apps/api/src/application/auth/{constants,register-user,login-user,logout-user,get-current-user}.ts` + 3 pliki testowe

**Co robimy:**
1. `constants.ts`:
   ```ts
   export const SESSION_COOKIE = 'apex_session';
   export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
   ```
2. Najpierw testy (RED) — w każdym pliku testowym napisz **fake repos** (in-memory `Map<email, User>`, `Map<token, Session>`) i **fake hasher** (`hash` → `PasswordHash.fromTrusted('hashed:' + plain)`, `verify` → `hash.value === 'hashed:' + plain`). Wzoruj się na strukturze `apps/api/src/application/games/create-game.test.ts`.
3. **`register-user.test.ts`**:
   - Happy path: `RegisterUser.execute({ email: 'a@b.com', password: 'password123' })` → `ok`, `result.value.user` instancja `User`, `result.value.session.token.length === 64`, `findByEmail('a@b.com')` w fake repo zwraca usera. **Sec assert:** `JSON.stringify(result.value.user)` nie zawiera `'hashed:'` ani `'password123'` ani klucza `passwordHash`.
   - Email taken: po pierwszej rejestracji druga z tym samym emailem → `err`, `error.kind === 'email_taken'`.
   - Email normalizacja: `'  USER@Example.COM '` → `ok`, w fake repo zapisany `'user@example.com'`.
   - Walidacja Zod: `password: 'short'` (7 znaków) → `err`, `error.kind === 'invalid_input'`.
   - Walidacja Zod: `email: 'not-email'` → `err`, `error.kind === 'invalid_input'`.
4. **`login-user.test.ts`**:
   - Setup: ręcznie pre-fill fake user repo userem o emailu `'a@b.com'` i passwordHash `PasswordHash.fromTrusted('hashed:password123')`.
   - Happy: `LoginUser.execute({ email: 'a@b.com', password: 'password123' })` → `ok`, sesja utworzona w fake session repo, token zwrócony.
   - Bad password: `password: 'wrong'` → `err`, `error.kind === 'invalid_credentials'`.
   - Unknown email: → `err`, `error.kind === 'invalid_credentials'` (NIE `user_not_found` — nie ujawniaj który email istnieje).
   - Walidacja Zod: brak pola → `err`, `error.kind === 'invalid_input'`.
5. **`get-current-user.test.ts`**:
   - Setup: pre-fill user + sesja ważna do `2099-01-01`.
   - Happy: `GetCurrentUser.execute(validToken, { now: new Date('2024-01-01') })` → `ok`, `result.value.id === user.id`.
   - Brak tokenu / null: → `err`, `error.kind === 'unauthorized'`.
   - Wygasła sesja: pre-fill sesja `expiresAt: new Date('2020-01-01')`, `execute(token, { now: new Date('2024-01-01') })` → `err`, `error.kind === 'unauthorized'`. **Side effect**: wygasła sesja zostaje usunięta z fake repo (bo i tak nie jest ważna). Asercja: `sessionRepo.findByToken(token) === null` po execute.
   - Token nie istnieje: → `err`, `error.kind === 'unauthorized'`.
6. `bun test apps/api/src/application/auth` → RED (use cases nie istnieją).
7. Implementacja use cases (zgodnie z testami):
   - `register-user.ts` (Zod schema: `email: z.string().email()`, `password: z.string().min(8)`. Flow: parse → `findByEmail` (po `Email.create` jako normalizacja) → jeśli exists → `email_taken`. Inaczej: `hasher.hash(password)` → `NewUser.register({ email, passwordHash })` → propagate `domain` error → `userRepo.create(newUser)` → `Session.issue({ userId: user.id, ttlMs: SESSION_TTL_MS })` → `sessionRepo.create(session)` → `ok({ user, session })`).
   - `login-user.ts` (parse → `userRepo.findByEmail(parsedEmail.toLowerCase())` — UWAGA: użyj `Email.create` żeby znormalizować input zanim zapytasz repo. Jeśli null → `invalid_credentials`. Inaczej `hasher.verify(password, user.passwordHash)` → false → `invalid_credentials`. True → `Session.issue` + `sessionRepo.create` → `ok({ user, session })`).
   - `logout-user.ts` (przyjmuje `token: string | null`, zwraca `ok(undefined)` zawsze — idempotentne. Jeśli token niepusty → `sessionRepo.deleteByToken(token)`).
   - `get-current-user.ts` (przyjmuje `token: string | null` + opcjonalnie `{ now?: Date }`. Null/empty → `err({ kind: 'unauthorized' })`. `sessionRepo.findByToken(token)` → null → `unauthorized`. `session.isExpired(now ?? new Date())` → true → `sessionRepo.deleteByToken(token)` + `unauthorized`. Inaczej: `userRepo.findById(session.userId)` → null → `unauthorized` (anomalia, log + cleanup). Inaczej `ok(user)`).
8. `bun test` → ALL GREEN.

**Rezultat:** Use cases gotowe, pełne pokrycie testami z fake adapterami, secret hygiene zweryfikowane.

### Step 3: Routes + middleware + integracja
**Pliki:** `apps/api/src/routes/auth.ts`, `apps/api/src/routes/middleware/require-auth.ts`, `apps/api/src/index.ts`

**Co robimy:**
1. `apps/api/src/routes/middleware/require-auth.ts`:
   ```ts
   import type { Context, MiddlewareHandler } from 'hono';
   import { getCookie } from 'hono/cookie';
   import { GetCurrentUser } from '../../application/auth/get-current-user';
   import { SESSION_COOKIE } from '../../application/auth/constants';
   import { DrizzleUserRepository } from '../../infrastructure/auth/drizzle-user-repository';
   import { DrizzleSessionRepository } from '../../infrastructure/auth/drizzle-session-repository';
   import type { User } from '../../domain/auth/user';

   const userRepo = new DrizzleUserRepository();
   const sessionRepo = new DrizzleSessionRepository();
   const getCurrentUser = new GetCurrentUser(userRepo, sessionRepo);

   declare module 'hono' {
     interface ContextVariableMap { user: User; }
   }

   export const requireAuth: MiddlewareHandler = async (c, next) => {
     const token = getCookie(c, SESSION_COOKIE) ?? null;
     const result = await getCurrentUser.execute(token);
     if (!result.ok) return c.json({ error: 'unauthorized' }, 401);
     c.set('user', result.value);
     await next();
   };
   ```
2. `apps/api/src/routes/auth.ts`:
   ```ts
   import { Hono } from 'hono';
   import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
   import { RegisterUser } from '../application/auth/register-user';
   import { LoginUser } from '../application/auth/login-user';
   import { LogoutUser } from '../application/auth/logout-user';
   import { SESSION_COOKIE, SESSION_TTL_MS } from '../application/auth/constants';
   import { DrizzleUserRepository } from '../infrastructure/auth/drizzle-user-repository';
   import { DrizzleSessionRepository } from '../infrastructure/auth/drizzle-session-repository';
   import { BunPasswordHasher } from '../infrastructure/auth/bun-password-hasher';
   import type { Session } from '../domain/auth/session';

   const userRepo = new DrizzleUserRepository();
   const sessionRepo = new DrizzleSessionRepository();
   const hasher = new BunPasswordHasher();
   const registerUser = new RegisterUser(userRepo, sessionRepo, hasher);
   const loginUser = new LoginUser(userRepo, sessionRepo, hasher);
   const logoutUser = new LogoutUser(sessionRepo);

   export const auth = new Hono();

   const cookieOptions = (session: Session) => ({
     httpOnly: true,
     sameSite: 'Lax' as const,
     path: '/',
     maxAge: Math.floor(SESSION_TTL_MS / 1000),
     secure: process.env.NODE_ENV === 'production',
     expires: session.expiresAt,
   });

   auth.post('/register', async (c) => {
     const body = await c.req.json();
     const result = await registerUser.execute(body);
     if (!result.ok) {
       const e = result.error;
       if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
       if (e.kind === 'email_taken') return c.json({ error: 'email_taken' }, 409);
       if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
       return c.json({ error: 'unknown error' }, 500);
     }
     setCookie(c, SESSION_COOKIE, result.value.session.token, cookieOptions(result.value.session));
     return c.json({ user: result.value.user, session: result.value.session }, 201);
   });

   auth.post('/login', async (c) => {
     const body = await c.req.json();
     const result = await loginUser.execute(body);
     if (!result.ok) {
       const e = result.error;
       if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
       if (e.kind === 'invalid_credentials') return c.json({ error: 'invalid_credentials' }, 401);
       return c.json({ error: 'unknown error' }, 500);
     }
     setCookie(c, SESSION_COOKIE, result.value.session.token, cookieOptions(result.value.session));
     return c.json({ user: result.value.user, session: result.value.session });
   });

   auth.post('/logout', async (c) => {
     const token = getCookie(c, SESSION_COOKIE) ?? null;
     await logoutUser.execute(token);
     deleteCookie(c, SESSION_COOKIE, { path: '/' });
     return c.body(null, 204);
   });

   auth.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));
   ```
   (`requireAuth` zaimportuj z `./middleware/require-auth`.)
3. W `apps/api/src/index.ts`:
   - Dodaj `import { auth } from './routes/auth';` i `import { requireAuth } from './routes/middleware/require-auth';`
   - PRZED `app.route('/api/games', games)` dodaj:
     ```ts
     app.route('/api/auth', auth);
     app.use('/api/games/*', requireAuth);
     ```
   - WAŻNE: middleware `requireAuth` musi być ZAREJESTROWANY PRZED `app.route('/api/games', games)`. W Hono kolejność `app.use` matters, ale `app.use('/api/games/*', ...)` przed `app.route(...)` zadziała poprawnie pod warunkiem że jest dodany przed. Sprawdź uruchamiając serwer.
4. Cors — istniejący `app.use('/api/*', cors())` musi przepuszczać credentials. Zmień na:
   ```ts
   app.use('/api/*', cors({ origin: 'http://localhost:5173', credentials: true }));
   ```
   (Vite domyślnie 5173. Jeśli inny port — popraw. Bez `credentials: true` przeglądarka NIE wyśle cookie cross-origin nawet jeśli front i back na różnych portach to różne origins.)
5. **Smoke test ręczny**:
   ```
   bun run --cwd apps/api dev   # w jednym terminalu

   # w drugim:
   curl -i -X POST http://localhost:3001/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"email":"smoke@test.com","password":"password123"}' \
     -c /tmp/apex.cookies
   # → 201, Set-Cookie apex_session=...

   curl -i http://localhost:3001/api/auth/me -b /tmp/apex.cookies
   # → 200 { "user": { ... } }

   curl -i http://localhost:3001/api/games -b /tmp/apex.cookies
   # → 200 (lista gier)

   curl -i http://localhost:3001/api/games
   # → 401 unauthorized

   curl -i -X POST http://localhost:3001/api/auth/logout -b /tmp/apex.cookies
   # → 204, Set-Cookie apex_session= (cleared)
   ```
6. `bun test`, `bun run --filter '*' typecheck`, `bun run lint` → wszystkie czyste.

**API spec po fazie 2:**
```
POST /api/auth/register   body: { email, password }   → 201 { user, session } + Set-Cookie
POST /api/auth/login      body: { email, password }   → 200 { user, session } + Set-Cookie
POST /api/auth/logout                                  → 204 + cookie cleared
GET  /api/auth/me         cookie required              → 200 { user } | 401

GET  /api/games           cookie required              → 200 | 401
POST /api/games           cookie required              → 201 | 401
... (wszystkie /api/games/* za requireAuth)
```

**Rezultat:** Backend kompletny. Frontend (faza 3) integruje się z `/api/auth/*` i obsługuje 401.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- `db:generate` nic nie produkuje — sprawdź że dopisałeś `users`/`sessions` do `apps/api/src/infrastructure/db/schema.ts` ORAZ że pliki znajdują się w ścieżce z `drizzle.config.ts` (`./src/infrastructure/db/schema.ts`). Restart `db:generate` po zapisie pliku.
- `db:migrate` zwraca "table already exists" — usuń ostatnio wygenerowaną migrację z `apps/api/drizzle/`, popraw schema, wygeneruj ponownie. NIGDY nie edytuj wygenerowanego SQL ręcznie.
- `drizzle-kit` nie widzi `unique()` na kolumnie — sprawdź wersję drizzle-orm i drizzle-kit (z `package.json`). Składnia `text('email').notNull().unique()` działa od ~0.30. Pobierz z Context7 dokładną składnię dla wersji w projekcie.
- Cookie nie jest wysyłane przez przeglądarkę z frontendu — sprawdź: `cors({ credentials: true })` na backendzie, `fetch(..., { credentials: 'include' })` na froncie (faza 3), oraz `SameSite=Lax` na cookie. Bez tego całego trio cross-origin cookie się nie zapnie.
- `hono/cookie` nie eksportuje `setCookie` — sprawdź wersję Hono. W 4.x to `import { setCookie, getCookie, deleteCookie } from 'hono/cookie';`. Pobierz z Context7.
- Test `register-user` failuje na `Bun.password.hash` w fake hasher — używasz REAL Bun.password zamiast fake hashera w teście. W teście MUSI być `class FakePasswordHasher implements PasswordHasher { ... 'hashed:' + plain ... }`. Real BunPasswordHasher to integration test, którego TU nie piszemy.
- Test `get-current-user` failuje że sesja wygasła ale repo nie wie o jej usunięcie — sprawdź czy w impl `get-current-user.ts` faktycznie wywołujesz `sessionRepo.deleteByToken(token)` w gałęzi `isExpired`.
- TS narzeka na `c.set('user', ...)` — brakuje `declare module 'hono'` z `ContextVariableMap`. Wstaw to w `require-auth.ts` (lub osobnym `apps/api/src/routes/middleware/types.ts` zaimportowanym wszędzie).
- 401 nawet z poprawnym cookie — sprawdź kolejność w `index.ts`: `app.route('/api/auth', auth)` MUSI być przed `app.use('/api/games/*', requireAuth)` (lub niezależnie — bo `/api/auth/*` nie matchuje `/api/games/*`). Jeśli problem z `/api/games`: log z middleware `console.log('cookie =', getCookie(c, SESSION_COOKIE))` żeby zobaczyć czy cookie dociera.
