// Read-only UX verification with existing chats, not a synthetic lesson or agent run.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Companion} from '../src/companion.ts';
import {CodexObserver,findCodex} from '../src/codex-observer.ts';
import {companionHtml,companionDisplay} from '../src/companion-view.ts';
import {isLearningCode} from '../src/learning-context.ts';
const ids=process.argv.slice(2);if(!ids.length)throw Error('Pass existing chat IDs');
const version=JSON.parse(await readFile('package.json','utf8')).version,output='artifacts/task-flow-live';await mkdir(output,{recursive:true});
const command=await findCodex(),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});const reports=[];
try{for(const id of ids){
 const page=await browser.newPage({viewport:{width:480,height:1000}});let ready=false,updates=Promise.resolve();const calls=[];
 const model=new Companion(async()=>{const client=new CodexObserver({command,cwd:process.cwd(),version}),read=client.read.bind(client);client.read=(method,params)=>{calls.push(method);return read(method,params);};return client;},state=>{if(ready)updates=updates.then(()=>page.evaluate(s=>window.dispatchEvent(new MessageEvent('message',{data:{companion:s}})),companionDisplay(state,[state.selected?.cwd||state.threads.find(task=>task.id===id)?.cwd].filter(Boolean))));});
 const wait=async(fn,label)=>{const end=Date.now()+25000;while(!fn()&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(fn(),label+': '+JSON.stringify({error:model.state.error,root:model.state.root,ambiguous:model.state.ambiguous,search:model.state.learningSearch,review:model.state.review?.file,loading:model.state.editsLoading,next:!!model.state.nextEdits,items:model.state.items.length,edits:model.state.editHistory?.length}));await updates;};
 try{
  await page.exposeFunction('ttcPost',async message=>{if(message.command==='selectChat')model.select(message.id);if(message.command==='learnLatest')await model.learnLatest();});
  const boot='<script nonce="qa">window.acquireVsCodeApi=()=>({postMessage:m=>window.ttcPost(m)});</script>';
  await page.setContent(companionHtml('qa',true).replace('<script nonce=',boot+'<script nonce='));ready=true;model.track(true);
  await wait(()=>model.state.threads.some(t=>t.id===id),'existing task listed');
  assert.ok(await page.locator('#thread-list button').count()<=5,'five tasks initially');
  await page.locator('#chat-filter').fill(model.state.threads.find(t=>t.id===id).title);
  await page.locator('#thread-list button').filter({has:page.getByText(model.state.threads.find(t=>t.id===id).title,{exact:true})}).click();
  await wait(()=>!!model.state.tree&&!!model.state.taskRequest,'task request and registered worktree loaded');
  assert.equal(await page.locator('#activity').isVisible(),true);assert.equal(await page.locator('#conversation-record').getAttribute('open'),null);
  assert.equal(await page.locator('article').count(),0,'long transcript is not rendered');
  assert.ok((await page.locator('#task-request').innerText()).length>10);assert.ok((await page.locator('#learn-latest').boundingBox()).y<750);
  await page.screenshot({path:output+'/'+id+'-task.png',fullPage:true});
  const started=performance.now();await page.locator('#learn-latest').click();await wait(()=>!!model.state.review&&!model.state.reviewContext?.loading,'source edit and original context');
  assert.ok(isLearningCode(model.state.review.file));assert.equal(model.state.review.recorded,true);
  assert.equal(await page.locator('#changes').isVisible(),true);assert.equal(await page.locator('#file-list').count(),0);
  const excerpt=await page.locator('#context-excerpt').innerText();assert.ok(!excerpt.includes('&#x20;'));assert.ok(!/^https?:\/\//.test(excerpt));
  await page.screenshot({path:output+'/'+id+'-code.png',fullPage:true});
  reports.push({id,title:model.state.selected.title,root:model.state.root,branch:model.state.tree.branch,request:companionDisplay(model.state).task.request,selectedCode:model.state.review.file,contextSource:companionDisplay(model.state).contextSource,context:excerpt,learnMs:Math.round(performance.now()-started),transcriptCollapsed:true,sourceEditSelected:true,methods:[...new Set(calls)]});
 }finally{model.dispose();await updates.catch(()=>{});await page.close();}
}await writeFile(output+'/report.json',JSON.stringify({version,checkedAt:new Date().toISOString(),reports},null,2)+'\n');console.log(JSON.stringify(reports,null,2));}finally{await browser.close();}
