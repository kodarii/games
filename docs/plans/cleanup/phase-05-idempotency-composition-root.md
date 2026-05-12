# Phase 05 — Idempotency-Key + composition root cleanup

## Goal
Dwie sprawy idące razem (oba dotyczą resiliency mutation paths):
1. **Idempotency-Key middleware** na 4 mutating endpoints: `POST /api/games`, `POST /api/upload/cover`, `POST /api/import`, `POST /api/games/:id/move-to-collection`. Flaky network + retry nie tworzy duplikatów.
2. **Composition root cleanup** — wyrzucić `new DrizzleGameRepository()` z 6 plików routes/tests; wszystko przez `wiring.ts`.

## Definition of Done
- [ ] Tabela `idempotency_keys (key TEXT, user_id TEXT, response_body TEXT, status INTEGER, created_at INTEGER, PRIMARY KEY(key, user_id))` + index po `created_at` dla TTL cleanup.
- [ ] Middleware `idempotencyKey()` w `apps/api/src/routes/middleware/idempotency-key.ts` — odczytuje header `Idempotency-Key`, sprawdza tabelę; jeśli istnieje (dla tego userId) → zwraca cached response; jeśli nie → woła `next()` i cache'uje response (status, body) przed wysłaniem.
- [ ] Middleware aktywny na: `POST /api/games`, `POST /api/upload/cover`, `POST /api/import`, `POST /api/games/:externalId/move-to-collection`.
- [ ] **Zero** wystąpień `new DrizzleGameRepository()` w `apps/api/src/routes/**` i `apps/api/src/routes/__tests__/**` (testy używają wiring lub fake).
- [ ] CleanupOrphans cron rozszerzony o czyszczenie wpisów `idempotency_keys` starszych niż 24h.
- [ ] Testy: integracyjny test idempotency (POST z tym samym kluczem 2× → drugi zwraca cached response, nie tworzy drugiej gry).
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**Format header:** `Idempotency-Key: <client-generated-uuid>`. Client musi wygenerować PRZED wysłaniem; przy retry — ten sam.
**TTL:** 24h (configurable przez `env.IDEMPOTENCY_TTL_HOURS`).
**Scope:** per `(user_id, key)` — różni użytkownicy mogą używać tego samego klucza.

### Step 0: Context7
- Hono: "middleware response capture", "c.res.clone()", "intercept response body".
- RFC: "Idempotency-Key header" (sprawdź draft IETF — jak walidować format).

### Relevant files (edit)
- `apps/api/src/infrastructure/db/schema.ts` — tabela `idempotency_keys`.
- `apps/api/src/routes/middleware/idempotency-key.ts` — NOWY middleware.
- `apps/api/src/routes/middleware/__tests__/idempotency-key.test.ts` — NOWY test.
- `apps/api/src/routes/games.ts` — `idempotencyKey()` na `POST /` i `POST /:externalId/move-to-collection`.
- `apps/api/src/routes/upload.ts` — `idempotencyKey()` na POST.
- `apps/api/src/routes/import.ts` — `idempotencyKey()` na POST.
- `apps/api/src/application/cover-storage/cleanup-orphans.ts` — rozszerz o `cleanupIdempotencyKeys(ttlHours)`.
- **6 plików composition-root fix:**
  - `apps/api/src/routes/genres.ts:10-14`
  - `apps/api/src/routes/developers.ts:10-14`
  - `apps/api/src/routes/platforms.ts:10-14`
  - `apps/api/src/routes/export.ts:7-9`
  - `apps/api/src/routes/import.ts:10-13`
  - `apps/api/src/routes/__tests__/games-metadata.int.test.ts:117`
- `apps/api/src/wiring.ts` — wyeksportuj wszystko czego potrzebują powyższe pliki: `deleteGenre`, `deletePlatform`, `deleteDeveloper`, gotowe use-case'y.
- `apps/client/src/lib/api.ts` — dodać generowanie `Idempotency-Key` przez `crypto.randomUUID()` w 4 mutations (CreateGame, UploadCover, ImportData, MoveToCollection).

### Files to read but NOT edit
- `apps/api/src/wiring.ts` (czytasz strukturę, ale też edytujesz — patrz wyżej).
- `apps/api/src/routes/_problem-json.ts` — format response cache.

