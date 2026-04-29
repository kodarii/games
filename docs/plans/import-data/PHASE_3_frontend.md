---
name: Import Data Phase 3 — Frontend
description: Strona /data sekcja Import — file picker + tryb merge/replace + confirm dialog dla replace + lokalna pre-walidacja przez @apex/shared + raport po imporcie + invalidacja TanStack Query
type: plan
---

# Import Data — Faza 3: Frontend

## Goal
Zamienić sekcję "Import" w `/data` (obecnie placeholder "Coming soon") na działający flow:
1. User wybiera plik JSON.
2. Frontend lokalnie parsuje + waliduje przez Zod schema z `@apex/shared` (early feedback bez round-tripu).
3. User wybiera tryb (`merge` default, `replace` z confirm dialogiem ostrzegającym że istniejące dane zostaną usunięte).
4. Wysyłka `POST /api/import` z body `{ mode, snapshot }`.
5. Prezentacja raportu (created/updated/deleted) lub czytelnego błędu.
6. Invalidacja cache TanStack Query (`games`, `platforms`) — żeby UI w innych zakładkach pokazał świeży stan.

## Definition of Done
- [ ] `bun run typecheck` z `apps/client` → 0 błędów
- [ ] `apps/client` ma w `dependencies`: `"@apex/shared": "workspace:*"` i `"zod": "^4.3.6"` (re-używane do lokalnej walidacji)
- [ ] Karta "Import from JSON" na `/data` jest aktywna (nie ma napisu "Coming soon", brak `opacity-70`)
- [ ] File picker akceptuje **tylko** `.json` (atrybut `accept=".json,application/json"`)
- [ ] Po wyborze pliku frontend lokalnie:
  - Czyta jako tekst, parsuje JSON, waliduje przez `ImportSnapshotV1Schema` LUB `ImportSnapshotV2Schema` (discriminated po `version`).
  - Wyświetla podsumowanie: "Found 12 platforms and 47 games (schema v2)".
  - Jeśli błąd: czytelny komunikat ("Invalid file: not JSON" / "Unsupported version: 99" / "Missing field: games[3].title").
- [ ] RadioGroup z opcjami `merge` (default checked) i `replace`
- [ ] Wybór `replace` → po kliknięciu "Import" pojawia się Radix `<AlertDialog>` z treścią:
  > "Replace will delete all your current platforms and games (X platforms, Y games) and import from this file. This cannot be undone. Continue?"
  Z liczbami pobranymi z `useQuery(['games'])` / `useQuery(['platforms'])` (już są w cache).
- [ ] Po potwierdzeniu (lub od razu dla `merge`): wysyłka. Button "Importing…" disabled.
- [ ] Sukces: zielony alert z raportem ("Imported: 3 new platforms, 1 updated. 12 new games, 5 updated."). Refetch list.
- [ ] Błąd HTTP: czerwony alert z czytelnym mapowaniem `error` z body backendu na komunikat user-facing.
- [ ] TanStack Query: po sukcesie `queryClient.invalidateQueries({ queryKey: ['games'] })` i `['platforms']`.
- [ ] Mobile: card single-column, button full-width, dialog dopasowany.
- [ ] Smoke (manualny): pełny scenariusz eksport→import na świeżym koncie (lub po `replace`) odtwarza identyczny stan UI.

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. `bun install` z roota po dodaniu deps.
**Routing:** react-router-dom. Strona `/data` już istnieje (`apps/client/src/pages/data.tsx`) — edytujemy `ImportCard`.
**Stan:** TanStack Query JEST używany (zobacz `apps/client/src/lib/queries.ts`). Dla samego importu używamy lokalnego stanu (multi-step: file → validate → confirm → submit) zamiast `useMutation`. Po sukcesie ręcznie invalidate.
**UI:** Tailwind + apex-* tokens + Radix. `@radix-ui/react-alert-dialog` JEST już w `package.json`.
**Dependency:** Faza 2 import (backend `POST /api/import`) DZIAŁA i przeszedł smoke testy.

