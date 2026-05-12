# Game Create Form Rebuild — Faza 3: Przebudowa `game-form.tsx`

## Goal
Przebuduj `apps/client/src/components/game-form.tsx` zgodnie z nowym układem:
1. **Platforma** jest pierwszym polem na górze formularza (sekcja "Platform" wędruje na samą górę panelu prawego, przed sekcją "Game Details").
2. **Tytuł** jest drugim polem — bezpośrednio pod platformą, jako combobox z dropdownem podpowiedzi IGDB.
3. Podpowiedzi pochodzą z hooka `useGameTitleAutocomplete` (faza 2) — debounce 300ms, request leci tylko gdy `igdbConfigured === true` (z `useIgdbStatusQuery`) ORAZ użytkownik wybrał platformę ORAZ tytuł ma ≥ 2 znaki.
4. Wybór kandydata z dropdownu hydratuje pola formularza: `title`, `developer`, `releaseYear`, `coverImage` (a do submit'u dokleja `metadataRef: { providerName: 'igdb', providerId }`).
5. Gdy IGDB NIE jest skonfigurowane — żadnego dropdownu; tytuł to zwykły `<Input>`, formularz działa po staremu.
6. Submit zachowuje obecny kontrakt: `useCreateGameMutation` z `kind: 'owned' | 'wishlist'` zależnie od `mode`, redirect na `/games/:id` lub `/wishlist/:id`. `useUpdateGameMutation` w trybie `edit` zostaje bez zmian — autocomplete działa tylko dla `action === 'create'`.

## Definition of Done
- [ ] W `game-form.tsx` sekcja "Platform" jest renderowana PRZED sekcją "Game Details" (kolejność DOM).
- [ ] Pole "Title" jest fizycznie w sekcji bezpośrednio pod "Platform" (możesz albo przenieść tylko Title do sekcji "Platform" jako pierwszy field, albo wydzielić nową sekcję "Game" zawierającą tylko Title+Developer i umieścić ją między "Platform" a "Game Details"). Wybierz wariant, który nie psuje wizualnej spójności reszty formularza.
- [ ] Gdy `action === 'create'` i `igdbConfigured === true` i `platform !== ''` i tytuł ≥ 2 znaków po debounce — pod inputem tytułu pojawia się dropdown z listą kandydatów IGDB (max 8 widocznych). Każdy kandydat pokazuje: tytuł, rok wydania (jeśli jest), developer (jeśli jest), mały thumbnail z `coverImageUrl` (jeśli jest).
- [ ] Kliknięcie kandydata: zamyka dropdown, ustawia `title`, `developer`, `releaseYear`, `coverImage` z kandydata, zapamiętuje `selectedCandidate` w lokalnym state komponentu. Edycja tytułu PO wyborze (ręczna zmiana) czyści `selectedCandidate` (i tym samym nie wyśle `metadataRef` przy submit).
- [ ] Submit (create + mode='owned') wysyła `metadataRef: { providerName: 'igdb', providerId: selectedCandidate.providerId }` GDY `selectedCandidate !== null`. W przeciwnym razie pole `metadataRef` nie jest dołączane.
- [ ] Submit (create + mode='wishlist') analogicznie: dokleja `metadataRef` gdy kandydat wybrany.
- [ ] Gdy `igdbConfigured === false` (lub query w stanie loading/error) — Title jest zwykłym Input bez dropdownu; formularz nadal działa.
- [ ] Tryb `edit` (`action === 'edit'`): brak autocomplete'a, brak dropdownu. Title jest zwykłym Input.
- [ ] Dropdown jest dostępny klawiaturą: ↓/↑ nawigacja, Enter wybiera, Esc zamyka. Outside-click zamyka. Blur inputa NIE zamyka natychmiast (musi pozwolić klikać kandydata — użyj `onMouseDown` zamiast `onClick` na itemie lub timeout 100ms na blur).
- [ ] Aria: input ma `role="combobox"`, `aria-expanded`, `aria-controls`, lista ma `role="listbox"`, item `role="option"` + `aria-selected`.
- [ ] `bun run check` + `bun run lint` czyste w `apps/client`.
- [ ] Smoke test ręczny (Step 3 niżej) wykonany i opisany.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm).
**Stack:** React + Tailwind. Projekt korzysta z Radix UI w niektórych miejscach (Dialog, AlertDialog), ale tutaj zostań przy własnym dropdownie — Radix `Combobox` nie istnieje w `@radix-ui/react-*` (musiałbyś brać `cmdk` lub `headlessui`, a projekt ich nie ma). Trzymaj się ręcznego dropdownu z `useRef` + `useEffect` (outside click) — to mniej zmian i pasuje do stylu repo.
**Komponenty UI w projekcie:** `Input`, `Select`, `Button`, `Icon`, `GameCover`, `PillSelect`, `FormField`, `FormFieldRow`, `SectionHeader`. Reużyj je.

