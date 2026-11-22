export function activityHtml(nonce: string, korean: boolean): string {
  const t = (ko: string, en: string) => korean ? ko : en;
  const labels = JSON.stringify({
    codex: 'Codex', claude: 'Claude Code',
    empty: t('이 폴더에 로컬 기록 없음', 'No local records for this folder'),
    unknown: t('기록된 파일 편집 없음', 'No recorded file edits'),
    send: t('이 스레드로 보내기', 'Send to this thread'),
    reply: t('최근 답변', 'Latest reply'),
    edit: t('수정', 'Edited'), add: t('추가', 'Added'), delete: t('삭제', 'Deleted'), rename: t('이름 변경', 'Renamed'),
    pending: t('편집 요청', 'Edit requested'),
    started: t('시작 기록', 'Turn started'),
    finished: t('완료 기록', 'Turn ended'),
    working: t('보낸 요청 진행 중', 'Request in progress'),
    impact: t('보고된 영향', 'Reported impact'),
    why: t('이유', 'Why'),
    noReason: t('파일별 설명 없음', 'No file-specific reason'),
    context: t('수정 직전 설명', 'Before the edit'),
    ask: t('이유 묻기', 'Ask why'),
    current: t('현재 파일', 'Current file'),
  });
  return `<!doctype html><html lang="${korean ? 'ko' : 'en'}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
<style nonce="${nonce}">
* { box-sizing: border-box; } body { margin: 0; padding: 14px; font: var(--vscode-font-size, 13px)/1.5 var(--vscode-font-family, system-ui);
color: var(--vscode-foreground); background: var(--vscode-editor-background); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
h1, h2, h3, p { margin: 0; overflow-wrap: anywhere; } h1 { font-size: 18px; } h2 { font-size: 13px; }
#lanes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.lane { min-width: 0; display: grid; gap: 8px; align-content: start; }
article { display: grid; gap: 4px; padding: 8px; border: 1px solid var(--vscode-panel-border, #555); border-radius: 6px; }
h3 { font-size: 13px; } small,.muted { color: var(--vscode-descriptionForeground); }
button { cursor: pointer; color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); background: var(--vscode-button-secondaryBackground, transparent);
border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; font: inherit; padding: 4px 8px; text-align: left; overflow-wrap: anywhere; }
button:hover { background: var(--vscode-list-hoverBackground); }
button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
.files { display: grid; align-items: start; gap: 4px; margin-left: 5px; padding: 2px 0 2px 9px; border-left: 1px solid var(--vscode-tree-indentGuidesStroke, #666); }
.files button { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; font-family: var(--vscode-editor-font-family, monospace); min-width: 0; }
.files button > span { min-width: 0; } .files small { font-family: var(--vscode-font-family, system-ui); }
.send { justify-self: start; }
.file-entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px; align-items: start; }
.file-entry details { display: contents; }
.file-entry details:not([open]) .file-context { display:none; }
.file-entry summary { padding: 4px; cursor: pointer; white-space: nowrap; }
.file-entry summary:focus-visible { outline:2px solid var(--vscode-focusBorder); }
.file-context { grid-column: 1 / -1; display: grid; gap: 4px; padding: 4px 7px; color: var(--vscode-descriptionForeground); }
.file-context div { display:flex; gap: 4px; flex-wrap:wrap; } [hidden] { display: none !important; }
@media (max-width: 560px) { #lanes { grid-template-columns: minmax(0, 1fr); } }
</style></head><body>
<header><h1>${t('에이전트 작업', 'Agent activity')}</h1><button id="send">${t('보내기', 'Send')}</button></header>
<button id="enable" hidden>${t('로컬 기록 보기', 'Show local records')}</button>
<div id="lanes"></div>
<script nonce="${nonce}">
const api = acquireVsCodeApi();
const labels = ${labels};
const lanes = document.getElementById('lanes');
const enable = document.getElementById('enable');
function element(tag, text, css) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (css) node.className = css;
  return node;
}
function button(text, command, data, key, css) {
  const node = element('button', text, css);
  node.type = 'button';
  node.dataset.key = key;
  node.addEventListener('click', () => api.postMessage({command, ...data}));
  return node;
}
document.getElementById('send').onclick = () => api.postMessage({command:'send'});
enable.onclick = () => api.postMessage({command:'enable'});
window.addEventListener('message', ({data}) => {
  enable.hidden = data.enabled;
  lanes.hidden = !data.enabled;
  const focusKey = document.activeElement?.dataset.key;
  const expanded = new Set([...lanes.querySelectorAll('details[open]')].map(item=>item.dataset.key));
  const fragment = document.createDocumentFragment();
  for (const agent of ['codex', 'claude']) {
    const lane = element('section', '', 'lane');
    lane.append(element('h2', labels[agent]));
    const active = data.running.filter(job => job.agent === agent);
    for (const job of active) {
      const card = element('article');
      card.append(element('small', labels.working), element('p', job.agenda));
      lane.append(card);
    }
    const threads = data.threads.filter(thread => thread.agent === agent);
    if (!threads.length && !active.length) lane.append(element('p', labels.empty, 'muted'));
    for (const thread of threads) {
      const identity = {agent, id:thread.id};
      const card = element('article');
      const title = thread.title || thread.agenda || thread.id.slice(-6);
      const heading = element('h3', title);
      if (thread.turn) heading.title = labels[thread.turn];
      card.append(heading);
      if (thread.agenda && thread.agenda !== title) card.append(element('p', thread.agenda, 'muted'));
      const files = element('div', '', 'files');
      if (!thread.edits.length) files.append(element('small', labels.unknown));
      for (const edit of thread.edits) {
        const key = agent+thread.id+edit.file;
        const context = {...identity,file:edit.file};
        const row = element('div','','file-entry');
        const file = button('', 'evidence', context, key);
        file.title = edit.file;
        file.setAttribute('aria-label',edit.file);
        file.append(element('span', edit.file.split('/').at(-1)), element('small', labels[edit.pending ? 'pending' : edit.kind]));
        const details = element('details');
        details.dataset.key = key+'why';
        details.open = expanded.has(details.dataset.key);
        file.addEventListener('click', () => { details.open = true; });
        const summary = element('summary',labels.why);
        summary.dataset.key = key+'whyToggle';
        summary.setAttribute('aria-label', labels.why+' '+edit.file);
        const explanation = element('div','','file-context');
        if (edit.reason) explanation.append(element('p',edit.reason));
        else if (edit.context) explanation.append(element('small',labels.context),element('p',edit.context));
        else explanation.append(element('p',labels.noReason));
        const actions = element('div');
        if (edit.hasExcerpt) actions.append(button(labels.current,'file',context,key+'current'));
        if (!edit.reason) actions.append(button(labels.ask,'why',context,key+'ask'));
        explanation.append(actions);
        details.append(summary,explanation);
        row.append(file,details);
        files.append(row);
      }
      card.append(files, button(labels.send, 'send', identity, agent+thread.id, 'send'));
      if (thread.hasReply) card.append(button(labels.reply, 'reply', identity, agent+thread.id+'reply', 'send'));
      if (thread.impact) {
        const details = element('details');
        details.dataset.key = agent+thread.id+'impact';
        details.open = expanded.has(details.dataset.key);
        details.append(element('summary', labels.impact),element('p',thread.impact,'muted'));
        card.append(details);
      }

      lane.append(card);
    }
    fragment.append(lane);
  }
  lanes.replaceChildren(fragment);
  if (focusKey) [...lanes.querySelectorAll('button,summary')].find(item => item.dataset.key === focusKey)?.focus({preventScroll:true});
});
api.postMessage({command:'ready'});
</script></body></html>`;
}
