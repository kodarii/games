# Game price + purchasedAt — Faza 1: Domain + DB Schema

## Goal
Dodaj do encji `Game` dwa opcjonalne pola: `price` (PLN, integer w groszach) oraz `purchasedAt` (data zakupu jako plain date `YYYY-MM-DD`, BEZ godziny i timezone). Wprowadź Value Objects `Price` i `PurchasedAt` z walidacją w domenie. Dodaj kolumny do tabeli `games` i wygeneruj migrację Drizzle. NIE dotykamy jeszcze use-case'ów ani API — tylko warstwa domenowa + persistence mapping.

## Definition of Done
- [ ] `apps/api/src/domain/games/game.ts`:
  - eksportuje VO `Price` (z `Price.create` zwracającym `Result<Price, GameValidationError>`) i `Price.fromTrusted(value)`
  - eksportuje VO `PurchasedAt` (z `PurchasedAt.create(raw: string, today?: string)` i `PurchasedAt.fromTrusted(date: string)`)
  - `GameProps` ma `price?: number` (grosze) i `purchasedAt?: string` (`YYYY-MM-DD`)
  - `NewGame.create()` waliduje oba pola (gdy podane) i przepuszcza VO do agregatu
  - `NewGame` ma gettery `price: Price | null` i `purchasedAt: PurchasedAt | null`
  - `Game.fromPersistence` mapuje `price: number | null` i `purchasedAt: string | null` na VO/null
  - `Game.toJSON()` zwraca `price: number | null` (grosze) i `purchasedAt: string | null` (`YYYY-MM-DD`)
  - dodane kindy błędów: `price_negative`, `price_too_large`, `price_not_integer`, `purchased_at_invalid_format`, `purchased_at_invalid_date`, `purchased_at_in_future`
- [ ] `apps/api/src/domain/games/__tests__/game.test.ts` (lub równoważny istniejący test domenowy) pokrywa nowe walidacje
- [ ] `apps/api/src/infrastructure/db/schema.ts` ma kolumny `price INTEGER` (nullable) i `purchased_at TEXT` (nullable) w tabeli `games`
- [ ] Migracja wygenerowana: `cd apps/api && bunx drizzle-kit generate` — pojawia się nowy plik w `apps/api/drizzle/`
- [ ] Migracja wykonana: `cd apps/api && bunx drizzle-kit migrate`
- [ ] `DrizzleGameRepository` (`apps/api/src/infrastructure/games/drizzle-game-repository.ts`) mapuje `price` i `purchasedAt` w `mapRowToGame`, `create`, `update`
- [ ] `cd apps/api && bun run check && bun test` — wszystko zielone

Agent kończy pracę WYŁĄCZNIE gdy wszystkie powyższe punkty są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — używaj `bun run`, `bunx`, `bun test`)
**ORM:** Drizzle ORM + SQLite. `purchasedAt` trzymany jako `TEXT` (`YYYY-MM-DD`), NIE jako timestamp — single-user app, godzina nie jest istotna.
**Architektura:** DDD — warstwa domain NIE importuje niczego z `infrastructure/`, `application/`, `routes/`.
**Error handling:** `Result<T, E>` (ok/err) z `apps/api/src/domain/shared/result.ts`.

## Design decisions
- `Price` to **Value Object** (nie goły number) — dokładnie jak istniejące `ReleaseYear` i `HoursPlayed`. Field przechowywany w **groszach** (integer), nie w złotych z zaokrągleniem.
- Walidacja `Price.create(value)`:
  - musi być integer (`Number.isInteger`) — jeśli nie, → `err({ kind: 'price_not_integer', value })`
  - `value >= 0` — jeśli ujemne, → `err({ kind: 'price_negative', value })`
  - `value < 100_000_000` (1 mln zł sanity cap) — jeśli przekroczone, → `err({ kind: 'price_too_large', value })`
