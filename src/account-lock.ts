import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

export type AccountLock = (signal?: AbortSignal) => Promise<() => Promise<void>>;
export class AccountLockError extends Error {}
const OWNER = /^([1-9][0-9]*)-[0-9a-f-]{36}\.owner$/;

function code(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String(error.code) : undefined;
}
function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('ChatGPT request cancelled.', 'AbortError');
}
function pause(signal?: AbortSignal) {
  checkAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, 50);
    const abort = () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      reject(new DOMException('ChatGPT request cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function removeOwnedDirectory(directory: string, marker: string) {
  // Only the process that removes this exact owner's marker may remove its
  // empty directory. A successor's nonempty directory is never deleted.
  try { await unlink(join(directory, marker)); }
  catch (error) { if (code(error) === 'ENOENT') return; throw error; }
  try { await rmdir(directory); }
  catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(code(error) ?? '')) throw error; }
}

async function recoverDeadOwner(directory: string) {
  let entries;
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AccountLockError('ChatGPT 연결 잠금을 확인할 수 없어요.');
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) { if (code(error) === 'ENOENT') return; throw error; }
  if (entries.length === 0) {
    // A release may have removed its marker just before the process exited.
    try { await rmdir(directory); }
    catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(code(error) ?? '')) throw error; }
    return;
  }
  const owner = entries.length === 1 && entries[0].isFile() && OWNER.exec(entries[0].name);
  if (!owner) throw new AccountLockError('ChatGPT 연결 잠금을 확인할 수 없어요.');
  const pid = Number(owner[1]);
  if (!Number.isSafeInteger(pid) || pid > 2_147_483_647) throw new AccountLockError('ChatGPT 연결 잠금을 확인할 수 없어요.');
  try { process.kill(pid, 0); return; }
  catch (error) {
    // Permission denial and PID reuse fail closed: neither proves owner death.
    if (code(error) === 'EPERM') return;
    if (code(error) !== 'ESRCH') throw error;
  }
  await removeOwnedDirectory(directory, entries[0].name);
}

/** Local extension hosts share this lock, while credentials stay in SecretStorage. */
export function createAccountLock(storageDirectory: string, waitMilliseconds = 20_000): AccountLock {
  if (!isAbsolute(storageDirectory) || !Number.isFinite(waitMilliseconds) || waitMilliseconds < 0) {
    throw new AccountLockError('ChatGPT 연결 저장소를 확인할 수 없어요.');
  }
  return async signal => {
    checkAborted(signal);
    const lockDirectory = join(storageDirectory, 'chatgpt-account.lock');
    const marker = `${process.pid}-${randomUUID()}.owner`;
    let candidate: string | undefined;
    try {
      await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
      candidate = await mkdtemp(join(storageDirectory, '.chatgpt-lock-'));
      await writeFile(join(candidate, marker), '', { flag: 'wx', mode: 0o600 });
      const until = Date.now() + waitMilliseconds;
      for (;;) {
        checkAborted(signal);
        try {
          // Publish an already nonempty directory atomically. A live owner's
          // nonempty directory cannot be replaced, including after long sleep.
          await rename(candidate!, lockDirectory);
          candidate = undefined;
          let released = false;
          const release = async () => {
            if (released) return;
            released = true;
            try { await removeOwnedDirectory(lockDirectory, marker); }
            catch { throw new AccountLockError('ChatGPT 연결 잠금을 해제하지 못했어요. VS Code를 다시 시작해 주세요.'); }
          };
          if (signal?.aborted) { await release(); checkAborted(signal); }
          return release;
        } catch (error) {
          const reason = code(error);
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(reason ?? '')) throw error;
          if (reason === 'EPERM' || reason === 'EACCES') {
            // Windows can report access denied for an occupied destination.
            // Do not retry an unrelated permission failure with no lock there.
            try { await lstat(lockDirectory); } catch { throw error; }
          }
        }
        await recoverDeadOwner(lockDirectory);
        if (Date.now() >= until) throw new AccountLockError('다른 VS Code 창에서 ChatGPT 연결을 처리하고 있어요. 잠시 후 다시 시도해 주세요.');
        await pause(signal);
      }
    } catch (error) {
      if (error instanceof AccountLockError || (error instanceof Error && error.name === 'AbortError')) throw error;
      throw new AccountLockError('ChatGPT 연결 저장소를 사용할 수 없어요. 다시 시도해 주세요.');
    } finally {
      if (candidate) {
        // Only this attempt's private candidate; never recursively remove a lock.
        await unlink(join(candidate, marker)).catch(() => {});
        await rmdir(candidate).catch(() => {});
      }
    }
  };
}
