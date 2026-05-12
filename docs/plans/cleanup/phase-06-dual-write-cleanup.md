# Phase 06 — Dual-write cleanup + enrich snapshot validation

## Goal
Dwie sprawy data-integrity:
1. **Usunąć fire-and-forget `coverStorage.delete()`** z use-case'ów `UpdateGame` i `DeleteGame`. Polegaj wyłącznie na cron-cleanup (z fazy 04, cron już biega co 1h). Każdy `void .catch()` po commicie = sierota przy SIGTERM między commit a delete.
2. **Walidacja enrich snapshot** przeciw `metadata_cache` — dzisiaj złośliwy klient może PATCH dowolny `developer/releaseYear/coverImageUrl` udając, że to z IGDB. Backend ufa snapshotowi → fałszywa proweniencja `metadataProvider: 'igdb'` w DB.

## Definition of Done
- [ ] `UpdateGame.execute` (`apps/api/src/application/games/update-game.ts:158-164`) — usunięte `void this.coverStorage.delete(oldUrl).catch(...)`. Konstruktor nie przyjmuje `coverStorage` (jeśli był wstrzykiwany tylko po to).
- [ ] `DeleteGame.execute` (`apps/api/src/application/games/delete-game.ts:19-23`) — usunięte fire-and-forget. Konstruktor nie przyjmuje `coverStorage`.
- [ ] `CleanupOrphans.run()` rozszerzony: skanuje `games.cover_image` jako allowlist znanych URL-i; lista `coverStorage.listOlderThan(1h)` minus allowlist = orphans do usunięcia.
- [ ] `EnrichGameMetadata.execute` (`apps/api/src/application/games/enrich-game-metadata.ts:52`) — przed `applyMetadata` woła `metadataCacheRepository.get(providerName, providerId)`; porównuje pola snapshot (`title`, `developer`, `releaseYear`, `genre`, `coverImageUrl`) z cache; mismatch → return `err({ kind: 'snapshot_mismatch' })`.
- [ ] Route handler `PATCH /games/:id/metadata` mapuje `snapshot_mismatch` → 400 problem+json `type: 'snapshot-stale'`.
- [ ] Test: `delete-game` nie wywołuje `coverStorage` (mock + spy → 0 calls).
- [ ] Test: `enrich-game-metadata` z snapshotem mismatch → err.
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**Cron**: po Fazie 04 cron biega co 1h z distributed lockiem. Powiększenie scope orphan-detection o cover_image z fresh-updates nie wymaga dodatkowej infrastruktury.
**Cache repo**: `apps/api/src/infrastructure/metadata/metadata-cache-repository.ts` ma już `get(providerName, providerId)` (sprawdź sygnaturę — może `find`).
**Snapshot kontrakt**: definiowany w `apps/api/src/application/games/enrich-game-metadata.ts:10` jako Zod schema. To pola które klient wysyła.

### Step 0: Context7
- (Niewielka potrzeba) — to refaktor + walidacja, bez nowych libów.

### Relevant files (edit)
- `apps/api/src/application/games/update-game.ts` — usuń `coverStorage` z konstruktora (jeśli używany tylko do delete) i call site'u.
- `apps/api/src/application/games/delete-game.ts` — j.w.
- `apps/api/src/application/games/enrich-game-metadata.ts` — dodaj walidację snapshot.
- `apps/api/src/application/games/__tests__/update-game.test.ts` — test bez `coverStorage`.
- `apps/api/src/application/games/__tests__/delete-game.test.ts` — j.w.
- `apps/api/src/application/games/__tests__/enrich-game-metadata.snapshot.test.ts` — NOWY.
- `apps/api/src/application/cover-storage/cleanup-orphans.ts` — rozszerz `run()` o known-URLs z `gameRepository.findAllCoverImages()` (już istnieje).
- `apps/api/src/wiring.ts` — usuń `coverStorage` z konstruktora `UpdateGame` i `DeleteGame`. Dodaj `metadataCacheRepository` do `enrichGameMetadata` konstruktora.
- `apps/api/src/routes/games.ts` — handler PATCH dodaje case `snapshot_mismatch`.
- `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts:32-40` — usuń wewnętrzny `try/catch` w `delete()`. Niech rzuca błąd — cron go obsłuży (loguj failed cleanup, retry następną iterację).

### Files to read but NOT edit
- `apps/api/src/infrastructure/metadata/metadata-cache-repository.ts` — sygnatura `get/find`.
- `apps/api/src/domain/games/game.ts` — żeby zrozumieć `applyMetadata` (Game ma metodę aplikującą snapshot do agregatu).

