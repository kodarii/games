---
name: run-plan
description: >
  Run a phased implementation plan autonomously by spawning a fresh typescript-principal-agent
  subagent per phase. Use when the user has a plan split across multiple `phase-*.md` (or
  `*-phase.md`, `01-*.md`, etc.) files in a directory and wants the plan executed end-to-end
  without manually launching an agent per phase. Each phase runs in an isolated context window
  so the main conversation does not degrade. Trigger when the user says "run plan", "wykonaj
  plan", "odpal fazy", "uruchom plan z katalogu X", "wykonaj plan z docs/plans/...", or invokes
  `/run-plan <path>`. Do NOT use to *write* a plan (that's `coding-plan-for-local-agents`), nor
  to run a single file (just spawn the agent directly).
---

# run-plan — orchestrate a phased plan across fresh subagents

You are the orchestrator. The user has a plan in a directory; each phase is its own markdown
file. Your job is to execute the phases **sequentially**, each in its own fresh subagent context,
**autonomously** until completion or first blocker, while feeding each phase the report from the
previous phase so it can build on what was done.

You do not write code yourself. You only coordinate.

## Arguments

The user invokes `/run-plan <path>` or asks naturally ("wykonaj plan z `docs/plans/igdb-enrichment/`").

- `<path>` is a directory containing the phase files. If the user gives a relative path, resolve
  it against the project root.
- If no path is given, ask: which directory holds the phases? Do not guess.

## Step 1 — Discover and order phases

1. `Glob` the directory for phase files. Try these patterns in order until one matches:
   - `**/phase-*.md`
   - `**/*-phase.md`
   - `**/[0-9][0-9]-*.md`
   - `**/[0-9]-*.md`
2. Sort results lexicographically — the user is expected to name phases so sorted order = run
   order (`phase-1.md`, `phase-2.md`, … or `01-foo.md`, `02-bar.md`, …).
3. If zero files match, list what's actually in the directory and ask the user which files are
   the phases.
4. If ambiguous (multiple patterns match different files), list the candidate ordering and ask
   the user to confirm before starting.
5. Read each phase file with `Read` so you can use a one-line summary in progress reports — do
   NOT paste the bodies into your context, they go directly into subagent prompts via file path
   reference.

## Step 2 — Create a task list

Use `TaskCreate` to register one task per phase, in order. Format: `"Phase N: <short title from
the phase file H1>"`. This gives the user visible progress without you re-summarising every turn.

## Step 3 — Run phases sequentially

For each phase, in order:

1. Mark its task `in_progress` via `TaskUpdate`.
2. Spawn a fresh subagent via the `Agent` tool with:
   - `subagent_type: "typescript-principal-agent"`
   - `description`: `"Execute phase N: <short title>"` (3-5 words)
   - `prompt`: the briefing template below
3. Wait for the subagent's report (foreground, not background — phases are sequential).
4. Parse the report:
   - **Success signal**: subagent says the phase is done, lists files changed, and (if the phase
     involved tests) reports tests green / typecheck green.
   - **Blocker signal**: subagent says it stopped, asks a question, hit a hard-constraint
     conflict, or reports a failure it couldn't resolve.
5. On success: mark task `completed`, store a short report digest (2-4 lines max) to feed into
   the next phase, then continue to phase N+1.
6. On blocker: **stop the loop**. Surface the subagent's report to the user verbatim, mark the
   current task back to `in_progress` (or note it's blocked), and ask how to proceed. Do not
   skip the phase. Do not retry silently.

### Subagent prompt template

Use this exact structure when spawning each phase's subagent. Inline the variables — never pass
literal `{{...}}` placeholders.

```
You are executing phase {{N}} of a {{TOTAL}}-phase plan.

## Your phase

Read and execute the plan at: {{ABSOLUTE_PATH_TO_PHASE_FILE}}

Follow it precisely. Apply all your hard constraints (no inline shell edits to code, no
@ts-ignore / any / eslint-disable, no error-swallowing try/catch, no speculative scope, TDD
red→green→refactor, DDD + vertical slice). Use Read/Edit/Write to change files — never sed,
node -e, heredoc-to-file, or any inline interpreter. Use Bash only for read-only checks
(bun test, tsc --noEmit, bun lint, git status/diff).

## Context from previous phases

{{PREVIOUS_REPORTS_OR_"This is the first phase."}}

## When you are done

Reply with a short structured report (≤200 words) in this exact shape:

  STATUS: success | blocker
  SUMMARY: <one sentence — what the phase delivered>
  FILES: <bullet list of files created/modified, with paths>
  CHECKS: <tests / typecheck / lint results, or "n/a" if phase had no executable code>
  NEXT-PHASE-NEEDS-TO-KNOW: <≤3 bullets — only the facts phase N+1 must know>
  BLOCKER: <only if STATUS=blocker — what stopped you and what you need from the user>

Do not include a diff. Do not include long explanations. Keep the report compact — it becomes
input to the next phase's context window.
```

For `PREVIOUS_REPORTS_OR_...`: include only the `SUMMARY` + `FILES` + `NEXT-PHASE-NEEDS-TO-KNOW`
lines from each prior phase's report, separated by `--- Phase N ---` headers. Drop everything
else. Cap total at ~30 lines — if it grows past that, keep only the last 2 phases plus a
1-line summary of older ones.

## Step 4 — Final report to the user

After the last phase completes successfully, output a single closing message:

- One sentence per phase (the `SUMMARY` line from each report).
- Total files changed (count, optionally a short list if ≤10).
- Any deferred follow-ups the subagents flagged.
- Suggest `git diff` / `git status` so the user can review before committing. Do not commit
  unless the user explicitly asks.

If the loop stopped on a blocker, the final message instead surfaces the blocker phase and the
subagent's `BLOCKER` text, and asks the user what to do (fix manually, re-run that phase with
extra context, edit the phase file, skip).

## Rules for the orchestrator (you)

- **Do not write or edit code yourself.** Your tools for files are limited to `Read` and `Glob`
  for discovery. Code changes are exclusively the subagent's job.
- **One phase = one fresh subagent.** Never reuse a subagent for two phases. Never send a phase
  to a generic agent — always `typescript-principal-agent`.
- **Do not inline phase file contents into your context.** Reference them by absolute path in
  the subagent prompt. The subagent reads them itself.
- **Sequential only, foreground.** No parallel phases — phase N+1 depends on phase N's report.
- **Do not retry silently.** If a phase reports a blocker, stop and ask. The user is in charge
  of recovery decisions.
- **Speak the user's language** (Polish if they wrote in Polish, English if English) in
  progress updates and the final report.
- **Keep your turn output short between phases.** Just: which phase finished, which is
  starting, one-line digest. The full reports stay inside subagent contexts.
