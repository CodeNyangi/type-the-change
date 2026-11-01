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
const step:PanelState={title:'값 변경',file:'price.ts',line:3,before:'old();',after:'new();',reason:'반환값을 확인합니다.',step:1,total:2,status:'untouched',message:'선택된 코드를 직접 바꿔 보세요.',canContinue:true,canKeep:true,judgment:{phase:'edit',prediction:'반환값이 달라진다',evidence:''}};

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
test('prediction comes before revealing a proposal and requires one short note',()=>{
 const v=view();v.update({...step,judgment:{phase:'predict',prediction:'',evidence:''}});
 assert.equal(v.get('prediction-form').hidden,false);assert.equal(v.get('proposal').hidden,true);assert.equal(v.get<HTMLButtonElement>('predict').disabled,true);
 v.get<HTMLTextAreaElement>('prediction').value='  결과 30  ';v.get('prediction').dispatchEvent(new v.window.Event('input'));
 v.get('prediction-form').dispatchEvent(new v.window.Event('submit',{cancelable:true}));assert.deepEqual(v.messages.at(-1),{command:'predict',prediction:'결과 30'});v.close();
});
test('a match enables comparison, never automatic acceptance',()=>{
 const v=view();v.update({...step,status:'matched'});assert.equal(v.get('next').hidden,false);assert.equal(v.get('reflection').hidden,true);assert.equal(v.get<HTMLDetailsElement>('proposal').open,false);
 v.get('next').click();assert.deepEqual(v.messages.at(-1),{command:'next'});assert.equal(v.messages.some(m=>m.command==='decide'),false);v.close();
});
test('human decisions carry evidence and accept alternatives independently of equality',()=>{
 const v=view();v.update({...step,status:'editing',judgment:{phase:'review',prediction:'30',evidence:'',reviewedHash:'one'}});
 assert.equal(v.get('reflection').hidden,false);assert.equal(v.get<HTMLButtonElement>('keep').disabled,true);assert.equal(v.get<HTMLButtonElement>('reject').disabled,true);
 v.get('defer').click();assert.deepEqual(v.messages.at(-1),{command:'decide',decision:'defer',evidence:''});
 v.get<HTMLTextAreaElement>('evidence').value='  다른 구현도 두 입력에서 30  ';v.get('evidence').dispatchEvent(new v.window.Event('input'));
 for(const decision of ['keep','reject']){v.get(decision).click();assert.deepEqual(v.messages.at(-1),{command:'decide',decision,evidence:'다른 구현도 두 입력에서 30'});}
 v.update({...step,canKeep:false,status:'outside',judgment:{phase:'review',prediction:'30',evidence:'',reviewedHash:'two'}});
 assert.equal(v.get<HTMLTextAreaElement>('evidence').value,'','a different reviewed snapshot clears old evidence');assert.equal(v.get<HTMLButtonElement>('keep').disabled,true);v.close();
});
test('complete, rejected and deferred outcomes remain visibly distinct',()=>{
 const v=view();for(const [decision,label] of [['keep','내 변경 유지'],['reject','제안 거절'],['defer','보류']] as const){
 v.update({...step,complete:decision==='keep',judgment:{phase:'done',prediction:'30',evidence:'확인한 입력',decision}});
 assert.match(v.get('status').textContent||'',new RegExp(label));assert.equal(v.get('review').hidden,false);assert.equal(v.get('again').hidden,false);assert.equal(v.get('record').hidden,false);
 }v.close();
});
test('deletion remains explicit when the optional proposal is opened',()=>{
 const v=view();v.update({...step,after:''});assert.equal(v.get('after').hidden,true);assert.equal(v.get('delete-hint').hidden,false);assert.match(v.get('delete-hint').textContent||'',/지우세요/);v.close();
});
test('proposal disclosure persists while typing and resets on the next step or session',()=>{
 const v=view();v.update(step);v.get<HTMLDetailsElement>('proposal').open=true;v.get<HTMLDetailsElement>('original').open=true;
 v.update({...step,status:'editing'});assert.equal(v.get<HTMLDetailsElement>('proposal').open,true);assert.equal(v.get<HTMLDetailsElement>('original').open,true);
 v.update({...step,step:2});assert.equal(v.get<HTMLDetailsElement>('proposal').open,false);assert.equal(v.get<HTMLDetailsElement>('original').open,false);
 v.get<HTMLDetailsElement>('proposal').open=true;v.update({});v.update({...step,step:2});assert.equal(v.get<HTMLDetailsElement>('proposal').open,false);v.close();
});
test('comparison shortcut works for alternative text and cannot submit a judgment',()=>{
 const v=view();v.update({...step,status:'editing'});v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,altKey:true,cancelable:true}));assert.equal(v.messages.at(-1).command,'next');
 v.update({...step,judgment:{phase:'review',prediction:'30',evidence:'proof'}});const count=v.messages.length;
 v.window.dispatchEvent(new v.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,altKey:true,cancelable:true}));assert.equal(v.messages.length,count);
 v.close();const windows=view(false);assert.match(windows.get('next').textContent||'',/Ctrl Alt/);windows.close();
});
test('phase changes keep keyboard focus on visible controls',()=>{
 const v=view();v.update(step);v.get('next').focus();
 v.update({...step,judgment:{phase:'review',prediction:'30',evidence:'',reviewedHash:'a'}});assert.equal(v.document.activeElement?.id,'evidence');
 v.get('defer').focus();v.update({...step,judgment:{phase:'done',prediction:'30',evidence:'',decision:'defer'}});assert.equal(v.document.activeElement?.id,'review');
 v.update({});assert.equal(v.document.activeElement?.id,'intent');v.close();
});
test('one primary action per phase keeps the next action clear',()=>{
 const v=view();for(const [phase,id] of [['predict','predict'],['edit','next'],['review','keep'],['done','review']] as const){
 v.update({...step,judgment:{phase,prediction:'30',evidence:'proof',decision:phase==='done'?'keep':undefined}});
 const actions=[...v.get('guide').querySelectorAll<HTMLButtonElement>('button')].filter(b=>!b.closest('[hidden]')&&!b.classList.contains('quiet')&&!b.classList.contains('secondary'));
 assert.deepEqual(actions.map(b=>b.id),[id]);}v.close();
});
test('new steps do not leave focus inside a collapsed proposal',()=>{
 const v=view();v.update(step);v.get<HTMLDetailsElement>('proposal').open=true;v.get('original').querySelector('summary')!.focus();
 v.update({...step,step:2,judgment:{phase:'predict',prediction:'',evidence:''}});assert.equal(v.document.activeElement?.id,'prediction');v.close();
});
test('theme messages and untrusted source or notes cannot replace state or inject markup',()=>{
 const v=view();const hostile='<img src=x onerror="window.hacked=true">';v.update({...step,title:hostile,file:hostile,after:hostile,reason:hostile,error:hostile,judgment:{phase:'done',prediction:hostile,evidence:hostile,decision:'reject'}});
 for(const type of ['theme','fixture','unknown'])v.window.dispatchEvent(new v.window.MessageEvent('message',{data:{type}}));
 assert.equal(v.get('guide').hidden,false);assert.equal(v.document.querySelectorAll('img').length,0);assert.equal(v.get('after').textContent,hostile);assert.equal((v.window as any).hacked,undefined);v.close();
});
test('error and connection recovery clear stale text',()=>{
 const v=view();v.update({error:'연결 오류',notice:'첫 연결',connected:true});assert.equal(v.get('error').hidden,false);v.update({});assert.equal(v.get('error').hidden,true);assert.equal(v.get('notice').hidden,true);assert.equal(v.get('connect').hidden,false);v.close();
});
test('commands and accessible names stay within the CSP and host allowlist',()=>{
 const v=view();for(const b of v.document.querySelectorAll<HTMLButtonElement>('button')){assert.ok((b.getAttribute('aria-label')||b.textContent||'').trim()||['file','model'].includes(b.id),b.outerHTML);if(b.dataset.command)assert.ok(PANEL_COMMANDS.has(b.dataset.command),b.dataset.command);}
 const csp=v.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');assert.match(csp||'',/default-src 'none'/);assert.match(csp||'',/nonce-test-nonce/);assert.equal(v.document.querySelectorAll('[style]').length,0);v.close();
});
