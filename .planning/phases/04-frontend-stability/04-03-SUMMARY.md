---
phase: 04-frontend-stability
plan: 03
subsystem: ui
tags: [react, radix, dropdown, shadcn, decomposition, icons, game-view, refactor]

requires:
  - phase: 01-settings-shell-konto
    provides: shadcn primitives wiring + Icon registry conventions
provides:
  - Radix-based dropdown-menu primitive (`components/ui/dropdown-menu.tsx`) wired via shadcn wrapper
  - 4-way decomposition of `pages/game-view.tsx` (669 → 151 LOC orchestrator + header + actions + fields)
  - Extended Icon registry: `disc`, `download`, `edit` (Icon.trash reused)
affects: [game-view, wishlist, future-action-dropdowns, future-game-view-tabs]

tech-stack:
  added: ["@radix-ui/react-dropdown-menu (shadcn wrapper)"]
  patterns:
    - "Hand-rolled click-outside dropdowns are replaced by Radix primitives via shadcn wrappers"
    - "Page-component decomposition: orchestrator file <=250 LOC + named child components per region"
    - "Inline SVG migration: all icons flow through Icon registry (16x16, stroke-1.4) via `svg()` factory"

key-files:
  created:
    - apps/client/src/components/ui/dropdown-menu.tsx
    - apps/client/src/components/game-view/game-view-header.tsx
    - apps/client/src/components/game-view/game-view-actions.tsx
    - apps/client/src/components/game-view/game-view-fields.tsx
    - apps/client/src/components/game-view/game-view-fields-grid.tsx
  modified:
    - apps/client/src/components/icons.tsx
    - apps/client/src/pages/game-view.tsx

key-decisions:
  - "Split `game-view-fields-grid.tsx` out as sibling instead of keeping FormatChip/FieldItem/SectionLabel inline — keeping them inline produced 419 LOC, breaching the FE-04 250 LOC cap. Sibling file keeps cohesion of the `<dl>` grid while honouring the cap."
  - "Pre-existing `alert('Failed to delete: ...')` in delete error path preserved as-is per plan §OUT OF SCOPE — toast migration deferred to v2."
  - "FormatChip migrated to Icon.disc/Icon.download (16x16 stroke-1.4) instead of carrying the prior inline 24x24 stroke-1.8 SVGs verbatim — accepted visual delta per Q4 in grill (registry consistency beats pixel-identical port)."

patterns-established:
  - "Pattern A: shadcn primitives replace hand-rolled UI affordances — Radix gives keyboard nav, focus management, ARIA roles, click-outside for free."
  - "Pattern B: page-component split — orchestrator owns state, mutations, layout shell; child components own region rendering + co-located effects (e.g. `notesRef` autosize lives with the Notes textarea)."
  - "Pattern C: when a region helper set pushes a file over the LOC cap, extract the entire region into a sibling file rather than inlining helpers."

requirements-completed: [FE-03, FE-04, FE-05]

duration: ~11m
completed: 2026-05-15
---

# Phase 04 / Plan 03 — game-view refactor

**ActionsDropdown replaced with Radix DropdownMenu (FE-03); `game-view.tsx` decomposed from 669 → 151 LOC across 4 components (FE-04); 4 inline SVGs migrated to Icon registry (FE-05).**

## Performance

- **Duration:** ~11 min (executor) + checkpoint review
- **Started:** 2026-05-15
- **Completed:** 2026-05-15
- **Tasks:** 6 implementation + 1 checkpoint (`human-verify`, approved with deferred browser UAT)
- **Files modified:** 2; **Files created:** 5

## Accomplishments
- Removed hand-rolled click-outside + keyboard nav from game-view by replacing `ActionsDropdown` with Radix-based `GameViewActions` (Tab/Arrow/Escape + `role="menu"` + focus return for free).
- Slimmed `apps/client/src/pages/game-view.tsx` from 669 → 151 LOC and split state-owning orchestrator from rendering children (`GameViewHeader`, `GameViewActions`, `GameViewFields` + extracted `GameViewFieldsGrid`).
- Removed all inline `<svg>` from `game-view.tsx` (now `grep -c '<svg' = 0`) by extending the `Icon` registry with `disc`, `download`, `edit` and reusing `Icon.trash`.

## Task Commits

