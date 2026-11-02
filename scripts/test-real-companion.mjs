import {readFileSync as readManifestFile} from 'node:fs';
const packageVersion=JSON.parse(readManifestFile(new URL('../package.json',import.meta.url),'utf8')).version;
// Uses a real existing chat through the production observer/controller/view.
// No generated fixtures, model requests, source edits, or persisted chat cache.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Companion} from '../src/companion.ts';
import {CodexObserver,findCodex} from '../src/codex-observer.ts';
import {companionDisplay,companionHtml} from '../src/companion-view.ts';
const id=process.argv[2],file=process.argv[3];
if(!id||!file)throw Error('Pass an existing thread ID and a known edited relative file');
const output='artifacts/real-companion';await mkdir(output,{recursive:true});
const command=await findCodex(),calls=[],errors=[];
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:480,height:1100}});page.on('pageerror',e=>errors.push(e.message));
let ready=false,updates=Promise.resolve(),firstUpdate=0;
const model=new Companion(async()=>{
 const client=new CodexObserver({command,cwd:process.cwd(),version:packageVersion}),read=client.read.bind(client);
 client.read=(method,params)=>{calls.push(method);return read(method,params);};return client;
},state=>{if(ready){const display=companionDisplay(state);updates=updates.then(()=>page.evaluate(s=>window.dispatchEvent(new MessageEvent('message',{data:{companion:s}})),display));}});
const wait=async(check,label,ms=20000)=>{const until=Date.now()+ms;while(!check()&&Date.now()<until)await new Promise(r=>setTimeout(r,50));assert.ok(check(),label+': '+(model.state.error||''));await updates;};
try{
 await page.exposeFunction('ttcPost',async m=>{
  if(m.command==='selectChat'){firstUpdate=performance.now();model.select(m.id);}
  else if(m.command==='reviewRecorded')await model.reviewRecorded(m.id,m.file);
  else if(m.command==='olderActivity')await model.older();
  else if(m.command==='olderEdits')await model.olderEdits();
  else if(m.command==='clearReview')model.clearReview();
 });
 const boot='<script nonce="qa">window.acquireVsCodeApi=()=>({postMessage:m=>window.ttcPost(m)});</script>';
 await page.setContent(companionHtml('qa',true).replace('<script nonce=',boot+'<script nonce='));ready=true;model.track(true);
 await wait(()=>model.state.threads.some(t=>t.id===id),'real chat appears in list');
 const listed=model.state.threads.find(t=>t.id===id);
 await page.locator('#thread-list button').filter({has:page.getByText(listed.title,{exact:true})}).click();
 await wait(()=>model.state.selected?.id===id&&!!model.state.tree,'real chat and registered worktree load');
 const loadMs=Math.round(performance.now()-firstUpdate),initialIds=model.state.items.map(i=>i.id);
 assert.ok(model.state.items.some(i=>i.kind==='assistant'&&i.text.length>30),'original public Codex response');
 await page.screenshot({path:output+'/activity.png',fullPage:true});
 await page.locator('#changes-tab').click();
 assert.equal(await page.locator('#file-list').count(),0);
 await page.locator('#recorded > summary').click();
 await wait(()=>!model.state.editsLoading&&(!!model.state.editsLoaded||companionDisplay(model.state).recordedChanges.length>0),'expanding past edits finds actual history');
 const autoFoundEdits=companionDisplay(model.state).recordedChanges.length>0;assert.ok(autoFoundEdits);
 for(let p=0;p<8&&!companionDisplay(model.state).recordedChanges.some(c=>c.label===file)&&model.state.nextEdits;p++){await page.locator('#older-edits').click();await wait(()=>!model.state.editsLoading,'next recorded edits');}
 await updates;
 const record=companionDisplay(model.state).recordedChanges.find(c=>c.label===file);assert.ok(record,'original recorded edit is discoverable');
 await page.screenshot({path:output+'/changes.png',fullPage:true});
 await page.locator('#recorded-list button').filter({hasText:file}).click();
 await wait(()=>model.state.review?.file===file&&!!model.state.reviewContext&&!model.state.reviewContext.loading,'same-turn learning context');
 assert.ok(model.state.review.hunks.length,'real patch converts to before/after');
 assert.ok(model.state.reviewContext.request,'original request belongs to this edit');
 assert.ok(model.state.reviewContext.response,'original Codex response belongs to this edit');
 assert.equal(await page.locator('#request-text').textContent(),model.state.reviewContext.request.slice(0,6000));
 assert.equal(await page.locator('#before').count(),0);
 assert.equal(await page.locator('#after').count(),0);
 assert.equal(await page.locator('#context-excerpt').evaluate(el=>el._text),companionDisplay(model.state).contextExcerpt);
 assert.equal(await page.locator('#full-context').getAttribute('open'),null);
 assert.equal(await page.locator('#primary-action').getAttribute('data-action'),'openReviewDiff');
 assert.ok((await page.locator('#primary-action').boundingBox()).y<700,'next action fits without scrolling');
 await page.screenshot({path:output+'/learning.png',fullPage:true});
 const selected=model.state.selected,review=model.state.review,context=model.state.reviewContext;
 model.track(false);assert.deepEqual(errors,[]);
 const report={checkedAt:new Date().toISOString(),realData:true,threadId:selected.id,title:selected.title,loadMs,mode:model.state.mode,runtime:selected.runtime,worktree:model.state.root,branch:model.state.tree.branch,currentChangedFiles:model.state.tree.changes.length,publicActivityItems:model.state.items.length,recordedFiles:companionDisplay(model.state).recordedChanges.length,autoFoundEdits,review:{file:review.file,turnId:context.turnId,hunks:review.hunks.length,requestVerified:true,responseVerified:true,compactContextVerified:true,noDuplicateScm:true,nextActionVisible:true},rpcMethods:[...new Set(calls)],screenshots:['activity.png','changes.png','learning.png'],additionalLoadedHistoryItems:model.state.items.filter(i=>!initialIds.includes(i.id)).length};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{model.dispose();await updates.catch(()=>{});await browser.close();}
