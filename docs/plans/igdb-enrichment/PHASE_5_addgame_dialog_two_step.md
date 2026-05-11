# IGDB enrichment — Faza 5: AddGameDialog two-step + responsywny shell

## Prerequisite — backend touchpoints (DO THIS FIRST jeśli jesteś frontend-only agentem)
Ta faza modyfikuje TRZY pliki backendu oprócz frontu. Jeśli jesteś agentem scope'owanym tylko na `apps/client/`, MUSISZ także zedytować:

1. `apps/api/src/domain/games/game.ts` — rozszerz `GameProps` o opcjonalne `metadataRef?: { providerName: 'igdb'; providerId: string }`; rozszerz `NewGame` konstruktor o `_metadataRef: ExternalMetadataRef | null`; w `NewGame.create`, jeśli `props.metadataRef` jest present, zbuduj `ExternalMetadataRef.fromTrusted({...metadataRef, matchedAt: new Date()})` i przekaż do konstruktora. Mirror getter z `Game` class.
2. `apps/api/src/application/games/create-game.ts` — rozszerz OBA Zod schematy (`OwnedSchema` ~linia 37 ORAZ `WishlistSchema` ~linia 56) o pole:
   ```ts
   metadataRef: z.object({ providerName: z.literal('igdb'), providerId: z.string().trim().min(1) }).optional()
   ```
   **CRITICAL:** `WishlistSchema` jest `.strict()` (linia 59). PRESERVE `.strict()` przy dodawaniu pola. Regresyjny test `create-game.test.ts:260` ('rejects wishlist game with status field') polega na strict mode i MUSI zostać zielony. Verify przez `bun test apps/api/src/application/games/create-game.test.ts` PRZED i PO edycji.
   W `execute` przekaż `data.metadataRef` do `NewGame.create` props.
   **Update `FakeGameRepository.create` w `create-game.test.ts:20-38`:** przekazuj `metadataProvider`/`metadataProviderId`/`metadataMatchedAt` z `g.metadataRef` do `Game.fromPersistence` — inaczej jakikolwiek nowy test asserujący `result.value.metadataRef` failuje z fake'em mimo że prod code jest correct.
   Dodaj regresyjny test: `'creates owned game with metadataRef and persists it'` — asserts `result.value.metadataRef.providerId` równa się inputowi.
