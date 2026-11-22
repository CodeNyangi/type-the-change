import path from 'node:path';
import {activityItem, ObserverError, threadSummary, type CodexObserver, type Json} from './codex-observer.js';
import {addEvidence, patchExcerpt, relativeFile, scopeFor, type LocalThread, type ThreadEdit} from './local-threads.js';

const options = {
  limit: 50,
  sortKey: 'updated_at',
  modelProviders: [],
  sourceKinds: ['cli','vscode','appServer','exec','unknown'],
  useStateDbOnly: true,
};

export class CodexSidebarHistory {
  private client?: Promise<CodexObserver>;
  private disposed = false;
  private metadata?: {roots: string; expires: number; threads: LocalThread[]};
  private inFlight = new Map<string, Promise<ThreadEdit[]>>();
  private evidence = new Map<string, {updatedAt: number; edits: ThreadEdit[]}>();

  constructor(private readonly connect: () => Promise<CodexObserver>) {}

  private connection() {
    if (!this.client) this.client = this.connect().then(client => {
      if (this.disposed) {client.dispose();throw new ObserverError('connection');}
      return client;
    }).catch(error => {this.client=undefined;throw error;});
    return this.client;
  }

  async recent(roots: readonly string[]): Promise<LocalThread[]> {
    if (!roots.length || this.disposed) return [];
    const key = JSON.stringify(roots);
    if (this.metadata?.roots === key && this.metadata.expires > Date.now()) return this.metadata.threads;
    const fallback = this.metadata?.roots === key ? this.metadata.threads : [];
    try {
      const client = await this.connection();
      const lists = await Promise.all(roots.map(async root => {
        const threads: LocalThread[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 2; page++) {
          const result = await client.read('thread/list', {...options, cwd:root, ...(cursor?{cursor}:{})});
          for (const entry of Array.isArray(result.data) ? result.data : []) {
            const thread = threadSummary(entry);
            if (!thread || !/^[a-zA-Z0-9_-]{1,100}$/.test(thread.id) || scopeFor(thread.cwd, roots) !== root) continue;
            const updatedAt = thread.updatedAt < 1e12 ? thread.updatedAt * 1000 : thread.updatedAt;
            threads.push({id:thread.id, agent:'codex', root, cwd:thread.cwd, title:thread.title, updatedAt,
              source:'codex-app', active:thread.runtime === 'active', edits:[]});
          }
          if (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor === cursor) break;
          cursor = result.nextCursor;
        }
        return threads;
      }));
      const threads = [...new Map(lists.flat().map(thread=>[thread.id,thread])).values()];
      this.metadata = {roots:key, expires:Date.now()+12_000, threads};
      return threads;
    } catch {
      this.metadata = {roots:key, expires:Date.now()+20_000, threads:fallback};
      return fallback;
    }
  }

  async edits(thread: LocalThread): Promise<ThreadEdit[]> {
    const cached = this.evidence.get(thread.id);
    if (cached?.updatedAt === thread.updatedAt && !thread.active) return cached.edits;
    let request=this.inFlight.get(thread.id);
    if (!request) {
      request=this.loadEdits(thread).finally(()=>this.inFlight.delete(thread.id));
      this.inFlight.set(thread.id,request);
    }
    return request;
  }

  private async loadEdits(thread: LocalThread): Promise<ThreadEdit[]> {
    const client = await this.connection();
    let data: Json[] = [];
    let cursor: string | undefined;
    for (let page=0;page<4;page++) {
      const result = await client.read('thread/items/list', {threadId:thread.id,limit:40,sortDirection:'desc',...(cursor?{cursor}:{})});
      const pageItems: Json[] = Array.isArray(result.data) ? result.data : [];
      data.push(...pageItems);
      if (pageItems.some((row:Json)=>(row.item??row).type==='fileChange') || typeof result.nextCursor!=='string' ||
        !result.nextCursor || result.nextCursor===cursor) break;
      cursor=result.nextCursor;
    }
    const edits = recordedCodexEdits(thread, data.reverse());
    this.evidence.set(thread.id,{updatedAt:thread.updatedAt,edits});
    if (this.evidence.size>30) this.evidence.delete(this.evidence.keys().next().value!);
    return edits;
  }

  dispose() {this.disposed=true;void this.client?.then(client=>client.dispose(),()=>{});}
}

export function recordedCodexEdits(thread: LocalThread, events: Json[]): ThreadEdit[] {
  const edits = new Map<string, ThreadEdit>();
  let recentPublic: string | undefined, turn: string | undefined;
  for (const raw of events) {
    const item = activityItem(raw);
    if (!item) continue;
    if (turn !== item.turnId || item.kind === 'user') {recentPublic=undefined;turn=item.turnId;}
    if (item.kind === 'assistant') recentPublic=item.text;
    if (item.kind !== 'change') continue;
    if (item.status==='failed' || item.status==='declined') {recentPublic=undefined;continue;}
    const pending = item.status==='inProgress' || item.status==='in_progress';
    for (const change of item.diffs ?? []) {
      const file = relativeFile(thread.root, thread.cwd, change.path);
      if (!file) continue;
      const original = (raw.item??raw).changes?.find((entry:Json)=>entry.path===change.path);
      const kind = original?.kind?.movePath ? 'rename' : original?.kind?.type === 'add' ? 'add' : original?.kind?.type === 'delete' ? 'delete' : 'edit';
      edits.delete(file);
      edits.set(file,{file, kind, pending, ...addEvidence(file,pending,turn?recentPublic:undefined,patchExcerpt(change.diff))});
    }
    recentPublic=undefined;
  }
  return [...edits.values()].reverse().slice(0,40);
}

export function cloudClaudeLink(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.origin === 'https://claude.ai' && !url.username && !url.password && /^\/code\/(?:cshk|session|cse)_[A-Za-z0-9_-]{8,180}\/?$/.test(url.pathname)) {
      return url.origin + url.pathname.replace(/\/$/,'');
    }
  } catch { /* The input may be an incomplete URL. */ }
}

export function mergeAgentThreads(...batches: LocalThread[][]): LocalThread[] {
  const byId = new Map<string, LocalThread>();
  for (const entries of batches) for (const entry of entries) {
    const key = entry.agent + ':' + entry.id;
    const previous = byId.get(key);
    byId.set(key,previous ? {...previous,...entry,updatedAt:Math.max(previous.updatedAt,entry.updatedAt),
      title:entry.title??previous.title,edits:entry.edits.length?entry.edits:previous.edits} : entry);
  }
  return [...byId.values()].sort((a,b)=>b.updatedAt-a.updatedAt);
}

export function claudeCliThreads(data: unknown, roots: readonly string[]): LocalThread[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0,100).flatMap(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.cwd !== 'string') return [];
    const root = scopeFor(entry.cwd, roots);
    const id = entry.sessionId ?? entry.id;
    if (!root || typeof id!=='string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return [];
    const updated = entry.updatedAt ?? entry.startedAt;
    const stamp = typeof updated==='string' ? Date.parse(updated) : typeof updated==='number' ? (updated<1e12?updated*1000:updated) : 0;
    const title = entry.title ?? entry.name ?? entry.summary;
    return [{id,agent:'claude',root,cwd:path.normalize(entry.cwd),source:'claude-cli',active:['running','active'].includes(entry.status),
      updatedAt:Number.isFinite(stamp)?stamp:0,title:typeof title==='string'?title.trim().slice(0,120):undefined,edits:[]}];
  });
}
