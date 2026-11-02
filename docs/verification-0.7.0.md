# Verification — 0.7.0

Prepared on 2026-11-02. This is a local implementation/package, not a Marketplace publication approval. Existing source changes on `codex/friendly-start-flow` are preserved; no commit, push, PR or public release was performed for 0.7.0.

## Ownership boundary

The extension bundle permits only Codex initialization and thread list/read/turn/item/loaded-list queries. Tests reject thread start/resume/fork, turn start/steer/interrupt, independent login, command execution and configuration writes. No direct provider API or auth endpoint is present in the shipped extension. A separate history-query transport never loads or runs an agent thread. Shared connections use Codex's proxy; closing TTC closes its connection, not the owning server.

The optional official hook is advisory and returns empty JSON. It forwards only bounded event metadata over a private local socket, with no chat, prompt, source, transcript, memory or event-history storage. It cannot approve, block, inject context or restart a turn. Settings preserve unrelated hooks. Hook executable paths include a content hash so changed code receives a new definition for Codex trust review.

## Results

| Check | Result |
| --- | --- |
| TypeScript + production build | Passed |
| Unit/integration tests | 228 passed |
| Worktree selection, removal, scan races and legacy chat pagination | Passed; focused recheck after the final selection guard |
| Packaged hook → actual local socket | Passed with synthetic lifecycle input; no conversation contents forwarded |
| Browser rendering and controls | 162 combinations: Korean/English, dark/light/high contrast, 320/480/900 px, nine states |
| Native VS Code extension host | Passed: existing chat selection, activity-derived registered worktree, immutable diff, separate practice, original-file preservation and stale review detection |
| Earlier imported-plan/checking host flows | Passed; native keyboard cases skipped because the isolated test window was not focused |
| Existing real Codex chat | Original ID/title and public messages match the Codex app; original request/answer and recorded patch verified together |
| Existing real worktree association | Linked the selected chat to its observed registered worktree; real source-location, read-only comparison and separate practice verified without editing source or Git state |
| Real automatic progress | In 60 seconds: 26 refreshes, seven newly saved items, worktree changes and a genuine PostToolUse event from the selected original chat |
| Clean worktree with command-only recent history | Expanding Past Codex edits found original changes beyond command-only history; exact request/response and two-hunk source comparison passed |

## Limits verified rather than hidden

The current desktop installation did not expose the default shared control socket. History therefore reports `notLoaded`; TTC does not treat that as the original chat being idle or finished. After explicit user authorization, the ten metadata-only hook definitions were installed. The actual Codex CLI `/hooks` screen showed the TTC definition enabled and `Trusted`, without a trust bypass. A genuine `PostToolUse` notification arrived from the selected original chat and its active turn. This confirms lifecycle notifications on this Mac; it does not claim full streamed model-token access or redefine a finishing event as final completion.

Recorded file-change patches may differ from today's source. Worktree changes can include edits from other tasks. Multiple candidates require a choice, and a removed explicit worktree is not replaced with the main checkout. Snapshot drift prevents a new practice from starting against a stale comparison. Practice opens untitled text; it never resets a source file.

Comparisons are bounded to 1 MiB per UTF-8 file; protected paths, links and binaries are rejected. The display omits the Source Control inventory and full code. It shows an attributed context extract, with a bounded code hint only for small practiceable replacements. The complete comparison stays in the native editor. Paging avoids full conversation-history hydration. A single oversized tool frame switches the reader to summarized pages and the next history query reconnects successfully; accumulated event traffic is not mistaken for one large response. Old history stores use one turn summary per page when item pagination is unsupported. Remote/cloud working directories are not mapped to unrelated local folders.

Evidence is retained locally under `artifacts/`: `codex-observer-live.json`, `companion-live.json`, `companion-ui/report.json` and the new UI captures. Unit and native host logs are copied beside the package. The obsolete file-selection/agent-start integration test is preserved byte-for-byte under `test/retired/extension-workspace-0.6.1.test.ts.disabled`; observer boundary and workflow tests replace its retired behavior.

## Real-user evidence

The user-selected existing chat was linked to its registered worktree and branch. Selection loaded in 207 ms in the real browser test. With zero current changes, expanding Past Codex edits found recorded changes beyond recent command activity. A recorded source edit was matched to its exact original turn, request and Codex response. A separate native VS Code test followed the real source editor, identified a different worktree without switching chats, opened a read-only diff, matched an untitled plaintext practice document, compared the practice, preserved the source bytes and opened the current source file. When the historical section no longer exists in the changing source, navigation opens the beginning with a notice instead of silently clamping the old line number. Programmatic host edits alone do not claim physical keyboard entry.

Each edit search reads at most eight pages. Its in-memory display window holds at most 100 change items independently of the live activity window, does not send full patches to the webview, and is cleared on chat/worktree changes. Tests cover bounded reads, repeated cursors, retries, duplicate clicks and selection races. No chat cache is written to disk.

Local reports: `artifacts/real-companion/report.json`, `original-chat-match.json`, `native-host.json`, `follow.json`, `hooks-setup.json`. Captures: `activity.png`, `changes.png`, `learning.png`. These include private local chat context and are excluded from the VSIX.

## Editor workflow revision before publication

TTC no longer recreates the local Source Control list or prints full before/after code in the sidebar. It follows the open source editor and the actual native SCM comparison; staged (HEAD to index) and unstaged (index to working) comparisons keep their own before/after bytes. Git virtual URIs are resolved through their resource path, including display suffixes. Unrelated worktree files show a mismatch instead of being attributed to the selected chat. Cursor navigation selects the relevant hunk; historical reviews and untitled practice stay pinned during refresh.

The default learning view shows a short extract from the original Codex response when it names the file, otherwise the original request if available. Full context, file path, worktree metadata and older edits are collapsed. One primary action progresses from viewing a comparison to practicing a small replacement, comparing the practice, and the next section. New files, deletions and replacements over 16 lines or 1,600 characters per side do not become whole-file typing exercises. Text equality is not treated as proof of behavior.

The real-chat capture shows its exact original request with the next action above the fold. The extension-host checks also use a disposable Git fixture for native staged/unstaged diff handling and unsaved text; that fixture is separate from real-user evidence. See `artifacts/real-companion/editor-follow.json`. Source files in the user's worktree are never modified by verification.

## Reproduce

```sh
npm run check
npm run build
npm test
npm run test:host
node --import tsx scripts/test-companion-webview.mjs
node --import tsx scripts/test-codex-live.mjs EXISTING_THREAD_ID
node --import tsx scripts/test-companion-live.mjs EXISTING_THREAD_ID
node --import tsx scripts/test-real-companion.mjs EXISTING_THREAD_ID EDITED_RELATIVE_FILE
node scripts/test-real-companion-host.mjs EXISTING_THREAD_ID EDITED_RELATIVE_FILE
node scripts/test-editor-follow-host.mjs
node --import tsx scripts/test-real-follow.mjs EXISTING_THREAD_ID
```

The live scripts only read an existing chat. They never send a message, start an agent or resume active work. Browser QA can use `CHROMIUM_EXECUTABLE` for an installed browser with a fresh temporary profile.

Protocol references: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [official hooks and trust review](https://learn.chatgpt.com/docs/hooks), [existing-chat deep links](https://learn.chatgpt.com/docs/app/commands).