3. `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — w INSERT path (NIE update path — to zostało wired w PHASE 2 Step 4), jeśli `newGame.metadataRef !== null`, pisz 3 kolumny metadata. **CAUTION:** PHASE 2 Step 4 już dodał mapping read/write dla `Game` aggregate; tutaj mirror'ujesz dla `NewGame` aggregate INSERT.

Uruchom `bun test` po tych trzech edycjach i potwierdź że `create-game.test.ts` (i `drizzle-game-repository.test.ts` jeśli istnieje) dalej passuje — nowe pole `metadataRef` jest optional, więc istniejące testy nie powinny być affected.

Dopiero PO tych backend prerequisites, kontynuuj frontend work poniżej.

## Goal
Rozszerz `AddGameDialog` o krok 2: po submicie Step 1 (title + platform + cover color) wykonaj `GET /api/games/metadata/candidates`, pokaż listę kandydatów, pozwól wybrać jednego lub skipnąć. Po wyborze → `POST /api/games` z dodatkowymi polami (coverImage, releaseYear, developer, providerName, providerId). Responsywność: mobile = bottom sheet, desktop = centered dialog ~520px w step 2.

## Definition of Done
- [ ] Dialog ma dwa kroki — Step 1 (istniejący) + Step 2 (nowy candidate picker)
- [ ] Lista kandydatów renderuje się: cover thumb 64×86, title, year · developer, platform badges
- [ ] Wybór kandydata → preview card z "Change" link + przycisk zmienia się na "Add to collection"
- [ ] "Skip — enter manually" link → pomija enrichment, tworzy grę z polami z Step 1
- [ ] Empty state: "No IGDB matches for '<title>'" + buttony "Continue without match" / "Edit search"
- [ ] Degraded state: amber banner "Couldn't reach IGDB. You can still add the game manually." + primary "Continue without match"
- [ ] Mobile (<sm): bottom-sheet (`inset-x-0 bottom-0 rounded-t-2xl`); Desktop (sm+): centered, w step 2 width 520px
- [ ] `bun --filter @games/client run check` exits 0
- [ ] `bun --filter @games/client run lint` exits 0
- [ ] `grep -r 'console.log\|console.warn' apps/client/src/components/metadata-* apps/client/src/hooks/use-add-game-with-metadata.ts` zwraca empty (no debug statements left)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Out-of-band acceptance (human reviewer, NOT agent-verifiable)
Następujące checki wymagają human review — 27B local agent nie może self-verify browser console ani interactive flows:
- Manual test: dev server + browser → cały flow działa (happy + skip + empty + degraded)
- Brak błędów w konsoli przeglądarki
- Mobile view (<sm): bottom-sheet animation działa
- Desktop view (sm+): centered 520px w step 2

Te checki idą do PR description / handoff, NIE do agent DoD.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm).
**Stack frontend:** React + react-router-dom + Radix UI + Tailwind CSS + TanStack Query (React Query).
**Istniejący komponent:** `apps/client/src/components/add-game-dialog.tsx` używa `@radix-ui/react-alert-dialog` (Root/Portal/Overlay/Content/Title/Description), Tailwindowych klas z designsystem `apex-*` (np. `bg-apex-line-1`, `text-apex-ink`, `text-apex-hint`, `text-apex-accent`).
**Wzór mutacji:** `useCreateGameMutation()` z `apps/client/src/lib/queries.ts`. Endpoint `POST /api/games` w `api.ts:89 createGame(input)`.
**Wzór URL state:** `useUrlState()` z `apps/client/src/lib/url-state.ts` — `?add=1` otwiera dialog. Step state TRZYMAJ W LOCAL STATE komponentu, NIE w URL — URL zostaje czysty.
**Cover color:** `COVER_COLORS` z `@/lib/avatar`. `CoverColorPicker` używany w Step 1. Pole `coverColor` jest niezależne od cover image — zostaje nawet jeśli zostanie nadpisane przez IGDB cover. (UI: w Step 2 jeśli wybrano kandydata z `coverImageUrl`, wciąż wysyłaj `coverColor` z Step 1 do `POST /api/games` — back-up jeśli IGDB cover failuje przy load.)

### Step 0: Pobierz dokumentację (Context7)
**OBOWIĄZKOWE:**
1. `mcp__context7__resolve-library-id` z query `"radix-ui react alert dialog"` lub `"radix-ui dialog"` → wybierz id
2. `mcp__context7__query-docs` z library id + pytanie:  
   `"AlertDialog vs Dialog when to use, responsive content positioning with Tailwind classes, animation states"`
3. `mcp__context7__resolve-library-id` z query `"@tanstack/react-query"` 
4. `mcp__context7__query-docs` z pytaniem:  
   `"useQuery with conditional enabled flag, query key for search-by-input, caching strategy for short-lived dependent queries"`
5. `mcp__context7__resolve-library-id` z query `"tailwindcss"` 
6. `mcp__context7__query-docs` z pytaniem:  
   `"responsive utilities for bottom sheet on mobile vs centered modal on desktop, sm: breakpoint, fixed positioning patterns"`

## Visual spec

### Step 1 (NIE zmieniaj — już istnieje)
Title input + Platform select + CoverColorPicker + buttons Cancel/Find match.
Tylko zmień submit button label z "Add" na **"Find match"**.

### Step 2 — Candidate picker

**Header:**
- Title (h2 styl jak Step 1): **"Choose a match"**
- Subtitle: *"We found these on IGDB"* (jeśli candidates.length > 0)

**Loading state:**
- 3 skeleton rows (każdy: 64×86 placeholder + 2 linie tekstu)

**Empty state (degraded=false, candidates=[]):**
```
┌──────────────────────────────────────────┐
│ No IGDB matches for "Resident Evil 4"   │
│                                          │
│ [ Continue without match ] [ Edit search]│
└──────────────────────────────────────────┘
```
"Continue without match" = primary → POST z polami Step 1, bez enrichment.
"Edit search" = secondary outline → wraca do Step 1 z zachowanymi polami.

**Degraded state (degraded=true):**
Amber banner na górze (`bg-amber-50 border-amber-200 text-amber-900` lub equivalent):
**"Couldn't reach IGDB. You can still add the game manually."**
Pod spodem (centred): single primary button **"Continue without match"**. BEZ retry buttona. BEZ scary error icon.

**Happy state — candidate cards list:**

```
┌────────────────────────────────────────────────┐
│  ┌──────┐  Resident Evil 4                     │
│  │ 64×  │  2005 · Capcom                       │
│  │ 86px │  [GameCube] [PS2] [Wii] +3           │
│  └──────┘                              [ Use ] │
└────────────────────────────────────────────────┘
```

- Karta = `<button>` cała klikalna (caly card jako click target — nie tylko "Use" button)
- Selected state: 2px accent border (`border-2 border-apex-accent`) + tint (`bg-apex-accent/5`)
- "Use" button → ukryty na selected card (tekst zmienia się: `[ Selected ]`)
- Cover thumb: `<img src={coverImageUrl} loading="lazy" />` lub gradient placeholder (color z `coverColor` Step 1) jeśli `coverImageUrl === null`
- Platform badges: max 3 widoczne + `+N` jeśli więcej. Każdy = `<span class="px-1.5 py-0.5 text-[10px] bg-apex-line-1 rounded text-apex-hint">`
- Lista scrollable jeśli >5 widocznych (`max-h-[60vh] overflow-y-auto`)

**After picking (selected !== null):**
Kompaktowy preview card pod listą (`mt-4 border rounded-[7px] p-3`):
- Cover thumb 40×54 + title + meta
- Link "Change" (`text-apex-accent text-[12px] hover:underline`) — clear selection, wracaj do listy

**Footer (zawsze):**
- Lewa strona: **"Skip — enter manually"** (ghost link, `text-[12px] text-apex-muted hover:text-apex-accent`)
- Prawa strona: Cancel (outline) + Primary button. Label primary:
  - selected !== null → **"Add to collection"**
  - selected === null → ukryty (lub disabled)

**Responsive shell (CSS-driven, NO `vaul` dependency):**
- `<sm:` (mobile): `<AlertDialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl rounded-b-none bg-white p-6 max-h-[90vh] overflow-y-auto">`
- `sm:` i wyżej: `<AlertDialog.Content className="sm:fixed sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:w-[440px] sm:max-w-[calc(100vw-32px)] step2:sm:w-[520px]">`
- Step 2 widens to 520px desktop. Najprościej: condicjonalna klasa width na bazie `step === 2`.

