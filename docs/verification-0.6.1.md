# Verification · 0.6.1

Verified locally on 2026-11-02. The release passes 213 automated tests, 612 headless layout cases, and three headless interaction groups in Korean and English at 300, 460 and 720 pixels across three themes. TypeScript checking and production bundling pass.

Real VS Code 1.144.0 host checks pass for native keyboard editing, exact source selection, actual failing/passing tasks, scoped saving, preservation of unrelated dirty files, review decisions, same-view chat/learning switching, and invalidation after a concurrent Git commit. The background Codex protocol in this run uses a fixture, not a live provider request.

A separate native window check confirmed the default Secondary Side Bar, moving to the Primary Side Bar and back through the visible Move view action, and preserving the question draft. Automated view recreation tests preserve unfinished learning notes only when the learning step and reviewed source still match.

Real temporary Git worktrees exercise independent edits, repeated modifications, commit changes, branch switches and worktree removal. A read-only scan of a changing local development repository also completed successfully; one two-worktree snapshot took about 50 ms. That observation is not a large-project performance guarantee. The monitor uses bounded batches and periodic snapshots, and cannot reconstruct every intermediate change or read unsaved buffers in other editor windows.

The 0.6.0 release separately verified one live signed-in Codex turn in a temporary read-only project. No new live-account inference or full Linux GUI run was performed for 0.6.1. The restored walkthrough is an earlier-UI recording and is labelled accordingly. These checks do not establish learning gains or general code correctness.
