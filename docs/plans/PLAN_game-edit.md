# Dodaj możliwość edycji gry (vertical slice)

## Goal
Umożliwić użytkownikowi edycję istniejącej gry: z `GameEditPage` wysyła zmodyfikowany
formularz → backend waliduje (Zod + domena) → zapisuje zmiany do SQLite → klient
dostaje zaktualizowany `Game` i odświeża cache. `GameEditPage` i `GameForm` już
istnieją (ładowanie gry, wypełnianie pól), ale submit w trybie `edit` obecnie tylko
nawiguje — cała ścieżka zapisu jest do dodania.

## Definition of Done
- [ ] `PUT /api/games/:id` zwraca 200 ze zaktualizowanym `Game` dla poprawnego inputu
- [ ] `PUT /api/games/:id` zwraca 404 gdy gra nie istnieje
- [ ] `PUT /api/games/:id` zwraca 400 dla niepoprawnego inputu (Zod) lub błędu domeny
- [ ] Testy domeny przechodzą: `cd apps/api && bun test` (factory update — happy + edge cases)
- [ ] Testy use case przechodzą: `cd apps/api && bun test` (z fake repo: success, not_found, invalid)
- [ ] Logika walidacji i biznesowa jest w `src/domain/` i `src/application/`, NIE w route handlerze
- [ ] Handler `PUT /api/games/:id` ≤ 25 linii, deleguje do use case
- [ ] `GameForm` w trybie `edit` po submit wysyła request i po sukcesie nawiguje do `/games/:id`
- [ ] Cache react-query dla `['game', id]` i `['games']` jest inwalidowany po update
- [ ] Lint clean: `bun run lint` (z rootu monorepo)
- [ ] Typecheck clean: `cd apps/api && bun run typecheck` oraz `cd apps/client && bun run typecheck`

Agent kończy pracę WYŁĄCZNIE gdy wszystkie powyższe checkboxy są spełnione.

## Context
**Stack (istniejący w repo — NIE zmieniaj):**
- Backend: Bun + Hono + Drizzle ORM + **SQLite** (better-sqlite3) + Zod
- Frontend: React + react-router-dom + Tailwind + TanStack Query + Radix
- Monorepo: `apps/api` (backend), `apps/client` (frontend), workspace root = `/Users/kodari/projects/games`
- Runtime: **Bun** (NIE Node/npm/npx). Komendy:
  - instalacja pakietów: `bun add <pkg>` — **w tym planie NIC NIE DODAJEMY**, wszystkie deps już są
  - testy: `bun test` (wbudowany runner w Bun, bez Jest/Vitest)
  - dev api: `bun run --cwd apps/api dev`
  - dev client: `bun run --cwd apps/client dev`
  - lint: `bun run lint` (biome, z rootu)
  - typecheck: `bun run typecheck` (per app)

**Architektura (istnieje w `apps/api/src/`):**
- `domain/games/game.ts` — typy `Game`, `NewGame`, `GameValidationError`, factory `createNewGame`
- `domain/games/game-repository.ts` — port `GameRepository` (ma `list`, `findById`, `create`)
- `domain/shared/result.ts` — `Result<T, E>`, `ok`, `err`
- `application/games/create-game.ts`, `get-game.ts`, `list-games.ts` — use cases (class-based, DI przez konstruktor)
- `infrastructure/games/drizzle-game-repository.ts` — adapter implementujący port
- `infrastructure/db/schema.ts` — `games` table (Drizzle, SQLite)
- `routes/games.ts` — cienkie Hono handlery, instancjonują use cases + repo

**Konwencje do naśladowania (sprawdź istniejące pliki i dopasuj styl 1:1):**
- Factory w domenie zwraca `Result<T, DomainError>` — nie rzuca wyjątków
- Use case: klasa z `constructor(private readonly repo: Repo)` + `async execute(...)`
- Route handler: parsuj input → wywołaj use case → zmapuj Result na HTTP response
- Naming angielski, plik per pojęcie, kebab-case nazwy plików

**Frontend (istnieje w `apps/client/src/`):**
- `pages/game-edit.tsx` — ładuje grę via `useGameQuery`, renderuje `<GameForm mode="edit" initialGame={game} />`
- `components/game-form.tsx` — obsługuje mode `create` | `edit`. W trybie edit `onSubmit` aktualnie TYLKO `navigate('/games')` (linie ~89–93) — do przepisania na wywołanie mutacji
- `lib/api.ts` — fetch helpery (`fetchGames`, `fetchGame`, `createGame`, `CreateGameInput`)
- `lib/queries.ts` — `useGamesQuery`, `useGameQuery`, `useCreateGameMutation`
- Router w `main.tsx` ma już `path: 'games/:id/edit'` → `GameEditPage`

