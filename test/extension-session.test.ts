import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile, link, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import type { Plan } from '../src/plan.js';

// The VS Code contract says closed TextDocuments stop synchronizing and a
// reopened resource receives a different object. Model that lifecycle explicitly;
// closing an editor tab in a native test does not necessarily dispose its model.
const bundled=await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',external:['vscode'],write:false});
const loadExtension=new Function('require','module','exports',bundled.outputFiles[0].text);
const realRequire=createRequire(import.meta.url);
interface TestDocument {uri:{scheme:string;fsPath:string;toString():string};text:string;isClosed:boolean;getText():string;positionAt(offset:number):{line:number;character:number}}
interface ExtensionApi {startPlan(plan:Plan,root:string):Promise<void>;next():Promise<void>;stop():Promise<void>;predict(value:unknown):Promise<void>;decide(value:{decision:string;evidence:string}):Promise<void>;getState():{file:string;status:string;complete:boolean;judgment:{phase:string};replan:boolean}|null}

async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'ttc-document-lifecycle-'));
  const beforeA='export const a = 1;\n',afterA='export const a = 2;\n',beforeB='export const b = 1;\n',afterB='export const b = 2;\n';
  await writeFile(path.join(root,'a.ts'),beforeA);await writeFile(path.join(root,'b.ts'),beforeB);
  const documents=new Map<string,TestDocument>(),opening=new Map<string,Promise<TestDocument>>(),commands=new Map<string,(...args:unknown[])=>unknown>();
  const uiEvents:{type:'source'|'guide';viewColumn:number;preserveFocus:boolean}[]=[];
  const panelStates:{file?:string;busy?:boolean}[]=[];
  let beforeShowSource:(()=>Promise<void>)|undefined;
  const opened=new Set<(document:TestDocument)=>void>(),closed=new Set<(document:TestDocument)=>void>(),changed=new Set<(event:{document:TestDocument})=>void>();
  const disposable=()=>({dispose(){}}),event=(_handler:unknown)=>disposable();
  const listen=<T>(set:Set<(value:T)=>void>)=>(handler:(value:T)=>void)=>{set.add(handler);return {dispose(){set.delete(handler);}};};
  const uri=(fsPath:string)=>({scheme:'file',fsPath,toString:()=>`file://${fsPath}`});
  const workspace={
    isTrusted:true,registerTextDocumentContentProvider:disposable,
    onDidOpenTextDocument:listen(opened),onDidCloseTextDocument:listen(closed),onDidChangeTextDocument:listen(changed),
    createFileSystemWatcher:()=>({...disposable(),onDidCreate:event,onDidChange:event}),
    async openTextDocument(target:ReturnType<typeof uri>){
      const document=documents.get(target.fsPath);if(document&&!document.isClosed)return document;
      let pending=opening.get(target.fsPath);
      if(!pending){
        pending=(async()=>{
          const current:TestDocument={uri:target,text:await readFile(target.fsPath,'utf8'),isClosed:false,getText(){return this.text;},positionAt(offset:number){return {line:0,character:offset};}};
          documents.set(target.fsPath,current);for(const handler of opened)handler(current);return current;
        })().finally(()=>opening.delete(target.fsPath));
        opening.set(target.fsPath,pending);
      }
      return pending;
    },
  };
  const vscode={
    env:{remoteName:undefined},Uri:{file:uri,from:(value:{scheme:string;path:string;query:string})=>({toString:()=>value.scheme+':'+value.path+'?'+value.query})},StatusBarAlignment:{Left:1},ViewColumn:{One:1,Two:2,Beside:-2},TextEditorRevealType:{InCenterIfOutsideViewport:1},
    ThemeColor:class{constructor(readonly id:string){}},DecorationRangeBehavior:{ClosedClosed:1},
    Range:class{constructor(readonly start:unknown,readonly end:unknown){}},Selection:class{constructor(readonly start:unknown,readonly end:unknown){}},workspace,
    commands:{registerCommand(name:string,action:(...args:unknown[])=>unknown){commands.set(name,action);return disposable();},async executeCommand(name:string,...args:unknown[]){return commands.get(name)?.(...args);}},
    window:{visibleTextEditors:[],createStatusBarItem:()=>({...disposable(),show(){}}),createTextEditorDecorationType:disposable,onDidChangeVisibleTextEditors:event,
      async showTextDocument(document:TestDocument,options:{viewColumn:number;preserveFocus:boolean}){assert.equal(document.isClosed,false,'guidance must not focus a disposed document');await beforeShowSource?.();uiEvents.push({type:'source',...options});return {document,selection:undefined,revealRange(){}};},
      createWebviewPanel:(_type:string,_title:string,options:{viewColumn:number;preserveFocus:boolean})=>{
        uiEvents.push({type:'guide',...options});
        let receive:(message:unknown)=>void=()=>{};
        return {...disposable(),viewColumn:options.viewColumn===-2?1:options.viewColumn,reveal(viewColumn:number,preserveFocus:boolean){this.viewColumn=viewColumn;uiEvents.push({type:'guide',viewColumn,preserveFocus});},onDidDispose:event,webview:{html:'',onDidReceiveMessage(handler:(message:unknown)=>void){receive=handler;return disposable();},async postMessage(state:{file?:string;busy?:boolean;type?:string;revision?:number;request?:number}){
          if(!state.type){panelStates.push(state);queueMicrotask(()=>receive({command:'rendered',revision:state.revision}));}
          else if(state.type==='focusStep')queueMicrotask(()=>receive({command:'focused',request:state.request}));
          return true;
        }}};
      },
    },
  };
  const subscriptions:{dispose():void}[]=[],module={exports:{} as {activate(context:unknown):ExtensionApi}};
  loadExtension((name:string)=>name==='vscode'?vscode:realRequire(name),module,module.exports);
  const api=module.exports.activate({subscriptions,globalStorageUri:uri(path.join(root,'auth-storage')),globalState:{get(){},async update(){}},secrets:{async get(){},async store(){},async delete(){}}});
  const plan:Plan={version:1,title:'Both values',intent:'Change the values.',steps:[
    {file:'a.ts',before:beforeA,after:afterA,reason:'First value.'},
    {file:'b.ts',before:beforeB,after:afterB,reason:'Second value.'},
  ]};
  function edit(document:TestDocument,text:string){document.text=text;for(const handler of changed)handler({document});}
  function closeDocument(document:TestDocument){document.isClosed=true;for(const handler of closed)handler(document);}
  const open=(file:string)=>workspace.openTextDocument(uri(path.join(root,file)));
  const run=async(name:string)=>{const command=commands.get(`typeTheChange.${name}`);assert.ok(command);await command();};
  async function acceptMatch(){if(api.getState()?.complete)return;if(api.getState()?.judgment.phase==='predict')await api.predict('수정한 상수가 새 값으로 평가된다');await api.next();if(api.getState()?.status==='matched'&&!api.getState()?.complete)await api.decide({decision:'keep',evidence:'비교에서 상수의 값과 주변 코드 보존 확인'});}
  return {root,api,acceptMatch,plan,beforeA,afterA,beforeB,afterB,open,edit,closeDocument,run,uiEvents,panelStates,onShowSource(callback:()=>Promise<void>){beforeShowSource=callback;},async close(){
    await api.stop();for(const subscription of subscriptions)subscription.dispose();
    // Status snapshots already queued by render() finish asynchronously. Retry
    // only transient removal failures while those owned bridge files drain.
    await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:20});
  }};
}