## Design decisions

### Lokalna pre-walidacja
- Używamy schem z `@apex/shared` (te same które backend) — zerowa duplikacja semantyki.
- Discriminated union: `z.discriminatedUnion('version', [V1Schema, V2Schema])`. Daje user-friendly errory.
- Walidacja **przed** kliknięciem "Import". Plik niezgodny → button "Import" disabled, error inline pod file pickerem.
- **NIE** robimy migracji v1→v2 lokalnie. To robi backend. Frontend tylko sprawdza shape — żeby user nie tracił czasu na round-trip jeśli plik totalnie zły.

### Tryby + confirm
- `merge` jako default — najczęściej używane, bezpieczne.
- `replace` — Radix `<AlertDialog>` z liczbami. Liczby pobrane z `queryClient.getQueryData(['platforms'])` i `['games', ...]`. Jeśli któraś query'ka jeszcze nie wykonana — fallback "all current data".

### Hook `use-import` — odpowiedzialności
- State machine (proste 5 stanów): `idle` → `parsing` → `validated` (success) | `parse-failed` → `submitting` → `succeeded` | `failed`.
- Zwraca: `state`, `summary` (po validation), `report` (po success), `error`, akcje: `selectFile(file)`, `submit(mode, queryClient)`, `reset()`.
- Trzymamy w jednym hooku — komponent tylko renderuje na podstawie stanu.

### Mapowanie błędów backend → UI
- `payload_too_large` → "File too large (max 5MB)."
- `invalid_body` → "Invalid request body."
- `invalid_json` → "File is not valid JSON." (rzadkie, bo lokalna walidacja to wyłapie wcześniej)
- `invalid_shape` → "File structure does not match expected format."
- `unsupported_version` → "This file uses schema version X, which is not supported."
- `duplicate_external_id` → "File contains duplicate IDs."
- `duplicate_platform_name` → "File contains duplicate platform name: X."
- `unknown_platform` → "Game references unknown platform: X."
- `domain_error` → "Invalid data in record: <human readable kind>."
- inne / 500 → "Something went wrong. Please try again."

### Kontrakt z `@apex/shared`
- Frontend importuje:
  - `ImportSnapshotV1Schema`, `ImportSnapshotV2Schema` (do walidacji)
  - typ `ImportSnapshot` (= V2)
  - `ImportMode`, `ImportReport`
- Po dodaniu workspace dep, Vite musi to zobaczyć. Sprawdź czy `vite.config.ts` ma jakąś konfigurację aliases lub ssr.noExternal — nie powinien wymagać zmian (Bun workspace symlink wystarczy), ale jeśli runtime krzyczy "Failed to resolve @apex/shared" — dodaj do `vite.config` `optimizeDeps.include: ['@apex/shared']`.

## Step 0: Pobierz dokumentację (Context7)
- `@radix-ui/react-alert-dialog` — "controlled open state, AlertDialogTrigger asChild"
- `@tanstack/react-query` — "invalidateQueries by queryKey prefix"
- `zod` — "discriminatedUnion error issues per path"
- `vite`: "monorepo workspace package not externalized"

## Visual spec

**Karta "Import" (zaktualizowana):**
- Header jak w Export: ikona w kółku (`Icon.rows` lub lepsza — sprawdź `download`/`upload` w `components/icons.tsx`), tytuł "Import from JSON".
- Opis: "Restore platforms and games from a previously exported JSON file."
- File picker (custom-styled label wokół `<input type="file" hidden>`):
  - Domyślnie: button "Choose file…" + tekst "No file selected".
  - Po wyborze: nazwa pliku + krzyżyk do reset.
- Pod file pickerem area na summary/error:
  - Sukces: `text-[12px] text-green-600`: "✓ Found 3 platforms and 12 games (schema v2)."
  - Błąd: `text-[12px] text-red-600` z konkretnym komunikatem.
