---
name: Phase 5 Frontend
description: Strona /dictionaries/platforms (lista + add + delete) + integracja z game form
type: plan
---

# Platform Dictionary — Faza 5: Frontend

## Goal
Stworzyć dla zalogowanego usera UI słownika platform:
- Strona `/dictionaries/platforms` — lista (data-table) + przycisk "Add platform" → Radix Dialog z formularzem; akcja "Delete" w wierszu
- W formularzu dodawania/edycji gry (`game-form.tsx`) — Select platform fetchuje listę z `/api/platforms` zamiast hardcoded enum, plus inline akcja "+ Add platform" otwierająca dialog
- Strona `/dictionaries` — prosta lista linków do podstron słowników (na MVP tylko Platforms)

## Definition of Done
- [ ] `bun run check` (z `apps/client`) → 0 błędów (lub z głównego — sprawdź skrypt projektu)
- [ ] Strona `/dictionaries/platforms` renderuje się bez błędów w konsoli, zalogowany user widzi listę swoich platform
- [ ] Przycisk "Add platform" otwiera Radix Dialog; po submit formularza nowa platforma pojawia się w liście (TanStack Query refetch / cache update)
- [ ] Przycisk "Delete" otwiera `delete-confirm-dialog.tsx`; po potwierdzeniu platforma znika z listy. Backend 409 (in_use) → toast/alert "Platform is used by existing games"
- [ ] W formularzu Game (np. `add-game-dialog.tsx` / `game-form.tsx`) Select platform pokazuje listę platform usera (TanStack Query); gdy lista pusta → komunikat "No platforms — add one first"
- [ ] Sidebar pozycja "Dictionaries" prowadzi do `/dictionaries`; klik "Platforms" → `/dictionaries/platforms`
- [ ] Mobile-first: tabela responsywna (jak istniejąca data-table), dialog fullscreen na mobile

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. Z `apps/client`: `bun run dev`, `bun run check`.
**Routing:** react-router-dom z `createBrowserRouter` w `src/main.tsx` — pozycje pod `AppLayout`/`ProtectedRoute`. Aktualnie `/dictionaries` jest placeholderem.
**Stan:** TanStack Query (`@tanstack/react-query`) — istnieje `lib/queries.ts` ze wzorcem.
**API client:** `lib/api.ts` — wzorzec `fetchGames`/`createGame` z `credentials: 'include'`.
**Tabele:** TanStack Table przez `components/data-table.tsx` (wymóg z user memory).
**UI:** Radix UI + Tailwind (apex-* design tokens). NIE pisz klas z pamięci — pobierz docs.
**Layout:** full-viewport (Jira/Monday-style) — pasuje do istniejącego `AppLayout`. Zachowaj.

## Visual spec
**Strona `/dictionaries`** (prosty index):
- Page header "Dictionaries"
- Lista linków (na MVP 1): "Platforms — manage platforms for your collection"

**Strona `/dictionaries/platforms`** (główna):
- Page header "Platforms" + breadcrumb "Dictionaries / Platforms" (użyj `components/breadcrumb.tsx`)
- Toolbar (`components/toolbar.tsx`): po prawej przycisk primary "Add platform" (otwiera dialog)
- Pod toolbarem: `data-table.tsx` z kolumnami:
  - **Name** — nazwa platformy (sortowalna lokalnie — lista jest mała, klient-side sort OK)
  - **Created** — `createdAt` formatowane (jeśli backend zwraca; jeżeli nie, pomiń)
  - **Actions** — `icon-button.tsx` Trash → otwiera `delete-confirm-dialog.tsx`
- Empty state (gdy `data.length === 0`): centrowany blok "No platforms yet" + button "Add your first platform"

**Dialog "Add platform"** (Radix Dialog jak `add-game-dialog.tsx`):
- Tytuł "Add platform"
- Pole input "Name" (autoFocus, walidacja: niepuste, max 40 znaków)
- Pod inputem przy błędzie 409: "Platform 'X' already exists"
- Footer: Cancel + Save (primary). Submit przez Enter.

