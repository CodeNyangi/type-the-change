import path from 'node:path';
import type {ActivityItem} from './codex-observer.js';

export function isLearningCode(file:string){
 return !/(^|\/)(?:artifacts?|docs?|test(?:-host)?|tests|__tests__|fixtures?|node_modules|dist|build|\.git)(\/|$)/i.test(file)
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
