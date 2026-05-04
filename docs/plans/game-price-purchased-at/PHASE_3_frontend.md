# Game price + purchasedAt — Faza 3: Frontend

## Goal
Pokaż i pozwól edytować nowe pola: `price` (PLN, wpisywane jako złote z dwoma miejscami po przecinku, wysyłane do API jako integer w groszach) i `purchasedAt` (data zakupu, input typu `date`, format `YYYY-MM-DD`). Pola opcjonalne, **domyślnie `null`** — pusty input wysyła `undefined`. **Cena** widoczna we wszystkich widokach listy (desktop tabela, desktop grid, mobile list) oraz w widoku szczegółowym. **`purchasedAt` widoczne TYLKO w widoku szczegółowym (`game-view.tsx`) i w formularzu (`game-form.tsx`)** — NIE pokazujemy daty zakupu w żadnej liście (decyzja produktowa). NIE dodajemy filtra po cenie, sortowania ani sumarycznej wartości — to osobny scope.

## Definition of Done
- [ ] `apps/client/src/types.ts` — interfejs `Game` ma `price: number | null` (grosze) i `purchasedAt: string | null` (`YYYY-MM-DD`, plain date BEZ godziny)
- [ ] `apps/client/src/lib/api.ts` — `CreateGameInput` i `UpdateGameInput` mają opcjonalne `price?: number | null` (grosze) i `purchasedAt?: string | null` (`YYYY-MM-DD`)
- [ ] Helper w nowym pliku `apps/client/src/lib/money.ts`:
  - `groszeToZl(grosze: number): string` (np. `12999 → '129.99'`)
  - `zlToGrosze(zl: string): number | null` (parsuje string typu `129,99` lub `129.99` → `12999`; pusty string → `null`; zły input → `null`)
- [ ] `apps/client/src/components/game-form.tsx` — dodane pola Price (input numeryczny w sekcji "Game Details") i Purchase Date (input `type="date"`); konwersja zł↔grosze przy submit; brak walidacji własnej (server odpowiada błędem)
- [ ] `apps/client/src/pages/game-view.tsx` — w trybie read i edit pokazuje cenę (sformatowaną jako `129,99 zł`) oraz datę zakupu (sformatowaną lokalnie). Inline-edit działa identycznie jak istniejące pola tekstowe.
- [ ] `apps/client/src/pages/games-columns.tsx` — nowa kolumna **Price** (sformatowana, prawe wyrównanie, `—` dla `null`)
- [ ] `apps/client/src/pages/games-grid.tsx` — cena widoczna na karcie (pod platformą lub w wierszu dolnym; `—` jeśli brak)
- [ ] `apps/client/src/pages/games-mobile-list.tsx` — **tylko cena** (NIE data zakupu) w sekcji rozwijanej (nowy `DetailRow`); cena też w nagłówku karty (small, obok platformy/roku) — bez psucia layoutu
- [ ] Pusta cena (we wszystkich widokach) i pusta data zakupu (tylko detail/form) wyświetla się jako `—` (myślnik).
- [ ] Build kliencki przechodzi: `cd apps/client && bun run build`
- [ ] `cd apps/client && bun run lint` czyste

Agent kończy pracę WYŁĄCZNIE gdy wszystkie powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**UI:** shadcn/ui + Tailwind. Istniejące komponenty: `Input`, `FormField`, `FormFieldRow`, `Select`, `PillSelect`. **NIE pisz nowych klas Tailwind ani nowych ui-komponentów** — używaj tych co są.

### Step 0: Pobierz dokumentację
Użyj Context7:
- React: "controlled input with number formatting"
- Nie potrzeba shadcn/Radix dla tej fazy — wystarczą istniejące `Input` i `FormField`.

## Visual spec
**Formularz (`game-form.tsx`)** — dorzucamy do **istniejącej sekcji "Game Details"** dodatkowy `FormFieldRow cols={2}` poniżej releaseYear:
- **Price (PLN)** — `<Input type="number" step="0.01" min="0" placeholder="e.g. 129.99" />` — etykieta "Price (PLN)"
- **Purchase Date** — `<Input type="date" />` — etykieta "Purchase Date"

