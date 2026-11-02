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

async function panel(surface='chat-toggle') {
  let result;
  await until(async () => {
    for (const frame of page.frames()) {
      try { if (await frame.locator('#'+surface).isVisible()) {result = frame; return true;} } catch {}
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

async function focusSource(frame) {
  await frame.locator('#edit').click();
  // Webview messages cross processes before showTextDocument restores focus.
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('.monaco-editor')));
}

async function predict(view, text='다음 값으로 바꾸면 기대한 결과가 나온다.') {
  await view.locator('#prediction').fill(text);
  await view.locator('#predict').click();
  await view.locator('#next').waitFor({state:'visible'});
}
async function decide(view, decision='keep', evidence='실제 변경 내역에서 기대한 값을 확인했다.') {
  await view.locator('#reflection').waitFor({state:'visible'});
  await view.locator('#evidence').fill(evidence);
  await view.locator('#'+decision).click();
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
  await mkdir(path.join(workspace,'scale'),{recursive:true});
  const scaleSource=Array.from({length:200},(_,i)=>`export const value${i} = ${i};`).join('\n')+'\n';
  for(let start=0;start<5000;start+=50)await Promise.all(Array.from({length:50},(_,i)=>writeFile(path.join(workspace,'scale',`module-${start+i}.ts`),scaleSource)));
  report.scaleFixture={files:5000,linesPerFile:200,totalLines:1000000};
  await mkdir(path.join(profile, 'User'), {recursive: true});
  await mkdir(artifacts, {recursive: true});
  const first = 'src/first.ts', second = 'src/한글 경로/second.ts';
  const firstBefore = 'export const first = 1;\n', secondBefore = 'export const second = 10;\n';
  await writeFile(path.join(workspace, first), firstBefore);
  await writeFile(path.join(workspace, second), secondBefore);
  await writeFile(path.join(workspace, 'pending.ts'), 'export const pending = 1;\n');
  await writeFile(path.join(profile, 'User/settings.json'), JSON.stringify({
    'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern',
    'workbench.enableExperiments': false, 'telemetry.telemetryLevel': 'off',
    'security.workspace.trust.enabled': false, 'window.restoreWindows': 'none',
    'editor.accessibilitySupport': 'off', 'editor.quickSuggestions': false,
    'chat.disableAIFeatures': true,
    'typeTheChange.codexPath': path.resolve('test/fixtures/codex-observer.mjs'),
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
    '--skip-welcome', '--skip-release-notes', '--disable-updates', '--no-sandbox', '--locale=en',
  ]});
  page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.locator('.monaco-workbench').waitFor({timeout: 60_000});
  // Opening the command palette before startup activation snapshots an
  // incomplete command list. Wait for the extension's visible entry point.
  await page.locator('.statusbar-item').filter({hasText: 'Type the Change'}).waitFor({state: 'visible', timeout: 60_000});
  await page.keyboard.press('Control+p');
  await page.locator('.quick-input-widget input[type="text"]').fill(first);
  await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'first.ts'}).first().waitFor({state:'visible'});
  await page.keyboard.press('Enter');await page.locator('.quick-input-widget').waitFor({state:'hidden'});
  await page.locator('.editor-actions .action-label[aria-label*="Type the Change"]').first().click();
  let view = await panel();
  await view.locator('#chat-toggle').waitFor({state:'visible'});
  assert.equal(await view.locator('html').getAttribute('lang'),'en');
  assert.equal(await view.locator('#intent').count(),0);
  await view.locator('#thread-list button').filter({hasText:'Existing Codex chat'}).click();
  await view.locator('#activity-list').filter({hasText:'Read the existing work.'}).waitFor({state:'visible'});
  await view.locator('#codex-open').waitFor({state:'visible'});
  report.checks.push('Existing Codex chat appears with public activity and no independent request composer.');
  await page.screenshot({path:path.join(artifacts,'codex-companion.png')});
  await view.locator('#options summary').first().click();

  await app.evaluate(({dialog}, file) => {
    dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]});
  }, planFile);
  await view.locator('[data-command="import"]').click();
  view = await panel('guide');
  await view.locator('#guide').waitFor({state: 'visible'});
  assert.equal(await view.locator('#proposal').isVisible(), false);
  assert.equal(await view.locator('#keep').isVisible(), false);
  await predict(view, '첫 값은 2, 둘째 값은 20이 된다.');
  await textIs(view, '#after', '2');
  assert.equal(await readFile(path.join(workspace, first), 'utf8'), firstBefore);
  await focusSource(view);await page.keyboard.type('2');await statusIs(view, 'matched');
  assert.equal(await view.locator('#keep').isVisible(), false);
  report.checks.push('Prediction precedes proposal; native typing matches but does not approve.');

  await page.keyboard.press('Home');await page.keyboard.type('// ');await statusIs(view, 'outside');
  await command('Type the Change: Compare Without Running a Check');await view.locator('#evidence').fill('범위 밖에도 주석이 들어갔다.');
  assert.equal(await view.locator('#keep').isDisabled(), true);
  await view.locator('#file').click();
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('.monaco-editor')));
  await page.keyboard.press('Home');
  for(let i=0;i<3;i++)await page.keyboard.press('Delete');
  await statusIs(view, 'matched');
  await view.locator('#next').waitFor({state:'visible'});
  report.checks.push('Outside edits remain comparable but cannot be kept; editing invalidates earlier evidence.');

  await page.keyboard.press('Control+Alt+Enter');
  await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'Compare only'}).waitFor({state:'visible'});await page.keyboard.press('Enter');
  await view.locator('#reflection').waitFor({state:'visible'});
  assert.equal(await view.locator('#keep').isDisabled(),true);
  await decide(view);
  await view.locator('#prediction-form').waitFor({state:'visible'});
  assert.equal(await view.locator('#proposal').isVisible(),false);
  await predict(view,'둘째 값이 20이 된다.');
  await textIs(view,'#after','20');
  await focusSource(view);await page.keyboard.type('20');await statusIs(view,'matched');
  await command('Type the Change: Compare Without Running a Check');await decide(view);await statusIs(view,'complete');
  assert.equal(await readFile(path.join(workspace,first),'utf8'),firstBefore);
  assert.equal(await readFile(path.join(workspace,second),'utf8'),secondBefore);
  await page.screenshot({path:path.join(artifacts,'complete.png')});
  report.checks.push('Compare shortcut requires a human decision; evidence advances to a fresh prediction; nothing auto-saves.');

  await view.locator('#review').click();
  const reviewChoice = page.locator('.quick-input-list .monaco-list-row').filter({hasText: first}).first();
  await reviewChoice.click();
  await page.locator('.monaco-diff-editor').first().waitFor({state: 'visible'});
  await page.screenshot({path: path.join(artifacts, 'review-diff.png')});
  report.checks.push('Review Changes opens the actual VS Code diff editor.');

  await view.locator('#conversation-tab').click();
  view = await panel();
  await view.locator('#chat-toggle').waitFor({state: 'visible'});
  assert.equal(await view.locator('#thread-name').innerText(),'Existing Codex chat');
  report.checks.push('New request returns to the composer and preserves its draft.');

  await view.locator('#demo').click();view=await panel('guide');await view.locator('#guide').waitFor({state:'visible'});
  await page.screenshot({path:path.join(artifacts,'learning-first-look.png')});
  await focusSource(view);await page.keyboard.type('  return tasks.filter(task => task.done);');await statusIs(view,'editing');
  await page.keyboard.press('Control+Alt+Enter');
  await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'Check task list'}).waitFor({state:'visible'});
  assert.ok((await page.locator('.quick-input-list').innerText()).includes('auto-save'));
  await page.keyboard.press('Enter');
  await view.locator('#check-result[data-status=failed]').waitFor({state:'visible'});await page.locator('.monaco-diff-editor').first().waitFor({state:'visible'});
  await until(async()=>(await page.locator('.monaco-diff-editor').allTextContents()).some(t=>t.includes('task.done')),'The diff must show the actual alternative.');
  await decide(view,'reject','완료한 항목을 남기므로 요청한 동작과 반대다.');await statusIs(view,'rejected');
  await page.screenshot({path:path.join(artifacts,'reject-alternative.png')});
  await view.locator('#end').click();view=await panel();await view.locator('#chat-toggle').waitFor({state:'visible'});
  assert.ok((await page.locator('.monaco-diff-editor').allTextContents()).some(t=>t.includes('task.done')));
  await view.locator('#demo').click();view=await panel('guide');
  await focusSource(view);await page.keyboard.type('  return tasks.filter(task => !task.done);');await statusIs(view,'matched');
  await page.keyboard.press('Control+Alt+Enter');await view.locator('#check-result[data-status=passed]').waitFor({state:'visible'});
  assert.equal(await page.locator('.terminal-wrapper').first().isVisible(),false,'checks must not open or focus the terminal');
  await view.locator('#evidence').fill('완료한 항목을 숨기고 빈 목록 검사도 통과했다.');await page.keyboard.press('Control+Enter');
  assert.equal(await view.evaluate(()=>document.activeElement?.id),'keep');await page.keyboard.press('Enter');await statusIs(view,'complete');
  await page.screenshot({path:path.join(artifacts,'learning-demo.png')});
  await view.locator('#end').click();view=await panel();await view.locator('#chat-toggle').waitFor({state:'visible'});
  report.checks.push('Actual alternative is compared, rejected with evidence, and preserved; a fresh correct sample is kept with evidence.');

  await mkdir(path.join(workspace, '.type-the-change'), {recursive: true});
  await writeFile(path.join(workspace, '.type-the-change/plan.json'), JSON.stringify({
    version: 1, title: 'MCP에서 받은 수정안', intent: '대기 중인 수정안을 열기',
    steps: [{file: 'pending.ts', before: '1', after: '2', reason: '값 수정'}],
  }));
  if (!(await view.locator('[data-command="loadPending"]').isVisible())) await view.locator('#options > summary').click();
  await view.locator('[data-command="loadPending"]').click();view=await panel('guide');
  await textIs(view, '#title', 'MCP에서 받은 수정안');
  await view.locator('#file').waitFor({state: 'visible'});
  assert.equal(await readFile(path.join(workspace, 'pending.ts'), 'utf8'), 'export const pending = 1;\n');
  await view.locator('#end').click();view=await panel();
  await view.locator('#chat-toggle').waitFor({state: 'visible'});
  report.checks.push('Open MCP Plan loads actual workspace bridge data without changing source.');

  const invalidPlan = path.join(root, 'invalid-plan.json');
  await writeFile(invalidPlan, '{not json');
  await app.evaluate(({dialog}, file) => {
    dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]});
  }, invalidPlan);
  if (!(await view.locator('[data-command="import"]').isVisible())) await view.locator('#options > summary').click();
  await view.locator('[data-command="import"]').click();
  await view.locator('#error').waitFor({state: 'visible'});
  await textIs(view, '#error', 'This suggestion is invalid. Choose a Type the Change JSON file.');
  assert.equal(await view.locator('#chat-toggle').isVisible(), true);
  await page.screenshot({path: path.join(artifacts, 'invalid-import-recovery.png')});
  report.checks.push('Invalid JSON reports an error while keeping the usable composer available.');
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
