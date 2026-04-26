# Auth (rejestracja + logowanie) — Faza 1: Backend setup (better-auth + DB)

## Goal
Zainstaluj i skonfiguruj **better-auth** (production-grade lib do auth) z adapterem Drizzle na bun:sqlite. Po tej fazie istnieją: `auth.ts` (instancja better-auth z włączonym email+password), wygenerowany przez CLI better-auth schemat Drizzle dla tabel `user`/`session`/`account`/`verification`, zaktualizowany `drizzle.config.ts`, zaaplikowana migracja oraz `.env` z `BETTER_AUTH_SECRET`. ZERO własnej domeny User/Session/PasswordHash — to robi za nas better-auth.

**Dlaczego better-auth, a nie własne aggregaty:** better-auth to sprawdzona produkcyjnie biblioteka (hashing scrypt, secure session cookies, CSRF, origin checks, rate-limit hooks, email verification, OAuth, 2FA — wszystko jako rozszerzenia). Jest framework-agnostic, ma natywną integrację z Hono i Drizzle. Pisanie własnego User/PasswordHash/Session aggregatu to reinwencja koła i duże ryzyko błędów security. Naszą rolą jest *integracja*, nie *implementacja*.

## Definition of Done
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] `bun add better-auth @better-auth/cli` (api) i pakiety zainstalowane (`apps/api/package.json` ma `better-auth`)
- [ ] Plik `apps/api/.env` istnieje, zawiera `BETTER_AUTH_SECRET` (32+ znaki) i `BETTER_AUTH_URL=http://localhost:3001`. `.env` w `.gitignore` (sprawdź — zwykle już jest)
- [ ] `apps/api/src/infrastructure/auth/auth.ts` istnieje, eksportuje `auth` (instancja `betterAuth(...)`) z `drizzleAdapter(db, { provider: 'sqlite' })` + `emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true }`
- [ ] `apps/api/src/infrastructure/db/auth-schema.ts` wygenerowany przez `bunx @better-auth/cli generate` (zawiera `user`, `session`, `account`, `verification` jako Drizzle SQLite tables)
- [ ] `apps/api/drizzle.config.ts` widzi OBA pliki schematu (array lub glob) — `bun run --cwd apps/api db:generate` produkuje migrację z 4 nowymi tabelami
- [ ] Migracja zaaplikowana: `bun run --cwd apps/api db:migrate` przeszło, w `apps/api/data/apex.db` istnieją tabele `user`, `session`, `account`, `verification` (sprawdź `sqlite3 apps/api/data/apex.db '.tables'`)
- [ ] Zachowana istniejąca tabela `games` — migracja jej NIE rusza

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun add`, `bun test`, `bun run --filter '*' typecheck`, `bun run --cwd apps/api db:generate`, `bun run --cwd apps/api db:migrate`, `bun run lint`)
**Wersje** (z `apps/api/package.json`): `drizzle-orm@^0.45`, `drizzle-kit@^0.31`, `hono@^4.6`. Zainstaluj **najnowszą stabilną** `better-auth` i `@better-auth/cli` — sprawdź na npm jeśli masz wątpliwości, ale `bun add better-auth` wystarczy.
**ORM:** Drizzle (bun:sqlite). Istniejąca `apps/api/src/infrastructure/db/schema.ts` zawiera tabelę `games` — NIE ruszać. Auth tables idą do osobnego pliku `auth-schema.ts`, oba są podpięte w `drizzle.config.ts`.
**Hashing:** scrypt (default better-auth, deterministic, bez native deps). NIE konfigurujemy własnego `password.hash/verify` — defaulty są bezpieczne.

## Design decisions
- **better-auth jest single source of truth dla auth.** NIE piszemy własnych `User`/`Session` value-objects, NIE implementujemy `PasswordHasher` portu, NIE robimy własnych use-case'ów `RegisterUser`/`LoginUser`. To wszystko jest w bibliotece.
- **Lokalizacja `auth.ts`:** `apps/api/src/infrastructure/auth/auth.ts`. To infrastructure layer (zależy od `db`, env). Domain nie ma już folderu `auth/` — auth nie jest naszą domeną biznesową, jest cross-cutting capability.
- **Lokalizacja `auth-schema.ts`:** `apps/api/src/infrastructure/db/auth-schema.ts` (osobny plik, NIE łącz z `schema.ts`). Powód: plik jest GENEROWANY przez `bunx @better-auth/cli generate` — nie chcemy mieszać kodu generowanego z ręcznym. Jeśli kiedyś dodasz plugin (2FA, organizations) i regenerujesz schemat, regeneruje się TYLKO auth-schema.ts.
- **drizzle.config.ts schema:** zmieniamy z `schema: './src/infrastructure/db/schema.ts'` na `schema: ['./src/infrastructure/db/schema.ts', './src/infrastructure/db/auth-schema.ts']`. drizzle-kit obsługuje array od dawna.
- **Email+password włączone, `autoSignIn: true`** (po rejestracji user od razu zalogowany — wygodniejsze UX, mniej round-tripów). `minPasswordLength: 8`. `requireEmailVerification: false` (na razie nie mamy SMTP — verification dorzucimy w osobnej fazie jak będzie potrzebne).
- **Sesja w cookie** — better-auth ustawia HttpOnly + SameSite=Lax + Secure (w produkcji) sam, z domyślnym TTL 7 dni i sliding window 1 dnia. Możemy nadpisać przez `session: { expiresIn: 60 * 60 * 24 * 30 }` (30 dni) jeśli chcemy — w tej fazie ZOSTAW DEFAULT i przeskoczymy do tego dopiero jeśli requirement się pojawi.
- **trustedOrigins** — better-auth blokuje cross-origin POST z nieznanego origin (CSRF protection). W konfigu `auth.ts` trzeba dodać `trustedOrigins: ['http://localhost:5173']` (Vite dev). Lista origin frontu, zwykle env-driven.
- **`BETTER_AUTH_SECRET`** — better-auth podpisuje cookies tym sekretem. Wymagany w środowisku, w dev wygeneruj losowy 32+ znaki (`openssl rand -base64 32` lub `bun -e "console.log(crypto.randomUUID() + crypto.randomUUID())"`). NIE commit do repo.
- **Migrację SQL generuje drizzle-kit** z auth-schema.ts (po wygenerowaniu schematu przez CLI). NIE używaj `npx auth migrate` (to dla kysely adapter, nie naszego Drizzle).

### Step 0: Pobierz dokumentację
Użyj Context7 PRZED instalacją:
1. `better-auth` — pytanie: "Drizzle adapter setup for SQLite/bun:sqlite, emailAndPassword with minPasswordLength and autoSignIn, trustedOrigins, BETTER_AUTH_SECRET / BETTER_AUTH_URL env vars, CLI generate command for Drizzle output path"
2. `drizzle-kit` — pytanie: "schema option as array of files or glob, generate migration from multiple schema modules"

(Hono + cors + middleware mounting docs są w fazie 2.)

### Relevant files (edit only these)
- `apps/api/package.json` — dependency `better-auth` (devDep `@better-auth/cli` lub bunx — wybierz)
- `apps/api/.env` — **NEW** — `BETTER_AUTH_SECRET=...`, `BETTER_AUTH_URL=http://localhost:3001`
- `apps/api/src/infrastructure/auth/auth.ts` — **NEW** — instancja `auth = betterAuth({...})`, eksport `auth`
- `apps/api/src/infrastructure/db/auth-schema.ts` — **NEW** (generowany przez CLI better-auth)
- `apps/api/drizzle.config.ts` — schema z pojedynczego pliku → array dwóch plików
- `apps/api/drizzle/<auto>.sql` — wygenerowana migracja (NIE pisać ręcznie)

