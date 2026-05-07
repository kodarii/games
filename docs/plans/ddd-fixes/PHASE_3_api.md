# DDD Fixes — Faza 3: API surface

## Goal
Ukryć wewnętrzne ID bazy danych przed klientem API i ujednolicić routing na `externalId`.
Po tej fazie klient widzi `id: string` (UUID, dawny `externalId`) zamiast `id: number`.
Endpointy `PUT/DELETE/GET /api/games/:id` używają externalId w ścieżce.

## Definition of Done
- [ ] `bun test apps/api/src` — wszystkie testy zielone
- [ ] `bun run check` — zero błędów TypeScript w całym monorepo
- [ ] Odpowiedź JSON NIE zawiera wewnętrznego `id: number` — tylko `id: string` (UUID)
- [ ] `PUT /api/games/:externalId`, `DELETE /api/games/:externalId`, `GET /api/games/:externalId` działają
- [ ] Frontend `types.ts`: `Game.id: string`, brak pola `externalId`
- [ ] Frontend `api.ts`: `updateGame(id: string)`, `deleteGame(id: string)`
- [ ] Frontend nie używa `game.externalId` nigdzie — zastąpione przez `game.id`

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**Fazy 1 i 2 muszą być skończone** — use-case'y przyjmują `externalId`, port używa externalId

## Design decisions

- `GameResponse` to plain object DTO bez `userId` i bez wewnętrznego `id: number`
- `id` w odpowiedzi = `externalId` z domeny (UUID string)
- Mapper `toGameResponse(game: Game): GameResponse` — funkcja w `routes/games.ts`
- Frontend: `fetchGame(id: string | number)` — już przyjmuje oba typy, zmiana type param wystarczy
- Router `games/:id` pozostaje niezmieniony w ścieżce — teraz id to UUID zamiast liczby

### Files to edit — backend
- `apps/api/src/routes/games.ts`

### Files to edit — frontend
- `apps/client/src/types.ts` — `Game.id: string`, usuń `externalId`
- `apps/client/src/lib/api.ts` — `updateGame(id: string)`, `deleteGame(id: string)`
- `apps/client/src/lib/queries.ts` — usuń `game.externalId`, napraw podwójne invalidation
- `apps/client/src/pages/game-view.tsx` — `game.externalId` → `game.id`
- `apps/client/src/pages/wishlist-columns.tsx` — `row.original.externalId` → `row.original.id`

### Files to read but NOT edit
- `apps/api/src/application/games/` — use-case'y zakończone w Fazie 2
- `apps/client/src/main.tsx` — router `games/:id` — ścieżka bez zmian

## Constraints
- `id: number` (wewnętrzne DB id) NIE pojawia się w żadnym response body
- `userId` NIE pojawia się w `GameResponse`
- Route handler max ~20 linii
- `Game.toJSON()` może zostać w klasie, ale routes NIE wywołują jej bezpośrednio
- W LIST endpointcie użyj `c.req.query('search')` itd. osobno (NIE `c.req.queries()` —
  to zwraca `string[]` zamiast `string`)

## Steps

### Step 1: DTO mapper w routes/games.ts

**Co robimy:**

1. Otwórz `apps/api/src/routes/games.ts`

2. Dodaj na górze pliku (po importach):
```typescript
type GameResponse = {
  id: string;          // externalId — publiczny UUID
  kind: string;
  title: string;
  developer: string | null;
  genre: string;
  releaseYear: number | null;
  platform: string;
  edition: string | undefined;
  hoursPlayed: number | null;
  status: string | null;
  format: string;
  coverColor: string | undefined;
  coverImage: string | null;
  price: number | null;
  purchasedAt: string | null;
  notes: string | null;
};

function toGameResponse(game: Game): GameResponse {
  return {
    id: game.externalId,
    kind: game.kind,
    title: game.title,
    developer: game.developer,
    genre: game.genre,
    releaseYear: game.releaseYear?.value ?? null,
    platform: game.platform,
    edition: game.edition,
    hoursPlayed: game.hoursPlayed?.value ?? null,
    status: game.status,
    format: game.format,
    coverColor: game.coverColor,
    coverImage: game.coverImage ?? null,
    price: game.price?.value ?? null,
    purchasedAt: game.purchasedAt?.value ?? null,
    notes: game.notes,
  };
}
```

**Rezultat:** mapper zdefiniowany.

### Step 2: Zaktualizuj route handlery

**Co robimy:**

Zastąp CAŁY plik `routes/games.ts` poniższą treścią (zachowaj importy z wiring):

