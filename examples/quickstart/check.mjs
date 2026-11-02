import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const file = new URL('./tasks.js', import.meta.url);
const code = await readFile(file, 'utf8');
const {visibleTasks} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const fixtures = [
  {name:'완료한 항목 숨기기 / Hide completed', input:[{title:'Coffee',done:true},{title:'Walk',done:false},{title:'Read',done:false}]},
  {name:'빈 목록 / Empty list', input:[]},
  {name:'모두 완료 / All completed', input:[{title:'Coffee',done:true}]},
  {name:'모두 진행 중 / All unfinished', input:[{title:'Walk',done:false},{title:'Read',done:false}]},
];
let failures = 0;
for (const {name,input} of fixtures) {
  const original = JSON.stringify(input);
  const expected = input.filter(task => !task.done);
  const actual = visibleTasks(input);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || JSON.stringify(input) !== original) {
    failures++;
    console.log(`${fileURLToPath(file)}:4:1: error ${name} · expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else console.log(`✓ ${name}`);
}
console.log(failures ? `${failures} checks failed` : '4 checks passed');
process.exitCode = failures ? 1 : 0;