### Step 0: Pobierz dokumentację
Użyj Context7:
- React: "useRef + useEffect outside-click pattern" (jeśli potrzebne)
- Tailwind CSS: "absolute positioning dropdown overlay" + "z-index utility classes"

Jeśli MCP niedostępny — wzoruj się na `apps/client/src/components/metadata-match-picker.tsx` (jest tam już lista kandydatów IGDB ze stylami) oraz na `apps/client/src/components/cover-color-picker.tsx` (wzorzec klikalnej listy).

### Relevant files (edit only these)
- `apps/client/src/components/game-form.tsx` — główny target.
- `apps/client/src/components/game-title-autocomplete.tsx` — NOWY sub-komponent (combobox: input + dropdown). Wydziel, żeby `game-form.tsx` nie przekroczył sensownej długości i żeby logika autocomplete'a była w jednym miejscu. Komponent przyjmuje `value`, `onChange`, `onPick(candidate)`, `platform`, `disabled`. WEWNĄTRZ używa `useIgdbStatusQuery` i `useGameTitleAutocomplete` z fazy 2.

### Files to read but NOT edit
- `apps/client/src/components/game-form.tsx` (przed edycją) — żeby wiedzieć co przenosisz.
- `apps/client/src/hooks/use-igdb-status.ts` — output fazy 2.
- `apps/client/src/hooks/use-game-title-autocomplete.ts` — output fazy 2.
- `apps/client/src/types.ts` — typ `MetadataCandidate`.
- `apps/client/src/lib/api.ts` — typ `CreateGameInput` (tam pole `metadataRef`).
- `apps/client/src/components/metadata-match-picker.tsx` — wzorzec stylowania listy kandydatów IGDB.

## Visual spec
**Layout sekcji (panel prawy w `game-form.tsx`, w kolejności od góry):**
1. **Sekcja "Platform"** (przeniesiona z dotychczasowego miejsca):
   - `SectionHeader` "Platform" / opis "Where you play this game."
   - Pole `Platform` (Select z istniejącą logiką dodawania platformy) — `FormField` w pierwszej kolumnie `FormFieldRow cols={1}` (na samej górze, pełna szerokość — żeby wybór był wyrazisty; albo `cols={2}` z Edition obok, sam zdecyduj patrząc na obecny układ).
2. **Sekcja "Game"** (NOWA, między Platform a poprzednią "Game Details"):
   - `SectionHeader` "Game" / opis "Search the title — we'll try to match it to IGDB."
   - Pole `Title` — używa `<GameTitleAutocomplete>` (nowy sub-komponent).
   - Pole `Developer` obok (lub w drugim wierszu) — pozostaje zwykłym Input, ALE jeśli `selectedCandidate` ustawiony, pole jest readOnly z subtelnym wskaźnikiem "from IGDB" i przyciskiem "edit manually" który czyści `selectedCandidate`. Wariant minimalny: zostaw Developer edytowalnym i tylko nadpisz wartość gdy wybór z IGDB — preferuj minimalny.
3. **Sekcja "Game Details"** (zostaje, BEZ pól Title i Developer — one są wyżej):
   - Genre, Release Year, Price, Purchase Date — bez zmian.
4. Reszta sekcji ("Status" dla owned, "Format" wewnątrz Platform lub osobno — zgodnie z obecnym układem; możesz zostawić Format w sekcji Platform jak teraz, albo przenieść do "Game Details" — preferuj minimalną zmianę, czyli zostaw Format w sekcji "Platform").
5. Sekcja "Notes" zostaje na dole.

**Komponent `<GameTitleAutocomplete>`:**
- Wygląd inputa: identyczny `<Input>` jak dotychczas.
- Dropdown: `absolute top-full left-0 right-0 mt-1 z-20 max-h-72 overflow-y-auto rounded-[7px] border border-apex-line-1 bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]`.
- Item: `flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-apex-line-5 aria-selected:bg-apex-line-5`. Lewa strona: 32x32 obrazek covera (lub szary kwadracik), prawa: tytuł (`text-[13px] font-medium text-apex-ink`), pod nim `developer · releaseYear` (`text-[11px] text-apex-muted`).
- Pusty stan (po debounce, gdy IGDB zwrócił 0 kandydatów): jeden item "No matches — type more or use your title" (nieklikalny, `text-apex-muted`).
- Stan loading (mid-fetch po debounce): jeden item "Searching IGDB…" z małym spinnerem.
- Stan degraded (zapas; faza 2 zwraca to przez `useMetadataCandidatesQuery`): wyświetl item "IGDB unavailable — continue manually" (nieklikalny).
- Brak dropdownu w ogóle gdy: `igdbConfigured !== true`, lub `platform === ''`, lub `disabled === true`, lub input nie ma focusa.

