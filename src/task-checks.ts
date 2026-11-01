import * as vscode from 'vscode';
import * as path from 'node:path';
import {createHash} from 'node:crypto';

export interface CheckResult {
  task:string;status:'running'|'passed'|'failed'|'unknown'|'cancelled'|'stale'|'error';
  sourceHash:string;exitCode?:number;durationMs:number;details:string[];
}
export function completedCheck(task:string,sourceHash:string,exitCode:number|undefined,durationMs:number,stale:boolean,cancelled:boolean):CheckResult {
  return {task,sourceHash,exitCode,durationMs,details:[],status:cancelled?'cancelled':stale?'stale':exitCode===0?'passed':exitCode===undefined?'unknown':'failed'};
}
function fingerprint(task:vscode.Task):string {
  const execution=task.execution;
  return createHash('sha256').update(JSON.stringify({name:task.name,source:task.source,scope:typeof task.scope==='object'?task.scope.uri.toString():task.scope,definition:task.definition,execution})).digest('hex');
}

/** Uses VS Code's task runner so workspace variables, dependencies and problem
 * matchers keep their existing meaning. No command comes from a model or plan. */
export class TaskChecks implements vscode.Disposable {
  private running?:{execution?:vscode.TaskExecution;cancelled:boolean;finish:()=>void};
  private choices=new Map<string,string>();
  constructor(private readonly storage:vscode.Memento){}
  private key(root:string){return 'typeTheChange.check.'+createHash('sha256').update(root).digest('hex');}
  private async candidates(root:string){
    return (await vscode.tasks.fetchTasks()).filter(task=>!task.isBackground&&!!task.execution&&(typeof task.scope!=='object'||path.resolve(task.scope.uri.fsPath)===path.resolve(root)));
  }
  async select(root:string,force=false,demo?:vscode.Task):Promise<vscode.Task|'compare'|undefined>{
    if(demo)return demo;
    const tasks=await this.candidates(root),key=this.key(root),saved=this.choices.get(key)??this.storage.get<string>(key);
    const previous=tasks.find(task=>fingerprint(task)===saved);
    if(previous&&!force)return previous;
    const items=tasks.sort((a,b)=>Number(b.group?.id===vscode.TaskGroup.Test.id)-Number(a.group?.id===vscode.TaskGroup.Test.id)).map(task=>({label:task.name,description:task.source,detail:task.group?.id===vscode.TaskGroup.Test.id?'테스트':task.group?.id===vscode.TaskGroup.Build.id?'빌드':undefined,task}));
    const selected=await vscode.window.showQuickPick([...items,{label:'검사 없이 비교',description:'이번 변경은 직접 근거 확인',detail:undefined,task:undefined}],{title:'저장하고 실행할 검사',placeHolder:tasks.length?'처음 한 번 선택 · 다음부터 같은 검사 실행':'설정된 검사가 없어요 · VS Code Tasks에서 추가할 수 있어요'});
    if(!selected?.task)return selected?'compare':undefined;
    const id=fingerprint(selected.task);this.choices.set(key,id);await this.storage.update(key,id);return selected.task;
  }
  cancel(){
    const running=this.running;if(!running)return;
    running.cancelled=true;running.execution?.terminate();running.finish();
  }
  dispose(){this.cancel();}
  async run(task:vscode.Task,hash:string,isStale:()=>boolean,report:(result:CheckResult)=>void):Promise<CheckResult>{
    if(this.running)throw Error('검사가 이미 실행 중이에요.');
    const start=Date.now();let execution:vscode.TaskExecution|undefined,code:number|undefined,ended=false;
    let settle!:()=>void,timer:NodeJS.Timeout|undefined;
    const finished=new Promise<void>(resolve=>settle=resolve),early=new Map<vscode.TaskExecution,{process?:boolean;code?:number;ended?:boolean}>();
    const running={execution:undefined as vscode.TaskExecution|undefined,cancelled:false,finish:settle};this.running=running;
    const processEnd=(event:vscode.TaskProcessEndEvent)=>{
      if(!execution){if(early.size<64)early.set(event.execution,{...early.get(event.execution),process:true,code:event.exitCode});return;}
      if(event.execution===execution){code=event.exitCode;ended=true;settle();}
    };
    const taskEnd=(event:vscode.TaskEndEvent)=>{
      if(!execution){if(early.size<64)early.set(event.execution,{...early.get(event.execution),ended:true});return;}
      if(event.execution===execution&&!ended)timer=setTimeout(settle,100);
    };
    const subscriptions=[vscode.tasks.onDidEndTaskProcess(processEnd),vscode.tasks.onDidEndTask(taskEnd)];
    report({task:task.name,status:'running',sourceHash:hash,durationMs:0,details:[]});
    try{
      // Mutating the fetched task's presentation does not rewrite tasks.json and
      // preserves provider-owned task dependencies and execution semantics.
      task.presentationOptions={...task.presentationOptions,reveal:vscode.TaskRevealKind.Never,focus:false,showReuseMessage:false};
      execution=await vscode.tasks.executeTask(task);running.execution=execution;
      if(running.cancelled)execution.terminate();
      const event=early.get(execution);if(event?.process){code=event.code;ended=true;settle();}else if(event?.ended)timer=setTimeout(settle,100);
      early.clear();await finished;
      return completedCheck(task.name,hash,code,Date.now()-start,isStale(),running.cancelled);
    }catch{
      return {task:task.name,status:running.cancelled?'cancelled':'error',sourceHash:hash,durationMs:Date.now()-start,details:['검사를 시작하지 못했어요. VS Code의 작업 설정을 확인하세요.']};
    }finally{clearTimeout(timer);for(const subscription of subscriptions)subscription.dispose();if(this.running===running)this.running=undefined;}
  }
}