### Relevant files (edit only these)
Backend:
- `apps/api/src/domain/games/game.ts` — dodaj `createGameUpdate` factory (update-specific walidacja)
- `apps/api/src/domain/games/game-repository.ts` — dodaj metodę `update` do portu
- `apps/api/src/domain/games/__tests__/game.test.ts` — **NOWY** — testy factory
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — zaimplementuj `update`
- `apps/api/src/application/games/update-game.ts` — **NOWY** — use case
- `apps/api/src/application/games/__tests__/update-game.test.ts` — **NOWY** — testy use case (z fake repo)
- `apps/api/src/routes/games.ts` — dodaj handler `PUT /:id`

Frontend:
- `apps/client/src/lib/api.ts` — dodaj `updateGame(id, input)` + typ `UpdateGameInput`
- `apps/client/src/lib/queries.ts` — dodaj `useUpdateGameMutation`
- `apps/client/src/components/game-form.tsx` — wywołanie mutacji update w trybie `edit`

### Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — używaj `ok` / `err`
- `apps/api/src/infrastructure/db/schema.ts` — schemat `games` (bez zmian — update używa istniejących kolumn)
- `apps/api/src/infrastructure/db/client.ts` — `db`
- `apps/api/src/application/games/create-game.ts` — wzorzec dla use case (naśladuj 1:1)
- `apps/api/src/application/games/get-game.ts` — wzorzec dla not_found
- `apps/client/src/types.ts` — typy `Game`, `GamePlatform`, `GameStatus`
- `apps/client/src/pages/game-edit.tsx` — już działa, NIE ruszaj

## Constraints (hard rules)
- TDD: NIE pisz kodu produkcyjnego domeny/use case bez UPRZEDNIEGO testu. Kolejność: test (RED) → implementacja (GREEN)
- NIE dodawaj zależności przez `bun add` — wszystkie potrzebne pakiety już są w `package.json`
- NIE zmieniaj schematu DB ani nie generuj migracji — kolumny już istnieją, update używa tych samych pól co create
- NIE wrzucaj logiki walidacji/biznesowej do `routes/games.ts` — handler ma tylko: parsuj → wywołaj use case → zmapuj Result
- NIE importuj `infrastructure/` ani `db` w `domain/` — dependency rule
- NIE modyfikuj plików spoza listy "Relevant files"
- NIE twórz abstrakcji "na zapas" (YAGNI) — ten feature to aktualizacja wszystkich pól gry, nie partial update
- NIE pisz API Drizzle / react-query z pamięci jeśli nie jesteś pewien — patrz "Step 0"
- Nazwy klas/funkcji naśladuj istniejący kod (`CreateGame` → `UpdateGame`, `createNewGame` → `createGameUpdate`)
- NIE dodawaj `updatedAt` kolumny — poza scope

## Implementation plan

### Step 0: Pobierz dokumentację (tylko jeśli potrzebne)
**Co robimy:** Jeśli nie jesteś pewien API:
- Drizzle ORM (SQLite): "how to update row by id with returning in drizzle-orm sqlite (better-sqlite3)"
- Zod v4: "z.object partial vs strict, safeParse usage"
- TanStack Query v5: "useMutation with invalidateQueries for specific key and list key"
- Bun test runner: "bun test basic assertions and describe/it"

Pobieraj wyłącznie to, co jest realnie niepewne. Wzorce Drizzle widać w
`drizzle-game-repository.ts` (metoda `create` używa `.insert().values().returning()`),
wzorce Zod w `create-game.ts`, wzorce react-query w `queries.ts`. Naśladuj je.

**Rezultat:** masz ewentualne braki pokryte. Kod piszesz z istniejących wzorców + docs.

### Step 1: Domain types — rozszerz port i dodaj typ update factory
**Co robimy w `apps/api/src/domain/games/game-repository.ts`:**
```ts
// Dodaj metodę do interfejsu GameRepository:
update(id: number, game: NewGame): Promise<Game | null>; // null gdy nie istnieje
```

