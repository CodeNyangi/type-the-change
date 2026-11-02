import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {companionHtml,learningDisplay} from '../src/companion-view.js';
function fixture(ko=true){const messages:any[]=[];const dom=new JSDOM(companionHtml('test',ko),{runScripts:'dangerously',beforeParse(w){(w as any).acquireVsCodeApi=()=>({postMessage:(v:any)=>messages.push(JSON.parse(JSON.stringify(v)))});}});const doc=dom.window.document;return {dom,messages,doc,send(s:any){dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{companion:s}}));},click(id:string){(doc.querySelector(id) as HTMLElement).click();},visible(id:string){return !doc.querySelector(id)?.closest('[hidden]');},close:()=>dom.window.close()};}
const thread={id:'one',title:'로컬라이재이션 대응',cwd:'/repo'};
const card={version:1,title:'문구로 오류를 판단해도 될까요?',question:'문구가 영어로 바뀌면 이 조건이 실행될까요?',choices:[{id:'a',text:'실행되지 않을 수 있다'},{id:'b',text:'항상 실행된다'}],answer:'a',explanation:'한글 문자열 대신 오류 상태를 따로 보관해야 합니다.',source:{file:'handlers/example.py',before:'if "찾을 수 없" in detail:\n    status = 404',after:'status = exception_status(error)'}};
const lesson={id:'card-1',messageId:'m',root:'/repo',editId:'edit',file:card.source.file,card};
const state={threads:[thread],selected:thread,projectPaths:['/repo'],loading:false};
test('the empty screen contains one status instead of a repeated heading, introduction and request instructions',()=>{
 const f=fixture();try{f.send({...state,items:[{kind:'assistant',text:'Restart VS Code operational instructions'}],review:{file:'test-host/real-companion.ts'},reviewContext:{request:'Long complaint',response:'Restart VS Code'}});
  assert.equal(f.visible('#lesson'),false);assert.equal(f.visible('#welcome'),true);assert.equal(f.doc.querySelector('#welcome')!.tagName,'P');assert.equal(f.visible('#prepare'),false);assert.equal(f.visible('#request-sheet'),false);
  for(const text of ['Restart VS Code','이 작업의 변경 이해하기','무엇이 달라졌고','붙여넣어 보내세요'])assert.equal(f.doc.body.textContent!.includes(text),false);
  for(const selector of ['#activity-list','#recorded-list','#review-prompt','#file-list','#next-card','#handoff-note'])assert.equal(f.doc.querySelector(selector),null);
 }finally{f.close();}
});
test('existing explanations appear immediately and polling preserves an open before-code comparison',()=>{
 const f=fixture();try{f.send({...state,lesson});assert.equal(f.visible('#welcome'),false);assert.equal(f.doc.querySelector('#lesson-title')!.textContent,card.title);assert.equal(f.doc.querySelector('#explanation')!.textContent,card.explanation);assert.equal(f.doc.querySelector('#after')!.textContent,card.source.after);
  for(const selector of ['#choices','#question','#answer','#reveal','#feedback'])assert.equal(f.doc.querySelector(selector),null);assert.equal(f.doc.body.textContent!.includes(card.question),false);
  (f.doc.querySelector('#before-details') as HTMLDetailsElement).open=true;f.send({...state,lesson});assert.equal((f.doc.querySelector('#before-details') as HTMLDetailsElement).open,true);f.send({...state,lesson:{...lesson,id:'next'}});assert.equal((f.doc.querySelector('#before-details') as HTMLDetailsElement).open,false);
  f.send({...state,lesson:{...lesson,card:{...card,source:{...card.source,before:'',after:'        if invalid:\n            reject()\n'}}}});assert.equal(f.visible('#before-details'),false);assert.equal(f.doc.querySelector('#after')!.textContent,'if invalid:\n    reject()');
 }finally{f.close();}
});
test('asking opens a review without sending; reading history never disables that action',()=>{
 const f=fixture();try{
  f.send({...state,loading:true,lessonStatus:'checking'});f.click('#settings-toggle');f.click('#prepare');assert.equal(f.visible('#request-sheet'),true);assert.equal(f.doc.querySelector('#request-target')!.textContent,thread.title);assert.equal((f.doc.querySelector('#request-confirm') as HTMLButtonElement).disabled,false);assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,0);
  f.click('#request-cancel');assert.equal(f.visible('#request-sheet'),false);assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,0);
  f.click('#settings-toggle');f.click('#prepare');f.click('#request-confirm');assert.deepEqual(f.messages.at(-1),{command:'prepareLesson',id:'one'});assert.equal((f.doc.querySelector('#request-confirm') as HTMLButtonElement).disabled,true);f.click('#request-confirm');assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,1);
 }finally{f.close();}
});
test('delivery states explain disabled send controls and retain retry only for a known failure',()=>{
 const f=fixture();try{
  f.send(state);f.click('#settings-toggle');f.click('#prepare');f.click('#request-confirm');
  f.send({...state,lessonRequest:'queued'});assert.match(f.doc.querySelector('#request-status')!.textContent!,/전달했습니다/);assert.equal((f.doc.querySelector('#request-confirm') as HTMLButtonElement).disabled,true);
  f.send({...state,lessonRequest:'failed'});assert.equal((f.doc.querySelector('#request-confirm') as HTMLButtonElement).disabled,false);assert.equal(f.doc.querySelector('#request-status')!.getAttribute('role'),'alert');f.click('#request-confirm');assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,2);
  f.send({...state,lessonRequest:'uncertain'});assert.equal((f.doc.querySelector('#request-confirm') as HTMLButtonElement).disabled,true);assert.match(f.doc.querySelector('#request-status')!.textContent!,/원래 Codex 채팅/);f.click('#request-cancel');assert.equal(f.visible('#codex'),true);
 }finally{f.close();}
});
test('switching chats closes the old request review without sending it to a replacement chat',()=>{
 const f=fixture();try{f.send(state);f.click('#settings-toggle');f.click('#prepare');f.send({...state,selected:{...thread,id:'two',title:'다른 작업'}});assert.equal(f.visible('#request-sheet'),false);f.click('#request-confirm');assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,0);}finally{f.close();}
});
test('comparison, original chat, refresh and settings buttons each dispatch their labelled action',()=>{
 const f=fixture();try{
  f.send({...state,lesson,nextThreads:'older'});for(const [selector,command] of [['#open-diff','openLessonDiff'],['#codex','openCodexThread'],['#refresh','refreshChats'],['#older','moreChats'],['#retry','refreshLesson']] as const){f.click(selector);assert.equal(f.messages.at(-1).command,command);}
  for(const command of ['chooseLanguage','moveView','configureCodex','setupLive']){f.click('[data-command="'+command+'"]');assert.equal(f.messages.at(-1).command,command);}
  assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,0);
 }finally{f.close();}
});
test('provider text stays inert and action errors keep their actual meaning',()=>{
 const f=fixture(false);try{f.send({...state,lesson:{...lesson,card:{...card,title:'<script>evil()</script>',explanation:'<img src=x onerror=evil()>'}}});assert.equal(f.doc.querySelector('img'),null);assert.equal(f.doc.querySelectorAll('script').length,1);const error='This suggestion is invalid. Choose a Type the Change JSON file.';f.send({...state,actionError:error});assert.equal(f.visible('#error'),true);assert.equal(f.doc.querySelector('#error')!.textContent,error);assert.equal(f.visible('#welcome'),false);}finally{f.close();}
});
test('task picker limits this project to five, expands, filters and chooses by exact ID',()=>{
 const f=fixture(false);try{f.send({...state,selected:undefined,threads:Array.from({length:12},(_,i)=>({...thread,id:String(i),title:'Task '+i,cwd:i<9?'/repo':'/other'}))});assert.equal(f.doc.querySelectorAll('#thread-list button').length,5);f.click('#show-more');assert.equal(f.doc.querySelectorAll('#thread-list button').length,9);f.click('#scope-toggle');f.click('#show-more');f.click('#show-more');assert.equal(f.doc.querySelectorAll('#thread-list button').length,12);const input=f.doc.querySelector('#chat-filter') as HTMLInputElement;input.value='Task 11';input.dispatchEvent(new f.dom.window.Event('input'));assert.equal(f.doc.querySelectorAll('#thread-list button').length,1);f.click('#thread-list button');assert.deepEqual(f.messages.at(-1),{command:'selectChat',id:'11'});}finally{f.close();}
});
test('learner payload excludes raw transcripts, inventories and unrelated review state',()=>{
 const data=learningDisplay({threads:[{...thread,preview:'private prompt'}],selected:thread,items:[{text:'Private transcript'}],roots:[{path:'/repo'}],root:'/repo',hunk:0,mode:'history',loading:false,reviewContext:{response:'restart instructions'},review:{file:'generated.py'}} as any,['/repo']);
 for(const key of ['items','review','reviewContext','tree','taskRequest'])assert.equal(Object.hasOwn(data,key),false);assert.equal(JSON.stringify(data).includes('Private transcript'),false);assert.equal(JSON.stringify(data).includes('private prompt'),false);
});
