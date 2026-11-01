# Contributing

Anyone can report a bug, suggest an improvement, share a confusing moment, or open a pull request. Korean and English are welcome. Small fixes and documentation improvements do not need an issue first; discuss larger changes before investing time in them.

버그 제보, 사용 경험, 개선 제안, PR 모두 환영합니다. 한국어로 편하게 작성해 주세요. 모든 변경의 최종 검토와 병합 결정은 저장소 소유자가 직접 합니다.

Use the [issue chooser](https://github.com/CodeNyangi/type-the-change/issues/new/choose) for bugs, ideas, or usability feedback. Keep examples small and remove private source and credentials. For sensitive findings, follow [Security](SECURITY.md) instead of posting details publicly.

## Make a change

1. Fork the repository and create a branch from the current upstream `main`, such as `fix/reopen-guide` or `docs/setup`.
2. Make one focused change. Use small commits with clear messages describing the behavior or reason; no special commit-message format is required.
3. Run the checks relevant to the change, and inspect your own diff.
4. Open a **draft PR** against upstream `main`. Explain the problem, resulting behavior, and how you checked it. Link an issue if there is one.
5. Mark the PR ready when it can be reviewed. Respond to feedback in the same PR; tell the reviewer if you rewrite its history.
6. Wait for the repository owner's human review. The owner decides whether to merge and performs the merge manually. Passing CI or an automated review does not approve a PR.

Keep `main` changes behind pull requests. Do not enable auto-merge or use a bot to approve or merge changes. [Maintainer policy](docs/maintainer-policy.md) explains the review rules and their relationship to GitHub settings.

## Development and verification

Use Node.js 22 or newer:

```sh
npm ci
npm run check
npm test
npm run build
```

For editor behavior, also run `npm run test:host`. It opens an isolated VS Code window and temporary workspace, so run it when you can spare the display. Set `TTC_REQUIRE_NATIVE_TYPING=1` to require native typing coverage on macOS. Linux CI uses `xvfb-run -a npm run test:host`. A skipped native-input test is not a typing pass.

`npm run preview` provides the production panel with a simulated host for UI checks. It does not verify real editor behavior or account access. `npm run package` builds an installable VSIX in `artifacts/`.

For code changes, record the commands and results in the PR. Add focused regressions for changed behavior, especially paths, plan validation, authentication, cancellation, or editor state. Documentation-only changes need link and content checks; explain any relevant checks you could not run. UI changes benefit from a screenshot or short recording, with personal information removed.

## Keep the experience and boundaries intact

Preserve the central interaction: a person reads, types, and reviews a proposed code change. Keep the interface small. Never silently apply source edits or treat matching text as proof of correctness.

Do not commit tokens, real workspace plans, personal source, generated bundles, or VSIX files. Keep external requests behind explicit user actions and document changes to data handling in [PRIVACY.md](PRIVACY.md).

Changes to authentication must stay aligned with the linked official OpenAI documentation and must not read credentials belonging to another app. Never use live credentials in automated tests.

AI-assisted contributions are welcome. You remain responsible for understanding the change, reviewing its diff, and describing what was actually tested. Automation does not replace the owner's review.
