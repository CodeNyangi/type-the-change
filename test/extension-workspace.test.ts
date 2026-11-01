import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import type { PanelState } from '../src/panel-view.js';

// Run the production extension's command orchestration. The filesystem is real;
// only the VS Code UI/storage surfaces and outbound provider transport are mocked.
const bundled=await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',external:['vscode'],write:false});
const loadExtension=new Function('require','module','exports',bundled.outputFiles[0].text);
const realRequire=createRequire(import.meta.url);
afterEach(()=>mock.restoreAll());
interface FilePick {label:string;file:string;picked:boolean}

async function fixture(){
  const base=await mkdtemp(path.join(tmpdir(),'ttc-selected-workspace-'));
  const primary=path.join(base,'primary'),selected=path.join(base,'selected');
  await mkdir(primary);await mkdir(selected);
  const file=path.join(selected,'source.ts'),original='export const value = 1;\n';await writeFile(file,original);
  const commands=new Map<string,(...args:unknown[])=>unknown>(),messages:PanelState[]=[];
  const subscriptions:{dispose():void}[]=[];
  const disposable=()=>({dispose(){}}),event=(_handler:unknown)=>disposable();
  const uri=(fsPath:string)=>({scheme:'file',fsPath,toString:()=>`file://${fsPath}`});
  let reads=0,pickers=0,selection:string[]|undefined=['source.ts'],items:FilePick[]=[],pickerTitle='';
  const listed=[file],findCalls:unknown[][]=[];
  const workspace={
    isTrusted:true,textDocuments:[],workspaceFolders:[{name:'Primary project',uri:uri(primary)},{name:'Selected project',uri:uri(selected)}],
    getWorkspaceFolder(target:{fsPath:string}){return this.workspaceFolders.find(folder=>target.fsPath===folder.uri.fsPath||target.fsPath.startsWith(folder.uri.fsPath+path.sep));},
    registerTextDocumentContentProvider:disposable,onDidChangeTextDocument:event,onDidOpenTextDocument:event,onDidCloseTextDocument:event,
    createFileSystemWatcher:()=>({...disposable(),onDidCreate:event,onDidChange:event}),
    async findFiles(...args:unknown[]){findCalls.push(args);return listed.map(uri);},
    async openTextDocument(target:{fsPath:string}){reads++;const text=await readFile(target.fsPath,'utf8');return {uri:target,getText:()=>text};},
  };
  const vscode={
    env:{remoteName:undefined,openExternal:async()=>assert.fail('No browser authentication should start')},
    Uri:{file:uri},StatusBarAlignment:{Left:1},ViewColumn:{Beside:-2},
    RelativePattern:class{constructor(readonly base:string,readonly pattern:string){}},
    CancellationTokenSource:class{token={};cancel(){}dispose(){}},extensions:{getExtension(){}},
    ThemeColor:class{constructor(readonly id:string){}},DecorationRangeBehavior:{ClosedClosed:1},workspace,
    commands:{registerCommand(name:string,action:(...args:unknown[])=>unknown){commands.set(name,action);return disposable();},async executeCommand(name:string,...args:unknown[]){return commands.get(name)?.(...args);}},
    window:{
      activeTextEditor:{document:{uri:uri(file)}},visibleTextEditors:[],
      createStatusBarItem:()=>({...disposable(),show(){}}),createTextEditorDecorationType:disposable,onDidChangeVisibleTextEditors:event,
      createQuickPick(){
        const handlers:Record<string,Function>={};
        const picker={items:[] as FilePick[],selectedItems:[] as FilePick[],title:'',busy:false,canSelectMany:false,
          onDidChangeSelection(fn:Function){handlers.selection=fn;return disposable();},onDidChangeValue(fn:Function){handlers.value=fn;return disposable();},onDidAccept(fn:Function){handlers.accept=fn;return disposable();},onDidHide(fn:Function){handlers.hide=fn;return disposable();},dispose(){},
          show(){pickers++;assert.equal(this.canSelectMany,true);pickerTitle=this.title;
            if(selection===undefined){items=this.items.map(item=>({...item,picked:this.selectedItems.includes(item)}));handlers.hide();return;}
            // Exercise the production asynchronous search and selection handlers.
            handlers.value('source');
            const complete=()=>{if(this.busy){setTimeout(complete,10);return;}items=this.items.map(item=>({...item,picked:this.selectedItems.includes(item)}));
              const chosen=selection!.map(file=>{const item=this.items.find(item=>item.file===file);assert.ok(item,`selectable ${file}`);return item;});handlers.selection(chosen);handlers.accept();};complete();
          },
        };return picker;
      },
      withProgress:async()=>assert.fail('No authentication flow should start'),
      createWebviewPanel:()=>({...disposable(),reveal(){},onDidDispose:event,webview:{html:'',onDidReceiveMessage:event,async postMessage(state:PanelState){messages.push(state);return true;}}}),
    },
  };
  const module={exports:{} as {activate(context:unknown):unknown}};
  loadExtension((name:string)=>name==='vscode'?vscode:realRequire(name),module,module.exports);
  const account=JSON.stringify({version:1,clientId:'oaiapp_test',subject:'subject',nonce:'nonce',idToken:'test-id',accessToken:'test-access',refreshToken:'test-refresh',expiresAt:Date.now()+3_600_000,scopes:['openid','resource.invoke','chatgpt.tokens.use.direct']});
  module.exports.activate({subscriptions,globalStorageUri:uri(path.join(base,'auth-storage')),asAbsolutePath:(file:string)=>path.resolve(file),globalState:{get(){return undefined;},async update(){}},secrets:{async get(key:string){return key==='typeTheChange.chatgpt.account.v1'?account:undefined;},async store(){},async delete(){}}});
  const run=async(name:string,...args:unknown[])=>{const action=commands.get(`typeTheChange.${name}`);assert.ok(action);await action(...args);};
  await run('start');await run('chooseFiles');
  return {run,messages,workspace,selected,file,original,findCalls,
    get reads(){return reads;},get pickers(){return pickers;},get items(){return items;},get pickerTitle(){return pickerTitle;},
    select(files:string[]|undefined){selection=files;},
    list(file:string){listed.push(path.resolve(selected,file));},
    omitFromSearch(file:string){const index=listed.indexOf(path.resolve(selected,file));if(index>=0)listed.splice(index,1);},
    async add(file:string,text='export const example = 1;\n'){const target=path.join(selected,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,text);listed.push(target);},
    removeSelected(){workspace.workspaceFolders=[{name:'Primary project',uri:uri(primary)}];},
    async close(){for(const subscription of subscriptions)subscription.dispose();await rm(base,{recursive:true,force:true});}};
}