- RadioGroup horizontalnie (na mobile vertically). Native `<input type="radio">` wystarczy:
  ```
  ( ) Merge   ( ) Replace
  ```
  Pod każdym `text-[11px] text-apex-muted`:
  - Merge: "Update existing items, add new ones."
  - Replace: "Delete current data, then import."
- Button primary "Import" — disabled gdy: brak pliku, parsowanie nieukończone, błąd parsowania, lub `submitting`.
- Po sukcesie pod buttonem zielony alert z raportem.

**AlertDialog (replace confirmation):**
- Title: "Replace all data?"
- Description (z liczbami z cache):
  > "This will permanently delete <strong>{X} platforms</strong> and <strong>{Y} games</strong> and replace them with the contents of the file. This cannot be undone."
- Actions: "Cancel" (default focus) + "Replace" (red button).

## Relevant files (edit only these)
- ROOT `package.json` — bez zmian (workspaces już w fazie 1).
- `apps/client/package.json` — dodaj `"@apex/shared": "workspace:*"` i `"zod": "^4.3.6"`.
- `apps/client/src/lib/api.ts` — dodaj `importData(snapshot, mode): Promise<ImportReport>`.
- `apps/client/src/hooks/use-import.ts` — NOWY hook (state machine).
- `apps/client/src/pages/data.tsx` — przepisz `ImportCard` (usuń placeholder, dodaj realną logikę).
- `apps/client/vite.config.ts` — TYLKO jeśli Vite nie rozwiąże `@apex/shared` (wtedy `optimizeDeps.include`).

## Files to read but NOT edit
- `apps/client/src/lib/queries.ts` — query keys do invalidacji
- `apps/client/src/lib/query-client.ts` — `queryClient` instance
- `apps/client/src/components/icons.tsx` — sprawdź `Icon.upload` / `Icon.download`
- `apps/client/src/pages/data.tsx` — wzorzec ExportCard (układ, klasy)
- istniejący użycie Radix `AlertDialog` w `apps/client/src/...` — `grep -r "AlertDialog"` w `apps/client/src` żeby znaleźć wzorzec

## Constraints
- NIE rozpakowuj snapshotu lokalnie do `NewGame`/`NewPlatform` — frontend NIE ma dostępu do domain z `apps/api`. Walidacja lokalna kończy się na Zod schema z `@apex/shared`.
- NIE wysyłaj pliku jako multipart. Wysyłaj `JSON.parse(text)` jako `snapshot` w body.
- NIE trzymaj treści pliku w stanie po sukcesie (mem) — `reset()` po success czyści `selectedFile` i parsedSnapshot.
- NIE blokuj UI przez `await reader.readAsText` synchronicznie — używaj `file.text()` (Promise).
- File picker MUSI mieć `accept=".json,application/json"`. Ale to tylko hint dla OS dialogu — i tak walidujemy kontent, nie nazwę.
- Komponent `<ImportCard />` max ~120 linii. Jeśli więcej — wydziel `<ImportFilePicker />`, `<ImportModeRadio />`, `<ImportReplaceConfirm />` jako sub-komponenty w tym samym pliku (NIE nowy plik — to lokalne dla strony).
- Po `submit` sukces — wywołaj `queryClient.invalidateQueries({ queryKey: ['games'] })` i `['platforms']`. NIE rób `queryClient.clear()` — to wyrzuca cały cache, niepotrzebnie.

## Steps

### Step 1: Workspace dep + Vite check
**Co robimy:**
1. W `apps/client/package.json` dodaj do `dependencies`:
   ```json
   "@apex/shared": "workspace:*",
   "zod": "^4.3.6"
   ```
2. Z roota `bun install`.
3. W `apps/client/src/lib/api.ts` na próbę dodaj na górze:
   ```ts
   import { CURRENT_SCHEMA_VERSION } from '@apex/shared';
   console.log(CURRENT_SCHEMA_VERSION);
   ```
