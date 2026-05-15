# Phase 5: Backend Correctness — Discussion Log

**Date:** 2026-05-15
**Phase:** 5 — Backend Correctness
**Mode:** discuss (default, single-question turns)

Human-readable audit of the discuss-phase session. Captures questions asked, options presented, user's choice, and rationale. Not consumed by downstream agents — see `05-CONTEXT.md` for the decision contract.

---

## Area 1: Gray-area selection

**Question:** "Phase 5 ma 6 wąskich, technicznych requirementów. Które obszary chcesz przedyskutować?"

**Options presented:**
- Deploy migration flow (BE-01)
- toGameInsertRow shape (BE-02)
- Sort indices vs documented cost (BE-04)
- Test placement & assertion scope (BE-05/BE-06)

**User selected:** ALL FOUR.

**Note:** BE-03 (batch SELECT) został pominięty jako "mechanical, no gray area" — implementacja zdeterminowana przez wymaganie (`IN (externalIds)` + `Map` + in-memory loop, jeden roundtrip).

---

## Area 2: BE-01 Deploy migration flow

**First turn — question:** "Gdzie wywołać `bun run db:migrate` w deploy i co zrobić z auto-migrate w `client.ts`?"

**Options presented:**
1. Versioned scripts/deploy.sh + remove client.ts migrate
2. Versioned scripts/deploy.sh + keep dev safety net
3. Inline in .github/workflows/deploy.yml

**User answer:** "co jest złego w obecnym działaniu?"

**Claude response:** Wyjaśniono 5 powodów dla refactoru: (1) niewidzialny side-effect przy imporcie, (2) boot-time race przy multi-replica, (3) read-only forensic boot niemożliwy, (4) brak fail-fast w deploy, (5) testy już migrują same — usunięcie auto-migrate ich nie psuje.

**Second turn — question (re-asked z kontekstem):** "Mając powyższy kontekst — gdzie wywołać `bun run db:migrate` i co z auto-migrate w `client.ts`?"

**Same options re-presented.**

**User selected:** "Versioned scripts/deploy.sh + keep dev safety net (Recommended)".

**Decision captured:** D-01 do D-05 w CONTEXT.md.

---

## Area 3: BE-02 toGameInsertRow shape

**First turn — question:** "Jaką sygnaturę powinien mieć `toGameInsertRow`, żeby obsłużyć oba światy?"

**Options presented:**
1. Flat input + VO-unboxing helper
2. Aggregate-only signature + import builds Game first
3. Two specialized helpers

**User answer:** "wyjasnij o co chodzi w tym pytaniu, i przy kolejnych pytaniach tez zawsze wyjasniaj o co konkretnie chodzi"

**Claude response:** Wyjaśniono w pełni: trzy call-sites z różnymi typami wejścia (`NewGame` aggregate vs ImportPlan plain rows), problem przy dodawaniu nowej kolumny (silent miss w imporcie), trade-offs każdej opcji. Rekomendacja: (A) flat input, bo tylko ona spełnia BE-02 acceptance check (`rg "kind: \w+\.kind"` == 1 wystąpienie).

**Second turn — question (re-asked z wyjaśnieniem):** "Który kontrakt helpera dla BE-02?"

**Options:** (A) Flat GameRowInput + VO-unboxing (Recommended), (B) Aggregate-only, (C) Dwa wyspecjalizowane.

**User selected:** "(A) Flat GameRowInput + VO-unboxing".

**Decision captured:** D-06 do D-10 w CONTEXT.md. D-10 świadomie wyklucza `update()` ze scope BE-02 (ROADMAP nie wymienia go).

---

## Area 4: BE-04 Sort indices vs documented cost

**Question:** "BE-04: dodać 3 brakujące indeksy (`hoursPlayed`, `genre`, `status`) czy udokumentować jako akceptowany koszt?"

**Options:**
1. Dodać 3 indeksy w nowej migracji (Recommended)
2. Udokumentować jako akceptowany koszt
3. Hybryda