test('starting guidance from the home panel opens source first and reveals the guide in a separate fixed column',async()=>{
  const f=await fixture();
  try{
    await f.run('start');f.uiEvents.length=0;
    await f.api.startPlan(f.plan,f.root);
    assert.deepEqual(f.uiEvents.map(({type,viewColumn,preserveFocus})=>({type,viewColumn,preserveFocus})),[
      {type:'source',viewColumn:1,preserveFocus:true},
      {type:'guide',viewColumn:2,preserveFocus:true},
    ]);
    await f.run('start');
    assert.equal(f.uiEvents.at(-1)?.viewColumn,2,'reopening active guidance does not keep splitting relative to the focused group');
  }finally{await f.close();}
});

test('prediction cannot appear or accept text before pending native focus has finished',async()=>{
  const f=await fixture();let release!:()=>void,reached!:()=>void;
  const pending=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>reached=resolve);
  try{
    await f.run('start');f.onShowSource(async()=>{reached();await pending;});
    const starting=f.api.startPlan(f.plan,f.root);await ready;
    assert.equal(f.panelStates.at(-1)?.file,undefined);assert.equal(f.panelStates.at(-1)?.busy,true);
    await f.api.predict('too early');assert.equal(f.api.getState()?.judgment.phase,'predict');
    release();await starting;assert.equal(f.panelStates.at(-1)?.file,'a.ts');
    assert.equal(f.uiEvents.at(-1)?.type,'guide');assert.equal(f.uiEvents.at(-1)?.preserveFocus,true,'reveal alone cannot steal focus before the explicit handoff');
  }finally{release();await f.close();}
});

