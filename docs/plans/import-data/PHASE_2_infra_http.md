---
name: Import Data Phase 2 — Infrastructure + HTTP
description: DrizzleImportRepository z db.transaction (upsert dla merge, wipe+insert dla replace) + route POST /api/import z bodyLimit + mapowaniem błędów
type: plan
---

# Import Data — Faza 2: Infrastructure + HTTP

## Goal
Podłączyć port `ImportRepository` (z fazy 1) do prawdziwej bazy przez Drizzle —
w jednej transakcji, upsert per `externalId` dla `merge`, wipe+insert dla
`replace`. Wystawić endpoint `POST /api/import` (auth required) który przyjmuje
JSON body, woła use case, mapuje błędy na statusy HTTP.

## Definition of Done
- [ ] `DrizzleImportRepository implements ImportRepository` w `apps/api/src/infrastructure/import/drizzle-import-repository.ts`
- [ ] `apply(userId, plan, mode)` cała w `db.transaction(async (tx) => { ... })` — albo wszystko, albo nic
- [ ] Tryb `merge`: dla każdej `NewPlatform` w plan robi `findByExternalId` w tx; jeśli istnieje → UPDATE name (jeśli się zmienił); jeśli nie → INSERT. To samo dla `NewGame`. Raport zlicza `created` i `updated` osobno.
- [ ] Tryb `replace`: w tx kasuje `WHERE user_id = ?` z `games` i `platforms`, potem INSERT wszystkich rekordów z plan. Raport zawiera `deleted` (przed-import-count) oraz `created` (= length plan.\*).
- [ ] Endpoint `POST /api/import` przyjmuje `Content-Type: application/json` z body `{ mode: 'merge' | 'replace', snapshot: <pełny obiekt z pliku> }`
- [ ] Body limit 5MB — Hono `bodyLimit` middleware na `/api/import`. Przekroczenie → 413
- [ ] Auth required — middleware `requireAuth` zarejestrowany na `/api/import/*`. Brak sesji → 401
- [ ] Mapowanie błędów (HTTP status):
  - `invalid_json`, `invalid_shape`, `unsupported_version`, `duplicate_external_id`, `duplicate_platform_name`, `unknown_platform`, `domain_error` → **400**
  - body za duże → **413**
  - brak auth → **401**
  - inne (rzut z repo, bazy) → **500** (Hono default)
- [ ] Smoke test: eksport → modyfikacja UI → import w trybie merge → eksport ponowny → diff = pole które user zmienił w UI zostało nadpisane wartością z importu (powrót do stanu pre-zmiana)
- [ ] Smoke test idempotency: import tego samego pliku 2x → ten sam stan końcowy (drugi import: same `updated`, zero `created`)
- [ ] Smoke test replace: zaimportuj plik z 1 grą i 1 platformą do konta które ma 5 gier i 3 platformy → po imporcie konto ma DOKŁADNIE 1 grę i 1 platformę
- [ ] `bun test` (cały api) → zielone
- [ ] `bun run typecheck` → 0 błędów

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun.
**Katalog roboczy:** `apps/api`.
**Drizzle SQLite tx:** `db.transaction(async (tx) => { ... })`. `tx` ma to samo API co `db` (select/insert/update/delete). Upewnij się że WSZYSTKIE zapytania wewnątrz callback używają `tx`, NIE `db` — inaczej operacja wycieka poza tx.
**Dependency:** Faza 1 import (use case + port) ZAKOŃCZONA.

## Design decisions

### `DrizzleImportRepository` — jeden plik, dwie strategie
- **Nie** rozbijamy na osobne klasy `MergeStrategy` / `ReplaceStrategy` — zbędna abstrakcja, dwie metody w jednej klasie wystarczą.
- W `apply` switch po `mode` → `applyMerge` lub `applyReplace`. Obie wewnątrz `db.transaction`.

