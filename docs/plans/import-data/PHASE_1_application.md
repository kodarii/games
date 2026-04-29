---
name: Import Data Phase 1 — Application + Shared package + Migrations pipeline
description: packages/shared z Zod schemami v1/v2 + migrations pipeline + use case ImportData + port ImportRepository + testy use case na fake repos
type: plan
---

# Import Data — Faza 1: Application

## Goal
Zbudować w warstwie application kompletny pipeline importu (parse → migrate →
validate → cross-row check → upsert plan) bez infrastruktury. Wprowadzić
`packages/shared` jako miejsce na Zod schemy importu (v1, v2) oraz typy
raportu/trybu — bo będą reused przez frontend (lokalna pre-walidacja).

W tej fazie powstają:
- `@apex/shared` workspace package z schemami i typami.
- `migrations/v1-to-v2.ts` (pure fn) + framework dla przyszłych migracji.
- `parseImport(json, idGenerator)` — parsuje, migruje do current, waliduje.
- `ImportData` use case orkiestrujący: parse → validate cross-row → call repo.
- `ImportRepository` port (apply `merge`/`replace` w jednej tx — implementacja w fazie 2).
- Testy use case na fake repos pokrywające wszystkie edge cases.

## Definition of Done
- [ ] Workspace `packages/shared` istnieje, registered w root `package.json` (`"workspaces": ["apps/*", "packages/*"]`)
- [ ] `@apex/shared` eksportuje: `ImportSnapshotV1Schema`, `ImportSnapshotV2Schema`, `ImportSnapshot` (= type V2), `ImportMode`, `ImportReport`, `CURRENT_SCHEMA_VERSION = 2`
- [ ] `apps/api` ma `"@apex/shared": "workspace:*"` w `dependencies`, importuje schemy z `@apex/shared`
- [ ] `apps/api/src/application/import/migrations/v1-to-v2.ts` to pure funkcja — przyjmuje raw v1, zwraca v2 (każdy rekord dostaje świeży UUID przez wstrzykiwany `idGenerator`)
- [ ] `apps/api/src/application/import/migrations/index.ts` eksportuje `migrateToCurrent(raw, idGenerator)` — switch po `version`, łańcuchowanie `v1→v2→...→vCurrent`
- [ ] `apps/api/src/application/import/parse-import.ts` eksportuje `parseImport(rawJson: string, idGenerator): Result<ImportSnapshot, ImportParseError>`
- [ ] `apps/api/src/application/import/import-data.ts` eksportuje `ImportData` z `execute(userId, rawJson, mode, now?): Promise<Result<ImportReport, ImportError>>`
- [ ] `apps/api/src/domain/import/import-repository.ts` definiuje port `ImportRepository.apply(userId, plan, mode): Promise<ImportReport>`
- [ ] Wszystkie testy edge case'ów przechodzą: `bun test apps/api/src/application/import`
- [ ] `bun test` (cały api) → zielony
- [ ] `bun run typecheck` (root + apps/api) → 0 błędów

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. Workspaces przez `bun install`.
**Katalog roboczy:** głównie `apps/api`, ale zaczynamy od edycji root + utworzenia `packages/shared`.
**Dependency:** Faza External IDs (1+2) ZAKOŃCZONA — eksport emituje v2 z `externalId` per rekord, baza ma unique index `(user_id, external_id)`.
**Vertical slice DDD:** application zależy WYŁĄCZNIE od domain. Nowe `packages/shared` JEST traktowane jako "kontrakt" — application może go importować, domain NIE (shared mówi o kształcie pliku, domain o regułach biznesowych — separate concerns).

## Design decisions

### Strategia trybów
- `merge` (default): per-rekord `findByExternalId(userId, externalId)`. Jeśli istnieje → update fields (`{...old, ...new}`-semantyka, ale technicznie to pełne nadpisanie z plik-dostępnymi polami; pole nieobecne w pliku zachowuje stary stan — ale ponieważ format eksportu emituje WSZYSTKIE wymagane pola, w praktyce to zwykły overwrite). Jeśli nie istnieje → insert.
- `replace`: usuń wszystkie gry usera + wszystkie platformy usera + wstaw z pliku. Pojedyncza tx (faza 2).

