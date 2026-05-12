# Game Create Form Rebuild — Faza 2: Client autocomplete hook + status query

## Goal
Przygotuj logikę autocomplete'a tytułu gry, którą zużyje przebudowany `game-form.tsx` w fazie 3:
1. Hook `useIgdbStatusQuery()` — pyta `GET /api/games/metadata/status` i zwraca `{ igdbConfigured: boolean }`.
2. Hook `useGameTitleAutocomplete({ title, platform, enabled })` — debounce (~300ms) na `title`, woła istniejący `useMetadataCandidatesQuery`, zwraca `{ candidates, isLoading, debouncedTitle }`. Nie woła requestu gdy `enabled === false`, gdy `title.trim().length < 2`, albo gdy `platform === ''`.

To czysta logika (hook + query) — żadnego renderingu UI. Faza 3 podepnie ją pod nowy układ formularza.

## Definition of Done
- [ ] Plik `apps/client/src/hooks/use-igdb-status.ts` istnieje, eksportuje `useIgdbStatusQuery()` oparty o TanStack `useQuery`. Query key: `['igdb-status']`. `staleTime: Infinity` (status nie zmienia się w trakcie życia procesu API).
- [ ] Plik `apps/client/src/hooks/use-game-title-autocomplete.ts` istnieje, eksportuje `useGameTitleAutocomplete(args)` i typ `UseGameTitleAutocompleteResult`. Wewnątrz używa `useMetadataCandidatesQuery` z `apps/client/src/lib/queries.ts`.
- [ ] Debouncing tytułu: `useGameTitleAutocomplete` trzyma osobny `debouncedTitle` state, aktualizowany 300ms po ostatniej zmianie `title` (przez `useEffect` + `setTimeout` z czyszczeniem w cleanupie). `useMetadataCandidatesQuery` odpalany jest `(debouncedTitle, platform, enabled && igdbConfigured && debouncedTitle.length >= 2 && platform !== '')`.
- [ ] W `apps/client/src/lib/api.ts` dodana funkcja `fetchMetadataStatus(signal?: AbortSignal): Promise<{ igdbConfigured: boolean }>` używająca tego samego stylu co `fetchMetadataCandidates` (relative URL `/api/games/metadata/status`, credentials, error handling).
- [ ] Typ `MetadataStatusResponse` (lub inline) wyeksportowany z `api.ts` lub `types.ts` — bez duplikatu.
- [ ] Testy:
  - `apps/client/src/hooks/__tests__/use-game-title-autocomplete.test.tsx` — sprawdza: (a) gdy `enabled=false` query się nie odpala (mock `fetch` nie został zawołany po 350ms), (b) gdy `title='ze'` (poniżej 2 znaków NIE — tu min to >= 2, więc `'ze'` jest OK; użyj `'z'` jako poniżej progu), (c) zmiana `title` w obrębie 300ms nie odpala requestu wielokrotnie (debounce kolapsuje).
  - Test dla `useIgdbStatusQuery` opcjonalny — wystarczy że typecheck przechodzi i hook jest wywoływany w teście integracyjnym fazy 3.
