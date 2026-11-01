// This test intentionally runs only on a Linux CI virtual display. It never
// launches the installed editor or takes focus on a developer's Mac.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright';
import {downloadAndUnzipVSCode} from '@vscode/test-electron';

if (process.platform !== 'linux' || process.env.CI !== 'true' || !process.env.DISPLAY) {
  throw new Error('Run this UI check only on Linux CI with xvfb-run. Local desktop launch is disabled.');
}

const root = await mkdtemp(path.join(tmpdir(), 'ttc-ui-'));
const workspace = path.join(root, 'workspace');
const profile = path.join(root, 'profile');
const artifacts = path.resolve('artifacts/vscode-ui');
const report = {environment: 'Linux CI virtual display; isolated VS Code profile', checks: [], limitations: [
  'JSON import uses a substituted native dialog result; the extension import path and real webview are exercised.',
  'No real account, provider inference, or operating-system IME is used.',
]};
let app, page;

async function until(predicate, message, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function command(title) {
  await page.keyboard.press('F1');
  const input = page.locator('.quick-input-widget input[type="text"]');
  await input.waitFor({state: 'visible'});
  await input.fill(`>${title}`);
  const item = page.locator('.quick-input-list .monaco-list-row').filter({hasText: title}).first();
  await item.waitFor({state: 'visible'});
  await item.click();
}

async function panel() {
  let result;
  await until(async () => {
    for (const frame of page.frames()) {
      try { if (await frame.locator('#intent').count()) {result = frame; return true;} } catch {}
    }
    return false;
  }, 'The real extension webview did not load.');
  return result;
}

async function textIs(frame, selector, expected) {
  await until(async () => (await frame.locator(selector).innerText()) === expected,
    `Expected ${selector} to show ${JSON.stringify(expected)}`);
}

async function statusIs(frame, expected) {
  await until(async () => (await frame.locator('#status').getAttribute('data-state')) === expected,
    `Expected guide state ${expected}`);
}

async function toggleFile(relative) {
  const input = page.locator('.quick-input-widget input[type="text"]');
  await input.fill(relative);
  const row = page.locator('.quick-input-list .monaco-list-row').filter({hasText: relative}).first();
  await row.waitFor({state: 'visible'});
  await row.locator('.monaco-checkbox').click();
}

try {
  await mkdir(path.join(workspace, 'src', '한글 경로'), {recursive: true});
  await mkdir(path.join(profile, 'User'), {recursive: true});
  await mkdir(artifacts, {recursive: true});
  const first = 'src/first.ts', second = 'src/한글 경로/second.ts';
  const firstBefore = 'export const first = 1;\n', secondBefore = 'export const second = 10;\n';
  await writeFile(path.join(workspace, first), firstBefore);
  await writeFile(path.join(workspace, second), secondBefore);
  await writeFile(path.join(profile, 'User/settings.json'), JSON.stringify({
    'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern',
    'workbench.enableExperiments': false, 'telemetry.telemetryLevel': 'off',
    'security.workspace.trust.enabled': false, 'window.restoreWindows': 'none',
    'editor.accessibilitySupport': 'off', 'editor.quickSuggestions': false,
    'chat.disableAIFeatures': true,
  }));
  const planFile = path.join(root, 'plan.json');
  await writeFile(planFile, JSON.stringify({version: 1, title: '두 값 바꾸기', intent: '두 값을 직접 수정합니다.', steps: [
    {file: first, before: '1', after: '2', reason: '첫 번째 값'},
    {file: second, before: '10', after: '20', reason: '두 번째 값'},
  ]}));
  const executablePath = await downloadAndUnzipVSCode('1.142.0');
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({executablePath, env, timeout: 60_000, args: [
    workspace, `--user-data-dir=${profile}`, `--extensions-dir=${path.join(root, 'extensions')}`,
    `--extensionDevelopmentPath=${process.cwd()}`, '--disable-workspace-trust',
    '--skip-welcome', '--skip-release-notes', '--disable-updates', '--no-sandbox',
  ]});
  page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.locator('.monaco-workbench').waitFor({timeout: 60_000});
  // Opening the command palette before startup activation snapshots an
  // incomplete command list. Wait for the extension's visible entry point.
  await page.locator('.statusbar-item').filter({hasText: 'Type the Change'}).waitFor({state: 'visible'});
  await command('Type the Change: Start');
  let view = await panel();
  await view.locator('#home').waitFor({state: 'visible'});
  assert.equal(await view.locator('#generate').isDisabled(), true);
  await view.locator('#intent').fill('음수 가격을 제외해 주세요');
  assert.equal(await view.locator('#generate').isEnabled(), true);
  report.checks.push('Actual webview loads; empty requests disabled; Korean draft enables submit.');

  await view.locator('#files').click();
  await toggleFile(first);
  await toggleFile(second);
  await page.locator('.quick-input-widget input[type="text"]').press('Enter');
  await textIs(view, '#files', '파일 2개');
  assert.ok((await view.locator('#files').getAttribute('title')).includes(second));
  await view.locator('#files').click();
  await page.locator('.quick-input-widget input[type="text"]').waitFor({state: 'visible'});
  await page.keyboard.press('Escape');
  await textIs(view, '#files', '파일 2개');
  report.checks.push('Real Quick Pick selects files across folders and Korean paths; cancel preserves selection.');
  await page.screenshot({path: path.join(artifacts, 'home-files.png')});

  await app.evaluate(({dialog}, file) => {
    dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]});
  }, planFile);
  await view.locator('#other summary').click();
  await view.locator('[data-command="import"]').click();
  await view.locator('#guide').waitFor({state: 'visible'});
  await textIs(view, '#after', '2');
  assert.equal(await view.locator('#next').isDisabled(), true);
  assert.equal(await readFile(path.join(workspace, first), 'utf8'), firstBefore);
  await view.locator('#file').click();
  await page.keyboard.type('2');
  await statusIs(view, 'matched');
  report.checks.push('JSON import opens a real guide without editing source; native keyboard typing matches the first step.');

  await page.keyboard.press('Home');
  await page.keyboard.type('// ');
  await statusIs(view, 'outside');
  assert.equal(await view.locator('#next').isDisabled(), true);
  assert.equal(await view.locator('#review').isVisible(), true);
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await statusIs(view, 'matched');
  report.checks.push('Out-of-range edits block Next and expose review; restoring the buffer re-enables progress.');

  await page.keyboard.press('Control+Alt+Enter');
  await textIs(view, '#after', '20');
  await view.locator('#file').click();
  await page.keyboard.type('20');
  await statusIs(view, 'matched');
  await view.locator('#next').click();
  await statusIs(view, 'complete');
  assert.equal(await readFile(path.join(workspace, first), 'utf8'), firstBefore);
  assert.equal(await readFile(path.join(workspace, second), 'utf8'), secondBefore);
  await page.screenshot({path: path.join(artifacts, 'complete.png')});
  report.checks.push('Real editor shortcut advances; second file typing completes; source files are not automatically saved.');

  await view.locator('#review').click();
  const reviewChoice = page.locator('.quick-input-list .monaco-list-row').filter({hasText: first}).first();
  await reviewChoice.click();
  await page.locator('.monaco-diff-editor').first().waitFor({state: 'visible'});
  await page.screenshot({path: path.join(artifacts, 'review-diff.png')});
  report.checks.push('Review Changes opens the actual VS Code diff editor.');

  await command('Type the Change: Plan a Change with ChatGPT');
  view = await panel();
  await view.locator('#home').waitFor({state: 'visible'});
  assert.equal(await view.locator('#intent').inputValue(), '음수 가격을 제외해 주세요');
  report.checks.push('New request returns to the composer and preserves its draft.');
  report.success = true;
  console.log(`VS CODE UI PASSED: ${report.checks.length} flow groups.`);
} catch (error) {
  report.success = false;
  report.error = error.stack || String(error);
  if (page) {
    await page.screenshot({path: path.join(artifacts, 'failure.png')}).catch(() => {});
    await writeFile(path.join(artifacts, 'failure-dom.html'), await page.content().catch(() => '')).catch(() => {});
  }
  process.exitCode = 1;
  console.error(error);
} finally {
  await mkdir(artifacts, {recursive: true});
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  await app?.close().catch(() => {});
  await rm(root, {recursive: true, force: true});
}
