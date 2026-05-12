# Phase 08 — Dead-code cleanup

## Goal
Usunąć kod, który nie jest używany przez żaden user-facing flow:
1. `GameForm` w trybie `action="create"` — nikt nie nawiguje do `/games/new`. Tworzenie idzie przez `AddGameDialog`.
2. `GameNewPage` + route `games/new` w `main.tsx`.
3. `NullCoverStorage` w `wiring.ts` — fałszywa atrapa zamiast `coverStorage: CoverStorage | null` + 503 w upload route.
4. `Game.toJSON()` w domenie (`apps/api/src/domain/games/game.ts:779-807`) — niespójna z `toGameResponse` w route, prawdopodobnie martwa.

## Definition of Done
- [ ] **Brak** pliku `apps/client/src/pages/game-new.tsx`.
- [ ] **Brak** route'a `games/new` w `apps/client/src/main.tsx`.
- [ ] **Brak** importu `GameNewPage` w `main.tsx`.
- [ ] `GameForm` przyjmuje wyłącznie tryb `edit` (rename na `GameEditForm`). Props `action` usunięty. Mutation `createGameMutation` usunięta z hooka komponentu.
- [ ] `NullCoverStorage` usunięte. `wiring.ts` eksportuje `coverStorage: CoverStorage | null`.
- [ ] `upload route` (`apps/api/src/routes/upload.ts`) zwraca 503 z problem+json `{ type: 'service-unavailable' }` jeśli `coverStorage === null`.
- [ ] `delete-game`, `update-game`, `cleanup-orphans` traktują `coverStorage === null` jako no-op (wraz z fazą 06 te zależności mogły zniknąć; jeśli wciąż wstrzykują storage — guard `if (this.coverStorage)`).
- [ ] `Game.toJSON()` usunięte z `domain/games/game.ts` JEŚLI grep potwierdzi 0 użyć poza testami (sprawdź `JSON.stringify(game)` w call sites).
- [ ] Klient: jeśli `permissions.coverStorageAvailable === false` — UI ukrywa "Upload cover" (już istnieje? — zweryfikuj).
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste w obu apkach.

## Context
**Weryfikacja niepotrzebności:**
```
grep -rn "games/new\\|GameNewPage" apps/client/src
```
→ tylko `main.tsx:8,39` i `pages/game-new.tsx`. Brak `Link to="/games/new"` ani `navigate('/games/new')`.

**`GameForm` tryby:**
- `action="create"` → wywoływany TYLKO z `GameNewPage`.
- `action="edit"` → wywoływany z `GameEditPage` (`apps/client/src/pages/game-edit.tsx:21`).

**`AddGameDialog`** (`apps/client/src/components/add-game-dialog.tsx`) ma własną kompletną implementację tworzenia gry (nie używa `GameForm`). To jest jedyna ścieżka create.

### Step 0: Context7
- Brak — czysty cleanup.

### Relevant files (edit / delete)
- DELETE: `apps/client/src/pages/game-new.tsx`.
- EDIT: `apps/client/src/main.tsx` — usuń import `GameNewPage` i linię routu `games/new`.
- EDIT: `apps/client/src/components/game-form.tsx` — usuń props `action`, `mode` (jeśli używany do `create`-specific behavior), branch `action === 'create'`, `createGameMutation`. Rename do `GameEditForm` (jeśli ma to sens — albo zostaw `GameForm` z założeniem że to tylko edit).
- EDIT: `apps/client/src/pages/game-edit.tsx` — zaktualizuj call site po rename / usunięciu propsu.
- EDIT: `apps/api/src/wiring.ts` — usuń klasę `NullCoverStorage`, `coverStorage: CoverStorage | null = coverStorageAvailable ? new UploadThingCoverStorage(...) : null`.
- EDIT: `apps/api/src/routes/upload.ts` — `if (!coverStorage) return problemJson(c, 503, ...)`.
- EDIT: `apps/api/src/domain/games/game.ts` — usuń metodę `toJSON()` (linie 779-807) PO weryfikacji.
- EDIT: `apps/api/src/application/cover-storage/cleanup-orphans.ts` — guard `if (!this.coverStorage) return { skipped: 'no_storage' }`.

