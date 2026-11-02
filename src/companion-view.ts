import type {CompanionState} from './companion.js';
import path from 'node:path';
import {canPractice} from './change-review.js';
// Format only familiar text constructs using DOM nodes. Never accept HTML,
// remote images, command links, or executable provider markup.
const messageScript=String.raw`
function formatMessage(target,text){
 if(target._text===text)return;target._text=text;target.replaceChildren();
 for(const block of String(text||'').split(/(\x60\x60\x60[^\n]*\n[\s\S]*?(?:\x60\x60\x60|$))/g)){
  if(block.startsWith('\x60\x60\x60')){const pre=document.createElement('pre');pre.textContent=block.replace(/^\x60\x60\x60[^\n]*\n/,'').replace(/\x60\x60\x60$/,'');target.append(pre);continue;}
  for(const part of block.split(/(\[[^\]\n]{1,500}\]\(https?:\/\/[^)\s]+\)|\x60[^\x60\n]+\x60|\*\*[^*\n]+\*\*)/g)){
   const link=/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
   if(link){const a=document.createElement('a');a.textContent=link[1];a.href=link[2];a.target='_blank';a.rel='noreferrer noopener';target.append(a);continue;}
   const tag=part.startsWith('\x60')?'code':part.startsWith('**')?'strong':undefined;
   if(!tag){target.append(document.createTextNode(part));continue;}
   const node=document.createElement(tag);node.textContent=part.slice(tag==='code'?1:2,tag==='code'?-1:-2);target.append(node);
  }
 }
}
`;
export const COMPANION_COMMANDS=new Set(['selectChat','refreshChats','moreChats','olderActivity','olderEdits','openCodexThread','pickWorktree','openSourceControl','followEditor','openChange','reviewRecorded','openReviewDiff','practiceChange','comparePractice','openReviewSource','hunk','clearReview','setupLive','configureCodex','chooseLanguage','moveView','tutorial','watchWalkthrough','showLearning','import','loadPending']);

/** A short, attributed extract of existing Codex text, not a generated reason. */
export function codexExcerpt(text:string|undefined,file:string){
 if(!text)return '';
 const paragraphs=text.replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g,'').split(/\n\s*\n|\n(?=[-*] )/).map(s=>s.trim()).filter(s=>s.length>12&&!/^#{1,6} [^\n]+$/.test(s));
 const name=path.basename(file);
 const chosen=paragraphs.find(s=>s.includes(file)||s.includes(name))||paragraphs[0]||text;
 const flat=chosen.replace(/\s+/g,' ').replace(/^[-*] /,'');
 return flat.length>260?flat.slice(0,257)+'…':flat;
}
/** Full files/patches and the Source Control inventory stay out of the webview. */
export function companionDisplay(s:CompanionState){
 const {editHistory,...display}=s,review=s.review,hunk=review?.hunks[s.hunk];
 const related=review?[...s.items].reverse().find(i=>i.kind==='assistant'&&(i.text.includes(review.file)||i.text.includes(path.basename(review.file))))?.text:undefined;
 const context=s.reviewContext;
 const responseNamesFile=review&&context?.response&&(context.response.includes(review.file)||context.response.includes(path.basename(review.file)));
 const contextSource=responseNamesFile?'response':context?.request?'request':context?.response?'response':related?'related':undefined;
 const source=contextSource==='response'?context?.response:contextSource==='request'?context?.request:related;
 const recent=new Map<string,{id:string;file:string;label:string}>();
 if(s.root)for(const item of [...(editHistory??[]),...s.items].reverse())for(const change of item.diffs??[]){
  const relative=path.isAbsolute(change.path)?path.relative(s.root,change.path):change.path;
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||recent.has(relative))continue;
  recent.set(relative,{id:item.id,file:change.path,label:relative});
 }
 const practiceable=canPractice(hunk);
 return {...display,recordedChanges:[...recent.values()].slice(0,100),
  contextExcerpt:review?codexExcerpt(source,review.file):'',contextSource,
  explanation:related?.slice(0,6000),reviewContext:context?{...context,request:context.request?.slice(0,6000),response:context.response?.slice(0,10000)}:undefined,
  items:s.items.map(({diffs,...item})=>item),tree:s.tree?{path:s.tree.path,branch:s.tree.branch,head:s.tree.head}:undefined,
  review:review?{file:review.file,root:review.root,hash:review.hash,stale:review.stale,recorded:review.recorded,dirty:review.dirty,editorDiff:review.editorDiff,total:review.hunks.length,
   kind:!review.recorded&&!review.before?'added':!review.recorded&&!review.after?'deleted':hunk&&!hunk.before?'added':hunk&&!hunk.after?'deleted':'modified',
   canPractice:practiceable,hunk:hunk?{oldLine:hunk.oldLine,newLine:hunk.newLine,lines:hunk.after.trimEnd().split('\n').length,hint:practiceable?hunk.after:undefined}:undefined}:undefined};
}

