# Type the Change

**AI points to the change. You type it into your own code.**

[한국어](README.ko.md) · [Download VSIX](https://github.com/CodeNyangi/type-the-change/releases) · [Report an issue](https://github.com/CodeNyangi/type-the-change/issues/new/choose) · [Contribute](CONTRIBUTING.md)

**Type the Change is an open-source VS Code extension for AI-assisted coding and deliberate coding practice.** Read a proposed code change, type it in your own editor, and review the diff. Use an imported JSON plan, an optional ChatGPT connection, or a Model Context Protocol (MCP) client.

It is for developers who want to stay involved in the details of an AI-proposed change: a condition, a return value, a small refactor. The extension selects the relevant code and keeps the proposal beside it. The direct ChatGPT integration runs inside VS Code and does not require Codex Desktop, Codex CLI, or a separate MCP client.

1. Describe a change and select the relevant files, or receive a plan from an MCP client.
2. The extension opens the exact replacement range, with the proposal beside your editor.
3. Type in the native editor. Compare, review, and continue with **⌘⌥Enter** / **Ctrl+Alt+Enter**.

You control editing and saving. Normal Undo, completion, paste, and accessibility tools remain available. A match means the text agrees with the proposal; use your tests and Git diff to judge the result. Deliberate practice is the design intent, not a claim of measured learning gains.

## Quickstart: install the VS Code extension

Requires local desktop VS Code 1.100 or later. This is an early preview; the interface currently uses Korean.

1. Download the `.vsix` attached to a [GitHub release](https://github.com/CodeNyangi/type-the-change/releases).
2. In VS Code, run **Extensions: Install from VSIX…** from the command palette.
3. Run **Type the Change: Try the Demo**. No sign-in is needed for the demo or imported plans.

The demo creates a temporary `price.ts`, selects a line, and shows a small change. Type the replacement, read it, and press the continuation shortcut. **⌘⌥T** / **Ctrl+Alt+T** returns to the current change. Normal editor Undo, selection, and accessibility tools remain available. After completion, **변경 확인** opens the original/current diff without applying or saving anything.

To use a local JSON plan, open its target project and run **Type the Change: Open a Plan**. See the [plan schema](plan.schema.json) and [example](examples/plan.json).

**Preview status:** published VSIX files may lag behind `main`. Check the [changelog](CHANGELOG.md) and [verification notes](docs/verification.md) for the build you are using. Real-account ChatGPT consent and subscription-backed plan generation remain unverified; the demo and JSON import do not depend on that connection.

## AI-assisted coding with ChatGPT

Run **Type the Change: Start**, describe your intent in the panel, select up to eight source files, and choose **수정안 만들기** (or ⌘Enter / Ctrl+Enter). For example: “Exclude negative prices from the total, and explain the condition I should inspect.” The first request opens **Continue with ChatGPT** in your browser for account consent. The extension uses your remembered model, or the first model in the provider-ordered available list. Use the model button to change it.

This uses OpenAI's official [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), with your account's eligible plan access and limits. An API key is not required. It is not unlimited or an assurance that every subscription is eligible. Requests display that they consume ChatGPT plan usage; usage can be managed in [ChatGPT settings](https://chatgpt.com/settings/usage).

Only the explicitly selected file contents and your request are sent for plan generation. Tokens live in VS Code SecretStorage. The extension does not read another application's credentials. It uses PKCE, a loopback callback, signed ID-token validation, rotating refresh tokens, and revocation on sign-out. Read the [privacy policy](PRIVACY.md) for data handling.

## MCP server for typing plans

Run **Type the Change: Show MCP Connection** in your workspace to get the exact configuration for the installed extension. The bundled stdio server requires **Node.js 22+** on your PATH.

```json
{
  "mcpServers": {
    "type-the-change": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp-server.cjs", "--workspace", "/absolute/path/to/project"]
    }
  }
}
```

The server exposes three tools:

| Tool | Purpose |
| --- | --- |
| `read_file` | Read a bounded, existing UTF-8 source file in the configured workspace. |
| `propose_typing_plan` | Validate exact replacements and write a local plan for the extension. |
| `get_typing_status` | Read the extension's most recent dated progress snapshot. |

Ask your client: “Read the relevant file, propose a small typing plan for this change, and let me implement it in VS Code.” Open the notification or run **Type the Change: Open MCP Plan**.

The MCP server makes no model requests and cannot modify source or run shell commands. Its client supplies the intelligence and uses that client's own authentication and billing. ChatGPT subscription access in this extension does not automatically connect arbitrary MCP clients.

Plans and dated progress are stored under `.type-the-change/`. Add that directory to the target project's `.gitignore`. Status is a last-known editor snapshot, not a fresh disk check or test result. Disconnect the server when you no longer want a client to read the configured workspace.

## Plan format

```json
{
  "version": 1,
  "title": "Ignore negative prices",
  "intent": "Exclude invalid negative prices from the total.",
  "steps": [{
    "file": "price.ts",
    "before": "    result += price;",
    "after": "    if (price >= 0) {\n      result += price;\n    }",
    "reason": "Only non-negative values contribute to the total."
  }]
}
```

See [the schema](plan.schema.json) and [a complete example](examples/plan.json). Each `before` must match exactly once in the state produced by preceding steps. Use an existing context anchor for insertion; an empty `after` deletes a range. Unknown fields, ambiguous anchors, protected paths, symlinks, and out-of-workspace files are rejected.

## Scope of this preview

- Existing local text files only; no new-file, rename, remote workspace, or binary plans.
- Exact text comparison, including whitespace. Edits outside the planned region pause acceptance. Files changed earlier in the plan are also checked.
- A 64 KiB file limit, up to 20 plan steps, and no automatic commands or tests.
- One ChatGPT account binding per installation. Simultaneous authentication from multiple VS Code windows is not supported; use one window for connected requests.
- Session progress is in memory. Closing VS Code ends the guide; your normal editor save/restore behavior still applies. MCP plans remain on disk until removed or replaced.
- VS Code completion and format-on-type settings still apply; the extension does not disable your existing assistance or prove that every character was manually typed.

## Contributing

English and Korean contributions are welcome. Useful contributions include a reproducible editor bug, clearer onboarding, accessibility improvements, small example plans, and tests for cancellation or file boundaries.

- **Found a problem or have a proposal?** [Open an issue](https://github.com/CodeNyangi/type-the-change/issues/new/choose). Include the VS Code/extension version, platform, and a minimal example with expected and actual behavior.
- **Ready to change code or docs?** Follow [CONTRIBUTING.md](CONTRIBUTING.md), then [open a pull request](https://github.com/CodeNyangi/type-the-change/compare). Keep changes focused on reading, typing, and reviewing code.
- **Reporting a vulnerability?** Follow [SECURITY.md](SECURITY.md). Do not put tokens, private code, or real workspace plans in a public issue.

## Build and test from source

Use **Node.js 22+** and npm:

```sh
git clone https://github.com/CodeNyangi/type-the-change.git
cd type-the-change
npm ci
npm run check
npm test
npm run build
npm run test:host
npm run package
```

`test:host` runs the extension in an isolated VS Code profile and temporary workspace. On macOS it can use the installed VS Code; otherwise it downloads a pinned VS Code test build. Linux requires a display, for example `xvfb-run -a npm run test:host`. The VSIX is written to `artifacts/`.

Install that local VSIX with **Extensions: Install from VSIX…** to try the development build. If you change authentication or editor behavior, include the relevant verification and its limits in your pull request.

Tests cover every webview command and state transition in a DOM environment, path boundaries, sequential plans, stdio MCP, OAuth state/PKCE/refresh/revocation, inference completion/cancellation, and real VS Code editor integration. Native typing tests use VS Code’s `type` command, including auto-pairs, indentation, CRLF, and deletion. A locked macOS host explicitly skips those keyboard cases; `TTC_REQUIRE_NATIVE_TYPING=1` and non-macOS runners require them. DOM tests do not verify browser pixels or real account consent.

`npm run preview` serves the exact production webview at http://127.0.0.1:8790 with a clearly labelled mock host. It can exercise narrow/light/dark/high-contrast layouts without signing in or sending code. It is a UI test fixture, not a substitute for editor or live-account tests. See [verification coverage](docs/verification.md).

The project draws on Sai's deliberate typing experience and the bounded tool interaction of the Unsecat MCP project.

[MIT license](LICENSE) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Bundled dependency notices](THIRD_PARTY_NOTICES)
