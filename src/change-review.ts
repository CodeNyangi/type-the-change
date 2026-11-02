import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {git,type GitRunner} from './worktrees.js';
import {readWorkspaceFile,WorkspaceFileError} from './workspace-files.js';
import {validateRelativePath} from './plan.js';
export interface Hunk {header:string;oldLine:number;newLine:number;before:string;after:string;patch:string}
export interface EditorComparison {key:string;before:string;after:string}
export interface ChangeReview {root:string;file:string;head:string;before:string;after:string;hash:string;hunks:Hunk[];binary?:boolean;stale?:boolean;recorded?:boolean;dirty?:boolean;editorDiff?:boolean}
export function canPractice(hunk:Hunk|undefined){
 if(!hunk?.before.trim()||!hunk.after.trim()||hunk.before===hunk.after)return false;
 return [hunk.before,hunk.after].every(text=>text.length<=1600&&text.trimEnd().split('\n').length<=16);
}
export function hunkAtLine(hunks:Hunk[],line:number){
 let selected=0;
 for(let i=0;i<hunks.length;i++){
  if(hunks[i].newLine>line)break;
  selected=i;
  if(line<hunks[i].newLine+hunks[i].after.split('\n').length)return i;
 }
 return selected;
}
/** A historical line number is not a location in a changing worktree. */
export function locateHunk(text:string,hunk:Hunk):number|undefined {
 const current=text.replace(/\r\n/g,'\n'),needle=hunk.after.replace(/\r\n/g,'\n').replace(/\n$/,'');
 if(!needle.trim())return;
 let found:number|undefined;
 for(let offset=0;offset<=current.length;){
  const index=current.indexOf(needle,offset);if(index<0)break;offset=index+1;
  if(index>0&&current[index-1]!=='\n'||index+needle.length<current.length&&current[index+needle.length]!=='\n')continue;
  if(found!==undefined)return;found=index;
 }
 return found===undefined?undefined:current.slice(0,found).split('\n').length-1;
}
export function parseHunks(diff:string):Hunk[]{
 const result:Hunk[]=[];let h:Hunk|undefined;
 for(const line of diff.split('\n')){
  const match=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
  if(match){h={header:line,oldLine:Number(match[1]),newLine:Number(match[2]),before:'',after:'',patch:''};result.push(h);}
  else if(h&&/^[ +\-]/.test(line)){h.patch+=line+'\n';if(line[0]!=='+' )h.before+=line.slice(1)+'\n';if(line[0]!=='-')h.after+=line.slice(1)+'\n';}
  else if(h&&line==='\\ No newline at end of file'){
   const last=h.patch.trimEnd().split('\n').at(-1)?.[0];if(last!=='+')h.before=h.before.replace(/\n$/,'');if(last!=='-')h.after=h.after.replace(/\n$/,'');
  }
 }
 return result;
}
export const reviewHash=(head:string,before:string,after:string)=>createHash('sha256').update(JSON.stringify([head,before,after])).digest('hex');
export async function loadChange(root:string,file:string,dirty?:string,run:GitRunner=git,previousPath=file,comparison?:EditorComparison):Promise<ChangeReview>{
 validateRelativePath(file);validateRelativePath(previousPath);
 const head=await run(root,['rev-parse','--verify','HEAD']).then(s=>s.trim()).catch((e)=>{if(e.code===128)return '';throw e;});
 let before='';
 if(head){const tracked=await run(root,['ls-tree','-z',head,'--',previousPath]);if(tracked){if(!/^100(644|755) blob /.test(tracked))throw new WorkspaceFileError('not_regular_file');before=await run(root,['show',`${head}:${previousPath}`]);}}
 if(Buffer.byteLength(before)>1024*1024)throw new WorkspaceFileError('too_large');
 let after='';try{after=await readWorkspaceFile(root,file,1024*1024);}catch(e){if(!(e instanceof WorkspaceFileError)||e.code!=='missing_file')throw e;}
 if(dirty!==undefined){if(Buffer.byteLength(dirty)>1024*1024)throw new WorkspaceFileError('too_large');after=dirty;}
 // The selected SCM diff can be index↔working or HEAD↔index. Reuse its actual
 // documents after validating the workspace path, rather than merging layers.
 if(comparison){before=comparison.before;after=comparison.after;if([before,after].some(s=>Buffer.byteLength(s)>1024*1024))throw new WorkspaceFileError('too_large');}
 if(before.includes('\0')||after.includes('\0'))throw new WorkspaceFileError('invalid_text');
 // Compare pinned bytes, including unsaved buffers. Never invoke repository
 // diff drivers, mutate its index, reset a file, or create a worktree.
 const dir=await mkdtemp(path.join(tmpdir(),'ttc-review-'));
 let diff='';try{await writeFile(path.join(dir,'before'),before);await writeFile(path.join(dir,'after'),after);
  try{diff=await run(dir,['diff','--no-index','--no-ext-diff','--no-textconv','--no-color','--unified=3','--','before','after']);}catch(e:any){if(e.code!==1)throw e;diff=String(e.stdout||'');}
 }finally{await rm(dir,{recursive:true,force:true});}
 const headAfter=await run(root,['rev-parse','--verify','HEAD']).then(s=>s.trim()).catch(()=>head);
 return {root,file,head,before,after,hash:reviewHash(head,before,after),hunks:parseHunks(diff),stale:head!==headAfter,dirty:dirty!==undefined,editorDiff:!!comparison};
}
