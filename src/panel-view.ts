import type {Judgment} from './judgment.js';
import type {CheckResult} from './task-checks.js';
export interface PanelState {
  title?: string; file?: string; line?: number; reason?: string;
  before?: string; after?: string; step?: number; total?: number;
  status?: string; message?: string; canContinue?: boolean; complete?: boolean;
  files?: string[]; connected?: boolean; busy?: boolean; phase?: string;
  model?: string; error?: string; notice?: string;
  judgment?: Judgment; canKeep?: boolean; replan?: boolean;
  check?:CheckResult; checking?:boolean;
}

export const PANEL_COMMANDS = new Set([
  'generate', 'chooseFiles', 'chooseModel', 'import', 'demo', 'focus', 'next',
  'stop', 'signIn', 'signOut', 'mcpConfig', 'loadPending', 'usage', 'review', 'predict', 'decide',
  'advance','runCheck','chooseCheck','cancelCheck','problems',
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
h1{font-size:20px;line-height:1.5;font-weight:500;letter-spacing:-.4px;margin:0 0 20px}#title{margin-top:14px;overflow-wrap:anywhere}label{display:block;margin-bottom:8px}#prediction,#evidence{min-height:76px;margin:0 0 14px}#expectation,#record p{overflow-wrap:anywhere;white-space:pre-wrap}p{margin:10px 0}textarea{display:block;resize:vertical;min-height:112px;max-height:320px;width:100%;padding:12px;border:1px solid var(--vscode-input-border,#555);border-radius:6px;background:var(--vscode-input-background,#292929);color:var(--vscode-input-foreground,#eee)}textarea::placeholder{color:var(--vscode-input-placeholderForeground,#929292)}
.row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.context{margin:8px 0 20px;min-width:0}.context button{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.muted{font-size:11px;color:var(--vscode-descriptionForeground,#aaa)}kbd{font:11px var(--vscode-font-family,system-ui);opacity:.65;margin-left:10px}.foot{margin-top:28px;padding-top:14px;border-top:1px solid var(--vscode-widget-border,#3d3d3d)}
summary{cursor:pointer;font-size:12px;color:var(--vscode-descriptionForeground,#aaa);padding:5px 0}details .options{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:8px 0}#account-options{margin-top:12px}#account-options>summary{list-style:none}#account-options>summary::-webkit-details-marker{display:none}
#check-result{margin:16px 0;padding:10px 12px;border-left:2px solid var(--vscode-descriptionForeground,#aaa);background:var(--vscode-textCodeBlock-background,#252525);overflow-wrap:anywhere}#check-result[data-status=passed]{border-color:var(--vscode-testing-iconPassed,#89bc83)}#check-result[data-status=failed]{border-color:var(--vscode-testing-iconFailed,#f48771)}#check-title{font-weight:500}#check-details{white-space:pre-wrap;max-height:180px;overflow:auto;font-size:12px}#check-tools{margin-top:12px}#after,#before{max-height:300px}#keyboard-hint{margin-top:8px}
#file{font:12px var(--vscode-editor-font-family,monospace);text-align:left;overflow-wrap:anywhere;min-width:0;flex:1}#step{font-size:12px;font-variant-numeric:tabular-nums;color:var(--vscode-descriptionForeground,#aaa)}#progress{display:block;appearance:none;width:100%;height:3px;border:0;margin:8px 0 20px;background:var(--vscode-widget-border,#3d3d3d)}#progress::-webkit-progress-bar{background:var(--vscode-widget-border,#3d3d3d)}#progress::-webkit-progress-value{background:var(--vscode-progressBar-background,#1e90ff)}#reason{font-size:12px;color:var(--vscode-descriptionForeground,#aaa);margin:12px 0;overflow-wrap:anywhere}pre{margin:14px 0;padding:16px;overflow:auto;tab-size:4;white-space:pre;background:var(--vscode-textCodeBlock-background,#252525);border-radius:6px;font:var(--vscode-editor-font-size,14px)/1.8 var(--vscode-editor-font-family,monospace)}#after{border-left:2px solid var(--vscode-gitDecoration-addedResourceForeground,#71aa79)}#delete-hint{padding:16px;background:var(--vscode-textCodeBlock-background,#252525);border-radius:6px}#proposal{margin-top:24px}#proposal>summary{font-size:13px;color:var(--vscode-foreground,#ddd);padding:8px 0}#status{margin:12px 0 0;font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}#status[data-state=complete]{color:var(--vscode-testing-iconPassed,#89bc83)}#status[data-state=outside]{color:var(--vscode-editorWarning-foreground,#d5a34c)}#again{margin-top:12px}.error{color:var(--vscode-errorForeground,#f48771);font-size:12px;overflow-wrap:anywhere}.notice{color:var(--vscode-descriptionForeground,#aaa);font-size:12px}.loading{height:2px;background:var(--vscode-progressBar-background,#1e90ff);opacity:.7;margin:16px 0}.danger{color:var(--vscode-errorForeground,#f48771)}[hidden]{display:none!important}@media(max-width:320px){body{padding:16px}kbd{display:none}h1{font-size:18px}pre{padding:12px}}
</style></head><body>
<header><span class="brand">TYPE THE CHANGE</span><button id="end" class="quiet close" data-command="stop" aria-label="안내 끝내기" title="안내 끝내기 · 수정 내용은 유지됩니다" hidden>×</button></header>
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
<section id="guide" hidden>
<div class="row"><button id="file" class="quiet" data-command="focus" title="수정 위치로 이동"></button><span id="step"></span></div>
<progress id="progress" max="1" value="0" aria-label="판단을 기록한 단계"></progress>
<h1 id="title"></h1>
<form id="prediction-form"><label for="prediction">어떤 결과를 예상하나요?</label><textarea id="prediction" maxlength="280" rows="2" placeholder="달라질 동작을 한 줄로" spellcheck="false"></textarea><button id="predict" type="submit" disabled>살펴보기 <kbd>${sendKey}</kbd></button></form>
<div class="row" id="actions" hidden><button id="next" data-command="advance"><span id="next-label">저장하고 검사</span><kbd>${nextKey}</kbd></button><button id="edit" data-command="focus" class="quiet"><span aria-hidden="true">←</span> 코드로</button><button id="review" data-command="review" hidden>다시 비교</button></div>
<section id="check-result" role="status" aria-live="polite" hidden><div id="check-title"></div><div id="check-task" class="muted"></div><div id="check-details"></div><button id="cancel-check" data-command="cancelCheck" class="quiet" hidden>검사 중단</button></section>
<section id="reflection" hidden><p id="expectation" class="muted"></p><label for="evidence">예상과 비교하면?</label><textarea id="evidence" maxlength="280" rows="2" placeholder="유지하거나 거절할 이유 한 줄" spellcheck="false"></textarea><div class="row" id="decisions"><button id="keep" data-command="decide" data-decision="keep" disabled>이 변경 유지</button><button id="reject" data-command="decide" data-decision="reject" class="secondary" disabled>제안 거절</button><button id="defer" data-command="decide" data-decision="defer" class="quiet">보류</button></div><p class="muted">검사 통과 ≠ 정답 · 채택은 직접 판단</p></section>
<p id="keyboard-hint" class="muted" hidden></p>
<details id="check-tools" hidden><summary>검사 옵션</summary><div class="options"><button class="quiet" data-command="runCheck">저장하고 다시 검사</button><button class="quiet" data-command="chooseCheck">검사 선택</button><button class="quiet" data-command="problems">오류 위치 보기</button><button id="compare-only" class="quiet" data-command="next">검사 없이 비교</button></div></details>
<p id="status" role="status" aria-live="polite"></p>
<details id="record" hidden><summary>판단 근거</summary><p id="record-prediction"></p><p id="record-evidence"></p></details>
<details id="proposal"><summary>제안 보기</summary><p id="reason"></p><pre id="after" aria-label="제안 코드"></pre><p id="delete-hint" hidden>선택한 코드를 지우세요.</p><details id="original"><summary>변경 전</summary><pre id="before" aria-label="변경 전 코드"></pre></details></details>
<button id="again" data-command="stop" class="quiet" hidden>다른 변경</button>
</section>
<p id="error" class="error" role="alert" hidden></p><p id="notice" class="notice" role="status" hidden></p>
<script nonce="${nonce}">
const api=acquireVsCodeApi();const $=id=>document.getElementById(id);let state={};let stepIdentity='';const draft=api.getState?.();if(typeof draft?.intent==='string')$('intent').value=draft.intent;
function send(command,extra={}){api.postMessage({command,...extra});}
function valid(){return !state.busy&&$('intent').value.trim().length>0;}
function syncForm(){$('generate').disabled=!valid();$('predict').disabled=!$('prediction').value.trim();$('keep').disabled=!!state.checking||!state.canKeep||!$('evidence').value.trim();$('reject').disabled=!!state.checking||!$('evidence').value.trim();$('defer').disabled=!!state.checking;}
function focusStep(){const phase=state.judgment?.phase;if(phase==='predict')$('prediction').focus();else if(phase==='review')($('evidence').value.trim()?(!$('keep').disabled?$('keep'):$('reject')):$('evidence')).focus();else if(phase==='edit')$('next').focus();else $('review').focus();}
$('intent').addEventListener('input',()=>{api.setState?.({intent:$('intent').value});syncForm();});
$('request').addEventListener('submit',e=>{e.preventDefault();if(valid())send('generate',{intent:$('intent').value.trim()});});
$('prediction').addEventListener('input',syncForm);$('evidence').addEventListener('input',syncForm);
$('prediction-form').addEventListener('submit',e=>{e.preventDefault();if($('prediction').value.trim())send('predict',{prediction:$('prediction').value.trim()});});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled)send(b.dataset.command,b.dataset.command==='decide'?{decision:b.dataset.decision,evidence:$('evidence').value.trim()}:{});}));
window.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();if(e.altKey){if(state.file&&!state.checking)send('advance');return;}if(!state.file){if(valid())send('generate',{intent:$('intent').value.trim()});}else if(state.judgment?.phase==='predict'){if($('prediction').value.trim())send('predict',{prediction:$('prediction').value.trim()});else focusStep();}else if(state.judgment?.phase==='edit'){if(!state.checking)send('advance');}else focusStep();}if(e.key==='Escape'&&state.busy){e.preventDefault();send('stop');}});
$('decisions').addEventListener('keydown',e=>{if(e.isComposing||!['ArrowLeft','ArrowRight'].includes(e.key))return;const buttons=[...$('decisions').querySelectorAll('button:not(:disabled)')];const i=buttons.indexOf(document.activeElement);if(i<0)return;e.preventDefault();buttons[(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus();});
window.addEventListener('message',({data:s})=>{
 if(s?.type==='focusIntent'){$('intent').focus();return;}
 if(s?.type==='focusStep'){focusStep();return;}
 if(!s||typeof s!=='object'||Object.hasOwn(s,'type'))return;const wasActive=!!state.file;const priorPhase=state.judgment?.phase;const priorHash=state.judgment?.reviewedHash;const focused=document.activeElement?.id;const focusedHelp=$('proposal').contains(document.activeElement);let newStep=false;state=s;const active=typeof s.file==='string';$('home').hidden=active;$('guide').hidden=!active;$('end').hidden=!active;
 $('loading').hidden=!s.busy;$('phase').textContent=s.phase||'';
 for(const id of ['intent','files','model','demo','connect'])$(id).disabled=!!s.busy;
 $('other').hidden=!!s.busy;$('account').hidden=!!s.busy;
 $('files').textContent=s.files?.length?(s.files.length===1?s.files[0]:'파일 '+s.files.length+'개'):'＋ 파일 선택';$('files').title=s.files?.join('\\n')||'전송할 파일 선택';
 $('model').hidden=!(s.connected||s.model);$('model').textContent=s.model||'모델 선택';
 $('connect').hidden=!!s.connected;$('account-options').hidden=!s.connected;
 $('error').hidden=!s.error;$('error').textContent=s.error||'';$('notice').hidden=!s.notice;$('notice').textContent=s.notice||'';
 if(active){const identity=s.file+':'+s.step+':'+s.before+':'+s.after;if(identity!==stepIdentity){newStep=true;$('proposal').open=false;$('original').open=false;stepIdentity=identity;}
 $('title').textContent=s.title||'';$('file').textContent=s.file+':'+s.line;$('step').textContent=s.step+' / '+s.total;
 $('progress').max=s.total||1;$('progress').value=s.complete?s.total:Math.max(0,(s.step||1)-1);$('progress').setAttribute('aria-valuetext',$('progress').value+' / '+$('progress').max);
 $('after').textContent=s.after??'';$('after').hidden=s.after==='';$('delete-hint').hidden=s.after!=='';$('before').textContent=s.before||'';
 $('reason').textContent=s.reason||'';$('reason').hidden=!s.reason;
 const j=s.judgment||{phase:'predict',prediction:'',evidence:''};const phase=j.phase;const done=phase==='done';
 $('prediction-form').hidden=phase!=='predict';$('actions').hidden=phase==='predict'||phase==='review';$('reflection').hidden=phase!=='review';$('proposal').hidden=phase==='predict';
 $('next').hidden=phase!=='edit';$('next').disabled=!!s.checking;$('next-label').textContent=s.checking?'검사 중…':'저장하고 검사';$('edit').hidden=phase!=='edit';$('review').hidden=!done;$('again').hidden=!done;
 $('check-tools').hidden=phase==='predict';for(const button of $('check-tools').querySelectorAll('button'))button.disabled=!!s.checking;
 $('check-result').hidden=!s.check;$('cancel-check').hidden=!s.checking;
 if(s.check){const c=s.check;$('check-result').dataset.status=c.status;$('check-title').textContent=({running:'검사 중…',passed:'✓ 검사 통과',failed:'× 검사 실패',unknown:'종료 · 결과 확인 필요',cancelled:'검사 중단됨',stale:'코드가 바뀌었어요 · 다시 검사',error:'검사를 시작하지 못했어요'})[c.status]||'';$('check-task').textContent=c.task+(c.exitCode===undefined?'':' · 종료 '+c.exitCode);$('check-details').textContent=c.details?.join('\\n')||'';}
 $('keyboard-hint').hidden=phase==='predict'||done;$('keyboard-hint').textContent=phase==='review'?'${sendKey} 판단으로 · ← → 선택 · Enter 기록':'${nextKey} 저장하고 검사 · ${mac?'⌘⌥T':'Ctrl Alt T'} 코드로';
 if(newStep){$('prediction').value='';$('evidence').value='';$('record').open=false;}
 if(priorPhase==='predict'&&phase==='edit')$('proposal').open=true;
 if(phase==='review'&&(priorPhase!==phase||priorHash!==j.reviewedHash))$('evidence').value='';
 $('expectation').textContent='내 예상 · '+j.prediction;
 $('record').hidden=!done;$('record-prediction').textContent='예상 · '+j.prediction;$('record-evidence').textContent='근거 · '+(j.evidence||'아직 확인하지 못했어요.');
 $('status').textContent=s.replan?'내 변경 유지 · 다음 제안은 새로 확인해 주세요.':done?({keep:'내 변경 유지 · 판단을 기록했어요.',reject:'제안 거절 · 코드는 그대로 두었어요.',defer:'보류 · 근거를 더 확인해 주세요.'}[j.decision]||''):phase==='predict'?'':s.message||'';
 $('status').dataset.state=done?(j.decision==='keep'?(s.complete?'complete':'kept'):j.decision==='reject'?'rejected':'deferred'):s.status||'';
 }else{stepIdentity='';$('proposal').open=false;$('original').open=false;}
 syncForm();if(document.hasFocus()){if(wasActive&&!active)$('intent').focus();else if(active&&((focused&&$(focused)?.closest('[hidden]'))||(newStep&&focusedHelp)))$(({predict:'prediction',edit:'next',review:'evidence',done:'review'})[s.judgment?.phase||'predict']).focus();}
});send('ready');syncForm();
</script></body></html>`;
}
