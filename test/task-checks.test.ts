import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {TaskChecks,CheckResult} from '../src/task-checks.js';

const bundle=await build({entryPoints:['src/task-checks.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],write:false});
const load=new Function('require','module','exports',bundle.outputFiles[0].text),realRequire=createRequire(import.meta.url);
function fixture(){
  const processListeners=new Set<Function>(),endListeners=new Set<Function>(),stored=new Map<string,string>();
  const listen=(set:Set<Function>)=>(fn:Function)=>{set.add(fn);return {dispose(){set.delete(fn);}};};
  const task={name:'unit tests',source:'Workspace',definition:{type:'shell'},scope:{uri:{fsPath:'/project',toString:()=>'/project'}},execution:{commandLine:'npm test'},isBackground:false,presentationOptions:{reveal:1},group:{id:'test'}};
  let choices=0,pick:'task'|'compare'|'cancel'='task',terminated=0;
  let savePolicy='never';const settingsWrites:unknown[][]=[];let offered:any[]=[];
  const execution={task,terminate(){terminated++;}};
  let start=async()=>execution;
  const vscode={ConfigurationTarget:{Workspace:2,Global:1},workspace:{workspaceFolders:[{}],getConfiguration:()=>({get:()=>savePolicy,async update(...args:unknown[]){settingsWrites.push(args);savePolicy=args[1] as string;}})},TaskGroup:{Test:{id:'test'},Build:{id:'build'}},TaskRevealKind:{Never:3},tasks:{fetchTasks:async()=>[task],onDidEndTaskProcess:listen(processListeners),onDidEndTask:listen(endListeners),executeTask:()=>start()},window:{async showQuickPick(items:any[]){choices++;offered=items;return pick==='cancel'?undefined:pick==='compare'?items.at(-1):items[0];}}};
  const module={exports:{} as any};load((name:string)=>name==='vscode'?vscode:realRequire(name),module,module.exports);
  const checks=new module.exports.TaskChecks({get:(key:string)=>stored.get(key),update:async(key:string,value:string)=>{stored.set(key,value);}}) as TaskChecks;
  return {checks,task,execution,stored,processListeners,endListeners,settingsWrites,get offered(){return offered;},policy(value:string){savePolicy=value;},get choices(){return choices;},get terminated(){return terminated;},pick(value:typeof pick){pick=value;},start(fn:()=>Promise<typeof execution>){start=fn;},process(code?:number,target:unknown=execution){for(const fn of processListeners)fn({execution:target,exitCode:code});},end(){for(const fn of endListeners)fn({execution});},classify:module.exports.completedCheck as (task:string,hash:string,code:number|undefined,time:number,stale:boolean,cancelled:boolean)=>CheckResult};
}
test('exit status, stale evidence and cancellation never collapse into a pass',()=>{
  const f=fixture();assert.equal(f.classify('test','hash',0,1,false,false).status,'passed');assert.equal(f.classify('test','hash',1,1,false,false).status,'failed');assert.equal(f.classify('test','hash',undefined,1,false,false).status,'unknown');assert.equal(f.classify('test','hash',0,1,true,false).status,'stale');assert.equal(f.classify('test','hash',0,1,false,true).status,'cancelled');
});
test('reuse requires the same task definition; Escape does not mean compare or execute',async()=>{
  const f=fixture();assert.equal(await f.checks.select('/project'),f.task);assert.equal(await f.checks.select('/project'),f.task);assert.equal(f.choices,1);
  f.task.execution.commandLine='npm run different-check';f.pick('cancel');assert.equal(await f.checks.select('/project'),undefined);assert.equal(f.choices,2);
  f.pick('compare');assert.equal(await f.checks.select('/project'),'compare');assert.equal(f.stored.size,1);
});
test('first check explicitly sets scoped saving; cancelling or comparing never changes preferences',async()=>{
  const f=fixture();f.policy('always');f.pick('cancel');assert.equal(await f.checks.select('/project'),undefined);assert.equal(f.settingsWrites.length,0);
  f.pick('compare');assert.equal(await f.checks.select('/project'),'compare');assert.equal(f.settingsWrites.length,0);
  f.pick('task');await f.checks.select('/project');assert.match(f.offered[0].detail,/이 작업 공간.*전체 자동 저장/);assert.deepEqual(f.settingsWrites,[['saveBeforeRun','never',2]]);
  const choices=f.choices;await f.checks.select('/project');assert.equal(f.choices,choices,'the acknowledged setting does not require repeated prompts');
});
test('a restored save-all setting blocks launch before unrelated edits can be saved',async()=>{
  const f=fixture();f.policy('always');f.start(async()=>assert.fail('unsafe task launch'));assert.equal((await f.checks.run(f.task as any,'hash',()=>false,()=>{})).status,'error');
});
test('a very fast real task exit can precede the executeTask promise',async()=>{
  const f=fixture(),states:CheckResult[]=[];f.start(async()=>{f.process(0);f.end();return f.execution;});
  const result=await f.checks.run(f.task as any,'hash',()=>false,r=>states.push(r));assert.equal(result.status,'passed');assert.equal(result.exitCode,0);assert.equal(states[0].status,'running');assert.equal(f.task.presentationOptions.reveal,3);assert.equal(f.processListeners.size,0);assert.equal(f.endListeners.size,0);
});
test('unrelated task exits are ignored and cancellation terminates only the owned execution',async()=>{
  const f=fixture();let done=false;
  const run=f.checks.run(f.task as any,'hash',()=>false,()=>{}).then(result=>{done=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));f.process(0,{task:{name:'other'}});await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);
  f.checks.cancel();assert.equal((await run).status,'cancelled');assert.equal(f.terminated,1);assert.equal(f.processListeners.size,0);
});
test('cancellation during launch terminates the late execution and cannot become a pass',async()=>{
  const f=fixture();let launch!:(value:typeof f.execution)=>void;f.start(()=>new Promise(resolve=>launch=resolve));
  const run=f.checks.run(f.task as any,'hash',()=>false,()=>{});f.checks.cancel();launch(f.execution);assert.equal((await run).status,'cancelled');assert.equal(f.terminated,1);
});
test('changing source while a task runs invalidates even its zero exit',async()=>{
  const f=fixture();let stale=false;const run=f.checks.run(f.task as any,'hash',()=>stale,()=>{});await new Promise(resolve=>setImmediate(resolve));stale=true;f.process(0);assert.equal((await run).status,'stale');
});
test('tasks without a process exit stay unknown and launch errors stay errors',async()=>{
  const f=fixture();f.start(async()=>{f.end();return f.execution;});assert.equal((await f.checks.run(f.task as any,'hash',()=>false,()=>{})).status,'unknown');
  f.start(async()=>{throw Error('private command arguments');});const failed=await f.checks.run(f.task as any,'hash',()=>false,()=>{});assert.equal(failed.status,'error');assert.ok(!JSON.stringify(failed).includes('private command'));
});
