export function workspaceHtml(korean:boolean){
  const t=(ko:string,en:string)=>korean?ko:en;
  return `<section id="workspace-context" hidden><details id="workspace-details"><summary><span id="workspace-summary"></span><span id="workspace-new" class="change-badge" hidden>${t('새 변경','New changes')}</span></summary><div class="workspace-actions"><button class="quiet" data-command="explainChanges">${t('변경 흐름 설명','Explain changes')}</button><button class="quiet" data-command="viewChanges">${t('변경 비교','Compare changes')}</button><button class="quiet" data-command="refreshWorkspace">${t('새로고침','Refresh')}</button></div><div id="worktree-list"></div><p class="muted">${t('파일 내용은 자동 전송하지 않습니다. 변경 수에는 새 파일 묶음과 저장 전 편집이 포함될 수 있습니다.','File contents are not sent automatically. Counts can include untracked folders and unsaved edits.')}</p></details></section>
<section id="learning-stale" hidden role="status"><p>${t('학습을 시작한 뒤 기준 커밋이 바뀌었습니다. 현재 코드에서 다시 확인하세요.','The baseline commit changed after learning started. Review a fresh suggestion against the current code.')}</p><button class="secondary" data-command="refreshLearning">${t('현재 코드로 다시 확인','Review current code')}</button></section>`;
}
export const workspaceStyles=`
#workspace-context{margin:0 0 12px;border-bottom:1px solid var(--vscode-widget-border,#444);padding-bottom:6px}#workspace-details>summary{display:flex;gap:8px;align-items:center;flex-wrap:wrap;list-style:revert}#workspace-summary{overflow-wrap:anywhere;font-size:11px}.change-badge{font-size:10px;color:var(--vscode-textLink-foreground,#8ac6ff)}.workspace-actions{display:flex;gap:14px;flex-wrap:wrap}.workspace-actions button{font-size:11px}.worktree-card{padding:10px 0;border-top:1px solid var(--vscode-widget-border,#444)}.worktree-card strong{font-size:12px;overflow-wrap:anywhere}.worktree-path,.worktree-meta,.worktree-groups{font-size:11px;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.worktree-files{margin:5px 0;padding-left:15px;font:11px/1.7 var(--vscode-editor-font-family,monospace);overflow-wrap:anywhere}.worktree-card button{font-size:11px}.worktree-current{border-left:2px solid var(--vscode-focusBorder);padding-left:10px}#learning-stale{font-size:12px;padding:10px 12px;margin:0 0 12px;border-left:2px solid var(--vscode-editorWarning-foreground,#d5a34c);background:var(--vscode-textCodeBlock-background,#333)}#learning-stale p{margin-top:0}#learning-stale button{font-size:12px}
`;
export function workspaceScript(korean:boolean){
  const t=(ko:string,en:string)=>korean?ko:en;
  return `
const workspaceLabels=${JSON.stringify({current:t('현재','Current'),changes:t('변경','changes'),worktrees:t('작업공간','worktrees'),unknown:t('확인하지 못함','Unavailable'),waiting:t('확인 대기','Waiting for scan'),clean:t('저장된 변경 없음','No saved changes'),unsaved:t('저장 전','unsaved'),conflicts:t('충돌','conflicts'),overlap:t('다른 작업과 같은 경로','same paths in other worktrees'),open:t('새 창에서 열기','Open in new window'),ago:t('초 전 확인','s since scan'),more:t('개 더','more'),detached:t('분리된 커밋','Detached commit')})};
const worktreeCards=new Map();
function renderWorkspace(s){
 const workspace=s.workspace;$('workspace-context').hidden=!workspace;$('learning-stale').hidden=!s.contextChanged;
 if(!workspace)return;
 const current=workspace.worktrees.find(tree=>tree.current),count=current?.changeCount;
 $('workspace-summary').textContent=[current?.branch||current?.head?.slice(0,7)||'',current?.error?workspaceLabels.unknown:count===undefined?workspaceLabels.waiting:workspaceLabels.changes+' '+count,workspaceLabels.worktrees+' '+workspace.worktrees.length].filter(Boolean).join(' · ');
 $('workspace-new').hidden=!workspace.newChanges;
 const list=$('worktree-list'),paths=new Set(workspace.worktrees.map(tree=>tree.path));
 for(const [root,card]of worktreeCards)if(!paths.has(root)){card.remove();worktreeCards.delete(root);}
 const ordered=[...workspace.worktrees].sort((a,b)=>Number(b.current)-Number(a.current));
 ordered.forEach((tree,index)=>{
  let card=worktreeCards.get(tree.path);
  if(!card){card=document.createElement('article');card.className='worktree-card';for(const [tag,className]of [['strong','worktree-title'],['div','worktree-path'],['div','worktree-meta'],['div','worktree-groups'],['ul','worktree-files'],['button','quiet']]){const node=document.createElement(tag);node.className=className;card.append(node);}card.lastElementChild.type='button';card.lastElementChild.addEventListener('click',()=>send('openWorktree',{root:tree.path}));worktreeCards.set(tree.path,card);}
  if(list.children[index]!==card)list.insertBefore(card,list.children[index]||null);
  card.classList.toggle('worktree-current',!!tree.current);
  const [title,location,meta,groups,files,open]=card.children;
  title.textContent=(tree.current?workspaceLabels.current+' · ':'')+(tree.branch||workspaceLabels.detached+' '+tree.head.slice(0,7));
  location.textContent=tree.path.split(/[\\\\/]/).filter(Boolean).slice(-2).join('/');location.title=tree.path;
  const labels=[tree.error?workspaceLabels.unknown:tree.changeCount===undefined?workspaceLabels.waiting:tree.changeCount?workspaceLabels.changes+' '+tree.changeCount:workspaceLabels.clean];
  if(tree.unsavedCount)labels.push(workspaceLabels.unsaved+' '+tree.unsavedCount);
  if(tree.conflictCount)labels.push(workspaceLabels.conflicts+' '+tree.conflictCount);
  if(tree.overlap)labels.push(workspaceLabels.overlap+' '+tree.overlap);
  if(tree.updatedAt&&Date.now()-tree.updatedAt>6000)labels.push(Math.floor((Date.now()-tree.updatedAt)/1000)+workspaceLabels.ago);
  meta.textContent=labels.join(' · ');groups.textContent=(tree.groups||[]).map(group=>group.name+' '+group.count).join(' · ');
  const fileKey=JSON.stringify(tree.changes);if(card._files!==fileKey){files.replaceChildren();for(const change of tree.changes||[]){const item=document.createElement('li');item.textContent=change.status.trim()+' '+change.path+(change.unsaved?' · '+workspaceLabels.unsaved:'');files.append(item);}if(tree.changeCount>(tree.changes?.length||0)){const item=document.createElement('li');item.textContent='+ '+(tree.changeCount-tree.changes.length)+' '+workspaceLabels.more;files.append(item);}card._files=fileKey;}
  open.hidden=!!tree.current||!!tree.unavailable;open.textContent=workspaceLabels.open;
 });
}
`;
}
