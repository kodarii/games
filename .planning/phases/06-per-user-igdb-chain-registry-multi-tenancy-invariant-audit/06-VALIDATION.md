---
phase: 6
slug: per-user-igdb-chain-registry-multi-tenancy-invariant-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-20
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed invariants and assertions live in `06-RESEARCH.md` § "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` (built-in, no extra config) |
| **Config file** | none — `bun test` discovers `*.test.ts` automatically |
| **Quick run command** | `cd apps/api && bun test src/infrastructure/igdb` |
| **Full suite command** | `cd apps/api && bun test` |
| **Estimated runtime** | ~30s full suite (per Phase 5 baseline) |

---

## Sampling Rate

- **After every task commit:** Run quick command for the directory touched (`bun test src/<path>`)
- **After every plan wave:** Run full suite `cd apps/api && bun test`
- **Before `/gsd-verify-work`:** Full suite must be green AND a `bun run lint` (Biome) clean run
- **Max feedback latency:** ~10s for the targeted directory, ~30s for full

---

## Per-Plan Verification Map

> Tasks will be created by `gsd-planner` (step 8). This stub maps each CONTEXT decision to its expected automated proof. Planner MUST extend this with concrete task IDs.

| Decision | Validated by | Test Type | Automated Command |
|----------|--------------|-----------|-------------------|
| D-01 (lazy + never-evict) | `igdb-chain-registry.test.ts` — `get(userId)` builds on first call, returns same instance on second call | unit | `bun test src/infrastructure/igdb/__tests__/igdb-chain-registry.test.ts` |
| D-02 (no `primeIgdbChainFromDb`) | grep assertion: zero matches for `primeIgdbChainFromDb` / `firstUserIdOrNull` in `apps/api/src/` | static | `! grep -rn "primeIgdbChainFromDb\\|firstUserIdOrNull" apps/api/src/` |
| D-03 (Save/Clear → invalidate) | `save-igdb-integration.test.ts` + `clear-igdb-integration.test.ts` — calls `registry.invalidate(userId)`, not `swap()` | unit | `bun test src/application/integrations` |
| D-04 (`get(userId)` returns `IgdbChain \| null`) | `games-metadata.int.test.ts` — 503 path preserved when null | int | `bun test src/routes/__tests__/games-metadata.int.test.ts` |
| D-09 (rename) | grep: no `IgdbChainHolder` / `igdb-chain-holder.ts` symbol survives | static | `! grep -rn "IgdbChainHolder\\|igdb-chain-holder" apps/api/src/` |
| D-11 (snapshot fixture rewrite) | fixture test still passes with `bun test --randomize` | unit | `bun test --randomize src/__tests__/_fixtures` |
| D-12 (two-user isolation, KEY ACCEPTANCE) | NEW `igdb-chain-registry.two-user.test.ts` — `await registry.get('userA')` and `registry.get('userB')` return distinct instances; identity assertion | unit | `bun test src/infrastructure/igdb/__tests__/igdb-chain-registry.two-user.test.ts` |
| D-12 (HTTP-level) | extend `games-metadata.int.test.ts` with two-user seed; userA request never sees userB's chain | int | `bun test src/routes/__tests__/games-metadata.int.test.ts` |
| D-13/D-14 (CLAUDE.md SPA serving line) | grep: `"Vite SPA serwowane statycznie"` does NOT appear; `"reverse proxy (assumed nginx)"` or equivalent DOES appear | static | `! grep -F 'serwowane statycznie' CLAUDE.md && grep -i 'nginx\\|reverse proxy' CLAUDE.md` |
| D-15/D-16 (multi-tenancy framing) | grep: no `"Single-user model"` / `"the single user"` in CLAUDE.md/PROJECT.md | static | `! grep -E 'single[- ]user model\|the single user' CLAUDE.md PROJECT.md` |
| D-21/D-22/D-23 (per-user OAuth token cache) | `igdb-token-store.two-user.test.ts` — two users mint distinct tokens concurrently; no DB write to `igdb_oauth_token` | unit | `bun test src/infrastructure/igdb/__tests__/igdb-token-store.two-user.test.ts` |
| B1–B6 comment cleanup | grep: no `"k8s"` / `"horizontally"` / `"pods"` / `"SIGKILL"` framing in `apps/api/src/` | static | `! grep -rE 'k8s\|horizontal(ly)?\|\\bpods\\b' apps/api/src/` (manual triage) |
| D-06 AUDIT.md exists | file exists + enumerates module-level state | static | `test -f .planning/phases/06-*/06-AUDIT.md` |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- No new test framework install required (`bun:test` is built in).
- **Wave 0 stubs to scaffold (planner must create as red tests first):**
  - `apps/api/src/infrastructure/igdb/__tests__/igdb-chain-registry.test.ts` — basic `get`/`invalidate` shape
  - `apps/api/src/infrastructure/igdb/__tests__/igdb-chain-registry.two-user.test.ts` — D-12 acceptance
  - `apps/api/src/infrastructure/igdb/__tests__/igdb-token-store.two-user.test.ts` — D-21 acceptance
  - Rewrite `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` per D-11 (per-userId snapshot/restore)

*All other tests already exist; the rename in D-09 requires updating imports, not adding fixtures.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| SPA actually served via nginx on the VPS | D-13 | Repo cannot prove what nginx config exists on the VPS | After deploy, `curl -I https://<vps>/` returns 200 with the SPA HTML; confirm `Server: nginx` header or equivalent. Document outcome in CLAUDE.md correction. |
| Existing single-user IGDB deploy still works post-deploy | D-19, D-20 | First request after deploy is lazy rebuild; no test can simulate the deploy boundary | Trigger one IGDB search after deploy; expect ≤1s extra latency + a fresh Twitch OAuth token mint in logs. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s full / <10s targeted
- [ ] `nyquist_compliant: true` set in frontmatter once planner extends this table

**Approval:** pending
