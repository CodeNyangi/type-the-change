import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {CodexObserver,OBSERVER_METHODS,threadSummary,activityItem} from '../src/codex-observer.js';
const fixture=()=>new CodexObserver({command:process.execPath,args:[path.resolve('test/fixtures/codex-observer.mjs')],cwd:process.cwd(),version:'test'});
test('observer reads the existing chat without loading it and falls back when a shared server is absent',async()=>{
 const c=fixture();try{await c.start();assert.equal(c.mode,'history');const list=await c.read('thread/list',{});assert.equal(list.data[0].id,'chat-one');const meta=threadSummary((await c.read('thread/read',{threadId:'chat-one'})).thread)!;assert.equal(meta.runtime,'notLoaded');assert.equal(meta.title,'Existing Codex chat');}finally{c.dispose();}
});
test('the protocol boundary rejects every execution, resume, auth and memory mutation',async()=>{
 const c=fixture();try{for(const method of ['thread/start','thread/resume','thread/fork','turn/start','turn/steer','turn/interrupt','account/login/start','command/exec','config/value/write','thread/goal/set']){assert.equal(OBSERVER_METHODS.has(method),false);await assert.rejects(c.read(method,{}),/not allowed/);}}finally{c.dispose();}
});
test('read-only requests tolerate accumulated event traffic and preserve pagination',async()=>{
 const c=fixture();try{const result=await c.read('thread/items/list',{threadId:'chat-one',cursor:'traffic'});assert.equal(result.data[0].text,'Read the existing work.');assert.equal(result.nextCursor,'older');assert.equal((await c.read('thread/list')).data.length,1);
  await assert.rejects(c.read('thread/items/list',{threadId:'chat-one',cursor:'large-frame'}),/frame too large/);
  assert.equal((await c.read('thread/list')).data.length,1,'a large tool payload cannot poison the next history query');
 }finally{c.dispose();}
});
test('public progress excludes reasoning and raw tool output; file changes retain provenance',()=>{
 assert.equal(activityItem({type:'reasoning',id:'r',content:['private']}),undefined);assert.equal(activityItem({type:'functionCallOutput',id:'f',output:'secret'}),undefined);
 assert.deepEqual(activityItem({type:'fileChange',id:'c',changes:[{path:'/work/a.ts',diff:'@@ -1 +1 @@\n-a\n+b'}]})?.paths,['/work/a.ts']);
 assert.equal(activityItem({type:'agentMessage',id:'a',text:'<script>bad()</script>'})?.text,'<script>bad()</script>');
});