- `PurchasedAt` to VO opakowujące **string `YYYY-MM-DD`** (plain date, BEZ godziny i timezone). Walidacja `PurchasedAt.create(raw: string, today: string = isoToday())`:
  - regex `/^\d{4}-\d{2}-\d{2}$/` — jeśli nie pasuje, → `err({ kind: 'purchased_at_invalid_format', value: raw })`
  - sprawdzenie istnienia daty (round-trip): `new Date(raw).toISOString().slice(0, 10) === raw` — jeśli nie, → `err({ kind: 'purchased_at_invalid_date', value: raw })` (łapie `2026-02-30` itp.)
  - jeśli `raw > today` (string compare działa dla `YYYY-MM-DD`) → `err({ kind: 'purchased_at_in_future' })`
  - dolny zakres NIE jest walidowany — gracz mógł kupić grę w 1985 r.
- Helper `isoToday(now: Date = new Date()): string` — `now.toISOString().slice(0, 10)`. Trzymaj go w `game.ts` jako prywatną funkcję (lub eksportowaną jeśli VO przyjmuje `today` z zewnątrz dla testowalności).
- Oba pola **opcjonalne** (`undefined` w propsach → `null` w domain getter → `null` w DB).
- `coverColor` i `coverImage` w istniejącym kodzie używają wzorca `string | undefined` w propsach → `string | undefined` w gettach → `string | null` w DB. Powtarzaj **dokładnie** ten wzorzec dla nowych pól (z poprawką: `Price | null` i `PurchasedAt | null` w gettach, bo to VO a nie prymity).
- `toJSON` serializuje `purchasedAt` jako string `YYYY-MM-DD` (bezpośrednio `this._purchasedAt?.value ?? null`), `price` jako number (grosze).
- `GameValidationError` to discriminated union — DODAJ nowe kindy, nie modyfikuj istniejących.
- ID i timestampy (`createdAt`, `updatedAt`) NIE są częścią agregatu (są dodawane przy persistence) — wzorzec już ustalony w projekcie, trzymaj się.

## Relevant files