**Attribution:**
Tiny copy pod listą kandydatów (`text-[10px] text-apex-hint`): **"Powered by IGDB"** (clickable → `https://www.igdb.com/`).

**Microcopy table:**
| Where | Copy |
|---|---|
| Step 1 submit | **Find match** |
| Step 2 header | **Choose a match** / *We found these on IGDB* |
| Per-candidate CTA | **Use** (selected: **Selected**) |
| Confirm button | **Add to collection** |
| Skip link | **Skip — enter manually** |
| No matches | **No IGDB matches for '<title>'** |
| IGDB down | **Couldn't reach IGDB. You can still add the game manually.** |

## Design decisions
- Step state w `useState`, NIE w URL (URL zostaje `?add=1`)
- Logika fetcha kandydatów + step transitions → `useAddGameWithMetadata()` custom hook. Komponent prezentacyjny.
- TanStack Query `useQuery` z keyem `['metadata-candidates', title, platform]`, `enabled: step === 2 && title !== '' && platform !== ''`, `staleTime: 5 * 60 * 1000` (5 min — short enough that IGDB recovery becomes visible without page reload; long enough to avoid refetch on every dialog open). NIE używaj `staleTime: Infinity` — degraded responses zostają "sticky" do reload.
- Wybór kandydata to local state (`selectedProviderId: string | null`)
- "Skip" / "Continue without match" / "Add to collection" — wszystkie wywołują tę samą mutację `createGameMutation`, tylko z różnym `payload`:
  - Skip/Continue: payload = Step 1 fields (title, platform, status='Backlog', format='physical', coverColor)
  - Add: payload = Step 1 fields + `coverImage`, `releaseYear`, `developer`, `metadataRef: { providerName: 'igdb', providerId: <id> }`
