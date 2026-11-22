import {constants} from 'node:fs';
import {open, readdir, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import * as path from 'node:path';
import {validateRelativePath} from './plan.js';
import {parseHunks} from './change-review.js';
import type {Agent} from './agent-inbox.js';

export type EditKind = 'add' | 'edit' | 'delete' | 'rename';
export interface ThreadEdit {file: string; kind: EditKind; pending: boolean; reason?: string; context?: string; excerpt?: {before:string; after:string}}
export interface LocalThread {
  id: string;
  agent: Agent;
  root: string;
  cwd: string;
  title?: string;
  agenda?: string;
  turn?: 'started' | 'finished';
  updatedAt: number;
  edits: ThreadEdit[];
}

const uuidSuffix = /([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.jsonl$/i;
const prefixLimit = 64 * 1024;
const tailLimit = 1024 * 1024;
const recordLimit = 40;
type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
}
function shortAgenda(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const line = value.split('\n').map(line => line.trim()).find(Boolean);
  return line?.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 140);
}
function messageAgenda(content: unknown): string | undefined {
  if (!Array.isArray(content)) return shortAgenda(content);
  return content.map(record).filter(part => part?.type === 'text' || part?.type === 'input_text')
    .map(part => shortAgenda(part?.text)).find(Boolean);
}
function publicText(content: unknown): string | undefined {
  if (typeof content === 'string') return content.slice(0, 1600);
  if (!Array.isArray(content)) return;
  return content.map(record).filter(item => item?.type === 'text' || item?.type === 'output_text')
    .map(item => typeof item?.text === 'string' ? item.text.slice(0, 1600) : '').filter(Boolean).join('\n').slice(0, 1600) || undefined;
}
function fileReason(message: string | undefined, file: string): string | undefined {
  if (!message || message.includes('```')) return;
  // Match a quoted file reference, so "other/foo.ts" cannot explain "foo.ts".
  const quoted = '`' + file + '`';
  const link = '[' + file + '](';
  const paragraph = message.split(/\n\s*\n/).find(part => part.includes(quoted) || part.includes(link));
  return paragraph?.trim().replace(/\s+/g, ' ').slice(0, 260);
}
function patchExcerpt(value: unknown) {
  if (typeof value !== 'string' || value.length > 128 * 1024) return;
  const hunk = parseHunks(value).find(item => item.before !== item.after && item.before.length + item.after.length <= 16 * 1024);
  if (hunk) return {before:hunk.before, after:hunk.after};
}
function addEvidence(file: string, pending: boolean, message?: string, excerpt?: ThreadEdit['excerpt']) {
  if (pending) return {};
  const reason = fileReason(message, file);
  // A message that points at another file is not a useful fallback.
  const namesOtherPath = message && /(?:`|\[)[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+(?:`|\]\()/.test(message);
  const context = !reason && excerpt && message && !namesOtherPath && !message.includes('```')
    ? message.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').slice(0, 240)
    : undefined;
  return {...(reason ? {reason} : context ? {context} : {}), ...(excerpt ? {excerpt} : {})};
}
function objectLines(text: string): Json[] {
  const lines: Json[] = [];
  for (const line of text.split('\n')) {
    try {
      const value = record(JSON.parse(line));
      if (value) lines.push(value);
    } catch { /* The final line can still be written by the agent. */ }
  }
  return lines;
}
function relativeFile(root: string, cwd: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return;
  const file = path.relative(root, path.resolve(cwd, value)).split(path.sep).join('/');
  try { validateRelativePath(file); return file; }
  catch { return; }
}
function scopeFor(cwd: string, roots: readonly string[]) {
  if (!path.isAbsolute(cwd)) return;
  return roots.filter(root => {
    const distance = path.relative(root, cwd);
    return !path.isAbsolute(distance) && distance !== '..' && !distance.startsWith('..' + path.sep);
  }).sort((a, b) => b.length - a.length)[0];
}

export function parseThread(agent: Agent, id: string, prefix: string, tail: string, roots: readonly string[], updatedAt: number): LocalThread | undefined {
  // Parse identity first; records from another workspace never enter the tree.
  const first = objectLines(prefix);
  const meta = agent === 'codex'
    ? record(first.find(row => row.type === 'session_meta')?.payload)
    : first.find(row => typeof row.cwd === 'string' && row.sessionId === id);
  const cwd = meta?.cwd;
  if (typeof cwd !== 'string') return;
  const direct = scopeFor(cwd, roots);
  if (direct) return parseThreadEdits(agent, id, cwd, direct, tail, updatedAt);
  if (!path.isAbsolute(cwd)) return;
  // A chat can start in a parent directory. Show it in a nested workspace
  // only when a recorded edit actually lands there.
  const inChild = roots.flatMap(root => {
    if (scopeFor(root, [cwd]) !== cwd) return [];
    const thread = parseThreadEdits(agent, id, cwd, root, tail, updatedAt);
    return thread.edits.length ? [{...thread, cwd:root}] : [];
  });
  return inChild.sort((a,b) => b.edits.length-a.edits.length)[0];
}

function parseThreadEdits(agent: Agent, id: string, cwd: string, root: string, tail: string, updatedAt: number): LocalThread {
  const edits = new Map<string, ThreadEdit>();
  const pending = new Map<string, ThreadEdit>();
  function remember(edit: ThreadEdit) {
    edits.delete(edit.file);
    edits.set(edit.file, edit);
    if (edits.size > recordLimit) edits.delete(edits.keys().next().value!);
  }
  let recentPublic: string | undefined;
  function save(file: unknown, kind: EditKind, isPending: boolean, diff?: unknown) {
    const scoped = relativeFile(root, cwd, file);
    if (scoped) remember({file: scoped, kind, pending: isPending, ...addEvidence(scoped,isPending,recentPublic,patchExcerpt(diff))});
  }
  let title: string | undefined, agenda: string | undefined;
  let turn: LocalThread['turn'];
  for (const row of objectLines(tail)) {
    if (agent === 'codex') {
      const event = record(row.payload);
      const item = record(event?.item);
      if (event?.type === 'task_started') {turn = 'started';recentPublic=undefined;}
      if (event?.type === 'task_complete' || event?.type === 'turn_aborted') {turn = 'finished';recentPublic=undefined;}
      if (item?.type === 'UserMessage' && event?.type === 'item_completed') {agenda = messageAgenda(item.content) ?? agenda;recentPublic=undefined;}
      if (event?.type === 'user_message') {agenda = messageAgenda(event.message) ?? agenda;recentPublic=undefined;}
      if (item?.type === 'AgentMessage' && event?.type === 'item_completed') recentPublic = publicText(item.content);
      if (event?.type === 'agent_message') recentPublic = publicText(event.message) ?? recentPublic;
      if (item?.type !== 'FileChange' && item?.type !== 'fileChange') continue;
      if (item.status === 'failed' || item.status === 'declined') continue;
      const inProgress = event?.type === 'item_started' || item.status === 'inProgress' || item.status === 'in_progress';
      if (!inProgress && event?.type !== 'item_completed') continue;
      const changes = item.changes;
      if (Array.isArray(changes)) {
        for (const value of changes) {
          const change = record(value);
          if (!change) continue;
          const kind = record(change.kind) ?? change;
          save(kind.movePath ?? change.path, kind.movePath ? 'rename' : kind.type === 'add' ? 'add' : kind.type === 'delete' ? 'delete' : 'edit', inProgress, change.diff);
        }
      } else {
        for (const [file, value] of Object.entries(record(changes) ?? {})) {
          const change = record(value);
          if (!change) continue;
          save(change.move_path ?? file, change.move_path ? 'rename' : change.type === 'add' ? 'add' : change.type === 'delete' ? 'delete' : 'edit', inProgress, change.unified_diff ?? change.diff);
        }
      }
      if (!inProgress) recentPublic=undefined;
      continue;
    }
    if (row.sessionId !== id) continue;
    if (row.type === 'custom-title' && typeof row.customTitle === 'string') title = row.customTitle.slice(0, 120);
    const content = record(row.message)?.content;
    if (row.type === 'user' && !row.isMeta && !row.isSidechain) {
      const request = messageAgenda(content);
      if (request) {agenda=request;recentPublic=undefined;}
    }
    if (!Array.isArray(content)) continue;
    for (const value of content) {
      const part = record(value);
      if (!part) continue;
      if (row.type==='assistant' && part.type==='text') recentPublic=publicText(part.text);
      if (part.type === 'tool_use' && ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(String(part.name)) && typeof part.id === 'string') {
        const input = record(part.input);
        const file = relativeFile(root, typeof row.cwd === 'string' ? row.cwd : cwd, input?.file_path ?? input?.notebook_path);
        if (!file) continue;
        const before=input?.old_string,after=input?.new_string;
        const excerpt=typeof before==='string' && typeof after==='string' && before!==after && before.length+after.length<=16*1024
          ? {before,after} : undefined;
        pending.set(part.id, {file, kind: 'edit', pending: true, ...addEvidence(file,false,recentPublic,excerpt)});
        recentPublic=undefined;
        if (pending.size > recordLimit) pending.delete(pending.keys().next().value!);
      } else if (part.type === 'tool_result' && typeof part.tool_use_id === 'string') {
        const edit = pending.get(part.tool_use_id);
        pending.delete(part.tool_use_id);
        if (edit && part.is_error !== true) remember({...edit, pending: false});
      }
    }
  }
  for (const {file,kind} of pending.values()) remember({file,kind,pending:true});
  return {id, agent, root, cwd, title, agenda, turn, updatedAt, edits: [...edits.values()].reverse()};
}

async function entries(directory: string) {
  try { return await readdir(directory, {withFileTypes: true}); }
  catch { return []; }
}
async function newestFolders(directory: string, digits: number, limit: number) {
  return (await entries(directory))
    .filter(entry => entry.isDirectory() && entry.name.length === digits && /^\d+$/.test(entry.name))
    .map(entry => entry.name).sort().reverse().slice(0, limit).map(name => path.join(directory, name));
}
async function recentCodexDirectories(base: string) {
  const years = await newestFolders(base, 4, 2);
  const months = (await Promise.all(years.map(year => newestFolders(year, 2, 3)))).flat();
  return (await Promise.all(months.map(month => newestFolders(month, 2, 10)))).flat().slice(0, 14);
}
async function readLog(file: string) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) return;
    const prefix = Buffer.alloc(Math.min(prefixLimit, info.size));
    const tail = Buffer.alloc(Math.min(tailLimit, info.size));
    const [head, end] = await Promise.all([
      handle.read(prefix, 0, prefix.length, 0),
      handle.read(tail, 0, tail.length, info.size - tail.length),
    ]);
    let text = tail.subarray(0, end.bytesRead).toString('utf8');
    if (info.size > tail.length) text = text.slice(text.indexOf('\n') + 1);
    return {prefix: prefix.subarray(0, head.bytesRead).toString('utf8'), tail: text};
  } finally { await handle.close(); }
}

