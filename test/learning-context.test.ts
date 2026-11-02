import test from 'node:test';
import assert from 'node:assert/strict';
import {isLearningCode,editContext} from '../src/learning-context.js';

test('edit context follows the request and nearby response at the edit, including mid-turn steering',()=>{
 const items:any[]=[{id:'u1',kind:'user',text:'First request'},{id:'a1',kind:'assistant',text:'First result'},{id:'u2',kind:'user',text:'Check stored prices'},{id:'a2',kind:'assistant',text:'Validate amounts'},{id:'edit',kind:'change',paths:['/repo/payment.py']},{id:'a3',kind:'assistant',text:'Reject invalid amount'},{id:'later',kind:'user',text:'Deploy another feature'},{id:'a4',kind:'assistant',text:'Unrelated final result'}];
 const context=editContext(items,items[4]);assert.equal(context.request,'Check stored prices');assert.equal(context.nearby,'Reject invalid amount');
 for(const file of ['docs/report.md','artifacts/index_sources.py','test/test_payment.py','ui/payment.spec.ts','node_modules/a.js'])assert.equal(isLearningCode(file),false,file);
 for(const file of ['docs\\report.py','artifacts\\index_sources.py','test\\test_payment.py','ui\\payment.spec.ts','node_modules\\a.js'])assert.equal(isLearningCode(file),false,file);
 assert.equal(isLearningCode('services/payment.py'),true);
 assert.equal(isLearningCode('services\\payment.py'),true);
});
