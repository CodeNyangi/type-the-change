import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {stat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const exec=promisify(execFile);
export interface ChangedPath {path:string;status:string;conflict:boolean;unsaved?:boolean;previousPath?:string}
export interface Worktree {
  path:string;branch:string;head:string;current:boolean;unavailable?:boolean;
  changes?:ChangedPath[];updatedAt?:number;error?:boolean;overlap?:number;fingerprint?:string;
  changeCount?:number;conflictCount?:number;unsavedCount?:number;groups?:{name:string;count:number}[];
}
export interface WorkspaceOverview {root:string;canonicalRoot?:string;worktrees:Worktree[];updatedAt:number;refreshing?:boolean;newChanges?:boolean}
export type GitRunner=(cwd:string,args:string[],signal?:AbortSignal)=>Promise<string>;
export const git:GitRunner=async(cwd,args,signal)=>{
  const result=await exec('git',['--no-optional-locks','-c','core.fsmonitor=false',...args],{
    cwd,signal,timeout:5000,maxBuffer:4*1024*1024,encoding:'utf8',windowsHide:true,
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'},
  });return result.stdout;
};

export function parseWorktrees(output:string,cwd:string):Worktree[]{
  const trees:Worktree[]=[];let current:Worktree|undefined;
  for(const field of output.split('\0')){
    if(field.startsWith('worktree ')){
      current={path:field.slice(9),branch:'',head:'',current:false};trees.push(current);
    }else if(current){
      if(field.startsWith('HEAD '))current.head=field.slice(5);
      else if(field.startsWith('branch '))current.branch=field.slice(7).replace(/^refs\/heads\//,'');
      else if(field==='detached')current.branch='';
      else if(field==='bare'||field.startsWith('prunable'))current.unavailable=true;
    }
  }
  // Prefer the deepest containing worktree, including a project opened below its root.
  const active=trees.filter(tree=>inside(tree.path,cwd)).sort((a,b)=>b.path.length-a.path.length)[0];
  if(active)active.current=true;
  return trees;
}
function inside(root:string,file:string){const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function workspaceFingerprint(value:WorkspaceOverview|undefined){return value?createHash('sha256').update(JSON.stringify(value.worktrees.map(tree=>[tree.path,tree.branch,tree.head,tree.fingerprint,!!tree.error]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex'):undefined;}
export function parseChanges(output:string):ChangedPath[]{
  const fields=output.split('\0'),changes:ChangedPath[]=[];
  for(let i=0;i<fields.length;i++){
    const field=fields[i];if(field.length<4)continue;
    const status=field.slice(0,2),file=field.slice(3);
    // Porcelain -z lists the destination first, then the original rename/copy path.
    const previousPath=/[RC]/.test(status)?fields[++i]:undefined;
    if(!file||file.includes('\0')||path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))continue;
    changes.push({path:file,status,conflict:status.includes('U')||status==='AA'||status==='DD',...(previousPath?{previousPath}:{})});
  }return changes;
}
export function markOverlap(trees:Worktree[]){
  const counts=new Map<string,number>();
  for(const tree of trees)if(!tree.error)for(const change of tree.changes||[])counts.set(change.path,(counts.get(change.path)||0)+1);
  for(const tree of trees)tree.overlap=tree.changes?.filter(change=>(counts.get(change.path)||0)>1).length||0;
}
export function summarizeWorkspace(value:WorkspaceOverview,dirtyFiles:string[]=[]):WorkspaceOverview{
  const trees=value.worktrees.map(tree=>({...tree,changes:tree.changes?.map(change=>({...change}))}));
  for(const dirtyFile of dirtyFiles){
    const file=value.canonicalRoot&&inside(value.root,dirtyFile)?path.join(value.canonicalRoot,path.relative(value.root,dirtyFile)):dirtyFile;
    const tree=trees.filter(tree=>inside(tree.path,file)).sort((a,b)=>b.path.length-a.path.length)[0];if(!tree?.changes)continue;
    const relative=path.relative(tree.path,file),existing=tree.changes.find(change=>change.path===relative);
    if(existing)existing.unsaved=true;else tree.changes.push({path:relative,status:' M',conflict:false,unsaved:true});
  }
  markOverlap(trees);
  for(const tree of trees){
    if(!tree.changes)continue;
    tree.changeCount=tree.changes.length;tree.conflictCount=tree.changes.filter(change=>change.conflict).length;
    tree.unsavedCount=tree.changes.filter(change=>change.unsaved).length;
    const groups=new Map<string,number>();
    for(const change of tree.changes){const directory=change.path.split('/');const group=directory.length>1?directory[0]+'/':'.';groups.set(group,(groups.get(group)||0)+1);}
    tree.groups=[...groups].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count}));
    tree.changes=tree.changes.slice(0,8);delete tree.fingerprint;
  }
  return {...value,worktrees:trees};
}
export async function readWorktree(tree:Worktree,run:GitRunner=git,signal?:AbortSignal,allFiles=false):Promise<Worktree>{
  if(tree.unavailable)return {...tree,error:true};
  try{
    const [status,head,branch]=await Promise.all([
      run(tree.path,['status','--porcelain=v1','-z',allFiles?'--untracked-files=all':'--untracked-files=normal'],signal),
      run(tree.path,['rev-parse','--verify','HEAD'],signal).catch(error=>{if(error?.code===128&&!signal?.aborted)return '';throw error;}),
      run(tree.path,['symbolic-ref','--quiet','--short','HEAD'],signal).catch(error=>{if(error?.code===1&&!signal?.aborted)return '';throw error;}),
    ]);
    signal?.throwIfAborted();const changes=parseChanges(status),hash=createHash('sha256').update(status).update(head).update(branch);
    // Detect edits to an already-modified path without reading source contents.
    // Bound filesystem work; the counts above still include the complete status.
    for(let i=0;i<Math.min(changes.length,200);i+=20){
      const metadata=await Promise.all(changes.slice(i,i+20).map(async change=>{
        try{const info=await stat(path.join(tree.path,change.path));return [change.path,info.size,info.mtimeMs];}catch{return [change.path,'missing'];}
      }));hash.update(JSON.stringify(metadata));
    }
    return {...tree,head:head.trim(),branch:branch.trim(),changes,error:false,updatedAt:Date.now(),fingerprint:hash.digest('hex')};
  }catch(error){if(signal?.aborted)throw error;return {...tree,error:true,updatedAt:Date.now()};}
}

/** One scan at a time; large worktree sets rotate in bounded batches. */
export class WorktreeTracker {
  value:WorkspaceOverview|undefined;
  private root:string|undefined;
  private timer:NodeJS.Timeout|undefined;
  private controller:AbortController|undefined;
  private running=false;
  private again=false;
  private cursor=0;
  private enabled=false;
  private stopped=false;
  private seenFingerprint:string|undefined;
  constructor(private changed:(value:WorkspaceOverview|undefined)=>void,private run:GitRunner=git){}
  track(root:string|undefined,visible:boolean){
    if(this.stopped)return;
    const reset=this.root!==root;this.enabled=visible;this.root=root;
    if(reset){this.controller?.abort();this.value=undefined;this.cursor=0;this.seenFingerprint=undefined;this.changed(undefined);}
    if(root&&visible&&(reset||!this.timer&&!this.running))this.refresh();
    if(!visible){clearTimeout(this.timer);this.timer=undefined;}
  }
  acknowledge(){this.seenFingerprint=workspaceFingerprint(this.value);if(this.value?.newChanges){this.value.newChanges=false;this.changed(this.value);}}
  refresh(){
    if(this.stopped||!this.root)return;
    clearTimeout(this.timer);this.timer=undefined;
    if(this.running){this.again=true;return;}
    void this.scan();
  }
  private async scan(){
    const root=this.root!;this.running=true;this.again=false;const controller=new AbortController();this.controller=controller;
    try{
      const canonicalRoot=await realpath(root).catch(()=>root);
      const list=parseWorktrees(await this.run(root,['worktree','list','--porcelain','-z'],controller.signal),canonicalRoot);
      const previous=this.value,cache=new Map(previous?.worktrees.map(tree=>[tree.path,tree]));
      const trees=list.map(tree=>({...cache.get(tree.path),...tree}));
      const active=trees.find(tree=>tree.current),others=trees.filter(tree=>!tree.current);
      const batch=[...(active?[active]:[]),...others.slice(this.cursor,this.cursor+11)];
      this.cursor=this.cursor+11>=others.length?0:this.cursor+11;
      this.value={root,canonicalRoot,worktrees:trees,updatedAt:previous?.updatedAt||Date.now(),refreshing:true,newChanges:previous?.newChanges};
      let index=0;
      const worker=async()=>{while(index<batch.length){const tree=batch[index++];const updated=await readWorktree(tree,this.run,controller.signal);controller.signal.throwIfAborted();Object.assign(tree,updated);}};
      await Promise.all([worker(),worker()]);controller.signal.throwIfAborted();
      const fingerprint=workspaceFingerprint(this.value);
      if(!this.seenFingerprint)this.seenFingerprint=fingerprint;
      this.value={root,canonicalRoot,worktrees:trees,updatedAt:Date.now(),refreshing:false,newChanges:!!fingerprint&&fingerprint!==this.seenFingerprint};
      markOverlap(trees);this.changed(this.value);
    }catch{if(!controller.signal.aborted){this.value=undefined;this.changed(undefined);}}
    finally{
      this.running=false;if(this.controller===controller)this.controller=undefined;
      if(!this.stopped&&this.root&&(this.enabled||this.again))this.timer=setTimeout(()=>{this.timer=undefined;this.refresh();},this.again?200:3000);
    }
  }
  dispose(){this.stopped=true;this.enabled=false;clearTimeout(this.timer);this.controller?.abort();}
}