### Files to read but NOT edit
- `apps/api/src/infrastructure/db/client.ts` — istniejący `db` Drizzle client (z bun:sqlite + WAL + auto-migrate)
- `apps/api/src/infrastructure/db/schema.ts` — tabela `games` (zostaje bez zmian)
- `apps/api/drizzle.config.ts` (przed edycją) — wzorzec configa

## Constraints
- NIE pisz własnej domeny User/Session/PasswordHash — to anti-goal całego rewrite'u tych planów. Jeśli kuszą Cię value objects: STOP, wróć do tego dokumentu.
- NIE edytuj wygenerowanego `auth-schema.ts` ręcznie — jeśli czegoś brakuje, zmień config better-auth (`auth.ts`) i regeneruj. To plik output CLI.
- NIE łącz `schema.ts` i `auth-schema.ts` w jeden plik — separacja generowanego od ręcznego.
- NIE commit `.env` — tylko `.env.example` z placeholderami można zacommitować (opcjonalne w tej fazie).
- NIE używaj `bun.password` jako custom hashera w `emailAndPassword.password` — defaulty better-auth (scrypt) są wystarczające i przenośne. Nie komplikuj.
- NIE dodawaj plugins (2FA, organizations, magic-link) w tej fazie — minimalny setup email+password.
- Dropping `apps/api/src/domain/auth/*` — jeśli folder istnieje (z poprzedniej iteracji): `rm -rf apps/api/src/domain/auth` PRZED zaczęciem (sanity check, że nie zostają sieroty).
- ID `user.id` to `text` (uuid generowany przez better-auth) — to różni się od `games.id` (integer autoinc). Świadomie, bo better-auth tak działa.

