# IGDB enrichment — Faza 6: Re-match button na detail page

## Goal
Dodaj button na `game-view.tsx` (strona szczegółów gry) który otwiera ten sam Step-2 picker preloaded z bieżącym `title` + `platform` gry. Wybór kandydata → `PATCH /api/games/:externalId/metadata`. Specjalna obsługa: jeśli istniejący `coverImage` host to UploadThing → confirmation prompt przed nadpisaniem.

## Definition of Done
- [ ] Button **"Find IGDB match"** (primary) widoczny gdy cover/year/developer są PUSTE
- [ ] Button **"Re-match on IGDB"** (ghost) widoczny gdy któreś z pól jest WYPEŁNIONE
- [ ] Klik otwiera modal z Step-2 picker preloaded `title`/`platform` gry
- [ ] Wybór + confirm → PATCH zapisuje, modal zamyka się, dane gry refreshują się
- [ ] Jeśli istniejący `coverImage` host = UploadThing → confirmation dialog: "Replace your uploaded cover with the IGDB cover?" PRZED PATCHem
- [ ] Jeśli host = `images.igdb.com` → nadpisz silently
- [ ] Brak istniejącego cover → nadpisz silently (oczywiste)
- [ ] React Query invaliduje `['game', externalId]` po sukcesie
- [ ] `bun --filter @games/client run check` exits 0
- [ ] `bun --filter @games/client run lint` exits 0
- [ ] `grep -r 'console.log\|console.warn' apps/client/src/components/rematch-* apps/client/src/hooks/use-rematch-game.ts` zwraca empty (no debug statements left)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Out-of-band acceptance (human reviewer, NOT agent-verifiable)
- Manual test: full flow działa w przeglądarce, mobile + desktop
- Re-match z UploadThing cover → confirm dialog pojawia się; "Keep my cover" zachowuje uploaded image
- Brak błędów w konsoli przeglądarki

## Context
**Runtime:** Bun.
**Detail page:** `apps/client/src/pages/game-view.tsx`. Cover meta column zawiera obecnie "Upload cover" button (znajdź go: `grep -n "Upload\|cover" apps/client/src/pages/game-view.tsx`). Re-match button ma być POD nim, w tej samej kolumnie.
**Backend endpoint (z fazy 4):** `PATCH /api/games/:externalId/metadata` z body `{ providerName: 'igdb', providerId: string, snapshot: { coverImageUrl, releaseYear, developer } }`.
**Komponenty do reuzowania (z fazy 5):**
- `MetadataMatchPicker` (body modala)
- `useMetadataCandidatesQuery(title, platform, enabled)` (fetcher)
**UploadThing host (pre-resolved, do not re-grep):** UploadThing serwuje cover images z DWÓCH host families równolegle: `utfs.io` (exact) i `*.ufs.sh` (subdomain wildcard, np. `xxxx.ufs.sh`). OBA muszą być traktowane jako "UploadThing" w replace-confirm logice — patrz helper `isUploadThingHost(host)` w Step 2. Source of truth: `apps/api/src/application/cover-storage/cleanup-orphans.test.ts:58`.

### Step 0: Pobierz dokumentację (Context7)
1. `mcp__context7__resolve-library-id` z query `"@tanstack/react-query"` + `mcp__context7__query-docs`: `"useMutation onSuccess invalidating specific query key, queryClient.invalidateQueries with exact key"`

## Design decisions
- **Modal:** reuse responsywny shell z fazy 5 (`AlertDialog` z bottom-sheet/centered classes). NIE rób nowego — wydziel wspólny komponent `<MetadataPickerModal>` jeśli widzisz że więcej niż 50% szablonu się powtarza. Inaczej osobny komponent OK.
- **State:** `rematchOpen: boolean` + `selectedProviderId: string | null` w komponencie `RematchButton` (lub w `GameViewPage`). Lokalne, NIE URL.
- **Mutacja:** nowy hook `useEnrichGameMetadataMutation()` w `queries.ts`. Wywołuje `PATCH /api/games/:externalId/metadata`. onSuccess → `queryClient.invalidateQueries({ queryKey: ['game', externalId] })` + `['games']` (listy żeby cover w gridzie też się zmienił).
- **Cover replace confirmation:**
  - Logika:
    ```
    const currentHost = game.coverImage ? new URL(game.coverImage).host : null;
    const newHost = candidate.coverImageUrl ? new URL(candidate.coverImageUrl).host : null;
    if (currentHost === UPLOADTHING_HOST && newHost === 'images.igdb.com' && currentHost !== newHost) → confirm
    else → proceed
    ```
  - Confirmation = osobny `AlertDialog` lub state `confirmReplace: boolean`. Tekst: **"Replace your uploaded cover with the IGDB cover?"** + buttony "Keep my cover" (secondary) / "Replace" (primary).
  - "Keep my cover" → PATCH z `snapshot.coverImageUrl: null` (zachowaj rok i developera, ale NIE nadpisz cover)
  - "Replace" → PATCH z pełnym snapshot
