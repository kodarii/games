---
name: Phase 3 Frontend
description: Strona /data z sekcją Export (button → download .json) + sidebar entry "Data"
type: plan
---

# Export Data — Faza 3: Frontend

## Goal
Dać zalogowanemu userowi UI do eksportu kolekcji do pliku JSON: nowy route
`/data` z sekcją "Export" (button "Export to JSON" → pobranie pliku) oraz pozycja
"Data" w sidebarze. Strona zostawia placeholder dla przyszłej sekcji "Import"
(tu jeszcze tylko napis "Coming soon").

## Definition of Done
- [ ] `bun run check` z `apps/client` → 0 błędów (lub z roota — sprawdź package.json)
- [ ] Pozycja "Data" w sidebarze prowadzi do `/data`
- [ ] Strona `/data` renderuje się bez błędów w konsoli
- [ ] Button "Export to JSON" pobiera plik `apex-export-YYYY-MM-DD.json` (przeglądarka pokazuje dialog zapisu lub od razu zapisuje)
- [ ] Pobrany plik jest poprawnym JSON-em z `version: 1`, `exportedAt`, `platforms[]`, `games[]`
- [ ] Podczas eksportu button pokazuje stan loading (disabled + label "Exporting…")
- [ ] Błąd HTTP (np. 401) → inline alert "Failed to export. Please try again."
- [ ] Sekcja "Import" jest widoczna jako placeholder z napisem "Coming soon" (disabled state)
- [ ] Mobile: strona responsywna, button full-width na <640px

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm). `bun run dev`, `bun run check` z `apps/client`.
**Routing:** react-router-dom z `createBrowserRouter` w `src/main.tsx` — pozycje pod `AppLayout`/`ProtectedRoute`.
**API client:** `src/lib/api.ts` — wzorzec `fetchGames` z `credentials: 'include'`. Odpowiedź eksportu to **blob** (plik), NIE JSON do parsowania w aplikacji.
**UI:** Radix UI + Tailwind (apex-* design tokens). NIE pisz klas z pamięci — pobierz docs przez Context7.
**Layout:** full-viewport (Jira/Monday-style) — pasuje do istniejącego `AppLayout`. Zachowaj.
**Stan:** TanStack Query JEST dostępny, ale eksport to one-shot mutation bez cache — wystarczy lokalny `useState` + ręczny `fetch`. Albo `useMutation` bez `queryClient`. Wybierz prostsze (`useState`).

## Design decisions
- Eksport pobierany przez **blob download flow**: `fetch('/api/export', { credentials: 'include' })` → `await r.blob()` → `URL.createObjectURL(blob)` → ukryty `<a download={filename}>` → `.click()` → `URL.revokeObjectURL`. Filename brany z `Content-Disposition` header (parsuj). Fallback: `apex-export.json`.
- Brak TanStack Query dla eksportu — to nie jest dane do wyświetlenia, to plik. Trzymaj logikę w lokalnym `useExport()` hooku.
- Strona `/data` ma DWIE sekcje: "Export" (działa) i "Import" (placeholder). Wizualnie dwie karty obok siebie na desktop, jedna pod drugą na mobile.
- Pozycja sidebar **"Data"** z ikoną `download` (sprawdź dostępne ikony w `components/icons.tsx`; jeśli nie ma `download` — użyj najbliższej semantycznie, np. `rows` lub `zap`).
- **Komponent prezentacyjny** `<DataPage />` + **hook** `useExport()` — separacja logika/UI (zgodnie z user memory + style projektu).
- Loading state: button disabled + tekst "Exporting…". Nie używaj spinnera (brak go w istniejącym UI — by nie tworzyć nowego komponentu).
- Error state: czerwony alert pod buttonem, dismissible po następnej próbie.
- Brak toasta — w projekcie nie ma jeszcze toast systemu. Inline alert wystarczy.

## Step 0: Pobierz dokumentację (Context7)
**Co robimy:** użyj Context7:
- `react-router-dom`: "createBrowserRouter nested routes children"
- Tailwind CSS: "responsive grid columns sm md, full-width button on mobile"
- (Opcjonalnie) MDN przez WebFetch: "URL.createObjectURL revokeObjectURL download attribute" — jeśli flow blobu jest nowy.

NIE pobieraj Radix tym razem — ten ekran nie używa Dialog/Select/Dropdown. Tylko zwykłe HTML elementy + Tailwind.

**Rezultat:** masz świeże API.

## Visual spec

**Strona `/data`:**
- `<PageHeader icon={<Icon.rows />} title="Data" />` (lub odpowiednia ikona)
- Pod headerem grid 2-kolumnowy na ≥768px, 1-kolumnowy poniżej:
  ```
  [ Export card ]   [ Import card (placeholder) ]
  ```

