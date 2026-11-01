import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { PathLike } from 'node:fs';
import fs, { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { AccountLockError, createAccountLock } from '../src/account-lock.js';

const moduleUrl = new URL('../src/account-lock.ts', import.meta.url).href;
const stressRepeats = Number(process.env.TTC_LOCK_STRESS_REPEATS ?? 1);
assert.ok(Number.isInteger(stressRepeats) && stressRepeats >= 1 && stressRepeats <= 20, 'TTC_LOCK_STRESS_REPEATS must be an integer from 1 to 20');
const childSource = `
  const { createAccountLock } = await import(process.argv[1]);
  const release = await createAccountLock(process.argv[2])();
  process.stdout.write('locked\\n');
  process.stdin.once('data', async () => { await release(); process.exit(0); });
`;

function owner(root: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childSource, moduleUrl, root], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const locked = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { if (code !== 0) reject(new Error(`Test lock owner exited (${code}): ${stderr}`)); });
    child.stdout.once('data', data => {
      try { assert.equal(String(data), 'locked\n'); resolve(); } catch (error) { reject(error); }
    });
  });
  // A test may intentionally kill an owner after acquisition.
  void locked.catch(() => {});
  return { child, locked, async close() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.stdin.end('release\n'); await exited;
  } };
}

test('only one real process can own a shared account lock at a time', { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
  const first = owner(root);
  let second: ReturnType<typeof owner> | undefined;
  try {
    await first.locked;
    second = owner(root);
    const controller = new AbortController();
    const blocked = createAccountLock(root)(controller.signal);
    const rejected = assert.rejects(blocked, error => error instanceof Error && error.name === 'AbortError');
    controller.abort(); await rejected;
    await first.close();
    await second.locked;
    await assert.rejects(createAccountLock(root, 100)(), AccountLockError);
    await second.close();
    const release = await createAccountLock(root)(); await release(); await release();
    assert.deepEqual(await readdir(root), []);
  } finally { await first.close(); await second?.close(); await rm(root, { recursive: true, force: true }); }
});

test('a live owner is never replaced solely because its lock is old', { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
  const held = owner(root);
  try {
    await held.locked;
    const lockPath = join(root, 'chatgpt-account.lock');
    const before = await readdir(lockPath);
    await utimes(lockPath, new Date(0), new Date(0));
    await assert.rejects(createAccountLock(root, 100)(), /다른 VS Code 창/);
    assert.deepEqual(await readdir(lockPath), before);
  } finally { await held.close(); await rm(root, { recursive: true, force: true }); }
});

test('a killed owner is recovered safely by racing successor processes', { timeout: 60_000 }, async () => {
 for (let round = 0; round < stressRepeats; round++) {
  const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
  const killed = owner(root);
  let successors: ReturnType<typeof owner>[] = [];
  try {
    await killed.locked;
    const exited = once(killed.child, 'exit'); killed.child.kill('SIGKILL'); await exited;
    successors = [owner(root), owner(root), owner(root)];
    const waiting = new Map(successors.map((candidate, index) => [index, candidate.locked.then(() => index)]));
    while (waiting.size) {
      const winner = await Promise.race(waiting.values());
      const entries = await readdir(join(root, 'chatgpt-account.lock'));
      assert.equal(entries.length, 1);
      assert.ok(entries[0].startsWith(`${successors[winner].child.pid}-`));
      await assert.rejects(createAccountLock(root, 100)(), /다른 VS Code 창/);
      await successors[winner].close(); waiting.delete(winner);
    }
    assert.deepEqual(await readdir(root), []);
  } finally { await killed.close(); for (const child of successors) await child.close(); await rm(root, { recursive: true, force: true }); }
 }
});

for (const reason of ['EPERM', 'EACCES']) {
  test(`${reason} contention retries when another process removes the lock before inspection`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
    const lockPath = join(root, 'chatgpt-account.lock');
    await mkdir(lockPath);
    const actualRename = fs.rename;
    let attempts = 0;
    const renameMock = mock.method(fs, 'rename', async (source: PathLike, target: PathLike) => {
      attempts++;
      if (attempts === 1) {
        // Windows rename already observed the occupied directory. A different
        // recovery process removes it before this caller can inspect it.
        await fs.rmdir(lockPath);
        throw Object.assign(new Error('private-filesystem-detail'), { code: reason });
      }
      return actualRename(source, target);
    });
    syncBuiltinESMExports();
    try {
      const release = await createAccountLock(root, 1_000)();
      assert.equal(attempts, 2);
      await release();
      assert.deepEqual(await readdir(root), []);
    } finally {
      renameMock.mock.restore(); syncBuiltinESMExports();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('persistent permission denial remains bounded and exposes only its safe code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
  let attempts = 0;
  const renameMock = mock.method(fs, 'rename', async () => {
    attempts++;
    throw Object.assign(new Error('private-filesystem-detail /private/user-storage'), { code: 'EACCES', syscall: 'rename' });
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(createAccountLock(root, 100)(), error => {
      assert.ok(error instanceof AccountLockError);
      assert.deepEqual(error.cause, { code: 'EACCES', syscall: 'rename' });
      assert.doesNotMatch(String(error) + JSON.stringify(error.cause), /private-filesystem|user-storage/);
      return true;
    });
    assert.ok(attempts >= 2, 'permission failure was retried within the deadline');
    assert.deepEqual(await readdir(root), []);
  } finally {
    renameMock.mock.restore(); syncBuiltinESMExports();
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed locks fail closed and cancellation leaves no candidate directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
  try {
    const lockPath = join(root, 'chatgpt-account.lock');
    await mkdir(lockPath); await writeFile(join(lockPath, 'unknown-owner'), '');
    await assert.rejects(createAccountLock(root)(), /잠금을 확인/);
    assert.deepEqual(await readdir(root), ['chatgpt-account.lock']);
    assert.deepEqual(await readdir(lockPath), ['unknown-owner']);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(createAccountLock(root)(controller.signal), error => error instanceof Error && error.name === 'AbortError');
    assert.deepEqual(await readdir(root), ['chatgpt-account.lock']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an ownerless directory left during release can be recovered', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ttc-account-lock-'));
  try {
    await mkdir(join(root, 'chatgpt-account.lock'));
    const release = await createAccountLock(root)(); await release();
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
