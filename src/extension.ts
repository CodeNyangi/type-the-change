import * as vscode from 'vscode';
import * as path from 'node:path';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {parsePlan,resolveStep,inspectStep,validatePlanAgainstFiles,validateRelativePath,type Plan,type ResolvedStep} from './plan.js';
import {readWorkspaceFile,readBridgeFile,writeBridgeFile,assertDistinctWorkspaceFiles,WorkspaceFileError,MAX_SOURCE_BYTES} from './workspace-files.js';
import {AuthError,ChatGPTAuth} from './auth.js';
import {createAccountLock} from './account-lock.js';
import {listModels,generatePlan,InferenceError} from './inference.js';
import {GuidePanel,type PanelState} from './panel.js';
import {readPlanFile} from './plan-file.js';
import {newJudgment,predict,beginReview,decide,invalidateJudgment,type Judgment,type Decision} from './judgment.js';
import {pickFiles} from './file-picker.js';
import {TaskChecks,type CheckResult} from './task-checks.js';

type ReviewRecord={step:number;file:string;prediction:string;evidence:string;decision:Decision;sourceHash:string;recordedAt:string;check?:CheckResult};
type Session={root:string;plan:Plan;index:number;document:vscode.TextDocument;resolved:ResolvedStep;hash:string;complete:boolean;judgment:Judgment;records:ReviewRecord[];replan?:boolean;deciding?:boolean;ready:boolean;revision:number;check?:CheckResult;checking?:boolean;demoTask?:vscode.Task;originalFiles:Map<string,string>;expectedFiles:Map<string,string>;documents:Map<string,vscode.TextDocument>};
const USAGE='https://chatgpt.com/settings/usage';
export function activate(context:vscode.ExtensionContext){
  let session:Session|undefined,busy=false,timer:NodeJS.Timeout|undefined,generationAbort:AbortController|undefined;
  let sessionEpoch=0;
  let statusWrite:Promise<void>=Promise.resolve();
  const checks=new TaskChecks(context.workspaceState);
  const composer:{root?:string;files:string[];model?:string;modelName?:string;connected:boolean;phase:string;error:string;notice:string}={files:[],connected:false,phase:'',error:'',notice:''};
  const panel=new GuidePanel(message=>{void vscode.commands.executeCommand(`typeTheChange.${message.command}`,message.command==='generate'?message.intent:message);});
  const snapshots=new Map<string,string>();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('type-the-change-before',{provideTextDocumentContent:uri=>snapshots.get(uri.toString())||''}));
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
  const decoration=vscode.window.createTextEditorDecorationType({backgroundColor:new vscode.ThemeColor('editor.wordHighlightBackground'),border:'1px solid',borderColor:new vscode.ThemeColor('editor.wordHighlightBorder'),rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed});
  const auth=new ChatGPTAuth({secrets:context.secrets,appName:'Type the Change',lockAccount:createAccountLock(context.globalStorageUri.fsPath),openExternal:async url=>vscode.env.openExternal(vscode.Uri.parse(url))});
  status.command='typeTheChange.start';status.text='$(edit) Type the Change';status.show();
  function local(){if(!vscode.workspace.isTrusted)throw Error('신뢰한 폴더에서 시작해 주세요.');if(vscode.env.remoteName)throw Error('첫 버전은 로컬 VS Code 폴더에서 사용할 수 있어요.');}
  async function rootFolder(){
    local();const current=vscode.window.activeTextEditor&&vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
    if(current)return current.uri.fsPath;
    const folders=vscode.workspace.workspaceFolders;if(!folders?.length)throw Error('먼저 작업할 폴더를 열어 주세요. 데모는 폴더 없이도 시작할 수 있어요.');
    if(folders.length===1)return folders[0].uri.fsPath;
    return (await vscode.window.showWorkspaceFolderPick())?.uri.fsPath;
  }
  function ensureSelectedRoot(root:string|undefined){
    if(root&&!vscode.workspace.workspaceFolders?.some(folder=>folder.uri.scheme==='file'&&path.resolve(folder.uri.fsPath)===path.resolve(root))){
      if(composer.root===root){composer.root=undefined;composer.files=[];}
      throw Error('선택한 작업 폴더가 닫혔어요. 파일을 다시 선택해 주세요.');
    }
  }
  async function source(root:string,file:string){
    await readWorkspaceFile(root,file); // Validate filesystem boundaries before using a dirty editor buffer.
    const uri=vscode.Uri.file(path.join(root,file));
    const document=await vscode.workspace.openTextDocument(uri);
    const text=document.getText();if(Buffer.byteLength(text)>MAX_SOURCE_BYTES)throw Error('파일이 너무 커요. 64 KiB 이하 파일을 골라 주세요.');
    return {document,text};
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
    const common:PanelState={files:composer.files,model:composer.modelName,connected:composer.connected,busy,phase:composer.phase,error:composer.error,notice:composer.notice};
    if(!session){panel.update(common);return;}
    if(!session.ready){panel.update({...common,busy:true,phase:'변경 여는 중'});return;}
    const s=session,step=s.plan.steps[s.index],inspection=inspectSession(s);
    // Disposal temporarily removes comparison evidence. Keep the recorded
    // review until reopening establishes whether code actually changed.
    const unavailable=[...s.documents.values()].some(document=>document.isClosed);
    if(!unavailable&&invalidateJudgment(s.judgment,sourceHash(s))){s.complete=false;void vscode.commands.executeCommand('setContext','typeTheChange.active',true);}
    const complete=s.complete&&!unavailable&&s.judgment.phase==='done';
    const messages={untouched:'',editing:'제안과 다른 코드 · 직접 판단해 주세요.',matched:'글자는 같아요 · 근거를 확인해 주세요.',outside:'안내 범위 밖도 바뀌었어요. 유지하려면 새 수정안으로 확인하세요.'};
    if(s.check&&s.check.status!=='running'&&s.check.sourceHash!==sourceHash(s))s.check={...s.check,status:'stale'};
    panel.update({...common,title:s.plan.title,file:step.file,line:s.document.positionAt(s.resolved.start).line+1,reason:step.reason,before:s.resolved.before,after:s.resolved.after,step:s.index+1,total:s.plan.steps.length,status:inspection.status,message:messages[inspection.status],canContinue:!unavailable&&inspection.status!=='outside',complete,judgment:{...s.judgment},canKeep:!unavailable&&inspection.status!=='outside'&&inspection.status!=='untouched',replan:!!s.replan,check:s.check,checking:!!s.checking});
    status.text=complete?'$(check) 판단 기록됨':`$(edit) ${s.index+1}/${s.plan.steps.length}`;
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
    if(s.document.isClosed){const {document}=await source(s.root,s.plan.steps[s.index].file);if(session!==s)return;bindDocument(s,document);}
    const editor=await vscode.window.showTextDocument(s.document,{viewColumn:vscode.ViewColumn.One,preserveFocus:false,preview:false});
    if(session!==s)return;
    const inspection=inspectSession(s);select=select||inspection.status==='untouched';
    if(inspection.status!=='outside'){
      const start=s.document.positionAt(s.resolved.start);
      const end=s.document.positionAt(s.resolved.start+(select?s.resolved.before.length:inspection.current.length));
      editor.selection=select?new vscode.Selection(start,end):new vscode.Selection(end,end);
      editor.revealRange(new vscode.Range(start,end),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    render();
  }
  async function startPlan(plan:Plan,root:string,requestEpoch?:number){
    local();const epoch=requestEpoch??++sessionEpoch;if(epoch!==sessionEpoch)return;
    await assertDistinctWorkspaceFiles(root,plan.steps.map(step=>step.file));if(epoch!==sessionEpoch)return;
    const files=new Map<string,string>(),documents=new Map<string,vscode.TextDocument>();
    for(const file of new Set(plan.steps.map(s=>s.file))){const result=await source(root,file);if(epoch!==sessionEpoch)return;files.set(file,result.text);documents.set(file,result.document);}
    validatePlanAgainstFiles(plan,files);
    if(epoch!==sessionEpoch)return;
    const first=plan.steps[0],{document,text}=await source(root,first.file);
    if(epoch!==sessionEpoch)return;
    for(const [file,snapshot]of files)if(documents.get(file)?.getText()!==snapshot)throw Error('수정안을 여는 동안 파일이 바뀌었어요. 다시 열어 주세요.');
    checks.cancel();
    const current:Session={root,plan,index:0,document,resolved:resolveStep(text,first),hash:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),complete:false,judgment:newJudgment(),records:[],ready:false,revision:0,originalFiles:new Map(files),expectedFiles:files,documents};session=current;
    await vscode.commands.executeCommand('setContext','typeTheChange.active',true);
    if(session!==current||epoch!==sessionEpoch)return;
    composer.error='';composer.notice='';render();await focus(true);
    // Establish the native source group before moving a home panel out of it.
    if(session!==current||epoch!==sessionEpoch)return;current.ready=true;render();panel.focusStep();
  }
  async function next(){
    if(!session)return;
    const s=session;if(!await refreshSessionDocuments(s))return;render();if(s.complete)return;
    await review();
  }
  async function makePrediction(value:unknown){if(session?.ready){predict(session.judgment,value);render();await focus();}}
  async function advance(){
    if(!session?.ready)return;
    if(session.judgment.phase==='predict'||session.judgment.phase==='review'||session.judgment.phase==='done'){panel.focusStep();return;}
    await runCheck();
  }
  async function chooseCheck(){const s=session;if(!s||s.checking)return;await checks.select(s.root,true,s.demoTask);}
  async function runCheck(){
    const s=session;if(!s||s.checking)return;
    if(!s.judgment.prediction){panel.focusStep();return;}
    s.checking=true;render();
    try{
      const task=await checks.select(s.root,false,s.demoTask);if(session!==s||!task)return;
      if(task==='compare'){await review();if(session===s)panel.focusStep();return;}
      if(!await refreshSessionDocuments(s))return;
      // This action is explicitly labelled Save and Check. Save only the files
      // in this review, never unrelated dirty work in another editor.
      for(const document of s.documents.values()){
        if(document.isDirty&&!await document.save())throw Error('저장하지 못했어요. 파일을 저장한 뒤 다시 검사하세요.');
        if(session!==s)return;
      }
      if([...s.documents.values()].some(document=>document.isDirty))throw Error('저장 중 코드가 바뀌었어요. 다시 검사하세요.');
      const hash=sourceHash(s),revision=s.revision;
      const result=await checks.run(task,hash,()=>session!==s||s.revision!==revision||sourceHash(s)!==hash,result=>{if(session===s){s.check=result;render();}});
      if(session!==s)return;
      if(result.status==='passed'||result.status==='failed'){
        result.details=[...s.documents.values()].flatMap(document=>vscode.languages.getDiagnostics(document.uri).filter(diagnostic=>diagnostic.severity===vscode.DiagnosticSeverity.Error).map(diagnostic=>`${path.basename(document.uri.fsPath)}:${diagnostic.range.start.line+1} ${diagnostic.message.slice(0,350)}`)).slice(0,5);
      }
      s.check=result;render();
      if(['passed','failed','unknown'].includes(result.status)){await review();if(session===s)panel.focusStep();}
    }finally{if(session===s){s.checking=false;render();}}
  }
  async function makeDecision(value:{decision?:unknown;evidence?:unknown}){
    const s=session;if(!s||s.deciding)return;s.deciding=true;
    try{
      if(!await refreshSessionDocuments(s))return;
      const inspection=inspectSession(s),hash=sourceHash(s);
      if(value?.decision==='keep'&&(inspection.status==='outside'||inspection.status==='untouched'))throw Error(inspection.status==='outside'?'범위 밖 변경은 새 수정안으로 확인해 주세요.':'유지할 변경이 없어요. 제안을 거절하거나 보류할 수 있어요.');
      const judgment={...s.judgment};decide(judgment,hash,value?.decision,value?.evidence);
      if(s.checking)throw Error('검사가 끝난 뒤 판단해 주세요.');
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
      session={...s,index,document:s.documents.get(step.file)!,resolved,judgment:newJudgment(),check:undefined,deciding:false};render();await focus(true);panel.focusStep();
    }finally{s.deciding=false;}
  }
  async function stop(){
    sessionEpoch++;generationAbort?.abort();checks.cancel();if(session)saveStatus('idle');
    session=undefined;clearDecorations();composer.error='';composer.notice='';
    await vscode.commands.executeCommand('setContext','typeTheChange.active',false);
    status.text='$(edit) Type the Change';status.command='typeTheChange.start';
    render();panel.focusIntent();
  }
  async function signIn(parent?:AbortSignal){
    local();
    const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'ChatGPT 연결',cancellable:true},async(_,cancel)=>{
      const controller=new AbortController();
      const disposable=cancel.onCancellationRequested(()=>controller.abort());
      const signal=parent?AbortSignal.any([parent,controller.signal]):controller.signal;
      try{return await auth.signIn(signal);}finally{disposable.dispose();}
    });
    composer.connected=result.planAccess;render();
    if(!result.planAccess)throw Error('ChatGPT 구독 사용 권한을 허용해 주세요.');
    if(!context.globalState.get('welcomedPlanUsage')){
      composer.notice='연결됐어요. AI 요청에는 ChatGPT 구독 사용량이 쓰입니다.';
      await context.globalState.update('welcomedPlanUsage',true);
    }
    render();
  }
  async function chooseFiles(){
    const epoch=sessionEpoch,root=await rootFolder();if(!root||epoch!==sessionEpoch)return;
    ensureSelectedRoot(root);
    const folder=vscode.workspace.workspaceFolders?.find(item=>path.resolve(item.uri.fsPath)===path.resolve(root));
    const selected=await pickFiles(root,composer.root===root?composer.files:[],folder?.name||path.basename(root));
    if(!selected||epoch!==sessionEpoch)return;
    if(selected.length>8)throw Error('한 번에 파일 8개까지 선택하세요.');
    ensureSelectedRoot(root);
    const files:string[]=[];
    for(const file of selected){
      await source(root,file);if(epoch!==sessionEpoch)return;files.push(file);
    }
    ensureSelectedRoot(root);
    composer.root=root;composer.files=[...new Set(files)];composer.error='';render();
  }
  async function connect(){
    if(busy)return;
    busy=true;const controller=new AbortController();generationAbort=controller;
    composer.error='';composer.phase='브라우저에서 ChatGPT를 연결하세요';render();
    try{await signIn(controller.signal);}
    finally{busy=false;generationAbort=undefined;composer.phase='';render();}
  }
  async function chooseModel(){
    if(busy)return;
    busy=true;const controller=new AbortController();generationAbort=controller;
    composer.error='';composer.phase='모델 확인 중';render();
    try{
      const authState=await auth.status();controller.signal.throwIfAborted();
      if(!authState.planAccess)await signIn(controller.signal);
      const models=await listModels(await auth.getAccessToken(controller.signal),controller.signal);
      controller.signal.throwIfAborted();
      if(!models.length)throw Error('이 계정에서 사용할 수 있는 모델이 없어요.');
      const cancellation=new vscode.CancellationTokenSource();
      const cancel=()=>cancellation.cancel();controller.signal.addEventListener('abort',cancel,{once:true});
      let chosen;
      try{chosen=await vscode.window.showQuickPick(models.map(m=>({label:m.displayName,description:m.slug,model:m})),{title:'ChatGPT 모델'},cancellation.token);}
      finally{controller.signal.removeEventListener('abort',cancel);cancellation.dispose();}
      controller.signal.throwIfAborted();
      if(chosen){composer.model=chosen.model.slug;composer.modelName=chosen.model.displayName;await context.globalState.update('model',chosen.model);}
    }finally{busy=false;generationAbort=undefined;composer.phase='';render();}
  }
  async function generate(intent?:string){
    if(busy)return;
    if(typeof intent!=='string'||!intent.trim()){if(session)await stop();panel.show();render();panel.focusIntent();return;}
    if(intent.length>4000)throw Error('요청은 4,000자 안으로 적어 주세요.');
    busy=true;const epoch=sessionEpoch,controller=new AbortController();generationAbort=controller;
    composer.error='';composer.notice='';composer.phase='파일 확인 중';render();
    try{
      local();
      ensureSelectedRoot(composer.root);
      if(!composer.root||!composer.files.length)await chooseFiles();
      controller.signal.throwIfAborted();
      const root=composer.root;if(!root||!composer.files.length)return;
      const files=new Map<string,string>();
      for(const file of composer.files){ensureSelectedRoot(root);files.set(file,(await source(root,file)).text);}
      if([...files.values()].reduce((n,t)=>n+t.length,0)>80_000)throw Error('코드가 너무 많아요. 선택한 파일을 줄여 주세요.');
      controller.signal.throwIfAborted();
      const authStatus=await auth.status();controller.signal.throwIfAborted();composer.connected=authStatus.planAccess;
      if(!authStatus.planAccess){composer.phase='브라우저에서 ChatGPT를 연결하세요';render();await signIn(controller.signal);}
      controller.signal.throwIfAborted();
      composer.phase='모델 확인 중';render();
      const token=await auth.getAccessToken(controller.signal);
      const models=await listModels(token,controller.signal);controller.signal.throwIfAborted();
      const saved=context.globalState.get<{slug:string;displayName:string}>('model');
      const model=models.find(m=>m.slug===(composer.model||saved?.slug))||models[0];
      if(!model)throw Error('이 계정에서 사용할 수 있는 모델이 없어요.');
      composer.model=model.slug;composer.modelName=model.displayName;
      await context.globalState.update('model',model);
      composer.phase='수정안을 만드는 중';render();
      const schema=JSON.parse(await readFile(context.asAbsolutePath('plan.schema.json'),'utf8'));delete schema.$schema;
      ensureSelectedRoot(root);
      const plan=await generatePlan(token,model.slug,intent.trim(),files,schema,controller.signal);
      controller.signal.throwIfAborted();
      if(plan.steps.some(s=>!files.has(s.file)))throw Error('선택하지 않은 파일이 포함됐어요. 다시 요청해 주세요.');
      for(const [file,snapshot]of files){ensureSelectedRoot(root);if((await source(root,file)).text!==snapshot)throw Error('파일이 바뀌었어요. 현재 코드로 다시 요청해 주세요.');}
      controller.signal.throwIfAborted();if(epoch!==sessionEpoch)throw new DOMException('Cancelled','AbortError');await startPlan(plan,root);
    }finally{busy=false;generationAbort=undefined;composer.phase='';render();}
  }
  async function importPlan(){
    const epoch=++sessionEpoch,root=await rootFolder();if(!root||epoch!==sessionEpoch)return;
    const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'Typing plan':['json']},openLabel:'수정안 열기'});if(!files?.[0]||epoch!==sessionEpoch)return;
    if(files[0].scheme!=='file')throw Error('로컬 파일로 저장된 수정안을 선택하세요.');
    const data=await readPlanFile(files[0].fsPath);if(epoch!==sessionEpoch)return;
    let plan:Plan;
    try{plan=parsePlan(data);}catch{throw Error('수정안 형식이 올바르지 않아요. Type the Change용 JSON 파일인지 확인해 주세요.');}
    await startPlan(plan,root,epoch);
  }
  async function loadPending(fromRoot?:string){const epoch=++sessionEpoch,root=fromRoot||await rootFolder();if(root&&epoch===sessionEpoch){const data=await readBridgeFile(root,'plan.json');if(epoch!==sessionEpoch)return;if(!data)throw Error('MCP에서 받은 수정안이 없어요.');await startPlan(parsePlan(JSON.stringify(data)),root,epoch);}}
  async function demo(){
    local();const epoch=++sessionEpoch,root=await mkdtemp(path.join(tmpdir(),'type-the-change-'));if(epoch!==sessionEpoch)return;
    const code=await readFile(context.asAbsolutePath('examples/price.ts'),'utf8'),plan=parsePlan(await readFile(context.asAbsolutePath('examples/plan.json'),'utf8'));
    if(epoch!==sessionEpoch)return;await writeFile(path.join(root,'price.ts'),code,{flag:'wx'});
    await writeFile(path.join(root,'check.mjs'),await readFile(context.asAbsolutePath('examples/check.mjs'),'utf8'),{flag:'wx'});
    await startPlan(plan,root,epoch);
    if(session?.root===root){session.demoTask=new vscode.Task({type:'type-the-change-demo'},vscode.TaskScope.Workspace,'음수 합계 검사','Type the Change',new vscode.ProcessExecution(process.execPath,[path.join(root,'check.mjs')],{cwd:root,env:{ELECTRON_RUN_AS_NODE:'1'}}),['$type-the-change']);render();}
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
    if(!s.judgment.prediction)throw Error('먼저 바뀔 결과를 한 줄로 예상해 보세요.');
    if(!await refreshSessionDocuments(s))return;
    const file=!s.complete||s.originalFiles.size===1?s.plan.steps[s.index].file:await vscode.window.showQuickPick([...s.originalFiles.keys()],{title:'변경 확인'});
    if(!file||session!==s)return;
    const hash=sourceHash(s),before=(s.complete?s.originalFiles:s.expectedFiles).get(file)||'';
    const original=vscode.Uri.from({scheme:'type-the-change-before',path:`/${file}`,query:createHash('sha256').update(s.root).update(before).digest('hex')});
    snapshots.set(original.toString(),before);
    await vscode.commands.executeCommand('vscode.diff',original,vscode.Uri.file(path.join(s.root,file)),`${file} · 변경 전 ↔ 현재`,{preview:true,viewColumn:vscode.ViewColumn.One});
    if(session!==s)return;
    if(sourceHash(s)!==hash){render();throw Error('비교하는 동안 코드가 바뀌었어요. 다시 확인해 주세요.');}
    if(!s.complete){beginReview(s.judgment,hash);s.replan=false;}
    render();panel.show(true);
  }
  async function guard(action:()=>unknown){
    try{composer.error='';await action();}
    catch(error){
      if(error instanceof Error&&error.name==='AbortError')return;
      // Refresh may have removed a revoked session after the composer read it.
      // Reconcile before rendering recovery controls, without losing the
      // original failure if SecretStorage itself is temporarily unavailable.
      try{composer.connected=(await auth.status()).planAccess;}catch{}
      const fileErrors:Record<string,string>={unsafe_path:'작업 폴더 안의 소스 파일을 선택하세요.',missing_file:'파일을 찾을 수 없어요.',not_regular_file:'일반 텍스트 파일을 선택하세요.',too_large:'파일은 64 KiB 이하로 선택하세요.',invalid_text:'UTF-8 텍스트 파일을 선택하세요.',duplicate_file:'같은 파일이 여러 경로로 포함됐어요. 파일마다 하나의 경로를 사용해 주세요.',unavailable:'파일을 읽을 수 없어요.'};
      composer.error=error instanceof AuthError&&error.requiresSignIn?'ChatGPT 연결이 만료됐어요. 다시 연결해 주세요.':error instanceof WorkspaceFileError?fileErrors[error.code]:error instanceof Error?error.message:'완료하지 못했어요. 다시 시도해 주세요.';
      panel.show(true);render();
      if(error instanceof InferenceError&&error.usageLimited){if(await vscode.window.showErrorMessage(composer.error,'사용량'))await guard(usage);}
    }
  }
  async function usage(){if(!await vscode.env.openExternal(vscode.Uri.parse(USAGE)))throw Error('사용량 페이지를 열지 못했어요.');}
  async function openHome(){
    panel.show();render();if(!session)panel.focusIntent();
    composer.connected=(await auth.status()).planAccess;
    const model=context.globalState.get<{slug:string;displayName:string}>('model');
    if(model&&!composer.model){composer.model=model.slug;composer.modelName=model.displayName;}
    render();
  }
  const commands:Record<string,(arg?:any)=>unknown>={
    start:openHome,generate,chooseFiles:()=>{if(!busy)return chooseFiles();},chooseModel,signIn:connect,
    signOut:async()=>{sessionEpoch++;generationAbort?.abort();try{await auth.signOut();}finally{composer.connected=false;render();}},
    import:importPlan,loadPending:()=>loadPending(),next,advance,runCheck,chooseCheck,cancelCheck:()=>checks.cancel(),problems:()=>vscode.commands.executeCommand('workbench.actions.view.problems'),focus:()=>focus(),stop,demo,mcpConfig,usage,review,
    predict:arg=>makePrediction(arg?.prediction),decide:makeDecision,
  };
  for(const [name,action]of Object.entries(commands))context.subscriptions.push(vscode.commands.registerCommand(`typeTheChange.${name}`,(arg?:unknown)=>guard(()=>action(arg))));
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
  const watcher=vscode.workspace.createFileSystemWatcher('**/.type-the-change/plan.json');
  const noticeTimers=new Map<string,NodeJS.Timeout>();
  const notice=(uri:vscode.Uri)=>{
    const root=path.dirname(path.dirname(uri.fsPath));
    if(uri.scheme!=='file'||!vscode.workspace.workspaceFolders?.some(f=>path.resolve(f.uri.fsPath)===path.resolve(root)))return;
    clearTimeout(noticeTimers.get(root));
    noticeTimers.set(root,setTimeout(()=>{
      noticeTimers.delete(root);
      void vscode.window.showInformationMessage('수정안 도착','열기').then(choice=>{if(choice)void guard(()=>loadPending(root));});
    },300));
  };
  watcher.onDidCreate(notice);watcher.onDidChange(notice);
  context.subscriptions.push(watcher,panel,status,decoration,checks,{dispose(){generationAbort?.abort();clearTimeout(timer);for(const timer of noticeTimers.values())clearTimeout(timer);}});
  return {startPlan,next,stop,predict:makePrediction,decide:makeDecision,getState:()=>session?{file:session.plan.steps[session.index].file,index:session.index,complete:session.complete&&![...session.documents.values()].some(document=>document.isClosed)&&session.judgment.reviewedHash===sourceHash(session),status:inspectSession(session).status,judgment:{...session.judgment},replan:!!session.replan,check:session.check?{...session.check}:undefined,checking:!!session.checking}:null};
}
export function deactivate(){}
