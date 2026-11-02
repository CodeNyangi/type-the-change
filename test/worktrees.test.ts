import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseChanges,parseWorktrees,readWorktree,summarizeWorkspace,WorktreeTracker,git,type WorkspaceOverview} from '../src/worktrees.js';

test('NUL-delimited worktrees and renamed paths preserve spaces and cannot escape their root',()=>{
 const trees=parseWorktrees('worktree /repo\0HEAD abc\0branch refs/heads/main\0\0worktree /other tree\0HEAD def\0detached\0\0','/other tree/src');
 assert.equal(trees[0].current,false);assert.equal(trees[1].current,true);assert.equal(trees[1].branch,'');
 assert.deepEqual(parseChanges('R  new name.ts\0old name.ts\0UU conflict.ts\0?? dir/\0 M ../outside\0'),[
  {path:'new name.ts',status:'R ',conflict:false,previousPath:'old name.ts'},{path:'conflict.ts',status:'UU',conflict:true},{path:'dir/',status:'??',conflict:false},
 ]);
});

test('summaries distinguish unsaved work, overlapping paths, missing scans, and bounded file previews',()=>{
 const changes=Array.from({length:25},(_,i)=>({path:'src/file'+i+'.ts',status:' M',conflict:i===0}));
 const value:WorkspaceOverview={root:'/repo',updatedAt:1,worktrees:[{path:'/repo',branch:'main',head:'a',current:true,changes},{path:'/other',branch:'feature',head:'b',current:false,changes:[changes[0]]},{path:'/missing',branch:'old',head:'a',current:false,error:true}]};
 const view=summarizeWorkspace(value,['/repo/unsaved.ts']);
 assert.equal(view.worktrees[0].changeCount,26);assert.equal(view.worktrees[0].changes?.length,8);
 assert.equal(view.worktrees[0].unsavedCount,1);assert.equal(view.worktrees[0].overlap,1);assert.equal(view.worktrees[0].conflictCount,1);
 assert.equal(view.worktrees[2].changeCount,undefined,'unavailable is never represented as clean');
 assert.equal(value.worktrees[0].changes?.length,25,'presentation does not mutate scan evidence');
 const alias=summarizeWorkspace({...value,root:'/shortcut',canonicalRoot:'/repo'},['/shortcut/unsaved.ts']);
 assert.equal(alias.worktrees[0].unsavedCount,1,'an opened symlink alias still belongs to its canonical worktree');
});

test('real worktrees refresh independent edits, branches, commits, and removal without changing source',async()=>{
 const base=await realpath(await mkdtemp(path.join(tmpdir(),'ttc-worktrees-'))),root=path.join(base,'main'),other=path.join(base,'other');
 await mkdir(root);const exec=promisify(execFile);
 const run=async(cwd:string,args:string[])=>exec('git',['-c','core.hooksPath='+path.join(base,'no-hooks'),'-c','commit.gpgSign=false','-c','user.name=Fixture','-c','user.email=fixture@example.invalid',...args],{cwd,encoding:'utf8'});
 let tracker:WorktreeTracker|undefined;
 try{
  await run(root,['init','-b','main']);await writeFile(path.join(root,'source.ts'),'export const value = 1;\n');await run(root,['add','source.ts']);await run(root,['commit','-m','fixture']);
  await run(root,['worktree','add','-b','feature',other]);await writeFile(path.join(other,'source.ts'),'export const value = 2;\n');
  const trees=parseWorktrees(await git(root,['worktree','list','--porcelain','-z']),root);
  assert.equal(trees.length,2);const main=await readWorktree(trees.find(tree=>tree.current)!);const feature=await readWorktree(trees.find(tree=>!tree.current)!);
  assert.equal(main.changes?.length,0);assert.equal(feature.changes?.length,1);assert.equal(feature.branch,'feature');
  await writeFile(path.join(other,'source.ts'),'export const value = 12345;\n');
  const edited=await readWorktree(feature);assert.notEqual(edited.fingerprint,feature.fingerprint,'another edit to an already modified file is detected');
  await run(other,['add','source.ts']);await run(other,['commit','-m','changed']);const committed=await readWorktree(edited);assert.notEqual(committed.head,feature.head);assert.equal(committed.changes?.length,0);
  let resolve:((value:WorkspaceOverview)=>void)|undefined;
  tracker=new WorktreeTracker(value=>{if(value)resolve?.(value);});
  const update=()=>new Promise<WorkspaceOverview>((done,reject)=>{const timer=setTimeout(()=>reject(Error('scan timed out')),5000);resolve=value=>{clearTimeout(timer);done(value);};});
  let next=update();tracker.track(root,true);let snapshot=await next;assert.equal(snapshot.worktrees.length,2);
  tracker.acknowledge();await run(other,['switch','-c','feature-next']);next=update();tracker.refresh();snapshot=await next;assert.equal(snapshot.worktrees.find(tree=>!tree.current)?.branch,'feature-next');assert.equal(snapshot.newChanges,true,'changes in another worktree also surface while the overview is collapsed');
  await run(root,['worktree','remove',other]);next=update();tracker.refresh();snapshot=await next;assert.equal(snapshot.worktrees.length,1,'removed worktrees disappear instead of retaining stale cards');
  assert.equal(await readFile(path.join(root,'source.ts'),'utf8'),'export const value = 1;\n');
 }finally{tracker?.dispose();await rm(base,{recursive:true,force:true});}
});

test('failed scans retain an unavailable state, never a false clean branch',async()=>{
 const tree={path:'/repo',branch:'main',head:'abc',current:true};
 const result=await readWorktree(tree,async()=>{throw Error('unavailable');});
 assert.equal(result.error,true);assert.equal(result.branch,'main');assert.equal(result.changes,undefined);
});