**Game form Select platform:**
- Zamień obecny hardcoded select (`PS3...Switch`) na fetch'owaną listę
- Opcje: każda platforma usera, posortowana po nazwie (z backendu już posortowane)
- Pod listą opcji (lub jako trigger pod selektem): button "+ Add platform" otwierający ten sam dialog co w słowniku — po sukcesie cache `['platforms']` invaliduje, lista się odświeża, nowa platforma jest preselected
- Empty: gdy lista pusta, zamiast selecta pokaż link/button "No platforms — add one first" prowadzący do `/dictionaries/platforms` lub otwierający dialog inline

**Design tokens:** użyj istniejących: `text-apex-ink`, `text-apex-muted`, `border-apex-line-3`, `bg-apex-surface-hover`, kolor primary action: `bg-apex-accent`. Spacing/typografia jak w istniejących stronach (`pages/games.tsx` jako referencja).

**Mobile:**
- Tabela: jeśli używa istniejący `data-table.tsx` — responsywność tam już jest. Jeśli nie — kolumna "Created" znika na <640px, "Actions" zostaje.
- Dialog fullscreen na mobile (Radix Dialog z `data-state` + tailwind `sm:max-w-md` na content).

## Relevant files (edit only these)
- `src/lib/api.ts` — dodanie `fetchPlatforms`, `createPlatform`, `deletePlatform`
- `src/lib/queries.ts` — dodanie `usePlatformsQuery`, `useCreatePlatform`, `useDeletePlatform` (lub odpowiednio jak nazewnictwo w pliku)
- `src/types.ts` — typ `Platform = { id: number; userId: string; name: string }`
- `src/main.tsx` — routes `/dictionaries` i `/dictionaries/platforms`
- `src/pages/dictionaries.tsx` — nowy
- `src/pages/dictionaries-platforms.tsx` — nowy
- `src/components/add-platform-dialog.tsx` — nowy (analogicznie do `add-game-dialog.tsx`)
- `src/components/dictionaries-platforms-columns.tsx` — TanStack Table column defs (analogicznie do `pages/games-columns.tsx`)
- `src/components/game-form.tsx` LUB `src/components/add-game-dialog.tsx` — Select platform: fetch zamiast enum + inline "Add platform"

## Files to read but NOT edit
- `src/main.tsx` — wzorzec routing
- `src/pages/games.tsx` — wzorzec strony z toolbarem + tabelą
- `src/pages/games-columns.tsx` — wzorzec column defs TanStack Table
- `src/components/data-table.tsx` — wzorzec użycia tabeli
- `src/components/add-game-dialog.tsx` — wzorzec Radix Dialog z formularzem
- `src/components/delete-confirm-dialog.tsx` — wzorzec confirm dialog
- `src/components/toolbar.tsx`, `page-header.tsx`, `icon-button.tsx`, `form-field.tsx` — istniejące UI
- `src/lib/queries.ts` — wzorzec custom hooks z TanStack Query
- `src/lib/api.ts` — wzorzec fetcherów
- `src/types.ts` — typy

## Steps

### Step 0: Pobierz dokumentację (Context7)
**Co robimy:** użyj Context7:
- `@radix-ui/react-dialog`: "controlled open state form with submit"
- `@tanstack/react-query`: "useMutation invalidate queries on success"
- `@tanstack/react-table`: "column definition cell render"
- Tailwind CSS: jeśli musisz użyć klasy spoza istniejących (`apex-*`) — pobierz konkretne klasy (np. responsywne breakpointy `sm:`/`md:`)
**Rezultat:** świeże API w głowie.

### Step 1: API client + types + query hooks
**Co robimy:**
1. W `src/types.ts` dodaj:
   ```ts
   export interface Platform { id: number; userId: string; name: string; }
   ```