**Claude przedstawił:** stan faktyczny indeksów (4 z 7 ROADMAP-listed już istnieją; realna luka = 3 pola: `hoursPlayed`, `genre`, `status`), kontekst skali (single-user, ≤5k rows, full-scan ~10ms), trade-offs.

**User answer:** "nie dodajemy indeksó, model sie bedzie jeszcze zmieniał, bez snesu dodawac indeksy do pol ktore mogą w nastpenym zadaniu wylecieć bo uznam ze ich nie potrzebuje"

**Decision captured:** D-16 do D-18 w CONTEXT.md. **Memory utworzona:** `feedback_no_premature_indices.md` (zachowuje preferencję jako general guidance dla przyszłych podobnych dylematów).

---

## Area 5: BE-05/BE-06 Test placement

**Initial framing:** Claude wyjaśnił, że BE-05 placement jest forced przez ROADMAP SC-5 (`apps/api/src/routes/games.test.ts`) — brak gray area. Realna gray area to BE-06: jak strukturyzować wiring smoke test bez psucia singleton state w innych testach.

**Question:** "Jak strukturyzować BE-06 wiring smoke test?"

**Options:**
1. Nowy `apps/api/src/__tests__/wiring.test.ts`, snapshot + restore chain (Recommended)
2. Nowy plik, unit-test bez prawdziwego HTTP
3. Wbudować w `games.test.ts`

**User selected:** "Nowy `apps/api/src/__tests__/wiring.test.ts`, snapshot + restore chain (Recommended)".

**Decision captured:** D-19 do D-25 w CONTEXT.md. BE-05 lokalizacja zlocked'owana przez ROADMAP (D-19); BE-06 dostaje izolowany plik z snapshot/restore wzorcem (D-22 do D-24).

---

## Claude's Discretion items

Następujące decyzje **świadomie** pozostawiono planner'owi (gsd-plan-phase) lub executorowi bez angażowania user-a:

- **BE-01:** Mechanizm restartu procesu w `scripts/deploy.sh` (pm2/systemd/inny) — zależnie od stanu VPS; planner pyta user-a jeśli niejasne z post-Phase-2 deployu.
- **BE-01:** Wybór między `bun install --production` a `bun install --frozen-lockfile` w deploy.sh — workflow-dependent.
- **BE-02:** Czy `DrizzleGameRepository.create` przepuszcza `NewGame` przez helper bezpośrednio (jeśli shape jest kompatybilny) czy z `gameToInput()` mappingiem pośrednim. Detail kompozycji.
- **BE-03:** Test pokrycia (query-counting via instrumentation vs semantic-only). Planner wybiera proporcjonalnie do pożądanej regression strength.
- **BE-04:** Format komentarza nad `games` table (proza vs bullety; byle uzasadnienie obecne).
- **BE-06:** Konkretne API `IgdbChainHolder.swap(null)` lub równoważne — planner sprawdza w `igdb-chain-holder.ts` i jeśli brak "disable" API dodaje minimalną metodę.
- **BE-06:** Czy `app` ląduje w `wiring.ts` (export) vs zostaje w `index.ts` (test importuje index.ts z env-guard) — zależy od minimalności diff.

---

## Out-of-scope ideas (deferred, not lost)

Wszystkie odłożone idee skatalogowane w `05-CONTEXT.md` § Deferred Ideas (8 wpisów). Skrót:

- Batch UPDATE w `applyMerge` (poza per-row UPDATE)
- Dedup `toGameUpdateRow` dla `DrizzleGameRepository.update()`
- Indices `hoursPlayed`/`genre`/`status` (re-evaluate przy v1.1)
- Forensic read-only boot mode (osobny feature)
- Query-counter test helper jako reusable utility
- Wybór `pm2` vs `systemd` jako project-level decision
- Health check endpoint `/health/deps`
- Drizzle drift detection w CI

---

**Status na koniec sesji:** CONTEXT.md gotowy, wszystkie 6 requirementów BE-* mają udokumentowaną ścieżkę implementacji, no scope creep, 4 user feedback memories zachowane (1 nowy: `feedback_no_premature_indices`). Faza gotowa do `/gsd-plan-phase 5`.
