# Marketplace publication

The package is prepared for publisher **CodeNyangi**. The personal publisher was registered by the owner’s Microsoft account during this work session. A local installation or GitHub
release does not mean the extension is on the Marketplace.

## Prepared listing

| Field | Value |
| --- | --- |
| Publisher ID / display name | `CodeNyangi` (availability must be confirmed when registering) |
| Extension ID | `type-the-change` |
| Display name | Type the Change |
| Preview version | 0.3.0 |
| Summary | Practice judgment with AI code: predict the outcome, inspect the diff, and keep or reject a proposal with evidence. |
| Categories | Education, Other |
| Keywords | ai-assisted-coding, deliberate-practice, code-review, mcp, chatgpt |
| Icon | `assets/icon.png` |
| First-use media | Captioned real VS Code video and animated README preview |
| Support | https://github.com/CodeNyangi/type-the-change/issues/new/choose |
| Source | https://github.com/CodeNyangi/type-the-change |
| License | MIT |

## First publication

1. The owner reviews the draft PR and the exact installable package. No automatic
   merge or publishing is configured.
2. For future administration, sign in to [Manage Publishers](https://marketplace.visualstudio.com/manage/publishers/)
   using the owner's Microsoft account. Create a publisher with the ID and display
   name above, if available. The owner supplies the account and contact information.
3. In the publisher portal, choose **New extension → Visual Studio Code**, and
   upload the reviewed VSIX. Check the listing, media links, and version before
   confirming publication.
4. Wait for Marketplace verification, then verify the public listing and install
   by its full identifier `CodeNyangi.type-the-change`. Record the verified URL;
   do not announce availability before this succeeds.

No password or access token should be pasted into a chat. Browser upload avoids
creating a command-line token for this first publication. For later automation,
follow Microsoft's current Trusted Publishing instructions and keep an owner
review gate. Do not add automatic publishing to every push.

See Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for publisher creation, browser upload, and supported authentication methods.

## Media provenance and repeatability

`scripts/record-tutorial.mjs` runs only in Linux CI with a virtual display. It uses
an isolated VS Code profile and the public `examples/judgment` fixture. The proposed
`break` change is deliberately wrong, not a response attributed to a live model.
Only the file-dialog result is substituted. Editing, saving, terminal execution,
diff comparison, rejection, and acceptance happen in actual VS Code.

The video has Korean captions and no voiceover. The sample checker demonstrates
one input; it does not establish general correctness or measured learning gains.
Private project files and conversations must never be included in the recording.
