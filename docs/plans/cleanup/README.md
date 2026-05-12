# Cleanup plan — production-readiness + DRY/SOLID/dead-code

Plan wprowadza poprawki znalezione przez:
- **grill-me** (SOLID/YAGNI/DRY/granice)
- **enterprise-web-expert** (resilience/security/transakcje/IDOR/observability)

Stack: Bun + Hono + Drizzle (**SQLite**, `drizzle-orm/bun-sqlite`) + Better-Auth + React + Tailwind + shadcn.

---

## Kolejność (safety first)

Najpierw fazy 01-07 — production-readiness. **Nie wdrażaj 08-12 na chwiejnym fundamencie.**
Potem 08-12 — DRY/dead-code/refaktor.

| # | Plik | Zakres | Risk jeśli pominiesz |
|---|------|--------|----------------------|
| 01 | `phase-01-auth-hardening.md` | Better-Auth secret validation, env-driven CORS, rate-limit sign-in | Credential stuffing, hardkodowany localhost = produkcja nie wstaje |
| 02 | `phase-02-structured-logging.md` | Logger module (pino), correlation ID, zamiana 15× `console.*` | Brak debug w produkcji, PII risk |
| 03 | `phase-03-transactions-optimistic-locking.md` | `db.transaction` we wszystkich RMW use-case'ach + `updated_at` WHERE | Lost-update przy double-click |
| 04 | `phase-04-graceful-shutdown-readiness.md` | `Bun.serve.stop`, `/health/ready`, drain in-flight, SQLite advisory lock dla crona | Każdy deploy = utracone requesty, race przy horizontal scale |
| 05 | `phase-05-idempotency-composition-root.md` | `Idempotency-Key` middleware + tabela, wyrzut `new DrizzleGameRepository()` z 6 plików routes | Flaky network = duplikaty gier/coverów |
| 06 | `phase-06-dual-write-cleanup.md` | Usunięcie `void coverStorage.delete()` z use-case'ów, cron-only cleanup, skrócenie do 1h, validacja enrich snapshot przeciw cache | Sieroty w UploadThing po każdym deploy/update, fałszywe `metadataProvider: 'igdb'` |
| 07 | `phase-07-provider-abstraction.md` | `'igdb'` literal → `string` + config-driven host whitelist | Dodanie drugiego providera = 8 plików zmienić ręcznie |
| — | **SAFETY DONE** | | |
| 08 | `phase-08-dead-code-cleanup.md` | Usuń `game-new.tsx`, route `/games/new`, gałąź `action="create"` z `GameForm`, `NullCoverStorage` → `null` + 503 | — |
| 09 | `phase-09-api-fetch-helper.md` | Jeden `apiFetch<T>()` w `lib/api.ts` zamiast 23× `if (!r.ok)` | — |
| 10 | `phase-10-dictionary-generification.md` | Generyczny moduł dla `genres/developers/platforms` (routes + use-cases + domain) | — |
| 11 | `phase-11-game-domain-split.md` | `domain/games/game.ts` (808l) → 3 pliki + `GameInvariants.validate()` | — |
| 12 | `phase-12-use-game-draft-hook.md` | `useGameDraft` hook + `gameDraftToPayload()` — unifikacja `game-form.tsx` i `game-view.tsx` | — |

---

## Zasady wspólne dla wszystkich faz

- **Runtime**: Bun. `bun test`, `bun run check`, `bun run lint`. Migracje: `bunx drizzle-kit generate` + `bunx drizzle-kit migrate`.
- **DB**: SQLite (`drizzle-orm/bun-sqlite`). Brak `LISTEN/NOTIFY`, `db.transaction` używa `BEGIN IMMEDIATE`.
- **TDD**: gdy faza dodaje logikę — test PRZED implementacją (RED → GREEN). Gdy faza tylko refaktoruje — istniejące testy muszą dalej przechodzić (`bun test` przed i po).
- **Architektura**: DDD. Domain layer nie importuje z `infrastructure/` ani `application/`.
- **Result pattern**: błędy biznesowe przez `Result<T, E>` w application layer. Wyjątki tylko w infrastrukturze.
- **Compositon root**: jedyne miejsce na `new <Adapter>()` to `apps/api/src/wiring.ts`. Routes importują gotowe instancje.
- **Zod**: walidacja `unknown` TYLKO w application layer (na granicy use-case). Domain factories przyjmują typowany input.

## Fazy łączą się przez pliki, nie pamięć

Każda faza:
- ma sekcję **Files to read but NOT edit** — to są handoffy z poprzednich faz.
- ma własny **Context7** (Step 0) jeśli potrzebuje docs lib (Hono, Drizzle, Better-Auth, Pino, Bun).
- ma własny **DoD** który MUSI być spełniony przed deklaracją końca.
- kończy się sekcją **If you get stuck** — agent zatrzymuje pracę po 2 nieudanych próbach.

## Uruchamianie

```
/run-plan docs/plans/cleanup
```

Albo ręcznie, faza po fazie, każda w osobnej sesji.
