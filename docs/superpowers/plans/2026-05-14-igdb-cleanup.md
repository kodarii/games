# IGDB Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase 2 (IGDB Integrations Panel) with post-merge UI polish — toggle requires a saved secret, label flips with state, RAWG/MobyGames placeholders stay commented, no incidental Biome reformat noise.

**Architecture:** Pure frontend tweak in two files. Run `bun run format` first to neutralize formatter noise, then apply two small JSX edits inside `IgdbIntegrationForm`, then commit. No backend, no new tests, no new components.

**Tech Stack:** React 18 + TypeScript + TanStack Query + shadcn `Switch` / `Tooltip` + Biome 1.9.4 (`lineWidth: 100`, single quotes, JSX double quotes, semicolons always, trailing commas all).

**Spec:** `docs/superpowers/specs/2026-05-14-igdb-cleanup-design.md`

**Pre-flight assumption:** working tree currently carries the uncommitted post-merge diff on `main` for these two files. If the tree was reset since the design was written, re-introduce the merit edits manually per Task 2 / Task 3 — the formatter pass in Task 1 still works either way.

---

## File Structure

**Modified:**
- `apps/client/src/components/settings/igdb-integration-card.tsx` — toggle gate (line 275) + label JSX (line 427-429)
- `apps/client/src/pages/settings/settings-page.tsx` — three commented-out blocks stay, formatter noise gone

**Not touched:**
- Hook `apps/client/src/hooks/use-igdb-integration.ts` — `data.enabled` is already strict `boolean` (confirmed at line 59), no fallback needed
- Backend, schemas, tests — out of scope

---

## Task 1: Normalize formatter state

**Files:**
- Modify: `apps/client/src/components/settings/igdb-integration-card.tsx`
- Modify: `apps/client/src/pages/settings/settings-page.tsx`

- [ ] **Step 1.1: Snapshot current diff for reference**

Run:
```bash
git diff apps/client/src/components/settings/igdb-integration-card.tsx \
        apps/client/src/pages/settings/settings-page.tsx > /tmp/igdb-cleanup-pre-format.diff
wc -l /tmp/igdb-cleanup-pre-format.diff
```
Expected: a non-empty file capturing the pre-format diff (useful for sanity if you need to compare later). Does not affect git state.

- [ ] **Step 1.2: Run Biome formatter on both files**

Run:
```bash
bun run format apps/client/src/components/settings/igdb-integration-card.tsx \
               apps/client/src/pages/settings/settings-page.tsx
```

`bun run format` resolves to `biome format --write .` per `package.json`. Pass the file paths to scope the write. If your `format` script does not accept paths, run the equivalent directly:

```bash
bunx biome format --write apps/client/src/components/settings/igdb-integration-card.tsx \
                          apps/client/src/pages/settings/settings-page.tsx
```

Expected: command exits 0. Biome rewrites the two files to canonical form (`lineWidth: 100`, single quotes, JSX double quotes, semicolons always, trailing commas all).

- [ ] **Step 1.3: Inspect the post-format diff**

Run:
```bash
git diff apps/client/src/pages/settings/settings-page.tsx
```

Expected: the only remaining changes in `settings-page.tsx` are:
1. The block-commented `<IntegrationCard … name="RAWG" … />` JSX
2. The block-commented `<IntegrationCard … name="MobyGames" … />` JSX
3. The block-commented `<DisabledWithTooltip variant="outline">Poproś</DisabledWithTooltip>` inside the dashed footer card

All the prior incidental wraps (Tooltip imports, `MiniBadge` JSX, `ProfileHeaderRow` destructuring, etc.) should have collapsed back to single lines because they are under 100 cols.

If unrelated wraps remain, manually revert them with `git checkout -p apps/client/src/pages/settings/settings-page.tsx`, accepting only the three comment-blocks above.

- [ ] **Step 1.4: Inspect the IGDB card diff**

Run:
```bash
git diff apps/client/src/components/settings/igdb-integration-card.tsx
```

Expected at this point: only the two pre-existing merit hunks remain:
- Line 275 area: `toggleDisabled = !hasStoredSecret` (was `!hasStoredSecret && !secretHasValue`)
- Line 427-429 area: label text reads `Włącz integrację` (was `Integracja włączona`)

Do not commit yet. Tasks 2 and 3 finalize these two hunks.

---

## Task 2: Confirm the toggle-gate change is correct

**Files:**
- Modify (no-op verify): `apps/client/src/components/settings/igdb-integration-card.tsx:275`

This task only verifies — the desired line is already in the working tree per Task 1's inspection. If for any reason it is missing, this task applies it.

- [ ] **Step 2.1: Verify the current toggle-gate line**

Run:
```bash
sed -n '273,277p' apps/client/src/components/settings/igdb-integration-card.tsx
```
Expected output (line numbers may shift slightly):
```
    }, [clientIdEditing]);

    const toggleDisabled = !hasStoredSecret;

    const saveDisabled =
```

If you instead see `const toggleDisabled = !hasStoredSecret && !secretHasValue;`, replace it.

- [ ] **Step 2.2: If missing, apply the change**

Edit `apps/client/src/components/settings/igdb-integration-card.tsx`, replace:
```ts
const toggleDisabled = !hasStoredSecret && !secretHasValue;
```
with:
```ts
const toggleDisabled = !hasStoredSecret;
```

