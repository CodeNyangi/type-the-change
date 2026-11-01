import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletedText,InferenceError} from '../src/inference.js';
function stream(events:unknown[],split=false){const text=events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('');const bytes=new TextEncoder().encode(text);return new ReadableStream<Uint8Array>({start(c){if(split)for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));else c.enqueue(bytes);c.close();}});}
test('only completed inference is returned, including split UTF8 and SSE boundaries',async()=>{
 const events=[{type:'response.output_text.delta',delta:'한글 '},{type:'response.output_text.delta',delta:'plan'},{type:'response.completed',response:{status:'completed'}}];
 assert.equal(await readCompletedText(stream(events,true)),'한글 plan');
});
test('partial, interrupted and failed inference cannot become a plan',async()=>{
 await assert.rejects(readCompletedText(stream([{type:'response.output_text.delta',delta:'{"version":1}'}])),/완료된/);
 await assert.rejects(readCompletedText(stream([{type:'response.output_text.delta',delta:'partial'},{type:'response.incomplete'}])));
 await assert.rejects(readCompletedText(stream([{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}])),e=>e instanceof InferenceError&&e.usageLimited);
});
test('cancelling a stream never returns a completed result',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(readCompletedText(stream([{type:'response.completed',response:{status:'completed'}}]),controller.signal));
});
test('aborting a pending reader tolerates cancellation failure without an unhandled rejection',async()=>{
 const controller=new AbortController();
 const body=new ReadableStream<Uint8Array>({cancel(){return Promise.reject(new Error('already closed'));}});
 const result=readCompletedText(body,controller.signal);controller.abort();
 await assert.rejects(result);
});
