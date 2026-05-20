# Roadmap: Apex — Game Collection Tracker

## Overview

Brownfield milestone delivering Settings page + Integrations panel + Hardening on top of the validated baseline (auth, games, dictionaries, wishlist, IGDB, export/import, idempotency). The journey: first stand up the Settings shell with a working "Konto" section (foundation for all future sections), then ship the Integrations panel using IGDB as the prototype (with at-rest encryption as a hard prerequisite), then bolt on security hardening, frontend stability, and backend correctness as three independent vertical slices that can run in parallel after Phase 2.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Settings Shell + Konto** — Strona `/settings` z side-navem działa end-to-end z sekcją "Konto" (email, zmiana hasła, revoke-all-sessions)
- [x] **Phase 2: Integrations Panel (IGDB)** — Panel `/settings/integrations` z encrypted-at-rest credential store; IGDB konfigurowalne z UI bez restartu
- [x] **Phase 3: Security Hardening** — CSRF defense, per-user rate-limit na mutacjach, SameSite=Strict, deny-list dla sentinel-secrets
- [x] **Phase 4: Frontend Stability** — Global ErrorBoundary, `useCredentialsForm` helper, dekompozycja `game-view.tsx`, regression tests dla login/register (completed 2026-05-15)
- [ ] **Phase 5: Backend Correctness** — Migrations out-of-boot, `toGameInsertRow` dedup, batch SELECT w `applyMerge`, sort-field indices, route-ordering test

## Phase Details

### Phase 1: Settings Shell + Konto
**Goal:** User opens `/settings/account` and manages account credentials (email visible, change password, sign out everywhere) inside the existing Linear-style layout
**Mode:** mvp
**Depends on:** Nothing (vertical slice on top of validated baseline)
**Requirements:** SET-01, SET-02, SET-03, SET-04, SET-05, FE-07
**Success Criteria** (what must be TRUE):
  1. User logged in nawigujący na `/settings` widzi side-nav po lewej i panel zawartości po prawej w wizualnej spójności z `AppLayout` (shadcn, neutral palette, polski copy)
  2. User na `/settings/account` widzi własny email zalogowanej sesji (z `useSession`)
  3. User wypełnia formularz "Zmień hasło" (stare/nowe/potwierdzenie) i po sukcesie dostaje toast potwierdzający; better-auth waliduje stare hasło
  4. User klika "Wyloguj wszystkie sesje" i po `await refetchSession()` zostaje przekierowany na `/login` (regression z MEMORY: refetchSession przed navigate)
  5. Niezalogowany user wchodzący na `/settings/*` zostaje przekierowany przez `ProtectedRoute` na `/login`
**Plans:** 2/3 plans executed
**UI hint:** yes

