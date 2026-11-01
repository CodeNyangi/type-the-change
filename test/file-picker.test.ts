import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const bundle=await build({entryPoints:['src/file-picker.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],write:false});
const load=new Function('require','module','exports',bundle.outputFiles[0].text),realRequire=createRequire(import.meta.url);
function fixture(){
  const callbacks:Record<string,Function>={},calls:{pattern:string;limit:number;token:{cancelled:boolean};resolve:(items:unknown[])=>void}[]=[];
  const listener=(name:string)=>(fn:Function)=>{callbacks[name]=fn;return {dispose(){}};};
  const picker={items:[] as {file:string}[],selectedItems:[] as {file:string}[],busy:false,title:'',onDidChangeValue:listener('query'),onDidChangeSelection:listener('select'),onDidAccept:listener('accept'),onDidHide:listener('hide'),show(){},dispose(){}};
  const uri=(file:string)=>({scheme:'file',fsPath:'/project/'+file});
  const vscode={window:{createQuickPick:()=>picker,activeTextEditor:{document:{uri:uri('opened.ts')}}},extensions:{getExtension:()=>({isActive:true,exports:{getAPI:()=>({repositories:[{state:{workingTreeChanges:[{uri:uri('changed.ts')}],indexChanges:[]}}]})}})},workspace:{textDocuments:[],findFiles(pattern:{pattern:string},exclude:unknown,limit:number,token:{cancelled:boolean}){assert.equal(exclude,undefined);return new Promise(resolve=>calls.push({pattern:pattern.pattern,limit,token,resolve}));}},RelativePattern:class{constructor(readonly base:string,readonly pattern:string){}},CancellationTokenSource:class{token={cancelled:false};cancel(){this.token.cancelled=true;}dispose(){}}};
  const module={exports:{} as any};load((name:string)=>name==='vscode'?vscode:realRequire(name),module,module.exports);
  return {picker,calls,callbacks,uri,pick:module.exports.pickFiles as (root:string,previous:string[],name:string)=>Promise<string[]|undefined>,pattern:module.exports.fileSearchPattern as (query:string)=>string};
}
const delay=()=>new Promise(resolve=>setTimeout(resolve,180));
test('opening a picker does no repository search; only selected, open and Git-changed names appear',async()=>{
  const f=fixture(),pending=f.pick('/project',['selected.ts'],'Project');assert.equal(f.calls.length,0);assert.deepEqual(f.picker.items.map(item=>item.file),['selected.ts','opened.ts','changed.ts']);f.callbacks.hide();assert.equal(await pending,undefined);
});
test('bounded searches cancel superseded requests and do not lose cross-query selections',async()=>{
  const f=fixture(),pending=f.pick('/project',[],'Project');f.callbacks.query('old');await delay();assert.equal(f.calls[0].limit,200);
  f.callbacks.query('new');await delay();assert.equal(f.calls[0].token.cancelled,true);f.calls[1].resolve([f.uri('new.ts')]);await new Promise(resolve=>setImmediate(resolve));
  f.callbacks.select([f.picker.items[0]]);f.calls[0].resolve([f.uri('old.ts')]);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.picker.items.map(item=>item.file),['new.ts']);
  f.callbacks.query('later');await delay();f.calls[2].resolve(Array.from({length:200},(_,i)=>f.uri(`later-${i}.ts`)));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.picker.items.length,201,'200 results plus an explicitly pinned prior selection');assert.match(f.picker.title,/200개/);
  f.callbacks.select([f.picker.items[0],f.picker.items[200]]);f.callbacks.accept();assert.deepEqual(await pending,['new.ts','later-199.ts']);
});
test('clearing a query restores useful recent files without an eager catch-all search',async()=>{
  const f=fixture(),pending=f.pick('/project',[],'Project');f.callbacks.query('something');f.callbacks.query('');await delay();assert.equal(f.calls.length,0);assert.deepEqual(f.picker.items.map(item=>item.file),['opened.ts','changed.ts']);f.callbacks.accept();assert.deepEqual(await pending,[]);
});
test('file queries escape glob syntax and preserve Korean paths',()=>{
  const f=fixture();assert.equal(f.pattern('SRC/가격.ts'),'**/*[sS][rR][cC]/가격.[tT][sS]*');assert.equal(f.pattern('*?[]{}'),'**/*[*][?][[][]][{][}]*');
});