## Steps

### Step 1: Install + .env + sanity check
**Pliki:** `apps/api/package.json`, `apps/api/.env`

**Co robimy:**
1. Z katalogu projektu: `bun add --cwd apps/api better-auth`. Sprawdź `apps/api/package.json` — dependency dodane.
2. Wygeneruj sekret: `openssl rand -base64 32` (jeśli brak openssl: `bun -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"`).
3. Stwórz `apps/api/.env`:
   ```
   BETTER_AUTH_SECRET=<wklej-32+-znaków-z-poprzedniego-kroku>
   BETTER_AUTH_URL=http://localhost:3001
   ```
4. Sprawdź `.gitignore` (root repo lub `apps/api/.gitignore`) — `.env` MUSI być ignorowany. Jeśli nie ma — dopisz `.env` do `.gitignore` w root projektu.
5. (Opcjonalnie) `apps/api/.env.example` z placeholderami żeby README/devx było jasne:
   ```
   BETTER_AUTH_SECRET=replace-with-32-byte-random
   BETTER_AUTH_URL=http://localhost:3001
   ```
6. `bun run --filter '*' typecheck` — czyste (pakiet zainstalowany, jeszcze nigdzie go nie używamy).

**Rezultat:** Lib zainstalowana, sekret w `.env`, gotowi do konfiguracji.

### Step 2: Konfiguracja `auth.ts`
**Pliki:** `apps/api/src/infrastructure/auth/auth.ts`

**Co robimy:**
1. Stwórz katalog jeśli nie istnieje: `mkdir -p apps/api/src/infrastructure/auth`.
2. Stwórz `auth.ts`:
   ```ts
   import { betterAuth } from 'better-auth';
   import { drizzleAdapter } from 'better-auth/adapters/drizzle';
   import { db } from '../db/client';

   export const auth = betterAuth({
     baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
     secret: process.env.BETTER_AUTH_SECRET,
     database: drizzleAdapter(db, { provider: 'sqlite' }),
     emailAndPassword: {
       enabled: true,
       minPasswordLength: 8,
       autoSignIn: true,
     },
     trustedOrigins: ['http://localhost:5173'],
   });

   export type Auth = typeof auth;
   ```
3. **UWAGA na import drizzle adaptera** — w aktualnych wersjach better-auth ścieżka to `better-auth/adapters/drizzle`, nie osobny pakiet `@better-auth/drizzle-adapter` (zweryfikuj z Context7 — jeśli docs pokazują osobny pakiet, to znak że masz starszą wersję, doinstaluj `bun add --cwd apps/api @better-auth/drizzle-adapter` i zmień import).
4. `bun run --filter '*' typecheck` — powinno być czyste. Jeśli TS narzeka że `db` ma nieznany typ dla adaptera — to OK, schema jeszcze nie istnieje (Step 3). Adapter wymaga schematu w runtime, ale typy są elastyczne.

