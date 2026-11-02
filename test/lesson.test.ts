import test from 'node:test';
import assert from 'node:assert/strict';
import {readLesson,verifyLesson,lessonPrompt} from '../src/lesson.js';
const card={version:2 as const,title:'오류 종류와 표시 문구를 나누는 이유',explanation:'기존 조건은 오류의 종류가 아니라 한글 문자열을 찾습니다. 오류 코드를 따로 보관하면 표시 언어와 분리할 수 있습니다.',source:{file:'handlers/example.py',worktree:'/repo',before:'if "찾을 수 없" in detail:\n    status = 404\n',after:'status = exception_status(error)\n'}};
const message=(value:any)=>'```ttc-lesson\n'+JSON.stringify(value)+'\n```';
const edit:any={id:'edit',kind:'change',text:'',diffs:[{path:'/repo/handlers/example.py',diff:'@@ -1,2 +1,1 @@\n-if "찾을 수 없" in detail:\n-    status = 404\n+status = exception_status(error)\n'}]};
test('only an explicit bounded learning card can become a lesson',()=>{
 assert.deepEqual(readLesson(message(card)),card);assert.equal(readLesson('Please restart VS Code. Here is the last request.'),undefined);
 for(const value of [{...card,version:3},{...card,explanation:'x'.repeat(421)},{...card,source:{...card.source,file:'../outside.py'}},{...card,source:{...card.source,file:'.env'}},{...card,source:{...card.source,file:'test-host/a.ts'}},{...card,source:{...card.source,before:'line\n'.repeat(20)}}])assert.equal(readLesson(message(value)),undefined);
});
test('older owner-authored cards remain readable without retaining quiz fields',()=>{
 const result=readLesson(message({...card,version:1,question:'An old question',choices:[{id:'a',text:'A'},{id:'b',text:'B'}],answer:'a'}));
 assert.deepEqual(result,{...card,version:1});for(const key of ['question','choices','answer'])assert.equal(Object.hasOwn(result!,key),false);
});
test('the example must match the same recorded edit in one registered worktree',()=>{
 assert.ok(verifyLesson(card,'assistant',[edit],['/repo']));assert.equal(verifyLesson(card,'assistant',[edit],['/different']),undefined);
 assert.equal(verifyLesson({...card,source:{...card.source,after:'invented()'}},'assistant',[edit],['/repo']),undefined);
 const two=[{...edit,diffs:[{path:'handlers/example.py',diff:edit.diffs[0].diff}]}];
 assert.equal(verifyLesson({...card,source:{...card.source,worktree:undefined}},'assistant',two,['/repo','/other']),undefined);
});
test('new code excerpts are allowed only when they were absent before the recorded edit',()=>{
 const fresh={...card,source:{...card.source,before:''}};assert.ok(verifyLesson(fresh,'assistant',[edit],['/repo']));
 const unchanged={...edit,diffs:[{path:'/repo/handlers/example.py',diff:'@@ -1,2 +1,2 @@\n status = exception_status(error)\n-old\n+new\n'}]};assert.equal(verifyLesson(fresh,'assistant',[unchanged],['/repo']),undefined);
});
test('handoff asks the existing Codex to write one card without changing source or starting new work',()=>{
 assert.match(lessonPrompt(true),/새 작업·수정·검사 실행은 하지/);assert.match(lessonPrompt(false),/Do not run new work/);assert.match(lessonPrompt(true),/```ttc-lesson/);
});

test('removed worktrees allow only an exact historical snapshot without reading source files',()=>{
 const historical=verifyLesson(card,'assistant',[edit],[],true);assert.equal(historical?.historical,true);assert.equal(historical?.root,'/repo');
 const relative={...edit,diffs:[{path:'handlers/example.py',diff:edit.diffs[0].diff}]};assert.equal(verifyLesson(card,'assistant',[relative],[],true),undefined);
});

test('a short excerpt keeps its relative indentation inside a larger recorded function',()=>{
 const nested={...card,source:{...card.source,before:'',after:'if payment.amount != order.amount:\n    raise InvalidPayment()'}};
 const recorded={...edit,diffs:[{path:'/repo/handlers/example.py',diff:'@@ -0,0 +1,6 @@\n+class Client:\n+    def verify(self):\n+        if payment.amount != order.amount:\n+            raise InvalidPayment()\n+        return True\n+\n'}]};
 assert.ok(verifyLesson(nested,'assistant',[recorded],['/repo']));
 assert.equal(verifyLesson({...nested,source:{...nested.source,after:'if payment.amount != order.amount:\nraise InvalidPayment()'}},'assistant',[recorded],['/repo']),undefined,'flattening the guarded body changes the example');
});
