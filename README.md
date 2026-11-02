# Type the Change

**AI suggests. You check. You decide.**

Practice judgment while changing code in VS Code.

[![Watch the English walkthrough](assets/quickstart.gif)](assets/type-the-change-quickstart.mp4)

[Watch the video](assets/type-the-change-quickstart.mp4) · [Install](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change) · [한국어](README.ko.md)

## Open it

Click the **`>_` icon at the top right of your code editor**, or press **⌘⌥T / Ctrl+Alt+T**. Choose **Try demo**. No account needed.

## Use it

1. **Predict** one result. Press **⌘Enter / Ctrl+Enter**.
2. **Edit** in your usual editor. Press **⌘⌥Enter / Ctrl+Alt+Enter** to save and check.
3. **Decide** from the result and diff. Write one reason, then **⌘Enter / Ctrl+Enter → ← → → Enter** to keep, reject, or defer.

The demo suggestion is deliberately wrong. Matching its text or passing a check never approves a change. **⌘⌥T / Ctrl+Alt+T** returns to the code; **How to** reopens the video.

## Your project

Describe a change and select its files, or import a plan from your MCP client. Choose a relevant existing VS Code task once; its result appears beside the code.

The first task selection offers disabling task-wide auto-save in that workspace, or in user settings if no folder is open. Only reviewed files are then saved. Cancel or choose **Compare only** to leave the setting unchanged. [Details](docs/guide.md)

Large repositories use bounded filename search. Each request accepts **8 files, 64 KiB each**. Whole-repository impact analysis and automatic test selection are not included.

**Preview · VS Code 1.100+ · Local files.** Main controls follow your VS Code language (English or Korean). ChatGPT generation sends selected files and your request to OpenAI and uses eligible plan access; real-account consent and generation remain unverified. Offline practice needs no sign-in.

[Setup & MCP](docs/guide.md) · [Verification](docs/keyboard-workflow-0.4.0.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [MIT](LICENSE)

Contribute through [issues](https://github.com/CodeNyangi/type-the-change/issues/new/choose). External pull requests are not accepted; the owner reviews changes. [Policy](CONTRIBUTING.md)