```typescript
import { Hono } from 'hono';
import type { Game } from '../domain/games/game';
import {
  createGame,
  deleteGame,
  getGame,
  listGames,
  moveToCollection,
  updateGame,
} from '../wiring';
import type { AuthVariables } from './middleware/require-auth';

// (wstaw tu GameResponse type i toGameResponse function z Step 1)

export const games = new Hono<{ Variables: AuthVariables }>();

games.get('/', async (c) => {
  const userId = c.get('user').id;
  const result = await listGames.execute(
    {
      search: c.req.query('search'),
      kind: c.req.query('kind'),
      page: c.req.query('page'),
      perPage: c.req.query('perPage'),
      sort: c.req.query('sort'),
      dir: c.req.query('dir'),
    },
    userId,
  );
  return c.json({ ...result, items: result.items.map(toGameResponse) });
});

games.post('/', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createGame.execute(body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
    if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
    return c.json({ error: 'unknown error' }, 500);
  }
  return c.json(toGameResponse(result.value), 201);
});

// WAŻNE: move-to-collection musi być PRZED /:externalId żeby Hono nie matchował
// /some-uuid/move-to-collection jako /:externalId z externalId='some-uuid'
// GET a POST to różne metody — tu nie ma konfliktu, ale kolejność jest bezpieczniejsza
games.post('/:externalId/move-to-collection', async (c) => {
  const userId = c.get('user').id;
  const externalId = c.req.param('externalId');
  const result = await moveToCollection.execute(externalId, userId);
  if (!result.ok) {
    if (result.error.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (result.error.kind === 'already_owned') return c.json({ error: 'already_owned' }, 409);
    return c.json({ error: 'invalid', details: result.error.error }, 422);
  }
  return c.json({ game: toGameResponse(result.value) }, 200);
});

games.get('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const result = await getGame.execute(externalId, userId);
  if (!result.ok) return c.json({ error: 'not found' }, 404);
  return c.json(toGameResponse(result.value));
});

games.put('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await updateGame.execute(externalId, body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
    if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
    if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
    return c.json({ error: 'unknown error' }, 500);
  }
  return c.json(toGameResponse(result.value));
});

games.delete('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const result = await deleteGame.execute(externalId, userId);
  if (!result.ok) return c.json({ error: 'not found' }, 404);
  return c.json(toGameResponse(result.value));
});
```

`bun run check` → błędy tylko w plikach frontend.

**Rezultat:** backend routes używają externalId, brak wewnętrznego id w response.

### Step 3: Zaktualizuj frontend

**Co robimy:**

1. **`apps/client/src/types.ts`**:
```typescript
// PRZED:
export interface Game {
  id: number;
  externalId: string;
  // ...
}

// PO:
export interface Game {
  id: string;        // UUID — scalony z dawnym externalId
  // externalId — usunięty
  // ...
}
```

2. **`apps/client/src/lib/api.ts`**:
```typescript
// Zmień:
export async function updateGame(id: number, input: UpdateGameInput): Promise<Game>
// Na:
export async function updateGame(id: string, input: UpdateGameInput): Promise<Game>

// Zmień:
export async function deleteGame(id: number): Promise<Game>
// Na:
export async function deleteGame(id: string): Promise<Game>
```
Treść funkcji (URL w template literal) pozostaje bez zmian — `${id}` działa dla string i number.

3. **`apps/client/src/lib/queries.ts`** — napraw dwie rzeczy:
   - Linia `items: p.items.filter((g) => g.externalId !== externalId)` → `g.id !== externalId`
   - Linie 110-111 — podwójne invalidation (bug pre-existing):
     ```typescript
     // PRZED (duplikat):
     qc.invalidateQueries({ queryKey: ['game', String(game.id)] });
     qc.invalidateQueries({ queryKey: ['game', game.id] });
     // PO (jedno wystarczy, id jest już string):
     qc.invalidateQueries({ queryKey: ['game', game.id] });
     ```

4. **`apps/client/src/pages/game-view.tsx`**:
   - Linia `moveMutation.mutate(game.externalId, ...)` → `moveMutation.mutate(game.id, ...)`

5. **`apps/client/src/pages/wishlist-columns.tsx`**:
   - Linia `externalId={row.original.externalId}` → `externalId={row.original.id}`
   - (Prop `externalId` w `MoveToCollectionButton` możesz zostawić bez zmiany nazwy — to lokalna nazwa)

6. `bun run check` → zero błędów TypeScript w całym monorepo

**Rezultat:** frontend i backend spójne, `game.id` wszędzie to UUID string.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
