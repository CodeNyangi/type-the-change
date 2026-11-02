# Codex contribution-policy alignment

Checked on 2026-11-01 against the official `openai/codex` repository at commit [`67f0994`](https://github.com/openai/codex/tree/67f0994b532b8740f14b5b738af7b7b2a915b1d6). Repository settings were read separately on that date; they are live settings, not part of that commit.

## Community participation

Codex currently receives community bug reports, root-cause analysis, feature requests, and feedback through issues. It does not accept external code contributions or pull requests. Type the Change follows that same contribution policy; the owner implements, reviews, and manually merges changes.

The repository remains available under its existing MIT license. A decision not to accept external PRs does not change the license or prevent readers from using or modifying their own copies.

| Official Codex evidence | Type the Change implementation |
| --- | --- |
| [Contribution policy](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/docs/contributing.md): issue-based community input; no external code or PRs | [CONTRIBUTING.md](../CONTRIBUTING.md), both READMEs, and maintainer policy use the same participation model |
| [Repository metadata](https://api.github.com/repos/openai/codex): `has_issues: true`, `has_pull_requests: true`, `pull_request_creation_policy: collaborators_only` | The same three values are applied and read back from GitHub; the sole collaborator is currently `@CodeNyangi` |
| [Issue forms](https://github.com/openai/codex/tree/67f0994b532b8740f14b5b738af7b7b2a915b1d6/.github/ISSUE_TEMPLATE): app, IDE extension, CLI, general bug, feature, documentation | Bug, feature, and documentation forms for this single VS Code extension; environment, reproduction, expected/actual behavior, and optional technical analysis |
| No PR template in the pinned [`.github` directory](https://github.com/openai/codex/tree/67f0994b532b8740f14b5b738af7b7b2a915b1d6/.github) | Removed the template that invited outside code contributions |
| [Security policy](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/SECURITY.md): private security reporting | Use this repository's enabled private vulnerability-reporting form, not OpenAI's Bugcrowd program |

The settings payload is recorded in [repository-policy.json](../.github/repository-policy.json). Editing that file alone does not update GitHub. Restricting PR creation must not disable public issues or the owner's own PRs.

## Review and CI

Codex's public [main ruleset](https://github.com/openai/codex/rules/6735016) requires code-owner approval, passing checks, squash merges, linear history, and protection from force pushes and deletion. Its [CODEOWNERS](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/.github/CODEOWNERS) assigns ownership to an OpenAI team. Here, all files belong to `@CodeNyangi`; see the [maintainer policy](maintainer-policy.md).

The [blocking-CI workflow](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/.github/workflows/blocking-ci.yml) ends in a `CI required` job. It runs even when dependencies fail and accepts only successful dependency results. This repository uses the same final-gate pattern for its TypeScript, tests, VS Code host, and package job. Failed, cancelled, skipped, missing, empty, or malformed results cannot satisfy the gate. PR CI tests GitHub's synthetic merge revision by using the default checkout for `pull_request`.

## Deliberate project-specific differences

This is an alignment of the contribution model and relevant controls, not a claim that every OpenAI organization setting was duplicated:

- The project retains its MIT license. OpenAI's CLA process, Rust/Bazel builds, signing services, release automation, and organization/team identities are specific to Codex and are not prerequisites for this extension.
- The existing requirement for the owner's final human decision remains. Only the owner has a PR-only exception to the approval rule for owner-authored PRs, because GitHub prevents self-approval. The independent integrity rule has no bypass actors.
- This repository keeps its stricter requirements for up-to-date checks, resolved conversations, and dismissal of stale approvals. Codex's public ruleset showed those three options disabled on the comparison date.
- Public Codex ruleset responses did not expose their bypass-actor lists. No hidden administrator privileges are inferred or claimed to match.
- Codex's six product-specific issue forms are reduced to the three relevant forms here. Korean and English remain supported. Blank issues remain possible; the pinned Codex issue-template directory did not contain a chooser configuration that disables them.

The native PR restriction applies immediately. Contribution text, issue forms, ownership files, and workflow changes become the default-branch policy after the owner reviews and merges the setup PR. No automatic PR closure, approval, or merge is used to implement this policy.
