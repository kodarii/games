# Apex — Design System

Style guide wyciągnięty z Teams page. Każda nowa strona/komponent powinien używać tokenów z `tailwind.config.js` i komponentów z `src/components/` zamiast przypadkowych wartości.

## 0. Zasady ogólne

- **Dense but quiet.** Typografia mała (12–14 px), kolory stonowane, kontrast buduje hierarchia rozmiaru + wagi, nie saturacja.
- **Hairline borders over shadows.** Strukturę rysują cienkie linie (1 px, `apex.line.*`). Cień tylko dla "floating" elementów (elevated icon button, popover, modal).
- **Flat backgrounds.** Główne tło = `#fff`. Szarość pojawia się tylko w hoverach/selection i nagłówku tabeli. Brak gradientów poza dekoracyjnymi avatarami.
- **Radius rośnie z komponentem.** Chipy 4–5 px, przyciski 6–7 px, card-level 10–12 px. `rounded-full` tylko dla avatarów i dot-wskaźników.
- **Monospaced iconography.** Wszystkie ikony są lineart, stroke 1.2–1.5, viewBox 16, `currentColor`. Wyjątek — status badges.

## 1. Tokeny (Tailwind)

Wszystko żyje pod `apex.*` w `tailwind.config.js`. **Nie dodajemy hardkodowanych hexów do JSX** — brakujący odcień najpierw dostaje nazwany token.

### Text (skala ink → muted)

| token            | hex       | kiedy |
|------------------|-----------|-------|
| `text-apex-ink`  | `#1c1c1e` | nagłówki, primary cell text, aktywna nawigacja |
| `text-apex-ink-2`| `#3a3a3a` | button/filter label, hover na nagłówkach kolumn |
| `text-apex-ink-3`| `#4a4a4a` | nav item (idle), pagination digit |
| `text-apex-ink-4`| `#5a5a5a` | hbar-icon, per-page button |
| `text-apex-ink-5`| `#666666` | hover icon (more-btn), elevated button |
| `text-apex-ink-6`| `#888888` | ghost icon button, pagination page info |
| `text-apex-muted`| `#9a9a9a` | subtitle strony, header tabeli |
| `text-apex-faint`| `#b0b0b0` | sub-labels komórek (email, task, "Since ...") |
| `text-apex-hint` | `#b8b8b8` | section-label uppercase, placeholdery, idle search icon |
| `text-apex-kbd`  | `#c0c0c0` | kbd chip, chevrony w user row |
| `text-apex-idle` | `#c8c8c8` | idle ikony w akcjach wierszy |
| `text-apex-disabled` | `#cccccc` | disabled pagination |
| `text-apex-accent` | `#4F6EF7` | primary brand, aktywne ikony nav |

### Linie (border)

| token                | hex       | zastosowanie |
|----------------------|-----------|--------------|
| `border-apex-line-1` | `#e2e2e2` | główna karta (tabela) |
| `border-apex-line-2` | `#e4e4e4` | buttony, inputy, filter pills |
| `border-apex-line-3` | `#e8e8e8` | sidebar separator, kbd chip |
| `border-apex-line-4` | `#ebebeb` | wewnętrzne dywizory, toolbar/pagination |
| `border-apex-line-5` | `#f0f0f0` | linie wierszy tabeli, logo-row |

Heurystyka: im bliżej treści, tym słabsza linia.

### Tła / tint

| token                    | hex       | kiedy |
|--------------------------|-----------|-------|
| `bg-white`               | `#fff`    | domyślne tło |
| `bg-apex-surface-head`   | `#f2f2f2` | thead tabeli |
| `bg-apex-surface-hover`  | `#f5f5f5` | hover nav itemów, ghost icon button |
| `bg-apex-surface-hover2` | `#f6f6f6` | hover filter/per-page button |
| `bg-apex-surface-chip`   | `#f8f8f8` | kbd chip, user-row hover |
| `bg-apex-row`            | `#f0f3ff` | zaznaczony wiersz tabeli |
| `bg-apex-row-hover`      | `#fafbff` | hover wiersza tabeli |

### Status