### Merge — szczegóły
- Dla **platform** wystarczy upsert po `externalId`: jeśli nazwa jest inna w pliku niż w bazie → UPDATE, w przeciwnym razie no-op (ale nadal liczymy jako "skipped/no-change"). Dla raportu trzymamy: `created` (nowe wstawienia), `updated` (zmiana nazwy). Jeśli po prostu istniał i nazwa się nie zmieniła — NIE liczymy jako updated. Próg granularności: nawet jeśli to chwila — bardziej informatywny raport jest wart 5 linii kodu.
- Dla **gier** upsert po `externalId`: jeśli istnieje → UPDATE wszystkich pól (`title`, `developer`, `genre`, `releaseYear`, `platform`, `edition`, `hoursPlayed`, `status`, `format`, `coverColor`). Jeśli nie istnieje → INSERT.
- **`{...old, ...new}` semantyka:** ponieważ `NewGame` w plan zawiera **wszystkie** pola wymagane (eksport zawsze emituje pełny rekord), update jest pełnym overwrite'em. Pola opcjonalne (`edition`, `coverColor`): jeśli `NewGame.edition === undefined` → kolumna ustawiana na `NULL`. Jeśli `NewGame.edition === 'Deluxe'` → ustawiana na `'Deluxe'`. To poprawne — pole NIEOBECNE w pliku oryginalnym (`undefined`) miało być NULL w bazie (eksport pomija takie pola → undefined → null). Pole OBECNE w pliku → string → string. Symetria.
- **Foreign-key chain:** `games.platform` to `text` BEZ formalnego FK, ale logika importu zakłada pokrycie nazw. Order operacji w tx **MUSI** być: najpierw upsert platforms, potem upsert/insert games — jeśli gra używa świeżo-importowanej platformy, nazwa już musi być w bazie (do późniejszych queries; tu jednak nazwa platformy w grze to text, więc operacja insert się powiedzie i bez tego — ale order mamy jako dobry obyczaj, plus FK dodamy w przyszłości i wtedy się przyda).

### Replace — szczegóły
- Order operacji w tx:
  1. `SELECT count(*) FROM games WHERE user_id = ?` i tak samo dla platforms — żeby dać cyfrę `deleted` w raporcie.
  2. `DELETE FROM games WHERE user_id = ?` (najpierw games — gdyby kiedyś dodać FK games.platform → platforms, ten order nie złamie więzów).
  3. `DELETE FROM platforms WHERE user_id = ?`.
  4. INSERT all `plan.platforms`.
  5. INSERT all `plan.games`.
- Wszystko w tx — jeśli którakolwiek operacja rzuci, rollback. User dostaje 500 z czystą bazą sprzed importu.
- Pusty plik = legalny replace (kasuje wszystko, importuje 0). UI ostrzega — backend nie blokuje.

### Format body endpointu
- `Content-Type: application/json`. Body:
  ```json
  {
    "mode": "merge",
    "snapshot": { "version": 2, "exportedAt": "...", "platforms": [...], "games": [...] }
  }
  ```
- Wybór: nie multipart. Plik to JSON, frontend i tak go czyta jako tekst. Cały snapshot wewnątrz `snapshot` jako obiekt (NIE string) — Hono parsuje raz, my po stronie API musimy dać `JSON.stringify(snapshot)` żeby wstrzyknąć w `parseImport` (które przyjmuje rawJson). To trochę kosztowne (re-stringify), ale upraszcza kontrakt o rząd wielkości i obsługa błędów (`invalid_json`) staje się niemożliwa na poziomie use case — co i tak jest OK, bo Hono sam zwraca 400 jeśli body to nie JSON. Jeśli chcesz uniknąć re-stringify: alternatywnie zrób `parseImport` polimorficzny (przyjmuje string LUB unknown). **Decyzja: re-stringify**. Prościej, korzyść to zachowanie tej samej walidacji w application bez bypassu.

### Body limit
- Hono export `bodyLimit` middleware z `hono/body-limit`. 5MB. Tylko na route `/api/import` (NIE globalnie — `/api/games` etc. nie potrzebują).
- Przekroczenie → 413 z body `{ error: 'payload_too_large' }`.

## Step 0: Pobierz dokumentację (Context7)
- `drizzle-orm`: "transaction bun-sqlite", "delete where user_id"
- `hono`: "bodyLimit middleware", "c.req.json type narrow"

