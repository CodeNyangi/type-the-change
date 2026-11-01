import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import type { PanelState } from '../src/panel-view.js';

// Exercise real extension command orchestration and authentication together.
// Only VS Code's rendering/storage APIs and the provider transport are mocked.
const bundled = await build({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['vscode'], write: false });
const loadExtension = new Function('require', 'module', 'exports', bundled.outputFiles[0].text);
const realRequire = createRequire(import.meta.url);
const ACCOUNT = 'typeTheChange.chatgpt.account.v1';
afterEach(() => mock.restoreAll());

function fixture(failStatusAfterRevocation = false) {
  const storage = mkdtempSync(join(tmpdir(), 'ttc-auth-storage-'));
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const messages: PanelState[] = [];
  const values = new Map<string, string>([[ACCOUNT, JSON.stringify({
    version: 1, clientId: 'oaiapp_test', subject: 'subject-1', nonce: 'nonce',
    idToken: 'test-id', accessToken: 'expired-access', refreshToken: 'test-refresh', expiresAt: 0,
    scopes: ['openid', 'resource.invoke', 'chatgpt.tokens.use.direct'],
  })]]);
  const disposable = () => ({ dispose() {} });
  const event = (_handler: unknown) => disposable();
  let failStatus = false;
  const subscriptions: { dispose(): void }[] = [];
  const vscode = {
    env: { remoteName: undefined, openExternal: async () => assert.fail('No browser should open while refreshing') },
    StatusBarAlignment: { Left: 1 }, ViewColumn: { Beside: -2 },
    ThemeColor: class { constructor(readonly id: string) {} },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    workspace: {
      isTrusted: true, registerTextDocumentContentProvider: disposable,
      onDidChangeTextDocument: event, onDidOpenTextDocument: event, onDidCloseTextDocument: event,
      createFileSystemWatcher: () => ({ ...disposable(), onDidCreate: event, onDidChange: event }),
    },
    commands: {
      registerCommand(name: string, action: (...args: unknown[]) => unknown) { commands.set(name, action); return disposable(); },
      executeCommand: async () => {},
    },
    window: {
      visibleTextEditors: [], createStatusBarItem: () => ({ ...disposable(), show() {} }),
      createTextEditorDecorationType: disposable, onDidChangeVisibleTextEditors: event,
      createWebviewPanel: () => ({
        ...disposable(), reveal() {}, onDidDispose: event,
        webview: { html: '', onDidReceiveMessage: event, postMessage: async (state: PanelState) => { messages.push(state); return true; } },
      }),
    },
  };
  const module = { exports: {} as { activate(context: unknown): unknown } };
  loadExtension((name: string) => name === 'vscode' ? vscode : realRequire(name), module, module.exports);
  module.exports.activate({
    subscriptions, globalStorageUri: { fsPath: storage }, globalState: { get() { return undefined; }, async update() {} },
    secrets: {
      async get(key: string) { if (failStatus) throw Error('private-storage-error'); return values.get(key); },
      async store(key: string, value: string) {
        values.set(key, value);
        if (key === ACCOUNT && !JSON.parse(value).idToken) failStatus = failStatusAfterRevocation;
      },
      async delete(key: string) { values.delete(key); },
    },
  });
  const run = async (name: string) => { const action = commands.get(`typeTheChange.${name}`); assert.ok(action); await action(); };
  return { run, messages, values, close() { for (const subscription of subscriptions) subscription.dispose(); rmSync(storage, { recursive: true, force: true }); } };
}

test('revoked refresh exposes reconnect in the actual command-to-panel flow', async () => {
  const f = fixture();
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://auth.openai.com/api/accounts/oauth/token');
    assert.equal(new URLSearchParams(String(init.body)).get('grant_type'), 'refresh_token');
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  });
  try {
    await f.run('start');
    assert.equal(f.messages.at(-1)?.connected, true, 'expired but renewable account initially appears connected');
    await f.run('chooseModel');
    assert.equal(JSON.parse(f.values.get(ACCOUNT)!).accessToken, undefined, 'auth actually clears the revoked token');
    assert.equal(f.messages.at(-1)?.connected, false, 'the panel must show Continue with ChatGPT without reopening it');
    assert.match(f.messages.at(-1)?.error ?? '', /연결이 만료.*다시 연결/);
    assert.equal(f.messages.at(-1)?.busy, false);
  } finally { f.close(); }
});

test('a secondary status-read failure cannot swallow the original reconnect error', async () => {
  const f = fixture(true);
  mock.method(globalThis, 'fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  try {
    await f.run('start');
    await f.run('chooseModel');
    assert.match(f.messages.at(-1)?.error ?? '', /연결이 만료.*다시 연결/);
    assert.doesNotMatch(f.messages.at(-1)?.error ?? '', /private-storage-error/);
    assert.equal(f.messages.at(-1)?.busy, false);
  } finally { f.close(); }
});

test('all documented terminal refresh errors restore the localized reconnect action', async () => {
  for (const code of ['invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']) {
    const f = fixture();
    mock.method(globalThis, 'fetch', async () => Response.json({ error: code }, { status: 400 }));
    try {
      await f.run('start'); await f.run('chooseModel');
      assert.equal(f.messages.at(-1)?.connected, false);
      assert.match(f.messages.at(-1)?.error ?? '', /연결이 만료.*다시 연결/);
    } finally { f.close(); mock.restoreAll(); }
  }
});
