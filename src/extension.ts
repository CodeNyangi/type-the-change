import * as vscode from 'vscode';
import * as path from 'node:path';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {parsePlan,resolveStep,inspectStep,validatePlanAgainstFiles,type Plan,type ResolvedStep} from './plan.js';
import {readWorkspaceFile,readBridgeFile,writeBridgeFile,WorkspaceFileError} from './workspace-files.js';
import {ChatGPTAuth} from './auth.js';
import {listModels,generatePlan,InferenceError} from './inference.js';
import {GuidePanel,type PanelState} from './panel.js';

type Session={root:string;plan:Plan;index:number;document:vscode.TextDocument;resolved:ResolvedStep;hash:string;complete:boolean;originalFiles:Map<string,string>;expectedFiles:Map<string,string>;documents:Map<string,vscode.TextDocument>};
const USAGE='https://chatgpt.com/settings/usage';
export function activate(context:vscode.ExtensionContext){
  let session:Session|undefined,busy=false,timer:NodeJS.Timeout|undefined,generationAbort:AbortController|undefined;
  let sessionEpoch=0;
  let statusWrite:Promise<void>=Promise.resolve();
  const composer:{root?:string;files:string[];model?:string;modelName?:string;connected:boolean;phase:string;error:string;notice:string}={files:[],connected:false,phase:'',error:'',notice:''};
  const panel=new GuidePanel(message=>{void vscode.commands.executeCommand(`typeTheChange.${message.command}`,message.intent);});
  const snapshots=new Map<string,string>();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('type-the-change-before',{provideTextDocumentContent:uri=>snapshots.get(uri.toString())||''}));
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
  const decoration=vscode.window.createTextEditorDecorationType({backgroundColor:new vscode.ThemeColor('editor.wordHighlightBackground'),border:'1px solid',borderColor:new vscode.ThemeColor('editor.wordHighlightBorder'),rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed});
  const difference=vscode.window.createTextEditorDecorationType({borderWidth:'0 0 2px 0',borderStyle:'solid',borderColor:new vscode.ThemeColor('editorWarning.foreground'),rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed});
  const auth=new ChatGPTAuth({secrets:context.secrets,appName:'Type the Change',openExternal:async url=>vscode.env.openExternal(vscode.Uri.parse(url))});
  status.command='typeTheChange.start';status.text='$(edit) Type the Change';status.show();
  function local(){if(!vscode.workspace.isTrusted)throw Error('신뢰한 폴더에서 시작해 주세요.');if(vscode.env.remoteName)throw Error('첫 버전은 로컬 VS Code 폴더에서 사용할 수 있어요.');}
  async function rootFolder(){
    local();const current=vscode.window.activeTextEditor&&vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
    if(current)return current.uri.fsPath;
    const folders=vscode.workspace.workspaceFolders;if(!folders?.length)throw Error('먼저 작업할 폴더를 열어 주세요. 데모는 폴더 없이도 시작할 수 있어요.');
    if(folders.length===1)return folders[0].uri.fsPath;
    return (await vscode.window.showWorkspaceFolderPick())?.uri.fsPath;
  }
  async function source(root:string,file:string){
    await readWorkspaceFile(root,file); // Validate filesystem boundaries before using a dirty editor buffer.
    const uri=vscode.Uri.file(path.join(root,file));
    const document=await vscode.workspace.openTextDocument(uri);
    const text=document.getText();if(Buffer.byteLength(text)>65536)throw Error('파일이 너무 커요. 64 KiB 이하 파일을 골라 주세요.');
    return {document,text};
  }
  function clearDecorations(){for(const editor of vscode.window.visibleTextEditors){editor.setDecorations(decoration,[]);editor.setDecorations(difference,[]);}}
  function inspectSession(s:Session){
    const inspection=inspectStep(s.document.getText(),s.resolved);
    for(const [file,expected]of s.expectedFiles)if(file!==s.plan.steps[s.index].file&&s.documents.get(file)?.getText()!==expected)return {...inspection,status:'outside' as const};
    return inspection;
  }
  function saveStatus(state:string){
    if(!session)return;
    const current=session;
    const data={version:1,updatedAt:new Date().toISOString(),state,stepIndex:current.index,stepCount:current.plan.steps.length,planHash:current.hash};
    statusWrite=statusWrite.catch(()=>{}).then(()=>writeBridgeFile(current.root,'status.json',data)).catch(()=>{});
  }
  function render(){
    const common:PanelState={files:composer.files,model:composer.modelName,connected:composer.connected,busy,phase:composer.phase,error:composer.error,notice:composer.notice};
    if(!session){panel.update(common);return;}
    const s=session,step=s.plan.steps[s.index],inspection=inspectSession(s);
    if(s.complete&&inspection.status!=='matched'){s.complete=false;void vscode.commands.executeCommand('setContext','typeTheChange.active',true);}
    const messages={untouched:'',editing:'',matched:'제안과 일치',outside:'다른 부분도 바뀌었어요. 변경 내역을 확인하세요.'};
    panel.update({...common,title:s.plan.title,file:step.file,line:s.document.positionAt(s.resolved.start).line+1,reason:step.reason,before:s.resolved.before,after:s.resolved.after,step:s.index+1,total:s.plan.steps.length,status:inspection.status,message:messages[inspection.status],canContinue:inspection.status==='matched',complete:s.complete});
    status.text=s.complete?'$(check) 직접 바꿈':`$(edit) ${s.index+1}/${s.plan.steps.length}${inspection.status==='matched'?' ✓':''}`;
    status.tooltip='Type the Change';status.command='typeTheChange.start';
    clearDecorations();
    if(!s.complete&&inspection.status!=='outside')for(const editor of vscode.window.visibleTextEditors){
      if(editor.document.uri.toString()!==s.document.uri.toString())continue;
      const start=s.document.positionAt(s.resolved.start),end=s.document.positionAt(s.resolved.start+inspection.current.length);
      editor.setDecorations(decoration,[new vscode.Range(start,end)]);
      if(inspection.status==='editing'&&inspection.firstDifference>=0){const offset=s.resolved.start+inspection.firstDifference;editor.setDecorations(difference,[new vscode.Range(s.document.positionAt(offset),s.document.positionAt(Math.min(offset+1,s.document.getText().length)))]);}
    }
    saveStatus(s.complete?'complete':inspection.status==='untouched'||inspection.status==='editing'?'typing':inspection.status);
  }
  async function focus(select=false){
    if(!session)return;
    const s=session,inspection=inspectSession(s);
    select=select||inspection.status==='untouched';
    const editor=await vscode.window.showTextDocument(s.document,{viewColumn:vscode.ViewColumn.One,preserveFocus:false,preview:false});
    if(session!==s)return;
    if(inspection.status!=='outside'){
      const start=s.document.positionAt(s.resolved.start);
      const end=s.document.positionAt(s.resolved.start+(select?s.resolved.before.length:(inspection.status==='matched'?inspection.current.length:Math.max(0,inspection.firstDifference))));
      editor.selection=select?new vscode.Selection(start,end):new vscode.Selection(end,end);
      editor.revealRange(new vscode.Range(start,end),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    render();
  }
  async function startPlan(plan:Plan,root:string){
    local();const epoch=++sessionEpoch;
    const files=new Map<string,string>(),documents=new Map<string,vscode.TextDocument>();
    for(const file of new Set(plan.steps.map(s=>s.file))){const result=await source(root,file);if(epoch!==sessionEpoch)return;files.set(file,result.text);documents.set(file,result.document);}
    validatePlanAgainstFiles(plan,files);
    if(epoch!==sessionEpoch)return;
    const first=plan.steps[0],{document,text}=await source(root,first.file);
    if(epoch!==sessionEpoch)return;
    for(const [file,snapshot]of files)if(documents.get(file)?.getText()!==snapshot)throw Error('수정안을 여는 동안 파일이 바뀌었어요. 다시 열어 주세요.');
    session={root,plan,index:0,document,resolved:resolveStep(text,first),hash:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),complete:false,originalFiles:new Map(files),expectedFiles:files,documents};
    await vscode.commands.executeCommand('setContext','typeTheChange.active',true);
    composer.error='';composer.notice='';panel.show(true);render();await focus(true);
  }
  async function next(){
    if(!session||session.complete)return;
    const current=session;
    if(inspectSession(current).status!=='matched'){render();await focus();return;}
    current.expectedFiles.set(current.plan.steps[current.index].file,current.document.getText());
    if(current.index===current.plan.steps.length-1){current.complete=true;clearDecorations();render();await vscode.commands.executeCommand('setContext','typeTheChange.active',false);return;}
    const index=current.index+1,step=current.plan.steps[index],{document,text}=await source(current.root,step.file);
    if(session!==current||inspectSession(current).status!=='matched')return;
    // Resolve first: a stale next step must never discard the current valid guidance.
    const resolved=resolveStep(text,step);session={...current,index,document,resolved};render();await focus(true);
  }
  async function stop(){
    sessionEpoch++;generationAbort?.abort();if(session)saveStatus('idle');
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
    const root=await rootFolder();if(!root)return;
    const active=vscode.window.activeTextEditor?.document.uri;
    const defaultUri=active?.scheme==='file'&&vscode.workspace.getWorkspaceFolder(active)?.uri.fsPath===root?active:vscode.Uri.file(root);
    const selected=await vscode.window.showOpenDialog({canSelectMany:true,canSelectFolders:false,defaultUri,openLabel:'파일 선택'});
    if(!selected?.length)return;
    if(selected.length>8)throw Error('한 번에 파일 8개까지 선택하세요.');
    const files:string[]=[];
    for(const uri of selected){
      if(uri.scheme!=='file')throw Error('로컬 파일을 선택하세요.');
      const file=path.relative(root,uri.fsPath).split(path.sep).join('/');
      await source(root,file);files.push(file);
    }
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
    if(typeof intent!=='string'||!intent.trim()){panel.show();render();panel.focusIntent();return;}
    if(intent.length>4000)throw Error('요청은 4,000자 안으로 적어 주세요.');
    busy=true;const epoch=sessionEpoch,controller=new AbortController();generationAbort=controller;
    composer.error='';composer.notice='';composer.phase='파일 확인 중';render();
    try{
      local();
      if(!composer.root||!composer.files.length)await chooseFiles();
      controller.signal.throwIfAborted();
      const root=composer.root;if(!root||!composer.files.length)return;
      const files=new Map<string,string>();
      for(const file of composer.files)files.set(file,(await source(root,file)).text);
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
      const plan=await generatePlan(token,model.slug,intent.trim(),files,schema,controller.signal);
      controller.signal.throwIfAborted();
      if(plan.steps.some(s=>!files.has(s.file)))throw Error('선택하지 않은 파일이 포함됐어요. 다시 요청해 주세요.');
      for(const [file,snapshot]of files)if((await source(root,file)).text!==snapshot)throw Error('파일이 바뀌었어요. 현재 코드로 다시 요청해 주세요.');
      controller.signal.throwIfAborted();if(epoch!==sessionEpoch)throw new DOMException('Cancelled','AbortError');await startPlan(plan,root);
    }finally{busy=false;generationAbort=undefined;composer.phase='';render();}
  }
  async function importPlan(){
    const root=await rootFolder();if(!root)return;
    const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'Typing plan':['json']},openLabel:'수정안 열기'});if(!files?.[0])return;
    const data=await vscode.workspace.fs.readFile(files[0]);if(data.byteLength>262144)throw Error('수정안 파일이 너무 커요.');
    await startPlan(parsePlan(Buffer.from(data).toString('utf8')),root);
  }
  async function loadPending(fromRoot?:string){const root=fromRoot||await rootFolder();if(root){const data=await readBridgeFile(root,'plan.json');if(!data)throw Error('MCP에서 받은 수정안이 없어요.');await startPlan(parsePlan(JSON.stringify(data)),root);}}
  async function demo(){
    local();const root=await mkdtemp(path.join(tmpdir(),'type-the-change-'));
    const code=await readFile(context.asAbsolutePath('examples/price.ts'),'utf8'),plan=parsePlan(await readFile(context.asAbsolutePath('examples/plan.json'),'utf8'));
    await writeFile(path.join(root,'price.ts'),code,{flag:'wx'});await startPlan(plan,root);
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
    const file=s.originalFiles.size===1?s.plan.steps[s.index].file:await vscode.window.showQuickPick([...s.originalFiles.keys()],{title:'변경 확인'});
    if(!file||session!==s)return;
    const original=vscode.Uri.from({scheme:'type-the-change-before',path:`/${file}`,query:createHash('sha256').update(s.root).update(s.originalFiles.get(file)||'').digest('hex')});
    snapshots.set(original.toString(),s.originalFiles.get(file)||'');
    await vscode.commands.executeCommand('vscode.diff',original,vscode.Uri.file(path.join(s.root,file)),`${file} · 변경 전 ↔ 현재`,{preview:true});
  }
  async function guard(action:()=>unknown){
    try{composer.error='';await action();}
    catch(error){
      if(error instanceof Error&&error.name==='AbortError')return;
      const fileErrors:Record<string,string>={unsafe_path:'작업 폴더 안의 소스 파일을 선택하세요.',missing_file:'파일을 찾을 수 없어요.',not_regular_file:'일반 텍스트 파일을 선택하세요.',too_large:'파일은 64 KiB 이하로 선택하세요.',invalid_text:'UTF-8 텍스트 파일을 선택하세요.',unavailable:'파일을 읽을 수 없어요.'};
      composer.error=error instanceof WorkspaceFileError?fileErrors[error.code]:error instanceof Error?error.message:'완료하지 못했어요. 다시 시도해 주세요.';
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
    import:importPlan,loadPending:()=>loadPending(),next,focus:()=>focus(),stop,demo,mcpConfig,usage,review,
  };
  for(const [name,action]of Object.entries(commands))context.subscriptions.push(vscode.commands.registerCommand(`typeTheChange.${name}`,(arg?:unknown)=>guard(()=>action(arg))));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event=>{if(session&&[...session.documents.values()].some(d=>d.uri.toString()===event.document.uri.toString())){clearTimeout(timer);timer=setTimeout(render,250);}}));
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
  context.subscriptions.push(watcher,panel,status,decoration,difference,{dispose(){generationAbort?.abort();clearTimeout(timer);for(const timer of noticeTimers.values())clearTimeout(timer);}});
  return {startPlan,next,stop,getState:()=>session?{file:session.plan.steps[session.index].file,index:session.index,complete:session.complete&&inspectSession(session).status==='matched',status:inspectSession(session).status}:null};
}
export function deactivate(){}
