export interface PanelState {
  title?: string; file?: string; line?: number; reason?: string;
  before?: string; after?: string; step?: number; total?: number;
  status?: string; message?: string; canContinue?: boolean; complete?: boolean;
  files?: string[]; connected?: boolean; busy?: boolean; phase?: string;
  model?: string; error?: string; notice?: string;
}

export const PANEL_COMMANDS = new Set([
  'generate', 'chooseFiles', 'chooseModel', 'import', 'demo', 'focus', 'next',
  'stop', 'signIn', 'signOut', 'mcpConfig', 'loadPending', 'usage', 'review',
]);

export function panelHtml(nonce: string, mac: boolean): string {
  const nextKey = mac ? '⌘⌥↵' : 'Ctrl Alt ↵';
  const sendKey = mac ? '⌘↵' : 'Ctrl ↵';
  return `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;padding:24px;color:var(--vscode-foreground,#ddd);background:var(--vscode-editor-background,#1e1e1e);font:13px/1.65 var(--vscode-font-family,system-ui)}
button,textarea{font:inherit}button{cursor:pointer;border:1px solid var(--vscode-button-border,var(--vscode-contrastBorder,transparent));border-radius:5px;min-height:34px;padding:6px 12px;color:var(--vscode-button-foreground,#fff);background:var(--vscode-button-background,#0067b8)}button:hover{background:var(--vscode-button-hoverBackground,#087bcc)}button:disabled{opacity:.4;cursor:default}button:focus-visible,summary:focus-visible,textarea:focus-visible{outline:2px solid var(--vscode-focusBorder,#69a9e8);outline-offset:2px}
.quiet{background:transparent;border-color:transparent;color:var(--vscode-descriptionForeground,#aaa);padding:4px 0}.quiet:hover{background:transparent;color:var(--vscode-foreground,#eee);text-decoration:underline}.secondary{background:var(--vscode-button-secondaryBackground,#333);color:var(--vscode-button-secondaryForeground,#ddd)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}.brand{font-size:11px;letter-spacing:1.4px;color:var(--vscode-descriptionForeground,#aaa)}.close{padding:0 9px;font-size:20px;line-height:1;min-height:30px}
h1{font-size:20px;line-height:1.5;font-weight:500;letter-spacing:-.4px;margin:0 0 20px}#title{margin-top:14px}p{margin:10px 0}textarea{display:block;resize:vertical;min-height:112px;max-height:320px;width:100%;padding:12px;border:1px solid var(--vscode-input-border,#555);border-radius:6px;background:var(--vscode-input-background,#292929);color:var(--vscode-input-foreground,#eee)}textarea::placeholder{color:var(--vscode-input-placeholderForeground,#929292)}
.row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.context{margin:8px 0 20px;min-width:0}.context button{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.muted{font-size:11px;color:var(--vscode-descriptionForeground,#aaa)}kbd{font:11px var(--vscode-font-family,system-ui);opacity:.65;margin-left:10px}.foot{margin-top:28px;padding-top:14px;border-top:1px solid var(--vscode-widget-border,#3d3d3d)}
summary{cursor:pointer;font-size:12px;color:var(--vscode-descriptionForeground,#aaa);padding:5px 0}details .options{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:8px 0}#account-options{margin-top:12px}#account-options>summary{list-style:none}#account-options>summary::-webkit-details-marker{display:none}
#file{font:12px var(--vscode-editor-font-family,monospace);text-align:left;overflow-wrap:anywhere}#step{font-size:12px;font-variant-numeric:tabular-nums;color:var(--vscode-descriptionForeground,#aaa)}#reason{font-size:12px;color:var(--vscode-descriptionForeground,#aaa);margin:14px 0 20px;overflow-wrap:anywhere}pre{margin:14px 0;padding:16px;overflow:auto;tab-size:4;white-space:pre;background:var(--vscode-textCodeBlock-background,#252525);border-radius:6px;font:var(--vscode-editor-font-size,14px)/1.8 var(--vscode-editor-font-family,monospace)}#after{border-left:2px solid var(--vscode-gitDecoration-addedResourceForeground,#71aa79)}#delete-hint{padding:20px 16px;background:var(--vscode-textCodeBlock-background,#252525);border-radius:6px}#status{min-height:22px;margin:22px 0 8px;font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}#status[data-state=matched],#status[data-state=complete]{color:var(--vscode-testing-iconPassed,#89bc83)}#status[data-state=outside]{color:var(--vscode-editorWarning-foreground,#d5a34c)}.error{color:var(--vscode-errorForeground,#f48771);font-size:12px;overflow-wrap:anywhere}.notice{color:var(--vscode-descriptionForeground,#aaa);font-size:12px}.loading{height:2px;background:var(--vscode-progressBar-background,#1e90ff);opacity:.7;margin:16px 0}.danger{color:var(--vscode-errorForeground,#f48771)}[hidden]{display:none!important}@media(max-width:320px){body{padding:16px}kbd{display:none}h1{font-size:18px}pre{padding:12px}}
</style></head><body>
<header><span class="brand">TYPE THE CHANGE</span><button id="end" class="quiet close" data-command="stop" aria-label="안내 끝내기" title="안내 끝내기" hidden>×</button></header>
<section id="home"><h1>무엇을 바꿀까요?</h1>
<form id="request"><textarea id="intent" aria-label="원하는 코드 변경" maxlength="4000" placeholder="음수 가격은 합계에서 제외해 줘" spellcheck="false"></textarea>
<div class="row context"><button id="files" type="button" class="quiet" data-command="chooseFiles">＋ 파일 선택</button><button id="model" type="button" class="quiet" data-command="chooseModel" hidden></button></div>
<div class="row"><button id="generate" type="submit" disabled>수정안 만들기 <kbd>${sendKey}</kbd></button><button id="demo" type="button" data-command="demo" class="quiet">샘플로 시작</button></div>
<p class="muted">선택한 파일을 OpenAI로 전송 · ChatGPT 구독 사용</p>
</form>
<div id="loading" hidden><div class="loading"></div><div class="row"><span id="phase" class="muted" role="status"></span><button class="quiet" data-command="stop">취소</button></div></div>
<details class="foot" id="other"><summary>수정안 가져오기</summary><div class="options"><button class="quiet" data-command="import">JSON 파일</button><button class="quiet" data-command="loadPending">MCP에서 받기</button><button class="quiet" data-command="mcpConfig">MCP 연결 설정</button></div></details>
<div id="account"><button id="connect" class="quiet" data-command="signIn">Continue with ChatGPT</button><details id="account-options" hidden><summary>ChatGPT 연결됨</summary><div class="options"><button class="quiet" data-command="usage">사용량</button><button class="quiet" data-command="signOut">연결 해제</button></div></details></div>
</section>
<section id="guide" hidden><div class="row"><button id="file" class="quiet" data-command="focus"></button><span id="step"></span></div><h1 id="title"></h1><pre id="after" aria-label="제안 코드"></pre><p id="delete-hint" hidden>선택한 코드를 지우세요.</p><p id="reason"></p><details id="original"><summary>변경 전</summary><pre id="before"></pre></details><p id="status" role="status" aria-live="polite"></p><div class="row"><button id="next" data-command="next" disabled><span id="next-label">다음</span><kbd>${nextKey}</kbd></button><button id="review" data-command="review" hidden>변경 확인</button><button id="again" data-command="stop" class="quiet" hidden>다른 변경</button></div></section>
<p id="error" class="error" role="alert" hidden></p><p id="notice" class="notice" role="status" hidden></p>
<script nonce="${nonce}">
const api=acquireVsCodeApi();const $=id=>document.getElementById(id);let state={};let stepIdentity='';const draft=api.getState?.();if(typeof draft?.intent==='string')$('intent').value=draft.intent;
function send(command,extra={}){api.postMessage({command,...extra});}
function valid(){return !state.busy&&$('intent').value.trim().length>0;}
function syncForm(){$('generate').disabled=!valid();}
$('intent').addEventListener('input',()=>{api.setState?.({intent:$('intent').value});syncForm();});
$('request').addEventListener('submit',e=>{e.preventDefault();if(valid())send('generate',{intent:$('intent').value.trim()});});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled)send(b.dataset.command);}));
window.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){if(!e.altKey&&!state.file){e.preventDefault();if(valid())send('generate',{intent:$('intent').value.trim()});}else if(e.altKey&&state.file&&!state.complete){e.preventDefault();if(state.canContinue)send('next');}}if(e.key==='Escape'&&state.busy){e.preventDefault();send('stop');}});
window.addEventListener('message',({data:s})=>{
 if(s?.type==='focusIntent'){$('intent').focus();return;}
 if(!s||typeof s!=='object'||Object.hasOwn(s,'type'))return;const wasActive=!!state.file;const focused=document.activeElement?.id;state=s;const active=typeof s.file==='string';$('home').hidden=active;$('guide').hidden=!active;$('end').hidden=!active;
 $('loading').hidden=!s.busy;$('phase').textContent=s.phase||'';
 for(const id of ['intent','files','model','demo','connect'])$(id).disabled=!!s.busy;
 $('other').hidden=!!s.busy;$('account').hidden=!!s.busy;
 $('files').textContent=s.files?.length?(s.files.length===1?s.files[0]:'파일 '+s.files.length+'개'):'＋ 파일 선택';$('files').title=s.files?.join('\\n')||'전송할 파일 선택';
 $('model').hidden=!(s.connected||s.model);$('model').textContent=s.model||'모델 선택';
 $('connect').hidden=!!s.connected;$('account-options').hidden=!s.connected;
 $('error').hidden=!s.error;$('error').textContent=s.error||'';$('notice').hidden=!s.notice;$('notice').textContent=s.notice||'';
 if(active){const identity=s.file+':'+s.step+':'+s.before+':'+s.after;if(identity!==stepIdentity){$('original').open=false;stepIdentity=identity;}
 $('title').textContent=s.title||'';$('file').textContent=s.file+':'+s.line;$('step').textContent=s.step+' / '+s.total;
 $('after').textContent=s.after??'';$('after').hidden=s.after==='';$('delete-hint').hidden=s.after!=='';$('before').textContent=s.before||'';
 $('reason').textContent=s.reason||'';$('reason').hidden=!s.reason;
 $('status').textContent=s.complete?'입력 완료 · 테스트는 별도':s.message||'';$('status').dataset.state=s.complete?'complete':s.status||'';
 $('next').hidden=!!s.complete;$('next').disabled=!s.canContinue;$('next-label').textContent=s.step===s.total?'완료':'다음';$('review').hidden=!(s.complete||s.status==='outside');$('again').hidden=!s.complete;
 }syncForm();if(document.hasFocus()){if(s.complete&&focused==='next')$('review').focus();else if(wasActive&&!active)$('intent').focus();else if(active&&focused==='review'&&$('review').hidden)$(s.canContinue?'next':'file').focus();}
});send('ready');syncForm();
</script></body></html>`;
}
