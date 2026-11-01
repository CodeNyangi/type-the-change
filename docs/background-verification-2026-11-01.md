# Background verification — 2026-11-01

The user's Mac desktop, current workspace, installed VS Code windows, and existing browser profiles were not opened or switched during this follow-up. Local code tests and an isolated Chromium Headless Shell ran in the background. Real VS Code UI tests ran on a GitHub-hosted Linux virtual display with a temporary workspace and profile.

## Results and evidence

The expanded audit fixes passed [this complete CI run](https://github.com/CodeNyangi/type-the-change/actions/runs/41310363946) at commit `b1ae4d0`. Subsequent documentation, JSON-error wording, and packaging-dependency changes are covered by [the latest PR checks](https://github.com/CodeNyangi/type-the-change/pull/1/checks). This is an executable coverage report, not a claim that every possible editor setting, account, OS input method, or human learning outcome has been tested.

| Area | Verified result | Boundary |
| --- | --- | --- |
| macOS background unit/integration tests | 148 passed, no skips | No native Mac window launched; VS Code/provider boundaries use mocks where stated in tests |
| Linux application tests | 148 passed, no skips | Includes real filesystem, subprocess, loopback OAuth callback, and stdio MCP cases |
| Windows application tests | 146 passed; 2 POSIX named-pipe cases skipped | Windows has a different named-pipe API; these POSIX cases run on macOS/Linux |
| VS Code 1.142.0 native host | Passed, including native keyboard cases | Real Linux editor, virtual display; automatic pairs, indentation, CRLF, deletion, lifecycle and layout checks |
| Minimum supported VS Code 1.100.0 | Passed, including native keyboard cases | Separate Linux host job validates the manifest's minimum version |
| Real VS Code UI | 10 flow groups passed | Real Electron workbench and extension webview; JSON file-dialog result alone is substituted |
| Headless production webview | 72 rendered cases; both shortcut conventions and keyboard scrolling passed | 300/460/720px × dark/light/high contrast × 8 states; simulated host and representative theme tokens |
| Required CI gate | 23 tests passed | Failed, skipped, cancelled, missing and malformed dependency results cannot pass |
| Packaging | 14-file VSIX; packaged bundles and manifest match the current build | Test scripts, profiles, screenshots, node_modules and credentials are excluded |

The UI workflow uploads `background-ui-evidence` to the linked run. It contains the actual VS Code screenshots/report and 72 headless screenshots with ARIA snapshots. Representative real-editor screenshots show the source and guide together, the completed flow, the native diff, and recovery after invalid JSON. Headless checks observed no JavaScript/CSP errors, outer horizontal overflow, unnamed visible buttons in Chromium's accessibility tree, or off-screen buttons in the tested matrix. This is not full screen-reader or WCAG certification.

## Real editor flows exercised

1. Open the composer from the command palette; prevent empty submission and accept a Korean request draft.
2. Select files from different folders, including Korean paths, through the actual multi-select Quick Pick; retain selection when cancelled.
3. Import a JSON proposal and show guidance without applying source edits.
4. Type in the native editor, detect out-of-range edits, expose review, and recover when the buffer is restored.
5. Use the native continuation shortcut, complete the second file, and verify that disk source remains unsaved.
6. Open the actual VS Code original/current diff.
7. Return to a new request while preserving the request draft.
8. Start the sample and end guidance.
9. Open a real workspace MCP bridge plan without modifying source.
10. Reject malformed imported JSON with a usable composer and a Korean recovery instruction.

The automated test refuses to launch outside Linux CI with a display. It cannot accidentally open the installed Mac editor. `npm run test:host` remains a separate native-host command that can open a local VS Code window; do not use it when the display must remain undisturbed.

## Defects found and corrected

- **Hidden guidance during actual typing:** Home could occupy the only editor group, then JSON import opened source in that same group and hid the guide. The remote screenshot reproduced this. Start now focuses source in column One before revealing active guidance in column Two; stopped/replaced operations cannot reveal stale guidance. Native-host and UI regressions verify both views remain visible.
- **Unfinishable oversized proposal:** A plan could produce a file above 64 KiB and pass initial validation, then fail at Next. Every intermediate UTF-8 result is now bounded before replacing a valid session or MCP proposal, including CRLF conversion and multibyte text.
- **Conflicting aliases:** Case aliases or hard links could describe different expected states of one physical file. Distinct plan paths with the same physical identity are rejected; sequential steps using the same path remain valid.
- **Lost completed review after document reload:** Closing/reloading unchanged text could erase completion. Prior review survives temporary document revalidation, while displayed/exported completion stays false until fresh text matches. Changed text still invalidates completion.
- **Concurrent account refresh:** Two extension hosts could rotate one token twice and let a later failure erase the successful refresh. Sign-in, token access/refresh and sign-out now serialize and reload SecretStorage after acquiring a shared local lock.
- **Incomplete reconnect handling:** All documented terminal refresh-token errors now clear unusable credentials and restore reconnect guidance. Transient failures preserve credentials.

Account locks live under the extension's global storage directory and contain only a PID and random owner marker. Credentials remain in SecretStorage. A prepared nonempty directory is published atomically; recovery requires a confirmed dead PID and removes only that owner's marker. Live PIDs, permission denial and PID reuse fail closed. Waiting is cancellable and bounded at 20 seconds; another window's browser sign-in may continue longer and require a retry. Tests use real child processes and competing recovery attempts after killing an owner. This coordinates updated extension hosts sharing the same local storage path, not different machines. A crash before publication may leave a harmless candidate directory containing no credentials.

## Dependency verification

The previous development-only advisory for VSCE's minimatch dependency is addressed with an exact override scoped to `@vscode/vsce`: `minimatch@11.0.1`. The [advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) identifies 11.0.1 as patched. VSCE's used named function/CommonJS API and Node 22 support were checked against the upstream sources. The complete 14-file VSIX listing is identical before and after the override, and packaging succeeds. npm reports zero known vulnerabilities after the change; the earlier runtime-only audit also reported zero. Remove the override when VSCE adopts a patched version in its own dependency range.

## Limits that remain

- No live ChatGPT consent, subscription eligibility, provider-side token rotation, model inference, usage charge, or real OS SecretStorage persistence was tested. Provider and account tests use synthetic credentials and responses.
- Synthetic composition events verify the webview's shortcut guard. They do not prove physical Korean IME behavior on macOS or Windows.
- The Linux JSON chooser returns a supplied fixture path; the platform's native file-picker UI itself is not exercised. Quick Pick file selection is exercised through the actual VS Code UI.
- Text agreement, successful tests and a usable screen do not establish that typing improves retention or understanding. That needs observation with people.

No approval, automatic merge, manual merge, release publication, or installation into the user's active VS Code profile was performed. Changes remain in the owner's review PR.