### Walidacja cross-row (przed wywołaniem repo)
1. **Unikalność `externalId` w pliku** — w platforms[] i games[] osobno.
2. **Unikalność `name` platformy w pliku** (po stronie nazwy też muszą być unikatowe — bo unique index na bazie egzekwuje to per-user).
3. **Pokrycie game.platform** — każda referencja musi się rozwiązywać. W trybie `merge` pula = platforms-z-pliku ∪ platforms-usera-w-bazie (po nazwie). W trybie `replace` pula = TYLKO platforms-z-pliku.
4. **Domain validation per row** — `NewGame.create(props)` / `NewPlatform.create(props)`. Jeśli którykolwiek failuje → `ImportError` z indeksem rekordu i konkretnym kindem domeny.

### Migrations pipeline (framework)
- `migrateToCurrent(raw, idGenerator)` to czysty pipeline. Wejście: `unknown` (już sparsowany JSON, ale jeszcze nie zwalidowany). Najpierw bardzo wąski parse — tylko `{ version: number }`. Switch po wersji, każda migracja to pure fn `vN → vN+1`. Ostatnim krokiem: walidacja pełnego shape `vCurrent` (Zod). Wynik typed jako `ImportSnapshot` (= V2 obecnie).
- Dla v1 → v2: brak zmian poza dodaniem `externalId` w każdym rekordzie. Generator UUID wstrzyknięty.
- Dla każdej przyszłej wersji: dorzucamy `vN-to-vN+1.ts` + dopisek w switchu. Nic więcej. Schemy starszych wersji zostają w `@apex/shared` w postaci osobnych plików (`schema-v1.ts`, `schema-v2.ts`...).

### Co znajduje się w `@apex/shared` a co w `apps/api/src/application/import`
- **shared:** Zod schemy file-format (v1, v2, ...), enumy `ImportMode = 'merge' | 'replace'`, typ raportu `ImportReport`, stała `CURRENT_SCHEMA_VERSION`. Nic specyficznego dla backendu/persistence.
- **application/import:** migracje (pure fns z UUID generator), parsing+migration pipeline, use case, port repo.
- **domain/import:** port `ImportRepository`. (Trzymamy spójność: porty są w domain, jak `game-repository.ts`.)

### Idempotencja merge
- Re-import tego samego pliku = identyczny stan końcowy (każdy rekord trafia po `externalId` na istniejący wiersz, robi update tymi samymi wartościami).
- Re-import po tym jak user zmienił coś w UI = nadpisuje zmiany. To przewidywalna semantyka (user świadomie kliknął import).

## Relevant files (create / edit only these)

### Root + workspace
- `package.json` — dodanie `"packages/*"` do `workspaces`
- `packages/shared/package.json` — NOWY (`@apex/shared`, type module, exports `./src/index.ts`, dep `zod`)
- `packages/shared/tsconfig.json` — NOWY (extends `tsconfig.base.json`)
- `packages/shared/src/index.ts` — re-exports
- `packages/shared/src/import-schema-v1.ts` — Zod schema v1 (legacy, bez externalId)
- `packages/shared/src/import-schema-v2.ts` — Zod schema v2 (current)
- `packages/shared/src/import-types.ts` — `ImportMode`, `ImportReport`, `CURRENT_SCHEMA_VERSION`

### apps/api
- `apps/api/package.json` — dodanie `"@apex/shared": "workspace:*"`
- `apps/api/src/application/import/migrations/v1-to-v2.ts` — NOWY
- `apps/api/src/application/import/migrations/index.ts` — NOWY (pipeline)
- `apps/api/src/application/import/parse-import.ts` — NOWY
- `apps/api/src/application/import/import-data.ts` — NOWY (use case)
- `apps/api/src/application/import/__tests__/parse-import.test.ts` — NOWY
- `apps/api/src/application/import/__tests__/import-data.test.ts` — NOWY
- `apps/api/src/domain/import/import-repository.ts` — NOWY (port)

## Files to read but NOT edit
- `apps/api/src/application/export/export-snapshot.ts` — kształt v2 (źródło prawdy dla schemy v2)
- `apps/api/src/application/games/create-game.ts` — wzorzec walidacji (Zod safeParse → Result)
- `apps/api/src/domain/shared/result.ts` — `Result`, `ok`, `err`
- `apps/api/src/domain/games/game.ts` — `NewGame.create` (faza External IDs dorzuciła `idGenerator`)
- `apps/api/src/domain/platforms/platform.ts` — analogicznie

