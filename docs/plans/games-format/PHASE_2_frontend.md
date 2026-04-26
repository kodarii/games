# Games — Format (physical/digital) — Faza 2: Frontend

## Goal
Pokaż w UI czy gra jest w wersji `physical` czy `digital`. Formularz tworzenia/edycji ma kontrolkę PillSelect (Physical / Digital) w sekcji "Platform". Widok detali pokazuje pole "Format" w sekcji "Platform". Lista gier — bez zmian w MVP (świadoma decyzja, patrz **Design decisions**).

Backend (Faza 1) musi być zakończony — API zwraca i przyjmuje pole `format`.

## Definition of Done
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] W `/games/new` i `/games/:id/edit` w sekcji "Platform" widać kontrolkę "Format" z dwoma pillsami: Physical / Digital. W trybie create domyślnie zaznaczona "Digital".
- [ ] W trybie edit kontrolka pokazuje aktualny format gry
- [ ] Submit formularza wysyła `format` w body, lista gier po zapisie odświeża się
- [ ] W `/games/:id` w sekcji "Platform" pojawia się Field "Format" z wartością "Physical" / "Digital"
- [ ] Lista gier (`/games`) — BEZ ZMIAN

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**UI:** Tailwind + shadcn-style komponenty (Radix pod spodem). NIE pisz klas Tailwind z pamięci — kopiuj wzorce z istniejącego użycia `PillSelect` dla `status` w `apps/client/src/components/game-form.tsx`.
**Stack:** React + TanStack Query + react-router-dom. Backend (Faza 1) zwraca `format` jako wymagane pole w `Game`.
**Komponenty istniejące, do reużycia:** `PillSelect` (`apps/client/src/components/pill-select.tsx`) — generic `<T extends string>` z `value/options/onChange`. Już używany dla `status`.

### Relevant files (edit only these)
- `apps/client/src/types.ts` — `GAME_FORMATS = ['physical','digital'] as const` + `GameFormat` (analogicznie do istniejącego `GAME_SORT_FIELDS`/`GameSortField`); dodaj `format: GameFormat` do interface `Game`
- `apps/client/src/lib/api.ts` — w `CreateGameInput` dodaj `format: GameFormat;` (`UpdateGameInput = CreateGameInput` dziedziczy)
- `apps/client/src/components/game-form.tsx` — `FormState.format`, `EMPTY.format = 'digital'`, `gameToFormState` przepisuje `format`, stała `FORMAT_OPTS`, JSX kontrolki w sekcji "Platform", `onSubmit.payload.format`
- `apps/client/src/pages/game-view.tsx` — inline helper `formatLabel`, dodatkowy `<Field label="Format" ... />` w sekcji "Platform"

### Files to read but NOT edit
- `apps/client/src/components/pill-select.tsx` — sygnatura `PillSelect<T extends string>`
- `apps/client/src/components/form-field.tsx` — `FormField`/`FormFieldRow`
- `apps/client/src/components/section-header.tsx` — `SectionHeader`
- `apps/client/src/lib/queries.ts` — `useCreateGameMutation`, `useUpdateGameMutation` (bez zmian — JSON payload przepuszczany)
- `apps/client/src/pages/games-columns.tsx` — celowo BEZ zmian; tylko czytasz, żeby potwierdzić skipnięcie listy

## Design decisions
- `GAME_FORMATS` w `types.ts` jako tablica + derived type — single source of truth dla typu i list opcji (jak `GAME_SORT_FIELDS`).
- `format` w `CreateGameInput`/`UpdateGameInput` jest WYMAGANE (`format: GameFormat`) — frontend zawsze wysyła wartość. Backend ma default w Zod, ale FE z niego nie korzysta.
- W formie pole "Format" trafia do sekcji "Platform" (logicznie: jak masz tę grę). Renderowane jako osobny `FormFieldRow cols={1}` PO `Platform / Edition / Hours Played` — pełna szerokość daje lepiej oddychający PillSelect z 2 opcjami.
- W view: dodaj `<Field label="Format" value={formatLabel(game.format)} />` jako 4ty element `FieldGrid` w sekcji Platform. `FieldGrid cols={3}` na lg → 3 w pierwszym rzędzie + 1 w drugim (auto-flow). Akceptowalne; alternatywnie `cols={2}` daje siatkę 2x2 — DECYZJA: zostaje `cols={3}`.
- `formatLabel(f: GameFormat)`: `f === 'physical' ? 'Physical' : 'Digital'`. Inline w `game-view.tsx` — drobna funkcja, jeden konsument, NIE wydzielać do `lib/`.
- Lista gier (`pages/games-columns.tsx`): celowo BEZ zmian w MVP. Powód: kolumna Platform już ma 2 linie (Platform + Edition). Format na trzeciej linii = przeładowanie. Jeśli okaże się ważne wizualnie — w osobnym ticketcie rozważyć subtelny indicator (mała ikonka 💿/⬇️ obok platformy lub dedykowana kolumna).

## Constraints
- NIE pisz Tailwind/Radix z pamięci — kopiuj wzorce z istniejącego użycia `PillSelect` dla `status` w `game-form.tsx`
- NIE twórz nowego komponentu — `PillSelect` jest gotowy
- NIE rób `format` opcjonalnym w `Game` interface — backend zawsze zwraca, FE wymaga
- `formatLabel` definiuj inline — NIE wydzielaj do osobnego pliku `lib/`
- NIE modyfikuj `pages/games-columns.tsx` — świadoma decyzja "skip dla MVP"

