# 0.2.0 release verification (historical)

For the subsequent local audit, fixes, browser evidence and remaining live-account/native-input limits, see [2026-11-01 audit](audit-2026-11-01.md). The results below describe the original published release, not the later uncommitted audit build.

This report distinguishes simulated UI events, actual VS Code integration, and checks that require an accessible screen or a real account. Passing a DOM test does not mean pixels were visually inspected.

| Surface | Evidence | Limit |
| --- | --- | --- |
| Start / request composer | Production HTML in JSDOM: draft, empty input, submit, shortcut, file/model buttons, loading and cancellation | Native file-picker interaction is not a browser DOM action |
| Import / MCP / account controls | Every rendered command is allowlisted, named, routed and registered; MCP is exercised over real stdio | Browser consent and authenticated usage page are not covered by a fake provider |
| Typing / deletion / outside edits / completion | Text matching unit tests; production DOM state transitions; real VS Code buffers, selections and progression | Local native typing is skipped when the locked macOS window does not accept `type` |
| Original/current review | Real VS Code diff inputs, original snapshot, current buffer; no source writes | Pixel appearance needs a visible host |
| OAuth / model requests | Real loopback callback with mocked provider, signed-token checks, denial, cancel, refresh, revoke, incomplete/failed/completed stream and bounded input | No live account consent or paid/subscription inference in this run |
| Links | Source relative links exist; public GitHub/OpenAI targets resolve; release artifact digest is checked when published | Authenticated usage content is not checked |
| Narrow / light / dark / high contrast | Production CSS and a same-source preview fixture are available at `npm run preview` | Not visually inspected: local browser access is disabled in Work settings |

## Environment results

- TypeScript check and 91 automated tests pass locally (including 12 production-webview DOM tests).
- macOS VS Code host tests pass for panel reopening, range selection, deletion comparison, diff review, command registration, multi-file consistency, cancellation races and MCP status.
- Local native keyboard tests explicitly skip because the Mac is locked. This is not reported as a typing pass.
- Linux CI requires native typing and fails if it cannot exercise character input, automatic pairs, indentation, CRLF, sequential edits and deletion. Consult the exact release commit's GitHub Actions result.
- Actual screen clicks, pixel review and live ChatGPT sign-in remain unverified in this environment.

## Reproduce

```sh
npm ci
npm run check
npm test
npm run build
npm run test:host
npm run preview
```

To require keyboard coverage even on macOS:

```sh
TTC_REQUIRE_NATIVE_TYPING=1 npm run test:host
```

The browser fixture labels its connection as simulated, uses the same `panelHtml` as the extension, and never calls OpenAI. It is not presented as a working live account or a real VS Code editor.