**Co robimy w `apps/api/src/domain/games/game.ts`:**
Factory dla update jest tożsamy semantycznie z `createNewGame` (te same reguły
walidacji, pełna aktualizacja wszystkich pól). Ale zgodnie z DDD chcemy mieć
wyraźne pojęcie "game update":
```ts
// Dodaj alias typu (ten sam kształt co NewGame):
export type GameUpdate = NewGame;

// Dodaj factory — na razie deleguje do createNewGame (reguły są te same):
export function createGameUpdate(input: unknown): Result<GameUpdate, GameValidationError> {
  return createNewGame(input);
}
```
Zachowujemy osobną nazwę, bo jeśli w przyszłości zmienią się reguły update
(np. niektórych pól nie da się zmienić) — mamy miejsce bez refaktoru callersów.

**Rezultat:** `cd apps/api && bun run typecheck` — czyste. Implementacja portu
w `DrizzleGameRepository` NIE istnieje jeszcze — w tym momencie TypeScript będzie
krzyczał na `drizzle-game-repository.ts`. Przejdź dalej — zaraz to naprawimy.

### Step 2: TEST domeny (RED)
**Co robimy:** Utwórz `apps/api/src/domain/games/__tests__/game.test.ts` (nowy folder).
Używamy wbudowanego Bun test runnera:
```ts
import { describe, it, expect } from 'bun:test';
import { createGameUpdate } from '../game';
```
Testy do napisania (minimum):
- `createGameUpdate` z kompletnym poprawnym inputem → `ok: true`, `value` ma wszystkie pola
- `createGameUpdate` z pustym `title` → `ok: false`, `error.kind === 'title_empty'`
- `createGameUpdate` z pustym `developer` → `ok: false`, `error.kind === 'developer_empty'`
- `createGameUpdate` z `releaseYear: 1900` → `ok: false`, `error.kind === 'release_year_out_of_range'`
- `createGameUpdate` z `hoursPlayed: -5` → `ok: false`, `error.kind === 'hours_played_negative'`
- `createGameUpdate` z pustym `edition` → `ok: true`, `value.edition === undefined`

Uruchom: `cd apps/api && bun test`.
**Rezultat:** testy przechodzą od razu — factory deleguje do istniejącego `createNewGame`.
Ten krok jest semantycznie "GREEN od startu" (bo implementacja już istnieje pod spodem),
ALE bez tych testów nie masz kotwicy dla przyszłych zmian reguł update. To jest OK
i zgodne z TDD dla tego konkretnego przypadku delegacji.

### Step 3: Repository adapter — implementacja `update`
**Co robimy w `apps/api/src/infrastructure/games/drizzle-game-repository.ts`:**
```ts
async update(id: number, game: NewGame): Promise<Game | null> {
  const [updated] = await db
    .update(gamesTable)
    .set({
      title: game.title,
      developer: game.developer,
      genre: game.genre,
      releaseYear: game.releaseYear,
      platform: game.platform,
      edition: game.edition ?? null,
      hoursPlayed: game.hoursPlayed,
      status: game.status,
    })
    .where(eq(gamesTable.id, id))
    .returning();

  if (!updated) return null;
  return this.mapRowToGame(updated);
}
```
Użyj już zaimportowanego `eq` z `drizzle-orm`. Naśladuj mapping z `create`.

**Rezultat:** `cd apps/api && bun run typecheck` — czyste (port i implementacja zgadzają się).

### Step 4: TEST use case (RED)
**Co robimy:** Utwórz `apps/api/src/application/games/__tests__/update-game.test.ts`.
Na górze testu zdefiniuj `FakeGameRepository implements GameRepository` (in-memory):
- `list()` — może rzucać `not implemented` (nieużywane tutaj)
- `create()` — może rzucać `not implemented`
- `findById(id)` — zwraca z mapy albo null
- `update(id, game)` — jeśli nie ma w mapie → null, inaczej aktualizuje i zwraca

Testy (minimum 3):
- Happy path: repo ma grę id=1, wywołaj `UpdateGame.execute(1, validInput)` → `ok: true`, value.title = nowy title, a `repo` ma zaktualizowany rekord
- Not found: repo pusty, `execute(99, validInput)` → `ok: false`, `error.kind === 'not_found'`
- Invalid input (Zod): `execute(1, { title: '' })` → `ok: false`, `error.kind === 'invalid_input'`
- Domain error: input przechodzi Zod ale wali domenę (np. `releaseYear: 1900` sprzeda się jako Zod błąd — wybierz przypadek który przechodzi Zod ale wali domain factory; w praktyce `createNewGame` powiela większość reguł Zod, więc jeden test `invalid_input` wystarczy — nie dubluj)

