# Changelog

## 0.8.0 — 2026-11-02

- Replace transcript and file-oriented learning with one explicit Codex-authored learning card: the reason for a change and its key code, visible immediately without a quiz.
- Never turn ordinary requests, operational replies, logs or arbitrary patches into lessons.
- Support older cards without retaining their quiz fields, and wrap dedented code within narrow sidebars.
- Match card code to an actual recorded edit in the same chat before displaying it, including immutable historical worktree snapshots.
- Copy a bounded learning-card request and open the original Codex chat; TTC does not send it, start an agent or create a memory store.
- Keep project task selection to five recent tasks. Remove transcript, branch, timestamp and edit inventories from the learner screen and its payload.
- Align native CI and the optional walkthrough recorder with the current entry points; keep imported-plan errors separate from Codex connection errors.
- Normalize Windows review paths, reject generated/test artifacts with either path separator, and create native-check report directories on clean CI runners.
- Preserve the optional editing guide's frame between source steps instead of briefly recreating the task screen.

## 0.7.2 — 2026-11-02

- Start with five recent Codex tasks for the current project; expand or search other projects on demand.
- Show a compact latest request and Codex progress, with the original transcript collapsed and rendered only when opened.
- Open an actual source edit from the selected task with one action; skip generated artifacts, tests and prose when choosing code to study.
- Hide unrelated editor files from learning, retrieve context near the specific edit and clean escaped text/link-only excerpts.
- Keep short code practice optional; documentation changes are not typing exercises.

## 0.7.1 — 2026-11-02

- Remove unused independent ChatGPT login, model inference and account-lock code; retain Codex as the only agent owner.
- Align English/Korean listing, optional lesson help, and Marketplace maintenance documentation with the observer workflow.
- Add clean-source release checks, exact version/locale validation, tested-bundle and VSIX allowlist checks, and public-package hash recording.
- Run companion rendering and native staged/unstaged editor checks in CI; derive the minimum VS Code test version from the manifest.
- Preserve existing Git history, record the 0.7.0 source snapshot, and distinguish older artifact-only releases from source-tagged releases.

## 0.7.0 — 2026-11-02

- Follow existing Codex chats through paginated read-only APIs; remove TTC agent execution, independent requests, model selection and login from the extension.
- Distinguish saved history from live runtime status. Support an existing shared Codex server and optional trusted Codex lifecycle notifications, with no conversation-memory store.
- Link activity to registered worktrees; require a choice for ambiguous locations. Compare committed/working/unsaved bytes and keep recorded Codex edits accessible after commits.
- Follow the native editor and SCM comparison without duplicating the local file list. Keep staged and unstaged comparison scopes distinct.
- Show a short attributed Codex excerpt and one next action; collapse full context and metadata. Limit practice to small replacements.
- Find recorded edits when history is expanded, past command-only activity; keep bounded edit browsing separate from live activity so long-running chats remain useful for learning.
- Keep learning snapshots stable as work changes. Open immutable diffs and separate untitled practice documents without overwriting the source.
- Keep the movable right-sidebar default, Korean/English UI, existing walkthrough media and optional imported-plan workflow.


## 0.6.1 — 2026-11-02 (published preview)

- Default to the Secondary Side Bar and add a visible Move view action. Native drag-and-drop and saved view locations remain available. Requires VS Code 1.106+.
- Keep chat and learning in one movable view beside the code, with Chat / Learn switching that preserves the learning step.
- Remove the welcome heading and example prompt buttons.
- Restore the walkthrough and animated preview in both Marketplace introductions, labelled as an earlier-UI recording.
- Add a read-only worktree overview with bounded automatic refresh, unsaved edits, real conflicts, overlapping paths, native diffs, and on-demand Codex explanations.
- Pin conversations to their worktree and invalidate learning decisions when their baseline commit changes. Preserve draft notes across view moves only for the same reviewed code.

## 0.6.0 — 2026-11-02 (preview)

- Use installed Codex app-server as the background agent: project search, managed sign-in, models, conversation state and streamed messages belong to Codex.
- Keep the learning workflow inside the extension: validated change locations, explanations, manual editing, checks and human decisions.
- Replace the empty launcher with an actual sidebar composer; remove required file selection and automatic current-file attachment.
- Accept normal questions, show progress incrementally, preserve partial answers on cancellation, and remove the aggregate 1 MiB event limit.
- Add Korean/English UI selection and native command localization.
- Verify one real signed-in Codex learning turn against an ephemeral, read-only fixture.

## 0.5.0 — a simpler first change (local preview)

- Add a left activity-bar entry and in-panel help. Explain browser registration, ChatGPT plan permission, and returning to VS Code before and during connection.
- Prepare the current source file automatically, show what will be sent, and keep manual multi-file choices until explicitly reset.
- Separate the model catalog size bound from generated-plan limits; load metadata-rich catalogs and offer a direct retry beside the draft.
- Start with an offline task-list example, one useful edit, and four real checks. Keep the advanced counterexample as a separate exercise.
- Use the original request as the first expected outcome, avoiding duplicate input. Human review and keep/reject decisions remain explicit.


## 0.4.0 — keyboard workflow and a clear entry point (preview)

- Open from the editor title icon or Cmd/Ctrl+Alt+T. Add a visible walkthrough link, concise extension-page instructions, and English/Korean main controls.
- Wait for both workbench and webview focus before accepting input; cancel stale focus requests.
- Use a deliberately wrong built-in practice suggestion and an English video that starts from the icon.
- Continue from prediction to source editing, explicit Save and Check, diff and human decision using keyboard controls. Continuing or passing a task never adopts a proposal.
- Reuse a selected existing VS Code task, keep its terminal hidden, show exit status and available diagnostics beside the code, and support cancellation. Save only reviewed files; mark changed-code evidence stale.
- Use open files and Git changes as initial file choices. Search only after typing, cap each query at 200 paths, cancel stale requests and preserve selections across searches.
- Add a built-in offline demo check and a configured task for the public counterexample. Update the tutorial to the integrated keyboard workflow.
- Keep the existing eight-file / 64 KiB context bounds. Whole-repository impact analysis and automatic test selection are not claimed.

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
