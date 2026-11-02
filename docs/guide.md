# Understand Codex changes

Choose a task. The picker starts with five recent tasks from this project and its linked worktrees. Expand older tasks or other projects explicitly.

If there is no explanation, select **Ask Codex to explain a change**. TTC uses the official `codex queue --thread … --message … --resume` command to deliver one request to that exact existing chat. Active work keeps its Codex owner. The panel shows sending, queued, unsupported, failed or uncertain delivery; duplicate clicks are blocked. Nothing is sent by merely opening or refreshing TTC. If delivery is uncertain, check the original chat rather than resending.

The existing Codex writes one concept, at most 12 lines per code excerpt and a short explanation of what changed and why. TTC validates a `ttc-lesson` card against the original edit. Existing prose may also be shown as labelled context only if it explicitly names the exact file, immediately precedes that edit in the same turn and belongs to a registered worktree. It is not presented as an inferred explanation of a specific line. Setup instructions, arbitrary nearby replies and logs are excluded.

The explanation and changed code appear immediately. There is no question, answer selection or reveal step. Previous code stays collapsed until opened. Longer code lines wrap within the sidebar.

**Check the original edit** opens an immutable comparison. Source is never edited or rewound. Card excerpts must match a recorded edit in the same chat. Removed worktrees are supported only as historical patches with exact recorded absolute paths; their current filesystem is not read or opened. Unmatched cards stay hidden and can be checked again.

The explanation is bounded display state in memory. No duplicate conversation or learning memory is stored. The source card and agent work remain in Codex.

Use **Settings** for language, position and the Codex executable. Optional live notifications retain the existing configuration review and Codex CLI `/hooks` trust procedure. Reading cards does not require hooks.

Earlier imported plans, MCP, direct editing and checks remain optional command-palette workflows. See the [earlier walkthrough](../assets/type-the-change-quickstart.mp4) and [Privacy](../PRIVACY.md).
