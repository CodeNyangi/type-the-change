// Read-only production observer + real existing chats. Never sends a prompt.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Companion} from '../src/companion.ts';
import {CodexObserver,findCodex,activityItem} from '../src/codex-observer.ts';
import {companionHtml,learningDisplay} from '../src/companion-view.ts';
import {verifyLesson} from '../src/lesson.ts';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const ids=process.argv.slice(2);assert.ok(ids.length,'Pass actual existing chat IDs');
const output='artifacts/real-learning-flows';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}}),report=[];
try{for(const id of ids){
 const page=await browser.newPage({viewport:{width:480,height:850}}),methods=[],records=new Map();let ready=false,updates=Promise.resolve();
 const model=new Companion(async()=>{const c=new CodexObserver({command:await findCodex(),cwd:process.cwd(),version}),read=c.read.bind(c);c.read=(method,params)=>{methods.push(method);return read(method,params).then(result=>{for(const raw of result.data||[]){const item=activityItem(raw);if(item)records.set(item.id,item);}return result;});};return c;},state=>{if(ready)updates=updates.then(()=>page.evaluate(s=>window.dispatchEvent(new MessageEvent('message',{data:{companion:s}})),learningDisplay(state,[state.selected?.cwd].filter(Boolean))));});
 try{
  const boot='<script nonce="qa">window.__commands=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.__commands.push(m)});</script>';
  await page.setContent(companionHtml('qa',true).replace('<script nonce=',boot+'<script nonce='));ready=true;model.track(true);model.select(id);
  const end=Date.now()+45000;while(!model.state.lesson&&!['missing','unverified'].includes(model.state.lessonStatus)&&!model.state.error&&Date.now()<end)await new Promise(r=>setTimeout(r,50));await updates;
  assert.equal(model.state.error,undefined,'actual chat connection');assert.equal(model.state.selected?.id,id);assert.ok(model.state.lesson||['missing','unverified'].includes(model.state.lessonStatus),'bounded lookup must complete');
  const lesson=model.state.lesson;
  if(lesson){
   assert.equal(await page.locator('#explanation').innerText(),lesson.card.explanation);
   const original=records.get(lesson.messageId);assert.ok(original?.text.includes(lesson.card.explanation),'explanation quoted from the original public message');
   if(lesson.origin==='context'){assert.equal(original.turnId,records.get(lesson.editId)?.turnId);assert.ok(original.text.includes(lesson.file));}
   assert.ok(verifyLesson(lesson.card,lesson.messageId,[...records.values()],model.state.roots.map(r=>r.path),true),'code anchored to a real edit');
   if(lesson.card.source.before)await page.locator('#before-details > summary').click();await page.locator('#open-diff').click();assert.equal(await page.evaluate(()=>window.__commands.at(-1).command),'openLessonDiff');
  }else{assert.equal(await page.locator('#lesson').isVisible(),false);assert.equal(await page.locator('#welcome').isVisible(),true);assert.equal(await page.locator('#prepare').isVisible(),false);}
  assert.equal(await page.locator('#activity-list,#recorded-list,#review-prompt,#question,#choices').count(),0);
  await page.locator('#settings-toggle').click();await page.locator('#prepare').click();assert.equal(await page.locator('#request-target').innerText(),model.state.selected.title);assert.equal(await page.locator('#request-confirm').isEnabled(),true);await page.locator('#request-cancel').click();assert.equal(await page.locator('#request-sheet').isVisible(),false);
  await page.locator('#chat-toggle').click();assert.ok(await page.locator('#thread-list button').count()<=5);await page.locator('#chat-toggle').click();
  assert.ok(methods.every(method=>['thread/list','thread/read','thread/items/list','thread/turns/list','thread/loaded/list'].includes(method)));
  assert.ok((await page.evaluate(()=>window.__commands)).every(m=>m.command!=='prepareLesson'),'no messages requested');
  await page.screenshot({path:output+'/'+id+'.png',fullPage:true});
  report.push({version,id,title:model.state.selected.title,lesson:lesson?{id:lesson.id,origin:lesson.origin||'explicit',messageId:lesson.messageId,editId:lesson.editId,file:lesson.file,root:lesson.root,historical:!!lesson.historical}:null,status:model.state.lessonStatus,onlyReadOperations:true,noMessagesSent:true,methods:[...new Set(methods)],readCalls:methods.length,checkedAt:new Date().toISOString()});
  console.log(JSON.stringify(report.at(-1)));
 }finally{model.dispose();await updates.catch(()=>{});await page.close();}
}await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');}finally{await browser.close();}