**Karta "Export"** (white, border `border-apex-line-3`, rounded `rounded-[12px]`, padding `p-5`):
- Ikona w kółku (jak w `dictionaries.tsx` — `bg-apex-surface-head`, 36×36px)
- Tytuł `text-[15px] font-semibold text-apex-ink`: "Export to JSON"
- Opis `text-[13px] text-apex-muted`: "Download a snapshot of all your platforms and games. Useful for backups or migrating to another instance."
- Lista bullet-points (małe, `text-[12px] text-apex-muted`): "• Includes platforms and games", "• Excludes internal IDs", "• Schema version 1"
- Button primary: "Export to JSON" → `bg-apex-accent text-white rounded-[8px] px-4 py-2 text-[13px] font-semibold`. Width: `w-full sm:w-auto`.
- Stan loading: button disabled + tekst "Exporting…", `opacity-60`.
- Stan error: pod buttonem czerwony tekst `text-[12px] text-red-600`: "Failed to export. Please try again."

**Karta "Import"** (placeholder):
- Ten sam layout co Export, ale:
- Tytuł "Import from JSON"
- Opis: "Restore platforms and games from a previously exported JSON file."
- Badge "Coming soon" — `text-[11px] uppercase tracking-wide bg-apex-surface-head text-apex-muted px-2 py-1 rounded-[6px]`
- Brak buttona (lub disabled).
- Cała karta lekko wyblakła: `opacity-70`.

**Sidebar entry:**
- Po pozycji "Dictionaries" (lub przed nią — wybierz miejsce zgodne z UX):
  ```ts
  { label: 'Data', icon: 'rows', to: '/data' }
  ```
  (Jeśli `download` ikona istnieje w `Icon.*` — użyj jej. Sprawdź `src/components/icons.tsx`.)

**Design tokens:** używaj istniejących `apex-*` zgodnie z resztą projektu.

**Responsywność:**
- ≥768px: grid 2 kolumny (`grid-cols-1 md:grid-cols-2 gap-4`)
- <768px: jedna kolumna, button full-width

## Relevant files (edit only these)
- `src/lib/api.ts` — dodaj `exportData()` zwracającą `{ blob, filename }`
- `src/main.tsx` — dodaj route `/data`
- `src/components/layout/sidebar.tsx` — dodaj pozycję "Data" w `mainNav`
- `src/pages/data.tsx` — NOWA strona (komponent prezentacyjny)
- `src/hooks/use-export.ts` — NOWY hook (logika)

## Files to read but NOT edit
- `src/main.tsx` — wzorzec routes
- `src/components/layout/sidebar.tsx` — wzorzec `NavEntry` i `mainNav`
- `src/components/icons.tsx` — sprawdź dostępne ikony (`Icon.*`, `IconName`)
- `src/components/page-header.tsx` — wzorzec użycia
- `src/pages/dictionaries.tsx` — wzorzec strony z kartami-linkami
- `src/lib/api.ts` — wzorzec fetcherów (`fetchGames`)