- **Trzeba rozszerzyć `CreateGameInput` w `apps/client/src/lib/api.ts` o nowe pola** (coverImage opcjonalne już może istnieć — sprawdź; metadataRef NOWE). Backend POST /api/games akceptuje te pola (są na `GameProps` z fazy 2 — sprawdź czy `create-game.ts` use case ma rozszerzony schema; jeśli nie → minimalna edycja w `create-game.ts` Zod schema by accept `metadataRef` opcjonalnie i przekazać do `NewGame.create`).
- **Backend follow-up:** `NewGame.create` musi przyjąć `metadataRef` w `GameProps` i przekazać do konstruktora. Sprawdź `apps/api/src/domain/games/game.ts:131-263` — DODAJ pole do `GameProps` + przekaż do `NewGame` constructora + getter. **Już wewnątrz tej fazy** — bo bez tego POST nie zapisze metadataRef przy initial create. Krótka edycja w `create-game.ts` schema + `NewGame.create` (max 30 linii).
- Cover image preload: w preview card użyj `<img onError={() => setUseGradient(true)}>` żeby fallback do koloru w razie problemu z IGDB CDN
- **Image hotlinking:** IGDB CDN images ładują się przez plain `<img src=...>` z `images.igdb.com`. NIE potrzebują `crossorigin` attribute — `<img>` elements nie wywołują CORS preflight. IGDB ToS pozwala na hotlinking z "Powered by IGDB" attribution (już wymagane w spec). **NIE dodawaj `crossorigin='anonymous'`** — wymusiłoby CORS preflight którego IGDB CDN nie advertuje, breaking image loads.
- **Cover URL host whitelist on create path (KNOWN GAP, document only):** istniejący `create-game.ts` Zod schema waliduje `coverImage` tylko `z.string().url()` — URL SHAPE only, NOT host. Malicious client może zsubmitować cover URL na dowolny host. To jest pre-existing gap, NIE introduced przez tę fazę, i jest out-of-scope tutaj. TODO: zwire `CoverImageUrl.create()` (z PHASE 2) w `NewGame.create` żeby host whitelist applied na każdą write path. File a follow-up issue; NIE rozszerzaj tej fazy żeby to naprawić.

### Relevant files (edit only these)
- `apps/client/src/components/add-game-dialog.tsx` — DUŻA edycja
- `apps/client/src/components/metadata-candidate-card.tsx` — NOWY
- `apps/client/src/components/metadata-match-picker.tsx` — NOWY (step 2 body)
- `apps/client/src/hooks/use-add-game-with-metadata.ts` — NOWY hook
- `apps/client/src/lib/api.ts` — DODAJ `fetchMetadataCandidates(title, platform)` + rozszerz typ `CreateGameInput` o `metadataRef?: { providerName: 'igdb'; providerId: string }`
- `apps/client/src/lib/queries.ts` — DODAJ `useMetadataCandidatesQuery(title, platform, enabled)`
- `apps/client/src/types.ts` (lub gdzie są typy) — DODAJ typ `MetadataCandidate`, `MetadataCandidatesResponse`
- `apps/api/src/domain/games/game.ts` — DODAJ `metadataRef` do `GameProps` i `NewGame` konstruktora (mała zmiana, ~10 linii)
- `apps/api/src/application/games/create-game.ts` — rozszerz Zod schema o `metadataRef` opcjonalne