## Steps

### Step 1: Typy + API contract
**Pliki:** `apps/client/src/types.ts`, `apps/client/src/lib/api.ts`

**Co robimy:**
1. W `types.ts` dodaj (w sąsiedztwie `GAME_SORT_FIELDS`):
   ```ts
   export const GAME_FORMATS = ['physical', 'digital'] as const;
   export type GameFormat = (typeof GAME_FORMATS)[number];
   ```
   Dodaj `format: GameFormat;` do interface `Game`.
2. W `api.ts`:
   - Importuj `GameFormat` z `@/types`
   - W `CreateGameInput` dodaj `format: GameFormat;`
   - `UpdateGameInput = CreateGameInput` — dziedziczy automatycznie
3. `bun run --filter '*' typecheck` → wskaże błędy w `game-form.tsx` i `game-view.tsx` (brak pola `format`). Tym zajmiemy się w Step 2 i 3.

**Rezultat:** typy spięte. Typecheck pokazuje konkretne miejsca do naprawy.

### Step 2: Formularz — kontrolka PillSelect
**Plik:** `apps/client/src/components/game-form.tsx`

**Co robimy:**
1. Dodaj import: `import type { GameFormat } from '@/types';`
2. W typie `FormState` dodaj `format: GameFormat;`. W stałej `EMPTY` dodaj `format: 'digital'`. W `gameToFormState(g)` dodaj `format: g.format`.
3. Tuż obok `STATUS_OPTS` dodaj:
   ```ts
   const FORMAT_OPTS: { value: GameFormat; label: string }[] = [
     { value: 'physical', label: 'Physical' },
     { value: 'digital', label: 'Digital' },
   ];
   ```
4. W JSX, w sekcji "Platform", ZARAZ PO `<FormFieldRow cols={3}>...</FormFieldRow>` (z polami Platform/Edition/Hours Played), dodaj nowy blok:
   ```tsx
   <FormFieldRow cols={1}>
     <FormField label="Format" required>
       <PillSelect
         value={form.format}
         options={FORMAT_OPTS}
         onChange={(v) => set('format', v)}
       />
     </FormField>
   </FormFieldRow>
   ```
5. W `onSubmit.payload` dodaj linijkę `format: form.format,`
6. `bun run --filter '*' typecheck` + `bun run lint` → czyste

**Rezultat:** formularz pokazuje 2 pillsy "Physical/Digital" w sekcji Platform. Tworzenie i edycja gry przekazuje `format` w body.

### Step 3: Widok detali — Field "Format"
**Plik:** `apps/client/src/pages/game-view.tsx`

**Co robimy:**
1. Po importach dodaj inline helper:
   ```ts
   const formatLabel = (f: 'physical' | 'digital') =>
     f === 'physical' ? 'Physical' : 'Digital';
   ```
   (Lub przyjmij `GameFormat` z `@/types` — kwestia stylu, oba OK.)
2. W sekcji "Platform" w `<FieldGrid cols={3}>` dodaj 4ty `<Field>` PO `Hours Played`:
   ```tsx
   <Field label="Format" value={formatLabel(game.format)} />
   ```
   (Trafi do drugiego rzędu na `lg` — to OK.)
3. `bun run --filter '*' typecheck` + `bun run lint` → czyste

**Rezultat:** w `/games/:id` w sekcji Platform widać 4 Fieldy: Platform, Edition, Hours Played, Format.

### Step 4: Manualny test end-to-end
**Co robimy:**
1. Odpal stack z roota: `bun run dev`
2. W przeglądarce:
   - `/games/new` — wypełnij wymagane pola, wybierz Format = "Physical", Submit. Po sukcesie wracasz na listę.
   - Wejdź na świeżo utworzoną grę (`/games/:id`) — w sekcji Platform widać "Physical" w Field "Format".
   - Wejdź w edit (`/games/:id/edit`) — pillsa "Physical" jest zaznaczona. Zmień na "Digital", Save. Wracasz na widok, format = "Digital".
   - Otwórz starą grę (sprzed migracji) — `/games/:id` pokazuje "Digital" (backfill z fazy 1).
3. Konsola przeglądarki — brak errorów ani warningów.

**Rezultat:** feature działa end-to-end. Faza 2 zakończona.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- Po Step 1 typecheck w `game-form.tsx` mówi że `Game.format` nie istnieje — to znak że zapomniałeś dodać `format: GameFormat;` do interface `Game` w `types.ts`. Wróć do Step 1.
- `PillSelect` pokazuje pillsy ale żaden nie jest zaznaczony — sprawdź czy `value` jest typu `GameFormat` (string-literal), a nie szerszego `string`. Generic `<T extends string>` wymaga zgodności typów.
- W trybie edit pillsa nie pre-selectuje aktualnej wartości — sprawdź `gameToFormState`, czy przepisuje `format: g.format` (a nie pomija pola).
- Lista gier nagle "wybuchła" w typecheckcie — najpewniej dotknąłeś `pages/games-columns.tsx`. Cofnij — ten plik nie ma być zmieniany.
