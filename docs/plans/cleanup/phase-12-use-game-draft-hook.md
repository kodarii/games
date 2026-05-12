# Phase 12 — `useGameDraft` hook (unifikacja `game-form.tsx` i `game-view.tsx`)

## Goal
Wyodrębnić wspólny stan edycji gry (`DraftState`/`FormState`), konwersje (`gameToDraft`, `groszeToZl`/`zlToGrosze`, ISO date handling) i budowanie payloadu (`gameDraftToPayload`) z dwóch miejsc:
- `apps/client/src/components/game-form.tsx` (~80 linii state + 40 linii submit payload),
- `apps/client/src/pages/game-view.tsx` (~80 linii state + 30 linii submit payload).

Jedno źródło prawdy = jeden bug-fix w jednym miejscu. Po fazie 08 `game-form` ma tylko tryb edit, więc unifikacja jest prosta.

## Definition of Done
- [ ] Istnieje `apps/client/src/hooks/use-game-draft.ts` eksportujący `useGameDraft(initialGame: Game)`.
- [ ] Hook zwraca: `{ draft, set, reset, isDirty, errors, validate, toPayload }`.
- [ ] Istnieje `apps/client/src/lib/game-draft.ts` z czystymi funkcjami: `gameToDraft`, `draftToPayload`, `validateDraft`.
- [ ] `game-form.tsx` używa hooka — usunięte `FormState`, `gameToFormState`, ręczne budowanie payloadu.
- [ ] `game-view.tsx` używa hooka — usunięte `DraftState`, `gameToDraft`, ręczne budowanie payloadu.
- [ ] **Bez regresji**: edycja gry przez `/games/:id/edit` i przez inline edit na `/games/:id` zachowuje się identycznie jak przed refaktorem.
- [ ] `bun --cwd apps/client test` zielone (jeśli są), `bun --cwd apps/client run check` + `lint` czyste.
- [ ] Manualne smoke test: edycja gry przez oba flow → submit działa, pola się zachowują, błędy walidacji wyświetlają się.

## Context
**Aktualny stan**:
- `game-form.tsx:29-80` — `FormState`, `gameToFormState`. Submit (linie 136-176) ręcznie buduje payload z `{ kind, title: draft.title.trim(), ..., price: zlToGrosze(...), purchasedAt: ..., notes: draft.notes.trim() || null }`.
- `game-view.tsx:39-72` — `DraftState`, `gameToDraft`. Submit (linie 240-271) buduje prawie ten sam payload.

