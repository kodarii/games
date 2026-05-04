# Game price + purchasedAt — Faza 2: Application + Import/Export

## Goal
Przepuść nowe pola `price` (PLN, grosze) i `purchasedAt` (string `YYYY-MM-DD`) przez warstwę application: rozszerz Zodowe DTO w `create-game` i `update-game`, dopisz testy use-case'ów. Zbumpuj schema importu/eksportu do **v3** (parser nadal akceptuje v1 i v2 — w starszych wersjach mapuje nowe pola na `null`). Dopisz migrację `v2 → v3` i testy. Routes (`apps/api/src/routes/games.ts`) **nie wymagają zmian** — przepuszczają body do use-case'a.

**Update semantyka:** wzorzec **replace** (jak istniejący `coverImage`) — nie patch. `null`/`undefined`/brak klucza w body wszystkie znaczą "po update'cie pole = null". Frontend zawsze wysyła pełny payload.

## Definition of Done
- [ ] `apps/api/src/application/games/create-game.ts` — Zod schema akceptuje opcjonalne `price` (integer ≥ 0) i `purchasedAt` (string `YYYY-MM-DD` regex + refine na istnienie daty)
- [ ] `apps/api/src/application/games/update-game.ts` — analogicznie (replace pattern: `null`/brak = wyczyszczone)
- [ ] Testy `create-game.test.ts` i `update-game.test.ts` rozszerzone o przypadki:
  - poprawny `price` + `purchasedAt` → `ok` + wartości w grze
  - brak `price`/`purchasedAt` → `ok`, gra ma te pola jako `null`
  - `price: -1` → `domain` error `price_negative`
  - `purchasedAt: '2099-01-01'` → `domain` error `purchased_at_in_future`
  - `purchasedAt: '2024/06/15'` (zły format) → `invalid_input` (Zod łapie zanim dojdzie do domeny)
  - update z `price: null` → gra ma `price: null` po update (replace pattern)
- [ ] `packages/shared/src/import-schema-v3.ts` — nowy plik z `ImportedGameV3` (extend V2 o `price` i `purchasedAt`), `ImportedPlatformV3` (= V2), `ImportSnapshotV3Schema` z `version: z.literal(3)`
- [ ] `packages/shared/src/index.ts` — eksportuje v3 i `ImportSnapshot` wskazuje na `ImportSnapshotV3`
- [ ] `apps/api/src/application/import/migrations/v2-to-v3.ts` — funkcja `migrateV2toV3(snap: ImportSnapshotV2): ImportSnapshotV3` mapująca każdą grę z **jawnym** `price: null, purchasedAt: null`
- [ ] `apps/api/src/application/import/migrations/index.ts` — łańcuch: v1 → v2 → v3, v2 → v3, v3 → v3 (no-op po validacji)
- [ ] `apps/api/src/application/export/export-snapshot.ts` — `EXPORT_SCHEMA_VERSION = 3`, `ExportedGame` ma `price: number | null` i `purchasedAt: string | null` (`YYYY-MM-DD`)
- [ ] Literalne `version: 2` / `toBe(2)` w testach zaktualizowane do `3`:
  - `apps/api/src/application/export/__tests__/export-data.test.ts:110` (`version: 2`) i `:206` (`expect(snapshot.version).toBe(2)`)
  - `apps/api/src/application/import/__tests__/parse-import.test.ts:88, 130, 140` (`expect(result.value.version).toBe(2)`)
- [ ] Testy parsera v1/v2 (fixtures `version: 1` / `version: 2`) ZOSTAJĄ — to legitne wejścia migrowane do v3.
- [ ] `apps/api/src/application/import/__tests__/...` i `apps/api/src/application/export/__tests__/...` — testy zaktualizowane:
  - parser akceptuje v3 z nowymi polami
  - parser akceptuje v2 i wynikowy snapshot ma `price: null, purchasedAt: null`
  - export-snapshot dla gry z ceną/datą produkuje v3 z poprawnymi wartościami
- [ ] `external-to-current.ts` zwraca `ImportSnapshotV3` przez **wewnętrzne** wywołanie `migrateV2toV3` (nie inline'uj `price: null, purchasedAt: null` w pliku — chain wewnątrz)
- [ ] `cd apps/api && bun run check && bun test` — wszystko zielone

Agent kończy pracę WYŁĄCZNIE gdy wszystkie powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js — `bun test`, `bun run check`)
**Walidacja inputu:** Zod w application layer. Domain zostaje czysty (zaufany input).
**Wersjonowanie:** Numer wersji bumpujemy o 1 (v2 → v3). Stare wersje muszą działać bez zmian dla użytkownika.

