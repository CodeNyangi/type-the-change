# Changelog

## 0.2.0 — 2026-11-01 (preview)

- One request composer inside VS Code; remembered model choice and no extra welcome confirmation dialog.
- Fewer repeated labels, one location control, a visible deletion state, and focus restored after completion or ending.
- Original/current code review after typing, including a file chooser for multi-file changes.
- Cancelled login/model/inference operations stop quietly; terminal model output no longer waits for connection closure.
- Fixes for exact MCP notification workspace, non-regular source files, stale diff baselines, and untouched selection restoration.
- Expanded DOM, OAuth, inference, MCP and native editor coverage. Live account and pixel-level UI checks remain separate.

## 0.1.0 — 2026-11-01 (preview)

- Native VS Code typing with an adjacent proposal, precise range selection, calm comparison, and keyboard continuation.
- Exact sequential plans with stale-range and previously edited file checks.
- A local stdio MCP bridge for reading files, proposing plans, and reading dated progress.
- Official ChatGPT subscription sign-in and streamed plan-generation implementation; live account verification is pending.
- A sign-in-free demo, JSON import, unit/security tests, and real editor integration tests.
