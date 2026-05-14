# Requirements: Apex — Game Collection Tracker

**Defined:** 2026-05-12
**Core Value:** Właściciel zawsze wie co ma i co chce kupić, i może to sprawdzić w kilka sekund — precyzja, szybkość, fokus.

**Milestone scope:** Settings page + Integrations panel + Hardening. Wcześniej shipped funkcje (auth, gry, słowniki, wishlist, IGDB, eksport/import, idempotency) traktowane jako Validated baseline — patrz PROJECT.md > Requirements > Validated.

## v1 Requirements

### Settings

- [x] **SET-01**: User może otworzyć stronę `/settings` z bocznym menu (side-nav) i prawym panelem zawartości; struktura przygotowana na dodawanie kolejnych sekcji
- [x] **SET-02**: Sekcja "Konto" pokazuje aktualny email zalogowanego użytkownika
- [x] **SET-03**: User może zmienić hasło z poziomu sekcji "Konto" (formularz: stare hasło, nowe hasło, potwierdzenie; walidacja przez better-auth)
- [x] **SET-04**: User może wylogować wszystkie aktywne sesje (revoke all sessions) jednym kliknięciem
- [x] **SET-05**: Strona ustawień jest dostępna tylko dla zalogowanego użytkownika (ProtectedRoute)

### Integrations

- [ ] **INT-01**: User widzi listę dostępnych integracji w sekcji `/settings` > Integracje (tabela: nazwa, status, akcje)
- [ ] **INT-02**: User może skonfigurować IGDB przez formularz w UI (client_id, client_secret) — bez restartu procesu i bez edycji `.env`
- [x] **INT-03**: Sekrety integracji są zaszyfrowane at-rest w SQLite (AES-GCM, klucz derived przez HKDF-SHA256 z `BETTER_AUTH_SECRET`)
- [ ] **INT-04**: User może wyzwolić "Test connection" dla IGDB — UI pokazuje sukces (token otrzymany) albo błąd (401/network/etc.)
- [ ] **INT-05**: User może włączyć/wyłączyć integrację toggle'em; wyłączona integracja powoduje 503 z endpointów IGDB (jak dzisiejsze zachowanie gdy env-vary puste) bez restartu procesu
- [ ] **INT-06**: One-time seed przy starcie: jeśli baza nie ma rekordu IGDB a env-vary `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` są ustawione — zaimportuj raz, zaszyfruj, zapisz; potem env-vary mogą zniknąć bez utraty konfiguracji
- [ ] **INT-07**: Status integracji (last-tested-at, last-error) pokazany w UI tabeli integracji
- [ ] **INT-08**: User może usunąć skonfigurowaną integrację (delete credentials); reset do stanu "niezainicjalizowana"

### Security hardening

- [ ] **SEC-01**: Mutujące route'y `/api/games`, `/api/platforms`, `/api/genres`, `/api/developers`, `/api/upload/*`, `/api/games/:id/metadata` mają rate-limit per-user (np. 60/min na user-id, konfigurowalny)
- [ ] **SEC-02**: CSRF defense: weryfikacja `Origin`/`Sec-Fetch-Site` w middleware przed `requireAuth` lub aktywacja better-auth CSRF helpera
- [ ] **SEC-03**: Session cookie ustawia `SameSite=Strict` (jeśli to nie psuje OAuth-style flowów — w aktualnym setupie powinno działać)
- [ ] **SEC-04**: Walidacja env odrzuca domyślne sentinel-secrets (`replace-with-32-byte-random-...`) — boot fail z czytelnym komunikatem
- [ ] **SEC-05**: Test E2E lub integracyjny weryfikuje że rate-limit zwraca 429 po przekroczeniu progu
- [ ] **SEC-06**: Test integracyjny weryfikuje że request z obcym Originem lub bez Sec-Fetch-Site jest odrzucany 403 (CSRF)
- [x] ~~SEC-07~~ — Resolved by HKDF-from-`BETTER_AUTH_SECRET` (Phase 2) + sentinel deny-list (SEC-04)

### Frontend stability

- [ ] **FE-01**: Globalny `ErrorBoundary` opakowuje `<RouterProvider>` w `main.tsx`; renderuje fallback UI (komunikat + przycisk "Załaduj ponownie")
- [ ] **FE-02**: `useCredentialsForm({ fields, onSubmit })` hook ekstrahuje wspólny pattern login/register (uncontrolled + FormData + pending/error state); oba page'y używają go zamiast ręcznej duplikacji
- [ ] **FE-03**: Hand-rolled dropdown w `game-view.tsx` zastąpiony przez `@radix-ui/react-dropdown-menu` (keyboard nav, Escape, role="menu" za darmo)
- [ ] **FE-04**: `game-view.tsx` (669 linii) podzielony na komponenty: `game-view-header`, `game-view-actions`, `game-view-fields` (każdy <250 linii); zachowane existing API i URL state
- [ ] **FE-05**: Inline SVG-i w `game-view.tsx` przeniesione do `@/components/icons.tsx` jako `<Icon.name />`
- [ ] **FE-06**: Regression testy dla login/register zapinające oba niedawne bugi: (a) refetchSession przed navigate, (b) uncontrolled+FormData zamiast controlled useState
- [x] **FE-07**: Strona ustawień używa istniejących wzorców (`AppLayout`, shadcn komponenty, neutralna paleta Linear-style) — wizualnie spójna z resztą aplikacji