**Różnice**: drobne — `game-view` ma inline edit (multiple buttons z save'em), `game-form` ma jedno pole `submit`. Ale stan i payload są identyczne. Refaktor: state + payload do wspólnego hooka, submit handlers zostają w komponentach.

### Step 0: Context7
- React: "custom hook with reducer", "useReducer vs useState pattern" (opcjonalnie — może `useState` wystarczy).

### Relevant files (edit / create)
- NEW: `apps/client/src/lib/game-draft.ts` — czyste funkcje (testowalne bez React).
- NEW: `apps/client/src/lib/__tests__/game-draft.test.ts` — testy `gameToDraft`, `draftToPayload`, `validateDraft`.
- NEW: `apps/client/src/hooks/use-game-draft.ts` — hook React.
- EDIT: `apps/client/src/components/game-form.tsx` — usuń `FormState`, `gameToFormState`, ręczny payload; użyj hooka.
- EDIT: `apps/client/src/pages/game-view.tsx` — j.w.

### Files to read but NOT edit
- `apps/client/src/types.ts` — typ `Game`, `GameFormat`, `GameStatus`.
- `apps/client/src/lib/api.ts` — sygnatury `updateGame`, `UpdateGameInput`.
- `apps/api/src/application/games/update-game.ts` (po fazie 11) — kontrakt payloadu (Zod schema).

## Design decisions
- **Stan**: prosty `useState<Draft>` + setter helper `set(key, value)`. Reducer over-engineering.
- **Walidacja**: czysta funkcja `validateDraft(draft): Record<keyof Draft, string | undefined>` — niezależna od React, testowalna.
- **`toPayload(draft, opts: { kind: 'owned' | 'wishlist' })`** — czysta funkcja zwracająca `UpdateGameInput`:
  - `title.trim()`.
  - `releaseYear: draft.releaseYear ? Number(draft.releaseYear) : undefined`.
  - `price: draft.priceZl.trim() ? zlToGrosze(draft.priceZl) : null`.
  - `purchasedAt: draft.purchasedAt || null`.
  - `notes: draft.notes.trim() || null`.
  - `hoursPlayed: kind === 'wishlist' ? undefined : Number(...)`.
- **`isDirty`**: `JSON.stringify(draft) !== JSON.stringify(initialDraft)` — proste, działa dla obecnego kształtu.
- **Brak optimistic locking w hooku**: faza 03 dodaje `updatedAt` do payloadu (lub `If-Match` header) — hook po prostu przekazuje `updatedAt` z `initialGame`.

## Constraints
- NIE wrzucaj fetch/mutation do hooka — to zostaje w komponencie (TanStack Query). Hook tylko o STANIE i payloadu.
- NIE używaj `useReducer` jeśli `useState` wystarcza (premature complexity).
- NIE łącz tego z fazą 11 — backend split osobno.

## Steps

### Step 1: Czyste funkcje + testy (RED→GREEN)
1. Test (RED): `game-draft.test.ts`:
   - `gameToDraft(game)` mapuje wszystkie pola.
   - `draftToPayload(draft, { kind: 'owned' })` produkuje poprawny payload.
   - `draftToPayload(draft, { kind: 'wishlist' })` pomija `hoursPlayed`.
   - `validateDraft(invalidDraft)` zwraca błędy.
   - Empty `releaseYear` → `undefined` w payload.
   - Empty `priceZl` → `null` w payload.
2. Implementacja w `lib/game-draft.ts`.
3. `bun test` GREEN.

**Rezultat:** logika konwersji w jednym miejscu, przetestowana niezależnie od React.

### Step 2: Hook `useGameDraft`
1. `hooks/use-game-draft.ts`:
   ```ts
   export function useGameDraft(initialGame: Game) {
     const initial = useMemo(() => gameToDraft(initialGame), [initialGame.id]);
     const [draft, setDraft] = useState(initial);
     const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) =>
       setDraft(d => ({ ...d, [key]: value })), []);
     const reset = useCallback(() => setDraft(initial), [initial]);
     const errors = useMemo(() => validateDraft(draft), [draft]);
     const isDirty = useMemo(() => /* compare */, [draft, initial]);
     const toPayload = useCallback((opts: { kind }) => draftToPayload(draft, opts), [draft]);
     return { draft, set, reset, errors, isDirty, toPayload };
   }
   ```
2. Sprawdź `bun --cwd apps/client run check`.

### Step 3: Migracja `game-form.tsx` + `game-view.tsx`
1. `game-form.tsx`:
   - Usuń `FormState`, `gameToFormState`.
   - `const { draft, set, errors, isDirty, toPayload } = useGameDraft(initialGame)`.
   - Submit handler woła `updateGameMutation(toPayload({ kind: mode }))`.
   - Render — pola formularza czytają `draft`, wołają `set('field', e.target.value)`.
2. `game-view.tsx`:
   - Idem. Każdy inline-edit handler woła `toPayload` po lokalnej zmianie.
3. Manualnie: edycja gry przez `/games/:id/edit` i `/games/:id` (inline) → identyczne zachowanie jak przed.
4. `bun --cwd apps/client run check` + `lint` → 0 errors.

**Rezultat:** ~120 linii usuniętych z `game-form.tsx`, ~80 z `game-view.tsx`. Jedna ścieżka logiki.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
