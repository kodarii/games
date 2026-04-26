# Auth (rejestracja + logowanie) — Faza 1: Backend Domain

## Goal
Zamodeluj domenę uwierzytelniania: agregaty `User` (rejestracja, dane konta) i `Session` (token + ważność). Pełna walidacja inputu, Result<T,E> bez throw, brak importów z infrastructure/application. Po tej fazie istnieją typy, factory, porty repozytoriów oraz port hashera — bez żadnej DB, route'ów ani Bun.password (to faza 2).

## Definition of Done
- [ ] Wszystkie testy domeny przechodzą: `bun test apps/api/src/domain/auth`
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] Domain layer NIE importuje nic z `infrastructure/`, `application/`, `routes/`, ani z bibliotek runtime (bun:sqlite, drizzle, hono, zod)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run --filter '*' typecheck`, `bun run lint`)
**Architektura:** DDD + Ports & Adapters. `apps/api/src/domain/` to pure TypeScript, brak side-effectów, brak external libs.
**Error model:** `Result<T, E>` (`ok(value)` / `err(error)`) z `apps/api/src/domain/shared/result.ts` — bez throw, bez exception chains.
**Wzorzec referencyjny:** `apps/api/src/domain/games/game.ts` + `apps/api/src/domain/games/__tests__/game.test.ts` — czytaj dokładnie, ten sam styl Value Object (private constructor + `static create` zwracający Result, `static fromTrusted/fromPersistence` dla deserializacji).

## Design decisions
- **User to aggregate root** (id, email, passwordHash, createdAt). Tożsamość = `id` (string UUID, generowane w domenie przez `crypto.randomUUID()`, NIE auto-increment z bazy).
- **Email to Value Object** — invariants: niepusty, format (regex prosty: `^[^\s@]+@[^\s@]+\.[^\s@]+$`), lowercase, trim. `Email.create(raw)` → `Result<Email, AuthValidationError>`.
- **PasswordHash to Value Object** — opaque string. `PasswordHash.fromTrusted(value)` (bo plain password nigdy nie żyje w domenie — użytkownik podaje plain, aplikacyjny use case go hashuje przez port `PasswordHasher`, dopiero hash trafia do `User.register`). NIE ma `PasswordHash.create(plain)` — domain NIC nie wie o hashowaniu.
- **PasswordHasher to PORT w domain** (`hash(plain): Promise<PasswordHash>`, `verify(plain, hash): Promise<boolean>`). Implementacja Bun.password idzie do infrastructure w fazie 2.
- **Walidacja siły hasła to NIE domena.** Min długość, znaki specjalne itp. to wymaganie aplikacyjne — egzekwowane przez Zod w `register-user.ts` (faza 2). Domain widzi tylko `PasswordHash`.
- **Session to OSOBNY agregat** (nie część User). Pola: `token: string` (id sesji = opaque random 32B hex), `userId: string`, `expiresAt: Date`, `createdAt: Date`. Lifecycle: stworzona w login, usunięta w logout/expire. User może mieć wiele aktywnych sesji (multi-device) — to domain nie egzekwuje żadnego limitu.
- **Token sesji to ID agregatu Session** generowane w domenie (`crypto.getRandomValues` 32 bajty → hex). NIE JWT, NIE base64 podpisany — opaque random + lookup w DB.
- **Sesja ma absolute expiry** (np. 30 dni). NIE sliding window. `Session.isExpired(now: Date): boolean` to metoda domenowa.
- **Każdy error kind UNIKALNY**: `email_invalid`, `email_empty`, `session_expired`. NIE współdziel kindów między agregatami.

### Relevant files (edit only these)
- `apps/api/src/domain/auth/email.ts` — **NEW** — `Email` VO (`create`, `fromTrusted`, `value` getter)
- `apps/api/src/domain/auth/password-hash.ts` — **NEW** — `PasswordHash` VO (tylko `fromTrusted` + `value`)
- `apps/api/src/domain/auth/user.ts` — **NEW** — `AuthValidationError` union, `UserProps`, `NewUser` (factory `register`), `User` (`fromPersistence`, getters, `toJSON` BEZ passwordHash)
- `apps/api/src/domain/auth/session.ts` — **NEW** — `SessionProps`, `Session` factory `issue` (generuje token + expiresAt), `Session.fromPersistence`, `isExpired`, `toJSON`
- `apps/api/src/domain/auth/user-repository.ts` — **NEW** — interfejs `UserRepository`
- `apps/api/src/domain/auth/session-repository.ts` — **NEW** — interfejs `SessionRepository`
- `apps/api/src/domain/auth/password-hasher.ts` — **NEW** — interfejs `PasswordHasher` (port)
- `apps/api/src/domain/auth/__tests__/email.test.ts` — **NEW**
- `apps/api/src/domain/auth/__tests__/user.test.ts` — **NEW**
- `apps/api/src/domain/auth/__tests__/session.test.ts` — **NEW**

### Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — typ `Result`, funkcje `ok`/`err`
- `apps/api/src/domain/games/game.ts` — wzorzec VO (`ReleaseYear`, `HoursPlayed`) i Aggregate (`NewGame`, `Game`)
- `apps/api/src/domain/games/__tests__/game.test.ts` — wzorzec testów Bun (`describe`/`it`/`expect` z `bun:test`)
- `apps/api/src/domain/games/game-repository.ts` — wzorzec portu repozytorium

## Constraints
- TDD: NAJPIERW testy domeny (RED), POTEM impl (GREEN). Każdy z trzech plików testowych prowadzi swoją parę RED → GREEN.
- NIE używaj `throw` ani `try/catch` w domenie. Tylko `Result`.
- NIE importuj `bun:sqlite`, `drizzle-orm`, `hono`, `zod` w domain. Domain to czysty TS + `crypto` (globalne `crypto.randomUUID`, `crypto.getRandomValues` — to Web API, dostępne w Bun bez importu).
- NIE waliduj siły hasła w domenie. PasswordHash przyjmuje zaufany string.
- NIE rób `Email.create` wieloargumentowego — raw input to jeden `string`.
- NIE pisz `Session.issue` które przyjmuje token z zewnątrz — token MUSI być generowany wewnątrz factory (to jest tożsamość agregatu, nie input).
- `User.toJSON()` NIE może eksponować `passwordHash`. NIGDY. Sprawdź to testem.
- ID `User` to `string` (UUID), NIE number. To różni się od `Game` (number autoinc) — świadomie, bo `User` ma stable identity od momentu rejestracji, a UUID lepiej pasuje do auth (token leaks, race conditions itp.).
- Nie importuj `crypto` z node — używaj globalnego `crypto` (Web Crypto API), tak samo działa w Bun.
- W testach używaj `import { describe, it, expect } from 'bun:test'` — tak jak w `game.test.ts`.

## Steps

### Step 1: Email VO + testy (RED → GREEN)
**Pliki:** `apps/api/src/domain/auth/email.ts`, `apps/api/src/domain/auth/__tests__/email.test.ts`

**Co robimy:**
1. Najpierw test (`email.test.ts`):
   - `Email.create('user@example.com')` → `ok`, `value.value === 'user@example.com'`
   - `Email.create('  USER@Example.COM  ')` → `ok`, `value.value === 'user@example.com'` (trim + lowercase)
   - `Email.create('')` → `err`, `error.kind === 'email_empty'`
   - `Email.create('   ')` → `err`, `error.kind === 'email_empty'`
   - `Email.create('not-an-email')` → `err`, `error.kind === 'email_invalid'`
   - `Email.create('a@b')` → `err`, `error.kind === 'email_invalid'` (brak kropki w domenie)
   - `Email.fromTrusted('zaufany@x.com')` → instancja z `value === 'zaufany@x.com'` (bez walidacji, ale też bez modyfikacji)
2. `bun test apps/api/src/domain/auth/__tests__/email.test.ts` → RED (plik `email.ts` nie istnieje).
3. Implementacja `email.ts`:
   - `export type EmailValidationError = { kind: 'email_empty' } | { kind: 'email_invalid'; value: string };`
   - `export class Email { private constructor(public readonly value: string) {} static create(raw: string): Result<Email, EmailValidationError> { ... } static fromTrusted(value: string): Email { return new Email(value); } }`
   - Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - `create`: trim, jeśli pusty → `email_empty`, lowercase, sprawdź regex → jeśli nie pasuje → `email_invalid` z oryginalnym (po trim) value, inaczej `ok(new Email(normalized))`.
4. `bun test apps/api/src/domain/auth/__tests__/email.test.ts` → GREEN.

**Rezultat:** Email VO gotowe, wszystkie testy zielone, brak importów spoza domain.

### Step 2: User aggregate + PasswordHash VO + testy (RED → GREEN)
**Pliki:** `apps/api/src/domain/auth/password-hash.ts`, `apps/api/src/domain/auth/user.ts`, `apps/api/src/domain/auth/__tests__/user.test.ts`

**Co robimy:**
1. `password-hash.ts`:
   - `export class PasswordHash { private constructor(public readonly value: string) {} static fromTrusted(value: string): PasswordHash { return new PasswordHash(value); } }`
   - To wszystko. Brak `create`, brak walidacji — VO opaque na poziomie domeny.
2. Test (`user.test.ts`) — najpierw RED:
   - `validProps()` factory zwraca `{ email: 'user@example.com', passwordHash: PasswordHash.fromTrusted('hash:abc') }`.
   - `NewUser.register(validProps())` → `ok`, `value.email.value === 'user@example.com'`, `value.id` to string UUID (length > 0, regex `/^[0-9a-f-]{36}$/i`), `value.createdAt instanceof Date`.
   - `NewUser.register({ ...validProps(), email: '   ' })` — UWAGA: factory przyjmuje `email: string` (raw), nie `Email`. Czyli factory wewnątrz wywołuje `Email.create` i propaguje błąd. Test: `err`, `error.kind === 'email_empty'`.
   - `NewUser.register({ ...validProps(), email: 'not-an-email' })` → `err`, `error.kind === 'email_invalid'`.
   - `User.fromPersistence({ id: 'uuid', email: 'user@example.com', passwordHash: 'hash:abc', createdAt: new Date('2024-01-01') })` → instancja, `user.email.value === 'user@example.com'`, `user.passwordHash.value === 'hash:abc'`.
   - **Krytyczny test:** `JSON.stringify(user)` (lub `user.toJSON()`) NIE zawiera klucza `passwordHash` ani jego wartości. Test: `expect(JSON.stringify(user)).not.toContain('hash:abc'); expect(JSON.stringify(user)).not.toContain('passwordHash');`.
3. `bun test apps/api/src/domain/auth/__tests__/user.test.ts` → RED.
4. Implementacja `user.ts`:
   - `export type AuthValidationError = EmailValidationError;` (re-export, na razie nic więcej)
   - `export type UserProps = { email: string; passwordHash: PasswordHash };`
   - `class NewUser` z prywatnym konstruktorem przyjmującym `_id: string, _email: Email, _passwordHash: PasswordHash, _createdAt: Date`. Factory:
     ```ts
     static register(props: UserProps): Result<NewUser, AuthValidationError> {
       const emailResult = Email.create(props.email);
       if (!emailResult.ok) return emailResult;
       const id = crypto.randomUUID();
       const createdAt = new Date();
       return ok(new NewUser(id, emailResult.value, props.passwordHash, createdAt));
     }
     ```
     Gettery: `id`, `email`, `passwordHash`, `createdAt`. `toJSON()` zwraca `{ id, email: this._email.value, createdAt: this._createdAt.toISOString() }` — BEZ passwordHash.
   - `class User` (persisted): konstruktor przyjmuje `_id, _email, _passwordHash, _createdAt`. `static fromPersistence(row: { id: string; email: string; passwordHash: string; createdAt: Date }): User` — używa `Email.fromTrusted` + `PasswordHash.fromTrusted`. Te same gettery + ten sam `toJSON()` (BEZ passwordHash).
5. `bun test apps/api/src/domain/auth/__tests__/user.test.ts` → GREEN.

**Rezultat:** User aggregate gotowe, passwordHash izolowany, `toJSON` bezpieczny.

### Step 3: Session aggregate + testy (RED → GREEN)
**Pliki:** `apps/api/src/domain/auth/session.ts`, `apps/api/src/domain/auth/__tests__/session.test.ts`

**Co robimy:**
1. Test (`session.test.ts`) — RED:
   - `Session.issue({ userId: 'user-uuid', ttlMs: 30 * 24 * 60 * 60 * 1000, now: new Date('2024-01-01T00:00:00Z') })` → instancja, `session.userId === 'user-uuid'`, `session.token` to hex string długości 64 (32 bajty * 2), `session.expiresAt.getTime() === new Date('2024-01-31T00:00:00Z').getTime()`, `session.createdAt.toISOString() === '2024-01-01T00:00:00.000Z'`.
   - Dwa wywołania `Session.issue` z tymi samymi argami → różne `token` (test losowości: nie identyczne).
   - `session.isExpired(new Date('2024-01-30T23:59:59Z'))` → `false`.
   - `session.isExpired(new Date('2024-01-31T00:00:00Z'))` → `true` (granica = wygasły; lub `false`, ważne by ZDECYDOWAĆ — w tym planie: `isExpired = now >= expiresAt`).
   - `Session.fromPersistence({ token: 'abc', userId: 'user-uuid', expiresAt: new Date(...), createdAt: new Date(...) })` → instancja, gettery zwracają te same wartości.
   - `JSON.stringify(session)` zawiera `token` (token sesji jest publiczny — to ID agregatu, klient go potrzebuje w cookie).
2. `bun test apps/api/src/domain/auth/__tests__/session.test.ts` → RED.
3. Implementacja `session.ts`:
   ```ts
   export class Session {
     private constructor(
       private readonly _token: string,
       private readonly _userId: string,
       private readonly _expiresAt: Date,
       private readonly _createdAt: Date,
     ) {}

     static issue(input: { userId: string; ttlMs: number; now?: Date }): Session {
       const now = input.now ?? new Date();
       const bytes = new Uint8Array(32);
       crypto.getRandomValues(bytes);
       const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
       return new Session(token, input.userId, new Date(now.getTime() + input.ttlMs), now);
     }

     static fromPersistence(row: { token: string; userId: string; expiresAt: Date; createdAt: Date }): Session {
       return new Session(row.token, row.userId, row.expiresAt, row.createdAt);
     }

     get token() { return this._token; }
     get userId() { return this._userId; }
     get expiresAt() { return this._expiresAt; }
     get createdAt() { return this._createdAt; }

     isExpired(now: Date): boolean {
       return now.getTime() >= this._expiresAt.getTime();
     }

     toJSON() {
       return {
         token: this._token,
         userId: this._userId,
         expiresAt: this._expiresAt.toISOString(),
         createdAt: this._createdAt.toISOString(),
       };
     }
   }
   ```
4. `bun test apps/api/src/domain/auth/__tests__/session.test.ts` → GREEN.

**Rezultat:** Session aggregate gotowe, deterministyczny `now` w testach (parametr `now`), `isExpired` z jasną semantyką.

### Step 4: Porty (interfejsy) + sanity check
**Pliki:** `apps/api/src/domain/auth/user-repository.ts`, `apps/api/src/domain/auth/session-repository.ts`, `apps/api/src/domain/auth/password-hasher.ts`

**Co robimy:**
1. `user-repository.ts`:
   ```ts
   import type { NewUser, User } from './user';
   export interface UserRepository {
     findByEmail(email: string): Promise<User | null>;  // email znormalizowany (lowercase)
     findById(id: string): Promise<User | null>;
     create(newUser: NewUser): Promise<User>;
   }
   ```
2. `session-repository.ts`:
   ```ts
   import type { Session } from './session';
   export interface SessionRepository {
     findByToken(token: string): Promise<Session | null>;
     create(session: Session): Promise<Session>;
     deleteByToken(token: string): Promise<void>;
   }
   ```
3. `password-hasher.ts`:
   ```ts
   import type { PasswordHash } from './password-hash';
   export interface PasswordHasher {
     hash(plain: string): Promise<PasswordHash>;
     verify(plain: string, hash: PasswordHash): Promise<boolean>;
   }
   ```
4. Sanity check całej fazy:
   - `bun test apps/api/src/domain/auth` — wszystkie testy (3 pliki) zielone
   - `bun test` (cały projekt) — istniejące testy `games` dalej zielone
   - `bun run --filter '*' typecheck` czyste
   - `bun run lint` czyste
   - `grep -RE "from 'bun:sqlite'|from 'drizzle-orm'|from 'hono'|from 'zod'" apps/api/src/domain/auth` — ZERO wyników (domain nie importuje runtime libs)

**Rezultat:** Pełna domena auth + porty + testy. Nic nie woła ani nie używa Bun.password / Drizzle / Hono — to faza 2. Następna faza dostaje gotową domenę przez `Files to read but NOT edit`.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- Test losowości tokenu failuje deterministycznie — sprawdź czy używasz `crypto.getRandomValues` (globalny), nie `Math.random`. Bun ma Web Crypto API w globalu, NIE importuj z `node:crypto`.
- Test `toJSON` not.toContain('passwordHash') failuje — sprawdź czy w `toJSON()` nie dodałeś przez przypadek pola, lub czy nie wystawiasz settera/property wprost. `JSON.stringify(user)` używa `toJSON` automatycznie.
- TypeScript narzeka na `crypto.randomUUID` — sprawdź `tsconfig` (powinien mieć `"lib": ["ES2022", "DOM"]` lub równoważne; w Bun zwykle wystarczy `@types/bun`). Jeśli problem persystuje: użyj `globalThis.crypto.randomUUID()`.
- Walidacja regexem akceptuje `a@b.c` ale test oczekuje `false` — popraw test lub regex zgodnie z decyzją (regex z Design decisions akceptuje `a@b.c`; jeśli nie chcesz — zmień regex na bardziej restrykcyjny, ale zgodnie z planem `a@b.c` jest OK, a `a@b` nie).
- Importujesz `Result` z `'../shared/result'` — ścieżka relatywna z `apps/api/src/domain/auth/foo.ts` to `../shared/result`. Z testu (`apps/api/src/domain/auth/__tests__/foo.test.ts`) — to `../../shared/result`.
