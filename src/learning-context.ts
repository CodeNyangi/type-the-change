import path from 'node:path';
import type {ActivityItem} from './codex-observer.js';

/** Display cleanup only. Provider text never becomes HTML or an instruction. */
export function cleanCodexText(text:string){
 const reply=text.match(/<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>/);
 if(reply)try{text=JSON.parse(reply[1]).map((item:any)=>item.answer||'').join('\n');}catch{/* Keep malformed records as inert text. */}
 const request=text.match(/(?:##|###) My request:\s*([\s\S]*)/);if(request)text=request[1];
 const sourceLabel=/[가-힣]/.test(text)?'자료':'Source';
 return text.replace(/:codex-file-citation\{([^}]+)\}/g,(_,attributes)=>{const target=attributes.match(/path="([^"]+)"/)?.[1]||'';return /^https?:\/\/[^\s)]+$/.test(target)?'['+sourceLabel+']('+target+')':target;})
  .replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const value=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return value>0&&value<=0x10ffff?String.fromCodePoint(value):'';})
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,value=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[value]!)).trim();
}
export function textExcerpt(text:string|undefined,limit=260){
 const cleaned=cleanCodexText(text||'').replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g,'')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,(_,label)=>/^https?:\/\//.test(label)?'':label)
  .replace(/https?:\/\/\S+/g,'').replace(/^#{1,6}\s+/gm,'').replace(/\s+/g,' ').trim();
 return cleaned.length>limit?cleaned.slice(0,limit-1)+'…':cleaned;
}
export function isLearningCode(file:string){
 return !/(^|\/)(?:artifacts?|docs?|test|tests|__tests__|fixtures?|node_modules|dist|build|\.git)(\/|$)/i.test(file)
  && !/(?:^|\/)(?:test_[^/]+|[^/]+[._](?:test|spec))\.[^/]+$/i.test(file)
  && /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|rb|php|cs|cpp|cc|c|h|vue|svelte|sql|sh)$/i.test(file);
}
export function editContext(items:ActivityItem[],edit:ActivityItem){
 const index=items.findIndex(item=>item.id===edit.id),before=index<0?items:items.slice(0,index),after=index<0?[]:items.slice(index+1);
 const nextBoundary=after.findIndex(item=>item.kind==='user'||item.kind==='change');
 const following=(nextBoundary<0?after:after.slice(0,nextBoundary)).find(item=>item.kind==='assistant');
 const preceding=[...before].reverse().find(item=>item.kind==='assistant');
 const names=(edit.paths||edit.diffs?.map(d=>d.path)||[]).map(file=>path.basename(file));
 const named=items.find(item=>item.kind==='assistant'&&names.some(name=>item.text.includes(name)));
 return {request:(index<0?items.find(item=>item.kind==='user'):[...before].reverse().find(item=>item.kind==='user'))?.text,
  response:[...items].reverse().find(item=>item.kind==='assistant')?.text,
  nearby:(index<0?named:following||preceding||named)?.text};
}