**Mobile (≤ sm):** dropdown nadal absolute pod inputem, ale `max-h-60`. Reszta layoutu — bez zmian, formularz już jest responsive.

## Design decisions
- `selectedCandidate` żyje w state komponentu `GameForm` (nie w sub-komponencie), bo submit potrzebuje znać `providerId`. `<GameTitleAutocomplete>` dostaje `onPick(candidate)` i woła je gdy user kliknie kandydata; `GameForm` ustawia wtedy `title`, `developer`, `releaseYear`, `coverImage` + `selectedCandidate`.
- Ręczna edycja tytułu PO wyborze kandydata czyści `selectedCandidate`. Powód: jeśli user zmienia tytuł, prawdopodobnie nie chce już matchowania starego kandydata. Edycja `developer` lub innych pól NIE czyści.
- W trybie `edit` autocomplete jest wyłączony — edycja istniejącej gry powinna być deterministyczna i nie podmieniać covera przez przypadkowe matchowanie.
- Dropdown używa custom hand-rolled implementacji (nie biblioteki) bo: (a) projekt nie ma `cmdk`/`headlessui`, (b) UI jest proste, (c) trzymamy się stylu repo. Klawiatura: `useState<number | null>` na `highlightedIndex`, key handlery `ArrowDown/ArrowUp/Enter/Escape` na inpucie.
- `useIgdbStatusQuery` woła się RAZ na sesję — `staleTime: Infinity` z fazy 2. Trzymaj go w `<GameTitleAutocomplete>` (a nie w `GameForm`), żeby `GameForm` w trybie `edit` nawet go nie odpalał.

## Constraints
- NIE wstawiaj logiki autocomplete'a do `game-form.tsx` — cała logika dropdownu siedzi w `<GameTitleAutocomplete>`. `game-form.tsx` przekazuje tylko props i obsługuje `onPick`.
- NIE używaj `headlessui`, `cmdk`, `downshift`, ani innych bibliotek niewymienionych w `package.json` — sprawdź `package.json` przed dodaniem importu.
- NIE wprowadzaj custom CSS — wyłącznie Tailwind utility classes (zgodnie z resztą repo).
- NIE modyfikuj `useCreateGameMutation`, `useUpdateGameMutation`, `CreateGameInput`, ani route'ów backendu.
- NIE używaj `setTimeout` do debounce w komponencie — debounce już jest w `useGameTitleAutocomplete` (faza 2).
- Komponent `GameTitleAutocomplete` musi działać też GDY `useIgdbStatusQuery` jest w `isLoading` — wtedy zachowuje się jakby IGDB było wyłączone (brak dropdownu), bez błyskania UI.
- Tryb `edit` (`action === 'edit'`): NIE renderuj autocomplete'u w ogóle. Użyj zwykłego `<Input>` jak teraz. Wewnątrz `game-form.tsx` przekaż prop `enabled={action === 'create'}` do `<GameTitleAutocomplete>` lub po prostu w trybie edit renderuj `<Input>`.

## Steps

### Step 1: Wydziel `<GameTitleAutocomplete>`
**Co robimy:**
1. Utwórz `apps/client/src/components/game-title-autocomplete.tsx`. Sygnatura:
   ```ts
   interface GameTitleAutocompleteProps {
     value: string;
     onChange: (v: string) => void;
     onPick: (candidate: MetadataCandidate) => void;
     platform: string;
     enabled: boolean; // false w trybie edit
     placeholder?: string;
   }
   export function GameTitleAutocomplete(props: GameTitleAutocompleteProps): JSX.Element;
   ```
2. Wewnątrz:
   - `const statusQuery = useIgdbStatusQuery();`
   - `const igdbConfigured = statusQuery.data?.igdbConfigured === true;`
   - `const autocomplete = useGameTitleAutocomplete({ title: value, platform, enabled: enabled && igdbConfigured });`
   - `const [open, setOpen] = useState(false);` — sterowane focus/blur/Escape.
   - `const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);`
   - `useRef` na wrapperze + `useEffect` z `mousedown` listenerem na document → outside click zamyka.
   - Renderuj `<Input>` jak dotychczas + warunkowo dropdown (gdy `open && enabled && igdbConfigured && platform !== '' && autocomplete.debouncedTitle.length >= 2`).
   - Item klik → `onPick(candidate); onChange(candidate.title); setOpen(false);` (NIE zmieniaj `value` przez onChange, jeśli faza 3 chce hydratować więcej pól — `onPick` na poziomie GameForm robi `set('title', c.title)` razem z resztą hydratacji).
   - Klawiatura: ArrowDown → highlight next, ArrowUp → prev, Enter → wybierz highlighted (preventDefault), Escape → setOpen(false).
   - Aria: `role="combobox"`, `aria-expanded={open}`, `aria-controls="game-title-autocomplete-listbox"`, `aria-autocomplete="list"`. Lista `role="listbox"` `id="game-title-autocomplete-listbox"`. Item `role="option"` + `aria-selected={i === highlightedIndex}`.