4. `bun run dev` z `apps/client`. Otwórz przeglądarkę, console powinno pokazać `2`. Jeśli błąd "Failed to resolve" — edytuj `vite.config.ts`:
   ```ts
   import { defineConfig } from 'vite';
   // ...
   export default defineConfig({
     // ...
     optimizeDeps: { include: ['@apex/shared'] },
   });
   ```
   Restart dev. Powtórz. Jeśli nadal nie działa — sprawdź czy `packages/shared/package.json` ma `"exports": { ".": "./src/index.ts" }` i że plik istnieje.
5. Usuń tymczasowy `import` i `console.log`.
6. `bun run typecheck` z `apps/client` → 0 błędów.
**Rezultat:** klient widzi `@apex/shared`.

### Step 2: API client `importData`
**Co robimy:**
1. W `apps/client/src/lib/api.ts` dodaj:
   ```ts
   import type { ImportMode, ImportReport, ImportSnapshot } from '@apex/shared';

   export async function importData(
     snapshot: unknown, // already-parsed JSON object
     mode: ImportMode,
   ): Promise<ImportReport> {
     const r = await fetch('/api/import', {
       method: 'POST',
       credentials: 'include',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ mode, snapshot }),
     });
     if (!r.ok) {
       const body = await r.json().catch(() => ({}));
       const e = new Error(body?.error ?? `Failed to import: ${r.status}`);
       (e as any).status = r.status;
       (e as any).body = body;
       throw e;
     }
     return r.json();
   }
   ```
2. `bun run typecheck` → 0 błędów.

### Step 3: Hook `use-import`
**Co robimy:**
1. Utwórz `apps/client/src/hooks/use-import.ts`:
   ```ts
   import { useState } from 'react';
   import { z } from 'zod';
   import {
     ImportSnapshotV1Schema,
     ImportSnapshotV2Schema,
     type ImportMode,
     type ImportReport,
   } from '@apex/shared';
   import { useQueryClient } from '@tanstack/react-query';
   import { importData } from '@/lib/api';

   const SnapshotSchema = z.discriminatedUnion('version', [
     ImportSnapshotV1Schema,
     ImportSnapshotV2Schema,
   ]);

   export type ParsedSummary = {
     version: 1 | 2;
     platforms: number;
     games: number;
     snapshot: unknown; // raw object to send back
   };

   export type ImportState =
     | { kind: 'idle' }
     | { kind: 'parsing' }
     | { kind: 'parse-failed'; message: string }
     | { kind: 'validated'; file: File; summary: ParsedSummary }
     | { kind: 'submitting'; file: File; summary: ParsedSummary }
     | { kind: 'succeeded'; report: ImportReport }
     | { kind: 'failed'; message: string };

   export function useImport() {
     const [state, setState] = useState<ImportState>({ kind: 'idle' });
     const queryClient = useQueryClient();

     async function selectFile(file: File) {
       setState({ kind: 'parsing' });
       try {
         const text = await file.text();
         let parsed: unknown;
         try {
           parsed = JSON.parse(text);
         } catch {
           setState({ kind: 'parse-failed', message: 'File is not valid JSON.' });
           return;
         }
         const result = SnapshotSchema.safeParse(parsed);
         if (!result.success) {
           const issue = result.error.issues[0];
           const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
           setState({ kind: 'parse-failed', message: `Invalid file${path}: ${issue.message}` });
           return;
         }
         const summary: ParsedSummary = {
           version: result.data.version,
           platforms: result.data.platforms.length,
           games: result.data.games.length,
           snapshot: parsed,
         };
         setState({ kind: 'validated', file, summary });
       } catch (e) {
         setState({ kind: 'parse-failed', message: 'Failed to read file.' });
       }
     }

     async function submit(mode: ImportMode) {
       if (state.kind !== 'validated') return;
       const { file, summary } = state;
       setState({ kind: 'submitting', file, summary });
       try {
         const report = await importData(summary.snapshot, mode);
         await queryClient.invalidateQueries({ queryKey: ['games'] });
         await queryClient.invalidateQueries({ queryKey: ['platforms'] });
         setState({ kind: 'succeeded', report });
       } catch (e: any) {
         const errKind = e?.body?.error ?? 'unknown';
         setState({ kind: 'failed', message: mapError(errKind) });
       }
     }

     function reset() {
       setState({ kind: 'idle' });
     }

     return { state, selectFile, submit, reset };
   }

   function mapError(kind: string): string {
     switch (kind) {
       case 'payload_too_large': return 'File too large (max 5MB).';
       case 'invalid_body': return 'Invalid request body.';
       case 'invalid_json': return 'File is not valid JSON.';
       case 'invalid_shape': return 'File structure does not match expected format.';
       case 'unsupported_version': return 'This file uses an unsupported schema version.';
       case 'duplicate_external_id': return 'File contains duplicate item IDs.';
       case 'duplicate_platform_name': return 'File contains duplicate platform names.';
       case 'unknown_platform': return 'A game references a platform that does not exist in the file or in your library.';
       case 'domain_error': return 'File contains invalid data in one of the records.';
       default: return 'Something went wrong. Please try again.';
     }
   }
   ```
