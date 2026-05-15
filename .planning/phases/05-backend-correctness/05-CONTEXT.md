# Phase 5: Backend Correctness - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Sześć wąskich, technicznych korekt warstwy API na bazie zwalidowanego baseline'u: (1) wyodrębnić migracje z boot path, (2) zde-duplikować row-builder gier w 3 call-sites, (3) zlikwidować N+1 SELECTów w `applyMerge`, (4) świadomie udokumentować brak indeksów dla pól sortujących, (5) zapinać Hono route ordering testem regresyjnym, (6) zapinać composition wiring testem smoke. Pure correctness/perf/operability hardening. **Brak nowych capabilities, brak zmian w domain logic, brak ruchu na froncie.**

**Pokrywa requirements:** BE-01, BE-02, BE-03, BE-04, BE-05, BE-06.

</domain>

<decisions>
## Implementation Decisions

### BE-01: Deploy migration flow (out-of-boot)

- **D-01:** Wprowadzamy versioned `scripts/deploy.sh` w repo. Skrypt wykonuje sekwencję: `git pull` (zewnętrznie albo wewnątrz — TBD planner) → `bun install --production` → `bun run --filter=@apex/api db:migrate` → restart procesu API (mechanizm restartu — pm2/systemd — Claude's discretion, planner ustala z user-em jeśli niejasne).
- **D-02:** `.github/workflows/deploy.yml` zostaje bez zmian — nadal wywołuje `/root/apex/scripts/deploy.sh` na VPS. Skrypt na VPS git-pull'uje i delegowane jest do versioned `scripts/deploy.sh` z repo (`exec bash scripts/deploy.sh`). Pozwala to wycofać deploy logic do version-control bez zmiany SSH-action.
- **D-03:** `apps/api/src/infrastructure/db/client.ts` zachowuje warunkowy `migrate(...)` **tylko gdy `process.env.NODE_ENV !== 'production'`**. Dev convenience (raz odpalisz `bun run dev`, baza sama się zmigruje). W prod auto-migrate jest **martwy** — jeśli ktoś bootnie binary bez wcześniejszego `db:migrate`, fail-fast na pierwszym query do brakującej kolumny. Świadomie nie dodajemy "production guard" sprawdzającego stan migracji — to robi `db:migrate` w deploy.
- **D-04:** `set -euo pipefail` w `scripts/deploy.sh`. Failure mode: jeśli `db:migrate` zwróci kod ≠0 (bad SQL, constraint violation), skrypt exit-uje przed restartem procesu — **stary proces zostaje przy życiu** na starym kodzie + starej migracji. To celowe: zero rollback magic, zero auto-revert, ale też zero "boot z brakami".
- **D-05:** Migrationy nadal generowane przez `drizzle-kit generate` lokalnie (commit'owane do `apps/api/drizzle/`). Bez zmian w workflow developera dot. generowania.

### BE-02: `toGameInsertRow` dedup

- **D-06:** Helper `toGameInsertRow(userId: string, input: GameRowInput): NewGameRow` w `apps/api/src/infrastructure/db/schema.ts` (bezpośrednio obok `games` definicji + `NewGameRow` typu). Lokalizacja blisko schematu, bo helper **jest częścią schematu** — w nim żyje wiedza "która kolumna pasuje do którego pola domenowego".
- **D-07:** `GameRowInput` to discriminated union (`kind: 'owned' | 'wishlist'`) z wszystkimi domenowymi polami opcjonalnymi w sensie "może być undefined → mapuje na null w row'ie". Pola akceptują albo value-object (z `.value` accessor), albo bezpośrednią wartość prymitywną, albo `undefined`. Helper zwija VO → prymityw transparentnie (`releaseYear: input.releaseYear?.value ?? null`).
- **D-08:** Wszyscy trzej callers (`DrizzleGameRepository.create`, `applyMerge`, `applyReplace`) budują `GameRowInput` na miejscu (literalem) i wołają `toGameInsertRow(userId, input)`. **Po zmianie `rg "kind: \w+\.kind" apps/api/src --type ts` zwraca jedno wystąpienie** (w samym helperze) — to acceptance check dla BE-02.
- **D-09:** Import nie przekazuje `coverImage`/`price`/`purchasedAt`/`notes`/`metadataProvider*` — wszystkie te pola są opcjonalne w `GameRowInput`. Helper mapuje brak na `null`. **Świadomie nie dodajemy walidacji** "import zawsze ma null dla tych pól" — schemat już to gwarantuje przez nullable kolumny.
- **D-10:** `DrizzleGameRepository.update` (PATCH games) zostaje **poza scope BE-02** — używa `set({...})` z innym shape (bez `userId`, bez `externalId`, bez `createdAt`). To inny use-case (update), nie row insert. ROADMAP BE-02 wymienia tylko `create`/`applyMerge`/`applyReplace`. Nie próbujemy rozszerzać dedup'a na update — odłożone (jeśli kiedyś).

### BE-03: Batch SELECT w `applyMerge`

- **D-11:** `applyMerge` w `apps/api/src/infrastructure/import/drizzle-import-repository.ts` wykonuje **dwa SELECT-y** na start (per tabela) zamiast N+1:
  1. `SELECT * FROM platforms WHERE user_id = ? AND external_id IN (...)` → `Map<externalId, PlatformRow>`
  2. `SELECT * FROM games WHERE user_id = ? AND external_id IN (...)` → `Map<externalId, GameRow>`
- **D-12:** Pętla `for (const np of plan.platforms)` i `for (const ng of plan.games)` wykonuje lookup w pamięci (`existingPlatforms.get(np.externalId)`), a następnie INSERT lub UPDATE per item. Konsekwentnie zachowujemy semantykę "if exists update else insert".
- **D-13:** UPDATE'y nadal wykonywane per-row (nie batch'ujemy) — Drizzle nie ma natywnego "UPDATE ... FROM VALUES (...)" dla SQLite-a. **Świadomy kompromis**: BE-03 mówi "pojedynczy SELECT" (nie "pojedynczy UPDATE"). Per-row UPDATE w transakcji jest akceptowalny, bo główna patologia to było N reads (SQLite optimizer + index hit per write rate-limituje się dobrze).
- **D-14:** `applyReplace` **bez zmian dotyczących batch SELECT** (BE-03 dotyczy tylko `applyMerge`). `applyReplace` robi DELETE wszystkich + INSERT wszystkich — N+1 nie występuje.
- **D-15:** Benchmark/test pokrycia: dodać test integracyjny (in-memory SQLite + ImportPlan z 100 games + 5 platforms) liczący ilość SELECT-ów (sqlite count via `Database.prepare` instrumentation albo proste "execute time delta") — assert: `selectCount <= 2 + małaConstanta`. **Alt:** test jednostkowy bez liczenia query'sów, tylko semantic check (po imporcie wszystkie expected rows istnieją). Planner wybiera, byle pokrył regresję BE-03.

### BE-04: Sort field indices

- **D-16:** **NIE dodajemy** indeksów dla `hoursPlayed`, `genre`, `status`. Model danych Apex'a wciąż się rozwija — premature optimization na polach, które mogą zostać przeprojektowane w kolejnym milestone'ie, byłoby waste'em (migracja-add + migracja-drop). Patrz [feedback memory: feedback_no_premature_indices].
- **D-17:** ROADMAP SC-4 daje wprost ścieżkę "świadomie udokumentowany koszt w `schema.ts` / `CONCERNS.md`" — wybieramy ją. Konkretnie:
  - Dodać komentarz blok-komentarz nad `games` table definition w `apps/api/src/infrastructure/db/schema.ts` wymieniający pola sortowane bez indeksów (`hoursPlayed`, `genre`, `status`) i uzasadnienie: "Apex is single-user, expected ≤5k rows per user. Full-scan + in-memory sort on these fields measured at ~10ms on local WAL DB. Adding indices deferred until the schema stabilizes (models may evolve in future milestones)."
  - Dodać/zaktualizować odpowiednią sekcję w `.planning/codebase/CONCERNS.md` (jeśli istnieje "Missing indices for some sort fields", przepisać na "Documented accepted cost — see schema.ts comment"; jeśli nie istnieje, dodać).
- **D-18:** Format/releaseYear/title/platform mają już składowe indeksy (`games_user_kind_format_idx`, `games_user_kind_releaseyear_idx`, `games_user_kind_title_idx`, `games_user_kind_platform_idx`) — sprawdzone w `schema.ts:42-50`. ROADMAP wymienił `format` po staremu — w rzeczywistości indeks już jest. **Nie dotykamy istniejących indeksów**.

### BE-05: Route ordering regression test

- **D-19:** Test ląduje w **`apps/api/src/routes/games.test.ts`** — forced literally przez ROADMAP SC-5 ("Test `apps/api/src/routes/games.test.ts` weryfikuje...").
- **D-20:** Nowa sekcja `describe('route ordering pin')` (lub równoważna grupa) z jednym testem: `GET /api/games/metadata/candidates?title=foo` → status **!== 404**. Akceptowalne statusy: 200 (gdy IGDB enabled + match), 503 (gdy IGDB disabled), 400 (gdy brak `title` query param). Byle nie 404 — co świadczyłoby, że `:externalId` route połknął `metadata`.
- **D-21:** Test używa boot'owanej apki (jak reszta `games.test.ts` — sprawdzić jak istniejące testy boot'ują Hono app i robią requesty; vermut spreaduje wzorzec na BE-05). Nie potrzeba mock'ować IGDB chain — 503 jest **OK acceptance** dla tego testu (klucz: route został dispatched, nie zwrócony 404).