## Design decisions
- **`coverStorage` przestaje być cross-cutting** w use-case'ach mutacji. Pozostaje TYLKO w:
  - `UploadCover` route (write path) — wciąż używa coverStorage.upload.
  - `CleanupOrphans` cron — write path delete.
- **Cron pattern**:
  ```
  knownUrls = await gameRepo.findAllCoverImages();           // wszystkie URL-e z DB
  candidates = await storage.listOlderThan(1);                // wszystkie pliki > 1h (świeże zostawiamy)
  orphans = candidates.filter(url => !knownUrls.has(url));
  for (const orphan of orphans) await storage.delete(orphan);
  ```
  `1h` window zostawia świeżo-uploadowane pliki w spokoju (race: user uploaduje cover, ale jeszcze nie zatwierdził formularza — plik nie jest w DB, ale powinien zostać).
- **Snapshot walidacja**: porównuje **dokładnie** pola fingerprint:
  - `title`, `developer`, `releaseYear`, `genre`, `coverImageUrl`.
  - `summary` ignorowany (długi, mogą być formatting differences).
  - Mismatch któregokolwiek → reject.
- **Jeśli cache nie ma wpisu** (TTL expired): backend musi wykonać świeży lookup do IGDB. Łatwiej: zwróć `err({ kind: 'cache_miss' })` → klient wywołuje `GET /api/games/metadata/candidates` ponownie, dostaje świeży cache, retry PATCH.

## Constraints
- NIE pisz nowego kodu z `void promise.catch()` — albo `await`, albo cron-only path.
- NIE używaj `try/catch` w warstwie adaptera storage do uciszania błędów. Niech rzuca — wyższa warstwa decyduje.
- NIE komparuj `summary` w snapshot walidacji (false positives).

## Steps

### Step 1: Usuń fire-and-forget z UpdateGame + DeleteGame
1. `delete-game.ts`: usuń `try/catch + this.coverStorage.delete(...)`. Konstruktor: usuń `coverStorage` jeśli był tylko po to.
2. `update-game.ts`: usuń linie 158-164. Konstruktor: j.w.
3. `wiring.ts`: usuń `coverStorage` z `new UpdateGame(...)` i `new DeleteGame(...)`.
4. Test `delete-game.test.ts`: mock fake repo, spy na coverStorage (powinno być 0 calls). RED jeśli test sprawdza `coverStorage.delete` był wywołany.
5. Adapter `uploadthing-cover-storage.ts`: usuń wewnętrzny `try/catch` w `delete()`.

**Rezultat:** use-case'y mutacji nie wiedzą o storage. Testy zielone.

### Step 2: Rozszerz CleanupOrphans
1. `cleanup-orphans.ts`: w `run()` po `listOlderThan` zrób Set z `findAllCoverImages()`, filter out, loguj counts.
2. Loguj `event: 'cleanup-orphans.done', candidates: N, known: M, orphans: K, deleted: K`.
3. Test (jeśli jeszcze nie ma): scenariusz "1 plik w DB + 1 plik orphan w storage → cron usuwa orphan, nie DB-owy".

**Rezultat:** cron jest jedyną drogą cleanup.

### Step 3: Snapshot validation w EnrichGameMetadata + test
1. Test (RED): `enrich-game-metadata.snapshot.test.ts`:
   - Cache ma snapshot `{ title: 'Real Title', developer: 'Real Dev', ... }`.
   - Klient wysyła PATCH ze snapshotem `{ title: 'Fake Title', ... }`.
   - Oczekiwany rezultat: `err({ kind: 'snapshot_mismatch' })`.
2. Implementacja w `EnrichGameMetadata.execute`:
   - Po `findByExternalId`, przed `applyMetadata`, czytaj `metadataCacheRepository.get(providerName, providerId)`.
   - Jeśli cache miss → `err({ kind: 'cache_miss' })`.
   - Porównaj pola fingerprint. Mismatch → `err({ kind: 'snapshot_mismatch' })`.
3. Route handler `PATCH /games/:id/metadata`:
   - `case 'snapshot_mismatch'` → `problemJson(c, 400, { type: 'snapshot-stale', ... })`.
   - `case 'cache_miss'` → `problemJson(c, 409, { type: 'cache-miss', detail: 'Refresh metadata candidates and retry' })`.
4. Dodaj `metadataCacheRepository` do konstruktora `EnrichGameMetadata` w `wiring.ts`.

**Rezultat:** klient nie może już sfabrykować `metadataProvider: 'igdb'`.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