### Files to read but NOT edit
- `apps/client/src/components/add-game-dialog.tsx` (cały — znaj obecny shape)
- `apps/client/src/lib/queries.ts` (wzór useQuery/useMutation)
- `apps/client/src/lib/api.ts` (wzór fetch wrapperów)
- `apps/api/src/routes/games-metadata.ts` (z fazy 4 — response shape)
- `apps/api/src/application/games/create-game.ts` (jaki Zod schema już ma)
- `apps/api/src/application/games/enrich-game-metadata.ts` (z fazy 4 — referencja kontraktu)

## Constraints
- NIE pisz Tailwind klas z pamięci — TYLKO z Context7 docs ze Step 0
- NIE pisz Radix kombinacji z pamięci — sprawdź w docs (jeśli używasz `Dialog.Root` zamiast `AlertDialog.Root` to ZUPEŁNIE INNY komponent; trzymaj się `AlertDialog` jak istniejący kod)
- NIE wrzucaj logiki do komponentu — fetch / mutate / state machine = `useAddGameWithMetadata`
- NIE dodawaj nowych dependencies (NO `vaul`, NO `react-spring`, NO `framer-motion`) — responsywność CSS-driven
- NIE pisz custom CSS (`.module.css`) — Tailwind only
- Jeśli komponent >150 linii → wydziel sub-komponent (preview card, candidate card, empty state)
- Step state w `useState`, NIE w URL
- Empty state / degraded state — różne komponenty, nie zgnij w jeden z 5 warunkami
- **NIE zmieniaj backend kontraktu PATCH /metadata** ani GET /candidates — one są zamknięte z fazy 4; tu konsumujemy, nie modyfikujemy
- W `react-query` queryKey UŻYJ znormalizowanej formy (lowercase title) — żeby `"Resident Evil 4"` i `"resident evil 4"` trafiły w ten sam cache (opcjonalne, ale sensowne)

## Steps

### Step 1: API client + types + hook + queries (bez UI)
**Co robimy:**
1. W `apps/client/src/types.ts` (lub odpowiednim pliku typów) dodaj:
   ```ts
   export type MetadataCandidate = {
     providerName: 'igdb';
     providerId: string;
     title: string;
     developer: string | null;
     releaseYear: number | null;
     coverImageUrl: string | null;
     platformNames: string[];
   };
   export type MetadataCandidatesResponse = {
     candidates: MetadataCandidate[];
     degraded: boolean;
     reason?: 'provider_down' | 'platform_unsupported' | 'rate_limited';
     staleAt?: string;
   };
   ```
2. W `apps/client/src/lib/api.ts` dodaj:
   ```ts
   export async function fetchMetadataCandidates(title: string, platform: string): Promise<MetadataCandidatesResponse> {
     const sp = new URLSearchParams({ title, platform });
     const res = await fetch(`/api/games/metadata/candidates?${sp.toString()}`, { credentials: 'include' });
     if (!res.ok) throw new Error('Failed to fetch metadata candidates');
     return res.json();
   }
   ```
   Rozszerz `CreateGameInput`:
   ```ts
   export type CreateGameInput = {
     // ... existing fields
     coverImage?: string;
     releaseYear?: number;
     developer?: string;
     metadataRef?: { providerName: 'igdb'; providerId: string };
   };
   ```
3. W `apps/client/src/lib/queries.ts` dodaj:
   ```ts
   export function useMetadataCandidatesQuery(title: string, platform: string, enabled: boolean) {
     return useQuery({
       queryKey: ['metadata-candidates', title.trim().toLowerCase(), platform],
       queryFn: () => fetchMetadataCandidates(title.trim(), platform),
       enabled: enabled && title.trim().length > 0 && platform.length > 0,
       staleTime: 5 * 60 * 1000,  // 5 min — IGDB recovery becomes visible without page reload; avoids refetch on every dialog open
       retry: 0,
     });
   }
   ```
4. (Backend mutations covered w Prerequisite block na górze pliku — confirm że są complete przed kontynuacją. NIE duplikuj tu instrukcji.)
5. `bun test` cały → wszystkie zielone.
6. `bun run check` czyste.