test('stopping while native source focus is pending cannot reveal stale guidance afterward',async()=>{
  const f=await fixture();
  let release!:()=>void,reached!:()=>void;
  const ready=new Promise<void>(resolve=>reached=resolve),pending=new Promise<void>(resolve=>release=resolve);
  try{
    await f.run('start');f.uiEvents.length=0;
    f.onShowSource(async()=>{reached();await pending;});
    const starting=f.api.startPlan(f.plan,f.root);await ready;f.uiEvents.length=0;await f.api.stop();release();await starting;
    assert.equal(f.api.getState(),null);
    assert.deepEqual(f.uiEvents.filter(event=>event.type==='guide'),[],'a stopped start must not reopen or move the guide');
  }finally{release();await f.close();}
});
test('a return-to-code action during prediction joins the pending handoff instead of resetting selection twice',async()=>{
  const f=await fixture();let release!:()=>void,reached!:()=>void,calls=0;
  const ready=new Promise<void>(resolve=>reached=resolve),pending=new Promise<void>(resolve=>release=resolve);
  try{
    await f.api.startPlan(f.plan,f.root);
    f.onShowSource(async()=>{calls++;reached();await pending;});
    const predicting=f.api.predict('The constant becomes two.');await ready;
    const returning=f.run('focus');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1,'an overlapping click cannot enqueue another late range selection');
    release();await Promise.all([predicting,returning]);assert.equal(calls,1);
  }finally{release();await f.close();}
});

test('reopening a disposed prior document invalidates stale agreement',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan(f.plan,f.root);const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.acceptMatch();
    f.closeDocument(first);const reopened=await f.open('a.ts');assert.notEqual(reopened,first);
    f.edit(reopened,f.beforeA);const second=await f.open('b.ts');f.edit(second,f.afterB);
    assert.equal(f.api.getState()?.status,'outside','comparison must use the reopened prior file, not its disposed snapshot');
    await f.acceptMatch();assert.equal(f.api.getState()?.complete,false);
    f.edit(reopened,f.afterA);await f.acceptMatch();assert.equal(f.api.getState()?.complete,true);
    assert.equal(await readFile(path.join(f.root,'b.ts'),'utf8'),f.beforeB);
  }finally{await f.close();}
});

