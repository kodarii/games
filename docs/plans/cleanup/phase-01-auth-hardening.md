# Phase 01 — Auth hardening (Better-Auth + CORS + rate-limit)

## Goal
Doprowadzić warstwę auth do stanu produkcyjnego: fail-fast na brakujący secret, env-driven `baseURL` / `trustedOrigins` / CORS origin, rate-limit na sign-in. Dzisiaj wszystko jest hardkodowane na localhost i bez fail-fast — pierwszy deploy = trywialnie podrabialne sesje.

## Definition of Done
- [ ] App rzuca błąd przy starcie jeśli `BETTER_AUTH_SECRET` jest pusty albo < 32 bajty.
- [ ] `baseURL`, `trustedOrigins` (auth) oraz CORS `origin` czytane są z env, nie hardkodowane.
- [ ] Rate-limit aktywny na `POST /api/auth/sign-in/email` (max 5 prób / 60s / IP).
- [ ] `bun test` zielone (w tym nowy test bootstrap-fail-fast).
- [ ] `bun run check` + `bun run lint` czyste.
- [ ] Manualnie: ustaw `BETTER_AUTH_SECRET=""` i uruchom `bun run --cwd apps/api dev` → proces wychodzi z kodem ≠ 0.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm). Test: `bun test`, typecheck: `bun run check`.
**Auth lib:** Better-Auth (`apps/api/src/infrastructure/auth/auth.ts`). Adapter: `drizzleAdapter(db, { provider: 'sqlite' })`.
**Config:** `apps/api/src/infrastructure/config/env.ts` (sprawdź jak są walidowane inne env vars — `UPLOADTHING_TOKEN`, `IGDB_CLIENT_ID` — wzoruj się na tym).

### Step 0: Context7
- Better-Auth: "rate limit plugin", "trustedOrigins production", "secret validation".
- Hono: "cors origin function dynamic" (jeśli potrzebujesz wieloorigin allowlist).

### Relevant files (edit)
- `apps/api/src/infrastructure/auth/auth.ts` — fail-fast secret + env-driven `baseURL` + `trustedOrigins` + rate-limit plugin.
- `apps/api/src/infrastructure/config/env.ts` — dodać `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN` (CSV → `string[]`).
- `apps/api/src/index.ts` — CORS `origin` z env zamiast literału `'http://localhost:5173'`. Usuń `'Authorization'` z `allowHeaders` (session-cookie auth tego nie potrzebuje).
- `apps/api/src/infrastructure/auth/__tests__/auth-bootstrap.test.ts` — NOWY: test fail-fast.
- `apps/api/.env.example` — dopisać nowe zmienne.

### Files to read but NOT edit
- `apps/api/src/infrastructure/config/env.ts` — wzorzec walidacji env (prawdopodobnie Zod).
- `apps/api/src/routes/middleware/require-auth.ts` — żeby zrozumieć kontrakt sesji.

## Design decisions
- **Fail-fast** w `auth.ts` przy module-load: jeśli `process.env.BETTER_AUTH_SECRET` undefined / `length < 32` → `throw new Error('BETTER_AUTH_SECRET must be set and >= 32 chars')`. Lepiej crash przy starcie niż trywialny session-forge w produkcji.
- **`CORS_ORIGIN`** jako CSV w env, parsowany do `string[]` w `env.ts`. W `index.ts` CORS dostaje function `(origin) => allowlist.includes(origin) ? origin : null`.
- **`trustedOrigins`** w Better-Auth = ten sam `string[]` co CORS allowlist.
- **Rate-limit** — Better-Auth ma wbudowany `rateLimit` w opcjach (sprawdź docs). Jeśli nie istnieje wbudowany — minimalna implementacja: middleware Hono na `/api/auth/sign-in/*` z in-memory Map<ip, count> z TTL (acceptable dla single-instance; przy multi-instance migrujemy do tabeli `rate_limits` w SQLite — odnotuj jako TODO).
- **Dev fallback**: w `env.ts` jeśli `NODE_ENV !== 'production'` można pozwolić na placeholder secret >= 32 znaki dla wygody dev. Ale CI musi mieć prawdziwy.

## Constraints
- NIE hardkoduj nowych env keys w dwóch miejscach — wszystkie env idą przez `env.ts` (single source of truth).
- NIE używaj `process.env.X` bezpośrednio poza `env.ts`.
- NIE usuwaj `autoSignIn: true` w tej fazie — to osobna decyzja produktowa (email verification flow).

## Steps

### Step 1: Rozszerz `env.ts` o nowe zmienne (RED→GREEN, ale głównie typy)
1. Dodaj do schematu Zod: `BETTER_AUTH_SECRET: z.string().min(32)`, `BETTER_AUTH_URL: z.string().url()`, `CORS_ORIGIN: z.string().min(1).transform(s => s.split(',').map(x => x.trim()))`.
2. `bun run check` musi przejść (po podaniu placeholder env w `.env.example`).
3. Wypisz `BETTER_AUTH_SECRET=` (32+ chars), `BETTER_AUTH_URL=http://localhost:3001`, `CORS_ORIGIN=http://localhost:5173` w `.env.example`.

**Rezultat:** `env.ts` eksportuje nowe pola typowo.

### Step 2: Test bootstrap fail-fast (RED)
Plik: `apps/api/src/infrastructure/auth/__tests__/auth-bootstrap.test.ts`.

Test:
```ts
import { describe, test, expect } from 'bun:test';

describe('auth bootstrap', () => {
  test('throws when BETTER_AUTH_SECRET is missing', () => {
    // Symuluj brak secret — re-import modułu z pustym env.
    // Bun: użyj `import.meta.require` z czystym module cache, lub
    // wystaw funkcję `validateAuthConfig(env)` z `auth.ts` i testuj ją bezpośrednio.
    expect(() => validateAuthConfig({ BETTER_AUTH_SECRET: '', ...rest })).toThrow();
  });
  test('throws when BETTER_AUTH_SECRET is shorter than 32 chars', () => { ... });
});
```

**Rezultat:** test RED bo funkcja jeszcze nie istnieje.

### Step 3: Implementacja fail-fast + env-driven + rate-limit (GREEN)
1. W `auth.ts`: ekstrahuj `validateAuthConfig(env)` rzucające przy invalid input. Wywołaj na top-level przed `betterAuth({})`.
2. `baseURL: env.BETTER_AUTH_URL`, `trustedOrigins: env.CORS_ORIGIN`.
3. W `index.ts`: `cors({ origin: (o) => env.CORS_ORIGIN.includes(o) ? o : null, ... })`. Usuń `'Authorization'` z `allowHeaders`.
4. Dodaj Better-Auth rate-limit (jeśli wspierany w wersji w `package.json` — sprawdź przez Context7). Fallback: Hono middleware na `/api/auth/sign-in/email`.
5. `bun test` → GREEN. `bun run check` → 0 errors.

**Rezultat:** wszystkie testy zielone, manualny test fail-fast (Step DoD) potwierdzony.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
