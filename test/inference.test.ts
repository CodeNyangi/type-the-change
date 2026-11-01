import test, {afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readCompletedText,InferenceError,listModels,generatePlan} from '../src/inference.js';
afterEach(()=>mock.restoreAll());
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

const complete=(text:string)=>({type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]}});
const validPlan={version:1,title:'가격 검사',intent:'음수 제외',steps:[{file:'price.ts',before:'return price;',after:'return Math.max(0, price);',reason:'음수 경계를 확인하세요.'}]};
const planText=JSON.stringify(validPlan);
const sourceFiles=()=>new Map([['price.ts','export function total(price: number) { return price; }']]);
const isAbort=(error:unknown)=>error instanceof Error&&error.name==='AbortError';
const isInference=(error:unknown)=>error instanceof InferenceError;

function rawStream(text:string,split=0){
 const bytes=new TextEncoder().encode(text);
 return new ReadableStream<Uint8Array>({start(c){if(split)for(let i=0;i<bytes.length;i+=split)c.enqueue(bytes.slice(i,i+split));else c.enqueue(bytes);c.close();}});
}

test('terminal completion returns without waiting for an open connection or hanging cancellation',async()=>{
 let cancelled=false;
 const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(complete('finished'))}\n\n`));},cancel(){cancelled=true;return new Promise<void>(()=>{});}});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1000);
 try{assert.equal(await readCompletedText(body,controller.signal),'finished');assert.equal(cancelled,true);assert.equal(body.locked,false);}finally{clearTimeout(timer);controller.abort();}
});

test('completed response is authoritative over earlier deltas',async()=>{
 assert.equal(await readCompletedText(stream([{type:'response.output_text.delta',delta:'draft'},complete('final')])), 'final');
});

test('empty, refused or malformed terminal output cannot revive an earlier plan draft',async()=>{
 const outputs:unknown[]=[[], [{type:'message',content:[]}], [{type:'message',content:[{type:'refusal',refusal:'declined'}]}],
  [{type:'message',content:[{type:'output_text',text:planText},{type:'refusal',refusal:'declined'}]}], null, {}];
 for(const output of outputs){
  mock.method(globalThis,'fetch',async()=>new Response(stream([{type:'response.output_text.delta',delta:planText},{type:'response.completed',response:{status:'completed',output}}])));
  await assert.rejects(generatePlan('test-token','chosen-model','음수 제외',sourceFiles(),{}),isInference);
  mock.restoreAll();
 }
});

test('SSE comments, CRLF, multiline data and byte-split Unicode are accepted',async()=>{
 const wire=': keepalive\r\n\r\nevent: ignored\r\ndata: {"type":"response.output_text.delta",\r\ndata: "delta":"한글🙂"}\r\n\r\n'+`data: ${JSON.stringify({type:'response.completed',response:{status:'completed'}})}\r\n\r\n`;
 assert.equal(await readCompletedText(rawStream(wire,1)),'한글🙂');
});

test('last completed SSE frame may omit trailing separator',async()=>{
 assert.equal(await readCompletedText(rawStream(`data: ${JSON.stringify(complete('final'))}`)),'final');
});

test('done marker, refusal-only output and wrong terminal status cannot succeed',async()=>{
 for(const body of [rawStream('data: [DONE]\n\n'),stream([{type:'response.completed',response:{status:'incomplete'}}]),stream([{type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}}])])
  await assert.rejects(readCompletedText(body),isInference);
});

test('malformed SSE and provider error codes become safe errors',async()=>{
 for(const wire of ['data: {provider-private-data}\n\n','data: null\n\n',`data: ${JSON.stringify({type:'error',code:{unexpected:'private-detail'}})}\n\n`])
  await assert.rejects(readCompletedText(rawStream(wire)),error=>{assert.ok(error instanceof InferenceError);assert.doesNotMatch(error.message,/provider-private-data|private-detail|includes|JSON/);return true;});
});

test('text and stream byte limits reject oversized output and release the reader',async()=>{
 const bodies=[stream([{type:'response.output_text.delta',delta:'x'.repeat(262145)}]),rawStream(':'.repeat(1_048_577))];
 for(const body of bodies){await assert.rejects(readCompletedText(body),isInference);assert.equal(body.locked,false);}
});

test('interrupted stream sanitizes low-level errors and releases its lock',async()=>{
 const body=new ReadableStream<Uint8Array>({pull(){throw new Error('private-token-in-transport-error');}});
 await assert.rejects(readCompletedText(body),error=>{assert.ok(error instanceof InferenceError);assert.doesNotMatch(error.message,/private-token/);return true;});
 assert.equal(body.locked,false);
});

test('model list uses the official endpoint, filters visible valid records, and preserves order',async()=>{
 mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  assert.equal(url,'https://api.openai.com/v1/models');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('Authorization'),'Bearer test-token');assert.ok(init.signal);
  return Response.json({models:[{slug:'second',display_name:'Second',visibility:'list'},{slug:'hidden',display_name:'Hidden',visibility:'hide'},null,{slug:'',display_name:'Empty',visibility:'list'},{slug:'first',display_name:'First',visibility:'list'}]});
 });
 assert.deepEqual(await listModels('test-token'),[{slug:'second',displayName:'Second'},{slug:'first',displayName:'First'}]);
});

test('empty model catalogs are valid; wrong envelopes and malformed JSON are clean errors',async()=>{
 mock.method(globalThis,'fetch',async()=>Response.json({models:[]}));assert.deepEqual(await listModels('token'),[]);mock.restoreAll();
 for(const text of ['null','{}','{"data":[]}','provider-private-data']){
  mock.method(globalThis,'fetch',async()=>new Response(text));
  await assert.rejects(listModels('token'),error=>{assert.ok(error instanceof InferenceError);assert.doesNotMatch(error.message,/provider-private-data|TypeError/);return true;});mock.restoreAll();
 }
});

test('model responses have both advertised and streamed byte limits',async()=>{
 for(const advertised of [true,false]){
  let cancelled=false;
  const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(300000)));},cancel(){cancelled=true;}});
  mock.method(globalThis,'fetch',async()=>new Response(body,{headers:advertised?{'Content-Length':'300000'}:{}}));
  await assert.rejects(listModels('token'),isInference);assert.equal(cancelled,true);assert.equal(body.locked,false);mock.restoreAll();
 }
});

test('HTTP usage limits and denied access are classified without exposing response text',async()=>{
 for(const [status,payload,limited] of [[429,{error:{code:'x',message:'private-provider-message'}},true],[400,{error:{code:'subscription_sharing_usage_limit_exceeded'}},true],[403,{error:{code:99}},false],[500,{error:{code:{bad:true}}},false]] as const){
  mock.method(globalThis,'fetch',async()=>Response.json(payload,{status}));
  await assert.rejects(listModels('token'),error=>{assert.ok(error instanceof InferenceError);assert.equal(error.usageLimited,limited);assert.doesNotMatch(error.message,/private-provider-message|includes/);return true;});mock.restoreAll();
 }
});

test('oversized error bodies are cancelled while preserving the HTTP error classification',async()=>{
 let cancelled=false;
 const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(300000)));},cancel(){cancelled=true;}});
 mock.method(globalThis,'fetch',async()=>new Response(body,{status:429}));
 await assert.rejects(generatePlan('token','model','intent',sourceFiles(),{}),error=>error instanceof InferenceError&&error.usageLimited);
 assert.equal(cancelled,true);
});

test('Responses request uses subscription-compatible fields and only supplied file content',async()=>{
 const files=sourceFiles(),before=[...files];const schema={type:'object'};
 mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
  assert.equal(new Headers(init.headers).get('Authorization'),'Bearer test-token');
  const data=JSON.parse(String(init.body));assert.equal(data.model,'chosen-model');assert.equal(data.store,false);assert.equal(data.stream,true);
  assert.deepEqual(data.text,{format:{type:'json_schema',name:'typing_plan',strict:true,schema}});
  assert.deepEqual(Object.keys(data).sort(),['input','model','store','stream','text']);assert.equal(data.input[0].role,'user');
  assert.ok(data.input[0].content.includes(JSON.stringify({intent:'음수 제외',files:[...files].map(([file,content])=>({file,content}))})));
  return new Response(stream([complete(planText)]));
 });
 assert.deepEqual(await generatePlan('test-token','chosen-model','음수 제외',files,schema),validPlan);assert.deepEqual([...files],before);
});

test('generation rejects invalid plan output even after a successful terminal response',async()=>{
 for(const output of ['not-json',JSON.stringify({...validPlan,steps:[{...validPlan.steps[0],file:'../secret.ts'}]})]){
  mock.method(globalThis,'fetch',async()=>new Response(stream([complete(output)])));
  await assert.rejects(generatePlan('token','model','intent',sourceFiles(),{}));mock.restoreAll();
 }
});

test('pre-cancelled model and generation requests never contact the provider',async()=>{
 const controller=new AbortController();controller.abort();
 const fetchMock=mock.method(globalThis,'fetch',async()=>assert.fail('No request should start'));
 await assert.rejects(listModels('token',controller.signal),isAbort);
 await assert.rejects(generatePlan('token','model','intent',sourceFiles(),{},controller.signal),isAbort);
 assert.equal(fetchMock.mock.callCount(),0);
});

test('cancelling a pending models body closes it and returns AbortError',async()=>{
 let cancelled=false,ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});
 const body=new ReadableStream<Uint8Array>({pull(){ready();},cancel(){cancelled=true;}});
 mock.method(globalThis,'fetch',async()=>new Response(body));
 const controller=new AbortController(),pending=listModels('token',controller.signal);await started;controller.abort();
 await assert.rejects(pending,isAbort);assert.equal(cancelled,true);assert.equal(body.locked,false);
});

test('timeouts are visible retry errors, while network details stay private',async()=>{
 const controller=new AbortController();controller.abort(new DOMException('provider-detail','TimeoutError'));
 await assert.rejects(listModels('token',controller.signal),error=>error instanceof InferenceError&&/지연/.test(error.message));
 mock.method(globalThis,'fetch',async()=>{throw new Error('private-token-in-transport');});
 await assert.rejects(generatePlan('token','model','intent',sourceFiles(),{}),error=>{assert.ok(error instanceof InferenceError);assert.doesNotMatch(error.message,/private-token/);return true;});
});
