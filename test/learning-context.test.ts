import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCodexText,textExcerpt,isLearningCode,editContext} from '../src/learning-context.js';

test('request excerpts skip attachment wrappers, HTML escapes and bare link paragraphs',()=>{
 const text='## My request:\n이제&#x20;\n[https://slack.test/thread](https://slack.test/thread)\n\n계약 전에는 결제를 활성화하지 마세요.';
 assert.equal(textExcerpt(text),'이제 계약 전에는 결제를 활성화하지 마세요.');
 assert.equal(cleanCodexText('<send_user_message_question_reply>[{"answer":"운영 서비스"}]</send_user_message_question_reply>'),'운영 서비스');
 assert.equal(cleanCodexText('&lt;script&gt;alert(1)&lt;/script&gt;'),'<script>alert(1)</script>');
 assert.equal(textExcerpt(':codex-file-citation{path="https://docs.example/prices" purpose="source"}의 정책을 확인했습니다.'),'자료의 정책을 확인했습니다.');
});
test('edit context follows the request and nearby response at the edit, including mid-turn steering',()=>{
 const items:any[]=[{id:'u1',kind:'user',text:'First request'},{id:'a1',kind:'assistant',text:'First result'},{id:'u2',kind:'user',text:'Check stored prices'},{id:'a2',kind:'assistant',text:'Validate amounts'},{id:'edit',kind:'change',paths:['/repo/payment.py']},{id:'a3',kind:'assistant',text:'Reject invalid amount'},{id:'later',kind:'user',text:'Deploy another feature'},{id:'a4',kind:'assistant',text:'Unrelated final result'}];
 const context=editContext(items,items[4]);assert.equal(context.request,'Check stored prices');assert.equal(context.nearby,'Reject invalid amount');
 for(const file of ['docs/report.md','artifacts/index_sources.py','test/test_payment.py','ui/payment.spec.ts','node_modules/a.js'])assert.equal(isLearningCode(file),false,file);
 assert.equal(isLearningCode('services/payment.py'),true);
});
