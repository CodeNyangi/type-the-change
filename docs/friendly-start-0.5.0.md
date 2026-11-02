# 0.5.0 local preview verification

Prepared on 2026-11-02 from the installed 0.4.0 source line (`004b5b6d1af681491976a1e69880f7d427f9576f`). Changes are in the local `codex/friendly-start-flow` branch. This report does not imply publication or Marketplace availability.

## Behavior

- The activity-bar icon opens the guide. Editor-title and keyboard entry points remain available.
- Opening the guide prepares the active local source file. Switching editors updates automatic context while the panel is visible. A manual file selection stays pinned until the user chooses **Use current file**. The composer displays the files that a request will send.
- The connection card explains the app-name, ChatGPT-plan consent, and return-to-editor steps, and remains visible while waiting for consent. Drafts survive connection and failed requests.
- Model catalogs have an independent 8 MiB bound. Generated plan and provider error-body limits remain unchanged. A catalog with more than 256 KiB of metadata is accepted; oversized advertised and streamed catalogs are still cancelled. Only visible model names/slugs are used, in provider order.
- A fresh request can use the first available account model without opening the picker. A chosen model is still checked against the account's current catalog before generation. Model failures offer a direct retry.
- The first offline exercise is a one-line task-list filter, with four real checks. Its known outcome and the original request for a generated change supply the initial prediction. Later steps and imported plans retain the prediction workflow; keep/reject decisions remain explicit.
- **How to** opens help inside the extension. The earlier video and counterexample remain in the repository as an advanced exercise.

The connection and model request behavior follows OpenAI's [registration guidance](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and [model catalog guidance](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

## Performed checks

| Check | Result |
| --- | --- |
| TypeScript and bundled extension build | Passed |
| Automated tests | 200 passed, none skipped |
| Production webview in isolated headless Chrome | 522 layout cases; 3 interaction groups passed |
| Languages, widths and themes | Korean/English; 300/460/720 px; light/dark/high contrast |
| Screenshot inspection | Start, current-file composer, consent-in-progress and new task-list exercise inspected |
| Real macOS VS Code host | Passed, including native character input, automatic pairs, indentation, CRLF, deletion, scoped saves, failed/passed demo checks, stale evidence, diff review and decision journal |
| Whitespace/error check | `git diff --check` passed |
| Local VSIX installation | Installed as `codenyangi.type-the-change@0.5.0`; installed bundle matches the tested build |

Local artifact: `artifacts/type-the-change-0.5.0.vsix`, 252,851 bytes. SHA-256: `34e975751a8b28f60d51e52dafce7c6e5cf9aac93b57d55793378dc9b0cf7bd4`. No remote push, PR, merge, or release was performed for this preview.

Regression tests use real source-file reads with mocked VS Code transport to prove that automatic context needs neither a picker nor a workspace scan, respects explicit choices, excludes protected paths, and sends only the displayed source. The model regression uses a metadata-rich streamed catalog rather than increasing a constant without exercising the old failure.

## Limits

No new live ChatGPT sign-in, real-account model lookup, or subscription inference was performed. The reported account failure was reproduced with a realistically sized fixture; the user's exact provider response was not collected. Headless theme checks exercise production HTML with representative theme tokens and do not constitute a complete screen-reader or accessibility certification. The original file-count, source-size, local-workspace and task-selection limits still apply.

## Reproduce

```sh
npm ci
npm run check
npm test
npm run build
npm run test:host
npm run test:ui:webview
npm run package
```

The headless command accepts `CHROMIUM_EXECUTABLE` when using an existing Chrome installation. Its report and screenshots are written under `artifacts/headless-webview/`. Host tests use a separate temporary workspace and VS Code profile.
