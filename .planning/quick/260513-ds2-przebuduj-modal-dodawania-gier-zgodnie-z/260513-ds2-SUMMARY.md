---
phase: 260513-ds2
plan: 01
subsystem: client/add-game-modal
tags: [client, ui, refactor, igdb, wishlist]
requires: []
provides:
  - DS2-01 # Unified AddGameModal with mode=collection|wishlist
  - DS2-02 # Inline IGDB autocomplete (no 2-step flow)
  - DS2-03 # Wishlist parity (cover color + IGDB metadata)
  - DS2-04 # Visual parity with v6.html (header badge, footer hint, sizing)
affects:
  - apps/client/src/components/layout/app-layout.tsx
tech-stack:
  added: []
  patterns: [discriminated-mode-prop, derived-state-no-effect, debounced-query]
key-files:
  created:
    - apps/client/src/components/add-game-modal.tsx
    - apps/client/src/components/title-autocomplete.tsx
    - apps/client/src/components/add-game-modal.test.tsx
  modified:
    - apps/client/src/hooks/use-add-game-with-metadata.ts
    - apps/client/src/components/cover-color-picker.tsx
    - apps/client/src/components/layout/app-layout.tsx
  removed:
    - apps/client/src/components/add-game-dialog.tsx
    - apps/client/src/components/add-wishlist-dialog.tsx
decisions:
  - Single mutation (useCreateGameMutation) for both collection + wishlist — backend already accepts the full payload on the kind:'wishlist' branch.
  - Derived selectedCandidate via title-equality (no effect-based clearing) avoids the candidate-pick race where setTitle would clear the just-set providerId.
  - Tests are source-regression (grep-based), matching protected-route.test.tsx, because the client test stack has no RTL/jsdom and the plan forbids adding new dev deps.
  - CoverColorPicker gains a size?: 'sm' | 'md' prop (default 'md' = 26x26 rounded-7); legacy 22x22 stays available for any caller that needs it.
metrics:
  duration_min: 12
  completed: 2026-05-13
---

# Phase 260513-ds2 Plan 01: Unified AddGameModal Summary

One-liner: Consolidates AddGameDialog and AddWishlistDialog into a single AddGameModal with inline IGDB autocomplete and full wishlist parity (cover color + metadata persistence) — no backend changes.

## What changed

- **Hook contract (`use-add-game-with-metadata.ts`)** — generalized to take
  `{ mode: 'collection' | 'wishlist', initialPlatform }`. Dropped `step`,
  `goStep1`, `goStep2`, and the `withMatch` argument on `submit`. Added a
  250 ms debounce so `debouncedTitle` (not `title`) drives the IGDB candidates
  query, and a new `selectCandidate(c)` helper that sets title + providerId
  atomically. `selectedCandidate` is now a derived value that returns null
  unless the typed title still matches the picked candidate — no more
  effect-based race.

- **New `title-autocomplete.tsx`** — self-contained input with left lupe
  icon, MATCHED · IGDB pill, inline dropdown (rendered absolutely below
  the input), keyboard nav (↑↓ navigate, Enter selects, Esc closes only the
  dropdown via `stopPropagation`), and `onMouseDown` row selection (defeats
  the `onBlur`-races-`onClick` problem).

- **New `add-game-modal.tsx`** — single mounted modal supporting both modes.
  Header carries a 34×34 rounded-8 icon-badge with the live cover color and
  a white gamepad icon. Body is Platform → Title → Cover color. Footer has
  a light-grey background, info-circle hint copy and a dynamic CTA
  (`Add game` / `Add to wishlist`). Overlay click is intercepted via
  `onPointerDownOutside` + `onInteractOutside`. Mode + open are derived from
  `useLocation().pathname` (`/games` vs `/wishlist`).

- **Cover-color picker** — swatches default to 26×26 rounded-7 with gap-8;
  opt-in `size='sm'` recreates the old 22×22 rounded-5 / gap-6 for any
  caller that needs the legacy density. No call site currently opts back to
  `'sm'`, so `game-form.tsx` and `game-view.tsx` get the new visual density
  automatically — consistent with the v6.html design.

- **AppLayout** — replaces two mounts (`AddGameDialog`, `AddWishlistDialog`)
  with a single `<AddGameModal />`. Both old dialog files deleted from disk.

## Test coverage added

`apps/client/src/components/add-game-modal.test.tsx` — 12 regression
assertions, all passing:

1. Field order Platform → Title → Cover color (positional substring
   comparison).
2. TitleAutocomplete is wired and pick fires `selectCandidate`.
3. Manual submit produces `{kind, title, platform, coverColor, format,
   status?}` only — no `metadataRef` / `coverImage` / `releaseYear` /
   `developer`.
4. Enriched submit (after candidate pick) spreads
   `metadataRef: {providerName:'igdb', providerId}`, `coverImage`,
   `releaseYear`, `developer`.
5. Wishlist mode derivation, CTA copy, redirect prefix; only
   `useCreateGameMutation` is used.
6. Esc default Radix behaviour preserved (no `onEscapeKeyDown.preventDefault`
   on Content); autocomplete swallows Esc only when its dropdown is open.
7. Overlay click intercepted (`onPointerDownOutside` +
   `onInteractOutside`).
