# Changelog

## 0.3.0 — judgment workflow (review build)

- Predict an outcome before revealing a proposal. Compare the actual buffer, record evidence, and explicitly keep, reject, or defer.
- Accept alternative code within the guided range; matching text alone never completes a step. Invalidate evidence after code changes and request a new plan if a later anchor no longer fits.
- Keep bounded, local decision notes; expose decision metadata through MCP without returning freeform notes. No automatic source edits, saves, or test execution.
- Add a minimal prompt-and-cursor icon, a deliberately wrong practice proposal, and a captioned walkthrough recorded in real VS Code on a remote virtual display.
- Retry transient account-lock inspection denial within the original deadline; persistent denial keeps the live owner intact and fails closed.
- Expand local coverage to 168 tests and 162 headless layouts. Exact remote results are recorded in the [verification report](docs/judgment-workflow-0.3.0.md).

### Included audit fixes

- Show the change goal before the proposed answer. Keep proposals closed until requested, expose one primary action per state, and allow original/current comparison throughout the session. Ending guidance keeps edits.
- Replace the demo with a `return` versus `continue` example, including transfer inputs; distinguish exact text agreement from correct behavior and learning.
- Expand the headless matrix to 108 layouts, including hidden/revealed proposals, editing, matching and deletion help.
- Keep the native editor and guide visibly side by side when starting from an empty workbench; show a Korean recovery instruction for invalid JSON imports.
- Reject oversized intermediate files and conflicting physical-file aliases before accepting guidance; preserve reviewed completion when unchanged documents reload.
- Serialize account operations across local extension hosts and recover all documented terminal refresh-token errors without erasing newer credentials.
- Add 72 headless layout cases, ten real VS Code UI flow groups on a remote virtual display, minimum-version host coverage and Windows core checks. See `docs/background-verification-2026-11-01.md`.
- Pin VSCE's minimatch dependency to patched 11.0.1 with an unchanged packaged file list.

- Cancel demo/import/MCP preparation without reopening a stopped typing session.
- Use UUID URNs for new ChatGPT registrations while preserving already-issued host bindings.
- Treat terminal model output as authoritative; never revive a discarded or refused streamed draft.
- Allow first-request model selection, show review when outside edits block progress, and ignore IME composition shortcuts.
- Restore the reconnect control after revoked ChatGPT credentials, with a clear Korean recovery message.
- Show a short first-edit instruction and a compact selected-file count; open a new request from the command palette without losing editor changes.
- Select files across directories in one searchable checklist, preserving existing selections and allowing deselection.
- Revalidate removed workspace roots before sending code, and refresh closed/reopened documents before accepting a typing step.
- Bound imported JSON reads before allocation and during file growth, with clear local-file errors.
- Keep preview state through theme changes, honor CSP and high-contrast button borders, and expand editor/DOM/auth regression coverage.
- Native editor typing also passes on the unlocked Mac. See `docs/audit-2026-11-01.md` for performed checks and remaining interactive/live-account limits.

## 0.2.0 — 2026-11-01 (preview)

- One request composer inside VS Code; remembered model choice and no extra welcome confirmation dialog.
- Fewer repeated labels, one location control, a visible deletion state, and focus restored after completion or ending.
- Original/current code review after typing, including a file chooser for multi-file changes.
- Cancelled login/model/inference operations stop quietly; terminal model output no longer waits for connection closure.
- Fixes for exact MCP notification workspace, non-regular source files, stale diff baselines, and untouched selection restoration.
- Expanded DOM, OAuth, inference, MCP and native editor coverage. Live account and pixel-level UI checks remain separate.

## 0.1.0 — 2026-11-01 (preview)

- Native VS Code typing with an adjacent proposal, precise range selection, calm comparison, and keyboard continuation.
- Exact sequential plans with stale-range and previously edited file checks.
- A local stdio MCP bridge for reading files, proposing plans, and reading dated progress.
- Official ChatGPT subscription sign-in and streamed plan-generation implementation; live account verification is pending.
- A sign-in-free demo, JSON import, unit/security tests, and real editor integration tests.