**Widok (`game-view.tsx`)** — w siatce read-only z metadanymi gry dodaj dwie linie:
- **Price**: w trybie read pokazuje sformatowaną cenę "129,99 zł" (dla `null` → "—"). W trybie edit `<Input type="number" step="0.01">`.
- **Purchased**: w trybie read pokazuje datę lokalnie (`new Date(date).toLocaleDateString('pl-PL')`, gdzie `date` to string `YYYY-MM-DD`). W trybie edit `<Input type="date">` z wartością `purchasedAt` BEZPOŚREDNIO (bez slice'a, bo to już `YYYY-MM-DD`).

**Desktop tabela (`games-columns.tsx`)** — dodaj kolumnę **Price** po `Format` (przed `Release Year`):
- nagłówek: "Price"
- cell: `formatPriceZl(row.original.price)` (zwraca `129,99 zł` lub `—`)
- klasa wyrównania prawej: `<span className="text-[13px] text-apex-ink tabular-nums">…</span>`
- `meta: { minWidth: 110 }`

**Desktop grid (`games-grid.tsx`)** — w `<GameCard>`, w bloku z metadanymi (po `<div>{game.platform}</div>`), dodaj nowy wiersz:
- `<div className="truncate text-[11px] leading-[1.35] text-apex-faint tabular-nums">{formatPriceZl(game.price)}</div>`
- Wyświetlaj zawsze (nawet `—`) — spójność wysokości karty.

**Mobile list (`games-mobile-list.tsx`)**:
- W nagłówku karty (linia z platformą i rokiem) dodaj cenę jako trzeci segment, oddzielony `|`:
  - `{game.platform}{game.releaseYear != null ? ` | ${game.releaseYear}` : ''}{game.price != null ? ` | ${formatPriceZl(game.price)}` : ''}`
  - Cena widoczna od razu — także bez rozwijania karty.
- W rozwijanej sekcji (`{isExpanded && ...}`) dodaj **tylko jeden** nowy `<DetailRow>`:
  - `<DetailRow label="Price" value={game.price != null ? formatPriceZl(game.price) : null} />`
  - **NIE dodawaj `DetailRow Purchased`** — data zakupu nie pokazuje się w żadnej liście (ani mobile, ani desktop), tylko w game-view.

## Relevant files

### Edytuj:
- `apps/client/src/types.ts`
- `apps/client/src/lib/api.ts` — typy DTO (`CreateGameInput`, `UpdateGameInput`)
- `apps/client/src/components/game-form.tsx`
- `apps/client/src/pages/game-view.tsx`
- `apps/client/src/pages/games-columns.tsx`
- `apps/client/src/pages/games-grid.tsx`
- `apps/client/src/pages/games-mobile-list.tsx`

### Tworzysz nowe:
- `apps/client/src/lib/money.ts`

### Czytaj ale NIE edytuj:
- `apps/api/src/routes/games.ts` — żeby wiedzieć że POST/PUT przepuszczają body
- `apps/api/src/application/games/create-game.ts`, `update-game.ts` — żeby wiedzieć kontrakt wejściowy: `price?: number` (grosze), `purchasedAt?: string | Date` (Zod coerce)
- `apps/client/src/components/form-field.tsx`, `apps/client/src/components/ui/input.tsx` — żeby naśladować istniejący pattern

## Constraints
- NIE pisz własnego date pickera — `<Input type="date" />` działa wszędzie i nie wymaga lib.
- NIE dodawaj walidacji ceny po stronie klienta poza HTML5 (`min`, `step`). Walidacja jest na backendzie — komunikat błędu już istnieje w `errorMessage` z mutacji.
- NIE używaj waluty innej niż PLN. Format `Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })`.
- Konwersja zł→grosze: zawsze `Math.round(parseFloat(...) * 100)` żeby uniknąć błędów float (`1.10 * 100 = 110.00000000000001`).
- Pusty string w polu ceny → wyślij `undefined` w payload (NIE `null` przy create, NIE `0`). Przy update — wyślij `null` jeśli wzorzec UI w istniejącym `coverImage` to robi (sprawdź jak działa kasowanie obrazu w `update-game`); inaczej `undefined`.
- Pusty string w polu daty → `undefined` przy create; przy update analogicznie do ceny.
- `Game.purchasedAt` z API to **plain date string** w formacie `YYYY-MM-DD` (np. `"2024-06-15"`). Do `<input type="date">` przekaż BEZPOŚREDNIO (bez slice'a, bez konwersji). Format pasuje 1:1.
- `formatPurchasedAt(date)` używa `new Date(date).toLocaleDateString('pl-PL')` — ŚWIADOMIE akceptujemy timezone-trap dla użytkowników poza strefą PL (single-user app).
- Komponent `GameForm` NIE może urosnąć powyżej 400 linii. Jeśli dorzucanie 2 pól go przekroczy — wydziel sekcję "Purchase" do sub-komponentu w tym samym pliku.

## Steps

### Step 1: Helper money.ts + typy
**Co robimy:**
1. Utwórz `apps/client/src/lib/money.ts`:
   ```ts
   export function groszeToZl(grosze: number): string {
     return (grosze / 100).toFixed(2);
   }

   export function zlToGrosze(input: string): number | null {
     const trimmed = input.trim().replace(',', '.');
     if (!trimmed) return null;
     const n = Number.parseFloat(trimmed);
     if (!Number.isFinite(n) || n < 0) return null;
     return Math.round(n * 100);
   }

   export function formatPriceZl(grosze: number | null): string {
     if (grosze == null) return '—';
     return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(grosze / 100);
   }

   export function formatPurchasedAt(date: string | null): string {
     if (!date) return '—';
     return new Date(date).toLocaleDateString('pl-PL');
   }
   ```
2. Zaktualizuj `apps/client/src/types.ts`:
   ```ts
   price: number | null;          // grosze
   purchasedAt: string | null;    // YYYY-MM-DD (plain date, BEZ godziny)
   ```
   w interfejsie `Game`.
3. Zaktualizuj `apps/client/src/lib/api.ts` — dodaj do `CreateGameInput`:
   ```ts
   price?: number;             // grosze
   purchasedAt?: string;       // YYYY-MM-DD
   ```
   i analogicznie do `UpdateGameInput` z `| null` (replace pattern, jak `coverImage`):
   ```ts
   price?: number | null;
   purchasedAt?: string | null;
   ```
   Jeśli `UpdateGameInput` to alias do `CreateGameInput` — rozdziel je albo dorzuć `| null` w jednym miejscu zgodnie z istniejącym wzorcem dla `coverImage`.
4. `cd apps/client && bun run build` — typy się kompilują (mogą się posypać miejsca, gdzie `Game.price` jest używane — naprawiaj jak najbardziej minimalnie).
**Rezultat:** typy ok, helper money.ts dostępny.

### Step 2: GameForm — dodanie pól
**Co robimy w `apps/client/src/components/game-form.tsx`:**
1. Rozszerz `FormState`:
   ```ts
   priceZl: string;          // wartość pokazywana jako "129.99"
   purchasedAt: string;      // "YYYY-MM-DD" lub ""
   ```
2. Rozszerz `EMPTY` — `priceZl: '', purchasedAt: ''`.
3. Rozszerz `gameToFormState(g)`:
   ```ts
   priceZl: g.price != null ? groszeToZl(g.price) : '',
   purchasedAt: g.purchasedAt ?? '',  // już YYYY-MM-DD, bez slice'a
   ```
4. W `onSubmit`, w obiekcie `payload`:
   ```ts
   price: form.priceZl.trim() ? zlToGrosze(form.priceZl) ?? undefined : undefined,
   purchasedAt: form.purchasedAt ? form.purchasedAt : undefined,
   ```
5. W JSX, **w sekcji "Game Details"** (tej co ma title/developer/genre/releaseYear) dodaj kolejny `FormFieldRow cols={2}` POD wierszem z genre i releaseYear:
   ```tsx
   <FormFieldRow cols={2}>
     <FormField label="Price (PLN)">
       <Input
         type="number"
         step="0.01"
         min="0"
         placeholder="e.g. 129.99"
         value={form.priceZl}
         onChange={(e) => set('priceZl', e.target.value)}
       />
     </FormField>
     <FormField label="Purchase Date">
       <Input
         type="date"
         value={form.purchasedAt}
         onChange={(e) => set('purchasedAt', e.target.value)}
       />
     </FormField>
   </FormFieldRow>
   ```
6. Zaimportuj `groszeToZl, zlToGrosze` z `@/lib/money`.
7. `cd apps/client && bun run build && bun run lint` — bez błędów.
**Rezultat:** dodawanie i edycja gry przez formularz pełnoekranowy pozwala wprowadzić cenę i datę.

### Step 3: GameView — read + inline edit
**Co robimy w `apps/client/src/pages/game-view.tsx`:**
1. Rozszerz `DraftState` o:
   ```ts
   priceZl: string;
   purchasedAt: string;
   ```
2. Rozszerz `gameToDraft(g)`:
   ```ts
   priceZl: g.price != null ? groszeToZl(g.price) : '',
   purchasedAt: g.purchasedAt ?? '',  // już YYYY-MM-DD, bez slice'a
   ```
3. Znajdź miejsce gdzie inne metadane (np. genre, releaseYear, edition) są renderowane jako pary label/value. Dorzuć dwa nowe wiersze:
   - **Price**: read mode → `formatPriceZl(game.price)`; edit mode → `<Input type="number" step="0.01" min="0" ... />`
   - **Purchased**: read mode → `formatPurchasedAt(game.purchasedAt)`; edit mode → `<Input type="date" ... />`
4. W handlerze submitu (gdzie buduje się obiekt `payload` do `useUpdateGameMutation`), dodaj:
   ```ts
   price: draft.priceZl.trim() ? zlToGrosze(draft.priceZl) ?? null : null,
   purchasedAt: draft.purchasedAt ? draft.purchasedAt : null,
   ```
   (Replace pattern: `null` w body = pole wyczyszczone po update'cie. Spójne z wzorcem `coverImage`.)
5. Importuj `groszeToZl, zlToGrosze, formatPriceZl, formatPurchasedAt` z `@/lib/money`.
6. `cd apps/client && bun run build && bun run lint` — czyste.
**Rezultat:** widok szczegółowy pokazuje i pozwala edytować cenę + datę zakupu inline.

### Step 4: Listy (desktop tabela, grid, mobile)
**Co robimy:**
1. **`apps/client/src/pages/games-columns.tsx`** — dodaj nową kolumnę po `format`, przed `releaseYear`:
   ```tsx
   columnHelper.accessor('price', {
     header: 'Price',
     cell: ({ row }) => (
       <span className="text-[13px] text-apex-ink tabular-nums">
         {row.original.price != null
           ? formatPriceZl(row.original.price)
           : <span className="text-apex-hint">—</span>}
       </span>
     ),
     meta: { minWidth: 110 },
   }),
   ```
   I dodaj import `formatPriceZl` z `@/lib/money`.
2. **`apps/client/src/pages/games-grid.tsx`** — w `<GameCard>`, dodaj wiersz pod `<div>{game.platform}</div>`:
   ```tsx
   <div className="truncate text-[11px] leading-[1.35] text-apex-faint tabular-nums">
     {game.price != null ? formatPriceZl(game.price) : '—'}
   </div>
   ```
   I dodaj import `formatPriceZl`.
3. **`apps/client/src/pages/games-mobile-list.tsx`**:
   - import: **tylko `formatPriceZl`** z `@/lib/money` (NIE `formatPurchasedAt` — data zakupu nie pokazuje się w mobile list)
   - W nagłówku karty zaktualizuj linię z metadanymi:
     ```tsx
     <div className="text-[11.5px] leading-[1.35] text-apex-faint truncate">
       {game.platform}
       {game.releaseYear != null ? ` | ${game.releaseYear}` : ''}
       {game.price != null ? ` | ${formatPriceZl(game.price)}` : ''}
     </div>
     ```
   - W rozwijanej sekcji, po `<DetailRow label="Release Year" value={game.releaseYear} />`, dorzuć **tylko jedną** linię (NIE Purchased):
     ```tsx
     <DetailRow
       label="Price"
       value={game.price != null ? formatPriceZl(game.price) : null}
     />
     ```
4. `cd apps/client && bun run build && bun run lint` — czyste.
5. **Smoke test ręczny:**
   - `bun run dev:api` + `bun run dev:client`
   - Dodaj nową grę z ceną `129.99` i datą zakupu — zapisz, otwórz widok, sprawdź formatowanie `129,99 zł` i datę po polsku
   - Sprawdź widok desktop tabela — kolumna Price pokazuje cenę (data zakupu NIE pojawia się w tabeli)
   - Sprawdź widok desktop grid — karta pokazuje cenę pod platformą (bez daty zakupu)
   - Sprawdź mobile (window <768px) — cena w nagłówku po `|`, oraz w rozwiniętej sekcji jako DetailRow (BEZ Purchased — data zakupu pokazuje się tylko w game-view)
   - Otwórz widok szczegółowy gry — data zakupu widoczna w trybie read i edit
   - Wyedytuj inline cenę na `0` → po zapisie `0,00 zł` (legitna wartość)
   - Wyczyść pole ceny → po zapisie `—` we wszystkich widokach
   - Spróbuj wpisać ujemną cenę — backend powinien zwrócić błąd, frontend powinien go pokazać w generycznym `errorMessage` (BEZ ludzkich komunikatów per `kind`)
**Rezultat:** cena widoczna we wszystkich widokach listy (desktop tabela + grid + mobile), spójne formatowanie `pl-PL`, brak regresji w innych kolumnach/kartach.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <opis problemu, jaki błąd, jaka hipoteza>`
Zakończ pracę.
