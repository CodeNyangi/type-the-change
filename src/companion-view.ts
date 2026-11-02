import type {CompanionState} from './companion.js';
export const COMPANION_COMMANDS=new Set(['prepareLesson','refreshLesson','openLessonDiff','selectChat','refreshChats','moreChats','olderActivity','olderEdits','learnLatest','openCodexThread','pickWorktree','openSourceControl','followEditor','openChange','reviewRecorded','openReviewDiff','practiceChange','comparePractice','openReviewSource','hunk','clearReview','setupLive','configureCodex','chooseLanguage','moveView','tutorial','watchWalkthrough','showLearning','import','loadPending']);

/** Only material needed to understand a change crosses into the learner view. */
export function learningDisplay(s:CompanionState,projectPaths:string[]=[]){
 const canonical=(value:string)=>value.replace(/^\/tmp\//,'/private/tmp/').replace(/^\/var\//,'/private/var/').replace(/\/$/,'');
 const sameProject=!projectPaths.length||s.roots.some(root=>projectPaths.some(project=>canonical(root.path)===canonical(project)));
 return {threads:s.threads.map(({id,title,cwd})=>({id,title,cwd})),nextThreads:s.nextThreads,selected:s.selected?{id:s.selected.id,title:s.selected.title}:undefined,
  projectPaths:[...projectPaths,...(sameProject?s.roots.filter(root=>!root.unavailable).map(root=>root.path):[])],loading:s.loading,error:s.error,
  lesson:s.lesson,lessonStatus:s.lessonStatus,lessonRequest:s.lessonRequest};
}

export function companionHtml(nonce:string,korean:boolean){
 const t=(ko:string,en:string)=>korean?ko:en;
 const labels={choose:t('작업 선택','Choose a task'),more:t('더 보기','More'),other:t('다른 프로젝트','Other projects'),thisProject:t('현재 프로젝트','This project'),all:t('모든 프로젝트','All projects'),recent:t('최근 작업','Recent tasks'),
  empty:t('이 프로젝트의 작업이 없습니다.','No tasks in this project.'),missing:t('아직 표시할 코드 설명이 없습니다.','No code explanation available yet.'),
  checking:t('기록 읽는 중…','Reading history…'),unverified:t('설명의 코드와 원래 수정이 일치하지 않습니다.','The explanation does not match the recorded code.'),
  send:t('이 채팅에 보내기','Send to this chat'),sending:t('전달 중…','Sending…'),queued:t('Codex에 전달했습니다.','Sent to Codex.'),
  unsupported:t('Codex 업데이트가 필요합니다.','Update Codex to send this request.'),failed:t('전달하지 못했습니다. 다시 보낼 수 있습니다.','Could not send. You can try again.'),
  uncertain:t('전달 여부를 원래 Codex 채팅에서 확인하세요.','Check delivery in the original Codex chat.'),
  error:t('Codex 기록을 연결하지 못했습니다.','Could not connect to Codex history.')};
 return String.raw`<!doctype html><html lang="${korean?'ko':'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;padding:16px;color:var(--vscode-foreground,#ddd);background:var(--vscode-sideBar-background,#1e1e1e);font:13px/1.6 var(--vscode-font-family,system-ui)}button,input{font:inherit;color:inherit}button{cursor:pointer;background:transparent;border:1px solid var(--vscode-widget-border,#555);border-radius:6px;padding:8px 11px;overflow-wrap:anywhere}button:not(:disabled):hover{background:var(--vscode-list-hoverBackground,#333)}button:disabled{opacity:.65;cursor:not-allowed}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder,#58a6ff);outline-offset:2px}.quiet{border:0;color:var(--vscode-descriptionForeground,#aaa);padding:5px;font-size:12px}.primary{background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff);border:0}.primary:not(:disabled):hover{background:var(--vscode-button-hoverBackground,#006cbe);color:var(--vscode-button-foreground,#fff)}header,.row{display:flex;align-items:center;gap:8px}.grow,#chat-toggle{flex:1;min-width:0}#chat-toggle{border:0;padding:3px 0;font-weight:600;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#settings-toggle{font-size:18px;line-height:1}#picker{margin:14px 0 24px}input{width:100%;background:var(--vscode-input-background,#292929);border:1px solid var(--vscode-input-border,#555);border-radius:5px;padding:7px;margin:8px 0}#thread-list button{display:block;text-align:left;width:100%;border:0;margin:3px 0}#thread-list small{display:block;font-size:11px;color:var(--vscode-descriptionForeground,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#thread-list{max-height:350px;overflow:auto}#lesson,#welcome,#request-sheet{margin:22px 0 12px}h1{font-size:20px;line-height:1.45;margin:0 0 14px;overflow-wrap:anywhere}h2{font-size:15px;margin:0 0 12px}p{overflow-wrap:anywhere;margin:10px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;margin:8px 0 0;padding:12px;border-radius:6px;background:var(--vscode-textCodeBlock-background,#292929);font:12px/1.65 var(--vscode-editor-font-family,monospace);max-height:340px}#explanation{line-height:1.8}.muted,summary{font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}summary{cursor:pointer}#before-details{margin:12px 0}#source-file{margin:18px 0 6px;font:11px var(--vscode-editor-font-family,monospace)}#open-diff{margin-top:12px}footer{margin-top:24px}#settings{margin:10px 0 20px;padding:8px;border:1px solid var(--vscode-widget-border,#555);border-radius:6px}#settings>button{display:block;text-align:left;width:100%}#settings .row{flex-wrap:wrap;border-top:1px solid var(--vscode-widget-border,#555);margin-top:8px;padding-top:8px}#error{color:var(--vscode-errorForeground,#f48771)}#request-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}#request-target{font-weight:600}#request-status{min-height:1.6em}#request-state{font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}@media(max-width:340px){body{padding:12px}h1{font-size:18px}}
</style></head><body>
<header><button id="chat-toggle" aria-expanded="false">${labels.choose}</button><button id="settings-toggle" class="quiet" aria-label="${labels.more}" aria-expanded="false">⋯</button></header>
<section id="settings" hidden><button id="prepare" class="quiet">${t('이 채팅에 코드 설명 부탁하기…','Ask this chat for a code explanation…')}</button><button id="retry" class="quiet">${t('기록 새로고침','Refresh history')}</button><div class="row"><button class="quiet" data-command="chooseLanguage">${t('언어','Language')}</button><button class="quiet" data-command="moveView">${t('위치','Position')}</button><button class="quiet" data-command="configureCodex">${t('Codex 위치','Codex location')}</button><button class="quiet" data-command="setupLive">${t('실시간 알림','Live notifications')}</button></div></section>
<section id="picker"><div class="row"><strong id="scope" class="grow"></strong><button id="scope-toggle" class="quiet">${labels.other}</button><button id="refresh" class="quiet" aria-label="${t('목록 새로고침','Refresh task list')}">↻</button></div><input id="chat-filter" aria-label="${t('작업 찾기','Find a task')}" placeholder="${t('작업 찾기','Find a task')}"><div id="thread-list"></div><button id="show-more" class="quiet">${labels.more}</button><p id="empty" class="muted" hidden>${labels.empty}</p><button id="older" class="quiet" hidden>${t('이전 작업 더 찾기','Find older tasks')}</button></section>
<p id="error" role="alert" hidden></p>
<section id="selected" hidden>
<p id="welcome" class="muted" role="status"></p>
<section id="lesson" hidden><h1 id="lesson-title"></h1><p id="explanation"></p><p id="source-file" class="muted"></p><pre id="after"></pre><details id="before-details"><summary>${t('이전 코드','Previous code')}</summary><pre id="before"></pre></details><button class="quiet" id="open-diff">${t('변경 비교','Compare change')}</button></section>
<section id="request-sheet" role="dialog" aria-modal="false" aria-labelledby="request-heading" hidden><h2 id="request-heading">${t('Codex에 보낼 요청','Request to Codex')}</h2><p id="request-target"></p><p>${t('이미 바꾼 코드 하나를 골라, 왜 바꿨는지와 짧은 전후 코드를 설명해 줘. 새 수정이나 실행은 하지 마.','Choose one change you already made. Explain why, with short before/after code. Do not make edits or run anything new.')}</p><p id="request-status" class="muted" role="status"></p><div id="request-actions"><button id="request-confirm" class="primary">${labels.send}</button><button id="request-cancel">${t('닫기','Close')}</button></div></section>
<p id="request-state" role="status" hidden></p>
</section><footer><button id="codex" class="quiet">${t('Codex에서 열기 ↗','Open in Codex ↗')}</button></footer>
<script nonce="${nonce}">
const api=acquireVsCodeApi(),$=id=>document.getElementById(id),labels=${JSON.stringify(labels)};
let state={},thread='',cardId='',requestTarget='',localPending='',localUncertain='',allProjects=false,limit=5,threadKey='',ackTimer;
const send=(command,extra={})=>api.postMessage({command,...extra});
const toggle=(id,button)=>{const open=$(id).hidden;$(id).hidden=!open;$(button).setAttribute('aria-expanded',String(open));return open;};
$('chat-toggle').onclick=()=>{if(toggle('picker','chat-toggle'))$('chat-filter').focus();};
$('settings-toggle').onclick=()=>toggle('settings','settings-toggle');
const closeSettings=()=>{$('settings').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');};
$('refresh').onclick=()=>send('refreshChats');$('older').onclick=()=>send('moreChats');
$('chat-filter').oninput=()=>{limit=5;renderThreads();};$('show-more').onclick=()=>{limit+=5;renderThreads();};$('scope-toggle').onclick=()=>{allProjects=!allProjects;limit=5;renderThreads();};
$('prepare').onclick=()=>{requestTarget=state.selected?.id||'';closeSettings();render();if(requestTarget)($('request-confirm').disabled?$('request-cancel'):$('request-confirm')).focus();};
$('request-cancel').onclick=()=>{requestTarget='';render();$('settings-toggle').focus();};
$('request-confirm').onclick=()=>{
 if(!requestTarget||requestTarget!==state.selected?.id||localPending||localUncertain||['sending','queued','uncertain'].includes(state.lessonRequest))return;
 const id=requestTarget;localPending=id;render();send('prepareLesson',{id});clearTimeout(ackTimer);
 ackTimer=setTimeout(()=>{if(localPending===id){localPending='';localUncertain=id;render();}},8000);
};
$('retry').onclick=()=>{closeSettings();send('refreshLesson');};
$('open-diff').onclick=()=>send('openLessonDiff');$('codex').onclick=()=>send('openCodexThread');
document.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>{closeSettings();send(button.dataset.command);});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(requestTarget){requestTarget='';render();$('settings-toggle').focus();}else if(!$('settings').hidden){closeSettings();$('settings-toggle').focus();}else if(!$('picker').hidden&&state.selected){$('picker').hidden=true;$('chat-toggle').setAttribute('aria-expanded','false');$('chat-toggle').focus();}else return;event.preventDefault();});
const canonical=value=>value?.replace(/^\/tmp\//,'/private/tmp/').replace(/^\/var\//,'/private/var/').replace(/\/$/,'');
function renderThreads(){
 const q=$('chat-filter').value.toLowerCase(),roots=(state.projectPaths||[]).map(canonical);
 const threads=(state.threads||[]).filter(item=>(allProjects||!roots.length||roots.some(root=>canonical(item.cwd)===root||canonical(item.cwd)?.startsWith(root+'/')))&&item.title.toLowerCase().includes(q));
 const key=JSON.stringify([threads,limit,allProjects,state.selected?.id]);if(key!==threadKey){threadKey=key;const list=$('thread-list');list.replaceChildren();for(const item of threads.slice(0,limit)){const button=document.createElement('button');button.textContent=item.title;button.setAttribute('aria-current',String(item.id===state.selected?.id));if(allProjects){const project=document.createElement('small');project.textContent=item.cwd.split(/[\\/]/).filter(Boolean).at(-1);button.append(project);}button.onclick=()=>send('selectChat',{id:item.id});list.append(button);}}
 $('scope').textContent=allProjects?labels.all:state.projectPaths?.[0]?.split(/[\\/]/).filter(Boolean).at(-1)||labels.recent;$('scope-toggle').textContent=allProjects?labels.thisProject:labels.other;$('scope-toggle').hidden=!roots.length;$('show-more').hidden=threads.length<=limit;$('empty').hidden=!!threads.length||state.loading;$('older').hidden=!state.nextThreads;
}
function displayCode(code){const lines=code.replace(/\r\n/g,'\n').trimEnd().split('\n'),indent=Math.min(...lines.filter(line=>line.trim()).map(line=>line.match(/^\s*/)[0].length));return lines.map(line=>line.slice(Math.min(indent,line.length))).join('\n');}
function renderCard(){
 const lesson=state.lesson,card=lesson?.card;if(!card)return;
 if(cardId!==lesson.id){cardId=lesson.id;$('before-details').open=false;}
 $('lesson-title').textContent=lesson.origin==='context'?${JSON.stringify(t('수정 당시 Codex의 설명','Codex context for this edit'))}:card.title;$('explanation').textContent=card.explanation;$('after').textContent=displayCode(card.source.after);$('before').textContent=displayCode(card.source.before);$('before-details').hidden=!card.source.before;$('source-file').textContent=lesson.file;$('open-diff').title=lesson.file;
}
function render(){
 if(thread!==state.selected?.id){thread=state.selected?.id||'';requestTarget='';localPending='';localUncertain='';clearTimeout(ackTimer);cardId='';$('picker').hidden=!!thread;$('settings').hidden=true;$('chat-filter').value='';}
 const draft=!!requestTarget&&requestTarget===thread,request=localUncertain&&localUncertain===thread?'uncertain':localPending&&localPending===thread?'sending':state.lessonRequest;
 $('chat-toggle').textContent=state.selected?.title||labels.choose;$('chat-toggle').setAttribute('aria-expanded',String(!$('picker').hidden));$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));$('selected').hidden=!state.selected;$('codex').hidden=!state.selected;$('prepare').hidden=!state.selected;$('retry').hidden=!state.selected;
 $('error').hidden=!state.error&&!state.actionError;$('error').textContent=state.actionError||(state.error?labels.error:'');
 $('welcome').hidden=!!state.lesson||draft||!!state.error||!!state.actionError;$('welcome').textContent=state.loading||state.lessonStatus==='checking'?labels.checking:state.lessonStatus==='unverified'?labels.unverified:labels.missing;$('lesson').hidden=!state.lesson||draft;
 $('request-sheet').hidden=!draft;$('request-target').textContent=draft?state.selected.title:'';$('request-confirm').disabled=['sending','queued','uncertain'].includes(request);$('request-confirm').textContent=request==='sending'?labels.sending:request==='queued'?labels.queued:labels.send;$('request-status').textContent=labels[request]||'';$('request-status').setAttribute('role',['failed','unsupported','uncertain'].includes(request)?'alert':'status');
 $('request-state').hidden=draft||!request;$('request-state').textContent=labels[request]||'';
 renderThreads();renderCard();
}
window.addEventListener('message',event=>{const message=event.data;if(message.type==='showHelp'){$('settings').hidden=false;$('settings-toggle').setAttribute('aria-expanded','true');return;}if(message.type)return;state=message.companion||{};if(localUncertain===state.selected?.id&&state.lessonRequest)localUncertain='';if(localPending===state.selected?.id&&(state.lessonRequest||state.actionError)){localPending='';clearTimeout(ackTimer);}render();if(Number.isSafeInteger(message.revision))send('rendered',{revision:message.revision});});
send('ready');
</script></body></html>`;
}
