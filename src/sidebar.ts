import * as vscode from 'vscode';
import * as path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {agents, agentNames, inboxFiles, planFile, readProposal, readReport, type Agent, type Assessment} from './agent-inbox.js';
import {readWorkspaceFile, writeBridgeFile, WorkspaceFileError} from './workspace-files.js';
import {parsePlan, validatePlanAgainstFiles, validateRelativePath} from './plan.js';
import {LocalThreadReader, type LocalThread, type ThreadEdit} from './local-threads.js';
import {agentModels, effortLevels, listClaudeAgents, reviewPrompt, runAgentTurn, sendClaudeCloud} from './agent-review.js';
import {CodexSidebarHistory, cloudClaudeLink, claudeCliThreads, mergeAgentThreads} from './agent-history.js';
import {createCodexObserver} from './companion-host.js';
import {findCodex} from './codex-observer.js';
import {queueExplanation, RequestError} from './codex-request.js';
import {activityHtml} from './activity-map.js';
import {git as readGit} from './worktrees.js';
import {parseHunks} from './change-review.js';
import {language, text as t} from './locale.js';

// The subset used from the built-in VS Code Git extension's public v1 API.
interface GitChange {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri?: vscode.Uri;
  status: number;
}
interface GitRepository {
  rootUri: vscode.Uri;
  diffWithHEAD(file: string): Promise<string>;
  state: {
    onDidChange: vscode.Event<void>;
    indexChanges: GitChange[];
    workingTreeChanges: GitChange[];
    untrackedChanges?: GitChange[];
    mergeChanges: GitChange[];
  };
}
interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

type Row = vscode.TreeItem & {thread?: LocalThread; children?: Row[] | (() => Promise<Row[]> | Row[])};
const limit = 200;
const viewId = 'typeTheChange.sidebar';
const localHistoryKey = 'showLocalAgentThreads';
const cloudLinksKey = 'claudeCloudLinks';
const threadPageSize = 8;
type Delivery = 'sending' | 'queued' | 'uncertain' | 'failed';
type CloudLink = {root: string; url: string; title: string; addedAt: number};
const gitStatus = {addedToIndex:1, deletedFromIndex:2, deleted:6, untracked:7} as const;