8. Header 34×34 rounded-8 icon-badge with live cover color + `Icon.gamepad`.
9. Footer light-grey bg, info-circle, Cancel, dynamic CTA.
10. AppLayout mounts exactly one AddGameModal and no legacy dialogs.
11. Hook contract: no `step` / `goStep1` / `goStep2` / `withMatch` residue.
12. 250 ms title debounce drives the candidates query.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Refactor hook + extract TitleAutocomplete + bump swatch size | `0056f0e` |
| 2 | Add unified AddGameModal (collection + wishlist modes) | `77baab5` |
| 3 | Swap mount, delete legacy dialogs, add regression tests | `b993b8a` |

## Verification

- `bun test apps/client/src/components/add-game-modal.test.tsx` → 12 pass.
- `bun test apps/client` → 40 pass (all 4 client test files green).
- `bun test` (repo-wide): 391 pass / 36 fail — fewer failures than the
  baseline 390/37 because one pre-existing fail incidentally flipped green;
  every remaining failure is in API code we never touched (see
  `deferred-items.md`).
- `bun run lint`: 43 errors / 7 warnings — all in two API files we never
  touched; pre-existing on the base branch (47/7), the four-error drop is
  incidental.

Backend file `apps/api/src/application/games/create-game.ts` was read for
schema verification (lines 53-72: `WishlistSchema` already accepts
`coverColor`, `coverImage`, `releaseYear`, `developer`, `metadataRef`) and
is unchanged on disk.

## Deviations from Plan

### 1. [Rule 1 — Bug] Candidate-pick race

**Found during:** Task 2.

**Issue:** The plan instructed an effect-based `setSelectedProviderId(null)`
on every title change. That would race with the candidate-pick handler:
calling `setTitle(c.title)` triggers the title-effect which clears
`selectedProviderId` on the next render — wiping the MATCHED pill that the
same click was supposed to install.

**Fix:** Replaced the effect with a derived check: `selectedCandidate`
returns the picked candidate ONLY when
`pickedCandidate.title.trim() === title.trim()`. Editing the input afterward
re-derives to `null` and the pill disappears — same UX, no race. Added a
matching `selectCandidate(c)` helper on the hook that the modal calls from
its `onCandidatePick`.

**Files modified:** `apps/client/src/hooks/use-add-game-with-metadata.ts`,
`apps/client/src/components/add-game-modal.tsx`.

**Commit:** `77baab5`.

### 2. [Rule 3 — Blocking] Test stack: no RTL/jsdom

**Found during:** Task 3.

**Issue:** The plan asked for behavioural tests using React Testing Library
+ jsdom + `mock.module('@/lib/queries', ...)`. Neither library is installed
in `apps/client/package.json` and the plan explicitly forbids adding new
dev dependencies. The existing client test, `protected-route.test.tsx`,
uses a source-grep regression pattern that ships with `bun:test` only.

**Fix:** Wrote 12 source-regression assertions matching the existing
pattern, covering all 7 scenarios listed in the plan plus 5 extra
structural invariants (icon-badge, footer, hook contract, debounce, layout
mount). All pass; the manual UAT in `<verification>` covers the
visual/keyboard nuances that source-grep cannot.

**Files modified:** `apps/client/src/components/add-game-modal.test.tsx`.

**Commit:** `b993b8a`.

### 3. [Rule 2 — Critical] CoverColorPicker size prop (backwards-compat path)

**Found during:** Task 1.

**Issue:** The plan said "if any caller expects 22 px specifically, leave it
alone and instead introduce a `size?: 'sm' | 'md'` prop". The grep showed
three callers (`game-form.tsx`, `game-view.tsx`, `add-game-modal.tsx`); none
of them pin a size, so bumping the default would affect all of them.

**Fix:** Introduced `size?: 'sm' | 'md'` with default `'md' = 26 × 26
rounded-7 gap-8` per the v6.html spec. Legacy `'sm' = 22 × 22 rounded-5
gap-6` remains as an opt-in. No caller currently opts back to `'sm'`, so
`game-form.tsx` and `game-view.tsx` adopt the new density automatically —
this is consistent with the v6.html design direction.

**Files modified:** `apps/client/src/components/cover-color-picker.tsx`.

**Commit:** `0056f0e`.

## Authentication Gates

None.

## Known Stubs

None.

## Self-Check: PASSED

- Created files exist:
  - `apps/client/src/components/add-game-modal.tsx` — FOUND
  - `apps/client/src/components/title-autocomplete.tsx` — FOUND
  - `apps/client/src/components/add-game-modal.test.tsx` — FOUND
- Modified files exist:
  - `apps/client/src/hooks/use-add-game-with-metadata.ts` — FOUND
  - `apps/client/src/components/cover-color-picker.tsx` — FOUND
  - `apps/client/src/components/layout/app-layout.tsx` — FOUND
- Removed files absent:
  - `apps/client/src/components/add-game-dialog.tsx` — MISSING (correct)
  - `apps/client/src/components/add-wishlist-dialog.tsx` — MISSING (correct)
- Preserved (per plan): `apps/client/src/components/metadata-match-picker.tsx`
  — FOUND (still used by `rematch-button.tsx`).
- Commits exist: `0056f0e`, `77baab5`, `b993b8a` — all FOUND in
  `git log --oneline`.
