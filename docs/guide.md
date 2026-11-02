# Guide

## Follow an existing chat

Open Type the Change with Cmd/Ctrl+Alt+T. The picker starts with five recent tasks from the current project and its registered worktrees. Expand **More tasks** or choose **Other projects** when needed.

Select a task to read **Latest request** and **Codex progress**. **Explore this task’s code** finds an actual source edit and opens it in the editor. Generated artifacts, tests and prose are excluded from the default selection. History searches are bounded; an empty result is reported explicitly.

The transcript is rendered only when **Original conversation** is expanded. Use **Codex ↗** for new requests in the original chat. TTC creates no agent or duplicate conversation.

## Live status

TTC tries Codex's existing shared app-server connection first. With a shared connection, active/idle/approval status comes from that server. A history-only connection cannot know whether another Codex process is currently running a chat; the UI says **Saved history**. The last check time is in **Work details**.

On macOS/Linux, choose **Connect live notifications** to use official Codex lifecycle hooks. TTC shows the proposed settings diff and preserves other hooks. After adding them, **start Codex CLI in a terminal and enter `/hooks`**. Select an event and press Enter to inspect `Type the Change: observe Codex`. If it is already checked and shows `Trusted`, no further approval is needed. Otherwise inspect and trust the definitions, then continue the original chat. Codex skips untrusted hooks. This setup does not retroactively attach hooks to already-running work; they must be loaded by Codex. The next genuine event confirms the connection in TTC.

Notifications identify an observed event (request received, tool running/finished, approval requested, compaction, response finishing, interruption or session end). “Response finishing” does not claim a final outcome: other Codex hooks may continue the turn. Old events do not stay labeled as current activity. No hook adds context, creates a memory, approves actions, restarts work or sends a model request.

If your Codex installation exposes a custom shared Unix socket, set `typeTheChange.codexSocket`. TTC does not reconfigure or restart the owning Codex server. Windows can use saved-history viewing; the optional local notification relay is not available there.

## Inspect and learn

Start with **Explore this task’s code**. If a native Source Control comparison is already open, **Understand the change** follows only files linked to the selected task. Unrelated editor files are not promoted as lessons; **Work details** shows the linked branch and directory and lets you choose a registered worktree.

Staged and unstaged comparisons use the exact two documents open in the editor. A regular source editor compares the last commit to current content, including unsaved text. The file must belong to the selected chat’s registered worktree.

TTC shows a short extract from messages near the specific edit or its original request. This is attributed original context, not a generated explanation of the code. **Expand original conversation** reveals the full context. No new explanation is generated. **View change in editor** opens an immutable comparison; viewing a native SCM diff already satisfies this step.

For short source-code replacements, the optional **Try this change** opens a separate document. Use **Compare my code** to compare it with Codex’s text; expand the hint if needed. New files, deletions and large sections are not whole-file typing exercises. Practice never overwrites source, and matching text is not proof of behavior or understanding.

Expand **Past Codex edits** to find changes after a commit. The bounded search skips command-only history; **Load earlier edits** continues farther back. These patches reflect their original moment and may differ from current files.

Later edits keep the comparison pinned and show a notice. **Latest change** refreshes it. **File details → Open current file** locates the recorded section in today’s source. If it is missing or ambiguous, the file opens at the beginning. TTC performs no reset, checkout, commit or worktree creation.

## Position, language and optional plans

Use **Settings · Help → Position** for VS Code's native move-view picker. The default is the right sidebar; the host remembers later moves. **Settings · Help → Language** follows VS Code, Korean or English. Source and Codex messages are displayed in their original language.

The command palette retains **Open a Plan**, **Open MCP Plan**, **Practice Editing & Checking** and manual checking/review commands. These older imported-plan lessons ask you to edit source yourself and explicitly choose checks. They support UTF-8 source files up to 64 KiB and write a local review journal. They do not invoke a TTC agent. See [Privacy](../PRIVACY.md).

The [walkthrough video](../assets/type-the-change-quickstart.mp4) remains available and is labeled as an earlier UI.
