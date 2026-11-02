# Type the Change

**Follow your Codex work. Learn from the code that changes.**

Open a change in VS Code Source Control and TTC follows the code in your editor. Read its related Codex conversation, then try a short change in a separate document.

[Install](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change) · [한국어](README.ko.md)

[![Editing and checking walkthrough](assets/quickstart.gif)](assets/type-the-change-quickstart.mp4)

[Watch the walkthrough](assets/type-the-change-quickstart.mp4) · This earlier recording demonstrates the optional imported-plan editing/checking flow. Version 0.7 starts with your existing Codex chats.

## Start

1. Open **Type the Change** in the right sidebar, or press **Cmd/Ctrl+Alt+T**.
2. Select an existing **Codex chat**. Continue requests and conversation in that original chat.
3. Open a change in **VS Code Source Control**. TTC’s **Code in view** follows the file and comparison section.
4. Read the related Codex context. For short changes, **Try this change** opens a separate practice document.

Codex owns the agent, conversation, memory, plans, execution and worktrees. TTC has no model picker, independent login, request composer or agent loop. It never starts, resumes, steers or stops Codex work. **Continue in Codex** opens the original chat.

## Progress and changing worktrees

Saved chat history refreshes while this view is visible. It is paginated and only public messages, plans, command activity and file changes are displayed. Stored history is not treated as proof that an agent is currently running.

If Codex exposes an existing shared app-server connection, TTC reads its current status. Otherwise, **Connect live notifications** prepares official Codex lifecycle hooks. Review the settings, then review and trust the exact hook definitions with **`/hooks` in Codex** before continuing your original chat. Hook notifications contain event/time/directory metadata only and disappear when TTC closes. This notification relay supports macOS and Linux. Saved-history viewing does not require hooks.

Worktree linking uses the chat directory and observed activity, checked against Git's registered worktrees. Ambiguous locations require a choice. File lists and comparisons use native VS Code Source Control. A file from another worktree is identified without silently switching chats. Staged and unstaged diffs follow the exact documents open in the editor. Expand **Past Codex edits** to see history after a commit.

Learning captures a specific version. Later file changes or commits mark it stale without replacing it. Practice never rewinds or overwrites Codex's working file. Matching text is feedback, not proof of understanding or correctness.

## Settings

- **Settings · Help → Position** moves this view between sidebars and the bottom panel. VS Code remembers the layout.
- **Language** follows VS Code or selects Korean/English.
- **Codex location** selects an executable if automatic detection fails.
- `typeTheChange.codexSocket` optionally points to an existing shared Codex Unix socket. TTC does not start or reconfigure the owning server.
- Imported plans, optional MCP and the earlier editing/checking exercise remain available through the command palette.

**Preview · VS Code 1.106+ · Trusted local projects · Installed Codex required.** UTF-8 text comparisons support up to 1 MiB per file. Protected paths, symlinks and binary files are excluded. Remote/cloud worktrees are not mapped to unrelated local paths.

[Guide](docs/guide.md) · [Verification](docs/verification-0.7.0.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [MIT](LICENSE)

Contribute through [issues](https://github.com/CodeNyangi/type-the-change/issues/new/choose). External PRs are not accepted; the repository owner performs the final review. [Contributing](CONTRIBUTING.md)
