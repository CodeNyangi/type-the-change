# 0.6.0 preview: background Codex, hands-on learning

Prepared on 2026-11-02 from `004b5b6d1af681491976a1e69880f7d427f9576f` on the local `codex/friendly-start-flow` branch. Source changes remain local and uncommitted. The separately authorized Marketplace release is recorded below.

## Product flow

1. Open the real Type the Change sidebar and ask about the project. File selection and model selection are optional.
2. Installed Codex app-server explores the project and streams explanations. Its managed account, model catalog, tools, and conversation state power the work.
3. A change request uses a local `prepare_typing_plan` dynamic tool to prepare small learning steps. The extension validates the exact anchors against current editor buffers.
4. **Explore the change** opens the actual source range next to its explanation. The learner edits, saves and checks, compares evidence, and decides what stays.
5. Follow-up questions keep the current learning step. Stopping preserves received text; a subsequent request resumes the Codex thread. New chat starts fresh.

Codex runs with the read-only filesystem policy and permission expansion is declined. The extension does not apply source changes or automatically run checks. The default flow remains inside Type the Change; an existing-thread Codex deeplink is only an optional history control.

## Verification

| Check | Evidence |
| --- | --- |
| TypeScript and production bundle | `npm run check`, `npm run build` |
| Automated tests | 206 passed, none skipped |
| Headless production webview | 558 layout cases; Korean/English, 300/460/720 px, light/dark/high contrast; all interaction groups passed |
| Native VS Code host | Sidebar entry, exact source selection, keyboard typing, follow-up while learning, cancellation, panel reopening, real failing/passing checks, human decisions, and preservation of unrelated dirty files |
| Actual Codex account | One live turn using the installed `codex-cli 0.166.0-alpha.5.1`, a temporary project, and an ephemeral read-only thread |

For the live check, Codex returned eight available models, sent the first explanatory text after **4,658 ms**, emitted **135 text updates**, and prepared **one validated learning step**. Completion took **32,827 ms**. The source file was byte-for-byte unchanged. These times describe one small fixture, not a latency guarantee for real repositories. The machine-readable result is `artifacts/codex-live-report.json`.

Protocol tests exercise notifications arriving before the `turn/start` reply, managed login notifications, conversation reuse/resume, cancellation, late failure, and more than 1 MiB of cumulative event traffic. Transport limits apply to one live frame, not the aggregate stream. Model discovery uses `model/list`, without parsing a model catalog through the old small plan-response limit.

The native test uses a deterministic Codex protocol fixture; the separate live check uses the actual signed-in Codex engine. Neither is represented as a complete live-account UI test on the user's real project.

## Local installation

`artifacts/type-the-change-0.6.0.vsix` was installed in the current VS Code. Its manifest, extension/MCP bundles, and both localization files were verified against the build. Package size: 260,931 bytes. SHA-256: `3c2d22e794526873f5c5ec521a0971b88a608680f7cecb704b12b8244b41acf2`. Installation evidence is `artifacts/install-0.6.0.json`. Reload an already-open VS Code window to activate the update.

## Marketplace publication

The user directly authorized publishing 0.6.0 in the same conversation that submitted the update. Marketplace validation completed and the public version history shows **0.6.0**, last updated **2026-11-02 03:02:48 UTC** (12:02:48 KST). The new English/Korean overview, guides, and privacy content are visible on the public listing.

The release package is `artifacts/type-the-change-0.6.0-marketplace.vsix` (266,631 bytes; SHA-256 `8eae1c173f792dcc81a147adbf948b870ac5e8cc554a48be6addc055cb738131`). Its extension and MCP bundles and both localization files match the tested build and local installation. Its README includes the English/Korean guides, privacy information, and verification summary so publication does not require publishing a source branch first. Remaining source links are pinned to the existing base commit.

The official Marketplace metadata returned by `vsce show CodeNyangi.type-the-change --json` reports the same package SHA-256 above, confirming that the published package matches the prepared artifact byte for byte. Release evidence: `artifacts/marketplace-0.6.0-release.json`; metadata: `artifacts/marketplace-0.6.0-metadata.json`; public version-history screenshot: `artifacts/marketplace-0.6.0-published.jpg`. Target: [Type the Change on Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change). No Git push, PR, or merge was performed.

## Scope and limits

- Local projects and an installed compatible Codex engine are required. Automatic discovery was exercised on macOS, including the ChatGPT app's bundled executable.
- Korean and English are supported. Other VS Code languages use English.
- Learning suggestions currently support existing UTF-8 files up to 64 KiB each. Project exploration is not restricted to the active editor. Dirty-buffer or stale-anchor mismatches are rejected instead of silently applying an outdated plan.
- App-server dynamic tools are experimental. Protocol compatibility is tied to the installed Codex version; connection failures offer an update/path recovery message.
- Linux virtual-display UI/recording scripts were updated for the sidebar and current exercise and syntax-checked here. Their Linux execution, Windows execution, and minimum VS Code version were not rerun in this macOS session.
- No new browser login consent, real OS Korean IME test, full accessibility certification, or large-project performance benchmark was performed.

## Reproduce

```sh
npm run check
npm test
npm run build
npm run test:host
CHROMIUM_EXECUTABLE='/path/to/chrome' npm run test:ui:webview
npm run package
```

The host check uses a temporary project and isolated VS Code profile. The headless report and screenshots are in `artifacts/headless-webview/`.

A live check consumes a small amount of the signed-in Codex account's usage and is explicitly opt-in:

```sh
TTC_CODEX_LIVE=1 node --import tsx scripts/test-codex-live.mjs
```

The adapter follows the [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server), checked against protocol types generated by the locally installed Codex binary. The optional history link follows [Codex app commands](https://learn.chatgpt.com/docs/app/commands).