| token                       | hex       | znaczenie |
|-----------------------------|-----------|-----------|
| `fill-apex-status-progress` | `#4F6EF7` | "On Progress" / "Waiting for Review" |
| `fill-apex-status-pending`  | `#f59e0b` | "Pending" (trójkąt) |
| `fill-apex-status-done`     | `#10b981` | "Done" |
| `fill-apex-status-inactive` | `#ef4444` | "Inactive" |

Zasada: **status używa koloru + kształtu** (circle / triangle / check), nigdy samego koloru.

### Shadows

| token         | wartość |
|---------------|---------|
| `shadow-apex-1` | `0 1px 4px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.06)` — floating button |
| `shadow-apex-2` | `0 2px 8px rgba(0,0,0,.15), 0 0 0 1px rgba(0,0,0,.08)` — hover/elevated |

Stosujemy tylko do:
- "floating" action buttons (gear, hbar-icon),
- w przyszłości: popovery, menu, toasts.

Tabele/karty/panele = **1 px border, zero shadow**.

## 2. Typografia

Rodzina: **Inter** (300–700). Nie używamy generycznego `text-xs/sm/base` — zawsze wprost `text-[Npx]`.

| rola                  | size / weight / leading | kolor            |
|-----------------------|-------------------------|------------------|
| Page title            | 15 / 700 / 1.25         | `apex-ink`       |
| Page subtitle         | 12 / 400 / 1.4          | `apex-muted`     |
| Section label (caps)  | 10 / 600 tracking-[0.08em] uppercase | `apex-hint` |
| Table header          | 12 / 500                | `apex-muted`     |
| Cell — name           | 13.5 / 600 / 1.35       | `apex-ink`       |
| Cell — primary bold   | 13 / 600 / 1.35         | `apex-ink`       |
| Cell — primary        | 13 / 400 / 1.35         | `apex-ink`       |
| Cell — sub            | 11.5 / 400 / 1.35       | `apex-faint`     |
| Button / filter label | 12.5 / 400              | `apex-ink-2`     |
| Nav item              | 13.5 / 400, active 600  | `apex-ink-3` / `apex-ink` |
| Pagination digit      | 12 / 400                | `apex-ink-3` (active: white na `apex-ink`) |
| Kbd hint              | 10 / 400                | `apex-kbd`       |

## 3. Spacing

| kontekst                       | wartość  |
|--------------------------------|----------|
| Padding headera / toolbar (x)  | `24px` (`px-6`) |
| Padding contentu / tabeli (x)  | `20px` (`px-5`) |
| Padding headera (y)            | `pt-4 pb-[10px]` |
| Padding wiersza tabeli (y)     | `14px`   |
| Padding komórki tabeli (x)     | `12px`   |
| Odstęp między buttonami toolbara | `8px` (`gap-2`) |
| Odstęp w grupie (ikona+label)  | `10–11 px` |
| Odstęp wewnątrz przycisku      | `5–6 px` |

Pod `16 px` → preferujemy exact-px (`p-[14px]`), żeby uniknąć skokowej skali Tailwinda. Powyżej — standardowe utilities.

## 4. Border radius (skala)

| radius | komponent |
|--------|-----------|
| 4 px   | kbd chip, mikro-chipy |
| 5 px   | pagination button, per-page, `IconButton variant="ghost-sm"` |
| 6 px   | `IconButton variant="ghost"` |
| 7 px   | filter/search/input, nav item |
| 8 px   | `IconButton variant="elevated"`, rogi sticky thead |
| 10 px  | hbar-icon, user row, logo mark |
| 12 px  | table card (główny container) |
| full   | avatar, fav-dot, status-dot |

## 5. Layout strony

Szkielet każdej strony pod-sidebarowej:

```tsx
<>
  <PageHeader icon={...} title="..." description="..." actions={...} />
  <Toolbar>...</Toolbar>
  <div className="scroll-thin flex-1 overflow-y-auto bg-white px-5 pb-4 pt-1">
    <TableCard>...</TableCard>  {/* lub inne treści */}
  </div>
</>
```