2. W `src/lib/api.ts` dodaj fetchery (replikuj wzorzec `fetchGames`):
   ```ts
   export async function fetchPlatforms(): Promise<Platform[]> {
     const r = await fetch('/api/platforms', { credentials: 'include' });
     if (!r.ok) throw new Error(`Failed to fetch platforms: ${r.status}`);
     return r.json();
   }
   export async function createPlatform(input: { name: string }): Promise<Platform> {
     const r = await fetch('/api/platforms', {
       method: 'POST', credentials: 'include',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(input),
     });
     if (!r.ok) {
       const body = await r.json().catch(() => ({}));
       const e = new Error(body?.error ?? `Failed to create platform: ${r.status}`);
       (e as any).status = r.status; (e as any).body = body;
       throw e;
     }
     return r.json();
   }
   export async function deletePlatform(id: number): Promise<Platform> {
     const r = await fetch(`/api/platforms/${id}`, { method: 'DELETE', credentials: 'include' });
     if (!r.ok) {
       const body = await r.json().catch(() => ({}));
       const e = new Error(body?.error ?? `Failed to delete platform: ${r.status}`);
       (e as any).status = r.status; (e as any).body = body;
       throw e;
     }
     return r.json();
   }
   ```
3. W `src/lib/queries.ts` dodaj hooks:
   ```ts
   export function usePlatformsQuery() {
     return useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms });
   }
   export function useCreatePlatform() {
     const qc = useQueryClient();
     return useMutation({
       mutationFn: createPlatform,
       onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms'] }),
     });
   }
   export function useDeletePlatform() {
     const qc = useQueryClient();
     return useMutation({
       mutationFn: deletePlatform,
       onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms'] }),
     });
   }
   ```
4. `bun run check` z `apps/client` → 0 błędów.
**Rezultat:** warstwa danych gotowa.

### Step 2: Dialog "Add platform" + delete confirm
**Co robimy:**
1. Utwórz `src/components/add-platform-dialog.tsx` jako kopię koncepcyjną `add-game-dialog.tsx`:
   - Props: `{ open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (p: Platform) => void }`
   - Formularz z `form-field.tsx` Input "Name" (controlled state)
   - Walidacja klient-side: trim niepusty, max 40
   - Submit: `useCreatePlatform().mutateAsync({ name })`. Po sukcesie: `onCreated?.(platform); onOpenChange(false); reset state`
   - Obsługa 409: jeśli `error.status === 409` → pokaż błąd "Platform '<name>' already exists" pod inputem; nie zamykaj dialogu
   - Submit przez Enter (form `onSubmit`), Cancel = zamknięcie + reset
2. **Delete:** użyj istniejący `delete-confirm-dialog.tsx`. Obsługa 409 in_use → toast/inline alert (zobacz jak Games to robi w istniejącym kodzie; jeśli nie ma toasta — wystarczy ustawić error state w wierszu).
3. `bun run check` → 0 błędów. `bun run dev` → dialog daje się otworzyć (stub w testowej stronie).
**Rezultat:** dialog gotowy.

### Step 3: Strony `/dictionaries` + `/dictionaries/platforms`
**Co robimy:**
1. Utwórz `src/pages/dictionaries.tsx`:
   - `<PageHeader title="Dictionaries" />`
   - Lista jednego `<Link to="/dictionaries/platforms">` jako karta/wiersz "Platforms — manage platforms for your collection"
2. Utwórz `src/components/dictionaries-platforms-columns.tsx` — column defs TanStack Table:
   - `name` (string, sortable)
   - `actions` (cell render: `<IconButton icon="trash" onClick={() => onDelete(row.original)} aria-label="Delete platform" />`) — przekaż `onDelete` przez context tabeli lub `meta`
