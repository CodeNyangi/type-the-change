# 0.3.0 judgment workflow verification

This is a review build. The owner retains final review and merge. The Mac's active
VS Code windows were not brought forward or switched. Native editor integration
and filming run on a GitHub Linux virtual display; local browser checks are headless.

## Contract

- Prediction precedes revealing the proposal. Editing remains under the person’s control.
- Compare opens the actual original/current diff. Neither matching text nor the
  comparison command records acceptance.
- Keep and reject require a short evidence note. Defer can record uncertainty.
- Alternative code within the guided range can be kept. Out-of-range or changed
  prior/future files block keep. A changed buffer invalidates previous evidence.
- Later steps are revalidated against the actual accepted code; invalid anchors
  request a new plan instead of silently applying or guessing a replacement.
- A failed journal write does not complete the decision. Concurrent decisions do
  not skip a step. Stopped or replaced sessions cannot be resurrected by pending work.
- Reject, defer, and ending the guide do not change or save source. The local
  journal is human-reported evidence, not an automated correctness certificate.

## Evidence

- macOS background application suite: **164 passed**, no skips.
- Production webview: **162 rendered cases** (18 states × three widths × three
  representative themes), both shortcut conventions, note controls, focus recovery,
  IME-event guards, and long-code keyboard scrolling; no JavaScript/CSP errors.
- Real VS Code UI: **10 flow groups passed**, including prediction, comparison,
  evidence-gated progression, rejection, changed evidence, file selection, imported
  and MCP plans, and invalid-import recovery.
- Native host: VS Code **1.142.0** and minimum **1.100.0** passed after updating the
  test to reacquire an editor following a real diff transition. Tests cover native
  typing with automatic pairs, indentation, CRLF, sequential edits, and deletion.
- Windows application suite passes with the two existing POSIX named-pipe skips.
- Current workflow and filming results: [PR checks](https://github.com/CodeNyangi/type-the-change/pull/1/checks).
  The full workflow passed at `d9aff39`: [all-green run](https://github.com/CodeNyangi/type-the-change/actions/runs/41321242914). The real tutorial lasts approximately 39 seconds.

## Practical limits

The owner completed personal Marketplace publisher registration. Live ChatGPT consent/inference remains unverified. No paid model request was made for this work.
Synthetic composition events do not verify a real Korean OS input method. Linux
editor testing is not native Mac or Windows UI coverage. The captioned tutorial uses
one test input and an intentionally wrong local proposal; it does not measure human
learning, retention, transfer, or total API cost reduction.

`review.json` contains the current session's last 100 notes and overwrites the prior
session when a new decision is saved. Notes stay local; MCP status exposes decision
metadata, not note text. Add `.type-the-change/` to Git ignore rules.

## Reproduce

```sh
npm ci
npm run check
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:ui:webview
npm run package
```

In Linux CI only, with FFmpeg and Noto CJK fonts installed:

```sh
xvfb-run -a npm run test:host
xvfb-run -a -s '-screen 0 1440x1000x24' npm run test:ui:vscode
xvfb-run -a -s '-screen 0 1440x1000x24' node scripts/record-tutorial.mjs
```