- **Conditional button label:**
  ```
  const hasAnyEnrichment = !!(game.coverImage || game.releaseYear || game.developer);
  label = hasAnyEnrichment ? "Re-match on IGDB" : "Find IGDB match";
  variant = hasAnyEnrichment ? "ghost" : "primary";
  ```
- **Placement:** w cover meta column, POD "Upload cover" buttonem (lub w jego sąsiedztwie — sprawdź visual w `game-view.tsx` i wstaw w spatially adjacent miejscu).
- **NO regex/sed substitution.** Jeśli widzisz że potrzebujesz powtórzyć Step-2 UI w 2 miejscach → wydziel komponent `<MetadataPickerModal>`.

### Relevant files (edit only these)
- `apps/client/src/components/rematch-button.tsx` — NOWY (button + modal wrapper)
- `apps/client/src/components/metadata-picker-modal.tsx` — NOWY (opcjonalnie — jeśli wydzielasz wspólny shell z fazy 5)
- `apps/client/src/hooks/use-rematch-game.ts` — NOWY (logika confirm + mutation)
- `apps/client/src/lib/api.ts` — DODAJ `enrichGameMetadata(externalId, body)` PATCH wrapper
- `apps/client/src/lib/queries.ts` — DODAJ `useEnrichGameMetadataMutation()`
- `apps/client/src/pages/game-view.tsx` — WSTAW `<RematchButton game={game} />` w cover meta column

### Files to read but NOT edit
- `apps/client/src/pages/game-view.tsx` (cały — znaj layout)
- `apps/client/src/components/add-game-dialog.tsx` (z fazy 5 — wzór modala + step 2 hookup)
- `apps/client/src/components/metadata-match-picker.tsx` (z fazy 5)
- `apps/client/src/hooks/use-add-game-with-metadata.ts` (z fazy 5 — wzór hooka)
- `apps/client/src/lib/queries.ts` (wzór mutation + invalidate)
- `apps/api/src/routes/games.ts` (z fazy 4 — kontrakt PATCH)

## Constraints
- NIE duplikuj UI Step-2 — reuse `MetadataMatchPicker` z fazy 5
- NIE pisz nowych Tailwind klas z pamięci — copy z fazy 5 lub z docs
- NIE rób trzeciego endpointu — używaj istniejącego PATCH `/api/games/:externalId/metadata`
- NIE używaj `window.confirm()` dla replace-cover — używaj Radix `AlertDialog` (consistency)
- Confirmation cover replace TYLKO gdy current host = UploadThing AND new host = IGDB. Każdy inny przypadek (no current, current=IGDB, no new) → silent
- NIE invaliduj WSZYSTKICH queries (`queryClient.invalidateQueries()` bez key) — TYLKO `['game', id]` + `['games']`
- Logika confirm/PATCH = `useRematchGame` hook. `RematchButton` komponent prezentacyjny.

## Steps

### Step 1: API + queries
**Co robimy:**
1. W `apps/client/src/lib/api.ts` dodaj:
   ```ts
   export async function enrichGameMetadata(externalId: string, body: {
     providerName: 'igdb';
     providerId: string;
     snapshot: { coverImageUrl: string | null; releaseYear: number | null; developer: string | null };
   }): Promise<Game> {
     const res = await fetch(`/api/games/${externalId}/metadata`, {
       method: 'PATCH',
       credentials: 'include',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(body),
     });
     if (!res.ok) throw new Error('Failed to enrich game metadata');
     return res.json();
   }
   ```