test('Next revalidates a closed prior file against disk before accepting completion',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan(f.plan,f.root);const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.acceptMatch();
    // Disk changes before the close event is delivered; the disposed object
    // still contains its previously accepted text and must not be trusted.
    await writeFile(path.join(f.root,'a.ts'),f.beforeA);f.closeDocument(first);
    f.edit(await f.open('b.ts'),f.afterB);await f.acceptMatch();
    assert.equal(f.api.getState()?.complete,false,'a closed document cannot certify stale disk content');
    assert.equal(f.api.getState()?.status,'outside');assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),f.beforeA);
  }finally{await f.close();}
});

test('closing an unchanged document recovers guidance without a manual reopen',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan(f.plan,f.root);const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.acceptMatch();
    f.edit(await f.open('b.ts'),f.afterB);assert.equal(f.api.getState()?.status,'matched');f.closeDocument(first);
    const deadline=Date.now()+3000;
    while(f.api.getState()?.status!=='matched'&&Date.now()<deadline)await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(f.api.getState()?.status,'matched','document disposal alone must not strand the disabled Next button');
    await f.acceptMatch();assert.equal(f.api.getState()?.complete,true);
  }finally{await f.close();}
});

test('reloading an unchanged completed document preserves its completed review',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);
    const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.acceptMatch();
    assert.equal(f.api.getState()?.complete,true);f.closeDocument(first);
    const deadline=Date.now()+3000;
    while(f.api.getState()?.status!=='matched'&&Date.now()<deadline)await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(f.api.getState()?.status,'matched');
    assert.equal(f.api.getState()?.complete,true,'disposing an unchanged buffer must not require the same final review again');
  }finally{await f.close();}
});

test('reopening changed code invalidates completion and restoring text requires a new review',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);
    const first=await f.open('a.ts');f.edit(first,f.afterA);await f.acceptMatch();assert.equal(f.api.getState()?.complete,true);
    // The saved original differs from the completed dirty buffer.
    f.closeDocument(first);const reopened=await f.open('a.ts');
    assert.equal(f.api.getState()?.status,'untouched');assert.equal(f.api.getState()?.complete,false);
    f.edit(reopened,f.afterA);await f.run('focus');
    assert.equal(f.api.getState()?.status,'matched');assert.equal(f.api.getState()?.complete,false);
    await f.acceptMatch();assert.equal(f.api.getState()?.complete,true);
  }finally{await f.close();}
});

test('a reopened active document receives focus and tracks the new buffer',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);const first=await f.open('a.ts');f.closeDocument(first);
    const reopened=await f.open('a.ts');f.edit(reopened,f.afterA);
    assert.equal(f.api.getState()?.status,'matched');await f.run('focus');await f.acceptMatch();assert.equal(f.api.getState()?.complete,true);
    assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),f.beforeA,'rebinding does not save human edits');
  }finally{await f.close();}
});

test('preflight rejects a proposal that would exceed the readable file limit and preserves the current guide',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[1]]},f.root);
    const initial='x'.repeat(65_530)+'a';
    await writeFile(path.join(f.root,'a.ts'),initial);
    const oversized={...f.plan,steps:[{file:'a.ts',before:'a',after:'bbbbbbb',reason:'Expand the final value.'}]};
    await assert.rejects(f.api.startPlan(oversized,f.root),/64 KiB/);
    assert.equal(f.api.getState()?.file,'b.ts','an unusable replacement must not discard the existing guide');
    assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),initial);
  }finally{await f.close();}
});

test('a change ending exactly at the UTF-8 file limit remains completable without saving',async()=>{
  const f=await fixture();
  try{
    const initial='x'.repeat(65_530)+'a',updated='x'.repeat(65_530)+'가나';
    await writeFile(path.join(f.root,'a.ts'),initial);
    await f.api.startPlan({...f.plan,steps:[{file:'a.ts',before:'a',after:'가나',reason:'Use the final label.'}]},f.root);
    f.edit(await f.open('a.ts'),updated);await f.acceptMatch();
    assert.equal(f.api.getState()?.complete,true);assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),initial);
  }finally{await f.close();}
});

