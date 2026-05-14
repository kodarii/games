# IGDB Cleanup — Design Spec

**Date:** 2026-05-14
**Owner:** Paweł Tkocz
**Status:** Approved for implementation
**Related milestone:** v1.0, Phase 2 (Integrations Panel — IGDB) post-merge polish

## Context

Phase 2 (Integrations Panel for IGDB) merged into `main` via commits `65fb9b9 igdb integration` and `4e7f179 Merge branch 'integration-tile'`. The working tree carries uncommitted post-merge tweaks in two files:

- `apps/client/src/components/settings/igdb-integration-card.tsx`
- `apps/client/src/pages/settings/settings-page.tsx`

The current diff mixes three intentional UX adjustments with ~12 lines of Biome-style reformat noise that does not correspond to lines exceeding the configured `lineWidth: 100`. This spec scopes a single tight commit that finalizes the polish, removes the formatting noise, and ships a state-aware toggle label.

## Goal

Close out Phase 2 with a clean, single-commit cleanup that:

1. Tightens the on/off toggle gate so it requires a persisted secret, not a transient input value.
2. Replaces the static toggle label with a state-aware ("Integracja włączona" / "Integracja wyłączona") variant that follows the optimistic-update flag.
3. Hides the RAWG and MobyGames placeholder integration cards plus the "Poproś" CTA in the dashed footer without deleting their source (user wants quick-restore later).
4. Lands a diff that contains only the changes above — no incidental reformat noise.

## Non-goals

- No backend changes (Phase 2 backend — save/clear/test integration, AES-GCM at-rest encryption — stays as merged).
- No React component test infrastructure. The codebase has no RTL/Vitest setup today; standing one up for ~10 lines of UI polish is yak-shaving. If we want behavior pinning, it belongs in a separate effort (Phase 4 already plans regression-pins for login/register).
- No formal Phase 2 verification against INT-01..INT-08 / SEC-07 success criteria. That is a separate `gsd-verify-work` / `gsd-audit-uat` step the user can run when ready.
- No physical deletion of the RAWG / MobyGames JSX blocks (explicit user decision — they stay commented out, accepting that this is unusual for the codebase).

## Changes

### `apps/client/src/components/settings/igdb-integration-card.tsx`

**Toggle gate tightened:**

```ts
const toggleDisabled = !hasStoredSecret;
```

Previously the toggle would also become enabled if the user merely typed something into the secret field (`!hasStoredSecret && !secretHasValue`). New behavior: the user must first save credentials before the integration can be turned on. The existing tooltip copy `'Zapisz dane API, aby aktywować'` (`TOGGLE_DISABLED_TOOLTIP`, line 29) already matches this stricter rule.

**State-aware label:**

```tsx
<div id={toggleLabelId} className="text-[13px] font-semibold text-apex-ink">
  {pendingEnabled ? 'Integracja włączona' : 'Integracja wyłączona'}
</div>
```

We bind to `pendingEnabled` (not `enabled`) for consistency with the `<Switch checked={pendingEnabled} />` two lines down — both render off the same optimistic flag, so the label and the switch stay in lockstep during in-flight toggles. The description copy below stays as-is.

**Defensive note:** if `pendingEnabled` could ever be `undefined`, fall back to `false` (`pendingEnabled ?? false`). Verify the hook contract during implementation.

### `apps/client/src/pages/settings/settings-page.tsx`

**Commented-out blocks kept commented:**

- `<IntegrationCard … name="RAWG" … />`
- `<IntegrationCard … name="MobyGames" … />`
- `<DisabledWithTooltip variant="outline">Poproś</DisabledWithTooltip>` inside the dashed "Więcej integracji wkrótce" footer

These remain as block comments per the user's explicit choice. The implementation must not delete them, nor remove the now-unused-by-render `IntegrationCard` / `IntegrationMark` / `DisabledWithTooltip` components — they may be re-enabled later.

**Reformat noise removed:**

Run `bun run format` against both files and accept whatever Biome (`lineWidth: 100`, `quoteStyle: single`, `jsxQuoteStyle: double`, semicolons always, trailing commas all) produces. Any wrap that Biome does not require (because the line is under 100 cols) should disappear, leaving the merit changes plus the two comment blocks as the entire diff.

## Execution algorithm

1. `bun run format apps/client/src/pages/settings/settings-page.tsx apps/client/src/components/settings/igdb-integration-card.tsx`
2. Inspect `git diff` — confirm noise is gone; only merit changes + commented blocks remain.
3. Edit `igdb-integration-card.tsx`: apply `toggleDisabled = !hasStoredSecret` and swap the label JSX to the ternary on `pendingEnabled` (with `?? false` fallback if the hook does not guarantee a boolean).
4. `bun run lint` — must pass.
5. Client typecheck (`tsc -b` inside `apps/client`, or repo-level equivalent if defined) — must pass.
6. Manual smoke in `bun run dev`:
   - Open `/settings`.
   - With no stored secret, attempt to flip the toggle → must stay disabled, tooltip explains why.
   - Save valid credentials, then toggle ON → label flips to "Integracja włączona".
   - Toggle OFF → label flips to "Integracja wyłączona".
   - RAWG / MobyGames cards do not render. The footer dashed card renders without the "Poproś" button.
7. Commit:
   ```
   fix(igdb-integration): require saved credentials + dynamic toggle label

   - Toggle on/off now requires a stored secret (not just a typed value)
   - Toggle label flips between "włączona" / "wyłączona" with state
   - Comment out RAWG / MobyGames placeholders + "Poproś" CTA
   ```

## Risks

- **`pendingEnabled` typing.** If the hook (`use-igdb-integration`) ever returns `undefined`, the ternary still works (falsy → "wyłączona"), but TypeScript may complain depending on the inferred shape. Verify during step 3; if needed, add `?? false`.
- **Biome diff explosion.** If running `bun run format` reformats more than expected (e.g., because the working copy was edited under a different formatter), the diff grows. Mitigation: if the noise is large, manually revert the unrelated wraps with `git checkout -p` rather than fighting the formatter.
- **Commented-out blocks drift.** Keeping `IntegrationCard` / `MiniBadge` / `DisabledWithTooltip` in the module without an active caller risks them rotting (type signature changes, unused-import warnings). Accepted risk — user prefers quick-restore. If lint flags unused imports, scope a follow-up to disable that specific rule on these lines rather than deleting the placeholders.

## Acceptance criteria

1. `git diff` against `main` for `igdb-integration-card.tsx` shows only the `toggleDisabled` change and the state-aware label JSX (plus any Biome-mandated formatting).
2. `git diff` against `main` for `settings-page.tsx` shows only the three commented-out blocks (RAWG card, MobyGames card, "Poproś" button) and Biome-mandated formatting — no incidental wraps.
3. `bun run lint` passes.
4. Client typecheck passes.
5. Manual smoke in step 6 above succeeds for all five assertions.
6. One commit with the message above is on `main` (or whatever branch the user chooses to commit on).