- [ ] `bun run check` + `bun run lint` czyste w katalogu klienta.
- [ ] Backend i istniejące testy klienta nadal zielone.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`).
**Stack klienta:** React 18+, TanStack Query (już w projekcie — patrz `useMetadataCandidatesQuery` w `apps/client/src/lib/queries.ts`).
**Testy klienta:** używają biblioteki testowej już skonfigurowanej w repo (zobacz inny istniejący test hooka, np. `apps/client/src/hooks/__tests__/*.test.tsx` jeśli istnieje, albo wzoruj się na konwencji z `apps/client/src/components/__tests__/*` — w razie braku konwencji pomiń test pliku i ogranicz się do testu integracyjnego w fazie 3, ale zgłoś to w komentarzu PR).

### Step 0: Pobierz dokumentację
Użyj Context7:
- TanStack Query v5: "useQuery enabled flag" oraz "queryKey with derived state"
- React: "useEffect cleanup setTimeout debounce pattern"

Jeśli MCP niedostępny — wzoruj się na obecnych użyciach w `apps/client/src/lib/queries.ts` (już używa `useQuery` z `enabled`).

### Relevant files (edit only these)
- `apps/client/src/lib/api.ts` — dodaj `fetchMetadataStatus`.
- `apps/client/src/lib/queries.ts` — dodaj `useIgdbStatusQuery` (alternatywnie nowy plik `use-igdb-status.ts` w `hooks/`; preferuj `hooks/` żeby trzymać konwencję z innych hooków).
- `apps/client/src/hooks/use-igdb-status.ts` — NOWY.
- `apps/client/src/hooks/use-game-title-autocomplete.ts` — NOWY.
- `apps/client/src/hooks/__tests__/use-game-title-autocomplete.test.tsx` — NOWY (jeśli w repo jest konwencja testów hooków).

### Files to read but NOT edit
- `apps/client/src/lib/queries.ts` — żeby skopiować wzorzec `useMetadataCandidatesQuery` i `usePlatformsQuery`.
- `apps/client/src/lib/api.ts` — żeby zobaczyć `fetchMetadataCandidates` (Twoja nowa funkcja musi być z nim spójna stylistycznie: `credentials`, `Accept`, error message).
- `apps/client/src/types.ts` — typy `MetadataCandidate`, `MetadataCandidatesResponse`.
- `apps/client/src/hooks/use-add-game-with-metadata.ts` — istniejący hook IGDB-aware (NIE kopiuj go; ma inny use case: dwustopniowy dialog. Twój hook jest prostszy: tylko autocomplete pod inputem).

## Design decisions
- Hook autocomplete'a NIE zarządza wyborem kandydata ani stanem formularza — to robocza warstwa. Wybór kandydata wyląduje w fazie 3 jako lokalny state komponentu (`selectedCandidate: MetadataCandidate | null`).
- Debounce żyje w hooku, nie w komponencie — żeby był łatwo testowalny i wielokrotnie używalny.
- Próg długości tytułu: `debouncedTitle.trim().length >= 2`. Krótsze stringi nie odpalają requestu (IGDB i tak nie zwróci nic sensownego, a backend ma min 1 ale to za luźne dla UX).
- Status IGDB cache'ujemy na cały czas życia aplikacji (`staleTime: Infinity`, `gcTime: Infinity`). Nie ma sensu refetchować — to wartość zafrozona w env procesu API.
- Nie korzystamy z `useDeferredValue` ani `useTransition` — debounce z `setTimeout` jest bardziej deterministyczny i testowalny.

## Constraints
- TDD: NAJPIERW test debounce'a (RED), POTEM implementacja (GREEN). Test pisany pod `@testing-library/react` (patrz inne testy w repo żeby potwierdzić jaki harness jest skonfigurowany).
- NIE modyfikuj `useMetadataCandidatesQuery` ani `MetadataCandidatesResponse` — Twoj hook tylko go OPAKOWUJE.
- NIE wstawiaj fetch'a bezpośrednio w hooku — wszystkie wywołania HTTP idą przez `apps/client/src/lib/api.ts`.
- NIE używaj `lodash.debounce` ani innych zewnętrznych zależności — natywny `setTimeout` + `useEffect` cleanup wystarczy.
- Hook MUSI tolerować szybkie remounty (cleanup `setTimeout` w `useEffect` return).
- Sygnatura hooka jest STABILNA i opisana niżej — nie zmieniaj jej, faza 3 jej oczekuje.

## API kontraktów (faza 3 będzie ich oczekiwać)

```ts
// apps/client/src/hooks/use-igdb-status.ts
export function useIgdbStatusQuery(): UseQueryResult<{ igdbConfigured: boolean }>;

// apps/client/src/hooks/use-game-title-autocomplete.ts
export interface UseGameTitleAutocompleteArgs {
  title: string;
  platform: string;
  enabled: boolean; // gate ze statusem IGDB; faza 3 poda igdbConfigured ?? false
}
export interface UseGameTitleAutocompleteResult {
  candidates: readonly MetadataCandidate[];
  isLoading: boolean;
  isError: boolean;
  debouncedTitle: string;
  // true jeśli hook AKTUALNIE odpalałby request (po debounce i przejściu wszystkich warunków)
  isActive: boolean;
}
export function useGameTitleAutocomplete(
  args: UseGameTitleAutocompleteArgs,
): UseGameTitleAutocompleteResult;
```

## Steps

### Step 1: `fetchMetadataStatus` + `useIgdbStatusQuery`
**Co robimy:**
1. W `apps/client/src/lib/api.ts` dodaj `export async function fetchMetadataStatus(signal?: AbortSignal): Promise<{ igdbConfigured: boolean }>` — wzoruj się dosłownie na `fetchMetadataCandidates`, tylko URL = `/api/games/metadata/status`, brak query params.
2. Utwórz `apps/client/src/hooks/use-igdb-status.ts`:
   ```ts
   import { useQuery } from '@tanstack/react-query';
   import { fetchMetadataStatus } from '@/lib/api';
   export function useIgdbStatusQuery() {
     return useQuery({
       queryKey: ['igdb-status'] as const,
       queryFn: ({ signal }) => fetchMetadataStatus(signal),
       staleTime: Infinity,
       gcTime: Infinity,
       retry: 0,
     });
   }
   ```
3. `bun run check` w `apps/client` → czyste.
**Rezultat:** hook statusu istnieje, typecheck OK. Nie testujemy go izolowanie — faza 3 zweryfikuje go w teście integracyjnym formularza (gdy tam są testy) lub manualnie.

### Step 2: Test debounce'a `useGameTitleAutocomplete` (RED)
**Co robimy:**
1. Sprawdź czy w repo są już testy hooków klienta. Jeśli tak — wzoruj się na konwencji. Jeśli nie — pomiń krok i przejdź do Step 3 (oznacz w komentarzu PR że test integracyjny zostanie dodany w fazie 3).
2. Utwórz `apps/client/src/hooks/__tests__/use-game-title-autocomplete.test.tsx` z testami:
   - **disabled-not-firing:** render hooka z `{ title: 'elden', platform: 'PS5', enabled: false }`. Mock `fetch` (lub `fetchMetadataCandidates`). Po `await new Promise(r => setTimeout(r, 400))` — `fetch` mock NIE został wywołany. `result.current.isActive === false`.
   - **below-min-length:** render z `{ title: 'e', platform: 'PS5', enabled: true }`. Po 400ms — `fetch` nadal nie wywołany.
   - **debounce-collapses:** render z `{ title: 'el', platform: 'PS5', enabled: true }`. Po 100ms zmień title na `'eld'`. Po 100ms zmień na `'elde'`. Po 100ms zmień na `'elden'`. Łącznie odczekaj 400ms od ostatniej zmiany. `fetch` wywołany DOKŁADNIE RAZ, z `title=elden`.
3. `bun test apps/client/src/hooks/__tests__/use-game-title-autocomplete.test.tsx` → RED.
**Rezultat:** plik testowy istnieje, testy FAILUJĄ (bo hook jeszcze nie istnieje).

### Step 3: Implementacja `useGameTitleAutocomplete` (GREEN)
**Co robimy:**
1. Utwórz `apps/client/src/hooks/use-game-title-autocomplete.ts`:
   - `const [debouncedTitle, setDebouncedTitle] = useState(title.trim());`
   - `useEffect`: `const id = setTimeout(() => setDebouncedTitle(title.trim()), 300); return () => clearTimeout(id);` — deps `[title]`.
   - `const trimmed = debouncedTitle.trim();`
   - `const isActive = enabled && trimmed.length >= 2 && platform.length > 0;`
   - `const candidatesQuery = useMetadataCandidatesQuery(trimmed, platform, isActive);` (reużyj istniejącego — on już ma własną logikę `enabled` na trimmed/platform, ale Twój `isActive` dokłada warunek z IGDB statusu i min length).
   - Zwróć `{ candidates: candidatesQuery.data?.candidates ?? [], isLoading: candidatesQuery.isFetching, isError: candidatesQuery.isError, debouncedTitle: trimmed, isActive }`.
2. `bun test` → GREEN.
3. `bun run check` + `bun run lint` w `apps/client` → czyste.
**Rezultat:** hook działa, testy zielone, lint/check czyste.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>
Zakończ pracę.
