import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile, link } from 'node:fs/promises';
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
interface ExtensionApi {startPlan(plan:Plan,root:string):Promise<void>;next():Promise<void>;stop():Promise<void>;getState():{file:string;status:string;complete:boolean}|null}

async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'ttc-document-lifecycle-'));
  const beforeA='export const a = 1;\n',afterA='export const a = 2;\n',beforeB='export const b = 1;\n',afterB='export const b = 2;\n';
  await writeFile(path.join(root,'a.ts'),beforeA);await writeFile(path.join(root,'b.ts'),beforeB);
  const documents=new Map<string,TestDocument>(),opening=new Map<string,Promise<TestDocument>>(),commands=new Map<string,(...args:unknown[])=>unknown>();
  const uiEvents:{type:'source'|'guide';viewColumn:number;preserveFocus:boolean}[]=[];
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
    env:{remoteName:undefined},Uri:{file:uri},StatusBarAlignment:{Left:1},ViewColumn:{One:1,Two:2,Beside:-2},TextEditorRevealType:{InCenterIfOutsideViewport:1},
    ThemeColor:class{constructor(readonly id:string){}},DecorationRangeBehavior:{ClosedClosed:1},
    Range:class{constructor(readonly start:unknown,readonly end:unknown){}},Selection:class{constructor(readonly start:unknown,readonly end:unknown){}},workspace,
    commands:{registerCommand(name:string,action:(...args:unknown[])=>unknown){commands.set(name,action);return disposable();},async executeCommand(name:string,...args:unknown[]){return commands.get(name)?.(...args);}},
    window:{visibleTextEditors:[],createStatusBarItem:()=>({...disposable(),show(){}}),createTextEditorDecorationType:disposable,onDidChangeVisibleTextEditors:event,
      async showTextDocument(document:TestDocument,options:{viewColumn:number;preserveFocus:boolean}){assert.equal(document.isClosed,false,'guidance must not focus a disposed document');await beforeShowSource?.();uiEvents.push({type:'source',...options});return {document,selection:undefined,revealRange(){}};},
      createWebviewPanel:(_type:string,_title:string,options:{viewColumn:number;preserveFocus:boolean})=>{
        uiEvents.push({type:'guide',...options});
        return {...disposable(),viewColumn:options.viewColumn===-2?1:options.viewColumn,reveal(viewColumn:number,preserveFocus:boolean){this.viewColumn=viewColumn;uiEvents.push({type:'guide',viewColumn,preserveFocus});},onDidDispose:event,webview:{html:'',onDidReceiveMessage:event,async postMessage(){return true;}}};
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
  return {root,api,plan,beforeA,afterA,beforeB,afterB,open,edit,closeDocument,run,uiEvents,onShowSource(callback:()=>Promise<void>){beforeShowSource=callback;},async close(){
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
      {type:'source',viewColumn:1,preserveFocus:false},
      {type:'guide',viewColumn:2,preserveFocus:true},
    ]);
    await f.run('start');
    assert.equal(f.uiEvents.at(-1)?.viewColumn,2,'reopening active guidance does not keep splitting relative to the focused group');
  }finally{await f.close();}
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

test('reopening a disposed prior document invalidates stale agreement',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan(f.plan,f.root);const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.api.next();
    f.closeDocument(first);const reopened=await f.open('a.ts');assert.notEqual(reopened,first);
    f.edit(reopened,f.beforeA);const second=await f.open('b.ts');f.edit(second,f.afterB);
    assert.equal(f.api.getState()?.status,'outside','comparison must use the reopened prior file, not its disposed snapshot');
    await f.api.next();assert.equal(f.api.getState()?.complete,false);
    f.edit(reopened,f.afterA);await f.api.next();assert.equal(f.api.getState()?.complete,true);
    assert.equal(await readFile(path.join(f.root,'b.ts'),'utf8'),f.beforeB);
  }finally{await f.close();}
});

test('Next revalidates a closed prior file against disk before accepting completion',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan(f.plan,f.root);const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.api.next();
    // Disk changes before the close event is delivered; the disposed object
    // still contains its previously accepted text and must not be trusted.
    await writeFile(path.join(f.root,'a.ts'),f.beforeA);f.closeDocument(first);
    f.edit(await f.open('b.ts'),f.afterB);await f.api.next();
    assert.equal(f.api.getState()?.complete,false,'a closed document cannot certify stale disk content');
    assert.equal(f.api.getState()?.status,'outside');assert.equal(await readFile(path.join(f.root,'a.ts'),'utf8'),f.beforeA);
  }finally{await f.close();}
});

test('closing an unchanged document recovers guidance without a manual reopen',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan(f.plan,f.root);const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.api.next();
    f.edit(await f.open('b.ts'),f.afterB);assert.equal(f.api.getState()?.status,'matched');f.closeDocument(first);
    const deadline=Date.now()+3000;
    while(f.api.getState()?.status!=='matched'&&Date.now()<deadline)await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(f.api.getState()?.status,'matched','document disposal alone must not strand the disabled Next button');
    await f.api.next();assert.equal(f.api.getState()?.complete,true);
  }finally{await f.close();}
});

test('reloading an unchanged completed document preserves its completed review',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);
    const first=await f.open('a.ts');f.edit(first,f.afterA);await writeFile(path.join(f.root,'a.ts'),f.afterA);await f.api.next();
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
    const first=await f.open('a.ts');f.edit(first,f.afterA);await f.api.next();assert.equal(f.api.getState()?.complete,true);
    // The saved original differs from the completed dirty buffer.
    f.closeDocument(first);const reopened=await f.open('a.ts');
    assert.equal(f.api.getState()?.status,'untouched');assert.equal(f.api.getState()?.complete,false);
    f.edit(reopened,f.afterA);await f.run('focus');
    assert.equal(f.api.getState()?.status,'matched');assert.equal(f.api.getState()?.complete,false);
    await f.api.next();assert.equal(f.api.getState()?.complete,true);
  }finally{await f.close();}
});

test('a reopened active document receives focus and tracks the new buffer',async()=>{
  const f=await fixture();
  try{
    await f.api.startPlan({...f.plan,steps:[f.plan.steps[0]]},f.root);const first=await f.open('a.ts');f.closeDocument(first);
    const reopened=await f.open('a.ts');f.edit(reopened,f.afterA);
    assert.equal(f.api.getState()?.status,'matched');await f.run('focus');await f.api.next();assert.equal(f.api.getState()?.complete,true);
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
    f.edit(await f.open('a.ts'),updated);await f.api.next();
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
