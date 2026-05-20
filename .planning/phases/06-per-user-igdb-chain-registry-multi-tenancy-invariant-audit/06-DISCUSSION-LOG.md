# Phase 6: Per-user IGDB chain registry + multi-tenancy invariant audit — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `06-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 06-per-user-igdb-chain-registry-multi-tenancy-invariant-audit
**Areas discussed:** Registry lifecycle, Audit scope (A2), Comment cleanup + class rename, CLAUDE.md correction scope

---

## Registry lifecycle (Area 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy + never-evict | Boot does not warm any user. `Save` / `Clear` invalidates the slot. First IGDB request for `userId` reads DB, decrypts, builds chain, stores in map. Slot lives until process restart. No LRU / TTL. | ✓ |
| Hybrid: build on `Save` + never-evict | `SaveIgdbIntegration` builds the chain immediately (symmetric with today's `swap`). Boot still empty. Two code paths to build (Save + lazy first request). | |
| Eager warming on boot + LRU | Boot reads all `integration_credentials` rows and warms the map. LRU bounded (e.g., 20 slots). Overkill for current scale. | |

**User's choice:** Lazy + never-evict (recommended)
**Notes:** Matches single-user prod scale; one Twitch OAuth app per user → no shared rate budget; chain instances are a few KB so unbounded growth is not a memory concern.

---

## Audit scope A2 (Area 2)

| Option | Description | Selected |
|--------|-------------|----------|
| `06-AUDIT.md` + fix only same-pattern bugs; everything else → CONCERNS.md | Phase task: audit FINDINGS A2 candidates + grep for module-level user-scoped state. Result in `06-AUDIT.md`. Same-pattern bugs (global pretending to be per-user) get a plan in this phase; the rest gets appended to `.planning/codebase/CONCERNS.md`. | ✓ |
| Sweep + directly to `.planning/codebase/CONCERNS.md` (no AUDIT.md) | Fewer files; weaker traceability of what Phase 6 specifically found. | |
| Audit + fix everything in this phase (block to zero) | Strongest guarantee, highest scope-creep risk. | |

**User's choice:** AUDIT.md + narrow fix scope (recommended)
**Notes:** Audit candidates are explicitly enumerated in FINDINGS A2 + grep for module-level `let`/`const` touching user state. CronLock keep-and-correct per FINDINGS B6 recommendation.

---

## Comment cleanup + class rename (Area 3)

| Option | Description | Selected |
|--------|-------------|----------|
| Rename + three separate commits | (1) `refactor(06): per-user IGDB chain registry` (runtime + rename + fixture), (2) `docs(06): drop k8s/horizontal-scale framing` (B1–B6), (3) `docs(claude): retire single-user framing` (CLAUDE.md / B7). Each commit independently revertable. | |
| Rename + single comprehensive commit | One commit: `refactor(06): per-user IGDB chain registry + multi-tenancy cleanup`. Includes runtime + rename + comments + CLAUDE.md + any audit fixes. Atomic revert. Simpler history. | ✓ |
| No rename; three commits | Keeps `IgdbChainHolder` name despite semantics shifting to "registry". Smaller diff, but name lies about behavior. | |

**User's choice:** Rename + single comprehensive commit
**Notes:** Choice diverges from project's usual atomic-commit convention; user explicitly preferred a single big commit for revert simplicity on this conceptually unified change.

---

## CLAUDE.md correction scope (Area 4)

| Option | Description | Selected |
|--------|-------------|----------|
| B7 + retire "single-user model" framing | (1) Verify how SPA is actually served on VPS (probably nginx) and fix the false `Bun.serve serwowane statycznie` line. (2) Change "single-user model" framing to "per-user end-to-end" per STATE.md. (3) Drop multi-tenant abstraction mentions (organizations/teams) where noisy. | ✓ |
| B7 only — minimal | Fix one line about SPA; defer "single-user" framing retirement to a later commit. | |
| Full CLAUDE.md sweep | Constraints + Architecture + Conventions audit; high scope-creep risk. | |

**User's choice:** B7 + retire single-user framing (recommended)
**Notes:** User noted the original wording was hard to follow and asked for plainer Polish. Saved a feedback memory to keep user-facing prompts in plain Polish going forward.

---

## Claude's Discretion

- Internal `IgdbChainRegistry` API shape (`Map<string, IgdbChain>` storage, `Promise<IgdbChain | null>` return).
- Single-flight pattern for concurrent first builds on the same `userId`.
- AUDIT.md section structure.
- Exact CLAUDE.md text rewrites per D-15/D-16 — user reviews via PR diff.
- Whether `__setChainForTest` becomes `__snapshotForTest` / `__restoreForTest` or a different naming under the new registry.

## Deferred Ideas

- FINDINGS Section C items → `.planning/codebase/CONCERNS.md` follow-up sweep.
- CronLock removal as a future cleanup (Phase 6 keeps + corrects framing per FINDINGS B6).
- Eager warming + LRU eviction if we ever scale beyond single-VPS.
- PROJECT.md / REQUIREMENTS.md broader framing review — out of scope for Phase 6.
