# Games Filter & Sort — Faza 9: Hardening Tests (IDOR, EXPLAIN, Smoke)

## Goal
Dodać testy bezpieczeństwa i performance, które łapią klasy regresji nieobejmowane przez testy jednostkowe poprzednich faz: (1) IDOR w obecności filtrów, (2) wykorzystanie indeksów przez plan zapytania, (3) smoke test integracji frontend → backend.

## Definition of Done
- [ ] Test IDOR: `apps/api/src/routes/games.test.ts` (lub osobny `games.idor.test.ts`) — user A z dowolnymi filtrami nigdy nie widzi gier user B
- [ ] Test EXPLAIN: `apps/api/src/infrastructure/games/drizzle-game-repository.explain.test.ts` — sprawdza że plan dla 3 typowych query używa indeksów composite
- [ ] Smoke test frontend: `apps/client/src/pages/__tests__/games-filters.smoke.test.tsx` lub manualny checklist (jeśli vitest niezaimplementowany w projekcie)
- [ ] Wszystkie testy zielone: `bun test`
- [ ] `bun run --cwd apps/api typecheck` + `bun run --cwd apps/client typecheck` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, NIE npm)
**Test framework backend:** `bun:test`
**Test framework frontend:** projekt obecnie NIE ma vitest/jest setup w apps/client (sprawdź — jeśli faktycznie brak, zrób manualny smoke checklist zamiast pliku testowego)

## Design decisions
- IDOR test obowiązkowy. Każdy filtr (platforms, formats, year range, search) sprawdzony osobno + jeden case z kombinacją. User B ma identyczne dane (ten sam tytuł, platform, format, year) — query usera A musi zwrócić TYLKO swoje.
- **EXPLAIN test:** asercja `NOT contains 'scan games'` zamiast nazwy konkretnego indeksu. Powód: SQLite planner jest niedeterministyczny — może wybrać `games_user_id_external_id_unq` zamiast `games_user_kind` jeśli ten pierwszy też pokrywa filtr; może zmienić preferencję między wersjami SQLite; może w ogóle nie używać indeksu na malutkiej tabelce. Asercja po nazwie indeksu = brittle test bez wartości. Kontrakt który nas obchodzi: "no full table scan na `games`". Plus uzupełniająco asercja `contains 'using index'` (jakikolwiek index, nie pełny scan).
- Dodatkowo: osobny perf test (Step 2.5) seeduje 5000 wierszy i waliduje wall-clock budget (`< 50ms`) — to jest realny perf contract.
- Smoke frontend: jeśli vitest brak, zostaw manualny checklist w pliku `docs/plans/games-filter-sort/MANUAL_SMOKE.md`. NIE dodawaj vitest setup w tej fazie — zbyt duży scope.

### Relevant files (edit only these)
- `apps/api/src/routes/games.test.ts` (rozszerzenie z Fazy 5) LUB nowy `apps/api/src/routes/games.idor.test.ts`
- `apps/api/src/infrastructure/games/drizzle-game-repository.explain.test.ts` (NOWY)
- `docs/plans/games-filter-sort/MANUAL_SMOKE.md` (NOWY, jeśli brak vitest)

### Files to read but NOT edit
- Wszystkie pliki z Faz 1–8 (źródłowe + testy)
- `apps/api/src/infrastructure/db/schema.ts` — nazwy indeksów
- `apps/api/src/infrastructure/games/drizzle-game-repository.test.ts` (Faza 4) — wzorzec setupu in-memory db

## Constraints
- Test IDOR MUSI seed-ować dane DLA OBYDWU userów (A i B) z tymi samymi atrybutami, aby filter "podejrzany" o lukę bezpieczeństwa nie mógł "trafić w user B przez przypadek".
- Test EXPLAIN sprawdza substring case-insensitively (SQLite może zwrócić `using index` lub `USING INDEX`); używaj `.toLowerCase()` przed asercją.
- NIE asertuj nazwy konkretnego indeksu — używaj kontraktu `not.toContain('scan games')` + `toContain('using index')`. Nazwy indeksów to detail implementacyjny, nie kontrakt.
- IDOR cases dla repeated params: konstrukcja URL przez `URLSearchParams.append(...)` (NIE CSV), zgodnie z Fazą 5.
- NIE łap błędów w testach przez try/catch. Niech testy padają jasno.
- Frontend smoke: NIE dodawaj zależności vitest/playwright. Manualny checklist wystarczy.

## Steps

