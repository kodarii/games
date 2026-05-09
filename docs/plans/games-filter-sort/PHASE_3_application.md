# Games Filter & Sort — Faza 3: Application Layer (Zod + ListGames)

## Goal
Rozszerz `ListGames` use-case: zaakceptuj nowe filtry (`platforms`, `formats`, `releaseYearFrom/To`), waliduj inputy przez Zod z hard-bounds + array-length cap, escape'uj wildcards w `search`, twórz `ReleaseYearRange` przez factory i mapuj domain-error na input-error.

## Definition of Done
- [ ] `apps/api/src/application/games/list-games.ts` przyjmuje nowe pola w schema (BEZ `withTotal` — dropped)
- [ ] Walidacja: `platforms.max(20)`, `formats` enum, `releaseYearFrom/To` w zakresie 1958–2100, `from <= to` przez refine
- [ ] `search` escape `%` i `_` przez `\` przed przekazaniem dalej (lub w infrastructure — patrz Constraints)
- [ ] Tworzenie `ReleaseYearRange` przez factory; gdy `err` → konwersja na input-error (`ZodError` lub własny typ)
- [ ] Test `apps/api/src/application/games/list-games.test.ts` rozszerzony o ~6 case'ów (patrz Step 1)
- [ ] `bun test apps/api/` zielone
- [ ] `bun run --cwd apps/api typecheck` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, NIE npm)
**Walidacja:** Zod 4 (`z.coerce.number()`, `z.enum`, `.refine`)
**Use case dostaje już tablice** — Hono parsuje repeated query params (`?platforms=A&platforms=B`) na `string[]` w route layer (Faza 5). W tej fazie schema akceptuje `platforms?: string[]`, NIE string z przecinkami. **NIE używamy CSV** — nazwy platform mogą zawierać przecinek (`"Sega CD, Genesis Mini"`), więc CSV split byłby footgunem.

## Design decisions
- Zod schema rozszerzona o 3 nowe pola opcjonalne (`platforms`, `formats`, `releaseYearFrom`, `releaseYearTo`). **Pole `withTotal` jest dropped** — dead code bez plumbingu zostawia fałszywy kontrakt; dorzucimy gdy będzie konkretny consumer z mierzonym kosztem `count(*)`.
- Cross-field walidacja `from <= to` przez `.refine`.
- Hard limits to anti-DoS: max 20 platform, max 2 formaty (wszystkie wartości enum). Bounds lat: 1958–2100 (zsynchronizowane z domain VO).
- `search` escape: dodaj `\` przed `%`, `_`, `\` (kolejność ważna! najpierw `\` → `\\`, potem `%` → `\%`, potem `_` → `\_`). Robimy to w application layer, bo to detail wartości (nie SQL); infrastructure dostaje już escaped string i używa `LIKE ... ESCAPE '\\'`.
- `releaseYearRange` budowany przez `ReleaseYearRange.create(from, to)` po Zod-validacji. Jeśli factory zwróci err → throw `ZodError`-like (lub własny `InputError`) z przypiętym kindem. **Decyzja:** rzucamy `ZodError`-compatible przez własny `z.NEVER`-trick lub mapujemy w `.transform()`. Najprostsza droga: zrobić walidację bounds w Zod (1958–2100, refine `from<=to`) — wtedy domain factory powinien być sukcesem. Jako defense-in-depth wciąż wołamy `ReleaseYearRange.create` i jeśli zwróci err → `throw new Error('invariant violated after Zod')` (programming error, 500).
- `ListGames.execute` używa `.parse()` (rzuca `ZodError`) — NIE `.safeParse()`. Globalny error handler z Fazy 5 łapie ZodError → RFC 7807. POST/PUT (createGame/updateGame) zostają przy `.safeParse()` + Result, ale ich `invalid_input.issues` mapowane są na **ten sam** kształt RFC 7807 w route layer (helper z Fazy 5).

### Relevant files (edit only these)
- `apps/api/src/application/games/list-games.ts`
- `apps/api/src/application/games/list-games.test.ts`

### Files to read but NOT edit
- `apps/api/src/domain/games/game-repository.ts` — rozszerzony `ListGamesQuery` (z Fazy 1)
- `apps/api/src/domain/games/release-year-range.ts` — factory (z Fazy 1)
- `apps/api/src/domain/games/game.ts` — `GameFormat` (już istnieje), `GAME_FORMATS` lub inne const arrays — sprawdź faktyczny export

## Constraints
- TDD: NAJPIERW dopisz testy (RED), POTEM rozszerz schema/use case (GREEN)
- Zod schema MUSI mieć `.max(20)` na `platforms` (anti-DoS)
- `releaseYearFrom` / `releaseYearTo` — `z.coerce.number().int().min(1958).max(2100).optional()`
- Cross-field refine: `if both defined → from <= to`
- Escape `%`, `_`, `\` w `search` PRZED przekazaniem do repo
- NIE wywołuj Drizzle bezpośrednio. Wszystko przez `GameRepository` port.
- Use case NIE robi CSV split — dostaje tablice z route'a

## Steps

### Step 1: Test RED — rozszerz list-games.test.ts
**Co robimy:**
1. Otwórz `apps/api/src/application/games/list-games.test.ts`. Rozszerz `FakeGameRepository.list` o filtrowanie po nowych polach (platforms, formats, releaseYearRange) — żeby testy mogły asertować że filtry doszły do repo:
   ```ts
   list = async (query: ListGamesQuery) => {
     let filtered = this.all.filter((g) => g.userId === query.userId);
     if (query.kind) filtered = filtered.filter((g) => g.kind === query.kind);
     if (query.platforms?.length)
       filtered = filtered.filter((g) => query.platforms!.includes(g.platform));
     if (query.formats?.length)
       filtered = filtered.filter((g) => query.formats!.includes(g.format));
     if (query.releaseYearRange) {
       const { from, to } = query.releaseYearRange;
       filtered = filtered.filter((g) => {
         const y = g.releaseYear?.value;
         return y != null && y >= from && y <= to;
       });
     }
     // ... existing pagination
   };
   ```
2. Dodaj nowe testy:
   - `filters by platforms` — input `platforms: ['PC']`, dataset z PC i PS5 → tylko PC
   - `filters by formats` — input `formats: ['digital']` → tylko digital
   - `filters by release year range` — input `releaseYearFrom: 2010, releaseYearTo: 2015` → tylko gry z tych lat
   - `rejects more than 20 platforms` — `platforms: Array(21).fill('PC')` → throws ZodError (test: `expect(() => listGames.execute(...)).toThrow()`)
   - `rejects releaseYearFrom > releaseYearTo` — `from: 2030, to: 2000` → throws
   - `rejects releaseYear out of bounds` — `from: 1900` → throws
   - `escapes wildcard in search` — `search: '50%_off'` → przekazane do repo jako `'50\\%\\_off'` (sprawdź w fake repo że wartość jest escaped)
3. Uruchom `bun test apps/api/src/application/games/list-games.test.ts` → nowe testy RED, stare GREEN.

**Rezultat:** testy istnieją, nowe failują z powodu braku impl.

### Step 2: Rozszerz Zod schema i ListGames.execute (GREEN)
**Co robimy:**
1. Edytuj `apps/api/src/application/games/list-games.ts`:
   ```ts
   import { z } from 'zod';
   import { ReleaseYearRange } from '../../domain/games/release-year-range';
   import { GAME_FORMATS } from '../../domain/games/game'; // sprawdź dokładny export
   import type { GameRepository, ListGamesQuery } from '../../domain/games/game-repository';

   const ListGamesQuerySchema = z
     .object({
       search: z.string().optional().default(''),
       kind: z.enum(['owned', 'wishlist']).optional(),
       page: z.coerce.number().min(1).default(1),
       perPage: z.coerce.number().min(1).max(100).default(7),
       sort: z
         .enum(['title', 'genre', 'platform', 'format', 'status', 'releaseYear', 'hoursPlayed'])
         .optional(),
       dir: z.enum(['asc', 'desc']).default('asc'),
       platforms: z.array(z.string().min(1).max(64)).max(20).optional(),
       formats: z.array(z.enum(GAME_FORMATS)).max(GAME_FORMATS.length).optional(),
       releaseYearFrom: z.coerce.number().int().min(1958).max(2100).optional(),
       releaseYearTo: z.coerce.number().int().min(1958).max(2100).optional(),
     })
     .refine(
       (d) =>
         d.releaseYearFrom == null ||
         d.releaseYearTo == null ||
         d.releaseYearFrom <= d.releaseYearTo,
       { path: ['releaseYearFrom'], message: 'releaseYearFrom must be <= releaseYearTo' },
     );

   function escapeLikeWildcards(s: string): string {
     // Order matters: escape backslash FIRST.
     return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
   }

   export class ListGames {
     constructor(private readonly repo: GameRepository) {}

     async execute(input: unknown, userId: string) {
       const parsed = ListGamesQuerySchema.parse(input);

       let releaseYearRange: ReleaseYearRange | undefined;
       if (parsed.releaseYearFrom != null && parsed.releaseYearTo != null) {
         const r = ReleaseYearRange.create(parsed.releaseYearFrom, parsed.releaseYearTo);
         if (!r.ok) {
           // defense-in-depth — Zod refine should have caught this
           throw new Error(`ReleaseYearRange invariant violated after Zod: ${r.error.kind}`);
         }
         releaseYearRange = r.value;
       } else if (parsed.releaseYearFrom != null || parsed.releaseYearTo != null) {
         // Tylko jeden z dwóch — TODO decyzja produktowa. Na MVP: ignorujemy single-sided range.
         // (Lub: rozszerz domain VO o open-ended range w przyszłości.)
       }

       const search = parsed.search ? escapeLikeWildcards(parsed.search) : undefined;

       const query: ListGamesQuery = {
         userId,
         search,
         kind: parsed.kind,
         page: parsed.page,
         perPage: parsed.perPage,
         sort: parsed.sort,
         dir: parsed.dir,
         platforms: parsed.platforms,
         formats: parsed.formats,
         releaseYearRange,
       };

       const result = await this.repo.list(query);

       return {
         items: result.items,
         page: query.page,
         perPage: query.perPage,
         total: result.total,
         hasMore: query.page * query.perPage < result.total,
       };
     }
   }
   ```
2. Uruchom `bun test apps/api/src/application/games/list-games.test.ts` → wszystkie GREEN.

**Rezultat:** schema rozszerzona, use case działa, testy zielone.

### Step 3: Sanity check
**Co robimy:**
1. `bun test apps/api/` — cały api, wszystkie testy zielone
2. `bun run --cwd apps/api typecheck` — zielone
3. `bun run lint` — zielone

**Rezultat:** zero regresji w innych testach.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