3. Utwórz `src/pages/dictionaries-platforms.tsx`:
   - State: `addOpen: boolean`, `pendingDelete: Platform | null`
   - `const { data, isLoading } = usePlatformsQuery();`
   - `const deleteM = useDeletePlatform();`
   - Layout: PageHeader + Toolbar (po prawej button "Add platform") + DataTable
   - Empty state gdy `!isLoading && data?.length === 0`: centrowany blok z buttonem
   - Renderuj `<AddPlatformDialog open={addOpen} onOpenChange={setAddOpen} />`
   - Renderuj `<DeleteConfirmDialog ... />` dla `pendingDelete`
4. W `src/main.tsx` w children `AppLayout` zamień placeholder `dictionaries` na:
   ```tsx
   { path: 'dictionaries', element: <DictionariesPage /> },
   { path: 'dictionaries/platforms', element: <DictionariesPlatformsPage /> },
   ```
   I dodaj importy.
5. `bun run dev` z `apps/client` → otwórz `/dictionaries/platforms`. Powinieneś zobaczyć pustą tabelę + button. Dodaj kilka platform przez dialog. Usuń jedną.
**Rezultat:** UI słownika działa.

### Step 4: Integracja z game form (Select platform)
**Co robimy:**
1. Otwórz `src/components/game-form.tsx` (lub `add-game-dialog.tsx` — sprawdź gdzie jest `<select>` / `<Pillselect>` na platform).
2. Zamień hardcoded listę platform na:
   ```tsx
   const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();
   ```
3. Render Select:
   - Jeśli `platformsLoading` → disabled select z "Loading…"
   - Jeśli `platforms.length === 0` → zamiast selecta blok: "No platforms — add one first" + button "Add platform" otwierający `<AddPlatformDialog />` inline (controlled state w komponencie)
   - W innym przypadku — opcje z `platforms.map(p => ({ value: p.name, label: p.name }))`
4. Pod selectem dodaj mały link/button "+ Add platform" otwierający dialog. `onCreated` → ustaw `setForm(f => ({ ...f, platform: created.name }))` żeby auto-preselect.
5. Sprawdź ręcznie:
   - `/games/new` z pustą listą platform → empty state + add → po dodaniu select pokazuje nową
   - `/games/new` z 2 platformami → select pokazuje 2 opcje + można otworzyć "Add platform" inline; po dodaniu trzeciej, opcja jest dostępna i zaznaczona
   - Submit gry z platformą "Wii U" (istnieje w słowniku) → 201
6. `bun run check` → 0 błędów.
**Rezultat:** game form używa dynamicznej listy z słownika.

### Step 5: Sprawdzenie końcowe
**Co robimy:**
1. `bun run check` z `apps/client` → 0 błędów.
2. `bun run lint` (jeśli skrypt istnieje) → 0 błędów.
3. Smoke test ręczny:
   - Login → `/dictionaries/platforms` → dodaj 'Wii U' → widać w liście
   - `/games/new` → select pokazuje 'Wii U' + inne (PS5, …) → submit gry z 'Wii U' → 201
   - `/dictionaries/platforms` → próba delete 'Wii U' → 409 toast/alert "Platform is used"
   - Usuń grę → znowu próba delete 'Wii U' → sukces
4. Sprawdź konsolę przeglądarki — brak błędów / warnings.
**Rezultat:** feature kompletny end-to-end.

## If you get stuck
- Jeżeli Radix Dialog "nie zamyka się" po submit — pamiętaj że `mutateAsync` musi się rozwiązać przed `onOpenChange(false)`. Jeśli używasz `mutate` (fire-and-forget), zamknij w `onSuccess`.
- Jeżeli select w game form nie aktualizuje się po dodaniu nowej platformy — sprawdź czy `useCreatePlatform` ma `onSuccess: invalidateQueries(['platforms'])` (Step 1).
- Jeżeli 409 nie jest rozróżniany od 400 — zachowaj `e.status` i `e.body` na rzuconym Error (już zrobione w Step 1).
- Jeżeli routing `/dictionaries/platforms` daje 404 — sprawdź czy dodałeś go w children `AppLayout` (zagnieżdżenie pod `/`), nie pod `/login`.
- Po 2 próbach: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