### Step 1: Test IDOR
**Co robimy:**
1. Utwórz `apps/api/src/routes/games.idor.test.ts`. Setup analogiczny do Fazy 5 (Hono test client, fixture sesji dla user A i user B).
   ```ts
   import { describe, expect, it, beforeEach } from 'bun:test';
   // import app, seed helpers, login fixtures...

   describe('GET /games — IDOR resistance', () => {
     beforeEach(async () => {
       // wyczyść tabelę games + seed:
       // user-A: { title:'Witcher 3', platform:'PC', format:'digital', releaseYear:2015, kind:'owned' }
       // user-B: { title:'Witcher 3', platform:'PC', format:'digital', releaseYear:2015, kind:'owned' }
     });

     // Note: platforms / formats jako repeated params (Faza 5), NIE CSV
     const cases: Array<{ name: string; qs: string }> = [
       { name: 'no filters',         qs: '' },
       { name: 'platforms filter',   qs: '?platforms=PC' },
       { name: 'multi platforms',    qs: '?platforms=PC&platforms=PS5' },
       { name: 'formats filter',     qs: '?formats=digital' },
       { name: 'year range filter',  qs: '?releaseYearFrom=2010&releaseYearTo=2020' },
       { name: 'search filter',      qs: '?search=Witcher' },
       { name: 'combined',           qs: '?platforms=PC&platforms=PS5&formats=digital&releaseYearFrom=2010&releaseYearTo=2020&search=Witcher' },
       { name: 'sort by title',      qs: '?sort=title&dir=asc' },
     ];

     for (const c of cases) {
       it(`user A never sees user B's games: ${c.name}`, async () => {
         const res = await app.request(`/games${c.qs}`, { /* user-A session */ });
         const body = await res.json();
         expect(res.status).toBe(200);
         for (const item of body.items) {
           // assertion: każdy item należy do user-A
           // (jeśli response nie zawiera userId, sprawdź pośrednio przez znany set ID)
         }
         expect(body.items.length).toBeGreaterThan(0); // user-A ma co najmniej 1 grę
       });
     }
   });
   ```
2. Jeśli response endpointu nie ma `userId` (sprawdź `toGameResponse` — domyślnie nie ma), porównuj po `id` z prze-seedowanymi external IDs user-A: `expect(userAExternalIds).toContain(item.id)`.
3. `bun test apps/api/src/routes/games.idor.test.ts` → GREEN.

**Rezultat:** IDOR test pokrywa wszystkie filtry; user A nigdy nie dostaje danych user B.

### Step 2: Test EXPLAIN
**Co robimy:**
1. Utwórz `apps/api/src/infrastructure/games/drizzle-game-repository.explain.test.ts`:
   ```ts
   import { describe, expect, it } from 'bun:test';
   import { sql } from 'drizzle-orm';
   // import db (in-memory, po migracji + indexach z Fazy 2)

   describe('DrizzleGameRepository — EXPLAIN QUERY PLAN uses indexes', () => {
     const queries: Array<{ name: string; sql: string }> = [
       {
         name: 'plain list',
         sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' LIMIT 10",
       },
       {
         name: 'list with platform filter',
         sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' AND platform IN ('PC') LIMIT 10",
       },
       {
         name: 'list with year range',
         sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' AND release_year BETWEEN 2000 AND 2020 LIMIT 10",
       },
       {
         name: 'sorted by title',
         sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' ORDER BY title LIMIT 10",
       },
     ];

     for (const q of queries) {
       it(q.name, async () => {
         const plan = await db.all(sql.raw(`EXPLAIN QUERY PLAN ${q.sql}`));
         const planText = JSON.stringify(plan).toLowerCase();
         // Kontrakt: żaden full table scan po games. Nazwa indeksu jest detalem implementacyjnym
         // i może się zmienić między wersjami SQLite — nie asertujemy konkretnej nazwy.
         expect(planText).not.toContain('scan games');
         expect(planText).toContain('using index');
       });
     }
   });
   ```
2. Setup in-memory db z migracją (sprawdź wzorzec z `drizzle-game-repository.test.ts` z Fazy 4).
3. `bun test apps/api/src/infrastructure/games/drizzle-game-repository.explain.test.ts` → GREEN.

**Rezultat:** plan zapytań używa indeksów (jakichkolwiek) dla 4 typowych scenariuszy; brak full table scan.

### Step 2.5: Perf budget test (5000 rows)
**Co robimy:**
1. Dorzuć do `drizzle-game-repository.explain.test.ts` (lub osobny `.perf.test.ts`) test seedujący 5000 wierszy dla jednego usera i mierzący wall-clock czas listowania:
   ```ts
   it('list with filters under 50ms on 5k rows', async () => {
     // seed 5000 games dla user 'u1'
     for (let i = 0; i < 5000; i++) {
       await db.insert(games).values({ /* ... */ userId: 'u1', kind: 'owned' });
     }
     const t0 = performance.now();
     const result = await repo.list({
       userId: 'u1', kind: 'owned',
       platforms: ['PC'], page: 1, perPage: 25,
     });
     const elapsed = performance.now() - t0;
     expect(elapsed).toBeLessThan(50);
   });
   ```
2. Jeśli test okazuje się flaky w CI (sygnał: czasem przekracza 50ms na obciążonym runnerze) — podnieś budget do 100ms ALBO marko jako `.skipIf(process.env.CI)` z komentarzem. Lepszy stabilny test ze 100ms niż flaky 50ms.

**Rezultat:** mamy realny perf contract poza EXPLAIN.

### Step 3: Manual smoke checklist (frontend)
**Co robimy:**
1. Utwórz `docs/plans/games-filter-sort/MANUAL_SMOKE.md` z checklistą (do skopiowania do PR description / Linear ticket):
   ```markdown
   # Games Filter & Sort — Manual Smoke Checklist

   ## Desktop (≥ 768px)
   - [ ] /games i /wishlist mają w toolbar przyciski "Filter" i "Sort"
   - [ ] Klik "Filter" otwiera popover (NIE drawer)
   - [ ] Selekcja platformy → niebieski outline na pillu, URL ?platforms=...
   - [ ] Klik tej samej platformy ponownie → odznaczenie
   - [ ] Selekcja formatu → URL ?formats=...
   - [ ] Drag slidera lat → URL update DOPIERO po puszczeniu (nie w trakcie)
   - [ ] Wpisanie `2030` w left input + blur → swap, toast "Switched range"
   - [ ] Wpisanie `1900` w left input → reject, slider wraca
   - [ ] "Reset all" w popoverze → wszystkie filtry znikają, URL czyste, badge znika
   - [ ] Filter trigger gdy aktywne: niebieski border + badge z liczbą
   - [ ] Klik "Sort" → popover z listą pól
   - [ ] Klik "Title" → asc, klik ponownie → desc, klik trzeci raz → unsorted
   - [ ] Sortowanie też klikalne z nagłówków tabeli (istniejące zachowanie nie zepsute)
   - [ ] Empty state po filtrach które nie matchują → CTA "Reset filters" działa

   ## Mobile (< 768px, devtools width 375)
   - [ ] Toolbar widoczny, NIE schowany
   - [ ] Klik "Filter" → bottom drawer (Vaul), swipe-to-close działa
   - [ ] Numeric inputs lat → mobile keyboard pokazuje cyfry (`inputMode="numeric"`)
   - [ ] Drawer NIE psuje scrollu strony

   ## Sieciowe / API
   - [ ] DevTools Network: request /games zawiera **repeated params** `?platforms=PC&platforms=PS5` (NIE CSV `?platforms=PC,PS5`)
   - [ ] Default range 2000-2030 NIE wysyła params do API
   - [ ] Slider drag → tylko 1 request po puszczeniu
   - [ ] Szybka zmiana platformy 5× → ostatni request wygrywa, poprzednie aborted (sprawdź red "cancelled" w Network)
   - [ ] POST /games z bad payloadem (np. pustym title przez Add Game) → toast pokazuje sensowną wiadomość z `detail` (RFC 7807), NIE generyczne "Failed to create game: 400"

   ## Accessibility
   - [ ] Tab przez pills → focus ring widoczny
   - [ ] Space/Enter na pillu → toggle
   - [ ] Esc w popoverze → zamyka i wraca focus na trigger
   - [ ] Screen reader (VoiceOver mac / NVDA win): pill ma `checkbox, checked/not checked`

   ## Regression
   - [ ] Lista gier ładuje się gdy 0 filtrów (smoke)
   - [ ] Search działa równolegle z filtrami
   - [ ] Add game / Edit game / Delete game niezmienione
   - [ ] Wishlist przekierowuje do /wishlist/:id po kliknięciu
   ```
2. Plik istnieje, łatwo go przejrzeć przed merge.

**Rezultat:** checklist na PR.

### Step 4: Final pass
**Co robimy:**
1. `bun test` (cały monorepo) → wszystko zielone
2. `bun run --cwd apps/api typecheck` → zielone
3. `bun run --cwd apps/client typecheck` → zielone
4. `bun run lint` → zielone
5. Jeśli wszystko OK — feature gotowy do PR.

**Rezultat:** zielone CI.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
