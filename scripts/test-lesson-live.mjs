// Verify a real Codex-authored card; never fabricate one or send an agent prompt.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Companion} from '../src/companion.ts';
import {CodexObserver,findCodex} from '../src/codex-observer.ts';
import {companionHtml,learningDisplay} from '../src/companion-view.ts';
const id=process.argv[2];if(!id)throw Error('Pass an existing chat with a Codex-authored learning card');
const version=JSON.parse(await readFile('package.json','utf8')).version,output='artifacts/lesson-live';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}),page=await browser.newPage({viewport:{width:480,height:850}});
let ready=false,updates=Promise.resolve();const command=await findCodex(),calls=[];
const model=new Companion(async()=>{const client=new CodexObserver({command,cwd:process.cwd(),version}),read=client.read.bind(client);client.read=(method,params)=>{calls.push(method);return read(method,params);};return client;},state=>{if(ready)updates=updates.then(()=>page.evaluate(s=>window.dispatchEvent(new MessageEvent('message',{data:{companion:s}})),learningDisplay(state,[state.selected?.cwd].filter(Boolean))));});
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!fn()&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(fn(),label+': '+JSON.stringify({error:model.state.error,lesson:model.state.lessonStatus}));await updates;};
try{
 const boot='<script nonce="qa">window.acquireVsCodeApi=()=>({postMessage:()=>{}});</script>';await page.setContent(companionHtml('qa',true).replace('<script nonce=',boot+'<script nonce='));ready=true;model.track(true);model.select(id);
 await wait(()=>!!model.state.lesson,'actual card matched to its source edit');
 const lesson=model.state.lesson;assert.equal(await page.locator('#lesson-title').innerText(),lesson.card.title);assert.equal((await page.locator('#after').innerText()).replace(/\s+/g,' ').trim(),lesson.card.source.after.replace(/\s+/g,' ').trim());
 assert.equal(await page.locator('#choices,#question,#answer,#reveal').count(),0);assert.equal(await page.locator('#explanation').isVisible(),true);assert.equal(await page.locator('#activity-list,#recorded-list,#review-prompt').count(),0);
 assert.equal(await page.locator('#explanation').innerText(),lesson.card.explanation);
 await page.screenshot({path:output+'/learning.png',fullPage:true});
 const allowed=new Set(['initialize','thread/list','thread/read','thread/items/list','thread/turns/list','thread/loaded/list']);assert.ok(calls.every(method=>allowed.has(method)));
 await writeFile(output+'/report.json',JSON.stringify({version,checkedAt:new Date().toISOString(),threadId:id,title:model.state.selected.title,cardId:lesson.id,cardTitle:lesson.card.title,sourceFile:lesson.file,sourceRoot:lesson.root,historical:!!lesson.historical,originalMessageId:lesson.messageId,originalEditId:lesson.editId,immediateExplanation:true,quizAbsent:true,explanationMatchesOriginal:true,transcriptAbsent:true,onlyReadOperations:true,methods:[...new Set(calls)]},null,2)+'\n');console.log('REAL LESSON PASSED '+lesson.card.title);
}finally{model.dispose();await updates.catch(()=>{});await page.close();await browser.close();}
