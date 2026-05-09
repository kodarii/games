# Games Filter & Sort — Plan implementacji

Feature: filtrowanie (Platform, Format, Release Year) i sortowanie kolekcji gier (`/games` + `/wishlist`).

## Fazy (wykonuj w kolejności, każda w osobnej sesji agenta)

| # | Plik | Co obejmuje |
|---|------|-------------|
| 0 | `PHASE_0_setup.md` | Dodanie pakietów: @radix-ui/react-popover, @radix-ui/react-slider, vaul, sonner |
| 1 | `PHASE_1_domain.md` | Value Object `ReleaseYearRange` + rozszerzenie `ListGamesQuery` w domain |
| 2 | `PHASE_2_db_migration.md` | 5 composite indexów na tabeli `games` (user_id, kind, X) |
| 3 | `PHASE_3_application.md` | Zod schema, walidacja bounds, escape wildcards, ListGames.execute |
| 4 | `PHASE_4_infrastructure.md` | DrizzleGameRepository.list — predykaty inArray/gte/lte + NULLS LAST |
| 5 | `PHASE_5_routes.md` | Repeated query params w Hono, ujednolicony RFC 7807 error contract (POST/PUT też migrowane), DoS pre-check, structured logger |
| 6 | `PHASE_6_frontend_state.md` | useGamesListState rozszerzenie, queries z AbortSignal |
| 7 | `PHASE_7_frontend_components.md` | PillToggle, YearRangeSlider, GamesFilters, GamesSort (Popover + Drawer) |
| 8 | `PHASE_8_frontend_integration.md` | Wstawienie do GamesPage/WishlistPage + empty state + Toaster |
| 9 | `PHASE_9_tests.md` | Test IDOR, EXPLAIN QUERY PLAN, manual smoke checklist |

## Reguły wykonania

- **Bun, NIE npm.** Wszystkie skrypty: `bun test`, `bun run`, `bunx`.
- **TDD w fazach 1, 3, 4, 5, 9.** Najpierw test (RED), potem impl (GREEN).
- **Agent pracuje na jednej fazie naraz.** Skończ fazę, sprawdź DoD, potem następna.
- **Jeśli STUCK po 2 próbach** — przerwij, raportuj `STUCK at Step <N>: <opis>`. Nie zgaduj.
- **Files to read but NOT edit** w każdej fazie — to handoff od poprzedniej fazy. Zawsze przeczytaj przed edycją.
