import net from 'node:net';
import {readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {eventsDirectory,eventFromHook} from './codex-events.js';
// A Codex lifecycle callback, not an agent. Always advisory, no model calls,
// no prompt/context output, no transcript reads, no history or file writes.
let input='';const deadline=setTimeout(()=>process.exit(0),800);deadline.unref();
process.stdin.on('data',chunk=>{input+=chunk;if(Buffer.byteLength(input)>4*1024*1024)process.exit(0);});
process.stdin.on('end',async()=>{
 try{
  const event=eventFromHook(JSON.parse(input));if(!event)return;
  const dir=eventsDirectory(),info=await lstat(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||(process.getuid&&info.uid!==process.getuid())||(info.mode&0o077))return;
  const entries=(await readdir(dir)).filter(name=>/^\d+-[a-f0-9]+\.sock$/.test(name)).slice(0,32);
  await Promise.all(entries.map(name=>new Promise<void>(resolve=>{
   const socket=net.createConnection(path.join(dir,name));socket.setTimeout(150,()=>socket.destroy());socket.on('error',()=>resolve());socket.on('close',()=>resolve());socket.on('connect',()=>socket.end(JSON.stringify(event)));
  })));
 }catch{}finally{process.stdout.write('{}\n');}
});