2. W `apps/client/src/lib/queries.ts` dodaj:
   ```ts
   export function useEnrichGameMetadataMutation(externalId: string) {
     const qc = useQueryClient();
     return useMutation({
       mutationFn: (body: Parameters<typeof enrichGameMetadata>[1]) => enrichGameMetadata(externalId, body),
       onSuccess: () => {
         qc.invalidateQueries({ queryKey: ['game', externalId] });
         qc.invalidateQueries({ queryKey: ['games'] });
       },
     });
   }
   ```
3. `bun --filter @games/client run check` czyste.

**Rezultat:** API call + mutation gotowe.

### Step 2: `useRematchGame` hook + confirm logic
**Co robimy:**
1. Utwórz `apps/client/src/hooks/use-rematch-game.ts`:
   ```ts
   // UploadThing serwuje covers z DWÓCH host families (zweryfikowane w
   // apps/api/src/application/cover-storage/cleanup-orphans.test.ts:58):
   //   - utfs.io (exact)
   //   - *.ufs.sh (subdomain wildcard, np. xxxx.ufs.sh)
   function isUploadThingHost(host: string): boolean {
     return host === 'utfs.io' || host.endsWith('.ufs.sh');
   }

   export function useRematchGame(game: Game) {
     const [open, setOpen] = useState(false);
     const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
     const [pendingReplace, setPendingReplace] = useState<{ candidate: MetadataCandidate } | null>(null);

     const candidatesQuery = useMetadataCandidatesQuery(game.title, game.platform, open);
     const mutation = useEnrichGameMetadataMutation(game.externalId);

     const selectedCandidate = candidatesQuery.data?.candidates.find(c => c.providerId === selectedProviderId) ?? null;

     const needsReplaceConfirm = (candidate: MetadataCandidate) => {
       if (!game.coverImage || !candidate.coverImageUrl) return false;
       try {
         const currentHost = new URL(game.coverImage).host;
         const newHost = new URL(candidate.coverImageUrl).host;
         return isUploadThingHost(currentHost) && newHost === 'images.igdb.com';
       } catch { return false; }
     };

     const queryClient = useQueryClient();
     const confirm = async (opts: { keepCover?: boolean } = {}) => {
       const candidate = selectedCandidate;
       if (!candidate) return;
       await mutation.mutateAsync({
         providerName: 'igdb',
         providerId: candidate.providerId,
         snapshot: {
           coverImageUrl: opts.keepCover ? null : candidate.coverImageUrl,
           releaseYear: candidate.releaseYear,
           developer: candidate.developer,
         },
       });
       setOpen(false);
       setSelectedProviderId(null);
       setPendingReplace(null);
       queryClient.invalidateQueries({ queryKey: ['metadata-candidates'] });
     };

     const onConfirmClick = () => {
       if (!selectedCandidate) return;
       if (needsReplaceConfirm(selectedCandidate)) setPendingReplace({ candidate: selectedCandidate });
       else confirm();
     };

     return { open, setOpen, selectedProviderId, setSelectedProviderId, selectedCandidate, candidatesQuery, mutation, onConfirmClick, pendingReplace, setPendingReplace, confirm };
   }
   ```
2. `bun --filter @games/client run check` czyste.

**Rezultat:** Hook obsługuje wszystkie 3 ścieżki: silent, confirm-replace-keep, confirm-replace-replace.