export class LocalThreadReader {
  private cached = new Map<string, {key: string; thread: LocalThread | undefined}>();
  private names = new Map<string, string>();
  private indexMtime = -1;
  constructor(
    private readonly codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex'),
    private readonly claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'),
  ) {}

  async recent(roots: readonly string[]): Promise<LocalThread[]> {
    if (!roots.length) return [];
    const projectRoots = roots.flatMap(root => [root, path.dirname(root)]);
    const projects = [...new Set(projectRoots.map(root => path.join(this.claudeHome, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'))))];
    const codex = await recentCodexDirectories(path.join(this.codexHome, 'sessions'));
    const batches = await Promise.all([
      this.readAgent('codex', codex, roots),
      this.readAgent('claude', projects, roots),
    ]);
    const selected = batches.flat().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    if (selected.some(thread => thread.agent === 'codex')) await this.updateNames();
    return selected.map(thread => ({
      ...thread,
      title: thread.title ?? (thread.agent === 'codex' ? this.names.get(thread.id) : undefined),
    }));
  }

  private async updateNames() {
    try {
      const file = path.join(this.codexHome, 'session_index.jsonl');
      const {mtimeMs} = await stat(file);
      if (mtimeMs === this.indexMtime) return;
      const log = await readLog(file);
      if (!log) return;
      this.names.clear();
      for (const row of objectLines(log.tail)) {
        if (typeof row.id === 'string' && typeof row.thread_name === 'string') this.names.set(row.id, row.thread_name.slice(0, 120));
      }
      this.indexMtime = mtimeMs;
    } catch { /* Titles are optional. */ }
  }

  private async readAgent(agent: Agent, directories: string[], roots: readonly string[]) {
    const paths = (await Promise.all(directories.map(async dir =>
      (await entries(dir)).filter(entry => entry.isFile() && uuidSuffix.test(entry.name))
        .sort((a, b) => b.name.localeCompare(a.name)).slice(0, agent === 'codex' ? 30 : 250)
        .map(entry => ({file: path.join(dir, entry.name), id: uuidSuffix.exec(entry.name)![1]})),
    ))).flat();
    const candidates = (await Promise.all(paths.map(async item => {
      try { return {...item, info: await stat(item.file)}; }
      catch { return undefined; }
    }))).filter(item => item !== undefined).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs).slice(0, 30);
    const chosen = new Set(candidates.map(item => item.file));
    for (const file of this.cached.keys()) {
      const current = agent === 'codex' ? file.startsWith(this.codexHome + path.sep) : file.startsWith(this.claudeHome + path.sep);
      if (current && !chosen.has(file)) this.cached.delete(file);
    }
    const found = await Promise.all(candidates.map(async ({file, id, info}) => {
      const key = JSON.stringify([info.mtimeMs, info.size, info.ino, roots]);
      const cached = this.cached.get(file);
      if (cached?.key === key) return cached.thread;
      try {
        const log = await readLog(file);
        const thread = log && parseThread(agent, id, log.prefix, log.tail, roots, info.mtimeMs);
        this.cached.set(file, {key, thread});
        return thread;
      } catch { return undefined; }
    }));
    return found.filter(thread => thread !== undefined);
  }
}
