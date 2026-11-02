import test from 'node:test';
import assert from 'node:assert/strict';
import {queueExplanation,RequestError} from '../src/codex-request.js';
import {Companion} from '../src/companion.js';
const id='01a199f2-6e4d-7f62-8330-bc04bce75fde';
test('explicit requests go to the exact existing owner without shell interpolation or model overrides',async()=>{
 const calls:any[]=[];const prompt='Explain existing code only. $() `literal`\n한국어';
 await queueExplanation('/path with spaces/codex',id,prompt,(async(...args:any[])=>{calls.push(args);return {stdout:'Queued',stderr:''};}) as any);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(0,2),['/path with spaces/codex',['queue','--thread',id,'--message',prompt,'--resume']]);assert.equal(calls[0][2].timeout,30000);assert.equal(calls[0][2].shell,undefined);
 await assert.rejects(queueExplanation('codex','../other',prompt),RequestError);
});
test('unsupported commands and uncertain delivery are distinguished without an automatic retry',async()=>{
 for(const [error,code] of [[{stderr:"unrecognized subcommand 'queue'"},'unsupported'],[{killed:true},'uncertain'],[{code:'ETIMEDOUT'},'uncertain'],[{code:1,stderr:'private provider details'},'failed']] as const){let count=0;await assert.rejects(queueExplanation('codex',id,'explain',(async()=>{count++;throw error;}) as any),(e:any)=>e.code===code&&!e.message.includes('private'));assert.equal(count,1);}
});
test('request status survives chat selection and guards duplicate or uncertain sends',()=>{
 const model=new Companion(async()=>({dispose(){}} as any),()=>{});
 try{model.track(false);model.requestState(id,'sending','request');assert.equal(model.canRequest(id),false);model.requestState(id,'queued');assert.equal(model.canRequest(id),false);model.requestState(id,'uncertain');assert.equal(model.canRequest(id),false);model.requestState(id,'failed');assert.equal(model.canRequest(id),true);model.requestState(id,undefined);assert.equal(model.canRequest(id),true);}finally{model.dispose();}
});
