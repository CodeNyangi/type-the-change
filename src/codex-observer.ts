import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {promisify} from 'node:util';
import {StringDecoder} from 'node:string_decoder';
import {homedir} from 'node:os';
import path from 'node:path';

const execute=promisify(execFile);
export type Json=Record<string,any>;
export class ObserverError extends Error {
 constructor(readonly code:'missing'|'connection'|'protocol'|'timeout',message:string=code){super(message);}
}
export async function findCodex(configured?:string){
 const candidates=configured?[configured]:[
  ...(process.platform==='darwin'?['/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex','/Applications/Codex.app/Contents/Resources/codex']:[]),
  path.join(homedir(),'.local/bin/codex'),'/opt/homebrew/bin/codex','/usr/local/bin/codex','codex',
 ];
 for(const candidate of candidates)try{const {stdout}=await execute(candidate,['--version'],{timeout:3000,maxBuffer:8192,windowsHide:true});if(/codex-cli\s+\d/.test(stdout))return candidate;}catch{}
 throw new ObserverError('missing');
}
// This allowlist is the execution boundary. In particular, resuming an active
// thread would create a second owner. The companion must never do that.
export const OBSERVER_METHODS=new Set(['initialize','thread/list','thread/read','thread/turns/list','thread/items/list','thread/loaded/list']);
export interface ObserverOptions {command:string;args?:string[];cwd:string;version:string;socket?:string;historyOnly?:boolean}
export class CodexObserver {
 private process?:ChildProcessWithoutNullStreams;
 private pending=new Map<number,{resolve:(v:Json)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
 private id=0;private buffer='';private decoder=new StringDecoder('utf8');private boot?:Promise<void>;private closed=false;
 mode:'shared'|'history'='history';
 constructor(private options:ObserverOptions){}
 private close(error=new ObserverError('connection')){
  const child=this.process;this.process=undefined;child?.kill();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();
 }
 private async launch(shared:boolean){
  this.buffer='';this.decoder=new StringDecoder('utf8');
  const args=shared?['app-server','proxy',...(this.options.socket?['--sock',this.options.socket]:[])]:['app-server','--listen','stdio://'];
  const child=spawn(this.options.command,[...(this.options.args??[]),...args],{cwd:this.options.cwd,stdio:'pipe',windowsHide:true});this.process=child;
  child.stderr.resume();
  child.on('error',()=>{if(this.process===child)this.close();});child.on('exit',()=>{if(this.process===child)this.close();});child.stdin.on('error',()=>{if(this.process===child)this.close();});
  child.stdout.on('data',(chunk:Buffer)=>{
   if(this.process!==child)return;
   for(let start=0;start<chunk.length;start+=65536){
    this.buffer+=this.decoder.write(chunk.subarray(start,start+65536));let end;
    while((end=this.buffer.indexOf('\n'))>=0){
     const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);
     if(Buffer.byteLength(line)>16*1024*1024){this.close(new ObserverError('protocol','Response frame too large'));return;}
     if(!line.trim())continue;let msg:Json;try{msg=JSON.parse(line);}catch{this.close(new ObserverError('protocol'));return;}
     // No responses to approvals, input requests or tools: they belong to the
     // owning Codex client. This connection only requests persisted/read state.
     if(!msg||typeof msg!=='object'||Array.isArray(msg)){this.close(new ObserverError('protocol'));return;}
     if(msg.method)continue;
     const pending=this.pending.get(msg.id);if(!pending)continue;this.pending.delete(msg.id);clearTimeout(pending.timer);
     if(msg.error)pending.reject(new ObserverError('protocol',String(msg.error.message||'Unsupported Codex protocol')));else pending.resolve(msg.result??{});
    }
    if(Buffer.byteLength(this.buffer)>16*1024*1024){this.close(new ObserverError('protocol','Response frame too large'));return;}
   }
  });
  await this.rpc('initialize',{clientInfo:{name:'type_the_change_observer',title:'Type the Change',version:this.options.version},capabilities:{experimentalApi:true}},shared?2500:15000);
  child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');this.mode=shared?'shared':'history';
 }
 async start(){
  if(this.closed)throw new ObserverError('connection');
  if(this.boot&&!this.process)this.boot=undefined;
  if(!this.boot)this.boot=(async()=>{if(!this.options.historyOnly)try{await this.launch(true);return;}catch{this.close();}await this.launch(false);})().catch(e=>{this.boot=undefined;throw e;});
  await this.boot;if(!this.process){this.boot=undefined;throw new ObserverError('connection');}
 }
 private rpc(method:string,params:Json,timeout=15000):Promise<Json>{
  if(!OBSERVER_METHODS.has(method))throw new Error('Observer method not allowed');
  return new Promise((resolve,reject)=>{
   if(!this.process){reject(new ObserverError('connection'));return;}
   const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new ObserverError('timeout'));},timeout);
   this.pending.set(id,{resolve,reject,timer});this.process.stdin.write(JSON.stringify({id,method,params})+'\n');
  });
 }
 async read(method:string,params:Json={}){if(method==='initialize'||!OBSERVER_METHODS.has(method))throw new Error('Observer method not allowed');await this.start();return this.rpc(method,params);}
 dispose(){this.closed=true;this.close();}
}
export interface CodexThread {id:string;title:string;cwd:string;updatedAt:number;runtime:string;flags:string[];source?:string;preview?:string}
export interface ActivityItem {id:string;turnId?:string;kind:'user'|'assistant'|'command'|'change'|'plan';text:string;cwd?:string;paths?:string[];diffs?:{path:string;diff:string}[];status?:string}
export function threadSummary(raw:Json):CodexThread|undefined {
 if(typeof raw.id!=='string'||typeof raw.cwd!=='string')return;
 return {id:raw.id,title:String(raw.name||raw.preview||raw.id).slice(0,250),cwd:raw.cwd,updatedAt:Number(raw.updatedAt)||0,runtime:raw.status?.type||'notLoaded',flags:Array.isArray(raw.status?.activeFlags)?raw.status.activeFlags:[],source:typeof raw.source==='string'?raw.source:undefined,preview:typeof raw.preview==='string'?raw.preview.slice(0,1000):undefined};
}
export function activityItem(raw:Json):ActivityItem|undefined {
 const item=raw.item??raw;if(typeof item.id!=='string')return;
 const base={id:item.id,turnId:raw.turnId,status:item.status};
 if(item.type==='agentMessage')return {...base,kind:'assistant',text:String(item.text||'').slice(0,24000)};
 if(item.type==='userMessage')return {...base,kind:'user',text:(item.content??[]).filter((c:Json)=>c.type==='text'||c.type==='inputText').map((c:Json)=>c.text||'').join('\n').slice(0,12000)};
 if(item.type==='plan')return {...base,kind:'plan',text:String(item.text||'').slice(0,12000)};
 if(item.type==='commandExecution')return {...base,kind:'command',text:String(item.command||'').slice(0,240),cwd:typeof item.cwd==='string'?item.cwd:undefined};
 if(item.type==='fileChange')return {...base,kind:'change',text:'',paths:(item.changes??[]).map((c:Json)=>c.path).filter((p:unknown)=>typeof p==='string'),diffs:(item.changes??[]).filter((c:Json)=>typeof c.path==='string'&&typeof c.diff==='string').map((c:Json)=>({path:c.path,diff:c.diff.slice(0,256000)}))};
 // Reasoning, secrets, tool arguments and tool output are deliberately excluded.
}
