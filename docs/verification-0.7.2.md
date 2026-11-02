# Verification — 0.7.2

This release changes the entry flow from an editor-file view to a project task overview. The picker starts with five current-project tasks, including registered worktrees, and expands on explicit action. The transcript stays collapsed and is not rendered until opened.

The learning action searches bounded recorded history for a source-code edit inside the selected registered worktree. Generated artifacts, tests and documentation are excluded from default selection. Unrelated active editor files are not displayed as lessons. A missing history result is explicit. No separate SCM inventory is introduced.

Context is taken from the exact edit’s turn: the nearest preceding request and a nearby public Codex message. It is an attributed excerpt, not an automatically generated explanation. HTML entities and attachment wrappers are cleaned as text; bare link paragraphs do not replace substantive text. Source paths, short edits and neighboring messages do not prove educational relevance.

Regression checks cover project scope, the five-task limit, explicit expansion, collapsed/lazy transcripts, unrelated-editor exclusion, documentation practice exclusion, mid-turn steering and choosing actual source over generated reports. Existing native editor, source preservation and read-only observer checks remain required. The live-data check uses the existing crispy-chatbot chats and their registered worktrees; its private screenshots and reports stay excluded from packaging.

There is no new agent, model request, persistent learning memory, worktree creation or source write. Practice remains a separate untitled document and text equality is not an understanding assessment. This version improves navigation and attribution; it does not claim to generate a curriculum or validate learning outcomes.
