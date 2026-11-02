import * as vscode from 'vscode';
import * as path from 'node:path';
import {readFile,mkdtemp,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {parsePlan,resolveStep,inspectStep,validatePlanAgainstFiles,type Plan,type ResolvedStep} from './plan.js';
import {readWorkspaceFile,readBridgeFile,writeBridgeFile,assertDistinctWorkspaceFiles,WorkspaceFileError,MAX_SOURCE_BYTES} from './workspace-files.js';
import {createCompanion} from './companion-host.js';
import {learningDisplay} from './companion-view.js';
import {GuidePanel,type PanelState} from './panel.js';
import {readPlanFile} from './plan-file.js';
import {newJudgment,predict,beginReview,decide,invalidateJudgment,type Judgment,type Decision} from './judgment.js';
import {pickFiles,eligibleFile} from './file-picker.js';
import {TaskChecks,type CheckResult} from './task-checks.js';
import {text as t} from './locale.js';
import {WorktreeTracker,summarizeWorkspace,git as readGit,type WorkspaceOverview} from './worktrees.js';

type ReviewRecord={step:number;file:string;prediction:string;evidence:string;decision:Decision;sourceHash:string;recordedAt:string;check?:CheckResult};
type Session={root:string;sourceHead?:string;sourceRoot?:string;contextChanged?:boolean;plan:Plan;index:number;document:vscode.TextDocument;resolved:ResolvedStep;hash:string;complete:boolean;judgment:Judgment;records:ReviewRecord[];replan?:boolean;deciding?:boolean;ready:boolean;guidedStart?:boolean;revision:number;check?:CheckResult;checking?:boolean;demoTask?:vscode.Task;originalFiles:Map<string,string>;expectedFiles:Map<string,string>;documents:Map<string,vscode.TextDocument>};
const USAGE='https://chatgpt.com/settings/usage';
export function activate(context:vscode.ExtensionContext){
  let session:Session|undefined,busy=false,timer:NodeJS.Timeout|undefined,generationAbort:AbortController|undefined;
  let sourceFocus:{session:Session;promise:Promise<void>}|undefined;
  let sessionEpoch=0;
  let statusWrite:Promise<void>=Promise.resolve();
  const checks=new TaskChecks(context.workspaceState);
  const composer:{root?:string;files:string[];model?:string;modelName?:string;connected:boolean;connecting?:boolean;phase:string;error:string;errorAction?:string;notice:string}={files:[],connected:false,phase:'',error:'',notice:''};
  let chatRoot:string|undefined,startedAt:number|undefined;
  let lastSource=vscode.window.activeTextEditor?.document.uri;
  const companion=createCompanion(context,()=>render());
  const panel=new GuidePanel(message=>{void vscode.commands.executeCommand(`typeTheChange.${message.command}`,message);},visible=>{companion.model.track(visible&&vscode.workspace.isTrusted&&!vscode.env.remoteName);workspaceTracker.track(session?.root,visible);});
  let workspaceOverview:WorkspaceOverview|undefined;
  const workspaceTracker=new WorktreeTracker(value=>{
    const previous=workspaceOverview?.worktrees.find(tree=>tree.current),current=value?.worktrees.find(tree=>tree.current);
    workspaceOverview=value;
    if(session?.sourceHead&&current?.head&&session.sourceHead!==current.head&&session.sourceRoot===current.path)session.contextChanged=true;
    render();
  });
  const snapshots=new Map<string,string>();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('type-the-change-before',{provideTextDocumentContent:uri=>snapshots.get(uri.toString())||''}));
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
  const decoration=vscode.window.createTextEditorDecorationType({backgroundColor:new vscode.ThemeColor('editor.wordHighlightBackground'),border:'1px solid',borderColor:new vscode.ThemeColor('editor.wordHighlightBorder'),rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed});

  status.command='typeTheChange.start';status.text='$(edit) Type the Change';status.show();
  function local(){if(!vscode.workspace.isTrusted)throw Error(t('신뢰한 프로젝트에서 시작해 주세요.','Open a trusted project to start.'));if(vscode.env.remoteName)throw Error(t('로컬 VS Code 프로젝트에서 사용할 수 있어요.','Open a local VS Code project to start.'));}
  async function rootFolder(){
    local();if(chatRoot){ensureSelectedRoot(chatRoot);return chatRoot;}const uri=vscode.window.activeTextEditor?.document.uri||lastSource;
    const current=uri&&vscode.workspace.getWorkspaceFolder(uri);
    if(current)return current.uri.fsPath;
    const folders=vscode.workspace.workspaceFolders;if(!folders?.length)throw Error(t('먼저 작업할 프로젝트를 열어 주세요.','Open a project to start.'));
    if(folders.length===1)return folders[0].uri.fsPath;
    return (await vscode.window.showWorkspaceFolderPick())?.uri.fsPath;
  }
  function ensureSelectedRoot(root:string|undefined){
    if(root&&!vscode.workspace.workspaceFolders?.some(folder=>folder.uri.scheme==='file'&&path.resolve(folder.uri.fsPath)===path.resolve(root))){
      if(composer.root===root){composer.root=undefined;composer.files=[];}
      throw Error(t("선택한 작업 폴더가 닫혔어요. 파일을 다시 선택해 주세요.","The project was closed. Open it again to continue."));
    }
  }
  async function source(root:string,file:string){
    await readWorkspaceFile(root,file); // Validate filesystem boundaries before using a dirty editor buffer.
    const uri=vscode.Uri.file(path.join(root,file));
    const document=await vscode.workspace.openTextDocument(uri);
    const text=document.getText();if(Buffer.byteLength(text)>MAX_SOURCE_BYTES)throw Error(t("파일이 너무 커요. 64 KiB 이하 파일을 골라 주세요.","Learning suggestions support source files up to 64 KiB."));
    return {document,text};
  }
  function currentProject(){
    if(chatRoot){const pinned=vscode.workspace.workspaceFolders?.find(folder=>folder.uri.fsPath===chatRoot);if(pinned)return pinned;}
    const uri=vscode.window.activeTextEditor?.document.uri||lastSource;
    return (uri&&vscode.workspace.getWorkspaceFolder(uri))||vscode.workspace.workspaceFolders?.[0];
  }
  function clearDecorations(){for(const editor of vscode.window.visibleTextEditors)editor.setDecorations(decoration,[]);}
  function bindDocument(s:Session,document:vscode.TextDocument){
    if(document.isClosed)return false;
    let relevant=false;
    for(const [file,previous]of s.documents)if(previous.uri.toString()===document.uri.toString()){
      s.documents.set(file,document);if(file===s.plan.steps[s.index].file)s.document=document;relevant=true;
    }
    return relevant;
  }
  async function refreshSessionDocuments(s:Session){
    const documents=new Map<string,vscode.TextDocument>();
    for(const file of s.expectedFiles.keys()){
      const {document}=await source(s.root,file);if(session!==s)return false;documents.set(file,document);
    }
    s.documents=documents;s.document=documents.get(s.plan.steps[s.index].file)!;return true;
  }
  function inspectSession(s:Session){
    if(s.document.isClosed)return {status:'outside' as const,current:'',firstDifference:-1,progress:0};
    const inspection=inspectStep(s.document.getText(),s.resolved);
    for(const [file,expected]of s.expectedFiles)if(file!==s.plan.steps[s.index].file){const document=s.documents.get(file);if(!document||document.isClosed||document.getText()!==expected)return {...inspection,status:'outside' as const};}
    return inspection;
  }
  function saveStatus(state:string){
    if(!session)return;
    const current=session;
    const data={version:1,updatedAt:new Date().toISOString(),state,stepIndex:current.index,stepCount:current.plan.steps.length,planHash:current.hash,reviewPhase:current.judgment.phase,decision:current.judgment.decision??null};
    statusWrite=statusWrite.catch(()=>{}).then(()=>writeBridgeFile(current.root,'status.json',data)).catch(()=>{});
  }
  function sourceHash(s:Session){
    const hash=createHash('sha256');for(const [file,document]of s.documents)hash.update(JSON.stringify([file,document.getText()]));return hash.digest('hex');
  }
  function render(){
    const workspace=workspaceOverview?summarizeWorkspace(workspaceOverview,(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&document.uri.scheme==='file').map(document=>document.uri.fsPath)):undefined;
    const common:PanelState={workspace,companion:{...learningDisplay(companion.model.state,(vscode.workspace.workspaceFolders||[]).map(folder=>folder.uri.fsPath)),...(composer.error?{actionError:composer.error.slice(0,400)}:{})},project:currentProject()?.name,busy,phase:composer.phase,error:composer.error,errorAction:composer.errorAction,notice:composer.notice};
    if(!session){panel.update(common);return;}
    const s=session,step=s.plan.steps[s.index],inspection=inspectSession(s);
    // Disposal temporarily removes comparison evidence. Keep the recorded
    // review until reopening establishes whether code actually changed.
    const unavailable=[...s.documents.values()].some(document=>document.isClosed);
    if(!unavailable&&invalidateJudgment(s.judgment,sourceHash(s))){s.complete=false;void vscode.commands.executeCommand('setContext','typeTheChange.active',true);}
    const complete=s.complete&&!s.contextChanged&&!unavailable&&s.judgment.phase==='done';
    const inspectionMessages={untouched:'',editing:t('제안과 다른 코드 · 직접 판단해 주세요.','Your alternative · Check the evidence.'),matched:t('글자는 같아요 · 근거를 확인해 주세요.','Text matches · Check the evidence.'),outside:t('안내 범위 밖도 바뀌었어요. 유지하려면 새 수정안으로 확인하세요.','Other code changed · Request a new plan to keep it.')};
    if(s.check&&s.check.status!=='running'&&s.check.sourceHash!==sourceHash(s))s.check={...s.check,status:'stale'};
    // Keep the guide mode and frame while preparing the next source. A
    // file-less loading state would recreate the companion and guide iframes.
    panel.update({...common,busy:!s.ready||busy,handoff:!s.ready,phase:!s.ready?t('변경 여는 중','Opening change'):composer.phase,title:s.plan.title,file:step.file,line:s.document.positionAt(s.resolved.start).line+1,reason:step.reason,before:s.resolved.before,after:s.resolved.after,step:s.index+1,total:s.plan.steps.length,status:inspection.status,message:inspectionMessages[inspection.status],contextChanged:!!s.contextChanged,canContinue:s.ready&&!s.contextChanged&&!unavailable&&inspection.status!=='outside',complete,judgment:{...s.judgment},canKeep:s.ready&&!s.contextChanged&&!unavailable&&inspection.status!=='outside'&&inspection.status!=='untouched',replan:!!s.replan,check:s.check,checking:!!s.checking,guidedStart:s.guidedStart});
    if(!s.ready)return;
    status.text=complete?'$(check) '+t('판단 기록됨','Decision recorded'):`$(edit) ${s.index+1}/${s.plan.steps.length}`;
    status.tooltip='Type the Change';status.command='typeTheChange.start';
    clearDecorations();
    if(!s.complete&&inspection.status!=='outside')for(const editor of vscode.window.visibleTextEditors){
      if(editor.document.uri.toString()!==s.document.uri.toString())continue;
      const start=s.document.positionAt(s.resolved.start),end=s.document.positionAt(s.resolved.start+inspection.current.length);
      editor.setDecorations(decoration,[new vscode.Range(start,end)]);
      // Different text is a valid alternative, not a typing mistake to underline.
    }
    saveStatus(s.judgment.decision==='reject'?'rejected':s.judgment.decision==='defer'?'deferred':complete?'complete':inspection.status==='untouched'||inspection.status==='editing'?'typing':inspection.status);
  }
  async function focus(select=false){
    if(!session)return;
    const s=session;
    // Prediction already returns to code. A click/shortcut during that handoff
    // joins it instead of reselecting the range after typing has begun.
    if(sourceFocus?.session===s)return sourceFocus.promise;
    const promise=focusSource(s,select);sourceFocus={session:s,promise};
    try{await promise;}finally{if(sourceFocus?.promise===promise)sourceFocus=undefined;}
  }
  async function focusSource(s:Session,select:boolean){
    await panel.prepareSourceFocus();if(session!==s)return;
    if(s.document.isClosed){const {document}=await source(s.root,s.plan.steps[s.index].file);if(session!==s)return;bindDocument(s,document);}
    const editor=await vscode.window.showTextDocument(s.document,{viewColumn:vscode.ViewColumn.One,preserveFocus:true,preview:false});
    if(session!==s)return;
    const inspection=inspectSession(s);select=select||inspection.status==='untouched';
    if(inspection.status!=='outside'){
      const start=s.document.positionAt(s.resolved.start);
      const end=s.document.positionAt(s.resolved.start+(select?s.resolved.before.length:inspection.current.length));
      editor.selection=select?new vscode.Selection(start,end):new vscode.Selection(end,end);
      editor.revealRange(new vscode.Range(start,end),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    // Apply selection before transferring focus so the first key cannot land
    // before a late selection reset. Rendering and workbench focus are separate.
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
    if(session!==s)return;
    panel.releaseFocus();render();
  }
  async function startPlan(plan:Plan,root:string,requestEpoch?:number,guidedStart=false){
    local();const epoch=requestEpoch??++sessionEpoch;if(epoch!==sessionEpoch)return;
    await assertDistinctWorkspaceFiles(root,plan.steps.map(step=>step.file));if(epoch!==sessionEpoch)return;
    const files=new Map<string,string>(),documents=new Map<string,vscode.TextDocument>();
    for(const file of new Set(plan.steps.map(s=>s.file))){const result=await source(root,file);if(epoch!==sessionEpoch)return;files.set(file,result.text);documents.set(file,result.document);}
    validatePlanAgainstFiles(plan,files);
    if(epoch!==sessionEpoch)return;
    const first=plan.steps[0],{document,text}=await source(root,first.file);
    if(epoch!==sessionEpoch)return;
    for(const [file,snapshot]of files)if(documents.get(file)?.getText()!==snapshot)throw Error(t("수정안을 여는 동안 파일이 바뀌었어요. 다시 열어 주세요.","The source changed while opening the suggestion. Open it again."));
    checks.cancel();
    const canonicalRoot=await realpath(root);if(epoch!==sessionEpoch)return;
    const sourceTree=workspaceOverview?.worktrees.find(tree=>tree.current&&(canonicalRoot===tree.path||canonicalRoot.startsWith(tree.path+path.sep)));
    const sourceRoot=sourceTree?.path||await readGit(root,['rev-parse','--show-toplevel']).then(value=>value.trim()).catch(error=>{if(error?.code===128)return undefined;throw error;});
    const sourceHead=sourceRoot?await readGit(sourceRoot,['rev-parse','--verify','HEAD']).then(value=>value.trim()).catch(error=>{if(error?.code===128)return undefined;throw error;}):undefined;if(epoch!==sessionEpoch)return;
    const current:Session={root,sourceHead,sourceRoot,plan,index:0,document,resolved:resolveStep(text,first),hash:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),complete:false,judgment:newJudgment(),records:[],ready:false,guidedStart,revision:0,originalFiles:new Map(files),expectedFiles:files,documents};session=current;
    if(guidedStart)predict(current.judgment,plan.intent.slice(0,280));
    await vscode.commands.executeCommand('setContext','typeTheChange.active',true);
    if(session!==current||epoch!==sessionEpoch)return;
    composer.error='';composer.notice='';render();await focus(true);
    // Establish the native source group before moving a home panel out of it.
    if(session!==current||epoch!==sessionEpoch)return;panel.holdFocus();current.ready=true;render();
    if(guidedStart){await panel.showLearning(true);await focus(true);}else await panel.focusStep();
  }
  async function next(){
    if(!session)return;
    const s=session;if(!await refreshSessionDocuments(s))return;render();if(s.complete)return;
    await review();
  }
  async function makePrediction(value:unknown){if(session?.ready){predict(session.judgment,value);render();await focus();}}
  async function advance(){
    if(!session?.ready)return;
    if(session.judgment.phase==='predict'||session.judgment.phase==='review'||session.judgment.phase==='done'){await panel.focusStep();return;}
    await runCheck();
  }
  async function chooseCheck(){const s=session;if(!s||s.checking)return;await checks.select(s.root,true,s.demoTask);}
  async function runCheck(){
    const s=session;if(!s?.ready||s.checking)return;
    if(sourceFocus?.session===s)await sourceFocus.promise;
    if(session!==s||s.checking)return;
    if(!s.judgment.prediction){await panel.focusStep();return;}
    s.checking=true;render();
    try{
      const task=await checks.select(s.root,false,s.demoTask);if(session!==s||!task)return;
      if(task==='compare'){await review();return;}
      if(!await refreshSessionDocuments(s))return;
      // This action is explicitly labelled Save and Check. Save only the files
      // in this review, never unrelated dirty work in another editor.
      for(const document of s.documents.values()){
        if(document.isDirty&&!await document.save())throw Error(t("저장하지 못했어요. 파일을 저장한 뒤 다시 검사하세요.","Could not save the file. Save it and try the check again."));
        if(session!==s)return;
      }
      if([...s.documents.values()].some(document=>document.isDirty))throw Error(t("저장 중 코드가 바뀌었어요. 다시 검사하세요.","The code changed while saving. Run the check again."));
      const hash=sourceHash(s),revision=s.revision;
      const result=await checks.run(task,hash,()=>session!==s||s.revision!==revision||sourceHash(s)!==hash,result=>{if(session===s){s.check=result;render();}});
      if(session!==s)return;
      if(result.status==='passed'||result.status==='failed'){
        result.details=checkDetails(s);
      }
      s.check=result;render();
      if(['passed','failed','unknown'].includes(result.status))await review();
    }finally{if(session===s){s.checking=false;render();}}
  }
  function checkDetails(s:Session){
    return [...s.documents.values()].flatMap(document=>vscode.languages.getDiagnostics(document.uri).filter(diagnostic=>diagnostic.severity===vscode.DiagnosticSeverity.Error).map(diagnostic=>`${path.basename(document.uri.fsPath)}:${diagnostic.range.start.line+1} ${diagnostic.message.slice(0,350)}`)).slice(0,5);
  }
  async function makeDecision(value:{decision?:unknown;evidence?:unknown}){
    const s=session;if(!s||s.deciding)return;s.deciding=true;
    try{
      if(!await refreshSessionDocuments(s))return;
      const inspection=inspectSession(s),hash=sourceHash(s);
      if(value?.decision==='keep'&&s.sourceHead&&s.sourceRoot){
        const head=(await readGit(s.sourceRoot,['rev-parse','--verify','HEAD'])).trim();if(session!==s)return;
        if(head!==s.sourceHead)s.contextChanged=true;
        if(sourceHash(s)!==hash)throw Error(t('확인하는 동안 코드가 바뀌었습니다. 다시 비교하세요.','Code changed during verification. Compare it again.'));
      }
      if(value?.decision==='keep'&&s.contextChanged)throw Error(t('학습 기준 커밋이 바뀌었습니다. 현재 코드로 제안을 다시 확인하세요.','The learning baseline changed. Request a fresh suggestion for the current code.'));
      if(value?.decision==='keep'&&(inspection.status==='outside'||inspection.status==='untouched'))throw Error(inspection.status==='outside'?t("범위 밖 변경은 새 수정안으로 확인해 주세요.","Request a new suggestion to review changes outside this range."):t("유지할 변경이 없어요. 제안을 거절하거나 보류할 수 있어요.","There is no change to keep. You can reject or defer the suggestion."));
      const judgment={...s.judgment};decide(judgment,hash,value?.decision,value?.evidence);
      if(s.checking)throw Error(t("검사가 끝난 뒤 판단해 주세요.","Wait for the check to finish before deciding."));
      const record:ReviewRecord={step:s.index+1,file:s.plan.steps[s.index].file,prediction:judgment.prediction,evidence:judgment.evidence,decision:judgment.decision!,sourceHash:hash,recordedAt:new Date().toISOString(),...(s.check?{check:s.check}:{})};
      const records=[...s.records,record].slice(-100);
      await writeBridgeFile(s.root,'review.json',{version:1,planHash:s.hash,records});
      if(session!==s)return;
      s.records=records;s.judgment=judgment;
      if([...s.documents.values()].some(document=>document.isClosed)||sourceHash(s)!==hash){render();return;}
      if(record.decision!=='keep'){render();return;}
      s.expectedFiles.set(record.file,s.document.getText());
      if(s.index===s.plan.steps.length-1){s.complete=true;clearDecorations();render();await vscode.commands.executeCommand('setContext','typeTheChange.active',false);return;}
      const index=s.index+1,step=s.plan.steps[index];
      let resolved:ResolvedStep;
      try{
        const files=new Map([...s.documents].map(([file,document])=>[file,document.getText()]));
        validatePlanAgainstFiles({...s.plan,steps:s.plan.steps.slice(index)},files);
        resolved=resolveStep(s.documents.get(step.file)!.getText(),step);
      }catch{s.replan=true;render();return;}
      const nextSession:Session={...s,index,document:s.documents.get(step.file)!,resolved,judgment:newJudgment(),check:undefined,deciding:false,ready:false};
      session=nextSession;render();await focus(true);
      if(session!==nextSession)return;panel.holdFocus();nextSession.ready=true;render();await panel.focusStep();
    }finally{s.deciding=false;}
  }
  async function stop(){
    sessionEpoch++;generationAbort?.abort();generationAbort=undefined;busy=false;startedAt=undefined;composer.phase='';
    checks.cancel();if(session)saveStatus('idle');
    session=undefined;clearDecorations();composer.error='';composer.notice='';
    await vscode.commands.executeCommand('setContext','typeTheChange.active',false);
    status.text='$(edit) Type the Change';status.command='typeTheChange.start';
    panel.releaseFocus();render();panel.focusIntent();
  }
  async function newChat(){await stop();companion.model.clearReview();await panel.showConversation();}
  async function importPlan(){
    const epoch=++sessionEpoch,root=await rootFolder();if(!root||epoch!==sessionEpoch)return;
    const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'Typing plan':['json']},openLabel:t("수정안 열기","Open suggestion")});if(!files?.[0]||epoch!==sessionEpoch)return;
    if(files[0].scheme!=='file')throw Error(t("로컬 파일로 저장된 수정안을 선택하세요.","Choose a suggestion saved as a local file."));
    const data=await readPlanFile(files[0].fsPath);if(epoch!==sessionEpoch)return;
    let plan:Plan;
    try{plan=parsePlan(data);}catch{throw Error(t("수정안 형식이 올바르지 않아요. Type the Change용 JSON 파일인지 확인해 주세요.","This suggestion is invalid. Choose a Type the Change JSON file."));}
    await startPlan(plan,root,epoch);
  }
  async function loadPending(fromRoot?:string){const epoch=++sessionEpoch,root=fromRoot||await rootFolder();if(root&&epoch===sessionEpoch){const data=await readBridgeFile(root,'plan.json');if(epoch!==sessionEpoch)return;if(!data)throw Error(t("MCP에서 받은 수정안이 없어요.","No MCP suggestion has arrived yet."));await startPlan(parsePlan(JSON.stringify(data)),root,epoch);}}
  async function demo(){
    local();const epoch=++sessionEpoch,root=await mkdtemp(path.join(tmpdir(),'type-the-change-'));if(epoch!==sessionEpoch)return;
    const code=await readFile(context.asAbsolutePath('examples/quickstart/tasks.js'),'utf8'),originalPlan=parsePlan(await readFile(context.asAbsolutePath('examples/quickstart/plan.json'),'utf8'));
    const plan:Plan={...originalPlan,title:t(originalPlan.title,'Hide completed tasks'),intent:t(originalPlan.intent,'Only unfinished tasks remain in the list.'),steps:originalPlan.steps.map(step=>({...step,reason:t(step.reason,'filter keeps tasks whose done value is false. Check that an empty list and an all-completed list both stay empty.')}))};
    if(epoch!==sessionEpoch)return;await writeFile(path.join(root,'tasks.js'),code,{flag:'wx'});
    await writeFile(path.join(root,'check.mjs'),await readFile(context.asAbsolutePath('examples/quickstart/check.mjs'),'utf8'),{flag:'wx'});
    await startPlan(plan,root,epoch,true);
    if(session?.root===root){session.demoTask=new vscode.Task({type:'type-the-change-demo'},vscode.TaskScope.Workspace,t('할 일 목록 확인','Check task list'),'Type the Change',new vscode.ProcessExecution(process.execPath,[path.join(root,'check.mjs')],{cwd:root,env:{ELECTRON_RUN_AS_NODE:'1'}}),['$type-the-change']);render();}
  }
  async function mcpConfig(){
    const root=await rootFolder();if(!root)return;
    const server=context.asAbsolutePath('dist/mcp-server.cjs');
    const config={mcpServers:{'type-the-change':{command:'node',args:[server,'--workspace',root]}}};
    const toml=`[mcp_servers.type-the-change]\ncommand = "node"\nargs = ${JSON.stringify([server,'--workspace',root])}`;
    const text=`# Type the Change · MCP\n\nNode.js 22+가 필요합니다. Codex 등 MCP 클라이언트에 이 서버를 연결하세요. 모델 사용량은 해당 클라이언트의 로그인·구독을 따릅니다. 서버 자체는 AI 요청을 하지 않습니다.\n\n## Codex config.toml\n\n\`\`\`toml\n${toml}\n\`\`\`\n\n## JSON을 사용하는 클라이언트\n\n\`\`\`json\n${JSON.stringify(config,null,2)}\n\`\`\`\n\n선택한 작업 폴더 안에서 read_file, propose_typing_plan, get_typing_status를 제공합니다. 코드를 자동으로 수정하는 도구는 없습니다. 받은 계획은 Type the Change: Open MCP Plan으로 엽니다. .type-the-change/ 폴더는 Git에서 제외하세요.\n`;
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({language:'markdown',content:text}));
  }
  async function review(){
    if(!session)return;
    const s=session;
    if(sourceFocus?.session===s)await sourceFocus.promise;
    if(session!==s)return;
    if(!s.judgment.prediction)throw Error(t("먼저 바뀔 결과를 한 줄로 예상해 보세요.","Describe the expected result first."));
    if(!await refreshSessionDocuments(s))return;
    const file=!s.complete||s.originalFiles.size===1?s.plan.steps[s.index].file:await vscode.window.showQuickPick([...s.originalFiles.keys()],{title:t("변경 확인","Review change")});
    if(!file||session!==s)return;
    const hash=sourceHash(s),before=(s.complete?s.originalFiles:s.expectedFiles).get(file)||'';
    const original=vscode.Uri.from({scheme:'type-the-change-before',path:`/${file}`,query:createHash('sha256').update(s.root).update(before).digest('hex')});
    snapshots.set(original.toString(),before);
    panel.holdFocus();
    await vscode.commands.executeCommand('vscode.diff',original,vscode.Uri.file(path.join(s.root,file)),`${file} · ${t('변경 전 ↔ 현재','Before ↔ Now')}`,{preview:true,viewColumn:vscode.ViewColumn.One});
    if(session!==s)return;
    if(sourceHash(s)!==hash){render();throw Error(t("비교하는 동안 코드가 바뀌었어요. 다시 확인해 주세요.","The code changed during comparison. Review it again."));}
    if(!s.complete){beginReview(s.judgment,hash);s.replan=false;}
    render();await panel.focusStep();
  }
  async function guard(action:()=>unknown,retry?:string){
    try{composer.error='';composer.errorAction=undefined;await action();}
    catch(error){
      if(error instanceof Error&&error.name==='AbortError')return;
      const fileErrors:Record<string,string>={unsafe_path:t("작업 폴더 안의 소스 파일을 선택하세요.","Choose a source file inside the project."),missing_file:t("파일을 찾을 수 없어요.","File not found."),not_regular_file:t("일반 텍스트 파일을 선택하세요.","Choose a regular text file."),too_large:t("이 파일은 학습 화면에 표시할 수 있는 크기를 넘었습니다.","This file exceeds the learning view size limit."),invalid_text:t("UTF-8 텍스트 파일을 선택하세요.","Choose a UTF-8 text file."),duplicate_file:t("같은 파일이 여러 경로로 포함됐어요. 파일마다 하나의 경로를 사용해 주세요.","The same file has multiple paths. Use one path per file."),unavailable:t("파일을 읽을 수 없어요.","Could not read the file.")};
      composer.error=error instanceof WorkspaceFileError?fileErrors[error.code]:error instanceof Error?error.message:t('완료하지 못했어요. 다시 시도해 주세요.','Could not complete the request. Please try again.');
      composer.errorAction=retry;
      panel.releaseFocus();await panel.show(true);render();

    }
  }
  async function usage(){if(!await vscode.env.openExternal(vscode.Uri.parse(USAGE)))throw Error(t("사용량 페이지를 열지 못했어요.","Could not open the usage page."));}
  async function openHome(){local();companion.restore();render();await panel.show();companion.model.track(true);}
  async function chooseLanguage(){
    const selected=await vscode.window.showQuickPick([{label:t('VS Code 언어 사용','Use VS Code language'),value:'auto'},{label:'한국어',value:'ko'},{label:'English',value:'en'}],{title:t('언어','Language')});
    if(selected)await vscode.workspace.getConfiguration('typeTheChange').update('language',selected.value,vscode.ConfigurationTarget.Global);
  }
  const commands:Record<string,(arg?:any)=>unknown>={
    ...companion.commands, start:openHome,newChat,chooseLanguage,
    refreshWorkspace:()=>{workspaceTracker.track(session?.root||currentProject()?.uri.fsPath,true);workspaceTracker.refresh();},
    explainChanges:()=>companion.commands.openCodexThread({}),refreshLearning:()=>companion.commands.openCodexThread({}),
    viewChanges:async()=>{
      const tree=workspaceOverview?.worktrees.find(tree=>tree.current);if(!tree?.changes?.length)return;
      const change=await vscode.window.showQuickPick(tree.changes.map(change=>({label:change.path,description:change.status,path:change.path})),{title:t('현재 작업공간의 변경 비교','Compare changes in this worktree')});
      if(change&&workspaceOverview?.worktrees.some(current=>current.current&&current.path===tree.path))await vscode.commands.executeCommand(change.path.endsWith('/')?'revealInExplorer':'git.openChange',vscode.Uri.file(path.join(tree.path,change.path)));
    },
    openWorktree:async(arg)=>{const tree=workspaceOverview?.worktrees.find(tree=>tree.path===arg?.root&&!tree.current&&!tree.unavailable);if(tree)await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(tree.path),{forceNewWindow:true});},
    watchWalkthrough:()=>vscode.env.openExternal(vscode.Uri.parse('https://github.com/CodeNyangi/type-the-change/blob/004b5b6d1af681491976a1e69880f7d427f9576f/assets/type-the-change-quickstart.mp4')),
    moveView:()=>panel.move(),showConversation:()=>panel.showConversation(),showLearning:()=>panel.focusStep(),
    configureCodex:async()=>{const files=await vscode.window.showOpenDialog({canSelectMany:false,openLabel:t('Codex 실행 파일 선택','Choose Codex executable')});if(files?.[0]){await vscode.workspace.getConfiguration('typeTheChange').update('codexPath',files[0].fsPath,vscode.ConfigurationTarget.Global);companion.model.reconnect();await openHome();}},
    openFolder:()=>vscode.commands.executeCommand('workbench.action.files.openFolder'),
    import:importPlan,loadPending:()=>loadPending(),next,advance,runCheck,chooseCheck,cancelCheck:()=>checks.cancel(),problems:()=>vscode.commands.executeCommand('workbench.actions.view.problems'),focus:()=>focus(),stop,demo,mcpConfig,usage,review,
    tutorial:()=>{render();return panel.showHelp();},
    predict:arg=>makePrediction(arg?.prediction),decide:makeDecision,
  };
  for(const [name,action]of Object.entries(commands))context.subscriptions.push(vscode.commands.registerCommand(`typeTheChange.${name}`,(arg?:unknown)=>guard(()=>action(arg),name)));
  if(vscode.window.onDidChangeActiveTextEditor)context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor=>{
    if(!editor||editor.document.uri.scheme!=='file')return;
    lastSource=editor.document.uri;workspaceTracker.track(session?.root,panel.visible);
    if(!session&&!busy&&!chatRoot)render();
  }));
  if(vscode.window.registerWebviewViewProvider){
    panel.useSidebar();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('typeTheChange.launcher',{
      resolveWebviewView(view){render();panel.attachSidebar(view);companion.restore();},
    },{webviewOptions:{retainContextWhenHidden:true}}));
  }
  if(vscode.workspace.onDidChangeConfiguration)context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('typeTheChange.language')){panel.refreshLanguage();render();}if(event.affectsConfiguration('typeTheChange.codexPath')||event.affectsConfiguration('typeTheChange.codexSocket')){companion.model.reconnect();render();}}));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event=>{if(session&&bindDocument(session,event.document)){if(!event.contentChanges||event.contentChanges.length){session.revision++;if(session.check&&session.check.status!=='running')session.check={...session.check,status:'stale'};}clearTimeout(timer);timer=setTimeout(render,250);}}));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document=>{if(session&&bindDocument(session,document))render();}));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document=>{
    if(!session||![...session.documents.values()].some(current=>current.uri.toString()===document.uri.toString()))return;
    const current=session;render();
    // Closing a clean tab can dispose its document without changing any code.
    // Reload evidence without opening an editor so the guide can recover itself.
    void refreshSessionDocuments(current).then(fresh=>{if(fresh)render();}).catch(()=>{});
  }));
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(()=>render()));
  if(vscode.languages?.onDidChangeDiagnostics)context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(event=>{
    const s=session;if(!s?.check||!['passed','failed'].includes(s.check.status)||s.check.sourceHash!==sourceHash(s))return;
    if(event.uris.some(uri=>[...s.documents.values()].some(document=>document.uri.toString()===uri.toString()))){s.check={...s.check,details:checkDetails(s)};render();}
  }));
  const watcher=vscode.workspace.createFileSystemWatcher('**/.type-the-change/plan.json');
  const noticeTimers=new Map<string,NodeJS.Timeout>();
  const notice=(uri:vscode.Uri)=>{
    const root=path.dirname(path.dirname(uri.fsPath));
    if(uri.scheme!=='file'||!vscode.workspace.workspaceFolders?.some(f=>path.resolve(f.uri.fsPath)===path.resolve(root)))return;
    clearTimeout(noticeTimers.get(root));
    noticeTimers.set(root,setTimeout(()=>{
      noticeTimers.delete(root);
      void vscode.window.showInformationMessage(t("수정안 도착","Suggestion received"),t("열기","Open")).then(choice=>{if(choice)void guard(()=>loadPending(root));});
    },300));
  };
  watcher.onDidCreate(notice);watcher.onDidChange(notice);
  context.subscriptions.push(watcher,panel,status,decoration,checks,workspaceTracker,{dispose(){generationAbort?.abort();clearTimeout(timer);for(const timer of noticeTimers.values())clearTimeout(timer);}});
  return {companion:companion.model,getWorkspace:()=>workspaceOverview,startPlan,next,stop,predict:makePrediction,decide:makeDecision,getState:()=>session?{contextChanged:!!session.contextChanged,file:session.plan.steps[session.index].file,index:session.index,complete:session.complete&&!session.contextChanged&&![...session.documents.values()].some(document=>document.isClosed)&&session.judgment.reviewedHash===sourceHash(session),status:inspectSession(session).status,judgment:{...session.judgment},replan:!!session.replan,check:session.check?{...session.check}:undefined,checking:!!session.checking}:null};
}
export function deactivate(){}
