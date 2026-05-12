# Phase 09 — `apiFetch` helper (DRY w `apps/client/src/lib/api.ts`)

## Goal
Zredukować 23× powtórzony `if (!r.ok) { ... throw ... }` envelope do JEDNEGO helpera. Plus zunifikować dwie wersje error-handling (z `readErrorMessage` + 4 endpointy które jej NIE używają i tracą `detail` z problem+json).

## Definition of Done
- [ ] W `apps/client/src/lib/api.ts` istnieje helper `apiFetch<T>(path, init?): Promise<T>` który:
  - Dodaje `credentials: 'include'`.
  - Dla `body` typu `object` (nie `FormData`, nie `BodyInit`) auto-serializuje JSON + ustawia `Content-Type`.
  - Sprawdza `r.ok`; przy błędzie woła `readErrorMessage` (parsing problem+json + legacy fallback).
  - Rzuca `Error` z polami `status` i `body` na obiekcie (kompatybilność z istniejącymi konsumentami).
  - Obsługuje network error (`TypeError`) zwracając czytelny komunikat.
  - Parsuje response JSON (z opcją `responseType: 'text' | 'blob'` dla exportu).
- [ ] **Zero** wystąpień `if (!r.ok)` w `apps/client/src/lib/api.ts` poza implementacją `apiFetch` (i ewentualnie 1-2 wyjątków dla `204 No Content` z gołym `fetch`).
- [ ] **Wszystkie** GET endpointy (które dziś nie używają `readErrorMessage`) korzystają z `apiFetch` i pokazują `detail` z problem+json.
- [ ] `apps/client/src/lib/api.ts` skurczone z ~356 linii do ~80-100 linii.
- [ ] `bun --cwd apps/client test` zielone (jeśli są testy), `bun --cwd apps/client run check` + `lint` czyste.
- [ ] Manualne smoke test: błąd 400 z backendu → toast z `detail` (nie generycznym `"Failed to X: 400"`).

## Context
**Aktualny stan**: `apps/client/src/lib/api.ts:20-30` ma `readErrorMessage` (poprawnie parsuje RFC 7807 `detail`/`title` + legacy `{error}`). Ale tylko 8 z 23 wywołań jej używa, drugie 8 ma uproszczoną wersję, 7 GET nie używa wcale.

**Backend error format** (po fazie 02 z problem+json): `{ type, title, status, detail, ... }` (Content-Type `application/problem+json`).

### Step 0: Context7
- (Niewielkie potrzeby. TanStack Query: `mutationFn` zwracanie typu — sprawdź czy potrzebujesz `unknown` vs `T`.)

### Relevant files (edit)
- `apps/client/src/lib/api.ts` — kompletny rewrite z `apiFetch` jako pojedynczym helperem.
- `apps/client/src/lib/__tests__/api-fetch.test.ts` — NOWY. Mock fetch, sprawdza:
  - 200 JSON → zwrócony obiekt.
  - 400 problem+json → `Error` z `detail` jako message.
  - 500 plain text → fallback message.
  - Network error → czytelny error.
  - FormData body → brak `Content-Type` (przeglądarka ustawia z boundary).
- `apps/client/src/components/**` — sprawdź czy są konsumenci czytający `(e as any).body` / `.status` — zachowaj te pola na rzuconym Error.

### Files to read but NOT edit
- `apps/api/src/routes/_problem-json.ts` — format problem+json (po fazie 02).

## Design decisions
- **Body convention**: `apiFetch('/api/games', { method: 'POST', body: { title: 'X' } })` — jeśli `body` jest obiektem (nie FormData/Blob), auto-JSON. Jeśli string/FormData/Blob — pass-through.
- **Error shape**: `class ApiError extends Error { status: number; body: unknown; }` — explicit class lepiej niż `(e as any)`.
- **Return type**: generic `<T>`. Dla `void` endpointów: `apiFetch<void>(...)` — helper jeśli `204` lub puste body → resolve `undefined`.
- **Idempotency-Key** (z fazy 05): apiFetch przyjmuje `idempotencyKey?: string` w opts; jeśli przekazany → dodaje header. Dla retry przez TanStack Query — wygeneruj raz w mutationFn, użyj w opts.

## Constraints
- NIE usuwaj typów `CreateGameInput`, `UpdateGameInput` itd. — to publiczne API używane przez komponenty.
- NIE zmieniaj sygnatur funkcji wyższego poziomu (`createGame`, `fetchGames` itp.) — komponenty się na nie napisały.
- NIE wprowadzaj `axios` lub innej biblioteki — `fetch` wystarczy.

## Steps

### Step 1: Test apiFetch (RED) + implementacja (GREEN)
1. Test (RED): scenariusze wymienione w DoD. Bun ma `bun:test` + Bun ma natywny mock fetch (lub `mock.module('node:fetch'...)` — sprawdź).
2. Implementacja:
   ```ts
   export class ApiError extends Error {
     constructor(message: string, readonly status: number, readonly body: unknown) {
       super(message);
     }
   }
   async function apiFetch<T>(path: string, opts?: { method?, body?, idempotencyKey?, responseType? }): Promise<T> { ... }
   ```
3. `bun test` GREEN.

### Step 2: Zamień 23 call sites na `apiFetch`
Idź po kolei przez `lib/api.ts`:
- `fetchGames`, `fetchGame`, `fetchPlatforms`, `fetchGenres`, `fetchDevelopers`, `fetchMyPermissions`, `exportData` — używają `apiFetch` (teraz dostają `detail` z problem+json zamiast generic msg).
- `createGame`, `updateGame`, `deleteGame`, `moveToCollection` — używają `apiFetch` + `idempotencyKey` (dla `createGame` i `moveToCollection`).
- `enrichGameMetadata`, `fetchMetadataCandidates`, `fetchMetadataStatus` — `apiFetch`.
- `createWishlistItem`, `createPlatform`, `deletePlatform`, `createGenre`, `deleteGenre`, `createDeveloper`, `deleteDeveloper` — `apiFetch`.
- `importData`, `uploadCover` — `apiFetch` z FormData (uploadCover) + `idempotencyKey`.

### Step 3: Sprawdź konsumentów `(e as any).status / .body`
1. Grep: `grep -rn "as any).status\\|as any).body" apps/client/src`.
2. Każdy konsument zamień na `if (e instanceof ApiError) ...`.
3. `bun --cwd apps/client run check` → 0 errors.

**Rezultat:** `lib/api.ts` ~85 linii, jednolite error handling, problem+json detail wszędzie.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