1. **Task 1: Install shadcn dropdown-menu primitive** — `26639dd` (feat)
2. **Task 2: Add disc/download/edit icons** — `397eabf` (feat)
3. **Task 3: Create GameViewHeader** — `08ee83c` (feat)
4. **Task 4: Create GameViewActions (Radix dropdown)** — `fa4d250` (feat)
5. **Task 5: Create GameViewFields + GameDetailsGrid** — `aac2102` (feat)
6. **Task 6: Slim game-view.tsx to orchestrator** — `e8de208` (refactor)

## Files Created/Modified
- `apps/client/src/components/ui/dropdown-menu.tsx` — shadcn Radix wrapper (DropdownMenu, Trigger, Content, Item, Separator, …); 89 LOC.
- `apps/client/src/components/icons.tsx` — `disc`, `download`, `edit` entries appended.
- `apps/client/src/components/game-view/game-view-header.tsx` — stateless leaf (SidebarTrigger + breadcrumb + edit-mode CTAs); 77 LOC.
- `apps/client/src/components/game-view/game-view-actions.tsx` — wishlist "Move" + Radix dropdown (Edit/Delete); 81 LOC.
- `apps/client/src/components/game-view/game-view-fields.tsx` — left panel (cover/badges/format/UploadCoverButton) + Notes textarea + `notesRef` autosize; 211 LOC.
- `apps/client/src/components/game-view/game-view-fields-grid.tsx` — `<dl>` grid + `FormatChip` + `FieldItem` + `SectionLabel`; 241 LOC (Deviation #1).
- `apps/client/src/pages/game-view.tsx` — orchestrator (query + error gate + mutations + state + layout shell); 151 LOC (was 669).

## Decisions Made
- See `key-decisions` frontmatter — three calls captured (sibling-file extraction, alert preservation, FormatChip icon migration).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - LOC cap conflict] FormatChip/FieldItem/SectionLabel extracted to sibling file instead of inlining**
- **Found during:** Task 5
- **Issue:** Inlining the three helpers as planned produced a 419 LOC `game-view-fields.tsx`, breaching the FE-04 250 LOC cap (plan-stated `<done>` criterion).
- **Fix:** Extracted the entire `<dl>` grid + the three helpers into a sibling `apps/client/src/components/game-view/game-view-fields-grid.tsx` (241 LOC). `game-view-fields.tsx` now 211 LOC.
- **Files modified:** `game-view-fields.tsx`, `game-view-fields-grid.tsx`
- **Verification:** All four files <250 LOC; `<GameDetailsGrid>` consumed from `<GameViewFields>` only — no public-API impact.
- **Committed in:** `aac2102` (part of Task 5)

### Out-of-Scope items logged

- 8 pre-existing TSC errors in unrelated files (`add-game-modal.tsx`, `delete-confirm-dialog.tsx`, `games-mobile-list.tsx`, `wishlist*`) — logged to `.planning/phases/04-frontend-stability/deferred-items.md`. Verified clean on baseline HEAD `86219e4` before adding any plan files — none introduced by 04-03.

## Verification

### Automated (passed during executor run)
- `grep -c '<svg' apps/client/src/pages/game-view.tsx` → `0` ✓ (FE-05)
- `grep -c 'addEventListener.*mousedown' apps/client/src/pages/game-view.tsx` → `0` ✓ (FE-03)
- File LOC: orchestrator=151, header=77, actions=81, fields=211, fields-grid=241 — all <250 ✓ (FE-04)
- `bunx tsc --noEmit` on `apps/client` introduces zero new errors over baseline.

### Manual UAT (Task 7 checkpoint) — deferred
- Owner: pawel860@gmail.com — approved "defer browser UAT" at checkpoint.
- Full 25-point script lives in plan §how-to-verify (Task 7). Items to run post-merge:
  - **A. Owned game** — dropdown open/close, keyboard nav (Tab/Arrow/Escape/Enter), `role="menu"` inspection, edit→save, delete→AlertDialog→Cancel→focus return to trigger, `focus-visible:ring-1` outline.
  - **B. Wishlist** — Move-to-collection button + dropdown both visible; Move navigates to `/games/:id`.
  - **C. Visual parity** — covers/badges/format chip render identically. FormatChip stroke-weight delta from icon migration accepted.
  - **E. Build** — `bunx vite build` (sandbox blocked it for the executor; run on main after merge).
- If any scenario fails, open a gap-closure follow-up.

## SC mapping
- SC3 → FE-03 (Radix dropdown): met.
- SC4 → FE-04 (decomposition, all <250 LOC): met.
- SC5 → FE-05 (no inline SVG in game-view): met.