### Step 0: Pobierz dokumentację
Użyj Context7:
- Zod: "regex with refine" oraz "optional vs nullable" oraz "z.iso.date()" (jeśli używasz Zod v4 — sprawdź wersję w `package.json`)
- Drizzle ORM: nie potrzeba w tej fazie (schema już zrobione w Fazie 1)

## Design decisions
- **Zod input dla `price`**: `z.number().int().min(0).optional()` (create) / `.nullable().optional()` (update). Frontend wyśle integer w groszach. NIE pozwalamy na float (zatrzymane już w VO, ale lepiej oblać wcześniej).
- **Zod input dla `purchasedAt`**: string z regex `^\d{4}-\d{2}-\d{2}$` + `.refine()` na istnienie daty (round-trip). NIE używamy `z.coerce.date()` — chcemy zostać w stringach na każdej warstwie. `.optional()` (create) / `.nullable().optional()` (update). Pusty string z formularza HTML → frontend wysyła `undefined`.
- **Update jako replace** (zgodnie z istniejącym wzorcem `coverImage`): brak/null/undefined w body wszystkie znaczą "po update'cie pole = null". `data.price ?? undefined` w propsach. NIE wprowadzamy patch-semantyki.
- **Import v1 i v2 → v3**: brakujące pola wstawiamy jako jawne `null`. Nie próbujemy wnioskować daty zakupu z `releaseYear`.
- **External format**: nie ma w nim ceny ani daty zakupu. `externalToCurrent` zwraca v3 przez wewnętrzne wywołanie `migrateV2toV3({version: 2, ...})` — nie inline'uj `price: null, purchasedAt: null` ręcznie.
- **Eksport**: zawsze produkujemy najnowszą wersję (v3). Pola serializujemy z `Game` przez gettery: `price: g.price?.value ?? null, purchasedAt: g.purchasedAt?.value ?? null` (string już w formacie `YYYY-MM-DD`).
- **Backwards compat dla EXPORT_SCHEMA_VERSION**: testy e2e sprawdzają literal `2` w 5 miejscach (lista w Definition of Done) — zaktualizuj na `3`.

## Relevant files

### Edytuj:
- `apps/api/src/application/games/create-game.ts`
- `apps/api/src/application/games/create-game.test.ts`
- `apps/api/src/application/games/update-game.ts`
- `apps/api/src/application/games/update-game.test.ts`
- `apps/api/src/application/export/export-snapshot.ts`
- `apps/api/src/application/export/__tests__/export-snapshot.test.ts` *(jeśli istnieje — sprawdź `ls apps/api/src/application/export/__tests__/`)*
- `apps/api/src/application/import/parse-import.ts` *(może wymagać aktualizacji typu zwracanego — `ImportSnapshot` teraz to v3)*
- `apps/api/src/application/import/migrations/index.ts`
- `apps/api/src/application/import/migrations/external-to-current.ts`
- `apps/api/src/application/import/__tests__/...` *(istniejące testy parsera + dopisać testy v3)*
- `packages/shared/src/index.ts`

### Tworzysz nowe:
- `packages/shared/src/import-schema-v3.ts`
- `apps/api/src/application/import/migrations/v2-to-v3.ts`

### Czytaj ale NIE edytuj:
- `apps/api/src/domain/games/game.ts` — nowe VO `Price`, `PurchasedAt` z Fazy 1
- `packages/shared/src/import-schema-v1.ts`, `import-schema-v2.ts` — wzorce
- `apps/api/src/application/import/migrations/v1-to-v2.ts` — wzorzec migracji
- `apps/api/src/application/import/import-data.ts` — żeby zrozumieć jak migrowany snapshot trafia do bazy (pamiętaj że trzeba przekazać nowe pola do create/update)

## Constraints
- TDD: STRICT RED → GREEN. NAJPIERW testy use-case'a (uruchom `bun test`, zobacz RED), POTEM rozszerz Zod schema i mapping, znowu `bun test` (GREEN). Dwa runy testów na step.
- NIE zmieniaj sygnatury route handlerów w `apps/api/src/routes/games.ts`. Routes przepuszczają body do `execute(body, userId)` — nic do dotykania.
- NIE modyfikuj v1 ani v2 schematów w `packages/shared/`. Bumpujemy do v3 — stare zostają nietknięte (wymóg backwards compat).
- `ImportSnapshot` (alias eksportowany z `packages/shared/src/index.ts`) musi teraz wskazywać na **v3**. Sprawdź co go importuje i upewnij się że wszędzie typecheck przechodzi (głównie `parse-import.ts`, `import-data.ts`, `export-snapshot.ts`).
- Nie wprowadzaj nowego typu na poziomie domeny — Faza 1 już zrobiła robotę. `purchasedAt` przepuszczany jako string `YYYY-MM-DD` przez całą warstwę Zod do VO.
- Update-game replace pattern (`coverImage: z.string().url().nullable().optional()` + `data.coverImage ?? undefined` w propsach) — naśladuj **dokładnie** dla `price` i `purchasedAt`. NIE wymyślaj nowego wzorca, NIE wprowadzaj patch-semantyki.

