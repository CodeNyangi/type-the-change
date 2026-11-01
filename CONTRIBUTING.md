# Contributing

Open an issue describing a concrete problem or send a pull request with a focused change. Korean and English are welcome.

Preserve the central interaction: a person reads, types, and reviews a proposed code change. Keep the interface small. Never silently apply source edits or treat matching text as proof of correctness.

Use Node.js 22+, run `npm ci`, then `npm run check`, `npm test`, `npm run build`, and `npm run test:host`. The host test launches an isolated VS Code profile. Linux CI runs it under Xvfb. `npm run package` builds the installable VSIX.

Include meaningful tests for path handling, plan validation, authentication, and editor state changes. Do not commit tokens, real workspace plans, personal source, generated bundles, or VSIX files. Keep external requests behind explicit user actions and document changes to data handling in PRIVACY.md.

Changes to authentication must stay aligned with the linked official OpenAI documentation and must not read credentials belonging to another app. Never use live credentials in automated tests.
