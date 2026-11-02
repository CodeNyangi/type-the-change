import path from 'node:path';
import {createHash} from 'node:crypto';
import type {ActivityItem} from './codex-observer.js';
import {parseHunks} from './change-review.js';
import {validateRelativePath} from './plan.js';
import {isLearningCode} from './learning-context.js';

export interface LessonCard {
 version:1|2;title:string;explanation:string;requestId?:string;
 source:{file:string;worktree?:string;before:string;after:string};
}
export interface VerifiedLesson {id:string;messageId:string;card:LessonCard;root:string;editId:string;file:string;historical?:boolean;origin?:'context'}
const text=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const code=(value:unknown)=>typeof value==='string'&&!!value.trim()&&value.length<=1400&&value.trimEnd().split('\n').length<=12;
export function readLesson(message:string):LessonCard|undefined{
 const blocks=[...message.matchAll(/```ttc-lesson\s*\n([\s\S]*?)\n```/g)];
 for(const block of blocks.reverse())try{
  if(block[1].length>9000)continue;const raw=JSON.parse(block[1]);
  if(![1,2].includes(raw.version)||!text(raw.title,70)||!text(raw.explanation,420))continue;
  if(!raw.source||!(raw.source.before===''||code(raw.source.before))||!code(raw.source.after)||raw.source.before===raw.source.after)continue;
  validateRelativePath(raw.source.file);const file=raw.source.file as string;if(!isLearningCode(file))continue;
  if(raw.source.worktree!==undefined&&(!text(raw.source.worktree,2000)||!path.isAbsolute(raw.source.worktree)))continue;
  // Older cards may contain quiz fields. They are deliberately not retained.
  if(raw.requestId!==undefined&&!/^[0-9a-f-]{36}$/i.test(raw.requestId))continue;
  return {...(raw.requestId?{requestId:raw.requestId}:{}),version:raw.version,title:raw.title.trim(),explanation:raw.explanation.trim(),source:{file,worktree:raw.source.worktree,before:raw.source.before,after:raw.source.after}};
 }catch{/* Untrusted provider records are data, never HTML or executable plans. */}
}
function normalized(code:string){const lines=code.replace(/\r\n/g,'\n').trimEnd().split('\n');const indent=Math.min(...lines.filter(line=>line.trim()).map(line=>line.match(/^\s*/)?.[0].length||0));return lines.map(line=>line.slice(Math.min(indent,line.length))).join('\n').trim();}
function containsSnippet(code:string,snippet:string){
 const wanted=normalized(snippet);if(!wanted)return true;
 const lines=code.replace(/\r\n/g,'\n').split('\n'),length=wanted.split('\n').length;
 for(let start=0;start+length<=lines.length;start++)if(normalized(lines.slice(start,start+length).join('\n'))===wanted)return true;
 return false;
}
const canonical=(value:string)=>value.replace(/^\/tmp\//,'/private/tmp/').replace(/^\/var\//,'/private/var/').replace(/\/$/,'');
/** Existing public context immediately before an edit, never an inferred
 * line-level rationale or the latest response paired with an older patch. */
export function existingExplanation(items:ActivityItem[],roots:string[]):VerifiedLesson|undefined{
 for(let i=items.length-1;i>=0;i--){
  const edit=items[i];if(edit.kind!=='change'||!edit.turnId)continue;
  let message:ActivityItem|undefined;
  for(let n=i-1;n>=0;n--){const item=items[n];if(item.turnId!==edit.turnId||item.kind==='change'||item.kind==='user')break;if(item.kind==='assistant'){message=item;break;}}
  if(!message||message.text.includes('```'))continue;
  const paragraph=message.text.trim().split(/\n\s*\n/)[0];
  if(paragraph.length<45||paragraph.length>420||/VS Code|TTC|재실행|다시 로드|설치|로그인|알려\s?주세요|restart|reload|install|sign.?in|\?/i.test(paragraph))continue;
  const options:{root:string;file:string;before:string;after:string;score:number}[]=[];
  for(const change of edit.diffs??[]){
   if(!path.isAbsolute(change.path))continue;
   const matches=roots.filter(root=>{const file=path.relative(root,change.path);return file&&!path.isAbsolute(file)&&file!=='..'&&!file.startsWith('..'+path.sep);}).sort((a,b)=>b.length-a.length);
   const root=matches[0];if(!root)continue;const file=path.relative(root,change.path).split(path.sep).join('/');if(!isLearningCode(file)||!paragraph.includes(file))continue;
   for(const h of parseHunks(change.diff)){
    if(!code(h.after)||!(h.before===''||code(h.before))||h.before===h.after)continue;
    const changed=h.patch.split('\n').filter(line=>/^[+-]/.test(line)).map(line=>line.slice(1)).filter(line=>line.trim());
    if(!changed.some(line=>!/^\s*(?:import |from |\/\/|#)/.test(line)))continue;
    options.push({root,file,before:h.before,after:h.after,score:(paragraph.includes(path.basename(file))?100:0)+changed.filter(line=>/\b(?:if|return|raise|where|and|or|WHERE|AND|OR)\b/.test(line)).length});
   }
  }
  const option=options.sort((a,b)=>b.score-a.score)[0];if(!option)continue;
  const first=paragraph.split(/(?<=[.!。])\s/)[0],title=first.length<=70?first:first.slice(0,67)+'…';
  const card:LessonCard={version:2,title,explanation:paragraph,source:{file:option.file,worktree:option.root,before:option.before,after:option.after}};
  const verified=verifyLesson(card,message.id,[edit],roots);if(verified)return {...verified,origin:'context'};
 }
}
export function verifyLesson(card:LessonCard,messageId:string,items:ActivityItem[],roots:string[],allowHistorical=false):VerifiedLesson|undefined{
 const candidates=[...roots];if(allowHistorical&&card.source.worktree&&!candidates.some(root=>canonical(root)===canonical(card.source.worktree!)))candidates.push(card.source.worktree);
 const matches=new Map<string,{root:string;editId:string}>();
 for(const item of items)for(const change of item.diffs??[])for(const root of candidates){
  if(!roots.includes(root)&&!path.isAbsolute(change.path))continue;
  if(card.source.worktree&&canonical(root)!==canonical(card.source.worktree))continue;
  if(canonical(path.resolve(root,change.path))!==canonical(path.resolve(root,card.source.file)))continue;
  if(parseHunks(change.diff).some(hunk=>containsSnippet(hunk.before,card.source.before)&&containsSnippet(hunk.after,card.source.after)&&(!!card.source.before||!containsSnippet(hunk.before,card.source.after))))matches.set(root,{root,editId:item.id});
 }
 if(matches.size!==1)return;
 const match=[...matches.values()][0];return {id:createHash('sha256').update(messageId+JSON.stringify(card)).digest('hex').slice(0,20),messageId,card,...match,file:card.source.file,historical:!roots.some(root=>canonical(root)===canonical(match.root))};
}
export function lessonPrompt(korean:boolean,requestId?:string){
 return (korean?'이 채팅에서 이미 수행한 실제 코드 변경 하나를 이해할 수 있게 짧게 설명해 주세요. 새 작업·수정·검사 실행은 하지 마세요. 설치·재실행 안내, 진행 보고, 문서·테스트 수정은 학습 주제로 고르지 마세요.':'Explain one actual source-code change already made in this chat. Do not run new work, edits or checks. Exclude installation instructions, progress reports, documentation and test changes.')+'\n\n'+
 (korean?'이미 설명한 변경이 있다면 다른 개념을 고르세요. 짧은 제목과, 무엇이 달라졌고 왜 필요한지 이해할 수 있는 설명을 3문장 이내로 작성하세요. 질문·선택지·정답·퀴즈는 만들지 마세요. 예시에 requestId가 있으면 그대로 유지하세요. 해당 수정 기록의 전후 코드에서 같은 작은 구간을 정확히 발췌하세요(각 12줄 이하). 이후의 다른 수정이나 현재 파일을 섞지 마세요. file은 작업공간 안의 상대경로, worktree는 그 수정 당시의 절대경로입니다. 워크트리가 삭제됐어도 당시 경로를 유지하고 현재 저장소 경로로 대체하지 마세요. 새로 추가된 코드는 before를 빈 문자열로 두세요. 기록에 없는 예제를 만들지 마세요. 다음 형식의 코드 블록 하나만 답하세요.':'Choose a different concept if this chat already explained one. Give a short title and at most three sentences explaining what changed and why it matters. Do not create questions, choices, answers or quizzes. Preserve requestId from the example when present. Quote matching before/after excerpts exactly from one recorded edit (at most 12 lines each), without mixing later edits or current files. Use a workspace-relative file path and the absolute worktree path at the time of that edit, even if it has since been removed. Do not substitute the current repository path. Use an empty before for added code. Do not invent examples absent from the record. Reply only with one fenced block in this format:')+
 '\n\n```ttc-lesson\n'+JSON.stringify({...requestId?{requestId}:{},version:2,title:'...',explanation:'...',source:{file:'services/example.py',worktree:'/absolute/original-worktree',before:'...',after:'...'}},null,2)+'\n```';
}
