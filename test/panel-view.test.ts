import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {panelHtml,PANEL_COMMANDS,type PanelState} from '../src/panel-view.js';

function view(mac=true,draft=''){
  const messages:any[]=[],errors:unknown[]=[],saved:any[]=[];
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(panelHtml('test-nonce',mac),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(w){
    (w as any).acquireVsCodeApi=()=>({postMessage:(m:any)=>messages.push(JSON.parse(JSON.stringify(m))),getState:()=>({intent:draft}),setState:(s:any)=>saved.push(s)});
  }});
  const window=dom.window,document=window.document;
  function get<T extends HTMLElement=HTMLElement>(id:string){const e=document.getElementById(id);assert.ok(e,id);return e as T;}
  function update(state:PanelState){window.dispatchEvent(new window.MessageEvent('message',{data:state}));}
  function click(command:string){const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-command]')].filter(b=>b.dataset.command===command&&!b.closest('[hidden]'));assert.ok(buttons.length,`visible ${command}`);buttons[0].click();}
  function type(value:string){get<HTMLTextAreaElement>('intent').value=value;get('intent').dispatchEvent(new window.Event('input',{bubbles:true}));}
  function close(){assert.deepEqual(errors,[]);dom.window.close();}
  return {dom,window,document,get,update,click,type,messages,saved,close};
}
const step:PanelState={title:'값 변경',file:'price.ts',line:3,before:'old();',after:'new();',reason:'반환값을 확인합니다.',step:1,total:2,status:'untouched',message:'선택된 코드를 직접 바꿔 보세요.',canContinue:false};

