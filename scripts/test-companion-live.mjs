// Observe an existing chat and its registered worktree; never start agent work.
import {mkdir,writeFile} from 'node:fs/promises';
import {Companion} from '../src/companion.ts';
import {CodexObserver,findCodex} from '../src/codex-observer.ts';
const id=process.argv[2];if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Pass an existing Codex thread ID');
const command=await findCodex();let done;const completion=new Promise(resolve=>done=resolve);
const model=new Companion(async()=>new CodexObserver({command,cwd:process.cwd(),version:'0.7.0'}),state=>{if(state.tree||state.error)done(state);});
const timeout=setTimeout(()=>done(model.state),15000);
try{model.select(id);const s=await completion;const report={checkedAt:new Date().toISOString(),threadId:s.selected?.id,title:s.selected?.title,mode:s.mode,runtime:s.selected?.runtime,root:s.root,rootSource:s.rootSource,worktrees:s.roots.length,branch:s.tree?.branch,changedPaths:s.tree?.changes?.length,displayedItems:s.items.length,liveEvent:!!s.live,error:s.error};
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/companion-live.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!s.tree&&!s.ambiguous)process.exitCode=1;
}finally{clearTimeout(timeout);model.dispose();}
