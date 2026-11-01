# Review and merge policy

Anyone may open an issue or pull request. The repository owner, [@CodeNyangi](https://github.com/CodeNyangi), retains the final human review and merge decision for every change. Feedback and automated checks can help that decision; they do not replace it.

## Contribution review

- Use a pull request for changes to `main`, including documentation, dependencies, workflows, and ownership rules.
- Keep work in draft while it is incomplete. Once ready, the owner reviews the problem, final diff, validation evidence, and any remaining limits.
- External contributions need the owner's approval of the current changes. Further changes after approval need another owner review.
- Merge manually only after that review and the required checks pass. Do not use automatic approvals, auto-merge, or a merge bot.
- A declined or deferred proposal should receive a short explanation when practical. Opening an issue does not obligate anyone to implement it.

## Owner-authored changes

GitHub does not allow authors to approve their own pull requests. The owner must still inspect an owner-authored PR and its validation before deciding to merge it manually. The protection design therefore gives only `@CodeNyangi` a pull-request-only exception to the separate owner-review rule. Use that exception only for owner-authored PRs after human inspection; external PRs still need the owner's recorded approval.

This exception does not bypass the separate pull request, CI, conversation-resolution, or branch-integrity requirements. It is not authorization for an agent to merge, approve, enable auto-merge, or change repository rules on the owner's behalf.

## Repository settings

This document states the project's policy. Files in Git do not prove that GitHub is enforcing it. In particular, `CODEOWNERS` requests a reviewer; requiring that approval is a separate repository setting.

Keep two independent rulesets so the self-review exception does not weaken the other requirements:

- **Main integrity:** target `main`; require a pull request, the required GitHub Actions check on an up-to-date branch, resolved review conversations, and linear history. Block force pushes and deletion. This ruleset has no bypass actors.
- **Owner review:** target `main`; require one approving review from the code owner and dismiss stale approvals when reviewed code changes. Its only bypass actor is `@CodeNyangi`, limited to the pull-request merge path described above.

Keep auto-merge disabled. Do not add automation to either ruleset's bypass list, and do not bypass the main-integrity rules for owner-authored work. The blanket owner entry in `.github/CODEOWNERS` includes that ownership file and all workflows.

### Configuration recorded on 2026-11-01

The following live GitHub settings were configured during the repository setup. This dated observation is separate from the contribution files still awaiting their initial merge:

| Setting | Recorded configuration | Versioned definition |
| --- | --- | --- |
| [Main integrity](https://github.com/CodeNyangi/type-the-change/rules/26310204) | Active; default branch; required pull request, resolved conversations, up-to-date GitHub Actions `check`, linear history; no force push, deletion, or bypass actors | [main-integrity.json](../.github/rulesets/main-integrity.json) |
| [Owner review](https://github.com/CodeNyangi/type-the-change/rules/26310205) | Active; default branch; one approval, required code-owner review, stale approvals dismissed; only `@CodeNyangi` has a pull-request-only bypass | [owner-review.json](../.github/rulesets/owner-review.json) |

Issues are enabled. Squash merge is the only enabled merge method, and auto-merge is disabled. The JSON files record the intended ruleset configuration; editing them does not apply a GitHub settings change automatically.

## Initial setup

The initial setup is not fully active until the owner has reviewed and manually merged the setup PR into `main`. GitHub uses `CODEOWNERS` from a PR's base branch, so a proposed ownership file cannot request or enforce its own initial review. Issue forms and the pull request template also need to land on the default branch before contributors can use them normally.

After the setup merge, verify the live rulesets and owner assignment together. Until then, distinguish already configured repository settings from the ownership and contribution files still awaiting merge.

Verify live GitHub settings after changing repository ownership, permissions, rules, or workflows. Do not describe protection as enabled based only on this file or a local `CODEOWNERS` change.

See GitHub's [code owner documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) for the distinction between review requests and required approvals, and the [contributing guide](../CONTRIBUTING.md) for the contributor workflow.
