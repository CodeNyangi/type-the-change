export function chatHome(korean: boolean, sendKey: string): string {
  const t = (ko: string, en: string) => korean ? ko : en;
  return `<section id="home">
<div class="project-bar"><span id="project-name"></span><button id="open-folder" type="button" class="quiet" data-command="openFolder">${t('프로젝트 열기', 'Open project')}</button><button id="new-chat" class="quiet" data-command="newChat">＋ ${t('새 대화', 'New chat')}</button></div>
<div id="messages" aria-label="${t('대화', 'Conversation')}" role="log" aria-live="off"></div>
<div id="learn-next" hidden><button class="secondary" data-command="learnFromAnswer">${t('이 변경으로 배워 보기','Learn through this change')}</button></div>
<div id="proposal-ready" hidden><button class="secondary" data-command="openProposal"><span id="proposal-title">${t('변경 제안 열기','Open suggestion')}</span> →</button></div>
<div id="loading" hidden><div class="row"><span class="activity-dot" aria-hidden="true"></span><span id="phase" role="status"></span><span id="elapsed" class="muted"></span><button class="quiet" data-command="stop">${t('중단', 'Stop')}</button></div></div>
<div id="feedback" hidden><p id="error" class="error" role="alert" hidden></p><button id="retry" type="button" class="secondary" hidden>${t('다시 시도', 'Try again')}</button></div>
<form id="request"><div class="composer"><textarea id="intent" rows="3" aria-label="${t('메시지', 'Message')}" maxlength="4000" placeholder="${t('질문하거나 작업을 요청하세요', 'Ask a question or describe a task')}" spellcheck="false"></textarea><div class="row context"><button id="model" type="button" class="quiet" data-command="chooseModel">${t('자동', 'Auto')}</button><button id="generate" type="submit" disabled><span id="generate-label">${t('보내기', 'Send')}</span><kbd>${sendKey}</kbd></button></div></div></form>
<div id="account"><section id="connection-guide" class="connection-card"><h2>${t('Codex 연결', 'Connect Codex')}</h2><p>${t('Codex가 코드를 살펴보고, 직접 고쳐 볼 지점을 안내합니다.', 'Codex explores your code and prepares changes for you to learn from.')}</p><button id="connect" class="secondary" data-command="signIn">${t('Codex 연결', 'Connect Codex')}</button><details id="connection-steps"><summary>${t('처음 연결할 때', 'Connecting for the first time')}</summary><ol><li><span>${t('이미 Codex에 로그인했다면 그 계정을 사용합니다.', 'If you are already signed in to Codex, your existing account is used.')}</span></li><li><span>${t('로그인이 필요하면 열리는 브라우저에서 ChatGPT 계정으로 로그인하세요.', 'If needed, sign in with your ChatGPT account in the browser that opens.')}</span></li><li><span>${t('이 화면으로 돌아오면 작성한 요청에서 이어집니다.', 'Return here to continue your request.')}</span></li></ol></details><p id="connection-wait" role="status" hidden>${t('Codex 연결을 기다리는 중입니다.', 'Waiting for Codex to connect.')}</p></section></div>
<details id="chat-options"><summary>${t('설정 및 도구', 'Settings & tools')}</summary><div class="options"><button id="language" class="quiet" data-command="chooseLanguage">${t('언어 · 한국어', 'Language · English')}</button><button id="files" class="quiet" data-command="chooseFiles">${t('파일 참고 자료 추가', 'Attach reference files')}</button><button id="use-current" class="quiet" data-command="useCurrentFile">${t('현재 파일 첨부', 'Attach current file')}</button><div id="account-options" hidden><button class="quiet" data-command="usage">${t('ChatGPT 사용량', 'ChatGPT usage')}</button><button id="codex-thread" class="quiet" data-command="openCodexThread" hidden>${t('Codex에서 작업 기록 보기', 'View task in Codex')}</button></div><button class="quiet" data-command="configureCodex">${t('Codex 실행 파일 설정', 'Choose Codex executable')}</button><div id="other"><button class="quiet" data-command="import">${t('수정안 가져오기', 'Import a suggestion')}</button><button class="quiet" data-command="loadPending">${t('MCP 수정안 열기', 'Open MCP suggestion')}</button><button class="quiet" data-command="mcpConfig">${t('MCP 연결 설정', 'MCP setup')}</button></div><button id="demo" class="quiet" data-command="demo">${t('수정·검사 연습', 'Practice editing & checking')}</button></div><p class="muted">${t('Codex가 프로젝트를 읽고 제안합니다. 코드는 직접 수정하고 확인합니다.', 'Codex reads the project and suggests changes. You edit and check the code yourself.')}</p></details>
</section>`;
}
export const chatStyles = `
body{max-width:780px;padding:18px 20px}header{margin-bottom:14px}.brand{letter-spacing:.5px}
#home{display:flex;flex-direction:column;min-height:calc(100vh - 90px);padding-bottom:0}
.project-bar{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:26px;min-width:0}#project-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#new-chat{margin-left:auto;font-size:12px;white-space:nowrap}
#messages{flex:1;min-height:20px}.chat-message{margin:0 0 24px;overflow-wrap:anywhere}.chat-message[data-role=user]{background:var(--vscode-textCodeBlock-background,#333);padding:10px 14px;border-radius:12px;margin-left:20px;white-space:pre-wrap}.chat-message[data-role=assistant]{line-height:1.8}.message-body{white-space:pre-wrap}.message-body pre{white-space:pre;max-height:420px;font-size:12px;margin:10px 0}.message-body code{font-family:var(--vscode-editor-font-family,monospace);font-size:.94em;background:var(--vscode-textCodeBlock-background,#333);padding:1px 3px;border-radius:3px}.message-status{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:8px}
#request{position:sticky;bottom:0;background:var(--vscode-editor-background,#1e1e1e);padding:10px 0 4px;z-index:1}.composer textarea{min-height:76px;max-height:180px;resize:none;padding:12px 14px;font-size:13px}.context{border-top:0;padding:0 10px 8px}.context button{min-height:28px}#generate{padding:4px 10px;border-radius:7px;font-size:12px}#model{max-width:65%;font-size:11px}#loading{margin:0 0 10px;font-size:12px;color:var(--vscode-descriptionForeground)}#loading .row{justify-content:flex-start;flex-wrap:nowrap;gap:8px}#phase{overflow-wrap:anywhere;flex:1}#loading button{white-space:nowrap}.activity-dot{width:6px;height:6px;border-radius:50%;background:var(--vscode-progressBar-background,#1e90ff);flex-shrink:0;animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.activity-dot{animation:none}}
#proposal-ready{margin:0 0 14px}#proposal-ready button{text-align:left;font-size:12px}#feedback{margin:0 0 12px}.connection-card{margin:14px 0;padding:14px}.connection-card h2{font-size:13px}#chat-options{margin:10px 0 0}#chat-options summary{font-size:11px}#chat-options .options{gap:5px}#chat-options button{font-size:12px}#account-options{margin:0;display:flex;gap:16px}#other{display:flex;flex-direction:column;align-items:flex-start}#chat-options .muted{margin:8px 0}
@media(max-width:400px){body{padding:12px}header{margin-bottom:10px}.project-bar{margin-bottom:16px}.composer textarea{min-height:76px}#generate kbd{display:none}}
`;
/** DOM-only formatting: provider content never becomes executable HTML or a URL. */
export const chatScript = String.raw`
let pendingIntent='',lastSent='',submittedCount=0;
function submitMessage(){
 if(!valid())return;lastSent=$('intent').value.trim();pendingIntent=lastSent;submittedCount=state.messages?.length||0;
 $('generate').disabled=true;$('loading').hidden=false;$('phase').textContent=labels.received;
 send('generate',{intent:lastSent});
}
function formatMessage(target,text){
 target.replaceChildren();
 const blocks=text.split(/(\x60\x60\x60[^\n]*\n[\s\S]*?(?:\x60\x60\x60|$))/g);
 for(const block of blocks){
  if(block.startsWith('\x60\x60\x60')){const pre=document.createElement('pre');pre.textContent=block.replace(/^\x60\x60\x60[^\n]*\n/,'').replace(/\x60\x60\x60$/,'');target.append(pre);continue;}
  for(const part of block.split(/(\x60[^\x60\n]+\x60|\*\*[^*\n]+\*\*)/g)){
   const tag=part.startsWith('\x60')?'code':part.startsWith('**')?'strong':null;
   if(!tag){target.append(document.createTextNode(part));continue;}
   const node=document.createElement(tag);node.textContent=part.slice(tag==='code'?1:2,tag==='code'?-1:-2);target.append(node);
  }
 }
}
function renderChat(s){
 const messages=s.messages||[],log=$('messages');
 if(pendingIntent&&(messages.at(-2)?.text===pendingIntent||s.error||!s.busy)){
  if(messages.some(m=>m.role==='user'&&m.text===pendingIntent)&&$('intent').value.trim()===pendingIntent){$('intent').value='';}
  pendingIntent='';
 }
 while(log.children.length>messages.length)log.lastElementChild.remove();
 for(let i=0;i<messages.length;i++){
  const message=messages[i];let node=log.children[i];
  if(!node){node=document.createElement('article');node.className='chat-message';const body=document.createElement('div');body.className='message-body';const status=document.createElement('div');status.className='message-status';node.append(body,status);log.append(node);}
  node.dataset.role=message.role;
  if(node._text!==message.text){if(message.role==='user')node.firstElementChild.textContent=message.text;else formatMessage(node.firstElementChild,message.text);node._text=message.text;}
  node.lastElementChild.textContent=message.status==='stopped'?labels.stopped:message.status==='error'?labels.incomplete:'';
  node.hidden=!message.text&&message.status==='streaming';
 }
 $('project-name').textContent=s.project||labels.noProject;$('open-folder').hidden=!!s.project;
 $('new-chat').disabled=!!s.busy;$('codex-thread').hidden=!s.codexThread;$('learn-next').hidden=!!s.busy||!!s.proposal||messages.at(-1)?.status!=='complete';$('proposal-ready').hidden=!s.proposal||!!s.busy;$('proposal-title').textContent=s.proposal?labels.learn+' · '+s.proposal:'';
 $('model').textContent=s.model||labels.auto;
 $('generate-label').textContent=labels.send;
 $('files').textContent=s.files?.length?labels.references+' ('+s.files.length+')':labels.references;
 $('files').title=s.files?.join('\n')||'';
 $('connect').hidden=!!s.connected||!!s.connecting;$('connection-guide').hidden=!!s.connected&&!s.connecting;$('connection-wait').hidden=!s.connecting;$('connection-steps').open=!!s.connecting;$('account-options').hidden=!s.connected;
 $('chat-options').querySelectorAll('button').forEach(button=>button.disabled=!!s.busy);
 updateElapsed();
}
function updateElapsed(){const seconds=state.startedAt?Math.max(0,Math.floor((Date.now()-state.startedAt)/1000)):0;$('elapsed').textContent=seconds?seconds+'s':'';}
setInterval(updateElapsed,1000);
`;