### Files to read but NOT edit
- `apps/client/src/components/add-game-dialog.tsx` — żeby potwierdzić że jest niezależną implementacją create.
- `apps/client/src/pages/game-edit.tsx` — call site `GameForm`.

## Design decisions
- **Nie przemianowywać `GameForm` na `GameEditForm`** jeśli risk merge-conflict z innymi PR — zostaw nazwę, usuń tylko branch create.
- **`coverStorage: CoverStorage | null`** — wszystkie konsumenci (3-4 miejsca: upload, cleanup-orphans) guardują guard. To OK, tylko 3-4 punkty.
- **`Game.toJSON()`** — przed deletem zrób grep `JSON.stringify\\(.*game` i sprawdź. Jeśli jest użyte przez `c.json(games)` — Hono używa `JSON.stringify` w tle (które wywoła `toJSON`). Ryzyko że usunięcie zepsuje response. **Plan B**: zostawić, ale dodać komentarz `// not used — handlers use toGameResponse explicitly` LUB użyj go ZAMIAST `toGameResponse` (ujednolicić). **Decyzja**: jeśli `toGameResponse` jest jawnie wywoływane wszędzie — usuń `toJSON`.

## Constraints
- NIE usuwaj typu `GameKind = 'owned' | 'wishlist'` — to wciąż używane.
- NIE zmieniaj backendu `POST /api/games` w tej fazie — `AddGameDialog` używa tego endpointa.
- Sprawdź czy `apps/client/src/components/game-title-autocomplete.tsx` jest używany — może też dead code.

## Steps

### Step 1: Klient — usuń create flow z GameForm
1. Verify: `grep -rn "GameForm\\|games/new\\|GameNewPage" apps/client/src` — 0 zewnętrznych callerów `create` mode.
2. Usuń `apps/client/src/pages/game-new.tsx`.
3. W `main.tsx`: usuń import + route entry.
4. W `game-form.tsx`: usuń props `action`, branch `action === 'create'`, `createGameMutation`, ścieżkę submit dla create, `gameToFormState` branch dla pustego inputu (start w trybie edit zawsze ma `initialGame`).
5. `game-edit.tsx`: jeśli zmieniłeś sygnaturę propsów — zaktualizuj.
6. `bun --cwd apps/client run check` + `lint` → zielone.

**Rezultat:** rozmiar `game-form.tsx` spadł ~30-40%.

### Step 2: Wiring — `coverStorage: CoverStorage | null`
1. `wiring.ts`: usuń klasę `NullCoverStorage`. `coverStorage` typu `CoverStorage | null`.
2. `upload.ts` (`createUploadRoute(coverStorage)`): jeśli storage `null` → wszystkie handlery zwracają 503.
3. `cleanup-orphans.ts`: skip jeśli storage `null`.
4. W konsumentach `UpdateGame`, `DeleteGame` — po fazie 06 te zależności już nie istnieją. Jeśli nie wykonano fazy 06 — guard `if (this.coverStorage)`.
5. `bun --cwd apps/api test` → zielone.

**Rezultat:** brak fałszywej atrapy.

### Step 3: Domain — usuń `Game.toJSON()`
1. `grep -rn "JSON.stringify\\|toJSON" apps/api/src/routes apps/api/src/application` — sprawdź użycie.
2. Jeśli `c.json(games)` w `routes/games.ts:73` (lub gdziekolwiek) zwraca surowe `Game[]` (a nie `gameResponse[]`) → `toJSON` JEST używany. Sprawdź dokładnie. Jeśli wszędzie jest `toGameResponse` — usuwasz `toJSON` bez ryzyka.
3. Jeśli niepewność — **NIE usuwaj w tej fazie**; dodaj TODO i zostaw fazie 11 (game domain split) do ostatecznej decyzji.

**Rezultat:** martwy kod usunięty albo świadomie odłożony do fazy 11.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
