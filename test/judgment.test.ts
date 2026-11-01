import test from 'node:test';
import assert from 'node:assert/strict';
import {newJudgment,predict,beginReview,decide,invalidateJudgment} from '../src/judgment.js';

test('a text match cannot replace a prediction, comparison and human evidence',()=>{
 const j=newJudgment();assert.throws(()=>beginReview(j,'a'));assert.throws(()=>predict(j,'  '));
 predict(j,'  음수 뒤의 20도 더해 30이 된다  ');assert.equal(j.phase,'edit');
 assert.throws(()=>decide(j,'a','keep','test passed'),'a note alone cannot bypass comparison');
 beginReview(j,'a');assert.throws(()=>decide(j,'a','keep',' '));
 decide(j,'a','keep','[10, -5, 20] 결과 30을 확인');assert.equal(j.decision,'keep');assert.equal(j.phase,'done');
});
test('human rejection and uncertainty are first-class outcomes, not failures to match',()=>{
 for(const decision of ['reject','defer'] as const){const j=newJudgment();predict(j,'음수만 건너뛴다');beginReview(j,'a');decide(j,'a',decision,decision==='defer'?'':'break는 뒤의 20도 생략한다');assert.equal(j.decision,decision);}
});
test('editing after comparison or decision invalidates evidence but preserves the original prediction',()=>{
 for(const done of [false,true]){const j=newJudgment();predict(j,'30');beginReview(j,'a');if(done)decide(j,'a','keep','입력 세 개 확인');
 assert.equal(invalidateJudgment(j,'a'),false);assert.equal(invalidateJudgment(j,'b'),true);assert.equal(j.phase,'edit');assert.equal(j.prediction,'30');assert.equal(j.evidence,'');assert.equal(j.decision,undefined);assert.throws(()=>decide(j,'b','keep','old proof'));}
});
test('stale comparison and malformed decisions fail without recording acceptance',()=>{
 const j=newJudgment();predict(j,'expected');beginReview(j,'a');
 for(const value of ['approve',null,{},''])assert.throws(()=>decide(j,'a',value,'evidence'));
 assert.throws(()=>decide(j,'b','keep','evidence'));assert.equal(j.phase,'review');
 assert.throws(()=>decide(j,'a','keep','x'.repeat(281)));assert.throws(()=>predict(newJudgment(),'a\0b'));
});