### BE-06: Wiring composition smoke test

- **D-22:** Nowy plik **`apps/api/src/__tests__/wiring.test.ts`**. Osobny, izolowany — nie wbudowujemy w `games.test.ts`, żeby manipulacje stanem `igdbChainHolder` nie zatruwały innych testów.
- **D-23:** Test 1 (**state machine**): w `beforeEach` zapisz aktualny stan `igdbChainHolder` (current chain getter); w teście wywołaj `igdbChainHolder.swap(null)` (lub equivalent "disable" — zależy od API `IgdbChainHolder`; planner sprawdzi w `infrastructure/igdb/igdb-chain-holder.ts`); zrób request `GET /api/games/some-external-id/metadata` (lub równoważny IGDB endpoint); assert status `503`; w `afterEach` przywróć poprzedni stan.
- **D-24:** Test 2 (**singleton identity**): zaimportuj `wiring.ts` dwukrotnie (przez różne import-paths jeśli to ma znaczenie, albo dwoma `await import(...)`); assert `imp1.igdbChainHolder === imp2.igdbChainHolder`, `imp1.db === imp2.db`. Dodatkowo: spróbuj pobrać `tokenStore`/`circuitBreaker`/`rateLimiter` z chain'a (jeśli wystawione przez `IgdbChainHolder` API) i sprawdź identity między dwoma sekwencyjnymi requestami (np. trzymanie referencji w closure + porównanie). **Alt:** jeśli te internal'y nie są exposed, test sprawdza tylko `igdbChainHolder` identity — to wystarczy jako proxy (skoro chain holder jest singleton'em, jego internals też są).
- **D-25:** Test używa **realnej DB** (in-memory `:memory:` sqlite + `migrate()`) jak `update-game.optimistic.test.ts:55-57`. Nie próbujemy mock'ować Bun.serve — testujemy przez bezpośrednie `app.request('/api/games/.../metadata')` używając Hono routera (jeśli wiring exportuje `app`, użyć go; jeśli nie, planner doda export).

### Out-of-scope (świadomie)

- **D-26:** Frontend — żadnych zmian w `apps/client/**`. Phase 5 jest 100% API/infra.
- **D-27:** Bez touch'owania `wiring.ts` poza dodaniem (jeśli niezbędne) eksportu `app` na potrzeby testu BE-06. Singleton boot order jest **append-only** — nie zmieniamy kolejności inicjalizacji.
- **D-28:** Bez touch'owania `auth.ts`, security middleware (Phase 3 zostaje stabilna).
- **D-29:** Bez zmian w `applyReplace` poza koniecznymi dla D-08 (refactor `toGameInsertRow`).

### Phase 5 closing-sweep decisions (D-30..D-34, LOCKED)

- **D-30 (Q7, LOCKED):** `DrizzleImportRepository` constructor accepts an optional `db` parameter defaulting to the module-level singleton: `constructor(private readonly db: BunSQLiteDatabase<typeof schema> = defaultDb) {}`. Production wiring in `apps/api/src/wiring.ts` calls `new DrizzleImportRepository()` (no-arg) — unchanged. Tests pass an in-memory DB via `new DrizzleImportRepository(db)`. Rationale: enables in-memory integration tests without disturbing production composition.
- **D-31 (Q7, LOCKED):** In-memory SQLite via `new Database(':memory:')` + DI via D-30 is the STANDARD harness for new integration tests in Phase 5 (`apply-merge.test.ts`, `round-trip.test.ts`). Anti-patterns banned in these tests: `crypto.randomUUID()` for user IDs, `import { db } from '.../db/client'`, `new DrizzleImportRepository()` no-arg.
- **D-32 (Q7, LOCKED):** Test users use STATIC string IDs (`TEST_USER_A = 'user-a'`, `TEST_USER_B = 'user-b'`, `TEST_USER_C = 'user-c'`). Random IDs are NOT needed because each test owns an isolated in-memory DB. Static IDs make assertions readable and per-user-isolation tests obvious.
- **D-33 (Q8 / BE-02b, LOCKED):** Plan 05-08 SUPERSEDES D-09 for INSERT call-sites in `apps/api/src/infrastructure/import/drizzle-import-repository.ts`. Both `applyMerge` (INSERT branch AND UPDATE branch — see F-08-Q-DDD-1) and `applyReplace` INSERT loop pass the full 18-field `NewGame` shape to `toGameInsertRow`. Helper signature UNCHANGED. **Round-trip invariant scope:** pinned only for the fields v4 ExportSnapshot actually carries (`price`, `purchasedAt`, `notes`); `coverImage` and the three `metadata*` columns are exercised by `apply-merge.test.ts` Test 5/6/7 at the repo boundary but are NOT round-trippable through v4 snapshots (export-side drop documented via `not.toHaveProperty` assertions in `round-trip.test.ts`). Promotion to full round-trip coverage requires `ExportSnapshotV5` — out of Phase 5 scope; flagged in CONCERNS.md Future Work.
- **D-34 (Q-DDD-1 / F-1, LOCKED):** `applyMerge` UPDATE branch destructure list strips `id`, `userId`, `externalId`, AND `kind` from the helper output before `.set(updateSet)`. The `kind` strip is DELIBERATE — `Game.moveToCollection()` (`apps/api/src/domain/games/game.ts`) is the only domain-blessed kind-transition path (wishlist → owned) with guards (existence check + field-reset semantics on `status`/`hoursPlayed`/`purchasedAt`). There is no `moveToWishlist()` — owned → wishlist is intentionally unsupported. A snapshot-replay UPDATE that allowed kind mutation would bypass BOTH the existence guard AND the reset semantics. The destructure-strip enforces: import can mutate scalar attributes of an existing game row but cannot flip its kind. Pinned by `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` Test 8. If a future contributor "fixes" the strip by removing `kind: _k` from the destructure list, Test 8 fails RED.

### Claude's Discretion

- Dokładny mechanizm restartu procesu w `scripts/deploy.sh` (pm2 / systemd / inny) — planner pyta usera jeśli nie wiadomo z VPS state; jeśli VPS już ma działający mechanizm, deploy.sh tylko go wywołuje (`systemctl restart apex-api` lub `pm2 restart apex-api`).
- Czy w `scripts/deploy.sh` robić `bun install --production` czy `bun install --frozen-lockfile` — zależy od VPS workflow. Domyślnie: `bun install --production` po `git pull`.
- Konkretny shape `IgdbChainHolder.swap(null)` API — jeśli nie istnieje "null disable", planner doda metodę lub użyje innego mechanizmu sygnalizacji disabled state (np. zerowanie credentials w DB + read-through). To detail implementacyjny BE-06.
- Czy w BE-03 testować przez query counting (`Database.prepare` instrumentation) czy tylko semantic ("po imporcie 100 gier wszystkie istnieją"). Pierwsze pinuje regresję mocniej, drugie szybsze do napisania. Planner decyduje.
- Format komentarza nad `games` table w `schema.ts` (D-17) — proza vs bullety; byle z konkretnym uzasadnieniem (single-user + ≤5k + ~10ms).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 5: Backend Correctness" — goal + 6 success criteria
- `.planning/REQUIREMENTS.md` §"Backend correctness" BE-01..BE-06 — wszystkie 6 requirementów tej fazy
- `.planning/STATE.md` §"Accumulated Context" — wcześniejsze decyzje (m.in. "Migrations out-of-boot")

### Project conventions (must follow)
- `CLAUDE.md` — full project rules (Bun + Hono + Drizzle stack, naming, layered architecture, named-exports-only, no barrels w API)
- `.planning/codebase/ARCHITECTURE.md` — hexagonal layering (BE-01..BE-06 dotyka infrastructure/ + routes/, nie tyka domain/)
- `.planning/codebase/CONVENTIONS.md` — formatting + naming + `noExplicitAny: warn`
- `.planning/codebase/CONCERNS.md` — bieżąca lista znanych concern'ów; **BE-01..BE-06 wszystkie wymienione tutaj** — Phase 5 zamyka konkretne sekcje (każdy fix → zaktualizować wpis w CONCERNS po implementacji)
- `.planning/codebase/TESTING.md` — wzorzec testów (bun:test, co-located + `__tests__/`, in-memory sqlite + jawny `migrate()`)
- `.planning/codebase/STACK.md` — confirm: Bun runtime, drizzle-orm 0.45.2, hono 4.6.12

### Cross-cutting user preferences (MEMORY)
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_no_premature_indices.md` — **klucz dla BE-04** — nie indeksuj pól w ewoluującym modelu, dokumentuj koszt
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_no_regex_hacks.md` — przy BE-02 refactorze: jeśli edycja powtarza się >2× w plikach, helper jest mandatory (już mamy `toGameInsertRow`)
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_grill_then_enterprise.md` — po planowaniu Phase 5 chain grill-me → enterprise-web-expert nad PLAN

### Existing code touchpoints (read before editing)
- `apps/api/src/infrastructure/db/client.ts:19-30` — current auto-migrate; cel BE-01 D-03
- `apps/api/src/infrastructure/db/schema.ts:13-54` — `games` table + istniejące indeksy (`games_user_kind_format_idx` etc.); cel BE-02 (helper tutaj) + BE-04 (komentarz tutaj)
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts:165-187` — `create()` row builder (call-site 1 BE-02); `:193-225` `update()` celowo poza scope (D-10)
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts:13-67` — `applyMerge` (BE-02 call-site 2 + BE-03 batch SELECT); `:68-109` `applyReplace` (BE-02 call-site 3)
- `apps/api/src/routes/games.ts:42-60` — `toGameResponse` (NIE ten sam helper co BE-02; pomysłowo nazwany, ale to inny mapping — domain→HTTP, nie domain→row); `:153-156` route ordering komentarz (BE-05); `:156` `games.route('/metadata', ...)` registration
- `apps/api/src/routes/games-metadata.ts` — sub-router dla `/metadata/*` (BE-05 cel testu)
- `apps/api/src/wiring.ts` — composition root (BE-06); szczególnie `igdbChainHolder`, `igdbTokenStorage`, mutation rate limit; może wymagać export'u `app` dla testu
- `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts` — API `swap()` semantyka (BE-06 D-23)
- `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-85` — wzorzec test harness (in-memory sqlite + jawny migrate) — kopiowany do BE-06 test'u
- `apps/api/src/routes/games.test.ts` — istniejące testy route'ów + boot wzorzec (BE-05)
- `apps/api/drizzle/` — migracje (Phase 5 nie dodaje nowej migracji bo BE-04 = brak indeksów; BE-01 nie zmienia migracji, tylko sposób ich wywołania)
- `.github/workflows/deploy.yml` — SSH action wywołujący VPS deploy.sh; bez zmian
- `apps/api/package.json` — istniejące scripts `db:generate`, `db:migrate` (Drizzle Kit); BE-01 ich używa

### Stack docs (Context7 jeśli planner potrzebuje API details)
- Drizzle ORM (`/drizzle-team/drizzle-orm`) — `inArray`, transakcje `db.transaction(async tx => ...)`, `bun-sqlite/migrator`
- Hono (`/honojs/hono`) — `app.route()` ordering, `app.request()` w testach, `c.req.queries()`
- bun:test — `beforeEach`/`afterEach`, dynamic imports `await import(...)` dla identity testu

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`migrate` z `drizzle-orm/bun-sqlite/migrator`**: już używane w `client.ts:6, 26` i w testach (`update-game.optimistic.test.ts:7, 57`). BE-01 nie kasuje funkcji — tylko zmienia kto/kiedy ją woła. Test harness BE-06 użyje tej samej funkcji.
- **`drizzle-kit migrate`** (komenda CLI): `apps/api/package.json` ma `"db:migrate": "drizzle-kit migrate"`. BE-01 D-01 używa **tego skryptu**, nie surowego `migrate(...)` z library. Drizzle Kit czyta `drizzle.config.ts` i sam wymyśla path do migracji + DB.
- **In-memory test harness** (`update-game.optimistic.test.ts:49-58`): `new Database(':memory:')` + `drizzle({ client, schema })` + `migrate(db, { migrationsFolder })` — kopiowany do `wiring.test.ts` (BE-06).
- **Hono `app.request()`** w testach: prawdopodobnie używany w istniejącym `games.test.ts` — planner sprawdza pattern i go reusuje dla BE-05 i BE-06.
- **`gameSchema` + `authSchema` namespaced imports** w `client.ts:7-8` — to samo w testach. Helper `toGameInsertRow` ląduje w `gameSchema` (= `schema.ts`).
- **`bun:test` `beforeEach`/`afterEach`** — wzorzec setup/teardown widoczny w `update-game.optimistic.test.ts:53-86`. BE-06 D-23 używa go do snapshot/restore chain state.

### Established Patterns
- **No barrel `index.ts` w API** — helper `toGameInsertRow` import'owany przez konkretny path: `from '../db/schema'` (z poziomu `infrastructure/games/`) albo `from '../../../infrastructure/db/schema'` (z `application/...`). Zgodnie z CLAUDE.md "no barrels".
- **Named exports only** — `export function toGameInsertRow(...)`, `export type GameRowInput`.
- **Layered architecture (hexagonal)** — `infrastructure/db/schema.ts` jest jak najgłębiej w infra; **domain nie importuje** tego helper'a. Domain operuje na `Game`/`NewGame` aggregate; helper konsumuje aggregate (przez VOs `.value`) lub plain Import row — wszystko po stronie infra.
- **`bun-sqlite/migrator` `migrate(db, { migrationsFolder })`** — sync wywołanie, dropuje SQLite locki. Działa też dla `:memory:`.
- **Test files: co-located OR `__tests__/`** — Phase 5 używa OBA: BE-05 update'uje **istniejący** `apps/api/src/routes/games.test.ts` (co-located), BE-06 dodaje **nowy** `apps/api/src/__tests__/wiring.test.ts` (sibling dir). Konsekwentnie z CLAUDE.md naming patterns.
- **`process.env.NODE_ENV` check** dla dev/prod branching: pattern używany w wielu repach Node/Bun; w Apex'ie weryfikujemy obecność (`grep -rn "NODE_ENV" apps/api/src`) i jeśli nie ma — D-03 jest pierwszym takim use'em; planner może rozważyć użycie istniejącej `loadEnv()` w `infrastructure/config/` zamiast surowego `process.env`.

### Integration Points
- **`apps/api/src/infrastructure/db/client.ts`** — D-03 modyfikuje `if (!g.__apexDbMigrated) { migrate(...) }` na `if (process.env.NODE_ENV !== 'production' && !g.__apexDbMigrated) { migrate(...) }`. Jedna linia diff.
- **`apps/api/src/infrastructure/db/schema.ts`** — D-06/D-07: dodanie `export type GameRowInput = ...` + `export function toGameInsertRow(userId, input): NewGameRow`. Trzymane razem z `games` table definicją.
- **`drizzle-game-repository.ts:165-187`** — D-08: zamiana inline obiektu `values({ ... })` na `values(toGameInsertRow(userId, this.gameToInput(newGame, metadataRef)))` lub direct call jeśli `NewGame` ma już wszystkie pola w shape pasującym do `GameRowInput`. Planner sprawdza dokładny shape `NewGame.props`.
- **`drizzle-import-repository.ts:38-50, 86-100`** — D-08: oba miejsca przepuszczają plain `ng` rows przez helper. `applyMerge` dodatkowo D-11 do D-15 (batch SELECT).
- **`scripts/deploy.sh`** — nowy plik w root repo (jeśli `scripts/` nie istnieje, tworzymy). VPS `/root/apex/scripts/deploy.sh` modyfikujemy ręcznie raz po deployu Phase 5 (manual SSH step) by delegował do versioned'a — to **out-of-repo** akcja, planner opisuje ją w PLAN'ie jako "manual deployment step" (post-merge).
- **`apps/api/src/wiring.ts`** — D-22 może wymagać `export const app = ...` (jeśli aktualnie `app` jest tylko w `index.ts`). Planner sprawdza. Jeśli `app` żyje w `index.ts`, opcje: (a) wynieść `app` do `wiring.ts` (większa zmiana, ale czystsze testowanie); (b) test BE-06 importuje `index.ts` (uważać na `Bun.serve` side-effect — może wymagać `beforeAll` env guard).

### Out-of-scope w tej fazie (świadomie)
- `apps/client/**` — zero zmian.
- `apps/api/src/domain/**` — zero zmian; aggregate'y stabilne.
- `apps/api/src/application/**` — zero zmian poza ew. test'ami integracyjnymi dla BE-03 (jeśli planner wybierze D-15 alt-A: query counting).
- `apps/api/drizzle/**` — zero nowych migracji (BE-04 D-16 = no indices).
- Phase 3 security warstwa (CSRF, rate-limit, SameSite=Strict) — bez touch'u.
- `auth.ts` / better-auth config — bez zmian.
- IGDB chain core (`igdb-http-client.ts`, `igdb-adapter.ts`, breaker, rate-limiter) — bez zmian; BE-06 tylko testuje composition, nie modyfikuje implementacji.

</code_context>

<specifics>
## Specific Ideas

- **Brand:** Phase 5 nie ma UI surface, ale duch projektu (Linear/Raycast precyzja) tłumaczy się na: kod testów jest **konkretny i mierzalny**, nie "general-purpose framework". Każdy z 6 testów ma jeden assertion w sercu (np. BE-05 = "status !== 404"). Nie rozdmuchujemy.
- **Język w testach:** angielski (zgodnie z konwencją CLAUDE.md — code/tests/comments po angielsku; tylko UI copy + dokumentacja procesowa po polsku).
- **`scripts/deploy.sh` styl:** `#!/usr/bin/env bash` + `set -euo pipefail` + sekwencyjne kroki bez `||` fallbacków. Każdy krok jeden `echo` (np. `echo "▶ Migrating database..."`). Brand: deploy ma być **czytelny krok-po-kroku w logach**, nie black-box.
- **CONCERNS.md update style:** istniejące wpisy ("Migrations run unconditionally...", "Row-builder duplicated 3×", "Import-merge is N+1 reads", "Missing indices...", "Hono route ordering...", "Singleton wiring graph") muszą zostać **przepisane** po Phase 5 z `"Fix:"` na `"Resolved in Phase 5 (commit Y, D-Z)"` lub usunięte. Planner to obejmuje w PLAN'ach.

</specifics>

<deferred>
## Deferred Ideas

- **Batch UPDATE w `applyMerge`** (vs current per-row updates) — D-13 świadomie pomija. Jeśli przy kolekcji 10k+ rows zacznie być wąskim gardłem, dodać w przyszłości (SQLite UPSERT z `ON CONFLICT (user_id, external_id) DO UPDATE SET ...`). → **v2 lub on-demand**.
- **Dedup row-builder dla `DrizzleGameRepository.update()`** — D-10 wyłącza z scope; aktualnie `update()` ma własny inline `set({...})`. Jeśli kiedyś zmiana kolumny zboczy się także tu, rozszerzyć helper o "partial update shape" lub wprowadzić `toGameUpdateRow`. → **Phase 5+ on demand**.
- **Indices dla `hoursPlayed`/`genre`/`status`** — D-16 odłożone do momentu stabilizacji modelu danych. Re-evaluate po milestone v1.1 lub gdy realna kolekcja userów przekroczy 3k gier. → **v2 / when needed**.
- **Forensic read-only boot mode** — BE-01 D-03 enable'uje to architektonicznie (boot bez auto-migrate), ale realny tool ("apex --read-only db.sqlite > forensic.log") byłby osobnym feature'em. → **v2**.
- **Test infrastructure: query counter helper** — wspólny helper do `__tests__/` mierzący ilość SELECT-ów per test (D-15 alt-A). Jeśli planner wybierze tę ścieżkę dla BE-03, mogłoby wylądować jako reusable utility. → **on-demand, if BE-03 picks query-counting variant**.
- **`pm2` vs `systemd`** dla restartu procesu w `scripts/deploy.sh` (Claude's discretion w D-01) — jeśli okaże się, że VPS nie ma jeszcze żadnego process managera, decyzja może być pełnoprawnym osobnym ticketem. → **decyzja przy planowaniu (`/gsd-plan-phase 5` zapyta user-a jeśli niejasne)**.
- **Health check endpoint** wystawiający `igdbConfigured` status (np. `/health/deps`) — pasowałoby do filozofii BE-06 (composition observability), ale to **nowa capability**, nie correctness fix. → **v2 / Phase 6+**.
- **Drizzle migrations w CI** — pre-deploy check: czy migracje są deterministic'zne (drift detection). BE-01 nie rozwiązuje tego, tylko zmienia gdzie się wykonują. → **v2**.

</deferred>

---

*Phase: 5-Backend Correctness*
*Context gathered: 2026-05-15*
