# Guide

## Follow an existing chat

Open Type the Change with Cmd/Ctrl+Alt+T. Select a Codex chat by its original title; use the name filter or load older chats. The chat ID, not its title or current editor file, identifies the work. No new agent or duplicate conversation is created. Use **Continue in Codex** for new requests in the same chat.

**Conversation** shows public messages, plans, command activity and recorded file changes. Older records are loaded in pages. Command activity is collapsed until you choose to show it. The original chat remains in Codex; TTC holds only a bounded display cache in memory.

## Live status

TTC tries Codex's existing shared app-server connection first. With a shared connection, active/idle/approval status comes from that server. A history-only connection cannot know whether another Codex process is currently running a chat; the UI says **Saved history**. The last check time is in **Work details**.

On macOS/Linux, choose **Connect live notifications** to use official Codex lifecycle hooks. TTC shows the proposed settings diff and preserves other hooks. After adding them, **start Codex CLI in a terminal and enter `/hooks`**. Select an event and press Enter to inspect `Type the Change: observe Codex`. If it is already checked and shows `Trusted`, no further approval is needed. Otherwise inspect and trust the definitions, then continue the original chat. Codex skips untrusted hooks. This setup does not retroactively attach hooks to already-running work; they must be loaded by Codex. The next genuine event confirms the connection in TTC.

Notifications identify an observed event (request received, tool running/finished, approval requested, compaction, response finishing, interruption or session end). “Response finishing” does not claim a final outcome: other Codex hooks may continue the turn. Old events do not stay labeled as current activity. No hook adds context, creates a memory, approves actions, restarts work or sends a model request.

If your Codex installation exposes a custom shared Unix socket, set `typeTheChange.codexSocket`. TTC does not reconfigure or restart the owning Codex server. Windows can use saved-history viewing; the optional local notification relay is not available there.

## Inspect and learn

Open a change in **VS Code Source Control**. TTC’s **Code in view** follows the open file and the change section at your cursor. There is no second file picker in TTC. Files from a different worktree are identified; **Work details** shows the linked branch and directory and lets you choose a registered worktree.

Staged and unstaged comparisons use the exact two documents open in the editor. A regular source editor compares the last commit to current content, including unsaved text. The file must belong to the selected chat’s registered worktree.

TTC shows a short extract of existing Codex context or the original request. **Expand original conversation** reveals the full context. No new explanation is generated. **View change in editor** opens an immutable comparison; viewing a native SCM diff already satisfies this step.

For short replacements, **Try this change** opens a separate document. Use **Compare my code** to compare it with Codex’s text; expand the hint if needed. New files, deletions and large sections are not whole-file typing exercises. Practice never overwrites source, and matching text is not proof of behavior or understanding.

Expand **Past Codex edits** to find changes after a commit. The bounded search skips command-only history; **Load earlier edits** continues farther back. These patches reflect their original moment and may differ from current files.

Later edits keep the comparison pinned and show a notice. **Latest change** refreshes it. **File details → Open current file** locates the recorded section in today’s source. If it is missing or ambiguous, the file opens at the beginning. TTC performs no reset, checkout, commit or worktree creation.

## Position, language and optional plans

Use **Settings · Help → Position** for VS Code's native move-view picker. The default is the right sidebar; the host remembers later moves. **Settings · Help → Language** follows VS Code, Korean or English. Source and Codex messages are displayed in their original language.

The command palette retains **Open a Plan**, **Open MCP Plan**, **Practice Editing & Checking** and manual checking/review commands. These older imported-plan lessons ask you to edit source yourself and explicitly choose checks. They support UTF-8 source files up to 64 KiB and write a local review journal. They do not invoke a TTC agent. See [Privacy](../PRIVACY.md).

The [walkthrough video](../assets/type-the-change-quickstart.mp4) remains available and is labeled as an earlier UI.
