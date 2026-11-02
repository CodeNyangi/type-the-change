import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {parsePlan,resolveStep} from '../src/plan.js';

test('the shipped demo deliberately fails despite matching; a human alternative handles transfer inputs',async()=>{
  const original=await readFile(new URL('../examples/price.ts',import.meta.url),'utf8');
  const plan=parsePlan(await readFile(new URL('../examples/plan.json',import.meta.url),'utf8'));
  let changed=original;
  for(const step of plan.steps){const resolved=resolveStep(changed,step);changed=resolved.prefix+resolved.after+resolved.suffix;}
  // Execute only the trusted, shipped example and its shipped replacement.
  async function compile(code:string){const js=await transform(code,{loader:'ts',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(js.code).toString('base64'));}
  const before=await compile(original),proposal=await compile(changed),after=await compile(changed.replace('break;','continue;'));
  assert.equal(before.total([10,-5,20]),10);
  assert.equal(before.total([-5,10,20]),0);
  assert.equal(proposal.total([10,-5,20]),10,'matching the exercise proposal is not correctness');
  for(const [input,expected] of [[[10,-5,20],30],[[-5,10,20],30],[[10,0,20],30],[[-5,-10],0],[[],0],[[10,-5,20,-2,3],33]] as const){
    assert.equal(after.total(input),expected,JSON.stringify(input));
  }
});


test('the first practice makes one useful edit and passes mixed, empty, completed and unfinished lists',async()=>{
 const original=await readFile(new URL('../examples/quickstart/tasks.js',import.meta.url),'utf8');
 const plan=parsePlan(await readFile(new URL('../examples/quickstart/plan.json',import.meta.url),'utf8'));assert.equal(plan.steps.length,1);
 const resolved=resolveStep(original,plan.steps[0]);const changed=resolved.prefix+resolved.after+resolved.suffix;
 const before=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));
 const after=await import('data:text/javascript;base64,'+Buffer.from(changed).toString('base64'));
 const tasks=[{title:'Coffee',done:true},{title:'Walk',done:false},{title:'Read',done:false}];
 assert.equal(before.visibleTasks(tasks).length,3);assert.deepEqual(after.visibleTasks(tasks),tasks.slice(1));
 for(const input of [[],tasks.slice(0,1),tasks.slice(1)]){
  const snapshot=JSON.stringify(input);assert.deepEqual(after.visibleTasks(input),input.filter(task=>!task.done));assert.equal(JSON.stringify(input),snapshot);
 }
});