2. `bun run typecheck` → 0 błędów.

### Step 4: Komponent `ImportCard`
**Co robimy:**
1. Edytuj `apps/client/src/pages/data.tsx`. Zostaw `DataPage` i `ExportCard` bez zmian. Zastąp `ImportCard` realną implementacją:
   ```tsx
   import * as AlertDialog from '@radix-ui/react-alert-dialog';
   import { useState, useRef } from 'react';
   import { useQuery } from '@tanstack/react-query';
   import { useImport, type ImportState } from '@/hooks/use-import';
   import type { ImportMode } from '@apex/shared';

   function ImportCard() {
     const { state, selectFile, submit, reset } = useImport();
     const [mode, setMode] = useState<ImportMode>('merge');
     const [confirmOpen, setConfirmOpen] = useState(false);
     const fileRef = useRef<HTMLInputElement>(null);

     // Read counts from cache for replace dialog (best-effort)
     const platformsQ = useQuery({ queryKey: ['platforms'], enabled: false });
     const gamesQ = useQuery({ queryKey: ['games'], enabled: false });
     const platformsCount = (platformsQ.data as any[] | undefined)?.length;
     const gamesCount = (gamesQ.data as { items: any[] } | undefined)?.items?.length;

     const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
       const f = e.target.files?.[0];
       if (f) await selectFile(f);
       e.target.value = '';
     };

     const onImportClick = () => {
       if (mode === 'replace') setConfirmOpen(true);
       else void submit('merge');
     };

     const isSubmitting = state.kind === 'submitting';
     const canSubmit = state.kind === 'validated' && !isSubmitting;

     return (
       <div className="rounded-[12px] border border-apex-line-3 bg-white p-5">
         <div className="mb-4 flex items-center gap-3">
           <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-apex-surface-head text-apex-ink-4">
             <Icon.rows size={18} />
           </span>
           <div className="text-[15px] font-semibold text-apex-ink">Import from JSON</div>
         </div>
         <p className="mb-3 text-[13px] text-apex-muted">
           Restore platforms and games from a previously exported JSON file.
         </p>

         {/* File picker */}
         <div className="mb-3">
           <input
             ref={fileRef}
             type="file"
             accept=".json,application/json"
             className="hidden"
             onChange={onPick}
           />
           <div className="flex items-center gap-2">
             <button
               type="button"
               onClick={() => fileRef.current?.click()}
               className="rounded-[8px] border border-apex-line-3 bg-white px-3 py-1.5 text-[13px] hover:bg-apex-surface-head"
             >
               Choose file…
             </button>
             <span className="text-[12px] text-apex-muted">
               {state.kind === 'idle' && 'No file selected'}
               {state.kind === 'parsing' && 'Reading…'}
               {(state.kind === 'validated' || state.kind === 'submitting') && state.file.name}
               {state.kind === 'parse-failed' && 'No file selected'}
               {(state.kind === 'succeeded' || state.kind === 'failed') && (
                 <button onClick={reset} className="text-apex-accent hover:underline">Import another</button>
               )}
             </span>
           </div>
           {state.kind === 'validated' && (
             <p className="mt-2 text-[12px] text-green-600">
               ✓ Found {state.summary.platforms} platform{state.summary.platforms === 1 ? '' : 's'} and {state.summary.games} game{state.summary.games === 1 ? '' : 's'} (schema v{state.summary.version}).
             </p>
           )}
           {state.kind === 'parse-failed' && (
             <p className="mt-2 text-[12px] text-red-600">{state.message}</p>
           )}
         </div>

         {/* Mode picker */}
         {(state.kind === 'validated' || state.kind === 'submitting') && (
           <fieldset className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-4">
             {(['merge', 'replace'] as ImportMode[]).map((m) => (
               <label key={m} className="flex cursor-pointer items-start gap-2">
                 <input
                   type="radio"
                   name="import-mode"
                   value={m}
                   checked={mode === m}
                   onChange={() => setMode(m)}
                   disabled={isSubmitting}
                   className="mt-0.5"
                 />
                 <span>
                   <div className="text-[13px] font-medium capitalize text-apex-ink">{m}</div>
                   <div className="text-[11px] text-apex-muted">
                     {m === 'merge' ? 'Update existing items, add new ones.' : 'Delete current data, then import.'}
                   </div>
                 </span>
               </label>
             ))}
           </fieldset>
         )}

         {/* Submit */}
         {(state.kind === 'validated' || state.kind === 'submitting') && (
           <button
             type="button"
             onClick={onImportClick}
             disabled={!canSubmit}
             className="w-full rounded-[8px] bg-apex-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
           >
             {isSubmitting ? 'Importing…' : 'Import'}
           </button>
         )}

         {/* Success report */}
         {state.kind === 'succeeded' && (
           <div className="mt-3 rounded-[8px] border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">
             <div className="font-semibold">Import complete</div>
             <div>Platforms — created: {state.report.platforms.created}, updated: {state.report.platforms.updated}{state.report.platforms.deleted !== undefined ? `, deleted: ${state.report.platforms.deleted}` : ''}</div>
             <div>Games — created: {state.report.games.created}, updated: {state.report.games.updated}{state.report.games.deleted !== undefined ? `, deleted: ${state.report.games.deleted}` : ''}</div>
           </div>
         )}

         {/* Error */}
         {state.kind === 'failed' && (
           <p className="mt-2 text-[12px] text-red-600">{state.message}</p>
         )}

         {/* Confirm replace */}
         <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
           <AlertDialog.Portal>
             <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
             <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-white p-5 shadow-xl">
               <AlertDialog.Title className="mb-2 text-[16px] font-semibold text-apex-ink">Replace all data?</AlertDialog.Title>
               <AlertDialog.Description className="mb-4 text-[13px] text-apex-muted">
                 This will permanently delete <strong>{platformsCount ?? 'all'} platform{platformsCount === 1 ? '' : 's'}</strong> and <strong>{gamesCount ?? 'all'} game{gamesCount === 1 ? '' : 's'}</strong> and replace them with the contents of the file. This cannot be undone.
               </AlertDialog.Description>
               <div className="flex justify-end gap-2">
                 <AlertDialog.Cancel asChild>
                   <button className="rounded-[8px] border border-apex-line-3 bg-white px-4 py-2 text-[13px] hover:bg-apex-surface-head">Cancel</button>
                 </AlertDialog.Cancel>
                 <AlertDialog.Action asChild>
                   <button
                     onClick={() => { setConfirmOpen(false); void submit('replace'); }}
                     className="rounded-[8px] bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
                   >
                     Replace
                   </button>
                 </AlertDialog.Action>
               </div>
             </AlertDialog.Content>
           </AlertDialog.Portal>
         </AlertDialog.Root>
       </div>
     );
   }
   ```
