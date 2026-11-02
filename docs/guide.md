# Understand Codex changes

Choose a task. The picker starts with five recent tasks from this project and its linked worktrees. Expand older tasks or other projects explicitly.

If there is no explanation, select **Ask Codex to explain a change**. TTC copies a request and opens the original Codex chat. You must paste and send it. TTC never submits the message or runs another agent. Let active work finish before sending the request.

The existing Codex writes one concept, at most 12 lines per code excerpt and a short explanation of what changed and why. TTC reads only an explicit `ttc-lesson` card. Ordinary replies, setup instructions, logs and file metadata are never inferred to be lessons.

The explanation and changed code appear immediately. There is no question, answer selection or reveal step. Previous code stays collapsed until opened. Longer code lines wrap within the sidebar.

**Check the original edit** opens an immutable comparison. Source is never edited or rewound. Card excerpts must match a recorded edit in the same chat. Removed worktrees are supported only as historical patches with exact recorded absolute paths; their current filesystem is not read or opened. Unmatched cards stay hidden and can be checked again.

The explanation is bounded display state in memory. No duplicate conversation or learning memory is stored. The source card and agent work remain in Codex.

Use **Settings** for language, position and the Codex executable. Optional live notifications retain the existing configuration review and Codex CLI `/hooks` trust procedure. Reading cards does not require hooks.

Earlier imported plans, MCP, direct editing and checks remain optional command-palette workflows. See the [earlier walkthrough](../assets/type-the-change-quickstart.mp4) and [Privacy](../PRIVACY.md).