### Backend correctness

- [ ] **BE-01**: Migracje wyciągnięte z `infrastructure/db/client.ts:25` do osobnego skryptu `bun run db:migrate`; deploy script wywołuje przed `bun run start`; `client.ts` tylko otwiera DB
- [ ] **BE-02**: Helper `toGameInsertRow(userId, game)` w `infrastructure/db/schema.ts` (lub obok), użyty w `applyMerge`, `applyReplace`, `DrizzleGameRepository.create` — dedup row-buildera
- [ ] **BE-03**: `applyMerge` w `drizzle-import-repository.ts` używa batch SELECT z `IN (externalIds)` + `Map<externalId, row>` zamiast N+1 czytań w pętli
- [ ] **BE-04**: Brakujące indeksy dla pól sortowania (`hours_played`, `genre`, `format`, `status`) — dodane w nowej migracji lub świadomie udokumentowane jako akceptowany koszt
- [ ] **BE-05**: Assertion test w `apps/api/src/routes/games.test.ts` weryfikuje że `GET /api/games/metadata/candidates` zwraca status różny od 404 (gwarancja Hono route ordering)
- [ ] **BE-06**: `wiring.ts` ma test (smoke) że `igdbConfigured === false` skutkuje 503 na endpointach IGDB, oraz że singleton identity zachowana między requestami

## v2 Requirements

Deferred do następnych milestone'ów (świadomie poza zakresem).

### Integrations expansion

- **INT-V2-01**: Migracja UploadThing do panelu integracji (token + allowed-emails w UI, encrypt at-rest, toggle on/off)
- **INT-V2-02**: Generic factory dla nowych integracji (interface `Integration<Config>` + UI wrapper) — pozwala dodać kolejną integrację <100 linii

### Settings expansion

- **SET-V2-01**: Sekcja "Dane" — eksport/import przeniesione z route'ów do UI; przycisk "usuń wszystko"
- **SET-V2-02**: Sekcja "Wygląd" — tryb jasny/ciemny/system, gęstość tabel, domyślny widok

### Security expansion

- **SEC-V2-01**: External error sink (Sentry / Axiom) dla 5xx w produkcji
- **SEC-V2-02**: Skrypt `rotate-secret` (re-encrypt-all dla rotacji `BETTER_AUTH_SECRET`)
- **SEC-V2-03**: CI lint/format gate na PR

### Frontend polish

- **FE-V2-01**: Zamień `alert('Failed to delete: ...')` na sonner toast (richColors, top-center). Lokalizacja: `grep -rn "alert(\`Failed to delete:" apps/client/src/` (po Phase 4 może być w `apps/client/src/components/game-view/*.tsx` lub w okrojonym `game-view.tsx` z innym line-numberem). Pre-existing pre-Phase 4; świadomie out-of-scope dla Phase 4 (pure refactor invariant). Tracked from Phase 4 grill M2 / enterprise H.1 / re-grill N7.
- **FE-V2-02**: Polonizacja copy login/register (`apps/client/src/pages/login.tsx`, `register.tsx` — current "Welcome back" / "Sign in" / "Create account"). UI lang policy CLAUDE.md mówi polski, ale Phase 4 explicit zachowuje current copy (FE-06 dotyczy zachowań, nie copy). Decyzja: kiedy ujednolicić UI lang.
- **FE-V2-03**: Sign-out flow w `apps/client/src/components/layout/sidebar.tsx:114-118` — dodać `await refetchSession()` przed `navigate('/login')`. Działa dziś tylko bo `/login` jest public route; jeśli kiedyś sign-out będzie przekierowywał na ProtectedRoute, ten gap się ujawni. Tracked from Phase 4 enterprise C.

- **FE-V2-04**: Deterministic `externalId` for manual-create games — generate via `hash(userId, idempotencyKey, kind)` in `create-game.ts` use-case zamiast random ID. Existing UNIQUE constraint `games_user_id_external_id_unq` then eliminates T-04-28 + T-04-25 silent duplicate-create scenarios for manual-create flow (currently only IGDB-matched games are protected because IGDB `externalId` is deterministic). Cost: small server-side change; uses idempotency-key from request body as deterministic seed. No schema changes. Tracked from Phase 4 (Plan 04-04) re-grill #4 enterprise ISSUE-5.