Plans:
- [x] 01-01-PLAN.md — Settings shell: install shadcn primitives (alert-dialog, card, label), extend icons + Button destructive variant, create SettingsLayout + SettingsNav + AccountPage stub, mount nested /settings route in main.tsx (SET-01, FE-07)
- [x] 01-02-PLAN.md — Account profile + password change: extend auth-client with changePassword, create AccountPasswordForm (uncontrolled + FormData), render Profil card with email from useSession (SET-02, SET-03, FE-07)
- [x] 01-03-PLAN.md — Revoke-all-sessions + ProtectedRoute pin: add revokeSessions to auth-client, create AccountSessionsCard with AlertDialog + strict 4-step flow, regression test for /settings/* unauth redirect (SET-04, SET-05)

### Phase 2: Integrations Panel (IGDB)
**Goal:** User configures IGDB credentials in UI without touching `.env` or restarting the process; secrets are encrypted at-rest with an AES-GCM key derived from `BETTER_AUTH_SECRET` via HKDF-SHA256, and the existing IGDB chain (token store, breaker, rate-limiter) honors the new toggle/credential source
**Mode:** mvp
**Depends on:** Phase 1 (uses Settings shell + side-nav slot)
**Requirements:** INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, SEC-07
**Success Criteria** (what must be TRUE):
  1. User na `/settings/integrations` widzi tabelę z wierszem "IGDB" pokazującą status (`connected`/`disconnected`/`error`), `last-tested-at`, `last-error` i akcje (Konfiguruj, Test, Toggle, Usuń)
  2. User wpisuje `client_id`/`client_secret` w modalu konfiguracji, zapisuje — sekrety lądują w SQLite zaszyfrowane AES-GCM (klucz derived z `BETTER_AUTH_SECRET` przez HKDF-SHA256) i `last-tested-at` aktualizuje się po sukcesie testu (fetch token z Twitch OAuth)
  3. User klika "Test connection" — UI pokazuje sukces (token otrzymany, status `connected`) albo błąd (401/network) z czytelnym komunikatem; bez restartu procesu
  4. User toggle'uje wyłączenie integracji — endpointy `/api/games/:id/metadata` i `/api/games/metadata/candidates` zwracają 503 (jak dziś przy pustych env-varach), bez restartu procesu; ponowne włączenie przywraca działanie
  5. Świeży deploy z pustą bazą + ustawionymi env-varami `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` skutkuje one-time seedem: row w DB zaszyfrowany, status `connected`; usunięcie env-varów po seedzie nie wpływa na działanie
  6. Process boot fail-fast z czytelnym komunikatem, jeśli `BETTER_AUTH_SECRET` brakuje, jest krótszy niż 32 znaki lub równa się jednemu z sentinel-secretów z deny-listy (Zod refine w `env.ts`); ten sam sekret jest rootem dla HKDF szyfrowania integracji
  7. User klika "Usuń integrację" — credentials wyzerowane, status wraca do `disconnected`, endpointy IGDB znów zwracają 503
**Plans:** TBD
**UI hint:** yes

### Phase 3: Security Hardening
**Goal:** Mutating endpoints odporne na CSRF i rate-floods; session cookie zacieśnione do `SameSite=Strict`; sentinel secret z `.env.example` nie boot'uje produkcji
**Mode:** mvp
**Depends on:** Nothing (independent of Phase 1/2 — can run in parallel after baseline)
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. `POST/PATCH/DELETE /api/games`, `POST /api/upload/*`, `POST /api/games/:id/metadata` po przekroczeniu progu (np. 60/min per-user) zwracają 429 z RFC 7807 problem+json (`type=/errors/rate-limited`); integracyjny test SEC-05 wymusza assertion
  2. Request z obcym `Origin` lub bez `Sec-Fetch-Site` na mutującym endpoincie zwraca 403 (CSRF rejection) — integracyjny test SEC-06 weryfikuje
  3. Session cookie ustawiany przez better-auth ma flagę `SameSite=Strict`; istniejące `/sign-in/email` i `/sign-out` flowy nadal działają w testach
  4. Proces boot fail-fast z czytelnym komunikatem, jeśli `BETTER_AUTH_SECRET` to `replace-with-32-byte-random-aaaaaaaaaa` (deny-list sentinel-secretów w `env.ts` lub `validateAuthConfig`)
  5. Istniejące happy-path testy (`games.test.ts`, `games.idor.test.ts`, idempotency, sign-in) nadal przechodzą — żadne zabezpieczenie nie cofnięte
**Plans:** TBD

### Phase 4: Frontend Stability
**Goal:** SPA przeżywa render-time errors z czytelnym fallbackiem, credential forms idą przez wspólny driver, `game-view.tsx` rozbity na sensownie nazwane komponenty, regression-tests pinują dwa niedawne bugi
**Mode:** mvp
**Depends on:** Nothing (independent of Phase 1/2/3 — can run in parallel after baseline)
**Requirements:** FE-01, FE-02, FE-03, FE-04, FE-05, FE-06
**Success Criteria** (what must be TRUE):
  1. Uncaught render error w dowolnej page'u nie blank'uje SPA — globalny `ErrorBoundary` w `main.tsx` pokazuje fallback UI z komunikatem i przyciskiem "Załaduj ponownie"
  2. `apps/client/src/pages/login.tsx` i `register.tsx` używają wspólnego hooka `useCredentialsForm({ fields, onSubmit })` (uncontrolled + FormData + pending/error state); brak duplikacji `new FormData(form)` w obu plikach
  3. Action dropdown w `game-view.tsx` używa `@radix-ui/react-dropdown-menu` — keyboard nav (Tab/Arrow/Escape) działa, `role="menu"` obecny w DOM, brak hand-rolled click-outside
  4. `game-view.tsx` rozdzielony na `game-view-header.tsx`, `game-view-actions.tsx`, `game-view-fields.tsx` (każdy <250 linii); existing URL state i mutation behavior zachowany — happy-path manualny test view+edit przechodzi
  5. Inline SVG w `game-view.tsx` przeniesione do `@/components/icons.tsx` jako `<Icon.x />`; brak inline `<svg>` w `game-view.tsx`
  6. Test (`login.test.tsx`/`register.test.tsx`) wymusza obecność `await refetchSession()` przed `navigate` i że formularz operuje na uncontrolled inputs (FormData driver) — failuje, jeśli ktoś cofnie którykolwiek z dwóch fixów z MEMORY
**Plans:** 4 / 4 plans executed
**UI hint:** yes

Plans:
- [x] 04-01-PLAN.md — Global ErrorBoundary class + Polish fallback UI mounted in `main.tsx` (FE-01 / SC1)
- [x] 04-02-PLAN.md — `useCredentialsForm` shared driver + login/register regression tests pinning refetchSession ordering and uncontrolled inputs (FE-02, FE-06 / SC2, SC6)
- [x] 04-03-PLAN.md — shadcn dropdown-menu primitive, game-view decomposition (4 components <250 LOC), Icon registry extension (FE-03, FE-04, FE-05 / SC3, SC4, SC5)
- [x] 04-04-PLAN.md — Per-mutation-instance idempotency-key caching via useRef (T-04-21 supplementary fix from grill + enterprise-web review)

### Phase 5: Backend Correctness
**Goal:** Migracje wyciągnięte z boot, row-builder zde-duplikowany, N+1 w `applyMerge` zlikwidowany, sort-fields zindexowane, krytyczne assertion-testy pinują invariant'y
**Mode:** mvp
**Depends on:** Nothing (independent of Phase 1/2/3/4 — can run in parallel after baseline)
**Requirements:** BE-01, BE-02, BE-03, BE-04, BE-05, BE-06
**Success Criteria** (what must be TRUE):
  1. Deploy script (`scripts/deploy.sh` lub `.github/workflows/deploy.yml`) wywołuje `bun run db:migrate` przed `bun run start`; `client.ts` tylko otwiera DB (brak `migrate(...)` w boot path); start aplikacji z istniejącą migrowaną bazą działa, świeży deploy też
  2. `toGameInsertRow(userId, game)` istnieje w `infrastructure/db/schema.ts` (lub obok) i jest używane przez `applyMerge`, `applyReplace`, `DrizzleGameRepository.create` — brak duplikacji row-buildera w trzech miejscach (`rg "kind: game.kind"` zwraca jedno wystąpienie)
  3. `applyMerge` w `drizzle-import-repository.ts` wykonuje pojedynczy SELECT `IN (externalIds)` zamiast N+1 — benchmark/test na 100+ wierszach pokazuje pojedynczy roundtrip do DB
  4. Sortowanie po `hoursPlayed`/`genre`/`format`/`status` ma odpowiednie indeksy (nowa migracja) lub świadomie udokumentowany koszt w `schema.ts` / `CONCERNS.md` z uzasadnieniem
  5. Test `apps/api/src/routes/games.test.ts` weryfikuje że `GET /api/games/metadata/candidates` zwraca status ≠ 404 (regression-pin na Hono route ordering — `/metadata/*` przed `/:externalId`)
  6. Smoke test dla `wiring.ts` weryfikuje że `igdbConfigured === false` skutkuje 503 na `/api/games/:id/metadata` oraz że singleton identity zachowana między requestami (`tokenStore`, `circuitBreaker`, `rateLimiter` to ta sama instancja)
**Plans:** 6 plans

Plans:
- [ ] 05-01-PLAN.md — BE-01 deploy script + NODE_ENV gate (Wave 4): versioned scripts/deploy.sh runs db:migrate before sudo systemctl restart apex-api; client.ts auto-migrate gated by NODE_ENV !== 'production'
- [ ] 05-02-PLAN.md — BE-02 row-builder dedup (Wave 1): toGameInsertRow(userId, input) in infrastructure/db/schema.ts; wired into DrizzleGameRepository.create + applyMerge + applyReplace; rg "kind: \\w+\\.kind" returns 1
- [ ] 05-03-PLAN.md — BE-03 batch SELECT in applyMerge (Wave 2): two inArray(externalId, [...]) reads + in-memory Map lookup replaces N+1; per-user scoping preserved; semantic regression test (100 games + per-user isolation + empty-plan)
- [ ] 05-04-PLAN.md — BE-04 sort-cost note (Wave 3): TSDoc block comment over games table documenting accepted full-scan cost on hoursPlayed/genre/status; NO migration added (D-16)
- [ ] 05-05-PLAN.md — BE-05 route ordering regression pin (Wave 5, TDD): describe('route ordering pin') in routes/games.test.ts asserts GET /api/games/metadata/candidates != 404
- [ ] 05-06-PLAN.md — BE-06 wiring smoke test (Wave 6, TDD): apps/api/src/__tests__/wiring.test.ts pins igdbChainHolder.swap(null) -> 503 on metadata endpoints + singleton identity across re-imports

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → (3, 4, 5 can run in parallel)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Settings Shell + Konto | 3/3 | Complete | 2026-05-12 |
| 2. Integrations Panel (IGDB) | shipped (out-of-flow) | Complete | 2026-05-13 |
| 3. Security Hardening | shipped (out-of-flow) | Complete | 2026-05-14 |
| 4. Frontend Stability | 0/TBD | Not started | - |
| 5. Backend Correctness | 0/TBD | Not started | - |

### Phase 6: Per-user IGDB chain registry + multi-tenancy invariant audit

**Goal:** Replace global `IgdbChainHolder` with a per-user `IgdbChainRegistry` so the runtime IGDB pipeline (token store, breaker, rate limiter) matches the per-user storage invariant; audit codebase for analogous global-state-vs-per-user bugs; correct stale comments and CLAUDE.md framing that imply k8s / horizontal scale on a single-VPS deploy
**Requirements**: TBD (planner derives from FINDINGS.md)
**Depends on:** Phase 5
**Plans:** 0 plans

**Input artifacts:**
- `.planning/phases/06-per-user-igdb-chain-registry-multi-tenancy-invariant-audit/FINDINGS.md` — grill-me audit of `apps/api/src/index.ts` (2026-05-20), sections A (runtime fix), B (comment + CLAUDE.md staleness), C (out-of-scope follow-ups)

Plans:
- [ ] TBD (run /gsd-plan-phase 6 to break down)

### Phase 7: Composition root class + interfaces/http layer + result mapper + domain events scaffolding

**Goal:** Zastąpić `wiring.ts` (module-level singletons + side-effect imports) klasą `Application` z explicit lifecycle (start/stop/cleanup, signal handlers, migracje wyciągnięte z `db/client.ts` side-effect); przenieść `routes/` do `interfaces/http/<aggregate>/<aggregate>-router.ts` (hexagonal naming); dodać cienki `resultToResponse(c, result, statusMap)` helper który eliminuje boilerplate `switch (result.error.kind)` w każdej trasie bez rezygnacji z `Result<T, E>`; dodać scaffolding `domain/shared/aggregate-root.ts` + `domain/shared/domain-event.ts` + `infrastructure/events/in-process-event-bus.ts` i wpiąć go w dwa realne case'y: `GameDeleted` (zastępuje synchroniczne czyszczenie covera w `delete-game.ts` — orphan-cleanup cron zostaje jako fallback dla starych deletów) i `GameMetadataApplied` (placeholder handler tylko loguje strukturalnie — pokazuje że bus działa end-to-end). Inwariant per-user pozostaje nienaruszony — `userId` wszędzie, NIE wprowadzamy `organizationId`/multi-tenancy.

**Mode:** mvp
**Depends on:** Phase 6
**Requirements:** AR-01, AR-02, AR-03, AR-04, AR-05, AR-06, AR-07
**Success Criteria** (what must be TRUE):
  1. `apps/api/src/wiring.ts` znika; jego zawartość żyje w `apps/api/src/application.ts` jako klasa `Application` z metodami `start(port)`, `stop(exitCode)`, `cleanup()`, `registerProcessHandlers()`, `runMigrations()`, `registerMiddleware()`, `registerRoutes()`, `registerEventHandlers()`. `index.ts` redukuje się do `new Application().start(port)`. Migracje są wywoływane z `Application.runMigrations()` — `infrastructure/db/client.ts` NIE odpala migracji jako side-effect na import (regression test pinuje że re-import `db/client.ts` w teście nie powoduje rerun migracji ani zmian w `apps/api/data/`).
  2. Wszystkie istniejące pliki z `apps/api/src/routes/<name>.ts` zostają przeniesione do `apps/api/src/interfaces/http/<aggregate>/<aggregate>-router.ts` (np. `routes/games.ts` → `interfaces/http/games/games-router.ts`). Middleware (`require-auth`, `idempotency-key`, `request-context`) ląduje w `interfaces/http/middleware/`. Współdzielone helpery (`_problem-json.ts`, `_make-dictionary-router.ts`) idą do `interfaces/http/_shared/`. Wszystkie importy zaktualizowane, `bun run lint` + typecheck przechodzą.
  3. `interfaces/http/_shared/result-to-response.ts` eksportuje `resultToResponse<T, E extends { kind: string }>(c, result, mapper)` gdzie `mapper` to `Record<E['kind'], number>` (status) lub `Record<E['kind'], (err) => Response>` (custom). Wszystkie mutating routes w `interfaces/http/games/games-router.ts` używają tego helpera — `rg "switch \(result\.error\.kind\)" apps/api/src/interfaces` zwraca 0 wyników. Problem+JSON (RFC 7807) jest zachowany — helper deleguje do `problemJson(...)`.
  4. `domain/shared/aggregate-root.ts` definiuje `abstract class AggregateRoot` z `protected raise(event)` + `pullDomainEvents()`. `domain/shared/domain-event.ts` definiuje `interface DomainEvent { eventName: string; aggregateId: string; userId: string; occurredAt: Date }`. `infrastructure/events/in-process-event-bus.ts` implementuje `EventBus` port (z `domain/shared/event-bus.ts`) z fail-fast publikowaniem + logiem.
  5. `Game` extends `AggregateRoot`. `Game.delete()` (nowa metoda na agregacie) raise'uje `GameDeleted { gameId, userId, coverImageUrl }`. Use-case `delete-game.ts` po pomyślnym `repo.delete(...)` wywołuje `eventBus.publishAll(game.pullDomainEvents())`. Handler `GameDeletedCoverCleanupHandler` w `application/events/` woła `coverStorage.delete(coverImageUrl)` jeśli nie-null. Cron orphan-cleanup zostaje jako fallback dla deletów sprzed deployu — TSDoc nad cronem to dokumentuje.
  6. `Game.applyMetadata(...)` raise'uje `GameMetadataApplied { gameId, userId, externalRef }`. Handler `GameMetadataAppliedLogHandler` loguje `'game.metadata.applied'` przez request-scoped logger. (Placeholder — pokazuje że event bus przepływa userId z agregatu do handlera; przyszłe handlery dostają darmowy hook.)
  7. Wszystkie istniejące testy przechodzą bez zmian behawioralnych (`bun test apps/api` zielony). Nowy test `apps/api/src/application/__tests__/event-flow.test.ts` weryfikuje że (a) `Game.delete()` powoduje wywołanie `coverStorage.delete` z poprawnym URL przez handler, (b) `Game.applyMetadata` powoduje wywołanie logger.info z eventName `'game.metadata.applied'` przez handler. Per-user IDOR test (`games.idor.test.ts`) nadal zielony — żaden event ani handler nie crosstalkuje między userami (handler dostaje `userId` z eventu, nie z globalnego stanu).

**Plans:** TBD
**UI hint:** no

Plans:
- [ ] TBD (run /gsd-plan-phase 7 to break down)
