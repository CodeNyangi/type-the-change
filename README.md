# Type the Change

**Follow your Codex work. Learn from the code that changes.**

Choose a Codex task in the current project, read its latest request and progress, then select **Explore this task’s code** to open an actual edit with its original Codex context.

**VS Code shows the diff. Codex does the work. TTC connects the code to its original explanation and a short practice.**

[Install](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change) · [한국어](README.ko.md)

[![Editing and checking walkthrough](assets/quickstart.gif)](assets/type-the-change-quickstart.mp4)

[Watch the walkthrough](assets/type-the-change-quickstart.mp4) · This earlier recording demonstrates the optional imported-plan editing/checking flow. Version 0.7 starts with your existing Codex chats.

## Start

1. Open **Type the Change** in the right sidebar, or press **Cmd/Ctrl+Alt+T**.
2. Choose one of the project’s five recent Codex tasks. Use **More tasks** or **Other projects** when needed.
3. Read **Latest request** and **Codex progress**, then choose **Explore this task’s code**. No file selection is required.
4. Compare the edit in the native editor and read its original Codex context. **Original conversation** expands the transcript; **Try this change** is optional for short source edits.

Codex owns the agent, conversation, memory, plans, execution and worktrees. TTC has no model picker, independent login, request composer or agent loop. It never starts, resumes, steers or stops Codex work. **Continue in Codex** opens the original chat.

## Progress and changing worktrees

Saved chat history refreshes while this view is visible. It is paginated and only public messages, plans, command activity and file changes are displayed. Stored history is not treated as proof that an agent is currently running.

If Codex exposes an existing shared app-server connection, TTC reads its current status. Otherwise, **Connect live notifications** prepares official Codex lifecycle hooks. Review the settings, then review and trust the exact hook definitions with **`/hooks` in Codex** before continuing your original chat. Hook notifications contain event/time/directory metadata only and disappear when TTC closes. This notification relay supports macOS and Linux. Saved-history viewing does not require hooks.

Worktree linking uses the chat directory and observed activity, checked against Git's registered worktrees. Ambiguous locations require a choice. File lists and comparisons use native VS Code Source Control. Unrelated editor files stay out of learning without silently switching chats. Staged and unstaged diffs follow the exact documents open in the editor. Expand **Past Codex edits** to see history after a commit.

Learning captures a specific version. Later file changes or commits mark it stale without replacing it. Practice never rewinds or overwrites Codex's working file. Matching text is feedback, not proof of understanding or correctness.

## Settings

- **Settings · Help → Position** moves this view between sidebars and the bottom panel. VS Code remembers the layout.
- **Language** follows VS Code or selects Korean/English.
- **Codex location** selects an executable if automatic detection fails.
- `typeTheChange.codexSocket` optionally points to an existing shared Codex Unix socket. TTC does not start or reconfigure the owning server.
- Imported plans, optional MCP and the earlier editing/checking exercise remain available through the command palette.

**Preview · VS Code 1.106+ · Trusted local projects · Installed Codex required.** UTF-8 text comparisons support up to 1 MiB per file. Protected paths, symlinks and binary files are excluded. Remote/cloud worktrees are not mapped to unrelated local paths.

[Guide](docs/guide.md) · [Verification](docs/verification-0.7.2.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [MIT](LICENSE)

Maintainers: [code map](docs/architecture.md) · [versioning and releases](docs/marketplace.md). Published package hashes and source references are recorded in `releases/`.

Contribute through [issues](https://github.com/CodeNyangi/type-the-change/issues/new/choose). External PRs are not accepted; the repository owner performs the final review. [Contributing](CONTRIBUTING.md)
