import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chooseWorktree} from '../src/companion.js';
import {eventFromHook,mergeHooks} from '../src/codex-events.js';
import {parseHunks,loadChange,locateHunk,canPractice,hunkAtLine} from '../src/change-review.js';
import {git} from '../src/worktrees.js';
import {companionDisplay,companionHtml} from '../src/companion-view.js';
const thread={id:'one',title:'Task',cwd:'/repo',updatedAt:0,runtime:'notLoaded',flags:[]};
const roots=[{path:'/repo',head:'a',branch:'main',current:true},{path:'/tmp/task',head:'b',branch:'task',current:false},{path:'/tmp/other',head:'c',branch:'other',current:false}];
test('worktree linkage follows activity in the same repository and does not follow arbitrary paths',async()=>{
 assert.equal((await chooseWorktree(thread,[{id:'1',kind:'command',text:'',cwd:'/tmp/task/src'}],roots)).root,'/tmp/task');
 assert.equal((await chooseWorktree(thread,[{id:'1',kind:'command',text:'',cwd:'/private/unrelated'}],roots)).root,'/repo');
 assert.equal((await chooseWorktree(thread,[{id:'1',kind:'command',text:'',cwd:'/tmp/task'},{id:'2',kind:'command',text:'',cwd:'/tmp/other'}],roots)).ambiguous,true);
 assert.equal((await chooseWorktree(thread,[],roots,'/tmp/other')).source,'choice');
 assert.equal((await chooseWorktree(thread,[],roots,'/removed-worktree')).root,undefined,'a removed explicit worktree must not silently switch to main');
});
test('hooks carry ephemeral status and directory metadata only, with no instructions or chat contents',()=>{
 const event=eventFromHook({session_id:'chat-one',hook_event_name:'PreToolUse',cwd:'/repo',turn_id:'turn1',tool_name:'Bash',tool_input:{workdir:'/tmp/task',command:'secret'},prompt:'private',transcript_path:'/private/rollout',last_assistant_message:'private'},100)!;
 assert.deepEqual(event,{threadId:'chat-one',event:'PreToolUse',cwd:'/repo',turnId:'turn1',tool:'Bash',toolCwd:'/tmp/task',at:100});
 assert.equal(eventFromHook({session_id:'../bad',hook_event_name:'Stop',cwd:'/repo'}),undefined);
 const original={hooks:{Stop:[{hooks:[{type:'command',command:'existing'}]}]}};
 const once=mergeHooks(original,'observe'),twice=mergeHooks(once,'observe');assert.deepEqual(once,twice);assert.equal(twice.hooks.Stop[0].hooks[0].command,'existing');assert.equal(original.hooks.Stop.length,1);
});
test('hunks preserve line positions, deletions and missing trailing newline',()=>{
 const h=parseHunks('@@ -4,2 +4,2 @@ test\n context\n-old\n+new\n\\ No newline at end of file\n')[0];
 assert.equal(h.newLine,4);assert.equal(h.before,'context\nold\n');assert.equal(h.after,'context\nnew');
});
test('practice is limited to short replacements and cursor position selects the relevant hunk',()=>{
 const hunks=parseHunks('@@ -3 +3 @@\n-old\n+new\n@@ -40 +42 @@\n-before\n+after\n');
 assert.equal(canPractice(hunks[0]),true);assert.equal(canPractice({...hunks[0],before:''}),false);assert.equal(canPractice({...hunks[0],after:''}),false);
 assert.equal(canPractice({...hunks[0],after:'line\n'.repeat(17)}),false);assert.equal(canPractice({...hunks[0],before:'x'.repeat(1601)}),false);
 assert.equal(hunkAtLine(hunks,1),0);assert.equal(hunkAtLine(hunks,43),1);
});
test('following an editor respects worktree boundaries, canonical paths and pinned historical practice',async()=>{
 const {Companion}=await import('../src/companion.js');
 const base=await realpath(await mkdtemp(path.join(tmpdir(),'ttc-follow-'))),root=path.join(base,'tree'),other=path.join(base,'other'),alias=path.join(base,'alias');await mkdir(root);await mkdir(other);await symlink(root,alias);
 const fake:any={dispose(){}};let reads=0;
 const model=new Companion(async()=>fake,()=>{},async(cwd,args)=>{reads++;return git(cwd,args);});
 try{
  await git(root,['init','-q']);await git(root,['config','core.hooksPath',path.join(root,'none')]);await git(root,['config','commit.gpgSign','false']);await git(root,['config','user.name','Test']);await git(root,['config','user.email','test@example.test']);
  const original=Array.from({length:50},(_,i)=>'line '+i).join('\n')+'\n';await writeFile(path.join(root,'a.ts'),original);await git(root,['add','a.ts']);await git(root,['commit','-qm','base']);
  const changed=original.replace('line 1\n','first change\n').replace('line 40\n','second change\n');await writeFile(path.join(root,'a.ts'),changed);await writeFile(path.join(other,'a.ts'),'unrelated');
  model.state={...model.state,selected:{...thread,cwd:root},root,roots:[],tree:{path:root,head:'abc',branch:'task',current:true,changes:[{path:'a.ts',status:' M',conflict:false}]}};
  await model.followEditor(path.join(alias,'a.ts'),41);assert.equal(model.state.editor?.outside,false);assert.equal(model.state.review?.file,'a.ts');assert.equal(model.state.hunk,1);
  const readCount=reads;await model.followEditor(path.join(root,'a.ts'),1);assert.equal(model.state.hunk,0);assert.equal(reads,readCount,'metadata refresh reuses the pinned snapshot');
  model.state.review!.recorded=true;model.state.practice='editing';const pinned=model.state.review;await model.followEditor(path.join(root,'a.ts'),41);assert.equal(model.state.review,pinned);assert.equal(model.state.hunk,0);
  await model.followEditor(path.join(other,'a.ts'),1);assert.equal(model.state.editor?.outside,true);assert.equal(Object.hasOwn(model.state.review||{},'file'),false);assert.equal(model.state.root,root);assert.equal(model.state.selected?.id,'one');assert.equal(reads,readCount,'outside files are not read as part of this chat');
  await model.followEditor(path.join(root,'a.ts'),41);assert.equal(model.state.hunk,1);assert.equal(await readFile(path.join(root,'a.ts'),'utf8'),changed);
  await model.followEditor(path.join(root,'a.ts'),1,{key:'staged',before:original,after:original.replace('line 1\n','staged change\n')});assert.equal(model.state.review?.editorDiff,true);assert.equal(model.state.reviewOpened,true);assert.equal(model.state.review!.hunks.length,1);
  await model.followEditor(path.join(root,'a.ts'),1,{key:'staged',before:original,after:changed});assert.equal(model.state.review?.stale,true,'same comparison changing underneath a review is marked stale');
  await model.followEditor(path.join(root,'a.ts'),1,{key:'unstaged',before:'staged change\n',after:'working change\n'});assert.equal(model.state.review?.before,'staged change\n');assert.equal(model.state.review?.after,'working change\n');assert.equal(model.state.review?.stale,false);
 }finally{model.dispose();await rm(base,{recursive:true,force:true});}
});
test('historical source navigation follows moved code and refuses missing or ambiguous locations',()=>{
 const h=parseHunks('@@ -84,2 +84,2 @@\n context\n-old\n+new\n')[0];
 assert.equal(locateHunk('intro\ncontext\nnew\nend\n',h),1);
 assert.equal(locateHunk('context\r\nnew',h),0);
 assert.equal(locateHunk('refactored away\n',h),undefined);
 assert.equal(locateHunk('context\nnew\ncontext\nnew\n',h),undefined);
 assert.equal(locateHunk('other context\nnew\n',h),undefined);
});
test('review pins combined staged/working/unsaved bytes without changing repository files',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ttc-review-test-'));try{
  await git(root,['init','-q']);await git(root,['config','core.hooksPath',path.join(root,'no-hooks')]);await git(root,['config','commit.gpgSign','false']);await git(root,['config','user.name','Test']);await git(root,['config','user.email','test@example.test']);
  await writeFile(path.join(root,'a.ts'),'const a = 1;\n');await git(root,['add','a.ts']);await git(root,['commit','-qm','base']);
  await writeFile(path.join(root,'a.ts'),'const a = 2;\n');await git(root,['add','a.ts']);await writeFile(path.join(root,'a.ts'),'const a = 3;\n');
  const diff=await loadChange(root,'a.ts','const a = 4;\n');assert.equal(diff.before,'const a = 1;\n');assert.equal(diff.after,'const a = 4;\n');assert.equal(diff.hunks.length,1);assert.equal(diff.dirty,true);assert.equal(await readFile(path.join(root,'a.ts'),'utf8'),'const a = 3;\n');
  const staged=await loadChange(root,'a.ts',undefined,git,'a.ts',{key:'staged',before:'const a = 1;\n',after:'const a = 2;\n'});assert.equal(staged.after,'const a = 2;\n');assert.equal(staged.editorDiff,true);
  const unstaged=await loadChange(root,'a.ts',undefined,git,'a.ts',{key:'unstaged',before:'const a = 2;\n',after:'const a = 3;\n'});assert.equal(unstaged.before,'const a = 2;\n');assert.equal(await git(root,['show',':a.ts']),'const a = 2;\n');
  await writeFile(path.join(root,'new.ts'),'new\n');assert.equal((await loadChange(root,'new.ts')).before,'');
  await rm(path.join(root,'a.ts'));assert.equal((await loadChange(root,'a.ts')).after,'');
  await assert.rejects(loadChange(root,'../escape'));await assert.rejects(loadChange(root,'.env'));
  await symlink('/etc/passwd',path.join(root,'link.ts'));await assert.rejects(loadChange(root,'link.ts'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('display frames omit full file copies and large recorded patches',()=>{
 const full='x'.repeat(50000),state:any={threads:[],items:[{id:'c',kind:'change',text:'',paths:['a'],diffs:[{path:'a',diff:full}]}],roots:[],mode:'history',loading:false,hunk:0,review:{file:'a',root:'/repo',head:'a',before:full,after:full,hash:'abc',hunks:[{before:full,after:full,patch:full,oldLine:1,newLine:1}]}};
 const view=companionDisplay(state);assert.equal((view.review as any).before,undefined);assert.equal((view.items[0] as any).diffs,undefined);assert.equal(view.review?.canPractice,false);assert.equal(view.review?.hunk?.hint,undefined);assert.ok(JSON.stringify(view).length<2000);
 const html=companionHtml('nonce',true);assert.ok(!html.includes('id="intent"'));assert.ok(!html.includes('data-command="generate"'));assert.ok(html.includes('Codex 채팅'));
});

test('committed chat edits remain discoverable and separate from unrelated worktree changes',()=>{
 const state:any={threads:[],items:[
  {id:'older',kind:'change',text:'',diffs:[{path:'/repo/source.ts',diff:'@@ -1 +1 @@\n-old\n+new\n'}]},
  {id:'latest',kind:'change',text:'',diffs:[{path:'/repo/source.ts',diff:'@@ -1 +1 @@\n-new\n+latest\n'},{path:'/other/private.ts',diff:'excluded'}]},
 ],root:'/repo',roots:[],mode:'history',loading:false,hunk:0,tree:{changes:[]}};
 assert.deepEqual(companionDisplay(state).recordedChanges,[{id:'latest',file:'/repo/source.ts',label:'source.ts'}]);
});

test('recorded learning retrieves the original request of its exact turn without starting an agent',async()=>{
 const {Companion}=await import('../src/companion.js');const calls:string[]=[];
 const fake:any={mode:'history',async start(){},dispose(){},async read(method:string,params:any){calls.push(method);if(method==='thread/list')return {data:[]};if(method==='thread/read')return {thread:{id:'one',cwd:'/repo',status:{type:'notLoaded'}}};
  if(method==='thread/items/list')return {data:[{turnId:'old-turn',item:{id:'edit',type:'fileChange',changes:[{path:'/repo/a.ts',diff:'@@ -1 +1 @@\n-old\n+new\n'}]}},{id:'answer',type:'agentMessage',text:'Latest unrelated answer'}]};
  if(method==='thread/turns/list')return params.cursor?{data:[{id:'old-turn',items:[{id:'request',type:'userMessage',content:[{type:'text',text:'Original request'}]},{id:'response',type:'agentMessage',text:'Original response'}]}]}:{data:[{id:'new-turn',items:[]}],nextCursor:'older'};throw Error(method);
 }};
 const run=async(_cwd:string,args:string[])=>args[0]==='worktree'?'worktree /repo\0HEAD a\0branch refs/heads/main\0\0':args[0]==='rev-parse'?'a':args[0]==='symbolic-ref'?'main':'';
 const model=new Companion(async()=>fake,()=>{},run);
 try{model.select('one');const end=Date.now()+3000;while(!model.state.tree&&Date.now()<end)await new Promise(r=>setTimeout(r,10));await model.reviewRecorded('edit','/repo/a.ts');assert.equal(model.state.review?.hunks.length,1);assert.deepEqual(model.state.reviewContext,{turnId:'old-turn',request:'Original request',response:'Original response',loading:false});assert.ok(calls.every(m=>!['thread/resume','turn/start'].includes(m)));model.clearReview();assert.equal(model.state.reviewContext,undefined);}finally{model.dispose();}
});

test('switching worktrees during an in-flight scan cannot attach the previous worktree changes',async()=>{
 const {Companion}=await import('../src/companion.js');
 let release!:()=>void,entered!:()=>void;const enteredScan=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let blocked=false;
 const fake:any={mode:'history',async start(){},dispose(){},async read(method:string){if(method==='thread/list')return {data:[{id:'one',name:'Task',cwd:'/repo',status:{type:'notLoaded'}}]};if(method==='thread/read')return {thread:{id:'one',name:'Task',cwd:'/repo',status:{type:'notLoaded'}}};return {data:[{id:'a',type:'agentMessage',text:'Public update'}]};}};
 const run=async(cwd:string,args:string[])=>{if(args[0]==='worktree')return 'worktree /repo\0HEAD a\0branch refs/heads/main\0\0worktree /other\0HEAD b\0branch refs/heads/task\0\0';if(args[0]==='status'){if(cwd==='/repo'&&!blocked){blocked=true;entered();await gate;}return ' M '+(cwd==='/repo'?'old.ts':'new.ts')+'\0';}if(args[0]==='rev-parse')return cwd==='/repo'?'a':'b';if(args[0]==='symbolic-ref')return cwd==='/repo'?'main':'task';return '';};
 const snapshots:{root?:string;tree?:string}[]=[];const model=new Companion(async()=>fake,s=>snapshots.push({root:s.root,tree:s.tree?.path}),run);
 try{model.select('one');await enteredScan;model.chooseRoot('/other');release();const end=Date.now()+3000;while(model.state.tree?.path!=='/other'&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(model.state.tree?.changes?.[0].path,'new.ts');assert.ok(snapshots.every(s=>!s.tree||s.root===s.tree));}finally{release();model.dispose();}
});

test('legacy chat pagination uses bounded turn summaries without resuming or reading full history',async()=>{
 const {Companion}=await import('../src/companion.js'),{ObserverError}=await import('../src/codex-observer.js');const calls:{method:string;params:any}[]=[];
 const fake:any={mode:'history',async start(){},dispose(){},async read(method:string,params:any){calls.push({method,params});if(method==='thread/list')return {data:[]};if(method==='thread/read')return {thread:{id:'legacy',cwd:'/repo',status:{type:'notLoaded'}}};if(method==='thread/items/list')throw new ObserverError('protocol','Item pagination not supported');if(method==='thread/turns/list')return {data:[{id:'turn',status:'interrupted',items:[{id:'user',type:'userMessage',content:[{type:'text',text:'Question'}]},{id:'answer',type:'agentMessage',text:'Original answer'}]}]};throw Error('Unexpected call');}};
 const model=new Companion(async()=>fake,()=>{},async()=> '');
 try{model.select('legacy');const end=Date.now()+3000;while(!model.state.updatedAt&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.deepEqual(model.state.items.map(i=>i.id),['user','answer']);assert.equal(model.state.selected?.runtime,'notLoaded');assert.equal(model.state.live,undefined);const turns=calls.find(c=>c.method==='thread/turns/list')!;assert.equal(turns.params.limit,1);assert.equal(turns.params.itemsView,'summary');assert.ok(calls.every(c=>!['thread/start','thread/resume','turn/start'].includes(c.method)));}finally{model.dispose();}
});

test('refresh recognizes wrapped Codex item IDs and does not repeatedly backfill old history',async()=>{
 const {Companion}=await import('../src/companion.js');let pages=0;
 const fake:any={mode:'history',async start(){},dispose(){},async read(method:string){if(method==='thread/list')return {data:[]};if(method==='thread/read')return {thread:{id:'one',cwd:'/repo',status:{type:'notLoaded'}}};if(method==='thread/items/list'){pages++;return {data:[{turnId:'turn',item:{id:'answer',type:'agentMessage',text:'Original answer'}}],nextCursor:'older'};}throw Error(method);}};
 const model=new Companion(async()=>fake,()=>{},async()=> '');
 try{model.select('one');const wait=async(check:()=>boolean)=>{const end=Date.now()+3000;while(!check()&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.ok(check());};await wait(()=>!!model.state.updatedAt);const first=model.state.updatedAt;model.refresh();await wait(()=>model.state.updatedAt!==first);assert.equal(pages,2,'one page on selection and one incremental refresh');assert.deepEqual(model.state.items.map(i=>i.id),['answer']);}finally{model.dispose();}
});

async function editHistoryFixture(page:(cursor:string)=>Promise<any>){
 const {Companion}=await import('../src/companion.js');const cursors:string[]=[];
 const fake:any={mode:'history',async start(){},dispose(){},async read(method:string,params:any){
  if(method==='thread/list')return {data:[]};
  if(method==='thread/read')return {thread:{id:params.threadId,cwd:'/repo',status:{type:'notLoaded'}}};
  if(method==='thread/items/list'){if(params.cursor){cursors.push(params.cursor);return page(params.cursor);}return {data:[{id:'latest',type:'agentMessage',text:'Latest update'}],nextCursor:'p1'};}
  throw Error(method);
 }};
 const run=async(_cwd:string,args:string[])=>args[0]==='worktree'?'worktree /repo\0HEAD a\0branch refs/heads/main\0\0':args[0]==='rev-parse'?'a':args[0]==='symbolic-ref'?'main':'';
 const model=new Companion(async()=>fake,()=>{},run);model.select('one');
 const end=Date.now()+3000;while(!model.state.tree&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.ok(model.state.tree);
 return {model,cursors};
}
const recordedEdit={id:'past-edit',type:'fileChange',changes:[{path:'/repo/a.ts',diff:'@@ -1 +1 @@\n-old\n+new\n'}]};
test('finding edits skips command-only pages and keeps the result outside the full live activity window',async()=>{
 const {model,cursors}=await editHistoryFixture(async cursor=>({data:cursor==='p4'?[recordedEdit]:[{id:cursor,type:'commandExecution',command:'check'}],nextCursor:'p'+(Number(cursor.slice(1))+1)}));
 try{
  model.state.items=Array.from({length:300},(_,i)=>({id:'live-'+i,kind:'command' as const,text:'check'}));
  await model.olderEdits();assert.deepEqual(cursors,['p1','p2','p3','p4']);assert.equal(model.state.items.length,300);assert.equal(model.state.items[0].id,'live-0');
  const display=companionDisplay(model.state);assert.deepEqual(display.recordedChanges,[{id:'past-edit',file:'/repo/a.ts',label:'a.ts'}]);assert.equal((display as any).editHistory,undefined);assert.equal(model.state.nextEdits,'p5');
  await model.reviewRecorded('past-edit','/repo/a.ts');assert.equal(model.state.review?.hunks[0].after,'new\n');
 }finally{model.dispose();}
});
test('edit history lookup bounds each search and stops repeated cursors',async()=>{
 let repeat=false;const {model,cursors}=await editHistoryFixture(async cursor=>({data:[],nextCursor:repeat?cursor:'p'+(Number(cursor.slice(1))+1)}));
 try{await model.olderEdits();assert.equal(cursors.length,8);assert.equal(model.state.nextEdits,'p9');assert.equal(model.state.editsLoading,false);repeat=true;await model.olderEdits();assert.equal(cursors.length,9);assert.equal(model.state.nextEdits,undefined);}finally{model.dispose();}
});
test('failed edit history can be retried without erasing live activity',async()=>{
 let fail=true;const {model}=await editHistoryFixture(async()=>{if(fail)throw Error('unavailable');return {data:[recordedEdit]};});
 try{await model.olderEdits();assert.equal(model.state.editsError,true);assert.equal(model.state.editsLoading,false);assert.equal(model.state.items[0].id,'latest');fail=false;await model.olderEdits();assert.equal(model.state.editsError,false);assert.equal(model.state.editHistory?.[0].id,'past-edit');}finally{model.dispose();}
});
test('changing chats cancels an in-flight edit search and duplicate clicks share one request',async()=>{
 let release!:(value:any)=>void;const gate=new Promise(r=>release=r);const {model,cursors}=await editHistoryFixture(async()=>gate);
 try{const first=model.olderEdits();await model.olderEdits();assert.equal(cursors.length,1);model.select('two');release({data:[recordedEdit]});await first;assert.equal(model.state.editHistory?.length,0);assert.equal(model.state.editsLoading,false);}finally{release({data:[]});model.dispose();}
});