Uruchom: `cd apps/api && bun test` → nowe testy FAILUJĄ (RED), bo `UpdateGame` jeszcze nie istnieje.
Testy domeny z Step 2 wciąż GREEN.
**Rezultat:** nowe testy istnieją i failują z powodu braku implementacji use case.

### Step 5: Application service — `UpdateGame` (GREEN)
**Co robimy w `apps/api/src/application/games/update-game.ts`:**
Naśladuj `create-game.ts` 1:1:
```ts
import { z } from 'zod';
import { type Game, type GameValidationError, createGameUpdate } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const UpdateGameInputSchema = z.object({
  title: z.string().min(1),
  developer: z.string().min(1),
  genre: z.string().optional().default(''),
  releaseYear: z.coerce.number().min(1970).max(2100),
  platform: z.enum(['PS3', 'PS4', 'PS5', 'PC', 'Xbox', 'Switch']),
  edition: z.string().optional().default(''),
  hoursPlayed: z.coerce.number().min(0).default(0),
  status: z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']).default('Backlog'),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;

export type UpdateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError }
  | { kind: 'not_found' };

export class UpdateGame {
  constructor(private readonly repo: GameRepository) {}

  async execute(id: number, input: unknown): Promise<Result<Game, UpdateGameError>> {
    const parsed = UpdateGameInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }

    const data = parsed.data;
    const domainInput = {
      title: data.title,
      developer: data.developer,
      genre: data.genre,
      releaseYear: data.releaseYear,
      platform: data.platform,
      edition: data.edition || undefined,
      hoursPlayed: data.hoursPlayed,
      status: data.status,
    };

    const gameUpdateResult = createGameUpdate(domainInput);
    if (!gameUpdateResult.ok) {
      return err({ kind: 'domain', error: gameUpdateResult.error });
    }

    const updated = await this.repo.update(id, gameUpdateResult.value);
    if (!updated) {
      return err({ kind: 'not_found' });
    }

    return ok(updated);
  }
}
```
Uruchom: `cd apps/api && bun test` → WSZYSTKIE testy (domena + use case) GREEN.
**Rezultat:** zielone. Use case NIE importuje infrastructure.

### Step 6: Route handler — `PUT /api/games/:id`
**Co robimy w `apps/api/src/routes/games.ts`:**
1. Dodaj import `UpdateGame` i instancję:
   ```ts
   import { UpdateGame } from '../application/games/update-game';
   const updateGame = new UpdateGame(repo);
   ```
2. Dodaj handler (max ~25 linii):
   ```ts
   games.put('/:id', async (c) => {
     const id = Number(c.req.param('id'));
     if (!Number.isFinite(id)) {
       return c.json({ error: 'Invalid id' }, 400);
     }

     const body = await c.req.json();
     const result = await updateGame.execute(id, body);

     if (!result.ok) {
       const e = result.error;
       if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
       if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
       if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
       return c.json({ error: 'unknown error' }, 500);
     }

     return c.json(result.value);
   });
   ```

**Smoke test (opcjonalny, ale zalecany):**
```
cd apps/api && bun run dev  # osobny terminal
curl -X PUT http://localhost:3000/api/games/1 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Elden Ring","developer":"FromSoftware","genre":"ARPG","releaseYear":2022,"platform":"PS5","hoursPlayed":120,"status":"Completed"}'
# → 200 + JSON
curl -X PUT http://localhost:3000/api/games/99999 ... # → 404
curl -X PUT http://localhost:3000/api/games/1 -d '{"title":""}' ... # → 400
```
Dostosuj port (sprawdź `apps/api/src/index.ts`).
**Rezultat:** endpoint odpowiada poprawnie na trzy przypadki.