test('file selection spans directories and remembers checked paths without reading unselected files',async()=>{
  const f=await fixture();
  try{
    await f.add('src/foo.ts');await f.add('tests/foo.test.ts');await f.add('other.ts');
    f.select(['src/foo.ts','tests/foo.test.ts']);const reads=f.reads;await f.run('chooseFiles');
    assert.deepEqual(f.messages.at(-1)?.files,['src/foo.ts','tests/foo.test.ts']);assert.equal(f.reads,reads+2);
    assert.match(f.pickerTitle,/Selected project/);
    const discovery=f.findCalls.at(-1)!;assert.equal(discovery.length,4);assert.equal(discovery[1],undefined,'normal search exclusions remain enabled');assert.equal(discovery[2],200,'query results are bounded');
    assert.equal((discovery[0] as {base:string;pattern:string}).base,f.selected);assert.notEqual((discovery[0] as {base:string;pattern:string}).pattern,'**/*');
    f.select(undefined);const selectedReads=f.reads;await f.run('chooseFiles');
    assert.deepEqual(f.items.filter(item=>item.picked).map(item=>item.file).sort(),['src/foo.ts','tests/foo.test.ts']);
    assert.deepEqual(f.messages.at(-1)?.files,['src/foo.ts','tests/foo.test.ts']);assert.equal(f.reads,selectedReads,'cancelling and listing names do not open source contents');
  }finally{await f.close();}
});

test('unchecked selections are removed and accepting no files clears the selection',async()=>{
  const f=await fixture();
  try{
    await f.add('test/source.test.ts');f.select(['source.ts','test/source.test.ts']);await f.run('chooseFiles');
    f.select(['test/source.test.ts']);await f.run('chooseFiles');assert.deepEqual(f.messages.at(-1)?.files,['test/source.test.ts']);
    f.select([]);const reads=f.reads;await f.run('chooseFiles');assert.deepEqual(f.messages.at(-1)?.files,[]);assert.equal(f.reads,reads);
  }finally{await f.close();}
});

test('the picker omits protected/dependency/outside candidates and rejects more than eight before opening contents',async()=>{
  const f=await fixture();
  try{
    for(const file of ['.env','credentials.json','.git/config','node_modules/pkg/index.ts','.vscode-test/extensions/index.js','../outside.ts'])f.list(file);
    const valid=Array.from({length:9},(_,i)=>`src/file-${i}.ts`);for(const file of valid)await f.add(file);
    f.select(valid);const reads=f.reads;await f.run('chooseFiles');
    assert.deepEqual(f.items.map(item=>item.file).sort(),['source.ts',...valid].sort());
    assert.equal(f.reads,reads);assert.deepEqual(f.messages.at(-1)?.files,['source.ts']);assert.match(f.messages.at(-1)?.error??'',/8개/);
    f.select(valid.slice(0,8));await f.run('chooseFiles');assert.equal(f.messages.at(-1)?.files?.length,8);assert.equal(f.messages.at(-1)?.error,'');
  }finally{await f.close();}
});