export function companionHtml(nonce:string,korean:boolean){
 const t=(ko:string,en:string)=>korean?ko:en;
 const labels={
  errors:{missing:t('설정에서 Codex 위치를 선택하세요.','Choose the Codex location in settings.'),connection:t('Codex 연결이 끊겼습니다. 마지막 기록을 표시합니다.','Codex disconnected. Showing the last confirmed history.'),protocol:t('Codex를 업데이트한 뒤 새로고침하세요.','Update Codex, then refresh.'),timeout:t('기록을 읽는 데 시간이 걸립니다. 새로고침으로 다시 시도하세요.','Reading history is taking longer. Refresh to retry.')},
  statuses:{completed:t('완료','Completed'),inProgress:t('진행 중','In progress'),failed:t('실패','Failed'),declined:t('거절됨','Declined')},
  choose:t('Codex 채팅','Codex chats'),empty:t('저장된 채팅이 없습니다. Codex에서 작업을 시작하세요.','No saved chats. Start your work in Codex.'),history:t('저장된 기록','Saved history'),active:t('Codex 작업 중','Codex is working'),idle:t('Codex 대기 중','Codex is idle'),waiting:t('Codex 확인 대기','Codex needs your input'),failed:t('Codex 오류','Codex error'),
  command:t('실행','Command'),change:t('수정','Edit'),user:t('사용자','You'),assistant:'Codex',plan:t('계획','Plan'),full:t('전체 내용','Full message'),
  events:{SessionStart:t('Codex 연결됨','Codex connected'),UserPromptSubmit:t('Codex 요청 접수','Codex received a request'),PreToolUse:t('Codex 작업 중','Codex is working'),PermissionRequest:t('Codex 승인 대기','Codex needs approval'),PostToolUse:t('Codex 실행 완료','Codex finished a tool'),PreCompact:t('Codex 대화 정리 중','Codex is compacting'),PostCompact:t('Codex 대화 정리 완료','Codex finished compacting'),Stop:t('Codex 응답 마무리','Codex is finishing'),Interrupt:t('작업 중단됨','Interrupted'),SessionEnd:t('세션 종료','Session ended')},
  noRoot:t('이 채팅의 작업공간을 선택하세요.','Choose the worktree for this chat.'),noGit:t('작업공간을 읽지 못했습니다. 새로고침해 주세요.','Could not read this worktree. Refresh to retry.'),
  follow:t('소스 제어에서 변경을 열면, 연결된 Codex 설명을 여기서 볼 수 있습니다.','Open a change in Source Control to see its Codex context here.'),outside:t('다른 작업공간의 파일을 보고 있습니다.','You are viewing a file from another worktree.'),unchanged:t('이 파일에 커밋 전 변경이 없습니다.','This file has no uncommitted changes.'),unreadable:t('이 파일은 학습용으로 읽을 수 없습니다. VS Code에서 확인하세요.','This file cannot be read for practice. Inspect it in VS Code.'),
  scm:t('VS Code 변경 열기','Open Source Control'),pick:t('작업공간 선택','Choose worktree'),chat:t('채팅 선택','Choose chat'),
  added:t('새 파일','New file'),deleted:t('삭제된 파일','Deleted file'),modified:t('수정','Modified'),recorded:t('Codex의 지난 수정','Past Codex edit'),current:t('커밋 전 변경','Uncommitted change'),dirty:t('저장 전 내용 포함','Includes unsaved changes'),
  response:t('Codex 답변 중','From the Codex response'),request:t('이때의 요청','The request at the time'),related:t('Codex에서 이 파일을 언급한 내용','Codex mentioned this file'),
  noContext:t('이 구간의 설명은 Codex 채팅에서 확인하세요.','Read the Codex chat for context on this section.'),contextLoading:t('연결된 설명을 읽는 중…','Reading the related context…'),
  compare:t('편집기에서 변경 보기','View change in editor'),practice:t('이 부분 직접 바꾸기','Try this change'),comparePractice:t('내 코드 비교','Compare my code'),continue:t('Codex에서 이어가기 ↗','Continue in Codex ↗'),next:t('다음 구간 보기','View next section'),
  matched:t('Codex의 코드와 같습니다.','Matches the Codex code.'),different:t('Codex의 코드와 다른 부분이 있습니다.','Your code differs from Codex’s version.'),editing:t('열린 연습 문서에서 바뀐 부분을 직접 써 보세요.','Try the change in the open practice document.'),practiceNote:t('별도 연습 문서 · 원본 파일은 유지됩니다.','Separate practice document · Original file stays intact.'),
  editorDiff:t('편집기에서 열린 비교','Comparison open in editor'),count:t('구간','Section'),line:t('줄','Line'),stale:t('새 변경이 있습니다. 지금 보는 구간은 이전 시점입니다.','New changes arrived. This section is a snapshot.'),historyEmpty:t('이 채팅에서 수정 기록을 찾지 못했습니다.','No recorded edits found in this chat.'),hookReview:t('Codex CLI의 /hooks에서 알림 설정을 확인하세요.','Review notification hooks with /hooks in Codex CLI.')
 };
 return String.raw`<!doctype html><html lang="${korean?'ko':'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;padding:14px;color:var(--vscode-foreground,#ddd);background:var(--vscode-sideBar-background,#1e1e1e);font:13px/1.55 var(--vscode-font-family,system-ui)}[hidden]{display:none!important}button,input{font:inherit}button{cursor:pointer;color:inherit;background:transparent;border:1px solid var(--vscode-widget-border,#555);border-radius:5px;padding:6px 9px;min-height:30px;text-align:left;overflow-wrap:anywhere}button:hover{background:var(--vscode-list-hoverBackground,#333)}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder,#58a6ff);outline-offset:2px}input{width:100%;min-width:0;padding:7px;border:1px solid var(--vscode-input-border,#555);color:var(--vscode-input-foreground,#ddd);background:var(--vscode-input-background,#292929);border-radius:4px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:0}.quiet{border-color:transparent;font-size:12px;padding:3px;color:var(--vscode-descriptionForeground,#aaa)}.primary{background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff);border-color:transparent;text-align:center}.primary:hover{background:var(--vscode-button-hoverBackground,#0062ad)}header{display:flex;gap:8px;align-items:center}#chat-toggle{flex:1;min-width:0;font-weight:600}#thread-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#connection,.muted{font-size:11px;color:var(--vscode-descriptionForeground,#aaa)}#connection{margin:8px 0}#thread-list{max-height:50vh;overflow:auto;margin:8px 0}#thread-list button{display:block;width:100%;border-color:transparent;margin:3px 0;padding:8px}#thread-list button[aria-current=true]{background:var(--vscode-list-activeSelectionBackground,#094771);color:var(--vscode-list-activeSelectionForeground,#fff)}#thread-list small{display:block;opacity:.7;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tabs{display:flex;gap:18px;margin:14px 0 18px;border-bottom:1px solid var(--vscode-widget-border,#444)}.tabs button{border:0;border-radius:0;padding:7px 0}.tabs button[aria-selected=true]{border-bottom:2px solid var(--vscode-focusBorder,#58a6ff);font-weight:600}h2{font-size:14px;margin:4px 0 6px;overflow-wrap:anywhere}h3{font-size:12px;margin:8px 0}p{margin:8px 0}.body{white-space:pre-wrap;overflow-wrap:anywhere}.body a{color:var(--vscode-textLink-foreground,#75bfff);text-decoration:underline}.body code{background:var(--vscode-textCodeBlock-background,#333);font-family:var(--vscode-editor-font-family,monospace);padding:1px 3px;border-radius:3px}pre{white-space:pre;overflow:auto;max-height:290px;padding:10px;margin:8px 0;background:var(--vscode-textCodeBlock-background,#292929);font:12px/1.65 var(--vscode-editor-font-family,monospace);border-radius:4px}#activity-list{max-height:calc(100vh - 260px);min-height:80px;overflow:auto}article{margin:12px 0;overflow-wrap:anywhere}article.user{background:var(--vscode-textCodeBlock-background,#333);padding:8px 10px;border-radius:8px}article.command,article.change{border-left:2px solid var(--vscode-widget-border,#555);padding-left:9px;font-size:12px}article .who{font-size:11px;color:var(--vscode-descriptionForeground,#aaa);margin-bottom:3px}article button{font-size:11px;margin:3px 0}#error{color:var(--vscode-errorForeground,#f48771)}.warning{border-left:2px solid var(--vscode-editorWarning-foreground,#d5a34c);padding-left:8px;font-size:12px}details{margin:12px 0}summary{cursor:pointer;font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}#recorded,#worktree-details,#options{border-top:1px solid var(--vscode-widget-border,#444);padding-top:10px;margin-top:18px}#recorded-list{max-height:240px;overflow:auto}#recorded-list button{display:block;width:100%;border-color:transparent;padding:5px;text-align:left;font-size:12px}#worktree-details p{overflow-wrap:anywhere}#context-label{font-size:11px;color:var(--vscode-descriptionForeground,#aaa);margin-top:20px}#context-excerpt{margin:6px 0;line-height:1.65}#full-context{max-height:45vh;overflow:auto}#review-origin,#hunk-count{font-size:11px;color:var(--vscode-descriptionForeground,#aaa)}#hunk-nav{margin:14px 0}#primary-action{width:100%;margin:16px 0 4px}#practice-note{margin-top:4px}#file-path{overflow-wrap:anywhere}#learning,#editor-empty{padding-bottom:2px}#editor-empty{padding-top:8px}#empty-action{margin-top:8px}#help ol{padding-left:18px}#picker{margin-top:10px}#practice-result{margin:16px 0 8px}#review-meta{margin-top:16px}@media(max-width:340px){body{padding:10px}.row{gap:5px}}
</style></head><body>
<header><button id="chat-toggle" aria-expanded="true"><span id="thread-name">${labels.choose}</span></button><button class="quiet" data-command="refreshChats" title="${t('새로고침','Refresh')}" aria-label="${t('새로고침','Refresh')}">↻</button></header>
<section id="picker"><input id="chat-filter" aria-label="${t('채팅 찾기','Find a chat')}" placeholder="${t('채팅 이름으로 찾기','Find by chat name')}"><div id="thread-list"></div><p id="empty" class="muted" hidden></p><button id="more-chats" class="quiet" data-command="moreChats" hidden>${t('이전 채팅','Older chats')}</button></section>
<div class="row"><span id="connection" class="grow" role="status"></span><button id="codex-open" class="quiet" data-command="openCodexThread" hidden>Codex ↗</button></div>
<p id="loading" class="muted" hidden>${t('Codex 기록을 읽는 중…','Reading Codex history…')}</p><p id="error" role="alert" hidden></p>
<section id="selected" hidden><nav class="tabs" role="tablist" aria-label="${t('대화와 학습','Conversation and learning')}"><button id="activity-tab" role="tab" aria-selected="true">${t('대화','Conversation')}</button><button id="changes-tab" role="tab" aria-selected="false">${t('지금 보는 코드','Code in view')}</button></nav>
<section id="activity"><button id="older" class="quiet" data-command="olderActivity" hidden>${t('이전 대화','Earlier activity')}</button><button id="commands-toggle" class="quiet" aria-pressed="false">${t('실행 기록 표시','Show command activity')}</button><p id="gap" class="muted" hidden>${t('이전 진행은 위에서 불러올 수 있습니다.','Load earlier activity above.')}</p><div id="activity-list"></div></section>
<section id="changes" hidden>
 <section id="editor-empty"><p id="editor-message"></p><p id="editor-scope" class="muted"></p><button id="empty-action" class="primary"></button></section>
 <section id="learning" hidden>
  <div class="row"><span id="review-origin" class="grow"></span><button id="follow-editor" class="quiet" data-command="followEditor" hidden>${t('편집기로 돌아가기','Follow editor')}</button></div>
  <h2 id="file-title"></h2>
  <div id="hunk-nav" class="row"><span id="hunk-count" class="grow"></span><button id="previous" class="quiet" aria-label="${t('이전 구간','Previous section')}">←</button><button id="next-hunk" class="quiet" aria-label="${t('다음 구간','Next section')}">→</button></div>
  <p id="review-stale" class="warning" hidden>${labels.stale} <button id="refresh-review" class="quiet">${t('최신 변경','Latest change')}</button></p>
  <section id="review-context"><div id="context-label"></div><p id="context-excerpt" class="body"></p><p id="context-loading" class="muted" hidden>${labels.contextLoading}</p>
   <details id="full-context" hidden><summary>${t('원래 대화 펼치기','Expand original conversation')}</summary><section id="request-context" hidden><h3>${t('요청','Request')}</h3><p id="request-text" class="body"></p></section><section id="response-context" hidden><h3>Codex</h3><p id="response-text" class="body"></p></section><section id="related-explanation" hidden><p id="explanation-text" class="body"></p></section></details>
  </section>
  <p id="practice-result" role="status" hidden></p><details id="practice-hint" hidden><summary>${t('변경 후 코드 힌트','Hint: code after the change')}</summary><pre id="hint-code"></pre></details>
  <button id="primary-action" class="primary"></button><p id="practice-note" class="muted" hidden>${labels.practiceNote}</p>
  <button id="full-diff" class="quiet" data-command="openReviewDiff" hidden>${t('변경 다시 보기','View change again')}</button>
  <details id="review-meta"><summary>${t('파일 정보','File details')}</summary><p id="file-path" class="muted"></p><button class="quiet" data-command="openReviewSource">${t('현재 파일 열기','Open current file')}</button></details>
 </section>
 <details id="recorded"><summary>${t('지난 Codex 수정','Past Codex edits')}</summary><p class="muted">${t('이 채팅이 남긴 기록 · 커밋 전 변경과 다를 수 있습니다.','Edits recorded in this chat · May differ from uncommitted changes.')}</p><div id="recorded-list"></div><p id="edits-loading" class="muted" role="status" hidden>${t('수정 기록을 찾는 중…','Finding recorded edits…')}</p><p id="edits-empty" class="muted" hidden></p><p id="edits-error" class="warning" role="alert" hidden>${t('기록을 불러오지 못했습니다. 다시 시도하세요.','Could not load edits. Try again.')}</p><button id="older-edits" class="quiet" data-command="olderEdits" hidden>${t('이전 수정 더 보기','Load earlier edits')}</button></details>
</section>
<details id="worktree-details"><summary>${t('작업 정보','Work details')}</summary><strong id="branch"></strong><p id="root-info" class="muted"></p><p id="last-checked" class="muted"></p><button class="quiet" data-command="pickWorktree">${labels.pick}</button></details>
</section>
<details id="options"><summary>${t('설정 · 사용법','Settings · Help')}</summary><div class="row"><button class="quiet" data-command="chooseLanguage">${t('언어','Language')}</button><button class="quiet" data-command="moveView">${t('위치','Position')}</button><button class="quiet" data-command="configureCodex">${t('Codex 위치','Codex location')}</button><button id="connect-live" class="quiet" data-command="setupLive">${t('실시간 알림 연결','Connect live notifications')}</button></div><p id="hook-review" class="warning" hidden>${labels.hookReview}</p><div class="row"><button id="help-toggle" class="quiet">${t('사용법','How to')}</button><button class="quiet" data-command="watchWalkthrough">${t('학습 영상 (이전 화면)','Learning video (earlier UI)')}</button></div><section id="help" hidden><ol><li>${t('작업 중인 Codex 채팅을 선택합니다.','Choose the Codex chat you are working in.')}</li><li>${t('VS Code 소스 제어에서 변경을 엽니다.','Open a change in VS Code Source Control.')}</li><li>${t('TTC에서 관련 설명을 읽고, 짧은 변경은 직접 바꿔 봅니다.','Read the related context in TTC and try a short change.')}</li></ol><p class="muted">${t('작업과 대화는 Codex에서 이어집니다.','Work and conversation continue in Codex.')}</p></section><div class="row"><button class="quiet" data-command="import">${t('수정안 가져오기','Import a plan')}</button><button class="quiet" data-command="loadPending">${t('MCP 수정안 열기','Open MCP plan')}</button></div></details>
<script nonce="${nonce}">
${messageScript}
const api=acquireVsCodeApi(),$=id=>document.getElementById(id),labels=${JSON.stringify(labels)};
let state={},tab='activity',selectedId='',showCommands=false,editQueryKey='',reviewKey='';
const send=(command,extra={})=>api.postMessage({command,...extra});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.command)));
function openPicker(){ $('picker').hidden=false;$('chat-toggle').setAttribute('aria-expanded','true');$('chat-filter').focus(); }
$('chat-toggle').onclick=()=>{if($('picker').hidden)openPicker();else{$('picker').hidden=true;$('chat-toggle').setAttribute('aria-expanded','false');}};
function lookupEdits(){const key=state.selected?.id+'|'+state.root;if($('recorded').open&&state.root&&!state.recordedChanges?.length&&state.nextItems&&!state.editsLoaded&&!state.editsLoading&&editQueryKey!==key){editQueryKey=key;send('olderEdits');}}
function switchTab(value){tab=value;$('activity').hidden=tab!=='activity';$('changes').hidden=tab!=='changes';$('activity-tab').setAttribute('aria-selected',String(tab==='activity'));$('changes-tab').setAttribute('aria-selected',String(tab==='changes'));}
$('activity-tab').onclick=()=>switchTab('activity');$('changes-tab').onclick=()=>switchTab('changes');$('recorded').ontoggle=lookupEdits;
$('help-toggle').onclick=()=>$('help').hidden=!$('help').hidden;
$('commands-toggle').onclick=()=>{showCommands=!showCommands;$('commands-toggle').setAttribute('aria-pressed',String(showCommands));renderActivity();};
$('chat-filter').oninput=renderThreads;
$('previous').onclick=()=>send('hunk',{index:state.hunk-1});$('next-hunk').onclick=()=>send('hunk',{index:state.hunk+1});$('refresh-review').onclick=()=>send('openChange',{file:state.review?.file});
$('empty-action').onclick=()=>{if(state.editor?.outside)openPicker();else send(state.ambiguous||!state.root?'pickWorktree':'openSourceControl');};
$('primary-action').onclick=()=>{const action=$('primary-action').dataset.action;if(action==='next')send('hunk',{index:state.hunk+1});else if(action)send(action);};
let threadKey='',historyKey='';
function renderThreads(){
 const key=JSON.stringify([state.threads,state.selected?.id,$('chat-filter').value,state.nextThreads,state.loading]);if(key===threadKey)return;threadKey=key;
 const q=$('chat-filter').value.toLowerCase(),list=$('thread-list');list.replaceChildren();
 for(const thread of state.threads||[]){if(!thread.title.toLowerCase().includes(q))continue;const b=document.createElement('button');b.setAttribute('aria-current',String(thread.id===state.selected?.id));const title=document.createElement('span');title.textContent=thread.title;const sub=document.createElement('small');sub.textContent=thread.cwd.split(/[\\/]/).filter(Boolean).slice(-2).join('/');sub.title=thread.cwd;b.append(title,sub);b.onclick=()=>send('selectChat',{id:thread.id});list.append(b);}
 $('empty').hidden=!!state.loading||!!list.children.length;$('empty').textContent=labels.empty;$('more-chats').hidden=!state.nextThreads;
}
const activityNodes=new Map();
function renderActivity(){
 const list=$('activity-list'),follow=list.scrollHeight-list.scrollTop-list.clientHeight<70,items=(state.items||[]).filter(i=>showCommands||i.kind!=='command'),ids=new Set(items.map(i=>i.id));
 for(const [id,node]of activityNodes)if(!ids.has(id)){node.remove();activityNodes.delete(id);}
 items.forEach((item,index)=>{
  let node=activityNodes.get(item.id);const key=JSON.stringify(item);if(!node){node=document.createElement('article');activityNodes.set(item.id,node);}if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null);if(node._key===key)return;
  node._key=key;node.className=item.kind;node.replaceChildren();const who=document.createElement('div');who.className='who';who.textContent=(labels[item.kind]||item.kind)+(item.status?' · '+(labels.statuses[item.status]||item.status):'');node.append(who);
  if(item.kind==='change'){for(const file of item.paths||[]){const b=document.createElement('button');b.textContent=file.split(/[\\/]/).at(-1);b.title=file;b.onclick=()=>{switchTab('changes');send('reviewRecorded',{id:item.id,file});};node.append(b);}}
  else{const body=document.createElement('div');body.className='body';formatMessage(body,item.text);if(item.text?.length>1800||item.kind==='command'){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=item.kind==='command'?(item.cwd?.split(/[\\/]/).filter(Boolean).at(-1)||labels.command):labels.full;details.append(summary,body);node.append(details);}else node.append(body);}
 });
 $('older').hidden=!state.nextItems;$('gap').hidden=!state.gap;if(follow)list.scrollTop=list.scrollHeight;
}
function renderHistory(){
 const key=JSON.stringify(state.recordedChanges||[]);if(key!==historyKey){historyKey=key;const list=$('recorded-list');list.replaceChildren();for(const file of state.recordedChanges||[]){const b=document.createElement('button');b.textContent=file.label;b.onclick=()=>{ $('recorded').open=false;send('reviewRecorded',{id:file.id,file:file.file});};list.append(b);}}
 $('recorded').hidden=!state.root;$('edits-loading').hidden=!state.editsLoading;$('edits-error').hidden=!state.editsError;$('older-edits').disabled=!!state.editsLoading;$('older-edits').hidden=state.editsLoaded?!state.nextEdits:!state.nextItems;
 $('edits-empty').hidden=!!state.recordedChanges?.length||!!state.editsLoading||!!state.editsError;$('edits-empty').textContent=labels.historyEmpty;lookupEdits();
}
function renderLearning(){
 const s=state,r=s.review,h=r?.hunk,context=r?s.reviewContext:undefined;
 $('editor-empty').hidden=!!r;$('learning').hidden=!r;
 $('editor-message').textContent=s.ambiguous||!s.root?labels.noRoot:s.worktreeError?labels.noGit:s.editor?.outside?labels.outside:s.editor?.error?labels.unreadable:s.editor?labels.unchanged:labels.follow;
 $('editor-scope').textContent=s.editor?.outside?(s.tree?.branch||s.root?.split(/[\\/]/).at(-1)||''):'';
 $('empty-action').textContent=s.editor?.outside?labels.chat:s.ambiguous||!s.root?labels.pick:labels.scm;
 if(!r)return;
 const key=r.hash+'|'+s.hunk;
 if(key!==reviewKey){reviewKey=key;$('full-context').open=false;$('practice-hint').open=false;$('review-meta').open=false;}
 $('file-title').textContent=r.file.split(/[\\/]/).at(-1);$('file-title').title=r.file;
 $('review-origin').textContent=(r.recorded?labels.recorded:r.editorDiff?labels.editorDiff:labels.current)+' · '+labels[r.kind||'modified'];
 $('file-path').textContent=r.file+(r.dirty?' · '+labels.dirty:'');$('follow-editor').hidden=!r.recorded;
 $('hunk-count').textContent=h?(r.total>1?labels.count+' '+(s.hunk+1)+' / '+r.total+' · ':'')+labels.line+' '+Math.max(1,h.newLine)+(h.lines>1?'–'+(Math.max(1,h.newLine)+h.lines-1):''):'';
 $('previous').hidden=$('next-hunk').hidden=r.total<=1;$('previous').disabled=s.hunk<=0;$('next-hunk').disabled=s.hunk+1>=r.total;
 $('review-stale').hidden=!r.stale;$('refresh-review').hidden=!!r.recorded;
 $('context-label').textContent=labels[s.contextSource]||'';formatMessage($('context-excerpt'),s.contextExcerpt||(!context?.loading?labels.noContext:''));$('context-loading').hidden=!context?.loading;
 $('full-context').hidden=!context?.request&&!context?.response&&!s.explanation;
 $('request-context').hidden=!context?.request;$('response-context').hidden=!context?.response;$('related-explanation').hidden=!!context?.response||!s.explanation;
 formatMessage($('request-text'),context?.request||'');formatMessage($('response-text'),context?.response||'');formatMessage($('explanation-text'),s.explanation||'');
 let action='openReviewDiff',label=labels.compare;
 if(s.practice==='matched'){action=s.hunk+1<r.total?'next':'openCodexThread';label=action==='next'?labels.next:labels.continue;}
 else if(s.practice){action='comparePractice';label=labels.comparePractice;}
 else if(s.reviewOpened&&r.canPractice&&!r.stale){action='practiceChange';label=labels.practice;}
 else if(s.reviewOpened){action='openCodexThread';label=labels.continue;}
 $('primary-action').dataset.action=action;$('primary-action').textContent=label;$('primary-action').disabled=!h&&r.recorded&&action==='openReviewDiff';
 $('full-diff').hidden=!s.reviewOpened&&!s.practice;$('practice-note').hidden=action!=='practiceChange'&&!s.practice;
 $('practice-result').hidden=!s.practice;$('practice-result').textContent=labels[s.practice]||'';
 $('practice-hint').hidden=!s.practice||!r.canPractice;$('hint-code').textContent=s.practice?h?.hint||'':'';
}
function render(){
 const s=state;
 if(selectedId!==s.selected?.id){selectedId=s.selected?.id||'';$('picker').hidden=!!selectedId;$('chat-toggle').setAttribute('aria-expanded',String(!selectedId));$('chat-filter').value='';$('recorded').open=false;editQueryKey='';}
 $('thread-name').textContent=s.selected?.title||labels.choose;$('selected').hidden=!s.selected;$('codex-open').hidden=!s.selected;$('loading').hidden=!s.loading;$('error').hidden=!s.error;$('error').textContent=labels.errors[s.error]||s.error||'';
 const shared=!s.error&&s.updatedAt&&Date.now()-s.updatedAt<10000&&s.mode==='shared'&&s.selected?.runtime!=='notLoaded',fresh=!s.error&&s.live&&Date.now()-s.live.at<120000;
 $('connection').textContent=s.selected?(shared?({active:s.selected?.flags?.length?labels.waiting:labels.active,idle:labels.idle,systemError:labels.failed}[s.selected?.runtime]||labels.history):fresh?labels.events[s.live.event]||labels.history:labels.history):'';
 $('connect-live').hidden=shared||!!fresh;$('hook-review').hidden=s.hooks!=='review';
 $('branch').textContent=s.tree?.branch||s.tree?.head?.slice(0,8)||'';$('root-info').textContent=s.root||labels.noRoot;$('last-checked').textContent=s.updatedAt?new Date(s.updatedAt).toLocaleString(document.documentElement.lang):'';
 renderThreads();renderActivity();renderHistory();renderLearning();switchTab(tab);
}
window.addEventListener('message',event=>{const message=event.data;if(message.type==='showHelp'){$('options').open=true;$('help').hidden=false;return;}if(message.type)return;const previous=state.review?.hash;state=message.companion||{};if(state.review&&state.review.hash!==previous)switchTab('changes');render();if(Number.isSafeInteger(message.revision))send('rendered',{revision:message.revision});});
send('ready');
</script></body></html>`;
}