function action(label: string, icon: string, command?: string, args: unknown[] = []): Row {
  const row = new vscode.TreeItem(label);
  row.iconPath = new vscode.ThemeIcon(icon);
  if (command) row.command = {command, title: label, arguments: args};
  return row;
}
function group(id: string, label: string, children: Row[] | (() => Promise<Row[]> | Row[]), expanded = false): Row {
  const row: Row = new vscode.TreeItem(label, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
  row.id = id;
  row.children = children;
  return row;
}
function notes(assessment: Assessment): Row[] {
  return [
    [t('영향', 'Impact'), assessment.impact, 'arrow-swap'],
    [t('주의', 'Risk'), assessment.risk, 'warning'],
    [t('확인', 'Verification'), assessment.verification, 'beaker'],
  ].map(([label, value, icon]) => {
    const row = action(label, icon);
    row.description = value;
    row.tooltip = value;
    row.accessibilityInformation = {label: `${label}: ${value}`};
    return row;
  });
}

export function registerChangeSidebar(context: vscode.ExtensionContext): void {
  const changes = new vscode.EventEmitter<Row | undefined>();
  let git: GitApi | undefined;
  let gitEnabled: vscode.Disposable | undefined;
  let disposed = false;
  let visible = false, scanning = false;
  let lastFile = vscode.window.activeTextEditor?.document.uri;
  const running = new Map<string, {agent: Agent; agenda: string}>();
  let map: vscode.WebviewPanel | undefined;
  let showThreads = context.workspaceState.get<boolean>(localHistoryKey) === true;
  let threads: LocalThread[] = [];
  const threadReader = new LocalThreadReader();
  const codexHistory = new CodexSidebarHistory(() => createCodexObserver(context));
  const visibleCount: Record<Agent,number> = {codex:threadPageSize,claude:threadPageSize};
  const requestedHistory = new Set<string>();
  const ownerSends = new Set<string>();
  const delivery = new Map<string, Delivery>();
  function setDelivery(id: string, state: Delivery) {
    delivery.delete(id);
    delivery.set(id,state);
    if (delivery.size>40) delivery.delete(delivery.keys().next().value!);
    refresh();
  }
  function deliveryLabel(state: Delivery) {
    if (state==='sending') return t('보내는 중','Sending');
    if (state==='queued') return t('접수됨','Queued');
    if (state==='failed') return t('전송 실패','Send failed');
    return t('접수 확인 필요','Check delivery');
  }
  let claudeCatalog = {key:'', nextCheck:0, threads:[] as LocalThread[]};
  const outputs = new Map<string, string>();
  const replies = new Map<string, vscode.Uri>();
  const abortReviews = new AbortController();
  const repositories = new Map<GitRepository, vscode.Disposable>();
  const gitSubscriptions: vscode.Disposable[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => changes.fire(undefined), 180);
  };
  const requireFolder = (root: string) => {
    if (!vscode.workspace.isTrusted || vscode.env.remoteName ||
      !vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme === 'file' && folder.uri.fsPath === root)) {
      throw new Error(t('신뢰한 로컬 폴더를 다시 열어 주세요.', 'Reopen the trusted local workspace folder.'));
    }
  };

  function openRoots() {
    return (vscode.workspace.workspaceFolders ?? []).filter(folder=>folder.uri.scheme==='file').map(folder=>folder.uri.fsPath);
  }

  function cloudLinks() {return context.workspaceState.get<CloudLink[]>(cloudLinksKey) ?? [];}

  async function cloudThreads(roots: readonly string[]): Promise<LocalThread[]> {
    const links = cloudLinks().filter(link=>roots.includes(link.root) && cloudClaudeLink(link.url)===link.url);
    const reports = (await Promise.all(roots.map(async root=>{
      const report = await readReport(root,'claude').catch(()=>undefined);
      const url = report?.source && cloudClaudeLink(report.source.url);
      return url && report ? {root,url,title:report.summary,addedAt:0} : undefined;
    }))).filter(link=>link!==undefined);
    return [...new Map([...reports,...links].map(link=>[link.url,link])).values()].map(link=>({
      id:link.url.split('/').at(-1)!, agent:'claude', root:link.root, cwd:link.root, title:link.title,
      cloudUrl:link.url, source:'claude-cloud', updatedAt:link.addedAt, edits:[],
    }));
  }

  async function activeClaudeThreads(roots: readonly string[]) {
    const key=JSON.stringify(roots);
    if (claudeCatalog.key===key && claudeCatalog.nextCheck>Date.now()) return claudeCatalog.threads;
    const found=await Promise.all(roots.map(root=>listClaudeAgents(root,abortReviews.signal)
      .then(data=>claudeCliThreads(data,roots)).catch(()=>[])));
    claudeCatalog={key,nextCheck:Date.now()+12_000,threads:mergeAgentThreads(...found)};
    return claudeCatalog.threads;
  }

  async function scanThreads() {
    if (disposed || (!visible && !map?.visible) || !showThreads || scanning || !vscode.workspace.isTrusted || vscode.env.remoteName) return;
    scanning = true;
    try {
      const roots = openRoots();
      const [local, savedCodex, claude, cloud] = await Promise.all([
        threadReader.recent(roots),codexHistory.recent(roots),activeClaudeThreads(roots),cloudThreads(roots),
      ]);
      if (disposed || !showThreads || JSON.stringify(roots)!==JSON.stringify(openRoots())) return;
      const next = mergeAgentThreads(local,savedCodex,claude,cloud);
      if (JSON.stringify(next) !== JSON.stringify(threads)) {threads = next;refresh();}
    } finally {scanning = false;}
  }

  async function agentRows(root: string, agent?: Agent): Promise<Row[]> {
    const rows: Row[] = [];
    const name = agent ? agentNames[agent] : 'MCP';
    try {
      const proposal = await readProposal(root, agent);
      if (proposal) {
        const {plan, assessment} = proposal;
        const preview = plan.steps.map((step, index) => {
          const row = action(`${index + 1}. ${path.posix.basename(step.file)}`, 'file-code');
          row.description = step.reason;
          row.tooltip = `${step.file}\n${step.reason}`;
          return row;
        });
        const proposalRow = group(`${root}:${name}:plan`, plan.title, [
          action(t('한 단계씩 따라치기', 'Type step by step'), 'play', 'typeTheChange.openAgentPlan', [root, agent]),
          ...preview,
          ...(assessment ? notes(assessment) : []),
        ]);
        proposalRow.description = t(`제안 · ${plan.steps.length}단계`, `Proposal · ${plan.steps.length} steps`);
        rows.push(proposalRow);
      }
    } catch { rows.push(action(t('제안을 다시 보내 주세요', 'Resend this proposal'), 'warning')); }
    if (agent) {
      try {
        const report = await readReport(root, agent);
        if (report) {
          const cloud = agent === 'claude' && report.source;
          if (cloud && showThreads && cloudClaudeLink(cloud.url)) return rows;
          const files = report.files.map(item => {
            const row = cloud ? action(path.posix.basename(item.file), 'diff', 'typeTheChange.openClaudeEvidence', [root,item.file]) : action(item.file + (item.line ? `:${item.line}` : ''), 'file-code', 'typeTheChange.openFinding', [root, item.file, item.line]);
            row.description = cloud ? undefined : item.note;
            row.tooltip = cloud ? item.file : item.note;
            return row;
          });
          const reportRow = group(`${root}:${name}:report`, report.summary, cloud ? files : [...notes(report), ...files], !!cloud);
          reportRow.description = cloud ? t('클라우드 설명','Cloud explanation') : t('AI 검토', 'Agent review');
          reportRow.tooltip = cloud ? cloud.url : t('에이전트가 보낸 검토입니다. 현재 코드 및 Git 차이와 대조하세요.', 'Agent-reported review. Compare against the current code and Git diff.');
          rows.push(reportRow);
        }
      } catch { rows.push(action(t('검토를 다시 보내 주세요', 'Resend this review'), 'warning')); }
    }
    return rows;
  }

  async function inboxRows(): Promise<Row[]> {
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
    const rows = (await Promise.all(folders.map(async folder => {
      const root = folder.uri.fsPath;
      const channels = await Promise.all([...agents, undefined].map(async agent => {
        const items = await agentRows(root, agent);
        const name = agent ? agentNames[agent] : 'MCP';
        return items.length ? group(`${root}:${name}`, name, items, true) : undefined;
      }));
      const active = channels.filter(row => row !== undefined);
      return active.length ? (folders.length === 1 ? active : [group(root, folder.name, active, true)]) : [];
    }))).flat();
    return rows.length ? rows : [action(t('제안 없음', 'No proposals'), 'inbox')];
  }

  function changedFile(uri: vscode.Uri) {
    for (const repo of git?.repositories ?? []) {
      const sections = [
        ['conflict', repo.state.mergeChanges],
        ['working', [...repo.state.workingTreeChanges, ...(repo.state.untrackedChanges ?? [])]],
        ['staged', repo.state.indexChanges],
      ] as const;
      for (const [kind, files] of sections) {
        const change = files.find(item => item.uri.toString() === uri.toString());
        if (change) return {change, kind};
      }
    }
  }

  function fileRow(root: string, file: string, uri: vscode.Uri, status?: string): Row {
    const row = new vscode.TreeItem(uri);
    row.contextValue = 'ttcReviewableFile';
    row.description = status || path.posix.dirname(file);
    row.tooltip = file + (status ? ` · ${status}` : '');
    row.command = {command: 'typeTheChange.inspectFile', title: t('차이 또는 코드 열기', 'Open diff or code'), arguments: [root, file]};
    return row;
  }

  function sliceThreads(agent: Agent) {
    return threads.filter(thread=>thread.agent===agent)
      .sort((a,b)=>Number(!!b.active)-Number(!!a.active)||Number(!!b.cloudUrl)-Number(!!a.cloudUrl)||b.updatedAt-a.updatedAt);
  }

  function threadDescription(thread: LocalThread) {
    if (thread.cloudUrl) return t('클라우드','Cloud');
    if (thread.active) return t('진행 중','Active');
    return thread.source==='codex-app' ? t('Codex 앱','Codex app') : t('로컬','Local');
  }

  async function threadEdits(thread: LocalThread) {
    if (thread.source!=='codex-app' || thread.edits.length) return thread.edits;
    return codexHistory.edits(thread);
  }

  function recordedRows(thread: LocalThread, edits: ThreadEdit[]) {
    return edits.map(edit => {
      const labels = {add:t('추가','Added'), edit:t('수정','Edited'), delete:t('삭제','Deleted'), rename:t('이름 변경','Renamed')};
      const row = fileRow(thread.root,edit.file,vscode.Uri.joinPath(vscode.Uri.file(thread.root),edit.file),
        edit.pending ? t('편집 요청','Edit requested') : labels[edit.kind]);
      row.id = 'thread:'+thread.agent+':'+thread.id+':'+edit.file;
      row.thread = {...thread,edits};
      row.contextValue = 'ttcThreadFile';
      row.tooltip = (edit.reason || edit.context) ? edit.file+'\n'+(edit.reason||edit.context) : edit.file;
      if (edit.excerpt) row.command = {command:'typeTheChange.openThreadEvidence',title:t('당시 코드','Recorded edit'),arguments:[thread.agent,thread.id,edit.file]};
      row.iconPath = new vscode.ThemeIcon(edit.pending ? 'history' : ({add:'diff-added',edit:'diff-modified',delete:'diff-removed',rename:'diff-renamed'})[edit.kind]);
      return row;
    });
  }

  async function cloudReport(thread: LocalThread) {
    const report = await readReport(thread.root,'claude').catch(()=>undefined);
    return report?.source && cloudClaudeLink(report.source.url)===thread.cloudUrl ? report : undefined;
  }

  function threadRow(thread: LocalThread) {
    const row = group('thread:'+thread.agent+':'+thread.id, thread.title||thread.agenda||agentNames[thread.agent]+' · '+thread.id.slice(-6), async ()=>{
      if (thread.cloudUrl) {
        const report = await cloudReport(thread);
        const files = report?.files.map(item=>{
          const row = action(path.posix.basename(item.file),'diff','typeTheChange.openClaudeEvidence',[thread.root,item.file]);
          row.tooltip=item.file+'\n'+item.note;
          return row;
        }) ?? [];
        return [...files,action(t('이 스레드로 보내기','Send to this thread'),'send','typeTheChange.sendToThread',[thread.agent,thread.id])];
      }
      const report = await readReport(thread.root,thread.agent).catch(()=>undefined);
      const reply = replies.get(thread.agent+':'+thread.id);
      let files: Row[];
      try {
        const edits = await threadEdits(thread);
        files = edits.length ? recordedRows(thread,edits) : [action(t('기록된 파일 편집 없음','No recorded file edits'),'file')];
      } catch {files=[action(t('변경 기록을 다시 읽어 주세요','Reload recorded changes'),'refresh','typeTheChange.refreshSidebar')];}
      return [
        ...(reply?[action(t('최근 답변 열기','Open latest reply'),'comment','typeTheChange.openAgentReply',[thread.agent,thread.id])]:[]),
        ...(report?.threadId===thread.id?notes(report):[]),
        ...files,
      ];
    });
    row.thread=thread;
    row.contextValue='ttcAgentThread';
    const state=delivery.get(thread.id);
    row.description=threadDescription(thread)+(state?' · '+deliveryLabel(state):'');
    row.tooltip=thread.cloudUrl ? t('연결한 Claude Code 클라우드 작업','Linked Claude Code cloud session') : undefined;
    return row;
  }

  function threadRows(): Row[] {
    if (!showThreads) return [action(t('스레드 보기','Show threads'),'history','typeTheChange.toggleLocalThreads')];
    return agents.map(agent=>{
      const matching=sliceThreads(agent);
      const items=matching.slice(0,visibleCount[agent]).map(threadRow);
      if (!items.length) items.push(action(agent==='claude'?t('이 폴더에 로컬 세션 없음','No local sessions for this folder'):t('기록 없음','No threads found'),'history'));
      if (matching.length>visibleCount[agent]) items.push(action(t('더 보기','Show more'),'ellipsis','typeTheChange.moreThreads',[agent]));
      if (agent==='claude') items.push(action(t('클라우드 스레드 연결','Link cloud session'),'link','typeTheChange.linkClaudeCloud'));
      const row=group('threads:'+agent,agentNames[agent],items,true);
      row.description=String(matching.length);
      return row;
    });
  }

  function gitRows(): Row[] {
    const repos = git?.repositories ?? [];
    if (!repos.length) return [action(t('Git 작업 폴더를 열어 주세요', 'Open a Git workspace'), 'repo')];
    return repos.flatMap(repo => {
      const {indexChanges, workingTreeChanges, untrackedChanges = [], mergeChanges} = repo.state;
      const conflicts = new Set(mergeChanges.map(change => change.uri.toString()));
      const working = [...new Map([...workingTreeChanges, ...untrackedChanges].map(change => [change.uri.toString(), change])).values()]
        .filter(change => !conflicts.has(change.uri.toString()));
      const root = repo.rootUri.fsPath;
      const sections = [
        {kind: 'working', label: t('작업 중', 'Working tree'), entries: working},
        {kind: 'staged', label: t('스테이징됨', 'Staged'), entries: indexChanges},
        {kind: 'conflict', label: t('충돌', 'Conflicts'), entries: mergeChanges},
      ].filter(section => section.entries.length).map(({kind, label, entries}) => {
        const rows = entries.slice(0, limit).map(change => {
          const folder = vscode.workspace.getWorkspaceFolder(change.uri);
          const reviewRoot = folder?.uri.fsPath;
          const row = reviewRoot ? fileRow(reviewRoot, path.relative(reviewRoot, change.uri.fsPath).split(path.sep).join('/'), change.uri) : new vscode.TreeItem(change.uri);
          row.id = `${root}:${kind}:${change.uri.toString()}`;
          row.description = path.relative(root, path.dirname(change.uri.fsPath));
          row.tooltip = path.relative(root, change.uri.fsPath);
          row.command = {command: 'typeTheChange.openGitChange', title: t('차이 열기', 'Open diff'), arguments: [change, kind]};
          return row;
        });
        if (entries.length > limit) rows.push(action(t('소스 제어에서 전체 보기', 'See all in Source Control'), 'source-control', 'workbench.view.scm'));
        const row = group(`${root}:${kind}`, label, rows, true);
        row.description = String(entries.length);
        return row;
      });
      if (!sections.length) sections.push(action(t('저장된 Git 변경 없음', 'No saved Git changes'), 'check'));
      return repos.length === 1 ? sections : [group(`git:${root}`, path.basename(root), sections, true)];
    });
  }

  function currentRows(): Row[] {
    const uri = lastFile?.scheme === 'file' ? lastFile : undefined;
    const folder = uri && vscode.workspace.getWorkspaceFolder(uri);
    if (!uri || !folder) return [action(t('파일을 열어 시작','Open a file to start'),'file-code')];
    const file = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    try {validateRelativePath(file);} catch {return [];}
    const row = fileRow(folder.uri.fsPath,file,uri,t('현재 파일','Current file'));
    row.id = 'current-file';
    return [
      row,
      action(t('변경 이유','Why it changed'),'question','typeTheChange.explainCurrentFile',[uri]),
    ];
  }
  const tree = vscode.window.createTreeView(viewId, {showCollapseAll: true, treeDataProvider: {
    onDidChangeTreeData: changes.event,
    getTreeItem: row => row,
    getChildren: (row?: Row) => row
      ? typeof row.children === 'function' ? row.children() : row.children ?? []
      : [
        ...currentRows(),
        action(t('보내기', 'Send'), 'send', 'typeTheChange.sendAgent'),
        group('local-threads', t('스레드', 'Threads'), threadRows, true),
        group('agent-inbox', t('설명·제안', 'Reviews & proposals'), inboxRows),
        group('git-changes', t('변경', 'Git changes'), gitRows),
      ],
  }});
  visible = tree.visible;
  const polling = setInterval(() => {void scanThreads();}, 3000);
  const visibility = tree.onDidChangeVisibility(event => {visible = event.visible;if (visible) void scanThreads();});
  const connectRepo = (repo: GitRepository) => {
    if (!repositories.has(repo)) repositories.set(repo, repo.state.onDidChange(refresh));
    refresh();
  };
  const disconnectRepo = (repo: GitRepository) => {
    repositories.get(repo)?.dispose();
    repositories.delete(repo);
    refresh();
  };
  void (async () => {
    try {
      const extension = vscode.extensions.getExtension<{enabled: boolean; onDidChangeEnablement: vscode.Event<boolean>; getAPI(version: 1): GitApi}>('vscode.git');
      if (!extension) return;
      const exports = await extension.activate();
      if (disposed) return;
      function setGit(enabled: boolean) {
        for (const sub of gitSubscriptions.splice(0)) sub.dispose();
        for (const repo of repositories.keys()) disconnectRepo(repo);
        git = enabled ? exports.getAPI(1) : undefined;
        if (git) {
          gitSubscriptions.push(git.onDidOpenRepository(connectRepo), git.onDidCloseRepository(disconnectRepo));
          git.repositories.forEach(connectRepo);
        }
        refresh();
      }
      gitEnabled = exports.onDidChangeEnablement(setGit);
      setGit(exports.enabled);
    } catch { refresh(); }
  })();

  const watch = vscode.workspace.createFileSystemWatcher(`**/.type-the-change/{${inboxFiles.join(',')}}`);
  watch.onDidCreate(refresh);
  watch.onDidChange(refresh);
  watch.onDidDelete(refresh);
  function evidenceColumn() {
    return map?.visible && map.viewColumn === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
  }
  async function showEvidence(file: string, key: string, excerpt: {before:string;after:string}, title: string) {
    const [before,after] = [excerpt.before,excerpt.after].map((body,index) => {
      const uri = vscode.Uri.from({scheme:'type-the-change-assessment',path:'/'+(index?'after':'before')+'/'+file,query:key});
      outputs.set(uri.toString(),body);
      return uri;
    });
    await vscode.commands.executeCommand('vscode.diff',before,after,file+' · '+title,{preview:true,viewColumn:evidenceColumn()});
  }
  async function openThreadEvidence(thread: LocalThread, file: string) {
    requireFolder(thread.root);
    if (thread.cloudUrl) {
      if ((await cloudReport(thread))?.files.some(item=>item.file===file)) await openClaudeEvidence(thread.root,file);
      return;
    }
    const edit = (await threadEdits(thread).catch(()=>[])).find(item => item.file === file);
    if (!edit) return;
    if (!edit.excerpt) {
      await vscode.commands.executeCommand('typeTheChange.inspectFile',thread.root,file);
      return;
    }
    await showEvidence(file,thread.id,edit.excerpt,t('당시 코드','Recorded edit'));
  }
  async function openClaudeEvidence(root: string, file: string) {
    try {
      requireFolder(root);
      validateRelativePath(file);
      const report = await readReport(root,'claude');
      const item = report?.files.find(row=>row.file===file);
      const source = report?.source;
      if (!report || !item || !source) return;
      const {commit} = source;
      const patch = await readGit(root,['diff','--no-ext-diff','--no-textconv','--no-color',commit+'^',commit,'--',file]);
      const hunks = parseHunks(patch).filter(hunk=>hunk.after!==hunk.before && hunk.after.length+hunk.before.length<=16*1024);
      const hunk = (item.line && hunks.find(h=>item.line!>=h.newLine && item.line!<h.newLine+h.after.split('\n').length)) || hunks[0];
      if (!hunk) throw new Error('No matching commit evidence.');
      requireFolder(root);
      const reasonColumn = evidenceColumn() === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
      await showEvidence(file,commit,hunk,t('커밋','Commit')+' '+commit.slice(0,9));
      const uri = vscode.Uri.from({scheme:'type-the-change-assessment',path:'/'+t('Claude 변경 이유','Why Claude changed this')+'.txt',query:commit+file});
      outputs.set(uri.toString(),report.summary+'\n\n'+item.note);
      await vscode.window.showTextDocument(uri,{viewColumn:reasonColumn,preview:true,preserveFocus:true});
    } catch {
      void vscode.window.showWarningMessage(t('이 커밋에서 해당 파일의 diff를 찾지 못했어요.','No matching local commit diff for this file.'));
    }
  }
  async function linkClaudeCloud() {
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder=>folder.uri.scheme==='file');
    const folder = folders.length===1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
    if (!folder) return;
    const root=folder.uri.fsPath;
    requireFolder(root);
    const value=await vscode.window.showInputBox({
      title:t('Claude 클라우드 스레드 연결','Link a Claude cloud session'),
      placeHolder:'https://claude.ai/code/…',
      validateInput: input=>cloudClaudeLink(input) ? undefined : t('Claude Code 작업 링크를 붙여 넣으세요.','Paste a Claude Code session link.'),
    });
    const url=value && cloudClaudeLink(value);
    if (!url) return;
    const title=await vscode.window.showInputBox({prompt:t('사이드바에 표시할 이름','Name in the sidebar'),value:t('Claude 클라우드 작업','Claude cloud session')});
    if (title===undefined) return;
    requireFolder(root);
    const links=cloudLinks().filter(link=>link.url!==url);
    await context.workspaceState.update(cloudLinksKey,[{root,url,title:title.trim().slice(0,120)||'Claude Code',addedAt:Date.now()},...links].slice(0,30));
    showThreads=true;
    await context.workspaceState.update(localHistoryKey,true);
    void scanThreads();
  }

  async function sendCloudThread(thread: LocalThread) {
    const url=thread.cloudUrl && cloudClaudeLink(thread.cloudUrl);
    if (!url || ownerSends.has(url)) return;
    requireFolder(thread.root);
    ownerSends.add(url);
    try {
      const prompt=await vscode.window.showInputBox({
        title:thread.title||'Claude Code',
        prompt:t('기존 클라우드 세션의 모델과 권한으로 실행됩니다.','Runs with the existing cloud session’s model and permissions.'),
        placeHolder:t('이 세션에 보낼 요청','Request to send to this session'),
        validateInput:value=>value.trim().length>3000?t('3,000자 이내로 적어 주세요.','Use 3,000 characters or fewer.'):undefined,
      });
      if (!prompt?.trim()) return;
      requireFolder(thread.root);
      setDelivery(thread.id,'sending');
      await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:t('Claude 클라우드로 보내는 중','Sending to Claude Cloud')},
        ()=>sendClaudeCloud(url,thread.root,prompt.trim(),abortReviews.signal));
      setDelivery(thread.id,'queued');
    } catch {
      setDelivery(thread.id,'uncertain');
      void vscode.window.showWarningMessage(t('Claude 클라우드의 접수를 확인하지 못했어요. 다시 보내기 전에 원래 스레드를 확인하세요.','Claude Cloud did not confirm delivery. Check the original session before resending.'));
    } finally {ownerSends.delete(url);}
  }

  async function sendCodexOwner(thread: LocalThread, file?: string, explain = false) {
    if (ownerSends.has(thread.id)) return;
    requireFolder(thread.root);
    ownerSends.add(thread.id);
    try {
      const prompt=await vscode.window.showInputBox({
        title:thread.title||'Codex',
        prompt:t('원래 Codex 채팅의 모델과 권한으로 실행됩니다.','Runs with the original Codex chat’s model and permissions.'),
        value:file && explain ? t(file+'의 변경 이유, 근거 코드 한 곳과 영향을 설명해 주세요.','Explain why '+file+' changed, with one code reference and one impact.') : undefined,
        placeHolder:t('이 채팅에 보낼 요청','Request to send to this chat'),
        validateInput:value=>value.trim().length>3000?t('3,000자 이내로 적어 주세요.','Use 3,000 characters or fewer.'):undefined,
      });
      if (!prompt?.trim()) return;
      requireFolder(thread.root);
      const configured=vscode.workspace.getConfiguration('typeTheChange').get<string>('codexPath');
      const command=await findCodex(configured);
      requireFolder(thread.root);
      setDelivery(thread.id,'sending');
      await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:t('Codex 채팅으로 보내는 중','Sending to the Codex chat')},
        ()=>queueExplanation(command,thread.id,prompt.trim()));
      setDelivery(thread.id,'queued');
    } catch(error) {
      const uncertain=error instanceof RequestError && error.code==='uncertain';
      setDelivery(thread.id,uncertain?'uncertain':'failed');
      void vscode.window.showWarningMessage(uncertain?t('Codex의 접수를 확인하지 못했어요. 다시 보내기 전에 원래 채팅을 확인하세요.','Codex did not confirm delivery. Check the original chat before resending.'):t('Codex 채팅에 보낼 수 없어요. 앱과 CLI를 확인하세요.','Could not send to this Codex chat. Check the app and CLI.'));
    } finally {ownerSends.delete(thread.id);}
  }

  async function sendAgent(row?: Row | vscode.Uri, planMode = false, explain = false) {
      const treeRow = row && !('scheme' in row) ? row : undefined;
      const thread = treeRow?.thread && threads.find(item => item.id === treeRow.thread?.id && item.agent === treeRow.thread?.agent && item.root === treeRow.thread?.root);
      if (treeRow?.thread && !thread) return;
      const active = lastFile;
      const candidate = row && 'scheme' in row ? row : treeRow?.resourceUri ?? (!thread ? active : undefined);
      const uri = candidate?.scheme === 'file' && vscode.workspace.getWorkspaceFolder(candidate) ? candidate : undefined;
      const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : thread
        ? vscode.workspace.workspaceFolders?.find(folder => folder.uri.fsPath === thread.root)
        : (vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0] : await vscode.window.showWorkspaceFolderPick());
      if (!folder) {void vscode.window.showInformationMessage(t('먼저 작업 폴더를 열어 주세요.', 'Open a workspace folder first.'));return;}
      const root = folder.uri.fsPath;
      const file = uri ? path.relative(root, uri.fsPath).split(path.sep).join('/') : undefined;
      let lock: string | undefined;
      try {
        requireFolder(root);
        const agent = thread?.agent ?? (await vscode.window.showQuickPick(agents.map(agent => ({label: agentNames[agent], agent})),
          {placeHolder:t('보낼 에이전트', 'Send to which agent?')}))?.agent;
        if (!agent) return;
        const existing = threads.filter(item => item.root === root && item.agent === agent);
        const target = thread ? {thread} : (existing.length ? (await vscode.window.showQuickPick([
          {label:t('새 스레드', 'New thread'), thread:undefined},
          ...existing.map(thread => ({label:thread.title || thread.id, description:thread.id.slice(-6), thread})),
        ], {placeHolder:t('어느 스레드로 보낼까요?', 'Choose a thread') })) : {thread:undefined});
        if (!thread && !target) return;
        const selected=target?.thread;
        if (selected?.cloudUrl) {
          if (!planMode && !explain) await sendCloudThread(selected);
          return;
        }
        if (selected?.source==='codex-app' && (selected.active || !selected.localRecord)) {
          if (!planMode) await sendCodexOwner(selected,file,explain);
          return;
        }
        if (selected?.agent==='claude' && selected.active) {
          void vscode.window.showInformationMessage(t('Claude가 이 로컬 세션을 사용 중입니다. 완료 뒤 이어보거나 클라우드 작업을 연결하세요.','Claude is using this local session. Wait for it to finish or link a cloud session.'));
          return;
        }
        const threadId = target?.thread?.id;
        const picked = await vscode.window.showQuickPick([
          ...agentModels[agent].map((model,index) => ({label:model, model,
            description:index === 0 ? t('기본값','Default') : ''})),
          {label:t('모델 ID 입력', 'Enter a model ID'), model:undefined},
        ], {placeHolder:t('모델 선택', 'Choose a model')});
        if (!picked) return;
        const model = picked.model ?? await vscode.window.showInputBox({
          prompt:t('에이전트가 지원하는 모델 ID', 'A model ID supported by this agent'),
          validateInput: value => /^[a-z0-9][a-z0-9_.:-]{0,119}$/i.test(value.trim()) ? undefined : t('모델 ID를 확인해 주세요.', 'Check the model ID.'),
        });
        if (model === undefined) return;
        const effortLabels = {low:t('최소','Low'),medium:t('중간 · 기본값','Medium · default'),high:t('높음','High')};
        const level = await vscode.window.showQuickPick(effortLevels.map(effort => ({label:effortLabels[effort],effort})),
          {placeHolder:t('추론 수준 선택','Choose reasoning effort')});
        if (!level) return;
        if (planMode && !file) {
          void vscode.window.showInformationMessage(t('따라칠 파일을 먼저 선택해 주세요.', 'Select a file to practice on first.'));
          return;
        }
        const explanation = file && explain ? t(
          file+'을 왜 바꿨나요? 바꾸게 된 조건이나 호출 흐름, 근거 코드 한 곳, 영향 한 가지를 짧게 설명해 주세요.',
          'Why did '+file+' change? Briefly give the trigger or call path, one code reference, and one impact.',
        ) : undefined;
        const intent = (await vscode.window.showInputBox({
          value: explanation,
          prompt:file ? t(`요청과 함께 저장된 ${file} 및 Git 차이를 보냅니다`, `Sends saved ${file} and its Git diff with your request`) : t('이 스레드에 보낼 요청', 'Request to send to this thread'),
          placeHolder:t('예: 이 변경으로 어떤 입력의 결과가 달라지는지 설명해 줘', 'Example: Explain which inputs will behave differently'),
          validateInput:value => value.trim().length > 3000 ? t('3,000자 이내로 적어 주세요.', 'Use 3,000 characters or fewer.') : undefined,
        }))?.trim();
        if (!intent) return;
        requireFolder(root);
        const key = `${agent}:${threadId ?? root}`;
        if (running.has(key)) {void vscode.window.showInformationMessage(t('이 스레드에 보낸 요청이 진행 중이에요.', 'This agent already has a request in progress here.'));return;}
        running.set(key, {agent, agenda:intent.split('\n')[0].slice(0,140)});lock = key;refresh();
        const recorded = file && target?.thread ? (treeRow?.thread?.edits.find(edit=>edit.file===file)?.excerpt ??
          (await threadEdits(target.thread).catch(()=>[])).find(edit=>edit.file===file)?.excerpt) : undefined;
        const source = file ? await readWorkspaceFile(root, file).catch(error => {
          if (recorded && error instanceof WorkspaceFileError && error.code === 'missing_file') return '';
          throw error;
        }) : '';
        const repo = uri && (git?.repositories ?? []).filter(repo => vscode.workspace.getWorkspaceFolder(repo.rootUri)?.uri.fsPath === root &&
          !path.relative(repo.rootUri.fsPath, uri.fsPath).startsWith('..')).sort((a,b) => b.rootUri.fsPath.length-a.rootUri.fsPath.length)[0];
        const diff = uri && repo ? await repo.diffWithHEAD(uri.fsPath).catch(() => '') : '';
        requireFolder(root);
        const korean = language().startsWith('ko');
        const prompt = file ? reviewPrompt(file, source, diff, intent, korean, planMode, !!threadId, recorded) : intent;
        if (!showThreads) {
          showThreads = true;
          await context.workspaceState.update(localHistoryKey, true);
          refresh();
        }
        const answer = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,
          title:`${agentNames[agent]} · ${model} · ${level.effort}`, cancellable:true}, async (_progress, token) => {
          const controller = new AbortController();
          const subscription = token.onCancellationRequested(() => controller.abort());
          if (token.isCancellationRequested) controller.abort();
          try {return await runAgentTurn(agent, {root:target?.thread?.cwd ?? root, threadId, model:model.trim(), effort:level.effort}, prompt, AbortSignal.any([controller.signal, abortReviews.signal]));}
          finally {subscription.dispose();}
        });
        requireFolder(root);
        if (planMode && file) {
          const plan = parsePlan(answer.text);
          if (plan.steps.some(step => step.file !== file)) throw new Error(t('선택한 파일 외의 제안이 포함됐어요.', 'The proposal referenced a different file.'));
          const latest = await readWorkspaceFile(root, file);
          validatePlanAgainstFiles(plan, new Map([[file, latest]]));
          await writeBridgeFile(root, planFile(agent), {plan});
          refresh();
          const open = t('따라치기','Type it');
          void vscode.window.showInformationMessage(t('따라칠 수정안이 도착했어요.', 'A typing proposal is ready.'), open).then(choice => {
            if (choice === open) void vscode.commands.executeCommand('typeTheChange.openAgentPlan', root, agent);
          });
        } else {
          const id = createHash('sha256').update(answer.text).update(String(Date.now())).digest('hex').slice(0,12);
          const result = vscode.Uri.from({scheme:'type-the-change-assessment', path:`/${agentNames[agent]} - ${path.basename(file ?? folder.name)}.txt`, query:id});
          const reported = answer.models?.length
            ? t('보고된 모델', 'Reported models') + ' · ' + answer.models.join(', ') + '\n' : '';
          outputs.set(result.toString(), `${agentNames[agent]} · ${model} · ${level.effort}\n${reported}${file ?? folder.name}\n\n${answer.text}`);
          if (answer.threadId) replies.set(`${agent}:${answer.threadId}`, result);
          if (outputs.size > 20) {
            const oldest = outputs.keys().next().value!;
            outputs.delete(oldest);
            for (const [key, uri] of replies) if (uri.toString() === oldest) replies.delete(key);
          }
          await vscode.window.showTextDocument(result, {viewColumn:vscode.ViewColumn.Beside, preview:true, preserveFocus:true});
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          void vscode.window.showWarningMessage(error instanceof Error ? error.message : t('요청을 완료하지 못했어요.', 'The request could not finish.'));
        }
      } finally {if (lock) {running.delete(lock);refresh();}void scanThreads();}
  }

  let mapRevision = 0;
  const postMap = async () => {
    const panel = map;
    if (!panel) return;
    const revision = ++mapRevision;
    const shown=agents.flatMap(agent=>sliceThreads(agent).slice(0,visibleCount[agent]));
    const rendered=await Promise.all(shown.map(async thread=>{
      const {id,agent,root,title,agenda,turn,source,active}=thread;
      const report=thread.cloudUrl ? await cloudReport(thread) : await readReport(root,agent).catch(()=>undefined);
      const loaded=requestedHistory.has(id);
      const edits=thread.cloudUrl
        ? (report?.files.map(({file,note})=>({file,kind:'edit',pending:false,reason:note,hasExcerpt:false}))??[])
        : (loaded?await threadEdits(thread).catch(()=>[]):thread.edits).map(({excerpt,...edit})=>({...edit,hasExcerpt:!!excerpt}));
      const state=delivery.get(id);
      return {id,agent,title,agenda,turn,source,active,edits,cloud:!!thread.cloudUrl,
        delivery:state && deliveryLabel(state),sending:state==='sending',
        historyAvailable:source==='codex-app'&&!loaded&&!edits.length,
        impact:report && (thread.cloudUrl || report.threadId===id) ? report.impact : undefined,
        hasReply:replies.has(agent+':'+id)};
    }));
    if (map !== panel || revision !== mapRevision) return;
    void panel.webview.postMessage({
      enabled: showThreads,
      running: [...running.values()],
      threads: rendered,
      counts:Object.fromEntries(agents.map(agent=>[agent,sliceThreads(agent).length])),
    });
  };
  context.subscriptions.push(tree, changes, watch, visibility, changes.event(postMap),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      const uri = editor?.document.uri;
      if (uri?.scheme === 'file' && vscode.workspace.getWorkspaceFolder(uri)) {lastFile=uri;refresh();}
    }), vscode.workspace.onDidChangeWorkspaceFolders(() => {threads = [];refresh();}),
    vscode.workspace.registerTextDocumentContentProvider('type-the-change-assessment', {provideTextDocumentContent: uri => outputs.get(uri.toString()) ?? ''}),
    vscode.commands.registerCommand('typeTheChange.refreshSidebar', () => {refresh();void scanThreads();}),
    vscode.commands.registerCommand('typeTheChange.linkClaudeCloud', linkClaudeCloud),
    vscode.commands.registerCommand('typeTheChange.moreThreads', (agent: Agent) => {
      if (agents.includes(agent)) {visibleCount[agent]+=threadPageSize;refresh();}
    }),
    vscode.commands.registerCommand('typeTheChange.sendToThread', (agent: Agent,id: string) => {
      const thread=threads.find(item=>item.agent===agent&&item.id===id);
      if (thread) {const row:Row=new vscode.TreeItem(thread.title||id);row.thread=thread;return sendAgent(row);}
    }),
    vscode.commands.registerCommand('typeTheChange.openClaudeEvidence', openClaudeEvidence),
    vscode.commands.registerCommand('typeTheChange.openAgentReply', async (agent: Agent, id: string) => {
      const uri = replies.get(`${agent}:${id}`);
      if (uri) await vscode.window.showTextDocument(uri, {viewColumn:vscode.ViewColumn.Two, preview:true});
    }),
    vscode.commands.registerCommand('typeTheChange.activityMap', () => {
      if (map) {map.reveal(map.viewColumn);return;}
      const panel = vscode.window.createWebviewPanel('typeTheChange.activity', t('에이전트 작업','Agent activity'),
        {viewColumn:vscode.ViewColumn.Two,preserveFocus:true}, {enableScripts:true,localResourceRoots:[],retainContextWhenHidden:true});
      map = panel;
      panel.webview.html = activityHtml(randomBytes(24).toString('base64'), language().startsWith('ko'));
      panel.webview.onDidReceiveMessage(message => {
        if (message?.command === 'ready') {void postMap();return;}
        if (message?.command === 'enable' && !showThreads) {void vscode.commands.executeCommand('typeTheChange.toggleLocalThreads');return;}
        if (message?.command === 'link') {void linkClaudeCloud();return;}
        if (message?.command === 'more') {void vscode.commands.executeCommand('typeTheChange.moreThreads',message.agent);return;}
        if (message?.command === 'send' && !message.id) {void vscode.commands.executeCommand('typeTheChange.sendAgent');return;}
        const thread = threads.find(thread => thread.id === message?.id && thread.agent === message?.agent);
        if (!thread) return;
        if (message.command === 'load') {requestedHistory.add(thread.id);void postMap();}
        else if (message.command === 'evidence' && typeof message.file==='string') {
          void openThreadEvidence(thread,message.file);
        } else if (!thread.cloudUrl && (message.command==='file'||message.command==='why') && typeof message.file==='string') {
          void threadEdits(thread).then(edits=>{
            if (!edits.some(edit=>edit.file===message.file)) return;
            if (message.command==='file') {void vscode.commands.executeCommand('typeTheChange.inspectFile',thread.root,message.file);return;}
            const row:Row=new vscode.TreeItem(vscode.Uri.joinPath(vscode.Uri.file(thread.root),message.file));
            row.thread={...thread,edits};
            void sendAgent(row,false,true);
          }).catch(()=>{});
        } else if (message.command === 'reply') {
          void vscode.commands.executeCommand('typeTheChange.openAgentReply', thread.agent, thread.id);
        } else if (message.command === 'send') {
          const row: Row = new vscode.TreeItem(thread.title ?? thread.id);
          row.thread = thread;
          void vscode.commands.executeCommand('typeTheChange.sendAgent', row);
        }
      });
      panel.onDidDispose(() => {if (map === panel) map = undefined;});
      void scanThreads();
    }),
    vscode.commands.registerCommand('typeTheChange.toggleLocalThreads', async () => {
      showThreads = !showThreads;
      await context.workspaceState.update(localHistoryKey, showThreads);
      if (!showThreads) threads = [];
      refresh();
      void scanThreads();
    }),
    vscode.commands.registerCommand('typeTheChange.inspectFile', async (root: string, file: string) => {
      try {
        requireFolder(root);
        validateRelativePath(file);
        const uri = vscode.Uri.joinPath(vscode.Uri.file(root), file);
        const status = changedFile(uri);
        if (status) await vscode.commands.executeCommand('typeTheChange.openGitChange', status.change, status.kind);
        else {
          const [realRoot, realFile] = await Promise.all([realpath(root), realpath(uri.fsPath)]);
          const relative = path.relative(realRoot, realFile);
          if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('File is outside the workspace.');
          await vscode.commands.executeCommand('vscode.open', uri, {viewColumn:evidenceColumn()});
        }
      } catch {void vscode.window.showWarningMessage(t('현재 폴더에서 파일을 열 수 없어요.', 'The file is unavailable in this workspace.'));}
    }),
    vscode.commands.registerCommand('typeTheChange.openThreadEvidence', (agent: Agent,id: string,file: string) => {
      const thread=threads.find(item=>item.agent===agent&&item.id===id);
      if (thread) return openThreadEvidence(thread,file);
    }),
    vscode.commands.registerCommand('typeTheChange.openSidebar', () => vscode.commands.executeCommand(viewId + '.focus')),
    vscode.commands.registerCommand('typeTheChange.sendAgent', sendAgent),
    vscode.commands.registerCommand('typeTheChange.explainThreadFile', (row?: Row) => sendAgent(row,false,true)),
    vscode.commands.registerCommand('typeTheChange.explainCurrentFile', async (uri: vscode.Uri) => {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (!folder) return;
      const file = path.relative(folder.uri.fsPath,uri.fsPath).split(path.sep).join('/');
      const matches = threads.filter(thread=>thread.root===folder.uri.fsPath&&thread.edits.some(edit=>edit.file===file));
      const target = matches.length===1 ? matches[0] : matches.length ? (await vscode.window.showQuickPick(matches.map(thread=>({
        label:thread.title||thread.agenda||agentNames[thread.agent],description:agentNames[thread.agent],thread,
      })),{placeHolder:t('스레드 선택','Choose a thread')}))?.thread : undefined;
      if (matches.length && !target) return;
      const edit = target?.edits.find(edit=>edit.file===file);
      const reason = edit?.reason ?? edit?.context;
      if (reason && target) {
        const result=vscode.Uri.from({scheme:'type-the-change-assessment',path:'/'+path.basename(file)+'.txt',query:target.id+'-why'});
        const label = edit?.reason ? '' : t('수정 직전 설명','Before the edit')+'\n';
        outputs.set(result.toString(),agentNames[target.agent]+'\n\n'+label+reason);
        const reasonColumn = evidenceColumn() === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
        await openThreadEvidence(target,file);
        await vscode.window.showTextDocument(result,{viewColumn:reasonColumn,preview:true});
        return;
      }
      const row: Row = new vscode.TreeItem(uri);
      row.thread = target;
      await sendAgent(row,false,true);
    }),
    vscode.commands.registerCommand('typeTheChange.planWithAgent', (row?: Row | vscode.Uri) => sendAgent(row, true)),
    vscode.commands.registerCommand('typeTheChange.openFinding', async (root: string, file: string, line?: number) => {
      try {
        requireFolder(root);
        await readWorkspaceFile(root, file);
        const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.Uri.file(root), file));
        const position = new vscode.Position(Math.max(0, Math.min(document.lineCount - 1, (line ?? 1) - 1)), 0);
        await vscode.window.showTextDocument(document, {preview: true, selection: new vscode.Range(position, position)});
      } catch { void vscode.window.showWarningMessage(t('파일 위치가 바뀌었어요. 최신 Git 변경을 확인해 주세요.', 'That file is unavailable. Check the latest Git changes.')); }
    }),
    vscode.commands.registerCommand('typeTheChange.openGitChange', async (change: GitChange, kind: string) => {
      if (!git || !change?.uri) return;
      // Git's staging view uses HEAD → index; working changes use index → disk.
      // For new files and conflicts, use the built-in file/merge editor.
      if (kind === 'conflict' || change.status === gitStatus.untracked) {
        await vscode.commands.executeCommand('vscode.open', change.uri, {viewColumn:evidenceColumn()});
        return;
      }
      const staged = kind === 'staged';
      const empty = vscode.Uri.from({scheme:'type-the-change-assessment', path:'/empty'});
      const original = change.status === gitStatus.addedToIndex ? empty : git.toGitUri(change.originalUri, staged ? 'HEAD' : '~');
      const deleted = change.status === gitStatus.deleted || change.status === gitStatus.deletedFromIndex;
      const edited = deleted ? empty : staged ? git.toGitUri(change.uri, '') : change.uri;
      await vscode.commands.executeCommand('vscode.diff', original, edited, path.basename(change.uri.fsPath) + (staged ? ' · Staged' : ' · Working tree'), {preview: true, viewColumn:evidenceColumn()});
    }),
    {dispose() {
      disposed = true;
      clearTimeout(timer);
      clearInterval(polling);
      abortReviews.abort();
      codexHistory.dispose();
      map?.dispose();
      gitEnabled?.dispose();
      for (const sub of gitSubscriptions) sub.dispose();
      for (const sub of repositories.values()) sub.dispose();
    }},
  );
}
