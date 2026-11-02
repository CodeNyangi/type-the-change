import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { appendFile, mkdtemp, open, readFile, readdir, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MAX_PLAN_FILE_BYTES, PlanFileError, readPlanFile } from '../src/plan-file.js';
import { parsePlan } from '../src/plan.js';

afterEach(() => mock.restoreAll());
const withCode = (code: PlanFileError['code']) => (error: unknown) => error instanceof PlanFileError && error.code === code;
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'ttc-plan-import-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, file: join(root, 'plan.json') };
}

test('selected plan imports preserve valid content and do not write or create files', async t => {
  const { root, file } = await fixture(t);
  const original = await readFile(new URL('../examples/plan.json', import.meta.url), 'utf8');
  await writeFile(file, original);
  const before = await stat(file);
  assert.deepEqual(parsePlan(await readPlanFile(file)), parsePlan(original));
  assert.equal(await readFile(file, 'utf8'), original);
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readdir(root), ['plan.json']);
});

test('the import byte boundary counts UTF-8 bytes, accepting the limit and rejecting one extra byte', async t => {
  const { file } = await fixture(t);
  const text = '가'.repeat(Math.floor(MAX_PLAN_FILE_BYTES / 3)) + ' '.repeat(MAX_PLAN_FILE_BYTES % 3);
  assert.equal(Buffer.byteLength(text), MAX_PLAN_FILE_BYTES);
  await writeFile(file, text);
  assert.equal(await readPlanFile(file), text);
  await appendFile(file, ' ');
  await assert.rejects(readPlanFile(file), withCode('too_large'));
});

test('a huge sparse file is rejected before any content read', async t => {
  const { file } = await fixture(t);
  await writeFile(file, '');
  await truncate(file, 1024 * 1024 * 1024);
  const probe = await open(file, 'r');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const reads = mock.method(prototype, 'read', async () => assert.fail('oversized imports must fail before reading their contents'));
  await assert.rejects(readPlanFile(file), withCode('too_large'));
  assert.equal(reads.mock.callCount(), 0);
  assert.equal((await stat(file)).size, 1024 * 1024 * 1024);
});

test('a file growing after stat is still bounded and rejected', async t => {
  const { file } = await fixture(t);
  await writeFile(file, '{}');
  const probe = await open(file, 'r');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const read = prototype.read;
  let requested = 0, grew = false;
  mock.method(prototype, 'read', async function(this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
    if (!grew) { grew = true; await appendFile(file, 'x'.repeat(MAX_PLAN_FILE_BYTES * 2)); }
    requested += length;
    return read.call(this, buffer, offset, length, position);
  });
  await assert.rejects(readPlanFile(file), withCode('too_large'));
  assert.ok(grew, 'growth happens only after the initial size check');
  assert.equal(requested, MAX_PLAN_FILE_BYTES + 1, 'only the cap and one overflow-detection byte can be read');
});

test('directories, symlinks and invalid UTF-8 are rejected without changing the input', async t => {
  const { root, file } = await fixture(t);
  await assert.rejects(readPlanFile(root), withCode('not_regular_file'));
  const invalid = Buffer.from([0xc3, 0x28]);
  await writeFile(file, invalid);
  await assert.rejects(readPlanFile(file), withCode('invalid_text'));
  assert.deepEqual(await readFile(file), invalid);
  await symlink(file, join(root, 'alias.json'));
  await assert.rejects(readPlanFile(join(root, 'alias.json')), withCode('not_regular_file'));
  await assert.rejects(readPlanFile(join(root, 'missing.json')), withCode('unavailable'));
});

test('a named pipe cannot block the import reader', { skip: process.platform === 'win32' }, async t => {
  const { file } = await fixture(t);
  await promisify(execFile)('mkfifo', [file]);
  await assert.rejects(readPlanFile(file), withCode('not_regular_file'));
});
