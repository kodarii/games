---
phase: 5
slug: backend-correctness
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-15
approved: 2026-05-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` (bundled with Bun) |
| **Config file** | None — auto-discovers `**/*.test.ts` |
| **Quick run command** | `bun test apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts apps/api/src/routes/games.test.ts apps/api/src/__tests__/wiring.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~30 seconds (full suite); ~5 seconds (quick run) |

---

## Sampling Rate

- **After every task commit:** Run quick command for the area touched (e.g., BE-02 commits → `bun test apps/api/src/infrastructure/db apps/api/src/infrastructure/games apps/api/src/infrastructure/import`)
- **After every plan wave:** Run `bun test apps/api` (full API suite)
- **Before `/gsd-verify-work`:** Full suite must be green; `bun run --filter=@apex/api typecheck` green; `bun run lint` green
- **Manual phase gate:** `NODE_ENV=production bun run start` must NOT auto-migrate against a scratch DB with deliberately-missing migration (fails fast on first query)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-02-T1 | BE-02 | 1 | BE-02 | T-5-03 (per-user scoping preserved) | All 3 callers emit rows with same column shape via `toGameInsertRow` | integration | `bun test apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-T2 | BE-02 | 1 | BE-02 (SC-2) | — | `rg "kind: [a-zA-Z]+\.kind" apps/api/src --type ts` returns exactly 1 match | static | inline grep in test (Test 5) | ❌ W0 | ⬜ pending |
| 05-02-T3 | BE-02 | 1 | BE-02 (D-10 / Q5) | — | **VO-unwrap snapshot counter** — `rg -c '\.value \?\? null'` over `drizzle-game-repository.ts` + `schema.ts` matches a pinned literal; wybucha gdy ktoś doda 3. UPDATE call-site (promotion trigger) lub gdy zdedplikujemy update() | static | inline grep in test (Test 6) | ❌ W0 | ⬜ pending |
| 05-03-T1 | BE-03 | 2 | BE-03 (SC-3) | T-5-03 (IDOR via batched IN) | After merging 100 games + 5 platforms (semantic-only test), all rows present with correct upsert semantics; per-user scoping preserved | integration | `bun test apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-T2 | BE-03 | 2 | BE-03 (Q4) | — | **N+1 regression grep guard** — `grep -E '\.where\(eq\(.*externalId.*\)\)' apps/api/src/infrastructure/import/drizzle-import-repository.ts \| wc -l` returns 0 | static | grep in `<acceptance_criteria>` of Task 1 in 05-03-PLAN | ❌ W0 | ⬜ pending |
| 05-04-T1 | BE-04 | 1 | BE-04 (SC-4) | — | Block comment present over `games` table in `schema.ts` | static | inline grep (Sort-cost note, hoursPlayed/genre/status, 5k, 10ms, feedback_no_premature_indices) | ❌ W0 (script optional) | ⬜ pending |
| 05-01-T1 | BE-01 | 2 | BE-01 (SC-1, Q2) | T-5-01 (deploy fail-safe + rollback) | `apps/api/scripts/backup.ts` uses VACUUM INTO; `scripts/deploy.sh` takes snapshot before migrate; on fail trap restores DB + WAL cleanup; retention 10 | manual | (1) `bun run --filter=@apex/api db:backup /tmp/x.bak` → valid SQLite file; (2) `bash scripts/deploy.sh` with broken migration → `[deploy] DB restored from backup` printed + `PRAGMA integrity_check`=ok + schema diff empty | ❌ Wave 0: contract + `set -euo pipefail` semantics | ⬜ pending |
| 05-01-T2 | BE-01 | 2 | BE-01 (SC-1, D-03) | T-5-05 | Boot in `NODE_ENV=production` skips auto-migrate; boot in `NODE_ENV=development` runs it | manual | `NODE_ENV=production bun --cwd apps/api src/index.ts` against fully-migrated DB → green; against scratch DB → fail-fast on first query | ✅ existing `client.ts` | ⬜ pending |
| 05-05-T1 | BE-05 | 1 | BE-05 (SC-5, Q6) | — | (a) `GET /api/games/metadata/candidates` returns status ≠ 404; when 503 then `body.type='/errors/feature-disabled'` (body-shape pin); (b) `GET /api/games/:externalId` for non-reserved slug returns one of [200,400,401,404] (counter-weight) | unit | `bun test apps/api/src/routes/games.test.ts -t "route ordering pin"` | ✅ existing test file (add `describe` with 2 it blocks) | ⬜ pending |
| 05-06-T1 | BE-06 | 2 | BE-06 (SC-6) | T-5-02 (singleton tampering in tests) | When `igdbChainHolder.swap(null)`, `GET /api/games/metadata/candidates` returns 503 with body.type='/errors/feature-disabled'; `PATCH /api/games/:externalId/metadata` returns 503 | integration | `bun test apps/api/src/__tests__/wiring.test.ts -t "503"` | ❌ W0 | ⬜ pending |
| 05-06-T2 | BE-06 | 2 | BE-06 (SC-6, Q3) | — | **Architectural singleton pin** — `Bun.spawnSync(rg)` for `new (DrizzleGameRepository|DrizzleTransactionRunner|IgdbChainHolder)\(` outside `wiring.ts` returns 0 hits; enforces CLAUDE.md anti-pattern as executable contract | integration | `bun test apps/api/src/__tests__/wiring.test.ts -t "no rogue"` | ❌ W0 | ⬜ pending |
| 05-07-T1 | (all six) | 3 | BE-01..BE-06 | — | Single CONCERNS.md sweep — all six Phase 5 entries carry resolution markers; BE-02 partial-resolution with Re-open + Promotion triggers; BE-01 cites VACUUM INTO; BE-06 cites architectural grep pin; BE-05 cites body-shape; BE-03 cites grep guard | static | `grep -c '(Resolved\|Partially resolved\|Test gap closed) in Phase 5' .planning/codebase/CONCERNS.md` = 6 | n/a (writes CONCERNS.md) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs follow the `{plan-id}-T{n}` convention (e.g. `05-02-T1` = first `<task>` block in `05-02-PLAN.md`).*

---

## Wave 0 Requirements

- [ ] `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` — pin BE-02 helper shape (3-caller equivalence) + dedup grep gate + Q5 VO-unwrap snapshot counter
- [ ] `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` — pin BE-03 batch SELECT correctness (semantic, not query-count) + Q4 grep guard in acceptance_criteria
- [ ] `apps/api/src/__tests__/wiring.test.ts` — pin BE-06 503 state machine + Q3 architectural grep pin (NOT tautological `await import().toBe()`)
- [ ] `apps/api/scripts/backup.ts` — Q2 VACUUM INTO CLI for snapshot/restore loop in deploy.sh
- [ ] (Optional, deferred) `scripts/__tests__/deploy.bats` to assert `set -euo pipefail` + `trap restore_and_exit ERR` behavior — **skip**, rely on contract + manual verification in Task 4 step 3

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BE-01 SC-1: deploy script fail-fast on migration error | BE-01 | `scripts/deploy.sh` runs out-of-process via SSH; can't reliably unit-test bash `set -e` semantics inside `bun:test` | (a) Create a deliberately-broken migration file in a scratch repo clone. (b) Run `bash scripts/deploy.sh`. (c) Assert exit code > 0 AND `systemctl restart apex-api` NOT executed (grep deploy log). |
| **BE-01 Q2: trap-based DB rollback on migration fail** | BE-01 | `trap ERR` only fires inside an actual shell process; bun:test cannot exercise it | (a) Capture pre-state: `cp apps/api/data/apex.db /tmp/pre.db`. (b) Plant broken migration. (c) Run deploy.sh. (d) Assert `[deploy] DB restored from backup` in stdout. (e) `sqlite3 apps/api/data/apex.db 'PRAGMA integrity_check'` returns `ok`. (f) `diff <(sqlite3 /tmp/pre.db .schema) <(sqlite3 apps/api/data/apex.db .schema)` empty (schema reverted). |
| **BE-01 Q2: backup script (`db:backup`) produces valid SQLite snapshot** | BE-01 | Verifies VACUUM INTO output is a standalone SQLite file (no WAL/SHM dependency) | `bun run --filter=@apex/api db:backup /tmp/x.bak && sqlite3 /tmp/x.bak 'SELECT COUNT(*) FROM games'` exits 0 and prints a count |
| BE-01 D-03: prod boot skips auto-migrate | BE-01 | `client.ts` module-import side effect prevents pure unit isolation without an env-var harness | (a) `NODE_ENV=production` against fully-migrated DB → boot succeeds, no migrate log line. (b) `NODE_ENV=production` against scratch DB → fail-fast on first query. (c) `NODE_ENV=development` against scratch DB → auto-migrate succeeds. |
| Existing-deploy backward compatibility | BE-01 | Production data on VPS — destructive testing not safe in CI | After PR merge: SSH into VPS, run new `scripts/deploy.sh` against existing migrated DB; assert API restarts and `/health` returns 200 with all existing games intact. First deploy also creates `apps/api/data/backups/` dir on VPS. |
| **BE-06 Q3: wiring.test.ts runs end-to-end on dev machine with IGDB creds seeded** | BE-06 | Clean swap fixture must NOT throw when `savedChain !== null` (regression on old afterEach detection-throw pattern) | Manually seed IGDB creds via Settings UI, then `bun test apps/api/src/__tests__/wiring.test.ts` — all 3 it blocks GREEN, no afterEach exception |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (3 new test files owned by 05-02, 05-03, 05-06 + new `apps/api/scripts/backup.ts`)
- [x] No watch-mode flags (every `bun test` invocation is one-shot)
- [x] Feedback latency < 30s (full suite ~30s; quick run ~5s)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Task IDs instantiated to `{plan-id}-T{n}` convention
- [x] **Q1 wave restructure**: 3 waves + closing 05-07 CONCERNS sweep
- [x] **Q2 BE-01 hardening**: VACUUM INTO + trap-based DB rollback
- [x] **Q3 BE-06**: architectural grep pin + clean swap fixture (no tautology, no flaky cleanup)
- [x] **Q4 BE-03**: grep guard for N+1 regression
- [x] **Q5 BE-02**: D-10 honored + VO-unwrap snapshot counter + partial-resolution wording
- [x] **Q6 BE-05**: body-shape pin + counter-weight, drop manual route swap

**Approval:** approved 2026-05-15 (re-approved post-grilling 2026-05-15)

---

## Notes

- **Test approach for BE-03:** semantic-only per user decision (2026-05-15). Query-counting via `bun:sqlite` prepare instrumentation deferred to v2. **Q4 addition:** file-scoped grep guard (`\.where\(eq\(.*externalId.*\)\)` count = 0) added to acceptance_criteria of Task 1 in 05-03-PLAN — catches per-row lookup regressions in the same file. Trade-off: doesn't catch regressions in new files (e.g. hypothetical `import-helpers.ts`); zero runtime instrumentation as quid pro quo.
- **Restart mechanism:** systemd (`systemctl restart apex-api`) per user decision (2026-05-15). `scripts/deploy.sh` ends with `sudo systemctl restart apex-api`.
- **NODE_ENV contract:** `scripts/deploy.sh` and the systemd unit file MUST export `NODE_ENV=production` for the apex-api service. This is a Phase 5 deploy contract (per user decision 2026-05-15 — "don't know yet, planner sets it").
- **Install flag:** `bun install --frozen-lockfile` (NOT `--production`) per user + research decision — preserves `drizzle-kit` needed by `db:migrate`.
- **Q2 — DB rollback on migration fail:** `scripts/deploy.sh` takes `VACUUM INTO` snapshot via new `apps/api/scripts/backup.ts` BEFORE running `db:migrate`. `trap restore_and_exit ERR` rolls DB back from snapshot on fail (+ removes stale `-wal`/`-shm`). Retention: last 10 snapshots in `apps/api/data/backups/`. Świadomy trade-off: tracimy zapisy zrobione między snapshot a fail (single-user, kilkanaście sekund okno — akceptowalne).
- **Q3 — wiring.test.ts (BE-06):** Test 3 is an **architectural grep pin** (`Bun.spawnSync(rg)` for `new (DrizzleX)\(` outside `wiring.ts` = 0 hits), NOT a tautological `await import().toBe()` (which would pass via ESM module cache regardless of singleton intent). Pinuje anti-pattern z CLAUDE.md jako wykonywalny contract. Clean swap fixture (`beforeEach: swap(null)` + `afterEach: swap(snapshot)`) — bez detection-throw, działa na dev z IGDB creds seeded.
- **Q5 — VO-unwrap snapshot counter (BE-02):** D-10 carve-out (update()/saveMetadata() inline) honored. Snapshot counter test (Test 6 w `to-game-insert-row.test.ts`) pinuje obecną liczbę `.value ?? null` w `drizzle-game-repository.ts` + `schema.ts`. Wybucha gdy ktoś doda 3. UPDATE call-site → promotion trigger do osobnych helperów (`toGameUpdateRow` ≠ `toGameMetadataRow`, NIE wspólnego). Wybucha też gdy zdedplikujemy update() → update pin. To snapshot pin, nie limit.
- **Q6 — BE-05 body-shape pin:** RED dowiedziony konstrukcyjnie przez `body.type === '/errors/feature-disabled'` discriminator (generowany WYŁĄCZNIE przez `games-metadata` sub-router). Drop manual route swap z plan-u. Drugi it block (counter-weight) chroni `:externalId` przed regresją w drugą stronę.
- **Q1 — Wave restructure (3 waves + closing CONCERNS sweep):** Original 6-wave linear chain (`05-02 → 05-03 → 05-04 → 05-01 → 05-05 → 05-06`) only had ONE real code dependency (`05-02 → 05-03`). The other 5 edges serialized doc edits to a shared `.planning/codebase/CONCERNS.md`. Restructured:
  - **Wave 1 (parallel):** 05-02, 05-04, 05-05 — touch independent files except `schema.ts` where 05-02 appends below line 54 and 05-04 inserts above line 11 (non-overlapping ranges; execute 05-04 first for smaller-diff cleanliness).
  - **Wave 2 (parallel):** 05-03 (needs 05-02 helper), 05-01, 05-06 — independent files.
  - **Wave 3 (closing):** 05-07 — single CONCERNS.md sweep landing all six resolution markers (incl. BE-02 partial resolution with re-open + promotion triggers per Q5) in ONE diff.
  Trade-off: ~2× wall-clock parallelism for one closing commit. Accepted 2026-05-15 (Q1 grilling).
