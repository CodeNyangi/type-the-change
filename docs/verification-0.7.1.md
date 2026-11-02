# Verification — 0.7.1

This maintenance release keeps the 0.7 Codex observer and editor-following workflow. It removes unused independent OAuth, inference and account-lock modules and their obsolete tests. Existing Codex ownership, read-only comparison and separate practice remain the product boundaries.

English/Korean extension metadata, README introductions, optional imported-plan help, issue fields and release documentation describe the current product. The earlier walkthrough remains available with its original-UI label.

The release process requires committed source, matching package/lock/changelog versions, complete localized metadata, the current verification document, and checks against the same commit. Marketplace packaging rejects changed build outputs and unapproved archive entries; it includes the guide and privacy text and emits a SHA-256 receipt. Public verification matches the publisher, extension, version and package hash before recording a release.

`npm run release:verify` runs TypeScript, current unit/integration tests, production build, the native VS Code host, 162 Korean/English companion layouts, and native staged/unstaged/unsaved editor comparisons. Its machine-readable evidence identifies the exact source commit and tested bundles. `releases/` records published artifacts after external verification; this document alone does not assert that CI ran or that a version was published.

The previous real-user checks are documented in [0.7.0 verification](verification-0.7.0.md). They verified the existing chat, associated registered worktree, genuine progress events, original turn context, immutable diff, plaintext practice and unchanged source. The reloaded user window also showed the new Code in view tab, no duplicate SCM list, a different-worktree notice and original recorded edits. Physical keyboard practice in that user window was not verified.

Historical records, source snapshots, notification freshness and platform limits still apply. No new model call, memory store, source write, worktree creation or agent execution is introduced by this maintenance release.