## Relevant files (edit only these)
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts` — NOWY
- `apps/api/src/routes/import.ts` — NOWY
- `apps/api/src/index.ts` — zarejestruj middleware + route

## Files to read but NOT edit
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — wzorzec mapowania
- `apps/api/src/infrastructure/db/client.ts` — `db` instance
- `apps/api/src/routes/games.ts` — wzorzec route z DI + auth user
- `apps/api/src/routes/middleware/require-auth.ts` — `AuthVariables`
- `apps/api/src/application/import/import-data.ts` — use case z fazy 1

## Constraints
- WSZYSTKIE zapytania wewnątrz `db.transaction(async (tx) => {...})` używają **tx**, nie `db`. Łatwo przeoczyć przy copy-paste.
- NIE rób `try/catch` w route handlerze żeby zamiatać błędy. Hono default loguje. Zwracaj `Result` z use case → switch po error kind → status.
- NIE waliduj body ręcznie zod-em w route — `parseImport` w use case to robi (re-walidacja). Jedyne co route waliduje: `mode in ['merge', 'replace']` (bo to nie jest część snapshotu). Dla pewności użyj małej Zod schemy:
  ```ts
  const BodySchema = z.object({ mode: z.enum(['merge', 'replace']), snapshot: z.unknown() });
  ```
- NIE puszczaj `mode` z query param. Tylko z body.
- NIE używaj `c.json()` przed ustawieniem statusu — `c.json(payload, status)` w jednym wywołaniu.
- Filename pobranego eksportu (`apex-export-DATE.json`) NIE ma znaczenia dla importu — frontend wysyła zawartość, nie nazwę.

## Steps

### Step 1: `DrizzleImportRepository` — szkielet + tryb merge
**Co robimy:**
1. Utwórz `apps/api/src/infrastructure/import/drizzle-import-repository.ts`:
   ```ts
   import { and, eq, sql } from 'drizzle-orm';
   import type { ImportMode, ImportReport } from '@apex/shared';
   import type { ImportPlan, ImportRepository } from '../../domain/import/import-repository';
   import { db } from '../db/client';
   import { games as gamesTable, platforms as platformsTable } from '../db/schema';

   export class DrizzleImportRepository implements ImportRepository {
     async apply(userId: string, plan: ImportPlan, mode: ImportMode): Promise<ImportReport> {
       if (mode === 'merge') return this.applyMerge(userId, plan);
       return this.applyReplace(userId, plan);
     }

     private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
       return db.transaction(async (tx) => {
         let pCreated = 0, pUpdated = 0;
         for (const np of plan.platforms) {
           const [existing] = await tx
             .select()
             .from(platformsTable)
             .where(and(eq(platformsTable.userId, userId), eq(platformsTable.externalId, np.externalId)))
             .limit(1);
           if (!existing) {
             await tx.insert(platformsTable).values({ userId, externalId: np.externalId, name: np.name });
             pCreated++;
           } else if (existing.name !== np.name) {
             await tx.update(platformsTable).set({ name: np.name }).where(eq(platformsTable.id, existing.id));
             pUpdated++;
           }
         }
         let gCreated = 0, gUpdated = 0;
         for (const ng of plan.games) {
           const [existing] = await tx
             .select()
             .from(gamesTable)
             .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, ng.externalId)))
             .limit(1);
           const values = {
             title: ng.title,
             developer: ng.developer,
             genre: ng.genre,
             releaseYear: ng.releaseYear.value,
             platform: ng.platform,
             edition: ng.edition ?? null,
             hoursPlayed: ng.hoursPlayed.value,
             status: ng.status,
             format: ng.format,
             coverColor: ng.coverColor ?? null,
           };
           if (!existing) {
             await tx.insert(gamesTable).values({ userId, externalId: ng.externalId, ...values });
             gCreated++;
           } else {
             await tx.update(gamesTable).set(values).where(eq(gamesTable.id, existing.id));
             gUpdated++;
           }
         }
         return {
           mode: 'merge',
           platforms: { created: pCreated, updated: pUpdated },
           games: { created: gCreated, updated: gUpdated },
         };
       });
     }

     private async applyReplace(userId: string, plan: ImportPlan): Promise<ImportReport> {
       return db.transaction(async (tx) => {
         const [{ count: gDel = 0 } = {}] = await tx
           .select({ count: sql<number>`count(*)` })
           .from(gamesTable)
           .where(eq(gamesTable.userId, userId));
         const [{ count: pDel = 0 } = {}] = await tx
           .select({ count: sql<number>`count(*)` })
           .from(platformsTable)
           .where(eq(platformsTable.userId, userId));

         await tx.delete(gamesTable).where(eq(gamesTable.userId, userId));
         await tx.delete(platformsTable).where(eq(platformsTable.userId, userId));

         for (const np of plan.platforms) {
           await tx.insert(platformsTable).values({ userId, externalId: np.externalId, name: np.name });
         }
         for (const ng of plan.games) {
           await tx.insert(gamesTable).values({
             userId,
             externalId: ng.externalId,
             title: ng.title,
             developer: ng.developer,
             genre: ng.genre,
             releaseYear: ng.releaseYear.value,
             platform: ng.platform,
             edition: ng.edition ?? null,
             hoursPlayed: ng.hoursPlayed.value,
             status: ng.status,
             format: ng.format,
             coverColor: ng.coverColor ?? null,
           });
         }
         return {
           mode: 'replace',
           platforms: { created: plan.platforms.length, updated: 0, deleted: pDel },
           games: { created: plan.games.length, updated: 0, deleted: gDel },
         };
       });
     }
   }
   ```
2. `bun run typecheck` z `apps/api` → 0 błędów.
**Rezultat:** repo gotowe. Brak testów infra (tu zgodnie z konwencją projektu — testy fazy 1 z fake repo + smoke testy ręczne tutaj).

### Step 2: Route `POST /api/import`
**Co robimy:**
1. Utwórz `apps/api/src/routes/import.ts`:
   ```ts
   import { Hono } from 'hono';
   import { bodyLimit } from 'hono/body-limit';
   import { z } from 'zod';
   import { ImportData } from '../application/import/import-data';
   import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
   import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
   import { DrizzleImportRepository } from '../infrastructure/import/drizzle-import-repository';
   import type { AuthVariables } from './middleware/require-auth';

   const gameRepo = new DrizzleGameRepository();
   const platformRepo = new DrizzlePlatformRepository();
   const importRepo = new DrizzleImportRepository();
   const importData = new ImportData(gameRepo, platformRepo, importRepo);

   const BodySchema = z.object({
     mode: z.enum(['merge', 'replace']),
     snapshot: z.unknown(),
   });

   export const importRoute = new Hono<{ Variables: AuthVariables }>();

   importRoute.post(
     '/',
     bodyLimit({
       maxSize: 5 * 1024 * 1024,
       onError: (c) => c.json({ error: 'payload_too_large' }, 413),
     }),
     async (c) => {
       const userId = c.get('user').id;
       const body = await c.req.json().catch(() => null);
       const parsed = BodySchema.safeParse(body);
       if (!parsed.success) {
         return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
       }
       const rawJson = JSON.stringify(parsed.data.snapshot);
       const result = await importData.execute(userId, rawJson, parsed.data.mode);
       if (!result.ok) {
         return c.json({ error: result.error.kind, detail: result.error }, 400);
       }
       return c.json(result.value);
     },
   );
   ```
2. Edytuj `apps/api/src/index.ts` — po blokach `games` / `platforms` / `export`:
   ```ts
   import { importRoute } from './routes/import';
   // ...
   app.use('/api/import/*', requireAuth);
   app.route('/api/import', importRoute);
   ```
3. `bun run typecheck` → 0 błędów. `bun test` → zielone.
**Rezultat:** endpoint zarejestrowany.

### Step 3: Smoke testy ręczne
**Co robimy:**
1. `bun run dev` z `apps/api`. W drugim terminalu — frontend (`apps/client`) lub same curle.
2. Zaloguj się przez UI, przygotuj `cookies.txt`.
3. **Smoke 1 — merge happy path:**
   - `curl -s -b cookies.txt http://localhost:3001/api/export -o snap.json`
   - `cat <(echo '{"mode":"merge","snapshot":') snap.json <(echo '}') > body.json`
   - `curl -s -b cookies.txt -H 'Content-Type: application/json' -d @body.json http://localhost:3001/api/import`
   - Oczekiwane: 200, raport `{ mode: 'merge', platforms: { created: 0, updated: 0 }, games: { created: 0, updated: 0 } }` — bo importowaliśmy własny plik, wszystkie externalId pasują, nazwy się nie zmieniły.
