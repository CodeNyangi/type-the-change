# Security

This project is an early preview. Supported security fixes target the latest release.

Use [GitHub's private vulnerability report](https://github.com/CodeNyangi/type-the-change/security/advisories/new) to contact the repository owner about a vulnerability. Private reporting is enabled. Korean and English are welcome.

Include the affected version, a minimal reproduction, and the impact you observed. Remove live credentials and unrelated private source. Do not put sensitive exploit details, tokens, or personal data in public issues or pull requests.

If the private form is unavailable, open an issue requesting a private reporting channel without including the vulnerability details.

Security boundaries include the read-only Codex protocol allowlist, registered worktree validation, immutable comparison snapshots, protected source paths and the absence of agent execution or automatic source edits. Optional Codex hooks require Codex's own trust review and forward only bounded metadata over a private local socket. They cannot inject context, approve tools or continue a turn. The optional MCP/imported-plan workflow has separate path and check-task restrictions. See [Privacy](PRIVACY.md) for account and storage details.