### Step 3: `RematchButton` + cover-replace confirm dialog + integracja w `game-view.tsx`
**Co robimy:**
1. Utwórz `apps/client/src/components/rematch-button.tsx`:
   ```tsx
   type Props = { game: Game };
   export function RematchButton({ game }: Props) {
     const hasAnyEnrichment = !!(game.coverImage || game.releaseYear || game.developer);
     const label = hasAnyEnrichment ? 'Re-match on IGDB' : 'Find IGDB match';
     const variant = hasAnyEnrichment ? 'ghost' : 'primary';
     const r = useRematchGame(game);

     return (
       <>
         <Button variant={variant} size="sm" onClick={() => r.setOpen(true)}>{label}</Button>

         <AlertDialog.Root open={r.open} onOpenChange={r.setOpen}>
           <AlertDialog.Portal>
             <AlertDialog.Overlay className="...fixed inset-0 bg-black/40..." />
             <AlertDialog.Content className="<responsive classes z fazy 5, width 520px>">
               <AlertDialog.Title className="text-[19px] font-bold">Choose a match</AlertDialog.Title>
               <AlertDialog.Description className="sr-only">Re-match game with IGDB.</AlertDialog.Description>

               <MetadataMatchPicker
                 candidatesQuery={r.candidatesQuery}
                 selectedProviderId={r.selectedProviderId}
                 selectedCandidate={r.selectedCandidate}
                 onSelect={r.setSelectedProviderId}
                 onClearSelection={() => r.setSelectedProviderId(null)}
                 onEditSearch={() => {}}  // n/a w re-match
                 onSkip={() => r.setOpen(false)}
                 onConfirm={r.onConfirmClick}
                 onContinueWithoutMatch={() => r.setOpen(false)}
                 fallbackColor={game.coverColor ?? 'gray'}
                 title={game.title}
                 isCreating={r.mutation.isPending}
               />

               <div className="mt-6 flex justify-end gap-2">
                 <Button variant="outline" size="sm" onClick={() => r.setOpen(false)} disabled={r.mutation.isPending}>Cancel</Button>
                 {r.selectedCandidate && (
                   <Button variant="primary" size="sm" onClick={r.onConfirmClick} disabled={r.mutation.isPending}>
                     {r.mutation.isPending ? 'Saving…' : 'Apply match'}
                   </Button>
                 )}
               </div>
             </AlertDialog.Content>
           </AlertDialog.Portal>
         </AlertDialog.Root>

         <AlertDialog.Root open={!!r.pendingReplace} onOpenChange={(v) => !v && r.setPendingReplace(null)}>
           <AlertDialog.Portal>
             <AlertDialog.Overlay className="..." />
             <AlertDialog.Content className="...w-[400px]...">
               <AlertDialog.Title>Replace your uploaded cover?</AlertDialog.Title>
               <AlertDialog.Description>The IGDB cover will replace your uploaded image. This cannot be undone.</AlertDialog.Description>
               <div className="mt-6 flex justify-end gap-2">
                 <Button variant="outline" size="sm" onClick={() => r.confirm({ keepCover: true })} disabled={r.mutation.isPending}>Keep my cover</Button>
                 <Button variant="primary" size="sm" onClick={() => r.confirm()} disabled={r.mutation.isPending}>Replace</Button>
               </div>
             </AlertDialog.Content>
           </AlertDialog.Portal>
         </AlertDialog.Root>
       </>
     );
   }
   ```
   Uwaga: `MetadataMatchPicker` z fazy 5 dostaje już prawie wszystko. Jeśli sygnatura propsów jest inna niż wyżej — dostosuj. **NIE zmieniaj kontraktu picker'a** — adaptuj wywołanie tutaj.
2. W `apps/client/src/pages/game-view.tsx`:
   - Znajdź miejsce z "Upload cover" buttonem (`grep -n "Upload\|cover" apps/client/src/pages/game-view.tsx`).
   - POD nim (w tej samej kolumnie / kontenerze) wstaw `<RematchButton game={game} />`.
   - Import `RematchButton`.
3. `bun --filter @games/client run check` + lint czyste.
4. **Manual test (OBOWIĄZKOWY):**
   - Dev server. Otwórz `/games/<id>` istniejącej gry BEZ enrichment (brak cover/year/developer) → button **"Find IGDB match"** (primary).
   - Klik → modal z Step-2 picker → wybierz kandydata → "Apply match" → modal zamyka się, page refreshuje się z cover/year/developer.
   - Wróć na detail → button to teraz **"Re-match on IGDB"** (ghost).
   - Klik → wybierz inny kandydata → cover host IGDB → silent overwrite.
   - Manualnie wgraj cover przez "Upload cover" (UploadThing). Klik "Re-match on IGDB" → wybierz kandydata z IGDB cover → confirm dialog "Replace your uploaded cover?" pojawia się → "Keep my cover" → developer/rok zmieniają się, cover ZOSTAJE UploadThing.
   - Powtórz, kliknij "Replace" → cover zmienia się na IGDB.
   - Mobile view → modal jest bottom sheet.
5. **Konsola:** zero errorów.
6. `bun test` cały → wszystko zielone.

**Rezultat:** Re-match flow działa, cover-replace confirm działa, integracja z `game-view` complete.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co dokładnie nie działa, jaki błąd dostałeś, jaka twoja hipoteza co jest przyczyną>
Zakończ pracę. Nie próbuj obejść problemu w inny sposób.