### Step 7: Frontend API client — `updateGame`
**Co robimy w `apps/client/src/lib/api.ts`:**
Dodaj na końcu pliku:
```ts
export type UpdateGameInput = CreateGameInput;

export async function updateGame(id: number, input: UpdateGameInput): Promise<Game> {
  const r = await fetch(`/api/games/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `Failed to update game: ${r.status}`);
  }
  return r.json();
}
```
**Rezultat:** eksport dostępny, typecheck czysty.

### Step 8: Frontend mutation hook — `useUpdateGameMutation`
**Co robimy w `apps/client/src/lib/queries.ts`:**
```ts
import { type UpdateGameInput, updateGame } from './api';
// ...
export function useUpdateGameMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateGameInput }) => updateGame(id, input),
    onSuccess: (game) => {
      qc.invalidateQueries({ queryKey: ['games'] });
      qc.invalidateQueries({ queryKey: ['game', String(game.id)] });
      qc.invalidateQueries({ queryKey: ['game', game.id] });
    },
  });
}
```
Inwalidujemy oba warianty klucza (string i number), bo `useGameQuery` bierze id
"jak leci" z `useParams` (string) lub callera — bezpieczniej pokryć oba.
**Rezultat:** hook dostępny, typecheck czysty.

### Step 9: Wire `GameForm` — edit mode wysyła mutację
**Co robimy w `apps/client/src/components/game-form.tsx`:**
1. Dodaj import:
   ```ts
   import { useCreateGameMutation, useUpdateGameMutation } from '@/lib/queries';
   import type { CreateGameInput, UpdateGameInput } from '@/lib/api';
   ```
2. W komponencie dodaj mutację update:
   ```ts
   const updateMutation = useUpdateGameMutation();
   ```
3. Zastąp obecny `onSubmit` (linie ~89–109) logiką oddzielającą oba tryby:
   ```ts
   const onSubmit = () => {
     const payload = {
       title: form.title.trim(),
       developer: form.developer.trim(),
       genre: form.genre.trim() || '',
       releaseYear: Number(form.releaseYear) || new Date().getFullYear(),
       platform: form.platform as GamePlatform,
       edition: form.edition.trim() || undefined,
       hoursPlayed: Number(form.hoursPlayed) || 0,
       status: form.status,
     };

     if (isEdit && initialGame) {
       updateMutation.mutate(
         { id: initialGame.id, input: payload satisfies UpdateGameInput },
         { onSuccess: (g) => navigate(`/games/${g.id}`) },
       );
       return;
     }

     createMutation.mutate(payload satisfies CreateGameInput, {
       onSuccess: () => navigate('/games'),
     });
   };
   ```
4. Zaktualizuj stan pending + error aby dotyczyły obu mutacji:
   ```ts
   const isPending = createMutation.isPending || updateMutation.isPending;
   const errorMessage =
     (createMutation.error?.message) ||
     (updateMutation.error?.message) ||
     null;
   ```
   Użyj `isPending` w `<FormSubmitButton disabled={!canSubmit || isPending}>` i
   renderuj `errorMessage` (usuń wcześniejszy warunek `!isEdit && ...`).

**Rezultat:** w przeglądarce flow działa:
- `/games/:id/edit` → zmiana pól → "Save Changes" → PUT → nawigacja do `/games/:id`
- Widok `/games/:id` pokazuje nowe dane (cache zinwalidowany)
- Lista `/games` też odświeżona

### Step 10: Final check
**Co robimy:**
```
bun run lint                          # z rootu
cd apps/api && bun run typecheck
cd apps/api && bun test
cd apps/client && bun run typecheck
```
Wszystko musi być zielone.
**Smoke test ręczny w przeglądarce:**
1. `bun run dev` z rootu (startuje oba apps)
2. Otwórz `/games`, kliknij grę, kliknij "Edit"
3. Zmień `title`, kliknij "Save Changes"
4. Sprawdź że przekierowuje do `/games/:id` i pokazuje nowy tytuł
5. Wróć do `/games` — lista ma nowy tytuł
6. Test błędu: wyczyść `title`, kliknij Save — przycisk disabled (walidacja formularza)

**Rezultat:** DoD spełniony. Koniec pracy.

## Out of scope (NIE rób tego)
- NIE dodawaj kolumny `updatedAt` ani timestampów
- NIE implementuj partial update (PATCH) — robimy pełny PUT
- NIE dodawaj autoryzacji / ownership check (brak auth w projekcie)
- NIE dodawaj optimistic updates w react-query — wystarcza invalidation
- NIE refaktoruj istniejącego `createNewGame` ani route'ów `GET`/`POST`
- NIE zmieniaj `GameViewPage` ani `GamesPage`
- NIE dodawaj obsługi uploadu cover image — stan `coverUrl` w formularzu zostaje lokalny (poza scope)
- NIE dodawaj testów e2e ani frontend unit testów — tylko backend unit (domain + use case)
- NIE instaluj żadnych nowych pakietów

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
```
STUCK at Step <N>: <co próbowałeś, jaki błąd, jaka hipoteza>
```
Zakończ pracę. Człowiek zdecyduje.
