import {readFileSync as readManifestFile} from 'node:fs';
const packageVersion=JSON.parse(readManifestFile(new URL('../package.json',import.meta.url),'utf8')).version;
// Read-only smoke test of an EXISTING Codex chat. Never starts or resumes a turn.
import {writeFile,mkdir} from 'node:fs/promises';
import {CodexObserver,findCodex,threadSummary,activityItem} from '../src/codex-observer.ts';
const id=process.argv[2];if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Pass an existing Codex thread ID');
const c=new CodexObserver({command:await findCodex(),cwd:process.cwd(),version:packageVersion}),calls=[];
const read=async(method,params)=>{calls.push(method);return c.read(method,params);};
try{
 const listed=await read('thread/list',{limit:5,searchTerm:process.argv[3]||undefined,useStateDbOnly:true});
 const meta=threadSummary((await read('thread/read',{threadId:id,includeTurns:false})).thread);
 const items=await read('thread/items/list',{threadId:id,limit:50,sortDirection:'desc'});
 const publicItems=items.data.map(activityItem).filter(Boolean);
 const report={checkedAt:new Date().toISOString(),mode:c.mode,listed:listed.data.some(t=>t.id===id),thread:{id:meta.id,title:meta.title,runtime:meta.runtime},itemCount:items.data.length,displayedCount:publicItems.length,hasMore:!!items.nextCursor,calls};
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/codex-observer-live.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{c.dispose();}
