import type {CompanionState} from './companion.js';
export const COMPANION_COMMANDS=new Set(['prepareLesson','refreshLesson','openLessonDiff','selectChat','refreshChats','moreChats','olderActivity','olderEdits','learnLatest','openCodexThread','pickWorktree','openSourceControl','followEditor','openChange','reviewRecorded','openReviewDiff','practiceChange','comparePractice','openReviewSource','hunk','clearReview','setupLive','configureCodex','chooseLanguage','moveView','tutorial','watchWalkthrough','showLearning','import','loadPending']);

/** The learner receives one verified card, never the raw transcript or patch inventory. */
export function learningDisplay(s:CompanionState,projectPaths:string[]=[]){
 const canonical=(value:string)=>value.replace(/^\/tmp\//,'/private/tmp/').replace(/^\/var\//,'/private/var/').replace(/\/$/,'');
 const sameProject=!projectPaths.length||s.roots.some(root=>projectPaths.some(project=>canonical(root.path)===canonical(project)));
 return {threads:s.threads.map(({id,title,cwd})=>({id,title,cwd})),nextThreads:s.nextThreads,selected:s.selected?{id:s.selected.id,title:s.selected.title}:undefined,
  projectPaths:[...projectPaths,...(sameProject?s.roots.filter(root=>!root.unavailable).map(root=>root.path):[])],loading:s.loading,error:s.error,
  lesson:s.lesson,lessonStatus:s.lessonStatus};
}

export function companionHtml(nonce:string,korean:boolean){
 const t=(ko:string,en:string)=>korean?ko:en;
 const labels={choose:t('학습할 작업','Choose a task'),more:t('작업 더 보기','More tasks'),other:t('다른 프로젝트','Other projects'),thisProject:t('현재 프로젝트','This project'),all:t('모든 프로젝트','All projects'),recent:t('최근 작업','Recent tasks'),
  empty:t('이 프로젝트에서 찾은 작업이 없습니다.','No tasks found in this project.'),
  missing:t('이 작업의 변경 이해하기','Understand this task’s changes'),
  prepare:t('Codex에 변경 설명 요청','Ask Codex to explain a change'),
  prepareNote:t('요청문을 복사하고 원래 Codex 채팅을 엽니다.','Copies a request and opens the original Codex chat.'),
  prepared:t('Codex 채팅에 붙여넣어 보내세요. 설명이 준비되면 여기 나타납니다.','Paste and send in Codex. The explanation will appear here when ready.'),
  checking:t('설명의 코드가 실제 수정인지 확인 중…','Checking the explanation against the recorded edit…'),
  unverified:t('설명의 코드를 수정 기록에서 확인하지 못했습니다.','The explanation could not be matched to a recorded edit.'),
  error:t('Codex 기록을 연결하지 못했습니다. 설정에서 연결을 확인하세요.','Could not connect to Codex history. Check the connection in settings.')};
 return String.raw`<!doctype html><html lang="${korean?'ko':'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;padding:18px;color:var(--vscode-foreground,#ddd);background:var(--vscode-sideBar-background,#1e1e1e);font:13px/1.6 var(--vscode-font-family,system-ui)}button,input{font:inherit;color:inherit}button{cursor:pointer;background:transparent;border:1px solid var(--vscode-widget-border,#555);border-radius:7px;padding:9px 12px;overflow-wrap:anywhere}button:disabled{opacity:.5;cursor:default}button:hover{background:var(--vscode-list-hoverBackground,#333)}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder,#58a6ff);outline-offset:2px}.quiet{border:0;color:var(--vscode-descriptionForeground,#aaa);padding:5px;font-size:12px}.primary{background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff);border:0;text-align:center;width:100%}header,.row{display:flex;align-items:center;gap:8px}.grow,#chat-toggle{flex:1;min-width:0}#chat-toggle{border:0;padding:3px 0;font-weight:600;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#picker{margin:14px 0 24px}input{width:100%;background:var(--vscode-input-background,#292929);border:1px solid var(--vscode-input-border,#555);border-radius:5px;padding:7px;margin:8px 0}#thread-list button{display:block;text-align:left;width:100%;border:0;margin:3px 0}#thread-list small{display:block;font-size:11px;color:var(--vscode-descriptionForeground,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#thread-list{max-height:350px;overflow:auto}#lesson,#welcome{margin:24px 0 12px}h1{font-size:21px;line-height:1.45;margin:0 0 18px;overflow-wrap:anywhere}h2{font-size:15px;line-height:1.55;margin:20px 0 12px}p{overflow-wrap:anywhere;margin:10px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;margin:0;padding:14px;border-radius:7px;background:var(--vscode-textCodeBlock-background,#292929);font:12px/1.65 var(--vscode-editor-font-family,monospace);max-height:340px}#explanation{line-height:1.8}.muted,summary{font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}summary{cursor:pointer}#lesson-source,#before-details{margin-top:18px}#code-label{margin-top:20px}#next-card{margin-top:16px}#lesson-source p{font-family:var(--vscode-editor-font-family,monospace);font-size:11px}footer{display:flex;gap:16px;margin-top:28px;padding-top:12px}#settings{margin-top:8px}#error{color:var(--vscode-errorForeground,#f48771)}#welcome p{margin:14px 0 20px}#handoff-note{font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}@media(max-width:340px){body{padding:12px}h1{font-size:19px}}
</style></head><body>
<header><button id="chat-toggle" aria-expanded="false">${labels.choose}</button><button id="refresh" class="quiet" aria-label="${t('새로고침','Refresh')}">↻</button></header>
<section id="picker"><div class="row"><strong id="scope" class="grow"></strong><button id="scope-toggle" class="quiet">${labels.other}</button></div><input id="chat-filter" aria-label="${t('작업 찾기','Find a task')}" placeholder="${t('작업 이름으로 찾기','Find by task name')}"><div id="thread-list"></div><button id="show-more" class="quiet">${labels.more}</button><p id="empty" class="muted" hidden>${labels.empty}</p><button id="older" class="quiet" hidden>${t('이전 작업 더 찾기','Find older tasks')}</button></section>
<p id="error" role="alert" hidden></p>
<section id="selected" hidden>
<section id="welcome"><h1>${labels.missing}</h1><p id="welcome-text">${t('무엇이 달라졌고 왜 필요한지, 실제 코드와 함께 봅니다.','See what changed and why, alongside the actual code.')}</p><button id="prepare" class="primary">${labels.prepare}</button><button id="retry" class="quiet" hidden>${t('설명 다시 확인','Check again')}</button></section>
<section id="lesson" hidden><h1 id="lesson-title"></h1><p id="explanation"></p><div id="code-label" class="muted">${t('핵심 코드','Key code')}</div><pre id="after"></pre><details id="before-details"><summary>${t('바꾸기 전 코드','Code before the change')}</summary><pre id="before"></pre></details>
<button id="next-card" class="quiet">${t('다른 변경 이해하기','Understand another change')}</button>
<details id="lesson-source"><summary>${t('실제 수정 확인','Check the original edit')}</summary><p id="source-file"></p><button class="quiet" id="open-diff">${t('편집기에서 비교','Compare in the editor')}</button></details></section>
<p id="handoff-note">${labels.prepareNote}</p></section><footer><button id="codex" class="quiet">Codex ↗</button><button id="settings-toggle" class="quiet">${t('설정','Settings')}</button></footer>
<section id="settings" hidden><div class="row"><button class="quiet" data-command="chooseLanguage">${t('언어','Language')}</button><button class="quiet" data-command="moveView">${t('위치','Position')}</button><button class="quiet" data-command="configureCodex">${t('Codex 위치','Codex location')}</button><button class="quiet" data-command="setupLive">${t('실시간 알림 연결','Connect live notifications')}</button></div></section>
<script nonce="${nonce}">
const api=acquireVsCodeApi(),$=id=>document.getElementById(id),labels=${JSON.stringify(labels)};
let state={},thread='',cardId='',prepared=false,allProjects=false,limit=5,threadKey='';
const send=(command,extra={})=>api.postMessage({command,...extra});
$('chat-toggle').onclick=()=>{const open=$('picker').hidden;$('picker').hidden=!open;$('chat-toggle').setAttribute('aria-expanded',String(open));if(open)$('chat-filter').focus();};
$('refresh').onclick=()=>send('refreshChats');$('older').onclick=()=>send('moreChats');
$('chat-filter').oninput=()=>{limit=5;renderThreads();};$('show-more').onclick=()=>{limit+=5;renderThreads();};$('scope-toggle').onclick=()=>{allProjects=!allProjects;limit=5;renderThreads();};
const prepare=()=>{prepared=true;render();send('prepareLesson');};$('prepare').onclick=prepare;$('next-card').onclick=prepare;$('retry').onclick=()=>send('refreshLesson');
$('open-diff').onclick=()=>send('openLessonDiff');$('codex').onclick=()=>send('openCodexThread');
$('settings-toggle').onclick=()=>$('settings').hidden=!$('settings').hidden;
document.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>send(button.dataset.command));
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
 if(cardId!==lesson.id){cardId=lesson.id;$('before-details').open=false;$('lesson-source').open=false;}
 $('lesson-title').textContent=card.title;$('explanation').textContent=card.explanation;$('after').textContent=displayCode(card.source.after);$('before').textContent=displayCode(card.source.before);$('before-details').hidden=!card.source.before;$('source-file').textContent=lesson.file;
}
function render(){
 if(thread!==state.selected?.id){thread=state.selected?.id||'';prepared=false;cardId='';$('picker').hidden=!!thread;$('settings').hidden=true;$('chat-filter').value='';}
 if(state.lesson?.id&&state.lesson.id!==cardId)prepared=false;
 $('chat-toggle').textContent=state.selected?.title||labels.choose;$('selected').hidden=!state.selected;$('codex').hidden=!state.selected;$('error').hidden=!state.error;$('error').textContent=state.error?labels.error:'';
 const hasCard=!!state.lesson;$('welcome').hidden=hasCard;$('lesson').hidden=!hasCard;
 $('prepare').disabled=!!state.loading||state.lessonStatus==='checking';$('welcome-text').textContent=state.lessonStatus==='checking'?labels.checking:state.lessonStatus==='unverified'?labels.unverified:${JSON.stringify(t('무엇이 달라졌고 왜 필요한지, 실제 코드와 함께 봅니다.','See what changed and why, alongside the actual code.'))};$('handoff-note').hidden=hasCard&&!prepared;$('handoff-note').textContent=prepared?labels.prepared:labels.prepareNote;$('retry').hidden=state.lessonStatus!=='unverified'&&!prepared;
 renderThreads();renderCard();
}
window.addEventListener('message',event=>{const message=event.data;if(message.type==='showHelp'){$('settings').hidden=false;return;}if(message.type)return;state=message.companion||{};render();if(Number.isSafeInteger(message.revision))send('rendered',{revision:message.revision});});
send('ready');
</script></body></html>`;
}
