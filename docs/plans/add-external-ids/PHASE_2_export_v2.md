---
name: External IDs Phase 2 — Export bump to v2
description: Bump EXPORT_SCHEMA_VERSION = 2, dodaje externalId do ExportedGame i ExportedPlatform, aktualizuje mapper i testy
type: plan
---

# External IDs — Faza 2: Export v2

## Goal
Podnieść wersję schemy eksportu z `1` do `2` i emitować `externalId` w każdym
rekordzie (gra i platforma). To minimalna, jednolita zmiana — rozszerzenie typu,
mappera i testów. Nic poza tym.

Poprzednia faza (1) wprowadziła `externalId` w bazie. Teraz wynosimy go do
pliku eksportu, żeby importer (kolejne plany) miał czym uzgadniać upsert
`{...old, ...new}` per-row.

## Definition of Done
- [ ] `EXPORT_SCHEMA_VERSION = 2`
- [ ] `ExportedPlatform` ma pole `externalId: string`
- [ ] `ExportedGame` ma pole `externalId: string`
- [ ] `toSnapshot` przepisuje `externalId` zarówno dla gier jak i platform
- [ ] Wszystkie istniejące testy `apps/api/src/application/export/__tests__/export-data.test.ts` zaktualizowane do v2 i zielone
- [ ] `bun test` (cały api) → zielone
- [ ] `bun run typecheck` z `apps/api` → 0 błędów
- [ ] Smoke: `curl -i -b cookies.txt http://localhost:3001/api/export` → JSON ma `"version": 2`, każdy element `platforms[]` i `games[]` ma `externalId` w formacie UUID

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun.
**Katalog roboczy:** `apps/api`.
**Dependency:** Faza 1 (External IDs) ZAKOŃCZONA — domain encje mają `externalId`, repo zwraca, baza wypełniona.

## Design decisions
- `externalId` ląduje **bezpośrednio** w `ExportedGame` i `ExportedPlatform` jako pierwsze pole (przed pozostałymi). Czytelnie, w naturalnym order.
- **Sortowanie kolejności rekordów** w pliku NIE zmienia się — nadal po `name` ASC dla platform, po `(title, releaseYear)` ASC dla games. `externalId` to nie klucz sortowania. Determinizm zostaje.
- **Stare pliki v1 NIE są generowane przez ten kod** — od momentu mergeu, każdy eksport to v2. Plików v1 z przeszłości może być sporo na dyskach userów; importer (przyszłe plany) zna migrację v1→v2.
- **Obecne use case eksportu (`ExportData`) bez zmian w klasie** — zmiana to wyłącznie typ + mapper + stała wersji.

## Relevant files (edit only these)
- `apps/api/src/application/export/export-snapshot.ts` — bump wersji + nowe pola w typach + mapper
- `apps/api/src/application/export/__tests__/export-data.test.ts` — aktualizacja asercji (version=2, obecność externalId, sortowanie wciąż po name/title)

## Files to read but NOT edit
- `apps/api/src/domain/games/game.ts` — getter `externalId` dodany w fazie 1
- `apps/api/src/domain/platforms/platform.ts` — getter `externalId` dodany w fazie 1

## Constraints
- NIE wprowadzaj migracji odwrotnej v2→v1 (eksport zawsze emituje current).
- NIE waliduj formatu UUID w mapperze. Trust w domain.
- `externalId` to STRING — w typie i w pliku. Nie używaj `unknown`/`any`.
- Pole `externalId` JEST zawsze obecne w obu typach `Exported*` (NIE jest opcjonalne, NIE używaj warunkowego spread).

## Steps

### Step 1: Aktualizacja typów + mappera
**Co robimy:**
1. Otwórz `apps/api/src/application/export/export-snapshot.ts`.
2. Zmień stałą wersji:
   ```ts
   export const EXPORT_SCHEMA_VERSION = 2 as const;
   ```
3. Dodaj `externalId: string` do `ExportedPlatform`:
   ```ts
   export interface ExportedPlatform {
     externalId: string;
     name: string;
   }
   ```
4. Dodaj `externalId: string` do `ExportedGame` (na początku):
   ```ts
   export interface ExportedGame {
     externalId: string;
     title: string;
     // ...reszta bez zmian
   }
   ```
5. W `toSnapshot` w mapperze platform:
   ```ts
   .map<ExportedPlatform>((p) => ({ externalId: p.externalId, name: p.name }));
   ```
6. W mapperze games (przed `title`):
   ```ts
   .map<ExportedGame>((g) => ({
     externalId: g.externalId,
     title: g.title,
     // ...reszta bez zmian
   }));
   ```
7. `bun run typecheck` → 0 błędów.

### Step 2: Aktualizacja testów
**Co robimy:**
1. Otwórz `apps/api/src/application/export/__tests__/export-data.test.ts`.
2. W asercjach dot. version: `expect(snap.version).toBe(2)` (zamiast 1).
3. W asercjach dot. kształtu rekordów: dodaj sprawdzenie `expect(snap.games[0].externalId).toBe('expected-uuid')` lub `expect(snap.games[0]).toHaveProperty('externalId')`.
4. W `Game.fromPersistence({...})` w testach — przekazuj `externalId: '...'` (faza 1 już to wymusiła type-level).
5. Tam gdzie test używa snapshot/JSON-equals — zaktualizuj oczekiwany obiekt o `externalId`.
6. **Sortowanie**: jeden test sprawdza że gry o tym samym tytule są sortowane po `releaseYear` ASC. Upewnij się że `externalId` w teście NIE wpływa na sort (użyj różnych external IDs dla gier z tym samym title — sort musi nadal działać po year).
7. `bun test apps/api/src/application/export` → ZIELONE.
8. `bun test` → cały api zielony.

### Step 3: Smoke test endpoint
**Co robimy:**
1. `bun run dev`.
2. Zaloguj się (cookie).
3. `curl -s -b cookies.txt http://localhost:3001/api/export | head -c 1000`.
4. Sprawdź:
   - `"version": 2`
   - Każdy element `platforms[]` ma `externalId` (UUID 36-znakowy z myślnikami).
   - Każdy element `games[]` ma `externalId`.
5. Pobierz cały plik do `tmp.json`, otwórz w edytorze, sprawdź konsystencję (każdy rekord ma `externalId`, format wygląda jak UUID).
**Rezultat:** Eksport v2 działa end-to-end. Plan import (następny zestaw planów) ma poprawny input.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- Test failuje na `Object.keys(...)` order — kolejność kluczy w JS object jest insertion-order, mapper wstawia `externalId` jako pierwsze pole. Jeśli test asertuje konkretną kolejność `Object.keys` (rzadkie ale możliwe) — uaktualnij oczekiwaną.
- Test sortowania pęka bo wstawiasz różne externalId dla rekordów z tym samym title — co dobrze, ale po sort nadal year decyduje. Sprawdź czy test patrzy na `title`+`releaseYear` zamiast na `externalId`.