Verify the existing tooltip constant matches the stricter semantic:
```bash
grep -n 'TOGGLE_DISABLED_TOOLTIP' apps/client/src/components/settings/igdb-integration-card.tsx
```
Expected: line 29 reads `const TOGGLE_DISABLED_TOOLTIP = 'Zapisz dane API, aby aktywować';` — no change needed.

No commit yet. Task 4 commits everything together.

---

## Task 3: Replace static label with state-aware label

**Files:**
- Modify: `apps/client/src/components/settings/igdb-integration-card.tsx:427-429`

- [ ] **Step 3.1: Inspect the current label block**

Run:
```bash
sed -n '425,433p' apps/client/src/components/settings/igdb-integration-card.tsx
```
Expected current state (after Task 1):
```tsx
        <div className="flex items-start justify-between gap-4 rounded-[8px] border border-apex-line-4 bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <div id={toggleLabelId} className="text-[13px] font-semibold text-apex-ink">
              Włącz integrację
            </div>
            <div id={toggleDescId} className="mt-0.5 text-[12px] text-apex-muted">
              Apex zapyta IGDB przy dodawaniu lub synchronizacji gier.
            </div>
          </div>
```

- [ ] **Step 3.2: Swap the static label for a state-aware ternary**

Edit `apps/client/src/components/settings/igdb-integration-card.tsx`. Replace:
```tsx
            <div id={toggleLabelId} className="text-[13px] font-semibold text-apex-ink">
              Włącz integrację
            </div>
```
with:
```tsx
            <div id={toggleLabelId} className="text-[13px] font-semibold text-apex-ink">
              {pendingEnabled ? 'Integracja włączona' : 'Integracja wyłączona'}
            </div>
```

Rationale: `pendingEnabled` is a `useState<boolean>` initialized from `data.enabled` (line 264). `data.enabled` is `boolean` strict (see `IgdbIntegrationStatusResponse` consumed by the hook — `apps/client/src/hooks/use-igdb-integration.ts:59` proves the cleared snapshot uses `enabled: false`). Therefore `pendingEnabled` is always `boolean`; no `?? false` fallback is required. The same flag drives the `<Switch checked={pendingEnabled} />` lower in the block, so label and switch stay in lockstep during optimistic updates.

- [ ] **Step 3.3: Re-run formatter to lock canonical formatting**

Run:
```bash
bunx biome format --write apps/client/src/components/settings/igdb-integration-card.tsx
```
Expected: exit 0. The new JSX line is under 100 cols, so no wrap should be introduced.

- [ ] **Step 3.4: Lint + typecheck**

Run:
```bash
bun run lint
```
Expected: exit 0. No new warnings introduced.

Run client typecheck:
```bash
cd apps/client && bunx tsc -b --noEmit
```
Expected: exit 0.

(Return to repo root afterwards: `cd ../..`.)

---

## Task 4: Manual smoke + commit

**Files:**
- Commit: both modified files

- [ ] **Step 4.1: Start dev stack**

In one terminal:
```bash
bun run dev
```
This boots the API on `:3001` and the Vite client on `:5173`. Wait until both report ready.

- [ ] **Step 4.2: Manual smoke checklist**

Open `http://localhost:5173/settings` (sign in if redirected).

Verify each of these:

1. The IGDB row shows. RAWG and MobyGames rows do **not** render.
2. The dashed "Więcej integracji wkrótce" footer card renders without the "Poproś" button on the right.
3. With **no saved secret** (e.g., a fresh DB, or after clicking "Usuń integrację"): the toggle switch is disabled. Hovering shows the tooltip "Zapisz dane API, aby aktywować".
4. Save valid Client ID + Client Secret. The toggle becomes enabled.
5. Flip the toggle ON. The label above the switch reads **"Integracja włączona"**.
6. Flip the toggle OFF. The label reads **"Integracja wyłączona"**.

If any of (1)-(6) fails, do not commit — investigate and fix.

- [ ] **Step 4.3: Stop dev stack**

Ctrl-C the `bun run dev` process.

- [ ] **Step 4.4: Stage and commit**

Run:
```bash
git add apps/client/src/components/settings/igdb-integration-card.tsx \
        apps/client/src/pages/settings/settings-page.tsx
git status
```
Expected: only those two files staged; no other modifications.

Run:
```bash
git commit -m "$(cat <<'EOF'
fix(igdb-integration): require saved credentials + dynamic toggle label

- Toggle on/off now requires a stored secret (not just a typed value)
- Toggle label flips between "włączona" / "wyłączona" with state
- Comment out RAWG / MobyGames placeholders + "Poproś" CTA

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
Expected: commit created on `main`, pre-commit hooks (if any) pass.

- [ ] **Step 4.5: Sanity check the commit**

Run:
```bash
git log --oneline -3
git show --stat HEAD
```
Expected: HEAD shows only the two file changes with a small line count (low double digits). If the stat is much larger than expected, the formatter noise sneaked back in — investigate before pushing.

---

## Done criteria

All four tasks complete + their acceptance steps green. The repo state after Task 4:

- `git status` clean.
- `git log -1 --format=%s` reads `fix(igdb-integration): require saved credentials + dynamic toggle label`.
- `bun run lint` passes.
- Manual smoke (Step 4.2) all six checks green.