- Sidebar ma stałe `248 px`, flush-left, 100% wysokości okna.
- Całość = `h-screen w-screen`, brak zewnętrznych paddingów.
- Scroll zamyka się wewnątrz content-area, **nie** na body.

## 6. Komponenty reużywalne

Wszystkie w `src/components/` (poza `ui/` — tam shadcn primitives).

### `PageHeader`
```tsx
<PageHeader
  icon={<Icon.users size={22} />}
  title="Teams"
  description="Manage and collaborate within your organization's teams."
  actions={<IconButton aria-label="Notifications"><Icon.bell size={18} /></IconButton>}
/>
```
Sygnatura: kwadratowa elevated-icon 38 × 38 + 15/700 tytuł + 12/400 opis + slot `actions`.

### `Toolbar` / `ToolbarSpacer`
```tsx
<Toolbar>
  <FilterButton>All Projects</FilterButton>
  <ToolbarSpacer />
  <SearchInput shortcut="⌘1" containerClassName="w-[220px]" />
  <IconButton variant="elevated" aria-label="Settings"><Icon.gear size={14} /></IconButton>
</Toolbar>
```
Flex row z `gap-2`, `px-6 pb-3`. `ToolbarSpacer` to cukier na `<div className="flex-1" />`.

### `FilterButton`
Outline pill z chevronem (domyślnie). `chevron={false}` wyłącza ikonę. Przyjmuje wszystkie propsy `<button>`.

### `SearchInput`
```tsx
<SearchInput
  value={...}
  onChange={...}
  shortcut="⌘1"
  placeholder="Search..."
  containerClassName="w-[220px]"
/>
```
Ikona search + native input + opcjonalny `KbdChip`. `containerClassName` kontroluje szerokość całego inputa, `className` przekazywane jest na `<input>`.

### `IconButton`
Trzy warianty pokrywające wszystkie użycia:
- `variant="ghost"` (domyślny) — 30 × 30, `rounded-6`, transparent + hover `surface-hover`. Bell w nagłówku.
- `variant="ghost-sm"` — 28 × 28, `rounded-5`, idle szary. Row actions (more-btn).
- `variant="elevated"` — 32 × 32, `rounded-8`, white + `shadow-apex-1`. Floating akcje (gear).

### `KbdChip`
```tsx
<KbdChip>⌘1</KbdChip>
```
Automatycznie osadzany w `SearchInput`. Używany też samodzielnie w nav items itp.

### `Pagination`
```tsx
<Pagination
  page={page}
  totalPages={16}
  onPageChange={setPage}
  perPage={7}
  onPerPageClick={...}
/>
```
- Algorytm numerowania: `[1..5] ...[last]` gdy current ≤ 4, ślizga się gdy current w środku, `[1]... [last-4..last]` gdy pod koniec.
- "..." jako `apex-faint`. Active pigułka: `apex-ink` tło + white tekst.
- `perPage` jest opcjonalne — przycisk po prawej znika bez niego.

### `DataTable` (TanStack Table)
**Wszystkie tabele w aplikacji pisane są z użyciem `@tanstack/react-table`.** Wrapper `components/data-table.tsx` renderuje dowolny `Table<T>` z naszym stylingiem (thead sticky z `bg-apex-surface-head`, wiersze z border-apex-line-5, hover/selected, sortable headers z ikoną stanu).

Wzorzec użycia (strona):
```tsx
const columnHelper = createColumnHelper<Game>();

const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => <Checkbox ... />,
    cell: ({ row }) => <Checkbox ... />,
    enableSorting: false,
    meta: { cellClassName: 'w-10 pl-5 pr-3', headerClassName: 'px-[14px]' },
  }),
  columnHelper.accessor('title', {
    header: 'Title',
    cell: ({ row }) => <TitleCell game={row.original} />,
    meta: { minWidth: 260 },
  }),
  // ...
];

const table = useReactTable<Game>({
  data: data.items,
  columns,
  state: { pagination, sorting, rowSelection },
  onPaginationChange: setPagination,
  onSortingChange: setSorting,
  onRowSelectionChange: setRowSelection,
  manualPagination: true,   // server-side paging
  manualSorting: true,      // server-side sort
  rowCount: data.total,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => String(row.id),
});

<DataTable table={table} />
```