**Rezultat:** API client + types + query hook + extended `POST /api/games` accepts `metadataRef`.

### Step 2: `useAddGameWithMetadata` hook
**Co robimy:**
1. Utwórz `apps/client/src/hooks/use-add-game-with-metadata.ts`:
   ```ts
   export function useAddGameWithMetadata(initialPlatform: string) {
     const [step, setStep] = useState<1 | 2>(1);
     const [title, setTitle] = useState('');
     const [platform, setPlatform] = useState(initialPlatform);
     const [color, setColor] = useState<string>(COVER_COLORS[0]);
     const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

     const candidatesQuery = useMetadataCandidatesQuery(title, platform, step === 2);
     const createMutation = useCreateGameMutation();

     const goStep2 = () => setStep(2);
     const goStep1 = () => { setStep(1); setSelectedProviderId(null); };

     const selectedCandidate = candidatesQuery.data?.candidates.find(c => c.providerId === selectedProviderId) ?? null;

     const submit = (opts: { withMatch: boolean }) => {
       const base = { title: title.trim(), platform, status: 'Backlog' as const, format: 'physical' as const, coverColor: color };
       const payload = opts.withMatch && selectedCandidate
         ? { ...base, coverImage: selectedCandidate.coverImageUrl ?? undefined, releaseYear: selectedCandidate.releaseYear ?? undefined, developer: selectedCandidate.developer ?? undefined, metadataRef: { providerName: 'igdb' as const, providerId: selectedCandidate.providerId } }
         : base;
       return createMutation.mutateAsync(payload);
     };

     const queryClient = useQueryClient();
     const reset = () => {
       setStep(1); setTitle(''); setPlatform(initialPlatform); setColor(COVER_COLORS[0]); setSelectedProviderId(null); createMutation.reset();
       queryClient.invalidateQueries({ queryKey: ['metadata-candidates'] });
     };

     return { step, title, setTitle, platform, setPlatform, color, setColor, selectedProviderId, setSelectedProviderId, selectedCandidate, candidatesQuery, createMutation, goStep2, goStep1, submit, reset };
   }
   ```
2. `bun run check` czyste.

**Rezultat:** Hook zamyka całą logikę. Komponent będzie prezentacyjny.

### Step 3: Komponenty prezentacyjne (Card + Picker)
**Co robimy:**
1. `metadata-candidate-card.tsx`:
   ```tsx
   type Props = { candidate: MetadataCandidate; selected: boolean; onSelect: () => void; fallbackColor: string };
   export function MetadataCandidateCard({ candidate, selected, onSelect, fallbackColor }: Props) {
     // <button onClick={onSelect} className={...selected ? border-accent : border-line-1...}>
     //   <Thumb src={candidate.coverImageUrl} fallbackColor={fallbackColor} />
     //   <div>title, year · developer, platform badges</div>
     //   <span>{selected ? 'Selected' : 'Use'}</span>
     // </button>
   }
   ```
   Thumb sub-component: jeśli `coverImageUrl !== null` → `<img loading="lazy">`; on error lub null → div z `bg-${fallbackColor}`.
2. `metadata-match-picker.tsx`:
   ```tsx
   type Props = {
     candidatesQuery: ReturnType<typeof useMetadataCandidatesQuery>;
     selectedProviderId: string | null;
     selectedCandidate: MetadataCandidate | null;
     onSelect: (providerId: string | null) => void;
     onClearSelection: () => void;
     onEditSearch: () => void;
     onSkip: () => void;
     onConfirm: () => void;
     onContinueWithoutMatch: () => void;
     fallbackColor: string;
     title: string;
     isCreating: boolean;
   };
   export function MetadataMatchPicker(props: Props) {
     // 1. if isLoading → 3 skeleton rows
     // 2. if isError lub data.degraded → amber banner + "Continue without match"
     //    NOTE: data.reason can be 'provider_down' | 'rate_limited' | 'platform_unsupported'.
     //    All three intentionally collapse to one banner with one copy
     //    ("Couldn't reach IGDB. You can still add the game manually.") —
     //    PHASE 5 design decision (UX simplicity over signal precision for MVP).
     // 3. if data.candidates.length === 0 → empty state copy + buttons
     // 4. else → header + list of MetadataCandidateCard + (selectedCandidate ? preview card : null)
     // Footer renderowany W KOMPONENCIE NADRZĘDNYM (add-game-dialog) — Picker zwraca tylko body.
   }
   ```
