# Keyboard workflow verification — 0.4.0

The extension now carries a review through prediction, native editing, an explicitly selected check, comparison and a human decision. Continuing and a zero task exit never accept a proposal.

Release checks are attached to the [owner review PR](https://github.com/CodeNyangi/type-the-change/pull/1/checks). The packaged README links are frozen to the package source commit; the recording stores its own source commit in `assets/recording.json`.

## Verified behavior

- 189 application tests pass locally and on Linux; Windows passes the applicable suite with two POSIX-specific cases skipped, including repeated competing-lock recovery.
- 450 headless layouts cover 25 states, three widths, three theme families and both English/Korean main controls. Three keyboard interaction groups exercise production panel commands, IME composition guards and explicit decision controls.
- Real VS Code 1.142.0 and minimum supported 1.100.0 run native editor and task checks. Sequential native keyboard handoffs run five times per host. An incorrect `break` fails; a corrected `continue` passes. Unrelated dirty files remain unsaved, edits invalidate task evidence, and passing never completes a human judgment.
- Real workbench UI covers cross-directory/Korean filename selection, prediction, typing, comparison, explicit decisions, MCP plans, JSON recovery, task selection and keyboard continuation. A generated repository contains 5,000 files with 200 lines each (1,000,000 total lines); a file beyond the initial suggestion limit is found by name.
- The tutorial uses a real isolated VS Code window on a Linux virtual display. The editor title icon opens the guide and Try demo starts the exercise. Subsequent editing, selected task execution, comparison and decisions use keyboard controls. Main controls, notes and captions in the video are English. No private project data or live AI response appears.

## Problems caught during verification

Opening a source document could steal focus after prediction became visible. Prediction now appears after source preparation, with focus assigned to the guide. A later repeated run exposed delayed webview focus messages. The handoff now waits for both workbench and iframe acknowledgments, disables note input while moving, and cancels obsolete requests instead of replaying them when a webview becomes ready. Returning to code drains earlier rendered state before native input resumes.

VS Code tasks normally save all dirty editors. The first task picker now explicitly describes setting `task.saveBeforeRun` to `never` before applying it to the workspace, or to user settings if no folder is open. Cancel and compare-only choices make no preference change. The extension then saves only reviewed documents and checks the preference again before task launch. The selected preference also affects other tasks in its scope and can be changed in VS Code settings.

## Practical limits

The large fixture verifies filename discovery and bounded selection, not whole-repository semantic analysis or production-scale latency. Generation still accepts at most eight files, each at most 64 KiB; plans contain at most 20 steps. Users choose a relevant existing foreground task. Test selection is not inferred from dependency graphs.

Task evidence records a process exit, source hash, duration and available VS Code diagnostics. The stable task API does not expose the full terminal transcript; tasks without a process exit remain unverified, and diagnostic detail depends on the task's problem matcher. These observations do not establish that the task covered every affected behavior. Notes and the keep/reject/defer choice remain the user's judgment.

Real-account ChatGPT consent/inference, native operating-system Korean IME behavior, screen-reader certification and measured learning gains remain unverified. Native desktop UI was not opened on the user's Mac; the private workspace's experiment was connected through a local ignored task configuration, without running model APIs or modifying service code.