Zasady:
- **Paginacja/sortowanie są server-side** (`manualPagination`/`manualSorting`) — API akceptuje `page`, `perPage`, `sort`, `dir`, `search`.
- Nasz własny `<Pagination/>` sterowany z poziomu strony — nie używamy `table.getCanNextPage()` itp.; paginacja komunikuje się z backendem przez effect.
- `column.id` musi odpowiadać polu akceptowanemu przez `?sort=` w API. Kolumny nienumeryczne (np. `'actions'`, `'select'`) mają `enableSorting: false`.
- `getRowId: row => String(row.id)` zapewnia stabilne klucze selekcji między re-fetch-ami.
- `ColumnMeta` jest augmentowane w `data-table.tsx` — `minWidth`, `cellClassName`, `headerClassName`. Nie dodajemy żadnego innego stylingu w `ColumnDef` poza meta.

Dodanie nowego pola sortowalnego:
1. Backend — dopisz klucz do `SORTABLE` w `apps/api/src/routes/<resource>.ts`.
2. Frontend — dodaj akcesor kolumny z odpowiednim `id`.

### `StatusBadge`
Generyczny — bierze `variant: 'progress' | 'info' | 'pending' | 'done' | 'inactive'` + `label`. Mapowanie domena → variant robi strona (np. `statusFor(game.status)` w `pages/games.tsx`). **Nowe warianty dodajemy tylko w `status-badge.tsx`**, nigdy inline SVG w komponencie strony.

### Sidebar / AppLayout
`layout/sidebar.tsx` i `layout/app-layout.tsx` — w 99% przypadków nie edytujemy. Nowe sekcje w nav: dopisujemy entry do `mainNav` / `bottomNav` tablicy.

## 7. Stany

- **Hover**: `surface-hover`/`hover2` dla wrappers, `line-5` dla icon-button ghost-sm. Kolor tekstu zwykle bez zmian.
- **Active / selected**: ink tło + white (paginacja), niebieski tint (`apex-row`) dla powierzchni, niebieski pasek `::before` dla nav.
- **Focus**: `focus-visible:ring-1 focus-visible:ring-apex-accent` dla form controls, `focus-within:border-apex-ink-6` dla search/input.
- **Disabled**: `text-apex-disabled`, `cursor-default`, brak hoveru. Nie obniżamy alpha całego elementu.
- **Transitions**: `.1s` dla background, `.15s` dla shadow/border. Nic dłuższego.

## 8. Iconografia

- `src/components/icons.tsx` — katalog. Nowe glyphy **tylko** tam.
- ViewBox `0 0 16 16`, stroke `1.2–1.5`, `fill="none"`, `currentColor`.
- Render sizes: 10 (meta / pagination chevron), 12 (chevron), 13–14 (inline label), 18 (header right), 22 (page title icon).

## 9. Kiedy łamać reguły

- **Nigdy dla koloru / shadow / radius** bez uprzedniego dodania tokena do `tailwind.config.js`. Jednokrotne `[#xyz]` w JSX → token.
- **Nigdy dla statusów** — każdy nowy status = case w `StatusBadge`.
- **Nigdy ręcznie `<table>`** — wszystkie tabele przechodzą przez `DataTable` + `useReactTable`.
- Layout można łamać dla widoków pełnoekranowych (detail/editor) — wtedy pomijamy TableCard, ale zachowujemy `PageHeader + Toolbar`.

## 10. Checklist przed dodaniem komponentu

1. Czy kolor/radius/typografia są w tokenach? Jeśli nie — dodaj token, potem kodź.
2. Czy istnieje gotowy komponent (`IconButton`, `FilterButton`, `PageHeader`, `Pagination`...)? Użyj, nie duplikuj.
3. Czy ikona jest w `icons.tsx`? Jeśli nie — dodaj.
4. Stany hover/active/disabled spójne z §7?
5. Nie dodałeś nowego shadowa ani radiusa poza skalą?