## Constraints
- NIE używaj TanStack Query dla eksportu — `useState` + bezpośredni `fetch`.
- NIE wrzucaj logiki fetchu do komponentu — logika w hooku `useExport`, komponent TYLKO renderuje.
- NIE pisz klas Tailwind z pamięci — sprawdź istniejący kod (`pages/dictionaries.tsx`, `pages/games.tsx`) i kopiuj wzorzec.
- NIE rzucaj `JSON.parse` na response — to BLOB, nie JSON do aplikacji. Plik trafia DO USERA, nie do JS-a.
- Filename z `Content-Disposition`: parsuj prostym regex `/filename="([^"]+)"/`. Fallback `apex-export.json`.
- `URL.revokeObjectURL` MUSI być wywołane po download (mem leak), w `try/finally` lub `setTimeout(..., 1000)`.
- Komponent strony max ~80 linii. Jeśli więcej — wydziel `<ExportCard />` i `<ImportCard />` jako sub-komponenty w tym samym pliku (lub osobnych jeśli reuse'owalne — tu nie są).

## Steps

### Step 1: API client (`exportData`)
**Co robimy:**
1. W `src/lib/api.ts` dodaj funkcję:
   ```ts
   export async function exportData(): Promise<{ blob: Blob; filename: string }> {
     const r = await fetch('/api/export', { credentials: 'include' });
     if (!r.ok) {
       throw new Error(`Failed to export: ${r.status}`);
     }
     const blob = await r.blob();
     const cd = r.headers.get('Content-Disposition') ?? '';
     const match = cd.match(/filename="([^"]+)"/);
     const filename = match?.[1] ?? 'apex-export.json';
     return { blob, filename };
   }
   ```
2. `bun run check` z `apps/client` → 0 błędów.
**Rezultat:** API client gotowy.

### Step 2: Hook `useExport`
**Co robimy:**
1. Utwórz `src/hooks/use-export.ts`:
   ```ts
   import { useState } from 'react';
   import { exportData } from '@/lib/api';

   export function useExport() {
     const [isExporting, setIsExporting] = useState(false);
     const [error, setError] = useState<string | null>(null);

     async function trigger() {
       setIsExporting(true);
       setError(null);
       try {
         const { blob, filename } = await exportData();
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = filename;
         document.body.appendChild(a);
         a.click();
         a.remove();
         setTimeout(() => URL.revokeObjectURL(url), 1000);
       } catch (e) {
         setError('Failed to export. Please try again.');
       } finally {
         setIsExporting(false);
       }
     }

     return { isExporting, error, trigger };
   }
   ```
2. `bun run check` → 0 błędów.
**Rezultat:** logika eksportu odizolowana od UI.

### Step 3: Strona `/data` + sub-komponenty
**Co robimy:**
1. Utwórz `src/pages/data.tsx`:
   ```tsx
   import { Icon } from '@/components/icons';
   import { PageHeader } from '@/components/page-header';
   import { useExport } from '@/hooks/use-export';

   export function DataPage() {
     return (
       <>
         <PageHeader icon={<Icon.rows size={20} />} title="Data" />
         <div className="flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-4">
           <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
             <ExportCard />
             <ImportCard />
           </div>
         </div>
       </>
     );
   }

   function ExportCard() {
     const { isExporting, error, trigger } = useExport();
     return (
       <div className="rounded-[12px] border border-apex-line-3 bg-white p-5">
         <div className="mb-4 flex items-center gap-3">
           <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
             <Icon.rows size={18} />
           </span>
           <div className="text-[15px] font-semibold text-apex-ink">Export to JSON</div>
         </div>
         <p className="mb-3 text-[13px] text-apex-muted">
           Download a snapshot of all your platforms and games. Useful for backups or migrating to another instance.
         </p>
         <ul className="mb-4 space-y-1 text-[12px] text-apex-muted">
           <li>• Includes platforms and games</li>
           <li>• Excludes internal IDs</li>
           <li>• Schema version 1</li>
         </ul>
         <button
           type="button"
           onClick={trigger}
           disabled={isExporting}
           className="w-full rounded-[8px] bg-apex-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
         >
           {isExporting ? 'Exporting…' : 'Export to JSON'}
         </button>
         {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
       </div>
     );
   }

   function ImportCard() {
     return (
       <div className="rounded-[12px] border border-apex-line-3 bg-white p-5 opacity-70">
         <div className="mb-4 flex items-center gap-3">
           <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
             <Icon.rows size={18} />
           </span>
           <div className="text-[15px] font-semibold text-apex-ink">Import from JSON</div>
           <span className="ml-auto rounded-[6px] bg-apex-surface-head px-2 py-1 text-[11px] uppercase tracking-wide text-apex-muted">
             Coming soon
           </span>
         </div>
         <p className="text-[13px] text-apex-muted">
           Restore platforms and games from a previously exported JSON file.
         </p>
       </div>
     );
   }
   ```
2. W `src/main.tsx` dodaj import `DataPage` i route w children `AppLayout`:
   ```tsx
   { path: 'data', element: <DataPage /> },
   ```
3. W `src/components/layout/sidebar.tsx` dodaj do `mainNav`:
   ```ts
   { label: 'Data', icon: 'rows', to: '/data' },
   ```
   (Jeśli istnieje lepsza ikona np. `download`/`upload` — użyj jej. Sprawdź `IconName` w `components/icons.tsx`.)
4. `bun run check` → 0 błędów.
5. `bun run dev` z `apps/client` (oraz API w drugim terminalu). Otwórz `/data`, kliknij "Export to JSON". Plik powinien się pobrać. Otwórz pobrany plik — sprawdź:
   - Poprawny JSON
   - `version: 1`
   - `exportedAt` jest timestampem ISO
   - `platforms[]` i `games[]` zgodne z aktualną kolekcją
6. Test stanu loading: w DevTools Network ustaw "Slow 3G", kliknij export — powinien być widoczny stan "Exporting…".
7. Test błędu: wyloguj się (w drugiej karcie), wróć na `/data`, kliknij export → 401 → alert "Failed to export. Please try again." (To może wymagać też przerendery `ProtectedRoute` — jeśli sesja zniknie, redirect na login. W tym wypadku po prostu zaloguj się na nowo i sprawdź happy path; symuluj błąd przez wyłączenie API serwera.)
8. Mobile: w DevTools przełącz na ~375px szerokość — karty powinny być w jednej kolumnie, button full-width.
**Rezultat:** Faza 3 zamknięta — eksport działa end-to-end z UI.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- Plik się nie pobiera — sprawdź czy `<a>` jest dodane do DOM (`appendChild`) PRZED `click()`. Niektóre przeglądarki ignorują click na elementach poza DOM.
- Filename to `apex-export.json` (bez daty) — `Content-Disposition` nie ma poprawnego formatu albo regex nie matchuje. Sprawdź response w DevTools Network.
- 401 mimo zalogowania — sprawdź `credentials: 'include'` w `fetch`. Bez tego cookie nie idzie.
- CORS błąd — backend ma whitelistowany `localhost:5173`. Jeśli frontend leci z innego portu, dodaj go w `apps/api/src/index.ts` (CORS config).
- Sidebar "Data" nie podświetla się jako aktywny — `NavLink` z `react-router-dom` powinien obsłużyć to automatycznie. Sprawdź `to: '/data'` (z leading slash).
- Browser konsola: "blob URL leak" — `revokeObjectURL` musi być wołany. `setTimeout(..., 1000)` po `click()` jest standardowym wzorcem (czeka aż przeglądarka rzeczywiście pobierze plik).
