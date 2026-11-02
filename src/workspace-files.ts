import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_SOURCE_BYTES, validateRelativePath } from './plan.js';

export { MAX_SOURCE_BYTES } from './plan.js';
export const MAX_BRIDGE_BYTES = 256 * 1024;
export type BridgeName = 'plan.json' | 'status.json' | 'review.json';

export class WorkspaceFileError extends Error {
  constructor(readonly code: 'unsafe_path' | 'missing_file' | 'not_regular_file' | 'too_large' | 'invalid_text' | 'duplicate_file' | 'unavailable') {
    super(code);
    this.name = 'WorkspaceFileError';
  }
}

function inside(root: string, target: string): boolean {
  const child = relative(root, target);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function normalizeError(error: unknown): WorkspaceFileError {
  if (error instanceof WorkspaceFileError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return new WorkspaceFileError('missing_file');
  if (code === 'ELOOP') return new WorkspaceFileError('unsafe_path');
  return new WorkspaceFileError('unavailable');
}

async function workspaceRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new WorkspaceFileError('unsafe_path');
  const resolved = await realpath(root);
  if (!(await lstat(resolved)).isDirectory()) throw new WorkspaceFileError('unsafe_path');
  return resolved;
}

/** Every component is checked, including links that point back inside the root. */
async function checkedPath(root: string, parts: string[], allowMissingLeaf = false): Promise<string> {
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    if (!inside(root, current)) throw new WorkspaceFileError('unsafe_path');
    try {
      const item = await lstat(current);
      if (item.isSymbolicLink()) throw new WorkspaceFileError('unsafe_path');
      if (index < parts.length - 1 && !item.isDirectory()) throw new WorkspaceFileError('unsafe_path');
    } catch (error) {
      if (allowMissingLeaf && index === parts.length - 1 && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  return current;
}

async function readBoundedFile(root: string, file: string, limit: number): Promise<string> {
  const item = await lstat(file);
  if (item.isSymbolicLink()) throw new WorkspaceFileError('unsafe_path');
  if (!item.isFile()) throw new WorkspaceFileError('not_regular_file');
  // Nonblocking open also covers a regular file replaced by a FIFO after lstat.
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new WorkspaceFileError('not_regular_file');
    if (stat.size > limit) throw new WorkspaceFileError('too_large');
    const resolved = await realpath(file);
    const current = await lstat(file);
    if (!inside(root, resolved) || current.isSymbolicLink() || current.ino !== stat.ino || current.dev !== stat.dev) {
      throw new WorkspaceFileError('unsafe_path');
    }
    // A growing file cannot make an unbounded read after the size check.
    const bytes = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await handle.read(bytes, total, bytes.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > limit) throw new WorkspaceFileError('too_large');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, total)); }
    catch { throw new WorkspaceFileError('invalid_text'); }
    if (text.includes('\0')) throw new WorkspaceFileError('invalid_text');
    return text;
  } finally { await handle.close(); }
}

export async function readWorkspaceFile(root: string, file: string, limit = MAX_SOURCE_BYTES): Promise<string> {
  try {
    try { validateRelativePath(file); } catch { throw new WorkspaceFileError('unsafe_path'); }
    if (file.split('/').some(part => ['.type-the-change', '.codex', '.aws', '.ssh', '.gnupg', 'node_modules'].includes(part.toLowerCase()))) {
      throw new WorkspaceFileError('unsafe_path');
    }
    const resolved = await workspaceRoot(root);
    const target = await checkedPath(resolved, file.split('/'));
    return await readBoundedFile(resolved, target, Math.min(Math.max(limit, 1), 1024 * 1024));
  } catch (error) { throw normalizeError(error); }
}

/** Distinct plan keys must not describe conflicting states of one physical file. */
export async function assertDistinctWorkspaceFiles(root: string, files: Iterable<string>): Promise<void> {
  try {
    const resolved = await workspaceRoot(root);
    const identities = new Set<string>();
    for (const file of new Set(files)) {
      try { validateRelativePath(file); } catch { throw new WorkspaceFileError('unsafe_path'); }
      const target = await checkedPath(resolved, file.split('/'));
      const item = await lstat(target);
      if (!item.isFile()) throw new WorkspaceFileError('not_regular_file');
      // Some virtual filesystems do not supply inode numbers. Canonical paths
      // still catch case aliases there; normal local files also catch hard links.
      const identity = item.ino ? `${item.dev}:${item.ino}` : await realpath(target);
      if (identities.has(identity)) throw new WorkspaceFileError('duplicate_file');
      identities.add(identity);
    }
  } catch (error) { throw normalizeError(error); }
}

function checkBridgeName(name: string): asserts name is BridgeName {
  if (name !== 'plan.json' && name !== 'status.json' && name !== 'review.json') throw new WorkspaceFileError('unsafe_path');
}

export async function readBridgeFile(root: string, name: BridgeName): Promise<unknown | undefined> {
  try {
    checkBridgeName(name);
    const resolved = await workspaceRoot(root);
    const target = await checkedPath(resolved, ['.type-the-change', name]);
    const text = await readBoundedFile(resolved, target, MAX_BRIDGE_BYTES);
    try { return JSON.parse(text); } catch { throw new WorkspaceFileError('invalid_text'); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw normalizeError(error);
  }
}

/** Only the two local bridge records can be written, never source code. */
export async function writeBridgeFile(root: string, name: BridgeName, value: unknown): Promise<void> {
  let temporary: string | undefined;
  try {
    checkBridgeName(name);
    const serialized = JSON.stringify(value, null, 2);
    if (serialized === undefined) throw new WorkspaceFileError('invalid_text');
    const data = Buffer.from(`${serialized}\n`, 'utf8');
    if (data.length > MAX_BRIDGE_BYTES) throw new WorkspaceFileError('too_large');
    const resolved = await workspaceRoot(root);
    const directory = await checkedPath(resolved, ['.type-the-change'], true);
    await mkdir(directory, { mode: 0o700 }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    await checkedPath(resolved, ['.type-the-change']);
    if (!(await lstat(directory)).isDirectory()) throw new WorkspaceFileError('unsafe_path');
    const target = await checkedPath(resolved, ['.type-the-change', name], true);
    temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally { await handle.close(); }
    // Recheck before publishing the complete record to the extension watcher.
    await checkedPath(resolved, ['.type-the-change', name], true);
    if (!inside(resolved, await realpath(directory))) throw new WorkspaceFileError('unsafe_path');
    await rename(temporary, target);
    temporary = undefined;
  } catch (error) { throw normalizeError(error); }
  finally { if (temporary) await unlink(temporary).catch(() => undefined); }
}