**Rezultat:** `auth.ts` istnieje, lib skonfigurowany, instancja `auth` eksportowana — jeszcze nigdzie nie zamontowana (to faza 2).

### Step 3: Wygenerowanie schematu Drizzle przez CLI better-auth
**Pliki:** `apps/api/src/infrastructure/db/auth-schema.ts` (output CLI)

**Co robimy:**
1. Z katalogu `apps/api`:
   ```bash
   bunx @better-auth/cli generate \
     --config ./src/infrastructure/auth/auth.ts \
     --output ./src/infrastructure/db/auth-schema.ts \
     --y
   ```
   CLI:
   - Wczyta config z `auth.ts`.
   - Sprawdzi adapter (Drizzle).
   - Wygeneruje 4 tabele (`user`, `session`, `account`, `verification`) jako `sqliteTable(...)` w `auth-schema.ts`.
   - Importuje z `drizzle-orm/sqlite-core` i `drizzle-orm`.
2. Sprawdź wygenerowany plik. Powinien zawierać:
   - `user` z `id: text`, `email: text unique notNull`, `emailVerified: integer mode boolean default false`, `name`, `image`, `createdAt`, `updatedAt`.
   - `session` z `id`, `expiresAt`, `token unique`, `userId references user.id onDelete cascade`, `ipAddress`, `userAgent`.
   - `account` z `password` (tu siedzi hash dla email+password providera), `userId references user.id onDelete cascade`, `providerId`, `accountId`.
   - `verification` z `identifier`, `value`, `expiresAt`.
3. NIE edytuj pliku. Jeśli czegoś brakuje (np. nie ma `user.name` bo zmieniliśmy config) — wróć do `auth.ts`, popraw config, regeneruj.

**Rezultat:** `auth-schema.ts` istnieje, zawiera kompletny schemat better-auth dla SQLite. Plik traktujemy jak generated artifact.

### Step 4: Drizzle migracja
**Pliki:** `apps/api/drizzle.config.ts`, `apps/api/drizzle/<auto>.sql` (generowane)

**Co robimy:**
1. Edytuj `drizzle.config.ts` — pole `schema` z stringa na array:
   ```ts
   import { resolve } from 'node:path';
   import { defineConfig } from 'drizzle-kit';

   export default defineConfig({
     dialect: 'sqlite',
     schema: [
       './src/infrastructure/db/schema.ts',
       './src/infrastructure/db/auth-schema.ts',
     ],
     out: './drizzle',
     dbCredentials: {
       url: resolve(process.cwd(), 'data/apex.db'),
     },
   });
   ```
2. Wygeneruj migrację:
   ```bash
   bun run --cwd apps/api db:generate
   ```
   Powstanie `apps/api/drizzle/0001_*.sql` z `CREATE TABLE user`, `CREATE TABLE session`, `CREATE TABLE account`, `CREATE TABLE verification` + indexes/foreign keys. Tabela `games` NIE jest ruszana (drizzle-kit widzi że już istnieje w obecnym snapshot).
3. Sprawdź wygenerowany SQL — to sanity check. Powinien zawierać tylko CREATE TABLE dla 4 nowych tabel + UNIQUE INDEX na `user.email` i `session.token`. ŻADNE DROP / ALTER `games`.
4. Zaaplikuj:
   ```bash
   bun run --cwd apps/api db:migrate
   ```
5. Zweryfikuj DB:
   ```bash
   sqlite3 apps/api/data/apex.db '.tables'
   # → games user session account verification __drizzle_migrations
   ```
   (Jeśli brakuje `sqlite3` w systemie: `bunx drizzle-kit studio` i obejrzyj graficznie albo pomiń — wystarczy że `db:migrate` przeszło bez errora.)

**Rezultat:** Tabele better-auth na dysku, migracja w `apps/api/drizzle/`, baza ready do podpięcia handlera (faza 2).