## Constraints
- **NIE** importuj `db`, `drizzle-orm`, ani niczego z `infrastructure/`. Application zależy tylko od domain + shared.
- **NIE** waliduj formatu UUID w schemy (string wystarczy). Trust w generatorze; wewnętrzny ID jest opaque.
- **NIE** rzucaj wyjątków z use case dla błędów biznesowych — używaj `Result<T, ImportError>`. Wyjątki tylko dla katastrof (np. repo.apply rzuca z bazy).
- **NIE** wstawiaj logiki tx w use case. `ImportRepository.apply` to pojedyncze wywołanie, infrastruktura w fazie 2 zawinie w `db.transaction`.
- **idGenerator** wstrzykiwany do `parseImport` i `ImportData` — domyślnie `() => crypto.randomUUID()`.
- Każda Zod schema starszej wersji (v1, v2, ...) musi być **zamknięta** w `@apex/shared` — frontend importuje tylko **current** (v2). Stare wersje używane są wyłącznie przez backend (parse legacy plików).

## Steps

### Step 0: Pobierz dokumentację (Context7)
Użyj Context7 dla:
- `zod` — "discriminated union by version field", "safeParse error issues format"
- `bun` — "workspaces package linking and import resolution"

**Rezultat:** masz świeże API.

### Step 1: Setup workspace `packages/shared`
**Co robimy:**
1. Edytuj root `/Users/kodari/projects/games/package.json`:
   ```json
   "workspaces": ["apps/*", "packages/*"]
   ```
2. Utwórz `packages/shared/package.json`:
   ```json
   {
     "name": "@apex/shared",
     "private": true,
     "type": "module",
     "exports": {
       ".": "./src/index.ts"
     },
     "dependencies": {
       "zod": "^4.3.6"
     }
   }
   ```
