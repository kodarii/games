# Apex — Game Collection Tracker

## What This Is

Prywatny tracker kolekcji gier wideo dla jednego użytkownika. Pozwala zarządzać posiadanymi grami (status, platforma, okładka, data zakupu, cena) i planować przyszłe zakupy przez wishlist. Narzędzie klasy Linear / Raycast — interfejs służy danym, nie odwraca od nich uwagi.

## Core Value

Właściciel zawsze wie co ma i co chce kupić, i może to sprawdzić w kilka sekund — precyzja, szybkość, fokus.

## Requirements

### Validated

<!-- Już shipped i działa w produkcji. -->

- ✓ Email/password auth (better-auth + Drizzle adapter, rate-limit 5/min na /sign-in/email) — existing
- ✓ Per-user kolekcja gier z statusami i platformą (CRUD, optimistic concurrency, IDOR-safe) — existing
- ✓ Wishlist jako dyskryminowana odmiana gry (kind=wishlist vs owned) — existing
- ✓ Słowniki: platforms, genres, developers (generic CRUD przez dictionary factory) — existing
- ✓ IGDB metadata enrichment (token store, circuit breaker, rate limiter, caching decorator) — existing
- ✓ Cover storage via UploadThing + cron orphan cleanup — existing
- ✓ Eksport / import kolekcji (snapshot v1..v4 + external, Zod-walidowany w packages/shared) — existing
- ✓ Idempotency-key middleware na mutacjach + TTL sweep — existing
- ✓ Tabele przez TanStack Table + data-table.tsx (server-side pagination/sort) — existing
- ✓ Graceful shutdown (SIGTERM/SIGINT, SHUTDOWN_DRAIN_MS) — existing
- ✓ Problem+JSON error responses (RFC 7807) z stabilnymi `type` URI — existing

### Active

<!-- Milestone v2: Settings + Integrations panel + Hardening. -->

**Settings page (side-nav + content, Linear-style):**

- [ ] Strona `/settings` z lewym side-navem i prawym panelem (rozszerzalna o nowe sekcje)
- [ ] Sekcja "Konto": email, zmiana hasła, wylogowanie ze wszystkich sesji
- [ ] Sekcja "Integracje" jako prototyp panelu integracji

**Panel integracji (IGDB jako pierwszy use case):**

- [ ] Tabela integracji ze stanem on/off, statusem (connected/disconnected/error), przyciskami konfiguruj/odłącz
- [ ] Konfiguracja IGDB: client_id + client_secret w UI, test-connection (fetch token z Twitch OAuth)
- [ ] Sekrety integracji szyfrowane at-rest w SQLite (AES-GCM, klucz derived przez HKDF-SHA256 z `BETTER_AUTH_SECRET`)
- [ ] One-time seed: przy starcie po wdrożeniu, jeśli baza pusta a env-vary IGDB ustawione — zaimportuj raz, zaloguj, potem env może zniknąć
- [ ] Wyłączenie integracji w UI = endpointy IGDB zwracają 503 (jak dziś gdy env-vary puste), bez restartu procesu

**Security hardening:**

- [ ] Rate-limit na mutujących routach (`POST/PATCH/DELETE /api/games`, `POST /api/upload/*`, IGDB enrich) — nie tylko sign-in
- [ ] CSRF defense: better-auth CSRF helper lub `Origin` / `Sec-Fetch-Site` check w middleware
- [ ] Session cookie `SameSite=Strict`, weryfikacja w testach
- [ ] Deny-list domyślnego sentinel-secret (`replace-with-32-byte-random-...`) w walidacji env

**Frontend stability:**

- [ ] Globalny `ErrorBoundary` w SPA (komponent + integracja w `main.tsx`)
- [ ] `useCredentialsForm` helper (login/register współdzielą uncontrolled+FormData driver)
- [ ] Hand-rolled dropdown w `game-view.tsx` → `@radix-ui/react-dropdown-menu` (już w deps)
- [ ] Podział `game-view.tsx` (669 linii) na `game-view-header`, `game-view-actions`, `game-view-fields`
- [ ] Inline SVG-i w `game-view.tsx` → glyphs w `@/components/icons.tsx`
- [ ] Test regression dla login/register (zapinają oba niedawne bug-fixy w MEMORY)

**Backend correctness:**

- [ ] Migracje out-of-boot — `migrate(db, ...)` z `client.ts` do osobnego entrypoint `bun run db:migrate`, deploy script wywołuje przed startem
- [ ] `toGameInsertRow(userId, game)` helper — fix 3× duplikacji row-buildera (import merge/replace + game create)
- [ ] Fix N+1 w `applyMerge` w `drizzle-import-repository.ts` (batch SELECT IN + Map lookup)
- [ ] Dodatkowe indeksy lub udokumentowanie cost sortowania po `hoursPlayed`/`genre`/`format`/`status`
- [ ] Assertion test dla `Hono` route ordering w `games.ts` (metadata przed `/:externalId`)

### Out of Scope

<!-- Świadomie odłożone w tym milestonie. -->