## Design decisions
- **Cache odpowiedzi**: zapisać `status` + `body` (JSON string). Response headers NIE są cached (mogłoby cache'ować np. `set-cookie` — niebezpieczne).
- **Conflict policy**: jeśli ten sam klucz + inny body → 409 `idempotency_key_conflict`. Standard z Stripe. Wymaga zapisu hash'a request body przy pierwszym wywołaniu.
- **Scope per user**: `PRIMARY KEY (key, user_id)` — wymusza unique tylko w ramach usera.
- **Composition root**: każdy route importuje z `wiring.ts` przygotowane use-case'y, **nie** repo. Jeśli route potrzebuje czegoś czego nie ma w wiring → dodać do wiring.
- **Tests**: integracyjne testy używają realnego DB ale przez `wiring`. Unit testy use-case'ów używają fake-repo wstrzykiwanego ręcznie.
- **Validation `Idempotency-Key`**: regex `^[A-Za-z0-9_-]{16,128}$`. UUID v4 mieści się.

## Constraints
- NIE cache'uj responses 5xx — retry musi mieć szansę uderzyć ponownie.
- NIE cache'uj responses z `set-cookie` (auth) — dlatego idempotency-key NIE jest na `/api/auth/*`.
- NIE czyść `idempotency_keys` szybciej niż 24h — klient ma realnie do tygodnia na retry.

## Steps

### Step 1: Schema + middleware + test (RED→GREEN)
1. Dodaj tabelę `idempotency_keys` do `schema.ts`. Migracja.
2. Test (RED): `idempotency-key.test.ts` — mała app Hono z `app.post('/test', idempotencyKey(), c => c.json({ created: 1 }))`. Pierwszy POST → 200, drugi POST z tym samym kluczem → 200 z tym samym body (bez wywoływania handlera).
3. Implementacja middleware:
   - Czytaj `Idempotency-Key` header. Brak → `next()` bez cache'owania.
   - Walidacja regex; invalid → 400.
   - `SELECT * FROM idempotency_keys WHERE key=? AND user_id=?`. Jeśli row → zwróć cached.
   - Inaczej: `next()`, po `next()` zapisz `c.res.clone()` body + status (tylko jeśli 2xx).
4. `bun test` GREEN.

### Step 2: Wpięcie middleware w 4 endpointy + client-side UUID generation
1. `routes/games.ts`: `games.post('/', idempotencyKey(), handler)`. To samo `move-to-collection`.
2. `routes/upload.ts`, `routes/import.ts`: idem.
3. `apps/client/src/lib/api.ts`: `createGame`, `uploadCover`, `importData`, `moveToCollection` — dodać `'Idempotency-Key': crypto.randomUUID()`. Generuj klucz raz przed pierwszą próbą, retry używa tego samego klucza (jeśli używasz TanStack Query — opcja `retry` musi przekazać ten sam header, sprawdź pattern).
4. **Uwaga**: TanStack Query retry domyślnie wywołuje fetchFn ponownie. Aby zachować klucz: wygeneruj w mutationFn lub w `useMutation` opcjach.

### Step 3: Composition root cleanup
1. `wiring.ts`: dodać `deleteGenre`, `deletePlatform`, `deleteDeveloper` (use-case'y), `exportData`, `importData` jako gotowe instancje.
2. `routes/genres.ts`: zamień `new DrizzleGameRepository()` → `import { deleteGenre } from '../wiring'`. Idem `developers`, `platforms`, `export`, `import`.
3. Test integracyjny `games-metadata.int.test.ts:117` — zamiast `new EnrichGameMetadata(new DrizzleGameRepository())` użyj wiring lub stwórz factory test-only w `wiring.ts` (np. `makeEnrichGameMetadata(repo)` jeśli test potrzebuje fake repo).
4. Grep `new DrizzleGameRepository` w `apps/api/src/routes/**` → 0 wyników.

### Step 4: Cron cleanup idempotency keys
1. `CleanupOrphans.run()` rozszerz o `DELETE FROM idempotency_keys WHERE created_at < ?` (24h temu).
2. Logger event `idempotency.cleanup.done, deleted: <n>`.

**Rezultat:** wszystkie testy zielone, composition root jednolity, idempotency działa.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
