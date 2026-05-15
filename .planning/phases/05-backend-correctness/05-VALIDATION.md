---
phase: 5
slug: backend-correctness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
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
| {TBD}-BE02-01 | BE-02 | 1 | BE-02 | T-5-03 (per-user scoping preserved) | All 3 callers emit rows with same column shape via `toGameInsertRow` | integration | `bun test apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` | ❌ W0 | ⬜ pending |
| {TBD}-BE02-02 | BE-02 | 1 | BE-02 (SC-2) | — | `rg "kind: [a-zA-Z]+\.kind" apps/api/src --type ts` returns exactly 1 match | static | `bun run scripts/check-row-builder-dedup.sh` *(or inline grep in CI)* | ❌ W0 | ⬜ pending |
| {TBD}-BE03-01 | BE-03 | 2 | BE-03 (SC-3) | T-5-03 (IDOR via batched IN) | After merging 100 games + 5 platforms (semantic-only test), all rows present with correct upsert semantics; per-user scoping preserved | integration | `bun test apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` | ❌ W0 | ⬜ pending |
| {TBD}-BE04-01 | BE-04 | 3 | BE-04 (SC-4) | — | Block comment present over `games` table in `schema.ts`; CONCERNS.md updated with "Resolved in Phase 5" marker | static | `bun run scripts/check-sort-cost-note.sh` *(or inline grep)* | ❌ W0 (script optional) | ⬜ pending |
| {TBD}-BE01-01 | BE-01 | 4 | BE-01 (SC-1) | T-5-01 (deploy fail-safe) | `scripts/deploy.sh` exits non-zero if `db:migrate` fails AND restart command not executed | manual | run `scripts/deploy.sh` locally against broken migration; assert exit > 0 and no `systemctl restart` log | ❌ Wave 0: contract + `set -euo pipefail` semantics | ⬜ pending |
| {TBD}-BE01-02 | BE-01 | 4 | BE-01 (SC-1, D-03) | T-5-05 | Boot in `NODE_ENV=production` skips auto-migrate; boot in `NODE_ENV=development` runs it | manual | `NODE_ENV=production bun --cwd apps/api src/index.ts` against fully-migrated DB → green; against scratch DB → fail-fast on first query | ✅ existing `client.ts` | ⬜ pending |
| {TBD}-BE05-01 | BE-05 | 5 | BE-05 (SC-5) | — | `GET /api/games/metadata/candidates` returns status ≠ 404 (acceptable: 200/400/503) | unit | `bun test apps/api/src/routes/games.test.ts -t "route ordering pin"` | ✅ existing test file (add `describe`) | ⬜ pending |
| {TBD}-BE06-01 | BE-06 | 5 | BE-06 (SC-6) | T-5-02 (singleton tampering in tests) | When `igdbChainHolder.swap(null)`, `/api/games/:id/metadata` returns 503; `afterEach` restores prior chain | integration | `bun test apps/api/src/__tests__/wiring.test.ts -t "503 when disabled"` | ❌ W0 | ⬜ pending |
| {TBD}-BE06-02 | BE-06 | 5 | BE-06 (SC-6) | — | Two sequential `await import('../wiring')` calls return identical `igdbChainHolder`/`db` references (singleton identity) | integration | `bun test apps/api/src/__tests__/wiring.test.ts -t "singleton identity"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — the planner replaces `{TBD}` with concrete `PLAN-XX-YY` task numbers once PLAN.md is written.*

---

## Wave 0 Requirements

- [ ] `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` — pin BE-02 helper shape (3-caller equivalence)
- [ ] `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` — pin BE-03 batch SELECT correctness (semantic, not query-count)
- [ ] `apps/api/src/__tests__/wiring.test.ts` — pin BE-06 503 + singleton identity
- [ ] (Optional, deferred) `scripts/__tests__/deploy.bats` to assert `set -euo pipefail` behavior — **skip**, rely on contract + `set -e` semantics

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BE-01 SC-1: deploy script fail-fast on migration error | BE-01 | `scripts/deploy.sh` runs out-of-process via SSH; can't reliably unit-test bash `set -e` semantics inside `bun:test` | (a) Create a deliberately-broken migration file in a scratch repo clone. (b) Run `bash scripts/deploy.sh`. (c) Assert exit code > 0 AND `systemctl restart apex-api` NOT executed (grep deploy log). |
| BE-01 D-03: prod boot skips auto-migrate | BE-01 | `client.ts` module-import side effect prevents pure unit isolation without an env-var harness | (a) `NODE_ENV=production` against fully-migrated DB → boot succeeds, no migrate log line. (b) `NODE_ENV=production` against scratch DB → fail-fast on first query. (c) `NODE_ENV=development` against scratch DB → auto-migrate succeeds. |
| Existing-deploy backward compatibility | BE-01 | Production data on VPS — destructive testing not safe in CI | After PR merge: SSH into VPS, run new `scripts/deploy.sh` against existing migrated DB; assert API restarts and `/health` returns 200 with all existing games intact. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner instantiates task IDs)

**Approval:** pending

---

## Notes

- **Test approach for BE-03:** semantic-only per user decision (2026-05-15). Query-counting via `bun:sqlite` prepare instrumentation deferred to v2.
- **Restart mechanism:** systemd (`systemctl restart apex-api`) per user decision (2026-05-15). `scripts/deploy.sh` ends with `sudo systemctl restart apex-api`.
- **NODE_ENV contract:** `scripts/deploy.sh` and the systemd unit file MUST export `NODE_ENV=production` for the apex-api service. This is a Phase 5 deploy contract (per user decision 2026-05-15 — "don't know yet, planner sets it").
- **Install flag:** `bun install --frozen-lockfile` (NOT `--production`) per user + research decision — preserves `drizzle-kit` needed by `db:migrate`.