### Edytuj:
- `apps/api/src/domain/games/game.ts`
- `apps/api/src/domain/games/__tests__/game.test.ts` *(jeśli istnieje — sprawdź `ls apps/api/src/domain/games/__tests__/`. Jeśli nie ma, utwórz `game.test.ts` w tym katalogu)*
- `apps/api/src/infrastructure/db/schema.ts`
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts`

### Czytaj ale NIE edytuj:
- `apps/api/src/domain/shared/result.ts` — wzorzec `Result<T,E>` + helpery `ok`, `err`
- `apps/api/drizzle/0008_*.sql` — żeby zobaczyć styl ostatniej migracji (Drizzle generuje sam, ale dobrze wiedzieć)

## Constraints
- TDD: STRICT RED → GREEN. NAJPIERW test (uruchom `bun test` i ZOBACZ failujące asercje — RED), POTEM implementacja, znowu `bun test` (GREEN). Dwa runy testów na każdy step. Nie wolno pominąć fazy RED.
- VO `Price` i `PurchasedAt` — invarianty WYŁĄCZNIE w `.create()` factory. NIE rzucaj wyjątków, używaj `Result`.
- NIE wprowadzaj nowego pliku per VO — dodaj klasy obok `ReleaseYear` i `HoursPlayed` w `game.ts`.
- NIE używaj `Date.now()` bezpośrednio w `PurchasedAt.create` — wstrzyknij `today` jako argument string `YYYY-MM-DD` z domyślną wartością `isoToday()`. Dzięki temu test deterministyczny.
- VO `PurchasedAt` przyjmuje **string `YYYY-MM-DD`**, nie `Date`. Walidacja formatu I istnienia daty W domenie (mimo duplikacji z Zod w fazie 2 — domena chroni invarianty niezależnie od źródła inputu).
- NIE dodawaj kolumny `currency` — projekt jest single-currency PLN. Trzymaj prostotę.
- Migracja ma być wygenerowana przez `drizzle-kit generate`. NIE pisz SQL ręcznie.
- Każdy nowy `kind` w `GameValidationError` musi być **unikalny** w skali całego unionu. Sprawdź istniejące kindy i nie kolizuj.

## Steps

### Step 1: Testy domeny (RED)
**Co robimy:**
1. Otwórz / utwórz plik testu domeny: `apps/api/src/domain/games/__tests__/game.test.ts`. Jeśli istniejące `__tests__/` ma już testy `NewGame.create`, dopisz tam — w przeciwnym razie naśladuj styl `apps/api/src/application/games/create-game.test.ts` (`bun:test`, `describe/it/expect`).
2. Dodaj testy:
   - **Price.create**: poprawny grosz `12999` → `ok` + `value === 12999`
   - **Price.create**: zero `0` → `ok` + `value === 0` (legitna wartość — gra free-to-play / prezent)
   - **Price.create**: ujemny `-1` → `err({ kind: 'price_negative', value: -1 })`
   - **Price.create**: za duży `100_000_000` → `err({ kind: 'price_too_large', value: 100_000_000 })`
   - **Price.create**: niecałkowity `12.5` → `err({ kind: 'price_not_integer', value: 12.5 })`
   - **PurchasedAt.create**: poprawna data `'2024-06-15'` z `today='2026-05-03'` → `ok` + `value === '2024-06-15'`
   - **PurchasedAt.create**: zły format `'2024/06/15'` → `err({ kind: 'purchased_at_invalid_format', value: '2024/06/15' })`
   - **PurchasedAt.create**: zły format `'24-6-15'` → `err({ kind: 'purchased_at_invalid_format' })`
   - **PurchasedAt.create**: nieistniejąca data `'2026-02-30'` → `err({ kind: 'purchased_at_invalid_date', value: '2026-02-30' })`
   - **PurchasedAt.create**: data dziś (`raw === today`) → `ok`
   - **PurchasedAt.create**: data 1 dzień w przyszłości (`'2026-05-04'` przy `today='2026-05-03'`) → `err({ kind: 'purchased_at_in_future' })`
   - **NewGame.create**: poprawny input + `price: 5999, purchasedAt: '2024-01-01'` → `ok`, getter `price.value === 5999`, `purchasedAt.value === '2024-01-01'`
   - **NewGame.create**: bez `price` i bez `purchasedAt` → `ok`, oba gettery `=== null`
   - **NewGame.create**: `price: -1` → `err` z `kind: 'price_negative'`
   - **NewGame.create**: `purchasedAt: '2099-01-01'` → `err` z `kind: 'purchased_at_in_future'` (z domyślnym `today`)
   - **Game.fromPersistence**: `price: null, purchasedAt: null` → gettery zwracają `null`, `toJSON` ma `price: null, purchasedAt: null`
   - **Game.fromPersistence**: `price: 12999, purchasedAt: '2024-06-15'` → `toJSON` ma `price: 12999`, `purchasedAt: '2024-06-15'`
3. `cd apps/api && bun test` → nowe testy FAILUJĄ (RED). Stare testy są nadal GREEN.
**Rezultat:** testy istnieją i failują na compile / asercjach. NIE przechodź dalej zanim widzisz RED.

### Step 2: Implementacja domeny (GREEN)
**Co robimy w `apps/api/src/domain/games/game.ts`:**
1. Dodaj nowe kindy do `GameValidationError` union:
   - `| { kind: 'price_negative'; value: number }`
   - `| { kind: 'price_too_large'; value: number }`
   - `| { kind: 'price_not_integer'; value: number }`
   - `| { kind: 'purchased_at_invalid_format'; value: string }`
   - `| { kind: 'purchased_at_invalid_date'; value: string }`
   - `| { kind: 'purchased_at_in_future' }`
2. Dodaj VO `Price` (obok `HoursPlayed`):
   ```ts
   export class Price {
     private constructor(public readonly value: number) {}
     static create(raw: number): Result<Price, GameValidationError> {
       if (!Number.isInteger(raw)) return err({ kind: 'price_not_integer', value: raw });
       if (raw < 0) return err({ kind: 'price_negative', value: raw });
       if (raw >= 100_000_000) return err({ kind: 'price_too_large', value: raw });
       return ok(new Price(raw));
     }
     static fromTrusted(value: number): Price { return new Price(value); }
   }
   ```
3. Dodaj helper `isoToday` (prywatny w pliku) i VO `PurchasedAt`:
   ```ts
   const PURCHASED_AT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

   function isoToday(now: Date = new Date()): string {
     return now.toISOString().slice(0, 10);
   }

   export class PurchasedAt {
     private constructor(public readonly value: string) {}
     static create(raw: string, today: string = isoToday()): Result<PurchasedAt, GameValidationError> {
       if (!PURCHASED_AT_REGEX.test(raw)) return err({ kind: 'purchased_at_invalid_format', value: raw });
       const parsed = new Date(raw);
       if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
         return err({ kind: 'purchased_at_invalid_date', value: raw });
       }
       if (raw > today) return err({ kind: 'purchased_at_in_future' });
       return ok(new PurchasedAt(raw));
     }
     static fromTrusted(value: string): PurchasedAt { return new PurchasedAt(value); }
   }
   ```
4. Rozszerz `GameProps`:
   ```ts
   price?: number;        // grosze
   purchasedAt?: string;  // YYYY-MM-DD
   ```
5. W `NewGame.create`:
   - po istniejącej walidacji `releaseYear` i `hoursPlayed`, dodaj analogicznie:
     ```ts
     let price: Price | null = null;
     if (props.price != null) {
       const r = Price.create(props.price);
       if (!r.ok) return r;
       price = r.value;
     }
     let purchasedAt: PurchasedAt | null = null;
     if (props.purchasedAt != null) {
       const r = PurchasedAt.create(props.purchasedAt);
       if (!r.ok) return r;
       purchasedAt = r.value;
     }
     ```
   - dodaj parametry do konstruktora `NewGame` (`_price: Price | null`, `_purchasedAt: PurchasedAt | null`) i przekaż w `new NewGame(...)`.
6. Dodaj gettery `price` i `purchasedAt` w `NewGame` (zwracają `Price | null` i `PurchasedAt | null`).
7. Powtórz to samo w klasie `Game`:
   - dodaj `_price: Price | null`, `_purchasedAt: PurchasedAt | null` do konstruktora
   - rozszerz `Game.fromPersistence` row signature o `price: number | null; purchasedAt: string | null`
   - mapuj: `row.price != null ? Price.fromTrusted(row.price) : null` i analogicznie dla daty
   - dodaj gettery
   - rozszerz `toJSON()`:
     ```ts
     price: this._price?.value ?? null,
     purchasedAt: this._purchasedAt?.value ?? null,
     ```
8. `cd apps/api && bun test` → wszystkie testy GREEN.
**Rezultat:** `bun test` zielone, `bun run check` czysty.

### Step 3: DB schema + migracja + repository mapping
**Co robimy:**
1. `apps/api/src/infrastructure/db/schema.ts`, w tabeli `games` (po `coverImage`):
   ```ts
   price: integer('price'),         // nullable, grosze
   purchasedAt: text('purchased_at'), // nullable, YYYY-MM-DD
   ```
2. Wygeneruj migrację: `cd apps/api && bunx drizzle-kit generate`. Powstanie nowy plik w `apps/api/drizzle/` (np. `0009_*.sql`) z `ALTER TABLE games ADD COLUMN price INTEGER` i `ALTER TABLE games ADD COLUMN purchased_at TEXT`. Sprawdź wzrokowo, że obie kolumny są nullable i nie ma `NOT NULL` ani `DEFAULT`.
3. Wykonaj migrację: `cd apps/api && bunx drizzle-kit migrate`.
4. Otwórz `apps/api/src/infrastructure/games/drizzle-game-repository.ts`. Znajdź miejsce gdzie mapowane są pola na/z encji Drizzle. Dodaj mapping `price` i `purchasedAt`:
   - **W `mapRowToGame` (lub odpowiedniku):** przekazuj `price: row.price ?? null, purchasedAt: row.purchasedAt ?? null` do `Game.fromPersistence`. (Drizzle z `text(...)` zwraca już `string | null`.)
   - **W `create`:** wyciągnij z `NewGame` poprzez gettery: `price: g.price?.value ?? null, purchasedAt: g.purchasedAt?.value ?? null` i wstaw do INSERT.
   - **W `update`:** to samo dla aktualizacji.
   - Jeśli istnieje też mapping odwrotny w funkcji pomocniczej — uzupełnij go również.
5. `cd apps/api && bun run check && bun test` — wszystko musi być zielone (testy use-case'ów mogą jeszcze nie używać nowych pól, ale nie powinny się popsuć).
**Rezultat:** schema zaktualizowana, migracja zastosowana, repository mapuje nowe pola, wszystko kompiluje się i testy zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <opis problemu, jaki błąd, jaka hipoteza>`
Zakończ pracę.
