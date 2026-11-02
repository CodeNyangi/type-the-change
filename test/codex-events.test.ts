import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {CodexEvents} from '../src/codex-events.js';
test('the packaged hook relays a real local event without storing conversation data or steering Codex',async()=>{
 if(process.platform==='win32')return;
 const output=await build({entryPoints:['src/codex-hook.ts'],bundle:true,platform:'node',format:'cjs',write:false});
 let received:any;const events=new CodexEvents(e=>received=e);await events.start();
 try{const child=spawn(process.execPath,['-e',output.outputFiles[0].text],{stdio:'pipe'});let stdout='';child.stdout.on('data',b=>stdout+=b);child.stderr.resume();
  child.stdin.end(JSON.stringify({session_id:'ttc-event-test',turn_id:'t1',hook_event_name:'PreToolUse',cwd:'/repo',tool_name:'Bash',tool_input:{cwd:'/tmp/feature',command:'private code'},prompt:'private prompt'}));
  await new Promise<void>((resolve,reject)=>{child.on('exit',code=>code===0?resolve():reject(Error('hook exit '+code)));child.on('error',reject);});
  assert.equal(stdout,'{}\n');assert.equal(received.event,'PreToolUse');assert.equal(received.toolCwd,'/tmp/feature');assert.ok(!JSON.stringify(received).includes('private'));assert.equal(events.latest.size,1);
 }finally{events.dispose();}
});
