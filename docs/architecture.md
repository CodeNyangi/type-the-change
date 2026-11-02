# Architecture

The default learner surface is a card reader. `lesson.ts` parses an explicit `ttc-lesson` block from the original Codex chat, bounds its content and matches the quoted code against an edit recorded in that chat. `Companion.syncLesson` uses bounded read-only pagination to find that anchor. A historical worktree needs an exact recorded absolute path; comparisons use virtual documents and never open its current filesystem.

`learningDisplay` sends only task-picker metadata, connection errors and one verified card to `companionHtml`. Raw transcripts, editor reviews, worktree inventories, requests and operational messages do not enter the learner payload. The explanation is visible immediately, followed by key changed code; prior code and the original comparison are optional. Legacy quiz-shaped cards are accepted, but question/choice/answer fields are discarded. New requests use version 2 with no quiz fields. Codex remains the author and owner of the explanation and source card.

`prepareLesson` copies a bounded request and opens the original Codex deeplink. It never sends the request, invokes a model, resumes an agent or changes global Codex instructions. The person pastes and sends in the original chat. Later cards arrive through the same read-only observer.

Optional imported-plan editing/checking and native comparison commands remain separate existing features. Their source safety, scoped saving and explicit check rules are retained. There is no independent TTC agent, authentication flow or conversation/learning database.