test('start has one inline request, saved draft, and no model/login modal',()=>{
 const v=view(true,'이전 요청');assert.deepEqual(v.messages,[{command:'ready'}]);assert.equal(v.get<HTMLTextAreaElement>('intent').value,'이전 요청');
 assert.equal(v.get<HTMLButtonElement>('generate').disabled,false);
 v.type('  ');assert.equal(v.get<HTMLButtonElement>('generate').disabled,true);
 v.type('음수 제외');assert.equal(v.saved.at(-1).intent,'음수 제외');
 v.get('request').dispatchEvent(new v.window.Event('submit',{cancelable:true}));assert.deepEqual(v.messages.at(-1),{command:'generate',intent:'음수 제외'});v.close();
});
test('request shortcut submits trimmed intent once and busy state blocks duplicate submissions',()=>{
 const v=view();v.type('  변경해 줘  ');
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,cancelable:true}));
 assert.deepEqual(v.messages.at(-1),{command:'generate',intent:'변경해 줘'});
 v.update({busy:true,phase:'수정안 생성 중'});const count=v.messages.length;
 v.get('request').dispatchEvent(new v.window.Event('submit',{cancelable:true}));
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,cancelable:true}));
 assert.equal(v.messages.length,count);assert.equal(v.get('phase').textContent,'수정안 생성 중');
 assert.equal(v.get<HTMLButtonElement>('files').disabled,true);v.click('stop');assert.equal(v.messages.at(-1).command,'stop');
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(v.messages.at(-1).command,'stop');v.close();
});
test('IME composition does not submit, advance, or cancel a request',()=>{
 const v=view();v.type('한글 요청');const count=v.messages.length;
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,isComposing:true,cancelable:true}));
 assert.equal(v.messages.length,count,'composition confirmation must not submit partial Korean text');
 v.update({...step,canContinue:true});
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,altKey:true,isComposing:true,cancelable:true}));
 assert.equal(v.messages.length,count,'composition confirmation must not accept a step');
 v.update({busy:true});
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Escape',isComposing:true,cancelable:true}));
 assert.equal(v.messages.length,count,'cancelling composition must not cancel the model request');v.close();
});
test('all home action buttons route to distinct allowlisted commands',()=>{
 const v=view();v.update({files:['a.ts','한글.ts'],model:'모델 A'});
 for(const command of ['chooseFiles','chooseModel','demo','import','loadPending','mcpConfig','signIn']){v.click(command);assert.equal(v.messages.at(-1).command,command);assert.ok(PANEL_COMMANDS.has(command));}
 assert.equal(v.get('files').textContent,'파일 2개');assert.equal(v.get('files').title,'a.ts\n한글.ts');
 v.update({files:['src/한글.ts']});assert.equal(v.get('files').textContent,'src/한글.ts');assert.equal(v.get('files').title,'src/한글.ts');
 v.update({files:[]});assert.equal(v.get('files').textContent,'＋ 파일 선택');assert.equal(v.get('files').title,'전송할 파일 선택');
 v.update({connected:true});assert.equal(v.get('connect').hidden,true);
 for(const command of ['usage','signOut']){v.click(command);assert.equal(v.messages.at(-1).command,command);}
 v.close();
});
test('a newly connected account can choose its model before the first request',()=>{
 const v=view();v.update({connected:true});
 assert.equal(v.get('model').hidden,false);assert.equal(v.get('model').textContent,'모델 선택');
 v.click('chooseModel');assert.equal(v.messages.at(-1).command,'chooseModel');
 v.update({connected:true,model:'모델 A'});assert.equal(v.get('model').textContent,'모델 A');
 v.update({connected:false});assert.equal(v.get('model').hidden,true);v.close();
});
test('typing, matching, continuation, completion and next request stay in one guide',()=>{
 const v=view();v.update(step);assert.equal(v.get('guide').hidden,false);assert.equal(v.get('home').hidden,true);assert.equal(v.get('after').textContent,'new();');
 assert.equal(v.get('status').textContent,'선택된 코드를 직접 바꿔 보세요.');
 assert.equal(v.get<HTMLButtonElement>('next').disabled,true);const count=v.messages.length;v.click('next');assert.equal(v.messages.length,count);
 v.update({...step,status:'editing',message:''});assert.equal(v.get('status').textContent,'','the initial instruction clears when typing begins');
 v.update({...step,status:'matched',message:'제안과 일치',canContinue:true});v.click('next');assert.equal(v.messages.at(-1).command,'next');
 v.update({...step,step:2});assert.equal(v.get('next-label').textContent,'완료');
 v.update({...step,step:2,complete:true,canContinue:true});assert.equal(v.get('next').hidden,true);assert.equal(v.get('review').hidden,false);assert.equal(v.get('guide').hidden,false);
 v.click('review');assert.equal(v.messages.at(-1).command,'review');v.click('stop');assert.equal(v.messages.at(-1).command,'stop');
 v.update({});assert.equal(v.get('home').hidden,false);v.close();
});
test('deletion has an explicit visual instruction on first open and reopening',()=>{
 const v=view();v.update({...step,after:'',message:''});assert.equal(v.get('after').hidden,true);assert.equal(v.get('delete-hint').hidden,false);assert.match(v.get('delete-hint').textContent||'',/지우세요/);assert.equal(v.get('status').textContent,'','deletion needs only its own instruction');
 v.update({});v.update({...step,after:'',message:''});assert.equal(v.get('delete-hint').hidden,false);v.close();
});
test('outside changes disable advancement and completion can be invalidated',()=>{
 const v=view();v.update({...step,complete:true,canContinue:true});
 v.update({...step,status:'outside',message:'다른 부분도 바뀌었어요.',canContinue:false,complete:false});
 assert.equal(v.get('review').hidden,false);assert.equal(v.get('next').hidden,false);assert.equal(v.get<HTMLButtonElement>('next').disabled,true);assert.equal(v.get('status').dataset.state,'outside');
 v.click('review');assert.equal(v.messages.at(-1).command,'review','the comparison is reachable from the blocked state');
 v.get('review').focus();v.update({...step,canContinue:true,status:'matched'});
 assert.equal(v.get('review').hidden,true);assert.equal(v.document.activeElement?.id,'next','recovery keeps focus on a visible action');v.close();
});
test('preview fixture and theme messages never replace the current host state',()=>{
 const v=view();v.update({...step,canContinue:true,status:'matched'});
 for(const data of [{type:'theme',name:'light'},{type:'fixture',name:'outside'},{type:'unknown'}]){
  v.window.dispatchEvent(new v.window.MessageEvent('message',{data}));
  assert.equal(v.get('home').hidden,true);assert.equal(v.get('guide').hidden,false);
  assert.equal(v.get('after').textContent,step.after);assert.equal(v.get<HTMLButtonElement>('next').disabled,false);
 }
 v.update({});v.window.dispatchEvent(new v.window.MessageEvent('message',{data:{type:'focusIntent'}}));
 assert.equal(v.document.activeElement?.id,'intent','the real focus control message is still handled');v.close();
});
test('location and shortcut route correctly without a duplicate location button',()=>{
 const v=view();v.update({...step,canContinue:true});v.click('focus');assert.equal(v.messages.at(-1).command,'focus');
 assert.equal(v.document.querySelectorAll('[data-command="focus"]').length,1);
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,altKey:true,cancelable:true}));assert.equal(v.messages.at(-1).command,'next');
 v.close();const windows=view(false);assert.match(windows.get('next').textContent||'',/Ctrl Alt/);assert.doesNotMatch(windows.get('next').textContent||'',/⌘/);windows.close();
});
test('before-code disclosure persists during typing and resets for a new step',()=>{
 const v=view();v.update(step);v.get<HTMLDetailsElement>('original').open=true;
 v.update({...step,status:'editing'});assert.equal(v.get<HTMLDetailsElement>('original').open,true);
 v.update({...step,step:2});assert.equal(v.get<HTMLDetailsElement>('original').open,false);v.close();
});
test('untrusted code, intent, filenames and errors are rendered as text',()=>{
 const v=view();const hostile='<img src=x onerror="window.hacked=true">';v.update({...step,title:hostile,file:hostile,after:hostile,reason:hostile,error:hostile,notice:hostile});
 assert.equal(v.document.querySelectorAll('img').length,0);assert.equal(v.get('after').textContent,hostile);assert.equal(v.get('error').textContent,hostile);assert.equal((v.window as any).hacked,undefined);v.close();
});
test('completion and ending move webview focus to a visible control',()=>{
 const v=view();v.update({...step,canContinue:true});v.get('next').focus();assert.equal(v.document.hasFocus(),true);
 v.update({...step,complete:true,canContinue:true});assert.equal(v.document.activeElement?.id,'review');
 v.update({});assert.equal(v.document.activeElement?.id,'intent');v.close();
});
test('error, recovery, connection and empty fields have no stale text',()=>{
 const v=view();v.update({error:'연결 오류',notice:'첫 연결',connected:true});assert.equal(v.get('error').hidden,false);assert.equal(v.get('notice').hidden,false);
 v.update({});assert.equal(v.get('error').hidden,true);assert.equal(v.get('notice').hidden,true);assert.equal(v.get('connect').hidden,false);assert.equal(v.get('account-options').hidden,true);v.close();
});
test('every rendered command has a host allowlist entry and every button has an accessible name',()=>{
 const v=view();for(const b of v.document.querySelectorAll<HTMLButtonElement>('button')){assert.ok((b.getAttribute('aria-label')||b.textContent||'').trim()||['file','model'].includes(b.id),b.outerHTML);if(b.dataset.command)assert.ok(PANEL_COMMANDS.has(b.dataset.command),b.dataset.command);}
 const csp=v.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');assert.match(csp||'',/default-src 'none'/);assert.match(csp||'',/nonce-test-nonce/);
 assert.equal(v.document.querySelectorAll('[style]').length,0,'inline style attributes would be blocked by the production nonce-only policy');
 assert.equal(v.get('after').getAttribute('aria-label'),'제안 코드');v.close();
});
