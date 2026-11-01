# Privacy

Type the Change has no application backend, analytics, advertising, or telemetry of its own.

## ChatGPT connection

Sign-in opens OpenAI's official authorization page in your browser and receives its callback on a temporary loopback server bound to `127.0.0.1`. OAuth credentials, a stable installation host ID, and the registered client/account binding are stored in VS Code SecretStorage, not the project. A one-time welcome flag and your selected model are stored in extension global state. The webview keeps the current request draft in its local VS Code webview state.

Local VS Code windows coordinate account changes through a lock in the extension's global storage directory. This lock contains only an owner process ID and a random marker, never credentials or source code. It is removed after the operation; a later request can recover a lock whose owner process has exited.

When you request a plan, the extension sends your written intent and the current contents of the files you explicitly selected to OpenAI. Unsaved editor contents are included. It also requests the model list available to your connected account. It does not scan or upload the entire workspace. Requests set `store: false`; OpenAI's service terms and data handling still apply.

The extension does not log tokens or read credentials from ChatGPT, Codex, or another extension. Sign Out attempts remote revocation and removes local session credentials. The installation/client registration and account binding remain, as required by the registration flow. If remote revocation fails, the extension reports that it could not confirm revocation.

## Local files and MCP

The extension reads files needed for a plan and compares editor buffers. It never applies or saves a proposed source change. Demo files are created in a temporary directory.

The optional MCP server can read bounded source files under the one workspace path you configure. The connected client chooses which files to request, so connect only a client you trust with that workspace. Its own data handling and model provider also apply. The server rejects path traversal, symlinks, protected credential paths, oversized files, and non-UTF-8 input. These checks do not guarantee that ordinary source files contain no secrets; choose the workspace accordingly.

The server writes code-containing plans to `.type-the-change/plan.json`. The extension writes dated progress metadata to `.type-the-change/status.json`. In 0.3.0 it also writes `.type-the-change/review.json`: the current session’s last 100 decision records, with your prediction, evidence, decision, step/file, buffer hash, and time. A new session replaces that journal when its first decision is recorded. Notes are not automatically sent to a model and are not included in MCP status responses. They may contain whatever private information you type; the directory should stay out of source control. A decision is human-reported evidence, not an automated test result. These files are local, have restrictive permissions where supported, and can be removed when no session is active. Add `.type-the-change/` to the project's Git ignore rules. The MCP server has no source-editing, shell execution, or direct model-inference tools.

Your VS Code autosave, backups, synchronization, other extensions, and normal save behavior remain under your control. The extension does not upload plan history to a separate service.
