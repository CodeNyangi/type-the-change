import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/companion-host.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],write:false});
const load=new Function('require','module','exports',bundle.outputFiles[0].text),requireReal=createRequire(import.meta.url);
function fixture(){
 const calls:any[]=[],providers=new Map<string,any>();let external=true;
 const uri=(value:any)=>({...value,toString(){return typeof value==='string'?value:value.scheme+':'+value.path;}});
 const disposable=()=>({dispose(){}}),vscode={env:{remoteName:undefined,async openExternal(value:any){calls.push(['external',value.toString()]);return external;}},Uri:{from:uri,parse:(s:string)=>({toString:()=>s})},ViewColumn:{One:1},
  workspace:{isTrusted:true,textDocuments:[],registerTextDocumentContentProvider(scheme:string,provider:any){providers.set(scheme,provider);return disposable();},onDidChangeTextDocument:disposable},window:{},commands:{async executeCommand(...args:any[]){calls.push(args);}}};
 const module={exports:{} as any};load((name:string)=>name==='vscode'?vscode:requireReal(name),module,module.exports);
 const context={subscriptions:[],workspaceState:{get(){}},extension:{packageJSON:{version:'0.8.0'}}};
 const companion=module.exports.createCompanion(context,()=>{});companion.model.state.selected={id:'01a199f2-6e4d-7f62-8330-bc04bce75fde',title:'Real-shaped task'};
 return {...companion,calls,providers,vscode,externalFailure(){external=false;},close(){companion.model.dispose();}};
}
test('an old or missing request target cannot enqueue a message for the current chat',async()=>{
 const f=fixture();try{for(const value of [undefined,{id:'other-chat'}])await assert.rejects(f.commands.prepareLesson(value),/selected chat changed|선택한 채팅/);assert.equal(f.model.state.lessonRequest,undefined);assert.deepEqual(f.calls,[]);}finally{f.close();}
});
test('the original-chat button opens the exact existing deep link and reports launch failure',async()=>{
 const f=fixture();try{await f.commands.openCodexThread();assert.deepEqual(f.calls.at(-1),['external','codex://threads/01a199f2-6e4d-7f62-8330-bc04bce75fde']);f.externalFailure();await assert.rejects(f.commands.openCodexThread(),/Could not open|열지 못/);}finally{f.close();}
});
test('the comparison button opens the exact pinned excerpts as immutable virtual documents',async()=>{
 const f=fixture();try{
  f.model.state.lesson={file:'services/example.py',card:{title:'Owner explanation',source:{before:'if old:\n    reject()\n',after:'if verified:\n    reject()\n'}}};await f.commands.openLessonDiff();const [name,before,after,title,options]=f.calls.at(-1);assert.equal(name,'vscode.diff');assert.equal(title,'Owner explanation');assert.equal(options.preview,false);assert.equal(before.scheme,'ttc-codex-review');assert.equal(after.scheme,'ttc-codex-review');const provider=f.providers.get('ttc-codex-review');assert.equal(provider.provideTextDocumentContent(before),'if old:\n    reject()\n');assert.equal(provider.provideTextDocumentContent(after),'if verified:\n    reject()\n');
 }finally{f.close();}
});