test('ordinary source folders named build, out, dist or artifacts stay searchable',async()=>{
  const f=await fixture();
  try{
    const files=['src/build.ts','src/build/compiler.ts','src/out/parser.ts','src/dist/index.ts','artifacts/data.ts'];
    for(const file of files)await f.add(file);
    f.select(files);await f.run('chooseFiles');
    assert.deepEqual(f.messages.at(-1)?.files,files);assert.equal(f.messages.at(-1)?.error,'');
  }finally{await f.close();}
});

test('a selected file omitted by workspace search stays visible and can be explicitly removed',async()=>{
  const f=await fixture();
  try{
    f.omitFromSearch('source.ts');f.select(undefined);const reads=f.reads;await f.run('chooseFiles');
    assert.deepEqual(f.items.map(({file,picked})=>({file,picked})),[{file:'source.ts',picked:true}]);
    assert.deepEqual(f.messages.at(-1)?.files,['source.ts']);assert.equal(f.reads,reads);
    f.select([]);await f.run('chooseFiles');assert.deepEqual(f.messages.at(-1)?.files,[]);
    f.select(undefined);await f.run('chooseFiles');assert.equal(f.items[0]?.picked,false,'an open file stays discoverable without staying selected');
  }finally{await f.close();}
});

test('source validation still rejects a submitted binary without replacing the last valid selection',async()=>{
  const f=await fixture();
  try{
    await f.add('image.bin','binary\0content');f.select(['image.bin']);const reads=f.reads;await f.run('chooseFiles');
    assert.deepEqual(f.messages.at(-1)?.files,['source.ts']);assert.equal(f.reads,reads,'invalid source is rejected before opening an editor buffer');
    assert.match(f.messages.at(-1)?.error??'',/UTF-8/);
  }finally{await f.close();}
});

test('removing the selected workspace prevents reads, auth and requests until files are reselected',async()=>{
  const f=await fixture();mock.method(globalThis,'fetch',async()=>assert.fail('Removed workspace must never reach the provider'));
  try{
    assert.deepEqual(f.messages.at(-1)?.files,['source.ts']);const reads=f.reads,pickers=f.pickers;
    f.removeSelected();await f.run('generate','Update the value');
    assert.equal(f.reads,reads,'stale source is not reopened');assert.equal(f.pickers,pickers,'a different folder is not silently substituted');
    assert.deepEqual(f.messages.at(-1)?.files,[]);assert.match(f.messages.at(-1)?.error??'',/작업 폴더가 닫혔어요.*다시 선택/);
    assert.equal(f.messages.at(-1)?.busy,false);assert.equal(await readFile(f.file,'utf8'),f.original);
  }finally{await f.close();}
});

test('removal during model lookup prevents source contents from being sent',async()=>{
  const f=await fixture(),requests:string[]=[];
  mock.method(globalThis,'fetch',async(url:string)=>{
    requests.push(url);assert.equal(url,'https://api.openai.com/v1/models');f.removeSelected();
    return Response.json({models:[{visibility:'list',slug:'test-model',display_name:'Test model'}]});
  });
  try{
    await f.run('generate','Update the value');assert.equal(requests.length,1,'no Responses request carries stale selected code');
    assert.deepEqual(f.messages.at(-1)?.files,[]);assert.match(f.messages.at(-1)?.error??'',/작업 폴더가 닫혔어요/);
    assert.equal(f.messages.at(-1)?.busy,false);
  }finally{await f.close();}
});

test('a still-open selected workspace is reused and its pending request remains cancellable',async()=>{
  const f=await fixture();let reachedProvider!:()=>void;const reached=new Promise<void>(resolve=>reachedProvider=resolve);
  mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    assert.equal(url,'https://api.openai.com/v1/models');reachedProvider();
    return new Promise<Response>((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true}));
  });
  try{
    const pickers=f.pickers,generation=f.run('generate','Update the value');await reached;await f.run('stop');await generation;
    assert.equal(f.pickers,pickers,'valid explicit selections are reused');assert.deepEqual(f.messages.at(-1)?.files,['source.ts']);
    assert.equal(f.messages.at(-1)?.busy,false);assert.equal(f.messages.at(-1)?.error,'');assert.equal(await readFile(f.file,'utf8'),f.original);
  }finally{await f.close();}
});