2. `bun run typecheck` z `apps/client` → 0 błędów.
3. `bun run dev` (api + client). Otwórz `/data`.

### Step 5: Smoke testy ręczne
**Co robimy:**
1. **Plik niezgodny:**
   - Wybierz dowolny plik niejedzony (np. `package.json` jako test) → komunikat "Invalid file at version: …"
   - Wybierz plik z corrupt JSON → "File is not valid JSON."
2. **Plik OK, merge no-change:**
   - Eksport z `/data` (download) → wybór tego pliku → summary "Found X platforms and Y games (schema v2)" → mode = merge → Import → raport "created: 0, updated: 0".
3. **Plik OK, merge zmienia rekord:**
   - Edytuj jedną grę w UI (np. tytuł). Wybierz **wcześniej** zapisany plik → Import (merge) → raport "games.updated: >=1". Otwórz listę gier — zmiana cofnięta.
4. **Replace flow:**
   - Wybierz plik → mode = replace → klik "Import" → AlertDialog z tekstem "Replace all data?" pokazujący poprawne X platform i Y games. Cancel — zamknięcie. Klik "Replace" — submit. Raport ma `deleted` w platforms i games.
5. **TanStack invalidation:**
   - Po imporcie przejdź na `/games` → lista odświeżona, brak stale data.
