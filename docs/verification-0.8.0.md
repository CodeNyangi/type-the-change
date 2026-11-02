# Verification — 0.8.0

The learner UI accepts only explicit Codex-authored cards. It no longer treats ordinary conversation, complaint text, restart instructions, file names or arbitrary diffs as educational content. The reason for the change and a short excerpt of its actual code appear immediately, with no quiz or reveal step. Previous code stays collapsed.

The parser bounds fields, code size and line count, accepts bounded explanation records and rejects unsafe source paths and non-code/test artifacts. Quoted code must match the same recorded edit, including its relative indentation. Explicit Codex file additions are converted from literal file contents into empty-before comparisons; untyped source text is never assumed to be an addition. Unknown worktrees require exact historical absolute paths and patch matching and are shown only through immutable virtual documents, without current filesystem access.

The webview payload omits raw messages, worktree inventories, unrelated editor state and review context. The five-task project picker remains. Display state stays in memory; legacy question/choice/answer fields are discarded. No model call, agent loop, persistent learning memory or automated prompt submission is added.

Regression coverage includes malformed and oversized cards, foreign paths, fabricated examples, historical snapshots, inert provider text, immediately visible explanations, absence of quiz controls, preserved optional comparison state, code wrapping and common-indent removal and the absence of operational text on the learning screen. The UI matrix covers Korean/English, three themes, three widths and nine states. Native-host tests verify read-only card comparisons and source preservation alongside retained optional plan workflows.

Live checks use a real explanation authored in the existing owning Codex chat, matched to the actual recorded edit. They verify immediate explanation display, absence of quiz controls and a native immutable comparison for a removed worktree. Test fixtures and layout screenshots alone are not evidence of that handoff or of a measured learning outcome. Private live evidence stays under ignored artifacts.