## Steps

### Step 1: Bump schema importu/eksportu (v3) + migracja v2→v3
**Co robimy:**
1. Utwórz `packages/shared/src/import-schema-v3.ts`:
   ```ts
   import { z } from 'zod';
   import { ImportedGameV2, ImportedPlatformV2 } from './import-schema-v2';

   const PURCHASED_AT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
   const isValidIsoDate = (s: string) => {
     const d = new Date(s);
     return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
   };

   export const ImportedPlatformV3 = ImportedPlatformV2;

   export const ImportedGameV3 = ImportedGameV2.extend({
     price: z.number().int().min(0).nullable().optional(),
     purchasedAt: z
       .string()
       .regex(PURCHASED_AT_REGEX)
       .refine(isValidIsoDate, 'invalid date')
       .nullable()
       .optional(),
   });

   export const ImportSnapshotV3Schema = z.object({
     version: z.literal(3),
     exportedAt: z.string(),
     platforms: z.array(ImportedPlatformV3),
     games: z.array(ImportedGameV3),
   });

   export type ImportSnapshotV3 = z.infer<typeof ImportSnapshotV3Schema>;
   export type ImportedGameV3T = z.infer<typeof ImportedGameV3>;
   export type ImportedPlatformV3T = z.infer<typeof ImportedPlatformV3>;
   ```
2. Zaktualizuj `packages/shared/src/index.ts`:
   ```ts
   export * from './import-schema-v3';
   export type ImportSnapshot = import('./import-schema-v3').ImportSnapshotV3;
   ```
3. Utwórz `apps/api/src/application/import/migrations/v2-to-v3.ts`:
   ```ts
   import type { ImportSnapshotV2, ImportSnapshotV3 } from '@apex/shared';

   export function migrateV2toV3(snap: ImportSnapshotV2): ImportSnapshotV3 {
     return {
       version: 3,
       exportedAt: snap.exportedAt,
       platforms: snap.platforms,
       games: snap.games.map((g) => ({ ...g, price: null, purchasedAt: null })),
     };
   }
   ```
4. Zaktualizuj `apps/api/src/application/import/migrations/index.ts`:
   - dodaj import `ImportSnapshotV3Schema`
   - dla `version === 1`: po `migrateV1toV2(parsed.data, idGenerator)` → `migrateV2toV3(...)`
   - dla `version === 2`: po validacji → `migrateV2toV3(parsed.data)`
   - dla `version === 3`: validacja `ImportSnapshotV3Schema.safeParse(raw)` → ok bezpośrednio
5. Zaktualizuj `apps/api/src/application/import/migrations/external-to-current.ts` — zwracaj `ImportSnapshotV3` przez **wewnętrzne** wywołanie `migrateV2toV3`:
   ```ts
   import { migrateV2toV3 } from './v2-to-v3';
   import type { ImportSnapshotV2, ImportSnapshotV3 } from '@apex/shared';
   // ...
   export function externalToCurrent(
     ext: ImportSnapshotExternal,
     idGenerator: () => string,
     now: () => string,
   ): ImportSnapshotV3 {
     // (build platforms i games tak jak dotąd, BEZ price/purchasedAt)
     const v2: ImportSnapshotV2 = { version: 2, exportedAt: now(), platforms, games };
     return migrateV2toV3(v2);
   }
   ```
   Funkcja zachowuje istniejącą logikę "external→v2", a chain do v3 idzie przez `migrateV2toV3`.
6. Zaktualizuj `apps/api/src/application/export/export-snapshot.ts`:
   - `EXPORT_SCHEMA_VERSION = 3 as const`
   - `ExportedGame` dostaje `price: number | null; purchasedAt: string | null;` (string w formacie `YYYY-MM-DD`)
   - W `toSnapshot`, w mapowaniu gier dorzuć:
     ```ts
     price: g.price?.value ?? null,
     purchasedAt: g.purchasedAt?.value ?? null,
     ```
7. `cd apps/api && bun run check` — typy muszą się zgodzić wszędzie. Jeśli `import-data.ts` widzi `snap.games[i].price/purchasedAt` jako nieznane — popraw pętlę żeby przekazywała nowe pola do `create` / `update`.
**Rezultat:** `bun run check` czysty. Eksport produkuje v3, parser obsługuje v1/v2/v3.

