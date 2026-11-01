# Review and merge policy

Community participation is through issues: bug reports, root-cause analysis, feature proposals, and usability feedback. External code contributions and pull requests are not accepted. The repository owner, [@CodeNyangi](https://github.com/CodeNyangi), handles implementation and retains the final human review and manual merge decision for every project change. Automated checks support that decision; they do not replace it.

## Issue triage and owner changes

- Invite reports and discussion in issues. If an external pull request exists, direct the author to share the problem and analysis in an issue rather than reviewing or merging it as a code contribution.
- The owner prepares project changes in a branch and pull request, including documentation, dependencies, workflows, and ownership rules. Keep the PR in draft while incomplete.
- Before merging, the owner inspects the final diff, validation evidence, and remaining limits. Further changes require another human inspection.
- Merge manually only after that inspection and the required checks pass. Do not use automatic approvals, auto-merge, or a merge bot.
- Explain declined or deferred proposals when practical. Opening an issue does not obligate the owner to implement it.

## Owner-authored changes

GitHub does not allow authors to approve their own pull requests. The owner must still inspect an owner-authored PR and its validation before deciding to merge it manually. The protection design therefore gives only `@CodeNyangi` a pull-request-only exception to the separate owner-review rule. Use that exception only for owner-authored PRs after human inspection. It does not make external pull requests eligible for acceptance.

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
| [Main integrity](https://github.com/CodeNyangi/type-the-change/rules/26310204) | Active; default branch; required pull request, resolved conversations, up-to-date required GitHub Actions checks, linear history; no force push, deletion, or bypass actors | [main-integrity.json](../.github/rulesets/main-integrity.json) |
| [Owner review](https://github.com/CodeNyangi/type-the-change/rules/26310205) | Active; default branch; one approval, required code-owner review, stale approvals dismissed; only `@CodeNyangi` has a pull-request-only bypass | [owner-review.json](../.github/rulesets/owner-review.json) |

Issues are enabled. Pull requests remain enabled for the owner's change process, with creation restricted to repository collaborators (`pull_request_creation_policy: collaborators_only`). The collaborator list verified during this setup contains only `@CodeNyangi`, with admin access. Squash merge is the only enabled merge method, and auto-merge is disabled. See the versioned [repository policy](../.github/repository-policy.json). Editing policy JSON does not apply a GitHub settings change automatically.

PR creation restrictions are already configured on GitHub. They are separate from the branch rules above, which protect review and merge of owner changes. The contribution documentation and issue forms below still depend on their default-branch merge.

The proposed [CI workflow](../.github/workflows/ci.yml) includes a `CI required` final gate that depends on the code checks. Keep the exact required status contexts in `main-integrity.json` aligned with the live ruleset; adding a workflow job alone does not make it a required check.

## Initial setup

The initial setup is not fully active until the owner has reviewed and manually merged the setup PR into `main`. GitHub uses `CODEOWNERS` from a PR's base branch, so a proposed ownership file cannot request or enforce its own initial review. Issue forms and the issue-only contribution policy also need to land on the default branch before they guide community participation there. There is no external-contributor pull request template.

After the setup merge, verify the live rulesets and owner assignment together. Until then, distinguish already configured repository settings from the ownership and contribution files still awaiting merge.

Verify live GitHub settings after changing repository ownership, permissions, rules, or workflows. Do not describe protection as enabled based only on this file or a local `CODEOWNERS` change.

See GitHub's [code owner documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) for the distinction between review requests and required approvals, and the [contributing guide](../CONTRIBUTING.md) for issue-based participation.
