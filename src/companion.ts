import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {CodexObserver,ObserverError,threadSummary,activityItem,type CodexThread,type ActivityItem} from './codex-observer.js';
import {CodexEvents,type CodexEvent} from './codex-events.js';
import {git,parseWorktrees,readWorktree,type Worktree,type GitRunner} from './worktrees.js';
import {loadChange,parseHunks,hunkAtLine,type ChangeReview,type EditorComparison} from './change-review.js';
import {editContext,isLearningCode} from './learning-context.js';
import {readLesson,verifyLesson,type VerifiedLesson} from './lesson.js';
export interface CompanionState {
 threads:CodexThread[];selected?:CodexThread;items:ActivityItem[];mode:'connecting'|'history'|'shared';
 loading:boolean;error?:string;updatedAt?:number;live?:CodexEvent;nextThreads?:string;nextItems?:string;gap?:boolean;
 roots:Worktree[];root?:string;rootSource?:'chat'|'activity'|'choice';ambiguous?:boolean;tree?:Worktree;worktreeError?:boolean;
 review?:ChangeReview;hunk:number;practice?:'editing'|'matched'|'different';hooks?:'ready'|'review';
 reviewContext?:{turnId:string;request?:string;response?:string;nearby?:string;loading:boolean};
 learningSearch?:'searching'|'empty';
 lesson?:VerifiedLesson;lessonStatus?:'checking'|'missing'|'unverified';
 editHistory?:ActivityItem[];editsLoaded?:boolean;editsLoading?:boolean;nextEdits?:string;editsError?:boolean;
 editor?:{file:string;outside:boolean;error?:boolean};reviewOpened?:boolean;
}
export function inside(root:string,file:string){const rel=path.relative(root,file);return !path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);}
export async function chooseWorktree(thread:CodexThread,items:ActivityItem[],roots:Worktree[],manual?:string,live?:CodexEvent){
 const canonical=async(p:string)=>realpath(p).catch(()=>p);
 const match=(p:string)=>roots.filter(r=>!r.unavailable&&inside(r.path,p)).sort((a,b)=>b.path.length-a.path.length)[0]?.path;
 if(manual)return roots.some(r=>r.path===manual&&!r.unavailable)?{root:manual,source:'choice' as const}:{ambiguous:true};
 // A current event is stronger than the original chat directory. Only accept
 // directories confirmed by this repository's own worktree inventory.
 if(live?.toolCwd&&Date.now()-live.at<120000){const found=match(await canonical(live.toolCwd));if(found)return {root:found,source:'activity' as const};}
 const cwd=match(await canonical(thread.cwd));
 const observed=new Set<string>();
 for(const item of items){
  if(item.cwd){const found=match(await canonical(item.cwd));if(found)observed.add(found);}
  for(const file of item.paths??[])if(path.isAbsolute(file)){const found=match(await canonical(file));if(found)observed.add(found);}
 }
 const other=[...observed].filter(root=>root!==cwd);
 if(other.length>1)return {ambiguous:true};
 if(other.length===1)return {root:other[0],source:'activity' as const};
 return {root:cwd,source:'chat' as const};
}
export class Companion {
 state:CompanionState={threads:[],items:[],mode:'connecting',loading:true,roots:[],hunk:0};
 readonly events:CodexEvents;
 private client?:CodexObserver;private epoch=0;private timer?:NodeJS.Timeout;private visible=false;private running=false;private again=false;private disposed=false;
 private selected?:string;private manual?:string;private listAt=0;private rootAt=0;private itemIds=new Set<string>();private reviewEpoch=0;
 private legacyHistory=false;private lessonKey='';private editsEpoch=0;private followKey='';private followEpoch=0;private comparisonKey?:string;
 constructor(private factory:()=>Promise<CodexObserver>,private changed:(state:CompanionState)=>void,private run:GitRunner=git,private dirty:(root:string,file:string)=>string|undefined=()=>undefined,private dirtyPaths:()=>string[]=()=>[]){
  this.events=new CodexEvents(event=>{if(event.threadId===this.selected){this.state.live=event;this.state.hooks='ready';this.emit();this.refresh();}});
  void this.events.start().catch(()=>{});
 }
 private emit(){if(!this.disposed)this.changed(this.state);}
 track(visible:boolean){this.visible=visible;clearTimeout(this.timer);if(visible)this.refresh();}
 select(id:string,manual?:string){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return;
  this.epoch++;this.reviewEpoch++;this.followKey='';this.selected=id;this.manual=manual;this.rootAt=0;this.itemIds.clear();this.legacyHistory=false;this.lessonKey='';
  this.state={...this.state,selected:this.state.threads.find(t=>t.id===id),items:[],nextItems:undefined,roots:[],root:undefined,tree:undefined,review:undefined,reviewContext:undefined,learningSearch:undefined,lesson:undefined,lessonStatus:undefined,hunk:0,practice:undefined,editor:undefined,reviewOpened:false,live:this.events.latest.get(id),error:undefined,loading:true,gap:false,updatedAt:undefined,editHistory:[],editsLoaded:false,editsLoading:false,nextEdits:undefined,editsError:false};this.emit();this.refresh();
 }
 chooseRoot(root:string){if(!this.state.roots.some(r=>r.path===root&&!r.unavailable))return;this.epoch++;this.manual=root;this.state.root=root;this.state.rootSource='choice';this.state.ambiguous=false;this.state.review=undefined;this.state.reviewContext=undefined;this.state.learningSearch=undefined;this.state.editor=undefined;this.followKey='';this.reviewEpoch++;this.state.tree=undefined;this.resetEdits();this.rootAt=0;this.emit();this.refresh();}
 private resetEdits(){this.editsEpoch++;this.state.editHistory=[];this.state.editsLoaded=false;this.state.editsLoading=false;this.state.nextEdits=undefined;this.state.editsError=false;}
 refresh(){if(this.disposed)return;clearTimeout(this.timer);if(this.running){this.again=true;return;}void this.scan();}
 reconnect(){this.epoch++;this.client?.dispose();this.client=undefined;this.listAt=0;this.state.mode='connecting';this.refresh();}
 refreshChats(){this.listAt=0;this.rootAt=0;this.state.threads=[];this.state.nextThreads=undefined;this.state.loading=true;this.emit();this.refresh();}
 private async pageItems(threadId:string,cursor?:string){
  if(!this.legacyHistory)try{return await this.client!.read('thread/items/list',{threadId,limit:50,sortDirection:'desc',...(cursor?{cursor}:{})});}catch(e){
   if(!(e instanceof ObserverError)||e.code!=='protocol'||! /unsupported|not supported|pagination|unknown method|frame too large/i.test(e.message))throw e;
   if(threadId!==this.selected)throw new ObserverError('connection');
   this.legacyHistory=true;
  }
  const result=await this.client!.read('thread/turns/list',{threadId,limit:1,itemsView:'summary',sortDirection:'desc',...(cursor?{cursor}:{})});
  return {...result,data:(result.data??[]).flatMap((turn:any)=>(turn.items??[]).map((item:any)=>({...item,turnId:turn.id}))).reverse()};
 }
 async listMore(){
  const cursor=this.state.nextThreads;if(!cursor||!this.client)return;
  const result=await this.client.read('thread/list',{cursor,limit:30,sortKey:'updated_at',modelProviders:[],sourceKinds:['cli','vscode','appServer','exec','unknown'],useStateDbOnly:true});if(this.disposed)return;
  const map=new Map(this.state.threads.map(t=>[t.id,t]));for(const r of result.data??[]){const t=threadSummary(r);if(t)map.set(t.id,t);}
  this.state.threads=[...map.values()].slice(0,180);this.state.nextThreads=result.nextCursor||undefined;this.emit();
 }
 async older(){
  if(!this.client||!this.selected||!this.state.nextItems)return;const epoch=this.epoch;
  const result=await this.pageItems(this.selected,this.state.nextItems);if(epoch!==this.epoch||this.disposed)return;
  const items=(result.data??[]).map(activityItem).filter(Boolean) as ActivityItem[];const present=new Set(this.state.items.map(i=>i.id));
  this.state.items=[...items.reverse().filter(i=>!present.has(i.id)),...this.state.items].slice(-300);this.state.nextItems=result.nextCursor||undefined;
  this.rootAt=0;this.emit();this.refresh();
 }
 async olderEdits(){
  const root=this.state.root,thread=this.selected,epoch=this.epoch,revision=this.editsEpoch;
  if(!root||!thread||!this.client||this.state.editsLoading)return;
  let cursor=this.state.editsLoaded?this.state.nextEdits:this.state.nextItems;
  if(!cursor)return;
  this.state.editsLoading=true;this.state.editsError=false;this.emit();
  try{
   // Search a bounded number of history pages for actual edits, independently
   // of the live activity window. A long run of commands must not hide edits.
   const seen=new Set<string>();
   for(let page=0;page<8&&cursor&&!seen.has(cursor);page++){
    seen.add(cursor);const result=await this.pageItems(thread,cursor);
    if(epoch!==this.epoch||revision!==this.editsEpoch||root!==this.state.root||this.disposed)return;
    const registered=this.state.roots.filter(tree=>!tree.unavailable).map(tree=>tree.path);if(!registered.length)registered.push(root);
    const edits=((result.data??[]).map(activityItem).filter(Boolean) as ActivityItem[]).filter(item=>item.kind==='change'&&item.diffs?.some(change=>registered.some(tree=>inside(tree,path.resolve(root,change.path)))));
    cursor=result.nextCursor||undefined;this.state.editsLoaded=true;this.state.nextEdits=cursor&&!seen.has(cursor)?cursor:undefined;
    if(edits.length){
     const ids=new Set(edits.map(item=>item.id));
     this.state.editHistory=[...edits.reverse(),...(this.state.editHistory??[]).filter(item=>!ids.has(item.id))].slice(0,100);
     break;
    }
   }
  }catch{if(epoch===this.epoch&&revision===this.editsEpoch&&root===this.state.root&&!this.disposed)this.state.editsError=true;}
  finally{if(epoch===this.epoch&&revision===this.editsEpoch&&root===this.state.root&&!this.disposed){this.state.editsLoading=false;this.emit();}}
 }
 private async scan(){
  this.running=true;this.again=false;const epoch=this.epoch;let phase='codex';
  try{
   if(!this.client)this.client=await this.factory();await this.client.start();if(this.disposed)return;
   this.state.mode=this.client.mode;
   if(Date.now()-this.listAt>10000){
    const result=await this.client.read('thread/list',{limit:30,sortKey:'updated_at',modelProviders:[],sourceKinds:['cli','vscode','appServer','exec','unknown'],useStateDbOnly:true});
    if(this.disposed)return;const latest=(result.data??[]).map(threadSummary).filter(Boolean) as CodexThread[];const ids=new Set(latest.map(t=>t.id));
    this.state.threads=(result.nextCursor?[...latest,...this.state.threads.filter(t=>!ids.has(t.id))]:latest).slice(0,180);this.state.nextThreads=result.nextCursor||undefined;this.listAt=Date.now();if(!this.selected)this.state.loading=false;this.state.error=undefined;this.emit();
   }
   if(!this.selected||epoch!==this.epoch)return;
   const meta=await this.client.read('thread/read',{threadId:this.selected,includeTurns:false});if(epoch!==this.epoch||this.disposed)return;
   const thread=threadSummary(meta.thread);if(!thread||thread.id!==this.selected)throw Error('Codex returned an invalid chat');this.state.selected=thread;
   const fetched:ActivityItem[]=[];let cursor:string|undefined;let found=false;let oldest:string|undefined;
   for(let page=0;page<5;page++){
    const response=await this.pageItems(thread.id,cursor);if(epoch!==this.epoch||this.disposed)return;
    for(const raw of response.data??[]){const item=activityItem(raw);if(item){if(this.itemIds.has(item.id))found=true;fetched.push(item);}}
    cursor=response.nextCursor||undefined;oldest=cursor;
    // The first page includes mutable items; later pages only bridge a gap.
    if(found||!cursor||this.itemIds.size===0&&fetched.some(i=>i.kind==='assistant'))break;
   }
   if(epoch!==this.epoch)return;
   const ids=new Set(fetched.map(i=>i.id));this.state.items=[...this.state.items.filter(i=>!ids.has(i.id)),...fetched.reverse()].slice(-300);
   this.itemIds=new Set(this.state.items.map(i=>i.id));if(!this.state.nextItems)this.state.nextItems=oldest;

   this.state.gap=!!cursor&&!found&&this.state.items.length>=250;
   this.state.live=this.events.latest.get(thread.id);this.state.updatedAt=Date.now();this.state.error=undefined;this.state.loading=false;this.emit();
   phase='git';
   if(Date.now()-this.rootAt>10000){
    const canonical=await realpath(thread.cwd).catch(()=>thread.cwd);
    const roots=await Promise.all(parseWorktrees(await this.run(thread.cwd,['worktree','list','--porcelain','-z']),canonical).map(async r=>({...r,path:await realpath(r.path).catch(()=>r.path)})));
    if(epoch!==this.epoch||this.disposed)return;
    const chosen=await chooseWorktree(thread,this.state.items,roots,this.manual,this.state.live);if(epoch!==this.epoch||this.disposed)return;
    if(this.state.root!==chosen.root){this.state.tree=undefined;this.state.editor=undefined;this.followKey='';this.resetEdits();if(this.state.review)this.state.review.stale=true;}
    this.state.roots=roots;this.state.root=chosen.root;this.state.rootSource=chosen.source;this.state.ambiguous=chosen.ambiguous;this.rootAt=Date.now();
   }
   const root=this.state.root,tree=this.state.roots.find(r=>r.path===root);
   if(tree){
    const value=await readWorktree(tree,this.run,undefined,true);if(epoch!==this.epoch||this.disposed)return;
    for(const absolute of this.dirtyPaths())if(inside(tree.path,absolute)&&value.changes){const file=path.relative(tree.path,absolute),existing=value.changes.find(c=>c.path===file);if(existing)existing.unsaved=true;else value.changes.push({path:file,status:' M',conflict:false,unsaved:true});}
    this.state.tree=value;this.state.worktreeError=!!value.error;
    if(this.state.review&&!this.state.review.recorded){
     const review=this.state.review;if(review.root!==root||review.head!==value.head)review.stale=true;
     else if(!review.editorDiff){const fresh=await loadChange(review.root,review.file,this.dirty(review.root,review.file),this.run,value.changes?.find(c=>c.path===review.file)?.previousPath).catch(()=>undefined);if(epoch!==this.epoch||this.disposed)return;if(!fresh||fresh.hash!==review.hash)review.stale=true;}
    }
   }
   await this.syncLesson();this.emit();
  }catch(e){if(epoch===this.epoch&&!this.disposed){this.state.loading=false;if(phase==='git'){this.state.worktreeError=true;await this.syncLesson();}else this.state.error=e instanceof ObserverError?e.code:'connection';this.emit();}}
  finally{this.running=false;if(!this.disposed&&(this.visible||this.again))this.timer=setTimeout(()=>this.refresh(),this.again?100:2500);}
 }
 private async syncLesson(){
  const selection=this.epoch;
  const candidates=[...this.state.items].reverse().filter(item=>item.kind==='assistant');
  let candidate:ActivityItem|undefined,card;
  for(const item of candidates){const parsed=readLesson(item.text);if(parsed){candidate=item;card=parsed;break;}}
  if(!candidate||!card){if(!this.state.lesson)this.state.lessonStatus='missing';return;}
  const key=candidate.id+'|'+JSON.stringify(card);if(this.lessonKey===key)return;this.lessonKey=key;
  this.state.lessonStatus='checking';this.emit();
  let cursor=this.state.nextItems;
  for(let page=0;page<17;page++){
   if(selection!==this.epoch||this.disposed)return;
   const verified=verifyLesson(card,candidate.id,[...(this.state.editHistory??[]),...this.state.items],this.state.roots.filter(root=>!root.unavailable).map(root=>root.path),true);
   if(verified){this.state.lesson=verified;this.state.lessonStatus=undefined;return;}
   if(page===16||!cursor||!this.selected||!this.client)break;
   try{const response=await this.pageItems(this.selected,cursor);if(selection!==this.epoch||this.disposed)return;
    const edits=((response.data??[]).map(activityItem).filter(Boolean) as ActivityItem[]).filter(item=>item.kind==='change');
    const ids=new Set(edits.map(item=>item.id));this.state.editHistory=[...edits.reverse(),...(this.state.editHistory??[]).filter(item=>!ids.has(item.id))].slice(-100);
    if(response.nextCursor===cursor)break;cursor=response.nextCursor||undefined;
   }catch{break;}
  }
  if(selection===this.epoch&&!this.disposed)this.state.lessonStatus='unverified';
 }
 refreshLesson(){this.lessonKey='';this.refresh();}
 async reviewFile(file:string,line?:number,comparison?:EditorComparison){
  const root=this.state.root;if(!root||!this.state.tree?.changes?.some(c=>c.path===file))return;
  const epoch=++this.reviewEpoch,selection=this.epoch;
  const review=await loadChange(root,file,this.dirty(root,file),this.run,this.state.tree?.changes?.find(c=>c.path===file)?.previousPath,comparison);if(epoch!==this.reviewEpoch||selection!==this.epoch||this.disposed)return;
  this.state.review=review;this.state.reviewContext=undefined;this.state.hunk=line===undefined?0:hunkAtLine(review.hunks,line);this.state.practice=undefined;this.state.reviewOpened=!!comparison;this.emit();
  const item=[...(this.state.editHistory??[]),...this.state.items].reverse().find(i=>i.kind==='change'&&i.diffs?.some(d=>path.resolve(root,d.path)===path.resolve(root,file)));
  if(item)await this.loadReviewContext(item,epoch,selection);
 }
 /** Follow only the editor inside the selected, registered worktree. Never
  * switch chats/worktrees to make an unrelated file appear associated. */
 async followEditor(absolute:string,line?:number,comparison?:EditorComparison){
  const root=this.state.root,selection=this.epoch,revision=++this.followEpoch;
  if(!root||!this.state.tree||this.state.ambiguous)return;
  const canonical=await realpath(absolute).catch(()=>absolute);
  if(revision!==this.followEpoch||selection!==this.epoch||root!==this.state.root||this.disposed)return;
  const outside=!inside(root,canonical),file=outside?canonical:path.relative(root,canonical);
  const changed=!outside&&!!this.state.tree.changes?.some(c=>c.path===file);
  const key=JSON.stringify([this.selected,root,canonical,changed,comparison?.key]);
  if(key===this.followKey){
   const r=this.state.review;
   if(r?.editorDiff&&!r.recorded&&!r.stale&&comparison&&(r.before!==comparison.before||r.after!==comparison.after)){r.stale=true;this.emit();}
   if(line!==undefined&&r&&!r.recorded&&!r.stale&&!this.state.practice&&r.root===root&&r.file===file)this.hunk(hunkAtLine(r.hunks,line));
   return;
  }
  this.editor(file,outside);
  if(this.comparisonKey!==comparison?.key)this.clearReview();
  this.comparisonKey=comparison?.key;this.followKey=key;
  if(outside||!changed)return;
  // An explicitly opened historical edit or practice stays pinned while the
  // editor itself is unchanged. File navigation starts a new review.
  if(this.state.review?.file===file&&this.state.review.root===root)return;
  try{
   await this.reviewFile(file,line,comparison);
  }catch{
   if(revision===this.followEpoch&&selection===this.epoch&&this.state.editor?.file===file){this.state.editor.error=true;this.emit();}
  }
 }
 followAgain(){this.followKey='';this.state.editor=undefined;this.clearReview();}
 async reviewRecorded(itemId:string,file:string){
  const item=[...this.state.items,...(this.state.editHistory??[])].find(i=>i.id===itemId&&i.kind==='change');const change=item?.diffs?.find(c=>c.path===file);if(!change||!this.state.root)return;
  const relative=path.isAbsolute(file)?path.relative(this.state.root,file):file;if(relative.startsWith('..')||path.isAbsolute(relative))return;
  const revision=++this.reviewEpoch,selection=this.epoch;
  const hunks=parseHunks(change.diff);this.state.review={root:this.state.root!,file:relative,head:'',before:'',after:'',hash:itemId+':'+file,hunks,recorded:true};this.state.hunk=0;this.state.practice=undefined;this.state.reviewOpened=false;this.state.reviewContext=undefined;this.emit();
  await this.loadReviewContext(item!,revision,selection);
 }
 async learnLatest(){
  let root=this.state.root,selection=this.epoch,revision=this.reviewEpoch;if(!root||this.state.learningSearch==='searching')return false;
  this.state.learningSearch='searching';this.emit();let found=false,switched=false;
  try{for(let page=0;page<4;page++){
   if(selection!==this.epoch||revision!==this.reviewEpoch||this.disposed||root!==this.state.root)return false;
   const edits=[...(this.state.editHistory??[]),...this.state.items].reverse();
   for(const item of edits)for(const change of item.diffs??[]){
    const absolute=await realpath(path.resolve(root,change.path)).catch(()=>path.resolve(root!,change.path));
    if(selection!==this.epoch||revision!==this.reviewEpoch||this.disposed)return false;
    const registered=this.state.roots.filter(tree=>!tree.unavailable).map(tree=>tree.path);if(!registered.length)registered.push(root);
    const target=registered.filter(tree=>inside(tree,absolute)).sort((a,b)=>b.length-a.length)[0];
    const relative=target?path.relative(target,absolute):'';
    if(target&&isLearningCode(relative)&&parseHunks(change.diff).length){
     // This explicit action follows an edit recorded in this exact chat and
     // verified against Git's inventory, even after a tool ran in the main repo.
     if(target!==root){this.epoch++;this.reviewEpoch++;this.manual=target;this.state.root=target;this.state.rootSource='activity';this.state.tree=this.state.roots.find(tree=>tree.path===target);this.state.ambiguous=false;this.followKey='';root=target;selection=this.epoch;revision=this.reviewEpoch;switched=true;}
     await this.reviewRecorded(item.id,change.path);found=selection===this.epoch&&this.reviewEpoch===revision+1&&this.state.review?.file===relative;if(found&&switched)this.refresh();return found;
    }
   }
   if(page===3||!(this.state.editsLoaded?this.state.nextEdits:this.state.nextItems))break;
   await this.olderEdits();if(this.state.editsError)break;
  }
  return false;
  }finally{if(selection===this.epoch&&!this.disposed){this.state.learningSearch=found||revision!==this.reviewEpoch?undefined:'empty';this.emit();}}
 }
 private async loadReviewContext(item:ActivityItem,revision:number,selection:number){
  const threadId=this.selected,sameTurn=item.turnId?this.state.items.filter(i=>i.turnId===item.turnId):[];
  this.state.reviewContext=item.turnId?{turnId:item.turnId,...editContext(sameTurn,item),loading:true}:undefined;this.emit();
  // Read the original request and final answer for this exact turn. They are
  // display context only, never a generated explanation or retained memory.
  if(!item?.turnId||!threadId||!this.client)return;
  try{let cursor:string|undefined;
   for(let page=0;page<12;page++){
    const response=await this.client.read('thread/turns/list',{threadId,limit:1,itemsView:'summary',sortDirection:'desc',...(cursor?{cursor}:{})});
    if(revision!==this.reviewEpoch||selection!==this.epoch||this.disposed)return;
    const turn=(response.data??[]).find((turn:any)=>turn.id===item.turnId);
    if(turn){const items=(turn.items??[]).map(activityItem).filter(Boolean) as ActivityItem[];this.state.reviewContext={turnId:item.turnId,...editContext(items,item),loading:false};break;}
    cursor=response.nextCursor||undefined;if(!cursor)break;
   }
  }catch{/* A missing context page must not hide the recorded edit. */}
  finally{if(revision===this.reviewEpoch&&selection===this.epoch&&!this.disposed){if(this.state.reviewContext)this.state.reviewContext.loading=false;this.emit();}}
 }
 hunk(index:number){if(Number.isInteger(index)&&index>=0&&index<(this.state.review?.hunks.length??0)&&index!==this.state.hunk){this.state.hunk=index;this.state.practice=undefined;this.state.reviewOpened=false;this.emit();}}
 compared(){this.state.reviewOpened=true;this.emit();}
 editor(file:string,outside:boolean){if(this.state.editor?.file===file&&this.state.editor.outside===outside)return;this.state.editor={file,outside};this.clearReview();}
 practice(text:string){const expected=this.state.review?.hunks[this.state.hunk]?.after;if(expected===undefined)return;this.state.practice=text===expected?'matched':text===this.state.review?.hunks[this.state.hunk]?.before?'editing':'different';this.emit();}
 clearReview(){this.reviewEpoch++;this.state.review=undefined;this.state.reviewContext=undefined;this.state.practice=undefined;this.emit();}
 dispose(){this.disposed=true;this.epoch++;clearTimeout(this.timer);this.client?.dispose();this.events.dispose();}
}