3. Utwórz `packages/shared/tsconfig.json`:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "rootDir": "src",
       "outDir": "dist"
     },
     "include": ["src/**/*"]
   }
   ```
4. Utwórz `packages/shared/src/import-types.ts`:
   ```ts
   export const CURRENT_SCHEMA_VERSION = 2 as const;
   export type ImportMode = 'merge' | 'replace';
   export interface ImportReport {
     mode: ImportMode;
     platforms: { created: number; updated: number; deleted?: number };
     games: { created: number; updated: number; deleted?: number };
   }
   ```
5. Utwórz `packages/shared/src/import-schema-v1.ts`:
   ```ts
   import { z } from 'zod';
   const Status = z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']);
   const Format = z.enum(['physical', 'digital']);
   const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
   export const ImportedPlatformV1 = z.object({ name: z.string().min(1).max(40) });
   export const ImportedGameV1 = z.object({
     title: z.string().min(1),
     developer: z.string().min(1),
     genre: z.string(),
     releaseYear: z.number().int().min(1970).max(2100),
     platform: z.string().min(1),
     hoursPlayed: z.number().min(0),
     status: Status,
     format: Format,
     edition: z.string().optional(),
     coverColor: HexColor.optional(),
   });
   export const ImportSnapshotV1Schema = z.object({
     version: z.literal(1),
     exportedAt: z.string(),
     platforms: z.array(ImportedPlatformV1),
     games: z.array(ImportedGameV1),
   });
   export type ImportSnapshotV1 = z.infer<typeof ImportSnapshotV1Schema>;
   ```
6. Utwórz `packages/shared/src/import-schema-v2.ts` — identyczne, z `version: z.literal(2)` i dodatkowo `externalId: z.string().min(1)` w `ImportedPlatformV2` oraz `ImportedGameV2`. Wyciąg:
   ```ts
   export const ImportedPlatformV2 = z.object({
     externalId: z.string().min(1),
     name: z.string().min(1).max(40),
   });
   export const ImportedGameV2 = ImportedGameV1.extend({
     externalId: z.string().min(1),
   });
   export const ImportSnapshotV2Schema = z.object({
     version: z.literal(2),
     exportedAt: z.string(),
     platforms: z.array(ImportedPlatformV2),
     games: z.array(ImportedGameV2),
   });
   export type ImportSnapshotV2 = z.infer<typeof ImportSnapshotV2Schema>;
   export type ImportedPlatformV2T = z.infer<typeof ImportedPlatformV2>;
   export type ImportedGameV2T = z.infer<typeof ImportedGameV2>;
   ```
7. Utwórz `packages/shared/src/index.ts`:
   ```ts
   export * from './import-types';
   export * from './import-schema-v1';
   export * from './import-schema-v2';
   export type ImportSnapshot = import('./import-schema-v2').ImportSnapshotV2;
   ```
8. Edytuj `apps/api/package.json` — w `dependencies` dodaj `"@apex/shared": "workspace:*"`.
9. Z roota: `bun install`. Upewnij się że `apps/api/node_modules/@apex/shared` jest symlinkiem (lub że Bun rozwiązuje workspace).
10. Sanity check: w `apps/api/src/application/export/export-snapshot.ts` (NIE EDYTUJ — tylko sprawdź) — możesz zrobić tymczasowy import `import { CURRENT_SCHEMA_VERSION } from '@apex/shared';` i zobaczyć czy `bun run typecheck` go znajduje. Jeśli tak — usuń tymczasowy import. Jeśli nie — coś z workspaces jest nie tak.
**Rezultat:** Workspace gotowy, schemy istnieją, dostępne z apps/api.

### Step 2: Migrations pipeline (RED — testy parse-import)
**Co robimy:**
1. Utwórz `apps/api/src/application/import/__tests__/parse-import.test.ts` z testami dla nieistniejącego jeszcze `parseImport`. Przypadki:
   - `parseImport('{not json')` → `err({ kind: 'invalid_json' })`
   - `parseImport('{"foo": 1}')` → `err({ kind: 'invalid_shape' })` (brak `version`)
   - `parseImport('{"version": 99}')` → `err({ kind: 'unsupported_version', version: 99 })`
   - `parseImport(jsonV2InvalidShape)` → `err({ kind: 'invalid_shape', issues: [...] })` (np. brakujące `title`)
   - `parseImport(jsonV2Valid)` → `ok({ version: 2, ... })`
   - `parseImport(jsonV1Valid, () => 'fixed-uuid')` → `ok({ version: 2, ... })` z każdym rekordem mającym `externalId === 'fixed-uuid'` (bo generator deterministyczny).
2. Utwórz `apps/api/src/application/import/migrations/v1-to-v2.ts`:
   ```ts
   import type { ImportSnapshotV1, ImportSnapshotV2 } from '@apex/shared';

   export function migrateV1toV2(
     v1: ImportSnapshotV1,
     idGenerator: () => string,
   ): ImportSnapshotV2 {
     return {
       version: 2,
       exportedAt: v1.exportedAt,
       platforms: v1.platforms.map((p) => ({ externalId: idGenerator(), ...p })),
       games: v1.games.map((g) => ({ externalId: idGenerator(), ...g })),
     };
   }
   ```
3. Utwórz `apps/api/src/application/import/migrations/index.ts` (pipeline):
   ```ts
   import { ImportSnapshotV1Schema, ImportSnapshotV2Schema, type ImportSnapshot } from '@apex/shared';
   import { migrateV1toV2 } from './v1-to-v2';
   import { err, ok, type Result } from '../../../domain/shared/result';

   export type MigrateError =
     | { kind: 'invalid_shape'; version: number; issues: unknown }
     | { kind: 'unsupported_version'; version: number };

   export function migrateToCurrent(
     raw: unknown,
     version: number,
     idGenerator: () => string,
   ): Result<ImportSnapshot, MigrateError> {
     if (version === 1) {
       const parsed = ImportSnapshotV1Schema.safeParse(raw);
       if (!parsed.success) return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
       return ok(migrateV1toV2(parsed.data, idGenerator));
     }
     if (version === 2) {
       const parsed = ImportSnapshotV2Schema.safeParse(raw);
       if (!parsed.success) return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
       return ok(parsed.data);
     }
     return err({ kind: 'unsupported_version', version });
   }
   ```
4. Utwórz `apps/api/src/application/import/parse-import.ts`:
   ```ts
   import type { ImportSnapshot } from '@apex/shared';
   import { err, ok, type Result } from '../../domain/shared/result';
   import { migrateToCurrent } from './migrations';
   import { z } from 'zod';

   const VersionEnvelope = z.object({ version: z.number().int() });

   export type ImportParseError =
     | { kind: 'invalid_json'; message: string }
     | { kind: 'invalid_shape'; version?: number; issues: unknown }
     | { kind: 'unsupported_version'; version: number };

   export function parseImport(
     rawJson: string,
     idGenerator: () => string = () => crypto.randomUUID(),
   ): Result<ImportSnapshot, ImportParseError> {
     let parsed: unknown;
     try {
       parsed = JSON.parse(rawJson);
     } catch (e) {
       return err({ kind: 'invalid_json', message: String((e as Error).message) });
     }
     const env = VersionEnvelope.safeParse(parsed);
     if (!env.success) return err({ kind: 'invalid_shape', issues: env.error.issues });
     const result = migrateToCurrent(parsed, env.data.version, idGenerator);
     if (!result.ok) return err(result.error);
     return ok(result.value);
   }
   ```
5. `bun test apps/api/src/application/import/__tests__/parse-import.test.ts` → ZIELONE.
**Rezultat:** Plik (v1 lub v2) → `ImportSnapshot` (v2 typed) lub typowane błędy.

### Step 3: Port `ImportRepository` + plan struktura
**Co robimy:**
1. Utwórz `apps/api/src/domain/import/import-repository.ts`:
   ```ts
   import type { ImportMode, ImportReport } from '@apex/shared';
   import type { NewGame } from '../games/game';
   import type { NewPlatform } from '../platforms/platform';

   export interface ImportPlan {
     platforms: NewPlatform[];
     games: NewGame[];
   }

   export interface ImportRepository {
     apply(userId: string, plan: ImportPlan, mode: ImportMode): Promise<ImportReport>;
   }
   ```
2. **Co znaczy `apply` per-mode:**
   - `merge`: dla każdej `NewPlatform` w plan: `findByExternalId(userId, p.externalId)` → if exists update name; else insert. Dla każdej `NewGame`: jak wyżej, fields. Cała tx.
   - `replace`: deleteAll games + platforms userId; insert plan.platforms + plan.games. Cała tx.
   - Implementacja w fazie 2 (Drizzle).
3. (Brak testów na port — port to interfejs.)
**Rezultat:** Kontrakt persistence dla importu jasny.

### Step 4: Use case `ImportData` + cross-row validation (RED → GREEN)
**Co robimy:**
1. Utwórz `apps/api/src/application/import/__tests__/import-data.test.ts`. Fake repos jak w testach exportu (in-memory). Dodatkowo `FakeImportRepository`:
   ```ts
   class FakeImportRepository implements ImportRepository {
     public lastCall: { userId: string; plan: ImportPlan; mode: ImportMode } | null = null;
     async apply(userId, plan, mode) {
       this.lastCall = { userId, plan, mode };
       return {
         mode,
         platforms: { created: plan.platforms.length, updated: 0 },
         games: { created: plan.games.length, updated: 0 },
       };
     }
   }
   ```
2. Test cases (każdy z deterministycznym `idGenerator`):
   - **happy merge:** plik z 2 platformami, 3 grami, wszystkie referencje OK → `apply` wywołane z planem, mode='merge', userId z arg. Raport zwrócony.
   - **happy replace:** jak wyżej, mode='replace'.
   - **JSON broken:** rawJson = `'{xxxxxx'` → `err({ kind: 'invalid_json' })`. `apply` NIE wywołane.
   - **Unsupported version:** plik z `"version": 5` → `err({ kind: 'unsupported_version', version: 5 })`.
   - **Schema fail:** plik v2 bez `title` w jednej grze → `err({ kind: 'invalid_shape', issues: [...] })`.
   - **Migracja v1→v2:** plik v1 (bez externalId) → ok, idGenerator wygenerował UUID dla każdego rekordu. `plan.games[0].externalId === 'gen-1'` (jeśli generator jest licznikiem).
   - **Duplicate externalId w pliku (platforms):** dwie platformy z tym samym `externalId` → `err({ kind: 'duplicate_external_id', scope: 'platforms', externalId, indices: [0, 2] })`.
   - **Duplicate externalId w pliku (games):** analogicznie.
   - **Duplicate platform name w pliku:** dwie platformy z tym samym `name` → `err({ kind: 'duplicate_platform_name', name: 'PS5', indices: [0, 1] })`.
   - **Unknown platform reference (merge):** gra w pliku ma `platform: 'Switch'`, w pliku NIE ma takiej platformy ale user MA "Switch" w bazie → ok (cross-row check przepuszcza).
   - **Unknown platform reference (merge, brak też u usera):** gra ma `platform: 'Atari'`, w pliku ani u usera nie ma → `err({ kind: 'unknown_platform', platform: 'Atari', gameIndices: [1] })`.
   - **Unknown platform reference (replace):** gra ma `platform: 'Switch'`, w pliku NIE ma `Switch`, u usera JEST `Switch` → `err({ kind: 'unknown_platform', ... })` (w replace ignorujemy istniejące u usera).
   - **Domain error per row (game):** gra z `releaseYear: 1900` przejdzie schemy (jeśli min 1970 to nie — schema już to wyłapie). Ale np. `developer: '   '` (whitespaces) → po trim pusty → domain `developer_empty`. Zwrot: `err({ kind: 'domain_error', scope: 'games', index: 1, error: { kind: 'developer_empty' } })`.
   - **Idempotency conceptual** (na poziomie use case bez prawdziwego repo to słabsze; pełny test idempotencji w fazie 2 z realnym DrizzleImportRepository i czystą bazą).
3. Utwórz `apps/api/src/application/import/import-data.ts`:
   ```ts
   import type { ImportMode, ImportReport } from '@apex/shared';
   import type { GameRepository } from '../../domain/games/game-repository';
   import type { PlatformRepository } from '../../domain/platforms/platform-repository';
   import type { ImportRepository, ImportPlan } from '../../domain/import/import-repository';
   import { NewGame } from '../../domain/games/game';
   import { NewPlatform } from '../../domain/platforms/platform';
   import { err, ok, type Result } from '../../domain/shared/result';
   import { parseImport, type ImportParseError } from './parse-import';

   export type ImportError =
     | ImportParseError
     | { kind: 'duplicate_external_id'; scope: 'platforms' | 'games'; externalId: string; indices: number[] }
     | { kind: 'duplicate_platform_name'; name: string; indices: number[] }
     | { kind: 'unknown_platform'; platform: string; gameIndices: number[] }
     | { kind: 'domain_error'; scope: 'platforms' | 'games'; index: number; error: unknown };

   export class ImportData {
     constructor(
       private readonly gameRepo: GameRepository,
       private readonly platformRepo: PlatformRepository,
       private readonly importRepo: ImportRepository,
       private readonly idGenerator: () => string = () => crypto.randomUUID(),
     ) {}

     async execute(
       userId: string,
       rawJson: string,
       mode: ImportMode,
     ): Promise<Result<ImportReport, ImportError>> {
       // 1. parse + migrate + zod
       const parsed = parseImport(rawJson, this.idGenerator);
       if (!parsed.ok) return err(parsed.error);
       const snap = parsed.value;

       // 2. cross-row: duplicate externalId
       const dupP = findFirstDuplicate(snap.platforms.map((p) => p.externalId));
       if (dupP) return err({ kind: 'duplicate_external_id', scope: 'platforms', externalId: dupP.value, indices: dupP.indices });
       const dupG = findFirstDuplicate(snap.games.map((g) => g.externalId));
       if (dupG) return err({ kind: 'duplicate_external_id', scope: 'games', externalId: dupG.value, indices: dupG.indices });

       // 3. cross-row: duplicate platform name in file
       const dupName = findFirstDuplicate(snap.platforms.map((p) => p.name));
       if (dupName) return err({ kind: 'duplicate_platform_name', name: dupName.value, indices: dupName.indices });

       // 4. cross-row: every game.platform must resolve
       const platformsInFile = new Set(snap.platforms.map((p) => p.name));
       const platformsInUser =
         mode === 'merge' ? new Set((await this.platformRepo.list(userId)).map((p) => p.name)) : new Set<string>();
       const unknownByPlatform = new Map<string, number[]>();
       snap.games.forEach((g, i) => {
         if (!platformsInFile.has(g.platform) && !platformsInUser.has(g.platform)) {
           const arr = unknownByPlatform.get(g.platform) ?? [];
           arr.push(i);
           unknownByPlatform.set(g.platform, arr);
         }
       });
       const firstUnknown = unknownByPlatform.entries().next();
       if (!firstUnknown.done) {
         const [platform, gameIndices] = firstUnknown.value;
         return err({ kind: 'unknown_platform', platform, gameIndices });
       }

       // 5. domain validation per row → NewPlatform/NewGame
       const newPlatforms: NewPlatform[] = [];
       for (const [i, p] of snap.platforms.entries()) {
         const r = NewPlatform.create({ userId, name: p.name }, () => p.externalId);
         if (!r.ok) return err({ kind: 'domain_error', scope: 'platforms', index: i, error: r.error });
         newPlatforms.push(r.value);
       }
       const newGames: NewGame[] = [];
       for (const [i, g] of snap.games.entries()) {
         const r = NewGame.create(
           {
             userId,
             title: g.title,
             developer: g.developer,
             genre: g.genre,
             releaseYear: g.releaseYear,
             platform: g.platform,
             hoursPlayed: g.hoursPlayed,
             status: g.status,
             format: g.format,
             edition: g.edition,
             coverColor: g.coverColor,
           },
           () => g.externalId,
         );
         if (!r.ok) return err({ kind: 'domain_error', scope: 'games', index: i, error: r.error });
         newGames.push(r.value);
       }

       // 6. apply
       const plan: ImportPlan = { platforms: newPlatforms, games: newGames };
       const report = await this.importRepo.apply(userId, plan, mode);
       return ok(report);
     }
   }

   function findFirstDuplicate(values: string[]): { value: string; indices: number[] } | null {
     const seen = new Map<string, number[]>();
     values.forEach((v, i) => {
       const arr = seen.get(v) ?? [];
       arr.push(i);
       seen.set(v, arr);
     });
     for (const [value, indices] of seen) if (indices.length > 1) return { value, indices };
     return null;
   }
   ```
4. **Kluczowy detal:** wstrzykujemy do `NewPlatform.create` / `NewGame.create` `() => p.externalId` jako idGenerator — żeby UUID z pliku był zachowany, NIE wygenerowany od zera. To powód dla którego faza 1 External IDs zrobiła generator wstrzykiwalny.
5. `bun test apps/api/src/application/import` → ZIELONE.
6. `bun test` (cały api) → ZIELONE.
7. `bun run typecheck` → 0 błędów.
**Rezultat:** Use case `ImportData` orkiestruje cały pipeline, walidując wszystkie edge case'y. Faza 2 podłączy realne repo.

### Step 5: Final check
**Co robimy:**
1. Z roota: `bun install` jeszcze raz (sanity).
2. Z roota: `bun run typecheck` (jeśli skrypt na root nie istnieje, uruchom z `apps/api`).
3. `bun test` w `apps/api` → wszystko zielone.
**Rezultat:** Faza 1 zamknięta. Pipeline application kompletny.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- `Cannot find module '@apex/shared'` w `apps/api` — workspace nie został zaaplikowany. Z roota `bun install`. Sprawdź czy `apps/api/node_modules/@apex` istnieje.
- TS narzeka na "Cannot find type definition for @apex/shared" — `@apex/shared` nie ma `types` w `package.json`, ale skoro `exports` wskazuje na `.ts`, Bun + TS Bundler resolution to ogarnia. Jeśli nie — dodaj `"types": "./src/index.ts"` do `packages/shared/package.json`.
- Test "duplicate externalId" failuje bo `findFirstDuplicate` zwraca null — sprawdź czy faktycznie wstawiasz dwa identyczne UUID-y w teście.
- Test idempotency v1→v2 oczekuje stałych UUID — ale `migrateV1toV2` woła `idGenerator()` po kolei. Użyj licznika: `let n = 0; const gen = () => \`uuid-\${++n}\``. Dla 2 platformy + 3 gier → uuid-1..uuid-5.
- `NewGame.create` failuje na `developer: ''` z testu schemy — to jest OK, schema v1/v2 ma `min(1)` na developerze. Test "domain error" musi obejść schemy (np. `developer: '  '` — schema min(1) **akceptuje whitespaces**, dopiero domain trimuje). Sprawdź.
- Cross-row check `unknown_platform` — w trybie `merge` weryfikujemy też przeciw bazie usera; w `replace` NIE. Ten szczegół ma test, nie przeskocz.