### Step 5: Cleanup + sanity check całej fazy
**Co robimy:**
1. Jeśli istnieje `apps/api/src/domain/auth/` (z poprzedniej wersji planu, NIM zostały zmienione): `rm -rf apps/api/src/domain/auth` (sprawdź `git status` PRZED — jeśli to nieskommitowana praca, zapytaj userka).
2. Jeśli istnieją artefakty z poprzedniego planu (`apps/api/src/application/auth/*`, `apps/api/src/infrastructure/auth/drizzle-user-repository.ts`, itp.) — usuń. Zostawiamy TYLKO `apps/api/src/infrastructure/auth/auth.ts`.
3. Final check:
   - `bun run --filter '*' typecheck` — czyste
   - `bun run lint` — czyste
   - `bun test` — istniejące testy `games` zielone
   - `cat apps/api/.env | grep BETTER_AUTH_SECRET` — sekret obecny
   - `ls apps/api/src/infrastructure/auth` — tylko `auth.ts`
   - `ls apps/api/src/infrastructure/db` — `auth-schema.ts`, `client.ts`, `schema.ts`, `seed.ts`

**Rezultat:** Faza 1 zamknięta. Backend ma skonfigurowany auth + schemat + migrację. Faza 2 mountuje handler i pisze middleware.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- `bunx @better-auth/cli generate` nie znajduje configa — sprawdź flagę `--config` (ścieżka relatywna od cwd, czyli z `apps/api`). Jeśli wciąż nie działa: spróbuj uruchomić z root projektu z `--config apps/api/src/infrastructure/auth/auth.ts --output apps/api/src/infrastructure/db/auth-schema.ts`.
- CLI generuje pusty plik / błąd "no schema fields found" — config better-auth NIE eksportuje `auth` przez `export const`. Upewnij się że `auth.ts` ma DOKŁADNIE `export const auth = betterAuth({...})`.
- Import `better-auth/adapters/drizzle` nie istnieje — masz starszą wersję better-auth (<1.0). Albo upgrade (`bun add --cwd apps/api better-auth@latest`), albo użyj `import { drizzleAdapter } from '@better-auth/drizzle-adapter'` (osobny pakiet, doinstaluj). Sprawdź wersję: `cat apps/api/package.json | grep better-auth`.
- `drizzle-kit generate` nie widzi `auth-schema.ts` — sprawdź `drizzle.config.ts`: `schema` MUSI być array (nie string). Zrestartuj komendę.
- `db:migrate` zwraca "table user already exists" — w bazie zostały śmieci z poprzedniej iteracji. SPRAWDŹ co jest w `apps/api/data/apex.db` (`sqlite3 apps/api/data/apex.db '.tables'`). Jeśli to dev/lokalne dane bez wartości — `rm apps/api/data/apex.db` i `bun run --cwd apps/api db:migrate` od nowa (regeneruje wszystkie tabele zgodnie z migracjami w `apps/api/drizzle/`). Jeśli są tam dane usera (gry, prawdziwe accounty): zapytaj userka, NIE usuwaj.
- TypeScript `Cannot find name 'process'` w `auth.ts` — dodaj `import 'node:process'` na górze albo upewnij się że `@types/node` jest w devDependencies (już jest w `apps/api/package.json`). Bun ma globalne `process`, więc to czysto TS issue.
- `BETTER_AUTH_SECRET is required` przy starcie — env nie jest ładowany. Bun automatycznie czyta `.env` z cwd uruchomienia (z `bun run --cwd apps/api dev` to `apps/api/.env`). Sprawdź ścieżkę pliku.
- `drizzleAdapter` w runtime mówi "Cannot find user table" — zapomniałeś podać schema do drizzle clienta. Otwórz `apps/api/src/infrastructure/db/client.ts`, dopisz `import * as schema from './schema'; import * as authSchema from './auth-schema';` i zmień `drizzle({ client: sqlite })` na `drizzle({ client: sqlite, schema: { ...schema, ...authSchema } })`. To wymagane przez `drizzleAdapter` better-auth — adapter używa relacji ze schematu. (Ten krok mogłeś przeoczyć — dodaj go do Step 2 jeśli typecheck/runtime zażąda.)
