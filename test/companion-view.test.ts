import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {companionHtml,learningDisplay} from '../src/companion-view.js';
function fixture(ko=true){const messages:any[]=[];const dom=new JSDOM(companionHtml('test',ko),{runScripts:'dangerously',beforeParse(w){(w as any).acquireVsCodeApi=()=>({postMessage:(v:any)=>messages.push(JSON.parse(JSON.stringify(v)))});}});const doc=dom.window.document;return {dom,messages,doc,send(s:any){dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{companion:s}}));},click(id:string){(doc.querySelector(id) as HTMLElement).click();},close:()=>dom.window.close()};}
const thread={id:'one',title:'로컬라이재이션 대응',cwd:'/repo'};
const card={version:1,title:'문구로 오류를 판단해도 될까요?',question:'문구가 영어로 바뀌면 이 조건이 실행될까요?',choices:[{id:'a',text:'실행되지 않을 수 있다'},{id:'b',text:'항상 실행된다'}],answer:'a',explanation:'한글 문자열 대신 오류 상태를 따로 보관해야 합니다.',source:{file:'handlers/example.py',before:'if "찾을 수 없" in detail:\n    status = 404',after:'status = exception_status(error)'}};
const lesson={id:'card-1',messageId:'m',root:'/repo',editId:'edit',file:card.source.file,card};
const state={threads:[thread],selected:thread,projectPaths:['/repo'],loading:false};
test('the learning screen never presents conversation or arbitrary patches as a lesson',()=>{
 const f=fixture();try{f.send({...state,items:[{kind:'assistant',text:'Restart VS Code operational instructions'}],review:{file:'test-host/real-companion.ts'},reviewContext:{request:'Long complaint',response:'Restart VS Code'}});
  assert.equal(f.doc.querySelector('#lesson')?.hasAttribute('hidden'),true);assert.equal(f.doc.body.textContent!.includes('Restart VS Code'),false);
  for(const selector of ['#activity-tab','#changes-tab','#activity-list','#recorded-list','#review-prompt','#file-list'])assert.equal(f.doc.querySelector(selector),null);
  f.click('#prepare');assert.deepEqual(f.messages.at(-1),{command:'prepareLesson'});assert.match(f.doc.querySelector('#handoff-note')!.textContent!,/붙여넣어/);
 }finally{f.close();}
});
test('change explanation is immediate, even for older quiz-shaped cards',()=>{
 const f=fixture();try{f.send({...state,lesson});assert.equal((f.doc.querySelector('#welcome') as HTMLElement).hidden,true);assert.equal(f.doc.querySelector('#lesson-title')!.textContent,card.title);assert.equal(f.doc.querySelector('#after')!.textContent,card.source.after);assert.equal(f.doc.querySelector('#explanation')!.textContent,card.explanation);
  for(const selector of ['#choices','#question','#answer','#reveal','#feedback'])assert.equal(f.doc.querySelector(selector),null);
  assert.equal(f.doc.body.textContent!.includes(card.question),false);assert.equal(f.messages.filter(m=>m.command==='prepareLesson').length,0);
  (f.doc.querySelector('#before-details') as HTMLDetailsElement).open=true;f.send({...state,lesson,loading:false});assert.equal((f.doc.querySelector('#before-details') as HTMLDetailsElement).open,true,'polling preserves an explicitly opened comparison');
  f.send({...state,lesson:{...lesson,id:'next'}});assert.equal((f.doc.querySelector('#before-details') as HTMLDetailsElement).open,false);
  f.send({...state,lesson:{...lesson,card:{...card,source:{...card.source,before:''}}}});assert.equal((f.doc.querySelector('#before-details') as HTMLElement).hidden,true);
 }finally{f.close();}
});
test('code presentation removes common indentation while preserving the guarded body',()=>{
 const f=fixture();try{f.send({...state,lesson:{...lesson,card:{...card,source:{...card.source,after:'        if invalid:\n            reject()\n'}}}});assert.equal(f.doc.querySelector('#after')!.textContent,'if invalid:\n    reject()');}finally{f.close();}
});
test('card text stays inert and source opens only on an explicit action',()=>{
 const f=fixture();try{f.send({...state,lesson:{...lesson,card:{...card,title:'<script>evil()</script>',explanation:'<img src=x onerror=evil()>'}}});assert.equal(f.doc.querySelector('img'),null);assert.equal(f.doc.querySelectorAll('script').length,1);f.click('#open-diff');assert.deepEqual(f.messages.at(-1),{command:'openLessonDiff'});}finally{f.close();}
});
test('task picker limits the current project to five and allows explicit expansion',()=>{
 const f=fixture(false);try{f.send({...state,selected:undefined,threads:Array.from({length:12},(_,i)=>({...thread,id:String(i),title:'Task '+i,cwd:i<9?'/repo':'/other'}))});assert.equal(f.doc.querySelectorAll('#thread-list button').length,5);f.click('#show-more');assert.equal(f.doc.querySelectorAll('#thread-list button').length,9);f.click('#scope-toggle');f.click('#show-more');f.click('#show-more');assert.equal(f.doc.querySelectorAll('#thread-list button').length,12);}finally{f.close();}
});
test('learner payload excludes raw prompts, logs, worktree inventories and unrelated editor state',()=>{
 const data=learningDisplay({threads:[{...thread,preview:'private long prompt'}],selected:thread,items:[{text:'Private transcript'}],roots:[{path:'/repo'}],root:'/repo',hunk:0,mode:'history',loading:false,reviewContext:{response:'restart instructions'},review:{file:'generated.py'}} as any,['/repo']);
 for(const key of ['items','review','reviewContext','tree','taskRequest'])assert.equal(Object.hasOwn(data,key),false);
 assert.equal(JSON.stringify(data).includes('Private transcript'),false);assert.equal(JSON.stringify(data).includes('private long prompt'),false);
});
