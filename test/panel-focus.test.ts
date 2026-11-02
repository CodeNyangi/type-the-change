import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {GuidePanel} from '../src/panel.js';

const bundled=await build({entryPoints:['src/panel.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',external:['vscode'],write:false});
const loadPanel=new Function('require','module','exports',bundled.outputFiles[0].text),realRequire=createRequire(import.meta.url);
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return {promise,resolve};}
function fixture(){
  const messages:any[]=[],commands:string[]=[];let receive:(value:unknown)=>void=()=>{},dispose=()=>{};
  const commandReached=deferred(),focusPosted=deferred();let commandGate:Promise<void>|undefined;
  let autoRender=true;
  const vscode={ViewColumn:{One:1,Two:2,Beside:-2},
    commands:{async executeCommand(name:string){commands.push(name);commandReached.resolve();await commandGate;}},
    window:{createWebviewPanel(){return {viewColumn:2,reveal(_column:number,preserveFocus:boolean){assert.equal(preserveFocus,true);},dispose(){dispose();},onDidDispose(fn:()=>void){dispose=fn;},webview:{html:'',onDidReceiveMessage(fn:(value:unknown)=>void){receive=fn;},async postMessage(value:any){messages.push(value);if(!value.type&&autoRender)queueMicrotask(()=>receive({command:'rendered',revision:value.revision}));if(value.type==='focusStep')focusPosted.resolve();return true;}}};}},
  };
  const module={exports:{} as {GuidePanel:typeof GuidePanel}};
  loadPanel((name:string)=>name==='vscode'?vscode:realRequire(name),module,module.exports);
  const panel=new module.exports.GuidePanel(()=>assert.fail('internal acknowledgments cannot invoke a product command'));
  panel.update({file:'source.ts',step:1,judgment:{phase:'predict',prediction:'',evidence:''}});
  return {panel,messages,commands,commandReached,focusPosted,receive:(value:unknown)=>receive(value),pauseRender(){autoRender=false;},gateCommand(promise:Promise<void>){commandGate=promise;}};
}

test('guide focus completes only after the rendered view acknowledges focus, and ready never replays it',async()=>{
  const f=fixture();let completed=false;
  try{
    const focusing=f.panel.focusStep().then(()=>{completed=true;});await f.focusPosted.promise;
    assert.equal(completed,false,'returning from a workbench command is not iframe focus completion');
    const request=f.messages.at(-1).request;f.receive({command:'focused',request:request-1});assert.equal(completed,false);
    f.receive({command:'focused',request});await focusing;
    await f.panel.prepareSourceFocus();f.panel.releaseFocus();
    const count=f.messages.filter(message=>message.type==='focusStep').length;
    f.receive({command:'ready'});f.receive({command:'focused'});
    assert.equal(f.messages.filter(message=>message.type==='focusStep').length,count,'a late ready cannot steal focus back from native code');
  }finally{f.panel.dispose();}
});

test('returning to code cancels an earlier guide handoff still awaiting the workbench',async()=>{
  const f=fixture(),gate=deferred();f.gateCommand(gate.promise);
  try{
    const focusing=f.panel.focusStep();await f.commandReached.promise;
    await f.panel.prepareSourceFocus();gate.resolve();await focusing;
    assert.equal(f.messages.some(message=>message.type==='focusStep'),false,'the obsolete request cannot focus the iframe after code resumes');
  }finally{gate.resolve();f.panel.dispose();}
});

test('native handoff waits for queued state updates to render and closing the panel releases the wait',async()=>{
  const f=fixture();f.panel.show(true);f.pauseRender();let prepared=false;
  try{
    const preparing=f.panel.prepareSourceFocus().then(()=>{prepared=true;});await Promise.resolve();
    assert.equal(prepared,false);assert.equal(f.messages.at(-1).handoff,true);
    f.receive({command:'rendered',revision:f.messages.at(-1).revision});await preparing;
    const closing=f.panel.prepareSourceFocus();f.panel.dispose();await closing;
  }finally{f.panel.dispose();}
});