4. **Smoke 2 — merge zmienia tytuł:**
   - W UI zmień tytuł jednej gry (np. "Hollow Knight" → "HK Modified").
   - Re-import `body.json` (z poprzedniego eksportu).
   - Oczekiwane: raport ma `games.updated >= 1`. Sprawdź w UI że tytuł wrócił do "Hollow Knight".
5. **Smoke 3 — merge dodaje nową grę:**
   - Edytuj `snap.json` ręcznie (lub przez jq) — usuń jedną grę z `games[]`. (Bądź wstaw nowy obiekt z świeżym externalId).
   - Re-import. Sprawdź raport — jeśli usunąłeś grę, `created/updated` zostają niskie (gra usunięta z PLIKU pozostaje w bazie — merge NIE deletuje). Jeśli dodałeś — `games.created === 1`.
6. **Smoke 4 — replace wipe + insert:**
   - W UI dodaj 2 nowe gry (testowe).
   - Wykonaj `curl ... ?mode=replace` z body { mode: 'replace', snapshot: <oryginalny snap.json> }`.
   - Oczekiwane: raport `{ mode: 'replace', games: { created: <oryginalny count>, deleted: <oryginalny count + 2>, updated: 0 }, platforms: ... }`. UI po refreshu pokazuje stan z pliku, BEZ dwóch dodanych testowych gier.
7. **Smoke 5 — invalid JSON shape:**
   - `body.json` z `snapshot: { version: 99 }` → `curl` → oczekiwane: 400 `unsupported_version`.
   - `body.json` z `snapshot: { version: 2, ... bez games }` → 400 `invalid_shape`.
8. **Smoke 6 — body too large:**
   - `head -c 6000000 /dev/urandom | base64 > big.txt; ` zbuduj body z dużym `snapshot.games[0].edition` itd.
   - `curl ...` → oczekiwane: 413.
9. **Smoke 7 — no auth:**
   - `curl -s -H 'Content-Type: application/json' -d '{"mode":"merge","snapshot":{}}' http://localhost:3001/api/import` (bez `-b cookies.txt`)
   - Oczekiwane: 401.