6. **Body too large:**
   - Manualnie podmień zawartość snapshot-pliku tak żeby ważył > 5MB (np. wstaw długi `developer` do jednej gry, zduplikuj 50000 razy). Wybierz plik → Import → raport "File too large (max 5MB)." (błąd 413 z backendu).
7. **Mobile:**
   - DevTools → 375px. Karta single-column. Button full-width. Dialog mieści się w viewport.
**Rezultat:** Faza 3 zamknięta — pełny end-to-end flow importu z UI.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- `Failed to resolve "@apex/shared"` w przeglądarce (Vite) — workspace symlink nie zaaplikowany. `bun install` z roota; jeśli dalej, `optimizeDeps.include: ['@apex/shared']` w `vite.config.ts` + restart dev. Jeśli i to nie pomaga — sprawdź czy `apps/client/node_modules/@apex/shared` to symlink.
- `discriminatedUnion` rzuca "Invalid discriminator value" gdy plik ma `version: 3` — to OK, ale komunikat brzydki. Możesz przed `safeParse` zrobić `if (parsed?.version !== 1 && parsed?.version !== 2) return parse-failed unsupported_version`. Optional polish.
- AlertDialog focus-loop — pamiętaj `<AlertDialog.Cancel asChild>` i `<AlertDialog.Action asChild>` z natywnymi buttonami; ich `onClick` ma działać + zamykać dialog.
- TanStack invalidate nie odświeża widoku — sprawdź `queryKey` (czy `['games', ...filters]` czy samo `['games']`). `invalidateQueries({ queryKey: ['games'] })` matchuje wszystkie klucze zaczynające się od `'games'` (prefix matching) — to powinno zadziałać. Sprawdź `apps/client/src/lib/queries.ts` co tam jest.
- Po sukcesie `state.kind === 'succeeded'` ale w UI nadal widać poprzedni screen — komponent nie re-renderuje, bo nie zmieniła się ref. Niemożliwe (state to nowy obiekt). Sprawdź czy `setState({ kind: 'succeeded', report })` faktycznie się woła (console.log).
- Replace dialog pokazuje "all platform" / "all game" zamiast liczb — `useQuery({ enabled: false })` zwraca dane TYLKO z cache. Jeśli user nie wszedł wcześniej na `/games` lub `/platforms`, cache jest pusty. Fallback "all" jest poprawny — to nie bug.
- File picker NIE pokazuje opcji JSON na macOS — `accept=".json,application/json"` to tylko hint. User może wybrać dowolny plik. Walidacja po contencie i tak to wyłapie.