3. `bun --filter @games/client run check` czyste.

**Rezultat:** Komponenty istnieją, kompilują się.

### Step 4: Integracja w `add-game-dialog.tsx` + responsywny shell + manual test
**Co robimy:**
1. W `add-game-dialog.tsx` zastąp ad-hoc useStates wywołaniem `useAddGameWithMetadata(platforms[0]?.name ?? '')`.
2. Renderuj warunkowo:
   - `step === 1` → istniejące pola (Title/Platform/CoverColor) + buttons (Cancel, **Find match**)
   - `step === 2` → `<MetadataMatchPicker {...} />` + footer (Skip link + Cancel + primary "Add to collection")
3. **Submit handlery:**
   - Step 1 "Find match" click → `goStep2()` (NIE wywołuj POST jeszcze; useQuery zaczyna fetcha bo `enabled=step===2`)
   - "Use" na karcie → `setSelectedProviderId(c.providerId)`
   - "Add to collection" → `submit({withMatch:true}).then(g => { reset(); close(); navigate('/games/' + g.id); })`
   - "Skip — enter manually" / "Continue without match" → `submit({withMatch:false}).then(...)`
   - "Edit search" → `goStep1()`
   - "Change" link w preview card → `setSelectedProviderId(null)`
4. **Responsywny shell:**
   - W `<AlertDialog.Content>` użyj klas:
     ```
     fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-white p-6 max-h-[90vh] overflow-y-auto
     sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:inset-x-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:max-w-[calc(100vw-32px)]
     ${step === 1 ? 'sm:w-[440px]' : 'sm:w-[520px]'}
     ```
   - Animacje fade/zoom z istniejącego kodu zostaw bez zmian.
5. Attribution: w step 2 pod listą (lub footer Picker'a) dodaj `<a href="https://www.igdb.com/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-apex-hint hover:underline">Powered by IGDB</a>`
6. **Manual test (OBOWIĄZKOWY):**
   - `bun --filter @games/api dev` + `bun --filter @games/client dev`. Otwórz w przeglądarce.
   - Kliknij "Add game" → wpisz "Resident Evil 4", platforma PS2, kolor → "Find match" → zobacz Step 2 z listą.
   - Wybierz kartę → preview pojawia się → "Add to collection" → nawiguje do `/games/<id>`. Sprawdź że cover image jest IGDB URL.
   - Powtórz, ale w Step 2 kliknij "Skip — enter manually" → game tworzy się z polami Step 1, bez cover image z IGDB.
   - Powtórz z tytułem typu "asdfqwerty1234" → Step 2 pokazuje empty state "No IGDB matches".
   - Wymuś degraded: tymczasowo wstaw nieprawidłowy `IGDB_CLIENT_SECRET` w `.env`, restart, repeat → zobacz amber banner.
   - Mobile view (DevTools 375px) → Step 2 to bottom sheet.
7. **Sprawdź konsolę przeglądarki:** zero errorów, zero warnów (poza znanymi z istniejącego kodu).
8. `bun --filter @games/client run check` + `bun --filter @games/client run lint` czyste.
9. `bun test` cały (back end + front end jeśli są testy klienta) → wszystko zielone.

**Rezultat:** Two-step flow działa w przeglądarce, mobile + desktop, happy + skip + empty + degraded.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co dokładnie nie działa, jaki błąd dostałeś, jaka twoja hipoteza co jest przyczyną>
Zakończ pracę. Nie próbuj obejść problemu w inny sposób.