3. Style wg sekcji "Visual spec" wyżej.
**Rezultat:** komponent istnieje, kompiluje się, można go zaimportować.

### Step 2: Przebuduj `game-form.tsx`
**Co robimy:**
1. Otwórz `apps/client/src/components/game-form.tsx`.
2. Dodaj `const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidate | null>(null);` w stanie komponentu.
3. Dodaj handler:
   ```ts
   const onPickCandidate = (c: MetadataCandidate) => {
     setSelectedCandidate(c);
     setForm((f) => ({
       ...f,
       title: c.title,
       developer: c.developer ?? f.developer,
       releaseYear: c.releaseYear != null ? String(c.releaseYear) : f.releaseYear,
       coverImage: c.coverImageUrl ?? f.coverImage,
     }));
   };
   ```
4. Zmodyfikuj `set('title', ...)` (lub raczej onChange title-a) tak, żeby NA RĘCZNĄ ZMIANĘ tytułu zerował `selectedCandidate`:
   ```ts
   const onTitleChange = (v: string) => {
     setSelectedCandidate(null);
     set('title', v);
   };
   ```
   ALE: `onPickCandidate` musi ustawić title BEZ zerowania candidate'a. Rozwiązanie: w `onPickCandidate` ustawiamy state przez `setForm` bezpośrednio (jak wyżej) i NIE wołamy `set('title', ...)` ani `onTitleChange`. `<GameTitleAutocomplete>` woła `onPick` (NIE woła `onChange` z wartością kandydata).
5. Przenieś sekcję "Platform" jako pierwszą sekcję w panelu prawym (kolejność JSX: najpierw `<div>` z "Platform" SectionHeaderem, potem nowy `<div>` "Game" z Title+Developer, potem "Game Details" już bez Title i Developer, potem reszta).
6. W trybie `action === 'create'` użyj `<GameTitleAutocomplete value={form.title} onChange={onTitleChange} onPick={onPickCandidate} platform={form.platform} enabled={true} placeholder="e.g. Elden Ring" />` zamiast `<Input>`.
   W trybie `action === 'edit'` zostaw zwykły `<Input>` z `onChange={(e) => set('title', e.target.value)}`.
7. W `onSubmit`, w buildzie payloadu, dodaj warunkowo:
   ```ts
   ...(selectedCandidate && !isEdit
     ? { metadataRef: { providerName: 'igdb' as const, providerId: selectedCandidate.providerId } }
     : {}),
   ```
   (Sprawdź typ `CreateGameInput` w `lib/api.ts` — pole `metadataRef` już tam jest, patrz linia ~67.)
8. `bun run check` + `bun run lint` w `apps/client` → czyste.
**Rezultat:** formularz ma platformę na górze, tytuł pod nią z dropdownem, submit dokleja `metadataRef` gdy candidate wybrany.

### Step 3: Smoke test ręczny
**Co robimy:**
1. `bun run dev` (api + client).
2. Zaloguj się, idź na `/games/new` (lub URL dla create — sprawdź router):
   - Sprawdź że Platform jest pierwszym polem widocznym po nagłówku.
   - Wybierz platformę, zacznij wpisywać tytuł istniejącej gry (np. "Elden Ring"). Po ~300ms dropdown z kandydatami.
   - Wybierz kandydata → tytuł, developer, rok i cover się wypełniają.
   - Zmień ręcznie tytuł → cover NIE znika (zostaje), ale `selectedCandidate` jest czyszczone (nie zobaczysz tego w UI, ale przy save `metadataRef` nie pójdzie).
   - Submit → gra utworzona, redirect na `/games/:id`.
3. Powtórz to samo dla `/wishlist/new`.
4. Spróbuj bez wyboru kandydata (wpisz tytuł, nie klikaj dropdownu, kliknij save) → gra utworzona BEZ `metadataRef`.
5. (Opcjonalnie) Tymczasowo wymuś `igdbConfigured: false` w odpowiedzi (np. devtools network override albo zmień endpoint backendu na czas testu) — sprawdź że dropdown w ogóle się nie pokazuje.
6. Idź na edycję istniejącej gry — sprawdź że Title jest zwykłym Input, brak dropdownu.
**Rezultat:** wszystkie scenariusze działają, brak błędów w konsoli.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>
Zakończ pracę.
