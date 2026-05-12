# Phase 04 — Graceful shutdown + `/health/ready` + SQLite advisory lock dla crona

## Goal
Deploy nie traci in-flight requestów; healthcheck wykrywa DB down; cron `CleanupOrphans` nie odpala się równocześnie z drugiej instancji.

## Definition of Done
- [ ] `apps/api/src/index.ts` używa `Bun.serve` z explicit `server` referencją; SIGTERM/SIGINT wywołują `server.stop({ closeActiveConnections: false })` + 25s timeout na draining + DB close + `clearInterval(cron)`.
- [ ] Endpoint `GET /health/live` (zawsze 200) + `GET /health/ready` (200 jeśli DB query `SELECT 1` zwraca, 503 wpp).
- [ ] Tabela `cron_locks` (SQLite) + `CleanupOrphans` próbuje wziąć lock przed startem, zwalnia po końcu.
- [ ] Cron interval skrócony z `ONE_DAY_MS` do `ONE_HOUR_MS` (lock zapewnia że konkurujące instances nie deszyfrują równolegle).
- [ ] Test integracyjny: `/health/ready` zwraca 503 po wymuszeniu DB error (mock).
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**Runtime:** Bun. `Bun.serve()` API ma natywną metodę `server.stop()`. Sprawdź Context7 dla idiomu drain.
**DB:** SQLite (`drizzle-orm/bun-sqlite`). Connection close: `db.$client.close()` (sprawdź dokładnie w docs).
**Cron:** dziś `setInterval` w `index.ts:79`. Zostaje `setInterval`, ale każda iteracja próbuje wziąć distributed lock z SQLite.

### Step 0: Context7
- Bun: "Bun.serve graceful shutdown", "server.stop closeActiveConnections".
- Drizzle: "bun-sqlite close connection".
- SQLite: "advisory lock pattern", "UPSERT with WHERE clause" (lock TTL pattern).

### Relevant files (edit)
- `apps/api/src/index.ts` — `Bun.serve` zamiast `export default { port, fetch }`, graceful shutdown sequence, `/health/live` + `/health/ready`, cron z lockiem.
- `apps/api/src/infrastructure/db/schema.ts` — tabela `cron_locks (name TEXT PRIMARY KEY, locked_until INTEGER NOT NULL, owner TEXT NOT NULL)`.
- `apps/api/src/infrastructure/cron/cron-lock.ts` — NOWY. Klasa `CronLock` z `tryAcquire(name, ttlMs)` i `release(name, owner)`.
- `apps/api/src/infrastructure/cron/__tests__/cron-lock.test.ts` — NOWY. Test: drugi `tryAcquire` zwraca `false` jeśli pierwszy trzyma; po TTL drugi może wziąć.
- `apps/api/src/application/cover-storage/cleanup-orphans.ts` — wstrzyknij `CronLock`, owinięcie `run()` w `try { acquire } finally { release }`.
- `apps/api/src/routes/health.ts` — NOWY. `health.get('/live', ...)`, `health.get('/ready', ...)`.

### Files to read but NOT edit
- `apps/api/src/infrastructure/db/client.ts` — żeby zrozumieć jak `db` jest eksportowane.
- `apps/api/src/wiring.ts` — composition root (cron-lock i cleanup dodaj tutaj).

## Design decisions
- **Drain window**: 25s (k8s SIGKILL po 30s domyślnie). Konfigurowalne przez `env.SHUTDOWN_DRAIN_MS`.
- **`/health/live`**: zwraca 200 dopóki proces żyje. Używane przez k8s livenessProbe.
- **`/health/ready`**: SELECT 1 do DB + opcjonalnie sprawdzenie `igdbConfigured` + `coverStorageAvailable`. Zwraca 503 jeśli DB error. Używane przez k8s readinessProbe.
- **Cron lock TTL**: 2× expected runtime crona. Cron skrócony do 1h → TTL = 2h. Owner = `os.hostname() + '-' + process.pid + '-' + crypto.randomUUID().slice(0,8)`.
- **Lock pattern** (SQLite):
  ```sql
  INSERT INTO cron_locks (name, locked_until, owner) VALUES (?, ?, ?)
  ON CONFLICT(name) DO UPDATE SET locked_until = excluded.locked_until, owner = excluded.owner
    WHERE locked_until < unixepoch();
  ```
  Po insercie: `SELECT owner FROM cron_locks WHERE name = ?`. Jeśli zwrócony owner === mój owner → mam lock. Wpp ktoś inny.
- **Cron interval**: 1h. Jeśli horizontal scale (2 instancje), tylko jedna wykona run-a; druga zalogi `cleanup-orphans.skipped, reason: 'lock_held'`.

## Constraints
- NIE polegaj na `node:cluster` ani `worker_threads` — Bun ma własne idiomy.
- NIE używaj `process.exit(0)` przed zakończeniem draining (drain musi czekać na in-flight).
- NIE blokuj `/health/ready` długim query — `SELECT 1` musi być natychmiastowe.

## Steps

### Step 1: `Bun.serve` + graceful shutdown
1. Zamień `export default { port, fetch }` na:
   ```ts
   const server = Bun.serve({ port, fetch: app.fetch });
   ```
2. Stwórz `async function shutdown(signal: string)`:
   - Loguj `event: 'shutdown.start', signal`.
   - `clearInterval(cleanupTimer)`.
   - `await server.stop({ closeActiveConnections: false })` (czeka na drain).
   - Race z timeout 25s: jeśli drain nie skończony — force close.
   - Zamknij DB: `db.$client.close()`.
   - Loguj `event: 'shutdown.done'`.
   - `process.exit(0)`.
3. `process.on('SIGTERM', () => shutdown('SIGTERM'))`, to samo `SIGINT`.

**Rezultat:** manualnie: `kill -TERM <pid>` w trakcie aktywnego request — request kończy się normalnie, potem proces wychodzi.

### Step 2: Health endpoints
1. `apps/api/src/routes/health.ts`: dwa endpointy. Zarejestruj w `index.ts` PRZED `cors` (health nie potrzebuje CORS).
2. `/health/ready` wstrzyknij funkcję `checkDb` (closure nad `db`). W produkcji zwraca `{ status: 'ready', checks: { db: 'ok' } }`. Przy błędzie DB: 503 + `{ status: 'not_ready', checks: { db: 'error', error: msg } }`.
3. Usuń stary `/api/health` z `index.ts:38` (zastępujemy `/health/live`).

**Rezultat:** `curl localhost:3001/health/ready` → 200; po wyłączeniu DB → 503.

### Step 3: CronLock + integracja z CleanupOrphans + test
1. Test (RED): `cron-lock.test.ts` — używa in-memory SQLite (bun-sqlite ma `new Database(':memory:')`), dwa `tryAcquire('test', 1000)` z różnych ownerów → drugi zwraca `false`. Po 1.1s drugi zwraca `true`.
2. Implementacja `CronLock` z UPSERT-z-WHERE patternem.
3. Migracja: tabela `cron_locks` (`bunx drizzle-kit generate`).
4. `CleanupOrphans.run()` na start: `if (!await this.lock.tryAcquire('cleanup-orphans', 2 * 60 * 60 * 1000)) { logger.info({ event: 'cleanup-orphans.skipped', reason: 'lock_held' }); return; }`. Po końcu (`finally`): `await this.lock.release('cleanup-orphans', this.owner)`.
5. W `index.ts` skróć `ONE_DAY_MS` → `60 * 60 * 1000` (1h).

**Rezultat:** test GREEN. Manualnie: drugie uruchomienie `cleanup` w obrębie tej samej godziny → log "skipped".

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
