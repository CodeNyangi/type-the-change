import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkspaceFile, writeBridgeFile, readBridgeFile, WorkspaceFileError, MAX_SOURCE_BYTES } from '../src/workspace-files.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'type-change-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'example.ts'), 'export const answer = 41;\n');
  return root;
}

function withCode(code: string) {
  return (error: unknown) => error instanceof WorkspaceFileError && error.code === code;
}

test('source reader returns bounded saved UTF-8 contents without changing the file', async t => {
  const root = await fixture(t);
  const before = await readFile(join(root, 'src', 'example.ts'));
  assert.equal(await readWorkspaceFile(root, 'src/example.ts'), before.toString());
  assert.deepEqual(await readFile(join(root, 'src', 'example.ts')), before);
});

test('source reader rejects traversal, credentials, internal files, and missing paths', async t => {
  const root = await fixture(t);
  for (const file of ['../example.ts', '/tmp/example.ts', 'src/../../example.ts', 'src\\example.ts', '.env', '.env.local', '.git/config', '.codex/auth.json', '.type-the-change/plan.json', 'src/auth.json']) {
    await assert.rejects(readWorkspaceFile(root, file), withCode('unsafe_path'), file);
  }
  await assert.rejects(readWorkspaceFile(root, 'src/missing.ts'), withCode('missing_file'));
  await assert.rejects(readWorkspaceFile(root, 'src'), withCode('not_regular_file'));
});

test('file and directory symlinks are rejected even when they remain in the workspace', async t => {
  const root = await fixture(t);
  await symlink(join(root, 'src', 'example.ts'), join(root, 'alias.ts'));
  await symlink(join(root, 'src'), join(root, 'alias'));
  await assert.rejects(readWorkspaceFile(root, 'alias.ts'), withCode('unsafe_path'));
  await assert.rejects(readWorkspaceFile(root, 'alias/example.ts'), withCode('unsafe_path'));
});

test('source reader rejects oversized, binary, and invalid UTF-8 files', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'large.ts'), 'x'.repeat(MAX_SOURCE_BYTES + 1));
  await writeFile(join(root, 'binary.ts'), Buffer.from([0x61, 0, 0x62]));
  await writeFile(join(root, 'invalid.ts'), Buffer.from([0xc3, 0x28]));
  await assert.rejects(readWorkspaceFile(root, 'large.ts'), withCode('too_large'));
  await assert.rejects(readWorkspaceFile(root, 'binary.ts'), withCode('invalid_text'));
  await assert.rejects(readWorkspaceFile(root, 'invalid.ts'), withCode('invalid_text'));
});

test('bridge writes are atomic JSON records and never change source contents', async t => {
  const root = await fixture(t);
  assert.equal(await readBridgeFile(root, 'status.json'), undefined);
  await writeBridgeFile(root, 'plan.json', { version: 1, title: 'First' });
  await writeBridgeFile(root, 'plan.json', { version: 1, title: 'Second' });
  assert.deepEqual(await readBridgeFile(root, 'plan.json'), { version: 1, title: 'Second' });
  assert.deepEqual(await readdir(join(root, '.type-the-change')), ['plan.json']);
  assert.equal(await readWorkspaceFile(root, 'src/example.ts'), 'export const answer = 41;\n');
  if (process.platform !== 'win32') assert.equal((await stat(join(root, '.type-the-change', 'plan.json'))).mode & 0o777, 0o600);
  await assert.rejects(writeBridgeFile(root, '../source.ts' as 'plan.json', {}), withCode('unsafe_path'));
});

test('bridge refuses linked directories and linked destination files without touching their targets', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'type-change-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(root, '.type-the-change'));
  await assert.rejects(writeBridgeFile(root, 'plan.json', {}), withCode('unsafe_path'));
  assert.deepEqual(await readdir(outside), []);
  await rm(join(root, '.type-the-change'));
  await mkdir(join(root, '.type-the-change'));
  await writeFile(join(outside, 'target.json'), 'unchanged');
  await symlink(join(outside, 'target.json'), join(root, '.type-the-change', 'plan.json'));
  await assert.rejects(writeBridgeFile(root, 'plan.json', {}), withCode('unsafe_path'));
  await assert.rejects(readBridgeFile(root, 'plan.json'), withCode('unsafe_path'));
  assert.equal(await readFile(join(outside, 'target.json'), 'utf8'), 'unchanged');
});

test('bridge does not treat malformed JSON as a usable extension record', async t => {
  const root = await fixture(t);
  await mkdir(join(root, '.type-the-change'));
  await writeFile(join(root, '.type-the-change', 'status.json'), '{');
  await assert.rejects(readBridgeFile(root, 'status.json'), withCode('invalid_text'));
});