test('an imported plan cannot replace valid guidance with conflicting aliases for the same physical file',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[1]]},f.root);
    await link(path.join(f.root,'a.ts'),path.join(f.root,'alias.ts'));
    const aliased={...f.plan,steps:[f.plan.steps[0],{...f.plan.steps[0],file:'alias.ts',after:'export const a = 3;\n'}]};
    await assert.rejects(f.api.startPlan(aliased,f.root),{code:'duplicate_file'});
    assert.equal(f.api.getState()?.file,'b.ts');assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),f.beforeA);
  }finally{await f.close();}
});

test('matching an AI proposal does not finish without prediction, comparison and evidence',async()=>{
 const f=await fixture();try{
  await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);f.edit(await f.open('a.ts'),f.afterA);
  await assert.rejects(f.api.next(),/예상/);assert.equal(f.api.getState()?.complete,false);
  await f.api.predict('a의 값이 2가 된다');await f.api.next();assert.equal(f.api.getState()?.complete,false);
  await assert.rejects(f.api.decide({decision:'keep',evidence:''}),/한 줄/);
  await f.api.decide({decision:'keep',evidence:'상수 선언과 다른 코드가 그대로인지 비교했다'});
  assert.equal(f.api.getState()?.complete,true);
  const journal=JSON.parse(await readFile(path.join(f.root,'.type-the-change/review.json'),'utf8'));
  assert.equal(journal.records[0].prediction,'a의 값이 2가 된다');assert.equal(journal.records[0].decision,'keep');
 }finally{await f.close();}
});
test('a human can keep a different implementation or reject an unchanged proposal',async()=>{
 for(const alternative of [true,false]){const f=await fixture();try{
  await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);await f.api.predict('필요한 값은 3이다');
  if(alternative)f.edit(await f.open('a.ts'),'export const a = 3;\n');
  await f.api.next();await f.api.decide({decision:alternative?'keep':'reject',evidence:'요구한 값은 3인데 제안은 2다'});
  assert.equal(f.api.getState()?.complete,alternative);assert.equal(f.api.getState()?.status,alternative?'editing':'untouched');
  assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),f.beforeA,'no decision applies or saves source');
 }finally{await f.close();}}
});
test('a stale comparison cannot certify subsequent edits',async()=>{
 const f=await fixture();try{
  await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);await f.api.predict('2');const document=await f.open('a.ts');f.edit(document,f.afterA);await f.api.next();
  f.edit(document,'export const a = 3;\n');await assert.rejects(f.api.decide({decision:'keep',evidence:'old comparison'}),/다시 비교/);assert.equal(f.api.getState()?.complete,false);
 }finally{await f.close();}
});
test('an alternative that invalidates the remaining plan is kept without guessing its next anchor',async()=>{
 const f=await fixture();try{
  const steps=[{file:'a.ts',before:'1',after:'2',reason:'first'},{file:'a.ts',before:'2',after:'4',reason:'second'}];
  await f.api.startPlan({...f.plan,steps},f.root);await f.api.predict('최종적으로 3이면 충분하다');f.edit(await f.open('a.ts'),'export const a = 3;\n');await f.api.next();
  await f.api.decide({decision:'keep',evidence:'다른 구현이 요구값 3을 제공한다'});assert.equal(f.api.getState()?.replan,true);assert.equal(f.api.getState()?.complete,false);
  assert.equal((await f.open('a.ts')).getText(),'export const a = 3;\n');
 }finally{await f.close();}
});
test('a failed journal write cannot claim that a decision was recorded',async()=>{
 const f=await fixture();try{
  await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);await f.api.predict('2');f.edit(await f.open('a.ts'),f.afterA);await f.api.next();
  await mkdir(path.join(f.root,'.type-the-change/review.json'),{recursive:true});
  await assert.rejects(f.api.decide({decision:'keep',evidence:'checked'}));assert.equal(f.api.getState()?.judgment.phase,'review');assert.equal(f.api.getState()?.complete,false);
 }finally{await f.close();}
});