10. **Smoke 8 — idempotency:**
    - Po smoke 1, kliknij ten sam import drugi raz → raport identyczny (wszystko 0 created, 0 updated).
**Rezultat:** End-to-end backend działa. Frontend (faza 3) używa.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- Tx się nie cofa po rzucie — sprawdź czy Drizzle bun-sqlite `transaction` zwraca Promise. Z `import { db } from ...` — `db.transaction(async (tx) => { ... })` standardowo działa. Jeśli błąd "transaction not implemented" — sprawdź wersję `drizzle-orm` (>= 0.30 ma).
- `tx.update` ignoruje WHERE — upewnij się że WHERE jest `eq(gamesTable.id, existing.id)`, nie `existing.userId` (który nie jest unique).
- `bodyLimit onError` rzuca a nie zwraca — Hono v4: callback `onError(c)` powinien zwracać Response. Sprawdź signature w docs/Context7.
- 400 mimo poprawnego body — `c.req.json()` rzuca jeśli body to nie JSON; `.catch(() => null)` przechwytuje. Sprawdź czy `Content-Type: application/json` jest w request.
- Smoke 4 `replace` zostawia rekordy — DELETE poszedł bez WHERE, lub WHERE używa `eq(table.id, userId)` zamiast `eq(table.userId, userId)`. Czytaj uważnie.
- 500 z "FOREIGN KEY constraint failed" przy DELETE platforms — auth-schema/user table FK wykryło coś innego. Sprawdź schema — jeśli platforms ma FK na user, to powinno być cascade. Patrz `apps/api/src/infrastructure/db/schema.ts`.
- Re-import przez Drizzle kończy się "UNIQUE constraint failed: games.user_id, games.external_id" w MERGE — znaczy że find-by-externalId nie znalazł istniejącego rekordu, ale insert kolidował z istniejącym. Race? W tx — niemożliwe. Sprawdź czy UPDATE leci po naprawdę istniejącym `existing.id` a nie po jakimś NULL. (Test: prosty `console.log(existing)`.)
