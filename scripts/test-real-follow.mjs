import {readFileSync as readManifestFile} from 'node:fs';
const packageVersion=JSON.parse(readManifestFile(new URL('../package.json',import.meta.url),'utf8')).version;
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Companion} from '../src/companion.ts';
import {CodexObserver,findCodex} from '../src/codex-observer.ts';
const id=process.argv[2];if(!id)throw Error('Existing thread ID required');
const command=await findCodex();let scans=0;
const model=new Companion(async()=>new CodexObserver({command,cwd:process.cwd(),version:packageVersion}),()=>{});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 model.select(id);const deadline=Date.now()+15000;while(!model.state.tree&&!model.state.error&&Date.now()<deadline)await sleep(50);assert.ok(model.state.tree,'linked real worktree');
 const initialIds=new Set(model.state.items.map(i=>i.id)),head=model.state.tree.head,initialFingerprint=model.state.tree.fingerprint,startedAt=Date.now(),initialUpdated=model.state.updatedAt;
 model.track(true);let updated=initialUpdated;
 while(Date.now()-startedAt<60000){await sleep(1000);if(model.state.updatedAt!==updated){updated=model.state.updatedAt;scans++;}}
 model.track(false);const added=model.state.items.filter(i=>!initialIds.has(i.id));
 const report={checkedAt:new Date().toISOString(),threadId:id,observedForMs:Date.now()-startedAt,scans,mode:model.state.mode,newPublicItems:added.map(i=>({id:i.id,kind:i.kind,turnId:i.turnId})),headChanged:model.state.tree.head!==head,worktreeChangesObserved:model.state.tree.fingerprint!==initialFingerprint,liveNotifications:[...model.events.latest.values()],error:model.state.error??null};
 await writeFile('artifacts/real-companion/follow.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));assert.ok(scans>=10,'repeated automatic refresh');
}finally{model.dispose();}
