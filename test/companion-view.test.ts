import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {companionHtml,companionDisplay,codexExcerpt} from '../src/companion-view.js';
function fixture(ko=true){const messages:any[]=[];const dom=new JSDOM(companionHtml('test',ko),{runScripts:'dangerously',beforeParse(w){(w as any).acquireVsCodeApi=()=>({postMessage:(v:any)=>messages.push(JSON.parse(JSON.stringify(v)))});}});const doc=dom.window.document;return {dom,messages,doc,send(s:any){dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{companion:s}}));},click(id:string){(doc.querySelector(id) as HTMLElement).click();},close:()=>dom.window.close()};}
const thread={id:'one',title:'Home <script>evil()</script>',cwd:'/repo',runtime:'notLoaded',flags:[]};
const state={threads:[thread],selected:thread,items:[{id:'a',kind:'assistant',text:'Read this <img src=x onerror=evil()>.'}],loading:false,mode:'history',updatedAt:Date.now(),roots:[],root:'/repo',rootSource:'chat',tree:{branch:'main',changes:[{path:'source.ts',status:' M',conflict:false}]},hunk:0};
const review={file:'source.ts',hash:'one',total:2,canPractice:true,kind:'modified',hunk:{oldLine:10,newLine:10,lines:3,hint:'new'}};
test('uses native Source Control instead of duplicating its inventory or composing agent requests',()=>{
 const f=fixture();try{f.send(state);assert.equal(f.doc.querySelector('#intent'),null);assert.equal(f.doc.querySelector('img'),null);assert.equal(f.doc.querySelector('#file-list'),null);assert.equal(f.doc.querySelector('#file-filter'),null);
  f.click('#thread-list button');assert.deepEqual(f.messages.at(-1),{command:'selectChat',id:'one'});
  f.click('#changes-tab');f.click('#empty-action');assert.deepEqual(f.messages.at(-1),{command:'openSourceControl'});
  assert.equal((f.doc.querySelector('#recorded') as HTMLDetailsElement).open,false);
 }finally{f.close();}
});
test('refreshing metadata preserves button identity, keyboard focus, and chosen tab',()=>{
 const f=fixture();try{f.send({...state,review});f.click('#activity-tab');const button=f.doc.querySelector('#primary-action') as HTMLElement;button.focus();f.send({...state,review,updatedAt:Date.now()+1});assert.equal(f.doc.querySelector('#primary-action'),button);assert.equal(f.doc.activeElement,button);assert.equal(f.doc.querySelector('#activity-tab')?.getAttribute('aria-selected'),'true');}finally{f.close();}
});
test('one primary action progresses from comparison to a small practice and its feedback',()=>{
 const f=fixture();try{
  f.send({...state,review});assert.equal(f.doc.querySelector('#before'),null);assert.equal(f.doc.querySelector('#after'),null);assert.equal(f.doc.querySelector('#hint-code')!.textContent,'');
  f.click('#primary-action');assert.deepEqual(f.messages.at(-1),{command:'openReviewDiff'});
  f.send({...state,review,reviewOpened:true});f.click('#primary-action');assert.deepEqual(f.messages.at(-1),{command:'practiceChange'});
  f.send({...state,review,reviewOpened:true,practice:'different'});f.click('#primary-action');assert.deepEqual(f.messages.at(-1),{command:'comparePractice'});assert.equal(f.doc.querySelector('#hint-code')!.textContent,'new');assert.equal((f.doc.querySelector('#practice-hint') as HTMLDetailsElement).open,false);
  f.send({...state,review,practice:'matched'});f.click('#primary-action');assert.deepEqual(f.messages.at(-1),{command:'hunk',index:1});
 }finally{f.close();}
});
test('new or large files and stale snapshots never offer whole-file typing',()=>{
 const f=fixture(false);try{for(const r of [{...review,canPractice:false,kind:'added'}, {...review,canPractice:false}, {...review,stale:true}]){
  f.send({...state,review:r,reviewOpened:true});assert.equal(f.doc.querySelector('#primary-action')?.getAttribute('data-action'),'openCodexThread');assert.equal(f.doc.querySelector('#hint-code')!.textContent,'');
 }assert.equal((f.doc.querySelector('#review-stale') as HTMLElement).hidden,false);}finally{f.close();}
});
test('a disconnected shared reader does not repeat old active status or poll timestamps',()=>{
 const f=fixture();try{f.send({...state,mode:'shared',selected:{...thread,runtime:'active'},error:'connection',live:{event:'PreToolUse',at:Date.now()}});assert.equal(f.doc.querySelector('#connection')!.textContent,'저장된 기록');assert.match(f.doc.querySelector('#error')!.textContent!,/연결이 끊겼습니다/);}finally{f.close();}
});
test('an unrelated active file identifies the worktree mismatch and offers chat selection',()=>{
 const f=fixture();try{f.send({...state,editor:{file:'/other/source.ts',outside:true}});f.click('#changes-tab');assert.match(f.doc.querySelector('#editor-message')!.textContent!,/다른 작업공간/);assert.equal(f.doc.querySelector('#editor-scope')!.textContent,'main');f.click('#empty-action');assert.equal((f.doc.querySelector('#picker') as HTMLElement).hidden,false);assert.equal(f.messages.filter(m=>m.command==='pickWorktree').length,0);}finally{f.close();}
});
test('recorded edits retain original context without expanding long conversation by default',()=>{
 const f=fixture();try{
  f.send({...state,recordedChanges:[{id:'edit',file:'/repo/source.ts',label:'source.ts'}]});f.click('#recorded-list button');assert.deepEqual(f.messages.at(-1),{command:'reviewRecorded',id:'edit',file:'/repo/source.ts'});
  f.send({...state,review:{...review,recorded:true},contextExcerpt:'Verified the original change.',contextSource:'response',reviewContext:{turnId:'turn',request:'Keep freshness.',response:'Verified the original change.',loading:false}});
  assert.equal(f.doc.querySelector('#request-text')!.textContent,'Keep freshness.');assert.equal(f.doc.querySelector('#context-excerpt')!.textContent,'Verified the original change.');assert.equal((f.doc.querySelector('#full-context') as HTMLDetailsElement).open,false);
 }finally{f.close();}
});
test('public Codex messages format text without executing HTML, command links or remote images',()=>{
 const f=fixture();try{f.send({...state,items:[{id:'safe',kind:'assistant',text:'**Verified** `source.py` [PR 1126](https://github.com/example/repo/pull/1126) [bad](command:run) <img src=x onerror=evil()>'}]});assert.equal(f.doc.querySelector('article strong')?.textContent,'Verified');assert.equal(f.doc.querySelector('article code')?.textContent,'source.py');assert.equal(f.doc.querySelectorAll('article a').length,1);assert.equal(f.doc.querySelector('article a')?.getAttribute('href'),'https://github.com/example/repo/pull/1126');assert.equal(f.doc.querySelector('article img'),null);}finally{f.close();}
});
test('history lookup starts only when expanded and does not repeat on metadata refresh',async()=>{
 const f=fixture();try{const s={...state,nextItems:'older',recordedChanges:[]};f.send(s);f.click('#changes-tab');assert.equal(f.messages.filter(m=>m.command==='olderEdits').length,0);(f.doc.querySelector('#recorded') as HTMLDetailsElement).open=true;await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.messages.at(-1),{command:'olderEdits'});f.send({...s,updatedAt:Date.now()+1});assert.equal(f.messages.filter(m=>m.command==='olderEdits').length,1);
  f.send({...s,editsLoading:true});assert.equal((f.doc.querySelector('#older-edits') as HTMLButtonElement).disabled,true);f.send({...s,editsError:true});assert.equal((f.doc.querySelector('#edits-error') as HTMLElement).hidden,false);f.click('#older-edits');assert.deepEqual(f.messages.at(-1),{command:'olderEdits'});
 }finally{f.close();}
});
test('extracts a bounded existing Codex paragraph and does not transfer the SCM file list',()=>{
 const text='General result.\n\nChanged source.ts to preserve the requested behavior.\n\nOther results.';
 assert.equal(codexExcerpt(text,'source.ts'),'Changed source.ts to preserve the requested behavior.');assert.equal(codexExcerpt('x'.repeat(600),'source.ts').length,258);
 const view=companionDisplay({...state,review:{file:'source.ts',root:'/repo',before:'old',after:'new',head:'abc',hash:'one',hunks:[]},reviewContext:{turnId:'turn',response:text,loading:false}} as any);
 assert.equal((view.tree as any).changes,undefined);assert.equal(view.contextSource,'response');assert.equal(view.contextExcerpt,'Changed source.ts to preserve the requested behavior.');
});
