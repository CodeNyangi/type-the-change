import net from 'node:net';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir,lstat,unlink} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

export const HOOK_EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','PreCompact','PostCompact','Stop','Interrupt','SessionEnd'] as const;
export interface CodexEvent {threadId:string;turnId?:string;event:typeof HOOK_EVENTS[number];at:number;cwd:string;toolCwd?:string;tool?:string}
export const eventsDirectory=()=>path.join(tmpdir(),'ttc-codex-events-'+(process.getuid?.()??'local'));
export function eventFromHook(value:any,now=Date.now()):CodexEvent|undefined {
 if(!value||typeof value.session_id!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(value.session_id)||!HOOK_EVENTS.includes(value.hook_event_name)||typeof value.cwd!=='string'||!path.isAbsolute(value.cwd))return;
 const toolCwd=value.tool_input?.workdir??value.tool_input?.cwd;
 return {threadId:value.session_id,turnId:typeof value.turn_id==='string'?value.turn_id.slice(0,100):undefined,event:value.hook_event_name,at:now,cwd:value.cwd.slice(0,4096),...(typeof toolCwd==='string'&&path.isAbsolute(toolCwd)?{toolCwd:toolCwd.slice(0,4096)}:{}),...(typeof value.tool_name==='string'?{tool:value.tool_name.slice(0,80)}:{})};
}
/** Ephemeral notifications only. No transcript, prompt, response or source is stored. */
export class CodexEvents {
 private server?:net.Server;private socket?:string;private clients=new Set<net.Socket>();
 private disposed=false;
 readonly latest=new Map<string,CodexEvent>();
 constructor(private changed:(event:CodexEvent)=>void){}
 async start(){
  if(process.platform==='win32')return; // The shared app-server connection remains available on Windows.
  const dir=eventsDirectory();await mkdir(dir,{recursive:true,mode:0o700});const info=await lstat(dir);
  if(this.disposed)return;
  if(!info.isDirectory()||info.isSymbolicLink()||(process.getuid&&info.uid!==process.getuid())||(info.mode&0o077))throw Error('Unsafe event directory');
  this.socket=path.join(dir,`${process.pid}-${randomBytes(6).toString('hex')}.sock`);
  const server=net.createServer(socket=>{
   this.clients.add(socket);let buffer='';socket.setTimeout(1000,()=>socket.destroy());
   socket.on('error',()=>{});socket.on('close',()=>this.clients.delete(socket));
   socket.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>16384)socket.destroy();});
   socket.on('end',()=>{
    try{const raw=JSON.parse(buffer);const checked=eventFromHook({session_id:raw.threadId,turn_id:raw.turnId,hook_event_name:raw.event,cwd:raw.cwd,tool_input:{cwd:raw.toolCwd},tool_name:raw.tool},raw.at);
     if(!checked||!Number.isFinite(checked.at)||Math.abs(Date.now()-checked.at)>10000)return;
     if((this.latest.get(checked.threadId)?.at??0)>checked.at)return;
     this.latest.delete(checked.threadId);this.latest.set(checked.threadId,checked);
     while(this.latest.size>100)this.latest.delete(this.latest.keys().next().value!);
     this.changed(checked);
    }catch{}
   });
  });
  this.server=server;server.unref();await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(this.socket,resolve);});
 }
 dispose(){this.disposed=true;for(const socket of this.clients)socket.destroy();this.clients.clear();this.server?.close();if(this.socket)void unlink(this.socket).catch(()=>{});this.latest.clear();}
}
export function mergeHooks(current:unknown,command:string){
 if(!current||typeof current!=='object'||Array.isArray(current))throw Error('Invalid hooks configuration');
 const config=structuredClone(current) as Record<string,any>;
 if(config.hooks!==undefined&&(!config.hooks||typeof config.hooks!=='object'||Array.isArray(config.hooks)))throw Error('Invalid hooks configuration');
 config.hooks??={};
 for(const event of HOOK_EVENTS){
  const groups=config.hooks[event]??[];if(!Array.isArray(groups))throw Error('Invalid hook event');
  config.hooks[event]=groups.filter((group:any)=>group?.hooks?.length!==1||group.hooks[0]?.statusMessage!=='Type the Change: observe Codex');
  config.hooks[event].push({hooks:[{type:'command',command,timeout:1,statusMessage:'Type the Change: observe Codex'}]});
 }
 return config;
}