### Step 2: Zod + use-case'y (TDD)
**Co robimy:**
1. **RED — testy create-game**: w `apps/api/src/application/games/create-game.test.ts`:
   - `it('accepts price and purchasedAt')` — `{ ...validInput, price: 12999, purchasedAt: '2024-06-15' }` → `ok` + `result.value.toJSON().price === 12999` + `result.value.toJSON().purchasedAt === '2024-06-15'`
   - `it('returns invalid_input for negative price')` — `price: -1` → err `invalid_input` z issue na `path[0] === 'price'`
   - `it('returns invalid_input for bad purchasedAt format')` — `purchasedAt: '2024/06/15'` → err `invalid_input` z issue na `path[0] === 'purchasedAt'`
   - `it('returns domain price_too_large for huge price')` — `price: 999_999_999` → err `domain` z `kind: 'price_too_large'`
   - `it('returns domain purchased_at_in_future')` — `purchasedAt: '2099-01-01'` → err `domain` z `kind: 'purchased_at_in_future'`
   - `it('omits price/purchasedAt when not provided')` → `toJSON().price === null`, `toJSON().purchasedAt === null`
2. **RED — testy update-game**: dorzuć analogiczne testy + replace pattern:
   - `it('clears price when null is sent')` — najpierw create z `price: 12999`, potem update z `price: null` → po update `toJSON().price === null` (zgodnie z replace pattern coverImage)
   - `it('clears purchasedAt when null is sent')` — analogicznie dla daty
3. `bun test` → testy nowe FAILUJĄ (RED).
4. **GREEN — create-game.ts**: rozszerz `CreateGameInputSchema`:
   ```ts
   price: z.number().int().min(0).optional(),
   purchasedAt: z
     .string()
     .regex(/^\d{4}-\d{2}-\d{2}$/)
     .refine((s) => {
       const d = new Date(s);
       return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
     }, 'invalid date')
     .optional(),
   ```
   I w budowaniu `props: GameProps` dorzuć:
   ```ts
   price: data.price,
   purchasedAt: data.purchasedAt,
   ```
5. **GREEN — update-game.ts**: skopiuj wzorzec `coverImage` (replace pattern):
   ```ts
   price: z.number().int().min(0).nullable().optional(),
   purchasedAt: z
     .string()
     .regex(/^\d{4}-\d{2}-\d{2}$/)
     .refine(/* ten sam refine co wyżej */)
     .nullable()
     .optional(),
   ```
   W propsach: `price: data.price ?? undefined, purchasedAt: data.purchasedAt ?? undefined` (zgodnie z `coverImage: data.coverImage ?? undefined`).
6. `bun test` → wszystkie zielone (GREEN).
**Rezultat:** Use-case'y akceptują nowe pola, walidacja przechodzi przez Zod (input) i domain (invariant).

### Step 3: Testy parsera + eksportu + smoke import
**Co robimy:**
1. W testach parsera (`apps/api/src/application/import/__tests__/parse-import.test.ts`):
   - **Aktualizuj literalne** `expect(result.value.version).toBe(2)` (linie 88, 130, 140) → `toBe(3)`
   - **Dodaj** `it('accepts v3 with price and purchasedAt')` — JSON z `version: 3` + jedna gra z `price: 12999, purchasedAt: '2024-06-15'` → `ok`, snapshot z polami obecnymi
   - **Dodaj** `it('migrates v2 by setting price/purchasedAt to null')` — JSON v2 → snapshot v3 ma w każdej grze `price: null, purchasedAt: null`
   - **Dodaj** `it('migrates v1 by setting price/purchasedAt to null')` — JSON v1 → snapshot v3 ma `price: null, purchasedAt: null`
2. W testach eksportu (`apps/api/src/application/export/__tests__/export-data.test.ts`):
   - **Aktualizuj** `version: 2` (linia 110) → `version: 3`
   - **Aktualizuj** `expect(snapshot.version).toBe(2)` (linia 206) → `toBe(3)`
   - **Dodaj** `it('exports price and purchasedAt for v3')` — Game z `price: 5000, purchasedAt: '2024-01-01'` → snapshot games[0] ma `price: 5000, purchasedAt: '2024-01-01'`
   - **Dodaj** `it('exports null for missing price and purchasedAt')` — Game bez tych pól → `price: null, purchasedAt: null`
3. W testach `import-data.ts` (jeśli są) — upewnij się, że migrowany snapshot trafia do `create` z nowymi polami; jeśli `import-data.ts` nie przekazuje `price/purchasedAt` — popraw pętlę i napisz/uzupełnij test.
4. `cd apps/api && bun test && bun run check` — wszystko zielone.
**Rezultat:** pełny round-trip eksport → import działa z nowymi polami; v1/v2 backwards-compat zachowany.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <opis problemu, jaki błąd, jaka hipoteza>`
Zakończ pracę.
