# Phase 02 — Structured logging + correlation IDs

## Goal
Wprowadzić jeden moduł `logger` z structured JSON output + middleware propagujący `requestId` i `userId` przez `Hono Context`. Wyeliminować wszystkie 15 punktów z `console.log/warn/error` na rzecz `logger.event(...)`.

## Definition of Done
- [ ] Istnieje `apps/api/src/infrastructure/logging/logger.ts` z funkcją `createLogger()` i typem `Logger`.
- [ ] Middleware `requestContext()` (Hono) generuje UUID na request, ustawia `c.set('logger', baseLogger.child({ requestId, userId }))`.
- [ ] **Zero** wystąpień `console.log/warn/error` w `apps/api/src/**` poza `index.ts` (banner startowy) i `logger.ts` (sam logger).
- [ ] Test integracyjny: 1 request → log zawiera `requestId`; 2 requesty z różnymi userami → różne `userId` w logach.
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**Runtime:** Bun. **Stack:** Hono ma `c.set(key, value)` + `c.get(key)`. Bun ma natywny szybki JSON; pino działa, ale **pino-pretty** jest opcjonalny.
**Format:** JSON-line — jeden obiekt na linię. Pola obowiązkowe: `level`, `event`, `time`, `requestId` (jeśli w request scope). Opcjonalne: `userId`, `durationMs`, dowolny domain payload.

### Step 0: Context7
- Pino: "child logger", "bun runtime support", "transports".
- Hono: "context variables typed", "middleware order", "request id middleware".

### Relevant files (edit)
- `apps/api/src/infrastructure/logging/logger.ts` — NOWY. Eksportuje `baseLogger` (pino lub własny minimal wrapper) + typ `Logger`.
- `apps/api/src/infrastructure/logging/request-context-middleware.ts` — NOWY. Middleware Hono.
- `apps/api/src/infrastructure/logging/__tests__/request-context.test.ts` — NOWY. Test propagacji `requestId/userId`.
- `apps/api/src/index.ts` — załóż `app.use('*', requestContext())` ZARAZ po `attachProblemJsonErrorHandler`. Usuń `app.use('*', logger())` z `hono/logger` (zastąpi nasz middleware z dodatkową obsługą duration).
- **15 plików z `console.*` do zamiany** — patrz lista poniżej.
- `apps/api/src/routes/middleware/require-auth.ts` — po ustawieniu sesji wzbogać logger w `userId`: `c.set('logger', c.get('logger').child({ userId: session.user.id }))`.

### Files to read but NOT edit
- `apps/api/src/routes/_problem-json.ts` — `attachProblemJsonErrorHandler` woła `console.error('[unhandled]', err)` (linia 56). To **JEDYNE** miejsce, gdzie sam handler błędów zostanie ZASTĄPIONY w tej fazie (przekaże logger z context).

### Lista plików z `console.*` do zastąpienia
Grep: `apps/api/src -r 'console\\.' --include='*.ts'`. Spodziewane wyniki (zweryfikuj!):
- `routes/games.ts:115-126, 173-180, 191-199` — events `games.list`, `games.metadata.enrich.*`.
- `routes/games-metadata.ts:20` — `igdb.search.request`.
- `application/games/search-game-metadata.ts:101-107` — `igdb.search.stale_served`.
- `infrastructure/metadata/caching-game-metadata-provider.ts:118-124` — cache events.
- `wiring.ts:60-67` — `igdb.breaker.open/close` (przesuń do logger; jeśli wiring nie ma dostępu do request-scoped logger — użyj `baseLogger`).
- `index.ts:80, 84` — `cleanup-orphans` events. **Zostawić** (process-level, nie request-scoped) ale przez `baseLogger`.
- `routes/_problem-json.ts:56` — `[unhandled]` → `logger.error({ event: 'http.unhandled', err })`.

## Design decisions
- **Single logger module**, dwie ścieżki: `baseLogger` (process-level — wiring, cron, bootstrap) i request-scoped logger (przez `c.get('logger')`).
- **`logger.event(name, fields)`** — preferowane API zamiast `logger.info({ event: 'x' })`, krótsze call sites.
- **Levels**: `debug`, `info`, `warn`, `error`. Default w produkcji: `info`. Configurable przez `env.LOG_LEVEL`.
- **PII**: NIE loguj `search` queries raw — albo redaguj > 100 znaków, albo loguj `searchLength`. `email`, `password`, tokeny — NIGDY.
- **Pino vs własny wrapper**: jeśli pino działa pod Bun bez problemu (Context7) — używamy pino. Jeśli są issues — minimalny wrapper (~30 linii) z `console.log(JSON.stringify({...}))` ale przez **jedną** funkcję (łatwo wymienić).

## Constraints
- NIE używaj `console.*` w nowym kodzie poza `logger.ts` i `index.ts` banner startowym.
- NIE loguj całych obiektów `c.req` / `Headers` (PII risk + spore objętości). Loguj wybrane pola.
- NIE wstrzykuj loggera przez moduł-singleton w komponentach request-scoped — zawsze przez `c.get('logger')`.

## Steps

### Step 1: Logger module + base logger
1. Zainstaluj `pino` (`bun add pino`) jeśli Context7 potwierdza Bun-compat. Inaczej: własny wrapper.
2. `logger.ts`: eksport `baseLogger`, typ `Logger`, helper `logger.event(name: string, fields: object)`.
3. Czytaj level z `env.LOG_LEVEL` (dodaj do `env.ts`: `LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info')`).

**Rezultat:** `import { baseLogger } from './infrastructure/logging/logger'` działa.

### Step 2: Request-context middleware + test (RED→GREEN)
1. Test pierwszy (RED): `request-context.test.ts` z mockiem `baseLogger` (spy na `child()`) — sprawdza że middleware wywołał `child({ requestId: uuid })`.
2. Implementacja middleware: generuje `crypto.randomUUID()`, `c.set('logger', baseLogger.child({ requestId }))`, `c.set('requestId', uuid)`. Po `next()` loguje `event: 'http.request', method, path, status, durationMs`.
3. Wpięcie w `index.ts`, usunięcie `hono/logger`.
4. `requireAuth`: po `c.set('session', ...)` dodać `c.set('logger', c.get('logger').child({ userId: session.user.id }))`.
5. **Typy**: rozszerzyć `AuthVariables` o `logger: Logger` i `requestId: string`.

**Rezultat:** test GREEN. Manualnie: jeden `curl` → log linia z `requestId`.

### Step 3: Zamień 15 punktów `console.*` na `logger.event`
Dla każdego call-site:
- W route handler / use-case wstrzykiwanym przez wiring → użyj `c.get('logger')`.
- W use-case BEZ dostępu do `Hono Context` (np. `search-game-metadata.ts`, `caching-game-metadata-provider.ts`) → dodaj parametr `logger: Logger` do konstruktora (wiring przekazuje `baseLogger`, route handler nadpisuje request-scoped logger).
- W cron (`index.ts:80,84`) → `baseLogger.event(...)`.
- W `_problem-json.ts:56` → `c.get('logger').error({ event: 'http.unhandled', err: serializeError(err) })`.

**Rezultat:** `grep -r 'console\\.' apps/api/src --include='*.ts' | grep -v 'logger.ts\\|index.ts'` zwraca 0 wyników. Wszystkie testy zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
