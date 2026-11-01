/** Same production webview; the blue frame is an explicitly simulated extension host. */
import {createServer} from 'node:http';
import {panelHtml} from '../src/panel-view.js';
const nonce='local-preview-only';
const bootstrap=`
let panelState={files:[],connected:false};let step=0;
const stages=[
 {title:'음수 가격 제외',file:'price.ts',line:3,reason:'0 이상의 가격만 합계에 포함합니다.',before:'    result += price;',after:'    if (price >= 0) {\\n      result += price;\\n    }',step:1,total:2},
 {title:'합계 반환',file:'price.ts',line:6,reason:'계산한 합계를 호출한 곳으로 돌려줍니다.',before:'  return 0;',after:'  return result;',step:2,total:2}
];
function update(s){panelState=s;window.postMessage(s,'*');}
function guide(i){step=i;update({...panelState,...stages[i],status:'untouched',message:'',canContinue:false,complete:false,busy:false,error:''});}
window.acquireVsCodeApi=()=>({getState:()=>({intent:sessionStorage.getItem('draft')||''}),setState:s=>sessionStorage.setItem('draft',s.intent),postMessage:m=>{
 parent.postMessage({type:'command',...m},'*');
 switch(m.command){
 case'ready':update(panelState);break;
 case'chooseFiles':update({...panelState,files:['price.ts']});break;
 case'chooseModel':update({...panelState,model:panelState.model==='모델 A'?'모델 B':'모델 A'});break;
 case'generate':update({...panelState,busy:true,phase:'수정안을 만드는 중',error:''});break;
 case'demo':case'import':case'loadPending':guide(0);break;
 case'next':if(panelState.canContinue){if(step===0)guide(1);else update({...panelState,complete:true});}break;
 case'focus':parent.postMessage({type:'focusEditor'},'*');break;
 case'stop':update({files:['price.ts'],connected:panelState.connected,model:panelState.model});break;
 case'signIn':update({...panelState,connected:true,model:'모델 A',notice:'연결됐어요. AI 요청에는 ChatGPT 구독 사용량이 쓰입니다.'});break;
 case'signOut':update({...panelState,connected:false,notice:''});break;
 case'review':parent.postMessage({type:'diff',before:panelState.before,after:panelState.after},'*');break;
 case'mcpConfig':parent.postMessage({type:'config'},'*');break;
 }
}});
window.addEventListener('message',({data:m})=>{if(m?.type==='fixture'){
 if(m.name==='generated')guide(0);
 if(m.name==='outside')update({...panelState,status:'outside',message:'다른 부분도 바뀌었어요. 변경 내역을 확인하세요.',canContinue:false,complete:false});
 if(m.name==='error')update({...panelState,busy:false,error:'연결할 수 없어요. 다시 시도해 주세요.'});
 if(m.name==='delete')update({...panelState,...stages[0],title:'디버그 출력 제거',before:'  console.log(result);',after:'',reason:'계산 중간값을 출력하던 디버그 코드를 제거합니다.',step:1,total:1,complete:false,status:'untouched',message:'',canContinue:false,busy:false,error:'',notice:''});
 if(m.name==='long')update({...panelState,...stages[0],file:'src/한글 경로/deeply/nested/components/long-file-name.ts',title:'긴 제목에서도 코드를 읽고 수정할 수 있도록 화면을 확인합니다',after:'const result = items.filter(item => item.price >= 0).map(item => ({ ...item, total: item.price * item.quantity }));',complete:false,status:'untouched',message:'',canContinue:false,busy:false,error:'',notice:''});
 if(m.name==='home')update({files:[],connected:false});
 if(m.name==='typing'&&panelState.file){const matched=m.value===panelState.after;update({...panelState,complete:false,status:matched?'matched':'editing',message:matched?'제안과 일치':'',canContinue:matched});}
}});
`;
const index=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>Type the Change · UI 검증</title><style>body{margin:0;background:#17191c;color:#ddd;font:13px system-ui}header{padding:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#12334b}button,select{font:inherit;padding:5px 9px}main{display:flex;height:calc(100vh - 95px)}aside{flex:1;padding:24px;min-width:200px}textarea{box-sizing:border-box;width:100%;height:220px;padding:18px;background:#202020;color:#eee;font:14px/1.8 monospace;border:1px solid #555;border-radius:5px}iframe{border:0;width:460px;height:100%;background:#1e1e1e}p{color:#aaa}pre{white-space:pre-wrap}#events{height:130px;overflow:auto;font:12px monospace}</style>
<header><strong>UI 검증 · 모의 연결</strong><label>보기 <select id="fixture"><option value="home">시작</option><option value="generated">입력</option><option value="delete">삭제</option><option value="outside">범위 밖</option><option value="error">오류</option><option value="long">긴 코드</option></select></label><label>폭 <select id="width"><option>460</option><option>300</option><option>720</option></select></label><label>테마 <select id="theme"><option value="dark">어둡게</option><option value="light">밝게</option><option value="contrast">고대비</option></select></label><button id="resolve">모의 응답 완료</button></header>
<main><aside><p>브라우저 입력 영역 · 실제 VS Code 편집기는 별도 통합 테스트</p><textarea id="editor" aria-label="검증용 코드 입력" spellcheck="false"></textarea><p id="result" role="status"></p><pre id="detail"></pre><p>버튼 전달 기록</p><pre id="events"></pre></aside><iframe id="panel" title="실제 확장 웹뷰" src="/panel"></iframe></main>
<script>const frame=document.querySelector('iframe');const editor=document.querySelector('#editor');const fixture=(name,extra={})=>frame.contentWindow.postMessage({type:'fixture',name,...extra},'*');document.querySelector('#fixture').onchange=e=>fixture(e.target.value);document.querySelector('#width').onchange=e=>frame.style.width=e.target.value+'px';document.querySelector('#theme').onchange=e=>frame.contentWindow.postMessage({type:'theme',name:e.target.value},'*');document.querySelector('#resolve').onclick=()=>fixture('generated');editor.oninput=()=>fixture('typing',{value:editor.value});window.onmessage=({data:m})=>{if(m?.type==='command'){document.querySelector('#events').textContent+=m.command+'\\n';}if(m?.type==='focusEditor')editor.focus();if(m?.type==='diff')document.querySelector('#detail').textContent='변경 전\\n'+m.before+'\\n현재\\n'+m.after;if(m?.type==='config')document.querySelector('#detail').textContent='MCP 설정 열기 전달 확인';};</script></html>`;
createServer((req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
 if(req.url==='/panel'){
  let html=panelHtml(nonce,true);
  const theme=`window.addEventListener('message',({data:m})=>{if(m?.type!=='theme')return;const theme=m.name;document.documentElement.style.cssText=theme==='light'?'--vscode-foreground:#333;--vscode-editor-background:#fff;--vscode-descriptionForeground:#666;--vscode-input-background:#fff;--vscode-input-foreground:#222;--vscode-button-secondaryBackground:#eee;--vscode-button-secondaryForeground:#333;--vscode-textCodeBlock-background:#f3f3f3;--vscode-input-border:#aaa;--vscode-testing-iconPassed:#38743a;--vscode-editorWarning-foreground:#855f00;--vscode-errorForeground:#a1260d':theme==='contrast'?'--vscode-foreground:#fff;--vscode-editor-background:#000;--vscode-descriptionForeground:#fff;--vscode-input-border:#fff;--vscode-input-foreground:#fff;--vscode-input-placeholderForeground:#a6a6a6;--vscode-focusBorder:#f38518;--vscode-contrastBorder:#6fc3df;--vscode-button-border:#fff;--vscode-button-background:#000;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#0f4a85;--vscode-widget-border:#6fc3df;--vscode-textCodeBlock-background:#000;--vscode-input-background:#000;--vscode-editorWarning-foreground:#ffcc00;--vscode-errorForeground:#f48771':'';});`;
  html=html.replace('<script nonce=',`<script nonce="${nonce}">${bootstrap+theme}</script><script nonce=`);
  res.end(html);
 }else res.end(index);
}).listen(8790,'127.0.0.1',()=>console.log('UI preview: http://127.0.0.1:8790 (mock host, real panel)'));