- **UploadThing w panelu integracji** — wpisany w "Tylko IGDB jako prototyp panelu" decyzji; migracja w następnym cyklu
- **Statystyki kolekcji / dashboard** — odłożone na kolejny milestone (po ustawieniach i hardeningu)
- **Power-user UX (Cmd+K, bulk actions, keyboard shortcuts)** — odłożone, choć wpisuje się w Linear/Raycast feel; nie blokuje stabilności
- **Smart wishlist (priorytety, budżet)** — odłożone; aktualny wishlist (kind=wishlist) wystarcza w v2
- **Sentry / Datadog** — odłożone; structured stdout logger wystarcza dla single-user na VPS
- **Migracja do Postgres** — odłożone; SQLite WAL wystarcza dla jednego użytkownika
- **Mobile / PWA** — anti-cel; aplikacja jest desktop-first ("biurko, monitor, pełen skupienia")
- **Wielouser, gamifikacja, ratingsy społecznościowe** — explicit anti-references w PRODUCT.md
- **CI gated na lint/format** — odłożone (osobna decyzja DevOps poza tym milestonem)
- **Rotacja klucza szyfrującego** — skrypt `rotate-secret` (re-encrypt-all dla rotacji `BETTER_AUTH_SECRET`) zaplanowany jako follow-up, nie blokuje shipu

## Context

**Stack istniejący (z `.planning/codebase/STACK.md`):** Bun monorepo, Hono ^4.6 + Drizzle ^0.45 + better-auth ^1.6 + SQLite (bun:sqlite, WAL), React 18 + Vite + TanStack Query/Table + Tailwind + shadcn (new-york, neutral) + Radix prymityvy + Better Auth React client. Biome do lint/format.

**Architektura (z `.planning/codebase/ARCHITECTURE.md`):** Hexagonal — `domain/` (pure TS), `application/` (use cases z `Result<T,E>`), `infrastructure/` (Drizzle, IGDB, UploadThing), `routes/` (Hono adapters → RFC 7807). Composition root w `apps/api/src/wiring.ts`. Singletony procesowe (circuit breaker, rate limiter, token store).

**Kontekst użytkownika:** jeden właściciel używający narzędzia regularnie z biurka. Polski język produktu (PRODUCT.md po polsku). Wymaga precyzji i szybkości; brak specyficznych wymagań WCAG.

**Najświeższe commity** sugerują fazę stabilizacji: `fix login and register`, `fix register`, `fix prod`. Brak commitów ficzerowych w ostatnich tygodniach — dobry moment na hardening + ustawienia przed kolejnym milestonem ficzerowym.

**MEMORY (user preferences, persists across sessions):**
- Layouty: pełnoekranowe (Jira/Monday-style), nie wycentrowane shelle
- Tabele: zawsze przez `@/components/data-table.tsx` + TanStack Table
- DRY: zakaz regex/sed hacków; >2× powtórzenie → wyciąg helpera
- Better-auth: `await refetchSession()` przed nawigacją do `useSession`-strzeżonego route
- Credential forms: uncontrolled + FormData (nie controlled useState — gubi autofill)

## Constraints

- **Tech stack**: Bun + Hono + Drizzle + SQLite + React + Tailwind + shadcn + Better Auth + UploadThing + IGDB — nie wymieniamy, rozszerzamy
- **Single-user model**: cała aplikacja zaprojektowana per-user (IDOR-safe repos) ale w praktyce jeden użytkownik na deploy — żadnych multitenant abstrakcji
- **Deployment**: VPS przez SSH (`.github/workflows/deploy.yml` + `appleboy/ssh-action`); single-process — `Bun.serve` na :3001, Vite SPA serwowane statycznie
- **Persistence**: SQLite single-file (`apps/api/data/apex.db`, WAL); migracje w `apps/api/drizzle/`
- **Język UI**: polski (PRODUCT.md, copy w UI). Kod, komentarze, commit-messages — angielski (zgodnie z istniejącą konwencją)
- **Brand**: Linear/Raycast — precyzja, gęstość z oddechem, dane mówią same za siebie. Zero dark-gamer estetyki, zero gamifikacji
- **Backwards compat**: istniejąca kolekcja musi działać po deployu (one-time seed dla IGDB env-varów, migracje wsteczne kompatybilne)
- **Security baseline**: nie obniżamy istniejących zabezpieczeń (per-user scoping, optimistic locking, idempotency); dodajemy CSRF + rate-limit jako warstwy ponad

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Settings page jako side-nav + content (Linear-style) | Rozszerzalne, naturalne dla wielu sekcji w przyszłości | — Pending |
| Tylko IGDB w panelu integracji w tym milestonie | Prototyp panelu; UploadThing dostanie ten sam mechanizm w następnym cyklu | — Pending |
| Sekrety integracji szyfrowane at-rest (AES-GCM); klucz szyfrujący derived z `BETTER_AUTH_SECRET` przez HKDF-SHA256 (single root secret, brak osobnego env-vara) | Defense in depth dla pliku bazy; jeden root secret upraszcza rotację i konfigurację | Validated (Phase 2) |
| One-time seed env→DB dla IGDB credentials | Zero downtime przy wdrożeniu; po seedzie env-vary mogą zniknąć | — Pending |
| Migracje out-of-boot (osobny `bun run db:migrate`) | Pozwala read-only forensic boot; eliminuje race przy ewentualnym scale-out | — Pending |
| Pełen hardening (security + frontend + backend) w jednym milestonie | Stabilizacja przed kolejnym milestonem ficzerowym; commitów stabilizacyjnych już sporo | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-12 after initialization*
