import * as vscode from 'vscode';
import path from 'node:path';
import {homedir} from 'node:os';
import {readFile,writeFile,mkdir,lstat,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Companion} from './companion.js';
import {CodexObserver,findCodex} from './codex-observer.js';
import {mergeHooks} from './codex-events.js';
import {readWorkspaceFile} from './workspace-files.js';
import {locateHunk,canPractice} from './change-review.js';
import {text as t} from './locale.js';
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
export function createCompanion(context:vscode.ExtensionContext,render:()=>void){
 let followTimer:NodeJS.Timeout|undefined,followSelection=false,followRevision=0;
 const model=new Companion(async()=>{
  const config=vscode.workspace.getConfiguration('typeTheChange');
  const command=await findCodex(config.get<string>('codexPath'));
  return new CodexObserver({command,cwd:vscode.workspace.workspaceFolders?.[0]?.uri.fsPath||homedir(),version:context.extension.packageJSON.version,socket:config.get<string>('codexSocket')||undefined});
 },()=>{render();scheduleFollow();},undefined,(root,file)=>(vscode.workspace.textDocuments||[]).find(d=>d.uri.scheme==='file'&&d.isDirty&&path.resolve(d.uri.fsPath)===path.resolve(root,file))?.getText(),()=>(vscode.workspace.textDocuments||[]).filter(d=>d.isDirty&&d.uri.scheme==='file').map(d=>d.uri.fsPath));
 const snapshots=new Map<string,string>();let practice:{uri:string;hash:string;hunk:number;thread?:string}|undefined;
 context.subscriptions.push(model,vscode.workspace.registerTextDocumentContentProvider('ttc-codex-review',{provideTextDocumentContent:uri=>snapshots.get(uri.toString())||''}));
 context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event=>{
  if(practice&&event.document.uri.toString()===practice.uri&&model.state.review?.hash===practice.hash&&model.state.hunk===practice.hunk&&model.state.selected?.id===practice.thread)model.practice(event.document.getText());
 }));
 function scheduleFollow(selection=false){
  followSelection ||= selection;clearTimeout(followTimer);const revision=++followRevision;
  followTimer=setTimeout(async()=>{
   const move=followSelection;followSelection=false;
   if(!vscode.workspace.isTrusted||vscode.env.remoteName)return;
   const active=vscode.window.activeTextEditor;
   // Practice and pinned read-only comparisons must not replace their review.
   if(!active||['untitled','ttc-codex-review'].includes(active.document.uri.scheme))return;
   const input=vscode.window.tabGroups?.activeTabGroup.activeTab?.input;
   const diff=input instanceof vscode.TabInputTextDiff?input:undefined;
   const uri=diff?diff.modified:active.document.uri;
   if(!['file','git'].includes(uri.scheme)||!diff&&uri.scheme!=='file')return;
   const editor=vscode.window.visibleTextEditors.find(e=>e.document.uri.toString()===uri.toString());
   try{
    let comparison;
    if(diff&&['git','file'].includes(diff.original.scheme)){
     const [before,after]=await Promise.all([vscode.workspace.openTextDocument(diff.original),vscode.workspace.openTextDocument(diff.modified)]);
     comparison={key:diff.original.toString()+'|'+diff.modified.toString(),before:before.getText(),after:after.getText()};
    }
    if(revision!==followRevision)return;
    // Git's virtual editor may add a .git display suffix; its query retains
    // the actual resource path (including staged/deleted file comparisons).
    const file=uri.scheme==='git'?JSON.parse(uri.query).path:uri.fsPath;
    if(typeof file!=='string'||!path.isAbsolute(file))return;
    await model.followEditor(file,move&&editor?editor.selection.active.line+1:undefined,comparison);
   }catch{/* A closed/unavailable editor must not interrupt the Codex observer. */}
  },120);
 }
 if(vscode.window.onDidChangeActiveTextEditor)context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(()=>scheduleFollow(true)));
 if(vscode.window.onDidChangeTextEditorSelection)context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(()=>scheduleFollow(true)));
 context.subscriptions.push({dispose:()=>clearTimeout(followTimer)});
 function trusted(){if(!vscode.workspace.isTrusted||vscode.env.remoteName)throw Error(t('로컬의 신뢰한 작업공간에서 Codex를 연결하세요.','Connect Codex from a trusted local workspace.'));}
 async function select(id:string){trusted();model.select(id);await context.workspaceState.update('companion.selected',id);}
 function virtual(name:string,text:string){const uri=vscode.Uri.from({scheme:'ttc-codex-review',path:'/'+randomUUID()+'/'+name});snapshots.set(uri.toString(),text);while(snapshots.size>20)snapshots.delete(snapshots.keys().next().value!);return uri;}
 async function openDiff(){const r=model.state.review;if(!r)return;const h=r.hunks[model.state.hunk];
  const before=r.recorded?h?.before||'':r.before,after=r.recorded?h?.after||'':r.after;
  await vscode.commands.executeCommand('vscode.diff',virtual('before/'+r.file,before),virtual('after/'+r.file,after),r.file+' · '+(r.recorded?t('Codex 수정 기록 (발췌)','Codex recorded edit (excerpt)'):t('변경 시점 비교','Change snapshot')),{preview:false,viewColumn:vscode.ViewColumn.One});
  if(model.state.review===r)model.compared();
 }
 async function practiceChange(){const r=model.state.review,h=r?.hunks[model.state.hunk];if(!r||!h||r.stale||!canPractice(h))return;
  // Excerpts are not complete programs. Plain text avoids misleading language
  // errors and project tooling in a short, disposable exercise.
  const document=await vscode.workspace.openTextDocument({content:h.before,language:'plaintext'});
  practice={uri:document.uri.toString(),hash:r.hash,hunk:model.state.hunk,thread:model.state.selected?.id};model.practice(document.getText());
  await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,preview:false});
 }
 async function comparePractice(){
  const r=model.state.review,h=r?.hunks[model.state.hunk];
  if(!r||!h||practice?.hash!==r.hash||practice.hunk!==model.state.hunk||practice.thread!==model.state.selected?.id)return;
  const doc=vscode.workspace.textDocuments.find(d=>d.uri.toString()===practice!.uri);if(!doc)return;
  await vscode.commands.executeCommand('vscode.diff',virtual('your-code.txt',doc.getText()),virtual('codex-code.txt',h.after),t('내 코드 ↔ Codex 변경','My code ↔ Codex change'),{preview:false,viewColumn:vscode.ViewColumn.One});
 }
 async function source(){const r=model.state.review,h=r?.hunks[model.state.hunk];if(!r)return;
  await readWorkspaceFile(r.root,r.file,1024*1024);const document=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(r.root,r.file)));
  const line=!r.recorded&&document.getText()===r.after?Math.min(Math.max(0,(h?.newLine||1)-1),document.lineCount-1):h?locateHunk(document.getText(),h):undefined;
  await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,preview:false,selection:new vscode.Range(line??0,0,line??0,0)});
  if(line===undefined)void vscode.window.showInformationMessage(t('기록 속 구간을 현재 파일에서 특정할 수 없습니다. 파일이 달라졌거나 같은 코드가 여러 곳에 있어 처음부터 열었습니다.','This recorded section cannot be located uniquely in the current file. It changed or occurs more than once, so the file is open at the beginning.'));
  return {matched:line!==undefined,line:line??0};
 }
 async function setupLive(){
  trusted();if(process.platform==='win32')throw Error(t('Windows에서는 기록 조회를 사용할 수 있습니다. 이 알림 기능은 macOS와 Linux에서 지원합니다.','History viewing is available on Windows. This notification relay supports macOS and Linux.'));
  const codexHome=process.env.CODEX_HOME||path.join(homedir(),'.codex'),configFile=path.join(codexHome,'hooks.json');
  const hook=await readFile(context.asAbsolutePath('dist/codex-hook.cjs'));
  const digest=createHash('sha256').update(hook).digest('hex');
  const directory=context.globalStorageUri.fsPath,script=path.join(directory,'codex-observer-hook-'+digest.slice(0,16)+'.cjs');
  let previous='{}\n';try{const info=await lstat(configFile);if(info.isSymbolicLink()||!info.isFile()||info.size>1024*1024)throw Error('Unsafe hooks file');previous=await readFile(configFile,'utf8');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const command='ELECTRON_RUN_AS_NODE=1 '+quote(process.execPath)+' '+quote(script)+' --version '+quote(context.extension.packageJSON.version);
  const next=JSON.stringify(mergeHooks(JSON.parse(previous),command),null,2)+'\n';
  await vscode.commands.executeCommand('vscode.diff',virtual('hooks-before.json',previous),virtual('hooks-after.json',next),t('Codex 실시간 알림 설정','Codex live notification settings'),{preview:true});
  const approve=t('알림 설정 추가','Add notification hooks');
  const choice=await vscode.window.showInformationMessage(t('Codex가 작업할 때 진행 알림만 TTC로 보냅니다. 대화나 코드를 저장하지 않습니다. 추가 후 터미널에서 Codex CLI를 실행하고 /hooks를 입력해 설정을 확인하세요. 미허용 상태일 때만 허용이 필요합니다.','Codex will send progress notifications to TTC without saving chats or code. After adding these hooks, start Codex CLI in a terminal and enter /hooks. Trust the definitions if they are not already trusted.'),approve);
  if(choice!==approve)return;
  const actual=await readFile(configFile,'utf8').catch((e)=>{if(e.code==='ENOENT')return '{}\n';throw e;});if(actual!==previous)throw Error(t('설정이 바뀌었습니다. 다시 열어 주세요.','Settings changed. Open setup again.'));
  await mkdir(directory,{recursive:true});
  try{await writeFile(script,hook,{mode:0o600,flag:'wx'});}catch(e:any){if(e.code!=='EEXIST'||createHash('sha256').update(await readFile(script)).digest('hex')!==digest)throw e;}
  await mkdir(codexHome,{recursive:true});
  const temporary=configFile+'.ttc-'+randomUUID();await writeFile(temporary,next,{mode:0o600,flag:'wx'});await rename(temporary,configFile);
  model.state.hooks='review';render();
  await vscode.window.showInformationMessage(t('알림 설정을 추가했습니다. 터미널의 Codex CLI에서 /hooks로 활성·허용 상태를 확인한 뒤 원래 채팅에서 계속하세요.','Notification hooks added. Check their active/trusted state with /hooks in Codex CLI, then continue your original chat.'));
 }
 const commands:Record<string,(value:any)=>unknown>={
  selectChat:(v)=>typeof v?.id==='string'?select(v.id):undefined,refreshChats:()=>model.refreshChats(),moreChats:()=>model.listMore(),olderActivity:()=>model.older(),olderEdits:()=>model.olderEdits(),
  openCodexThread:async()=>{const id=model.state.selected?.id;if(id)await vscode.env.openExternal(vscode.Uri.parse('codex://threads/'+encodeURIComponent(id)));},
  pickWorktree:async()=>{const picked=await vscode.window.showQuickPick(model.state.roots.filter(r=>!r.unavailable).map(r=>({label:r.branch||r.head.slice(0,8),description:r.path,root:r.path})),{title:t('이 채팅과 함께 볼 작업공간','Worktree to inspect with this chat')});if(picked)model.chooseRoot(picked.root);},
  openChange:v=>typeof v?.file==='string'?model.reviewFile(v.file):undefined,
  reviewRecorded:v=>typeof v?.id==='string'&&typeof v?.file==='string'?model.reviewRecorded(v.id,v.file):undefined,
  hunk:v=>model.hunk(v?.index),clearReview:()=>model.clearReview(),followEditor:async()=>{if(vscode.window.activeTextEditor?.document.uri.scheme!=='file')await source();model.followAgain();scheduleFollow(true);},openSourceControl:()=>vscode.commands.executeCommand('workbench.view.scm'),openReviewDiff:openDiff,practiceChange,comparePractice,openReviewSource:source,setupLive,
 };
 const saved=context.workspaceState?.get<string>('companion.selected');
 return {model,commands,restore(){if(saved&&vscode.workspace.isTrusted&&!vscode.env.remoteName&&!model.state.selected)model.select(saved);},fingerprint:()=>createHash('sha256').update(JSON.stringify(model.state)).digest('hex')};
}