- **FE-V2-05**: enrichGameMetadata friendly 409 UX — current PATCH 409 (retry-after-success) shows generic error toast. Map to specific message ("Metadane już zaktualizowane — odśwież stronę żeby zobaczyć aktualną wersję") in error handler of `useEnrichGameMetadataMutation`. Alt path: add idempotency-key to PATCH endpoint (server-side handler change). Tracked from Phase 4 (Plan 04-04) re-grill #4 enterprise ISSUE-4.

### Frontend convention (V3)

- **FE-V3-01**: Audit + enforce `disabled={mutation.isPending}` convention na ALL Save buttons in app using mutation hooks (add-game-modal, edit-game-form, dictionary forms platform/genre/developer, import submit). Currently only `igdb-integration-card.tsx` ma tę konwencję. Bez tego T-04-29 concurrent-mutate race (server-side onConflictDoNothing chroni cache row, ale nie side-effect duplication) pozostaje otwarty dla wszystkich pozostałych mutation call-sites. Możliwe rozwiązania: (a) PR-checklist convention; (b) custom lint rule; (c) audit + manual fix. Tracked from Phase 4 (Plan 04-04) re-grill #4 enterprise M1.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Statystyki kolekcji / dashboard | Odłożone do kolejnego milestone'u ficzerowego; aktualny milestone fokus na stabilizacji + ustawieniach |
| Power-user UX (Cmd+K, bulk actions, keyboard shortcuts) | Pasuje do Linear/Raycast feel ale nie blokuje stabilności; odłożone |
| Smart wishlist (priorytety, budżet, alerty) | Aktualny `kind=wishlist` wystarcza w v2; odłożone |
| Migracja do Postgres | SQLite WAL wystarcza dla single-user na VPS; scale-out nie jest celem |
| Mobile / PWA | Anti-cel — aplikacja desktop-first per PRODUCT.md ("biurko, monitor, pełen skupienia") |
| Wielouser, ratingsy społecznościowe, gamifikacja | Explicit anti-references w PRODUCT.md |
| Rotacja `BETTER_AUTH_SECRET` (re-encrypt-all) w tym milestone | Skrypt `rotate-secret` — follow-up, nie blokuje shipu integracji |
| Sentry / Datadog integracja | Structured stdout logger wystarcza dla single-user; defer do v2 |

## Traceability

Wypełnione przez `gsd-roadmapper` 2026-05-12. Każdy v1 requirement mapowany do dokładnie jednej fazy.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SET-01 | Phase 1 — Settings Shell + Konto | Complete |
| SET-02 | Phase 1 — Settings Shell + Konto | Complete |
| SET-03 | Phase 1 — Settings Shell + Konto | Complete |
| SET-04 | Phase 1 — Settings Shell + Konto | Complete |
| SET-05 | Phase 1 — Settings Shell + Konto | Complete |
| FE-07  | Phase 1 — Settings Shell + Konto | Complete |
| INT-01 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-02 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-03 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-04 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-05 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-06 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-07 | Phase 2 — Integrations Panel (IGDB) | Pending |
| INT-08 | Phase 2 — Integrations Panel (IGDB) | Pending |
| SEC-07 | Phase 2 — Integrations Panel (IGDB) | Pending |
| SEC-01 | Phase 3 — Security Hardening | Pending |
| SEC-02 | Phase 3 — Security Hardening | Pending |
| SEC-03 | Phase 3 — Security Hardening | Pending |
| SEC-04 | Phase 3 — Security Hardening | Pending |
| SEC-05 | Phase 3 — Security Hardening | Pending |
| SEC-06 | Phase 3 — Security Hardening | Pending |
| FE-01  | Phase 4 — Frontend Stability | Pending |
| FE-02  | Phase 4 — Frontend Stability | Pending |
| FE-03  | Phase 4 — Frontend Stability | Pending |
| FE-04  | Phase 4 — Frontend Stability | Pending |
| FE-05  | Phase 4 — Frontend Stability | Pending |
| FE-06  | Phase 4 — Frontend Stability | Pending |
| BE-01  | Phase 5 — Backend Correctness | Pending |
| BE-02  | Phase 5 — Backend Correctness | Pending |
| BE-03  | Phase 5 — Backend Correctness | Pending |
| BE-04  | Phase 5 — Backend Correctness | Pending |
| BE-05  | Phase 5 — Backend Correctness | Pending |
| BE-06  | Phase 5 — Backend Correctness | Pending |

**Coverage:**
- v1 requirements: 33 total (SET: 5, INT: 8, SEC: 7, FE: 7, BE: 6)
- Mapped to phases: 33 ✓
- Unmapped: 0
- Per-phase distribution: Phase 1 = 6, Phase 2 = 9, Phase 3 = 6, Phase 4 = 6, Phase 5 = 6

> **Note:** Original header in initial REQUIREMENTS.md said "28 total" — manual recount during roadmapping shows 33 (5+8+7+7+6). Discrepancy was a stale comment, not a missing requirement; nothing dropped.

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-12 — traceability filled by `gsd-roadmapper`*
