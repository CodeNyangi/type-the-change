import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// This check belongs only to the small bundled demo. The child process executes
// the saved demo file; production projects use their own existing VS Code task.
const file=new URL('./price.ts',import.meta.url);
const code=(await readFile(file,'utf8')).replace(/: number\[\]/g,'').replace(/: number/g,'');
const {total}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
let failed=0;
for(const [input,expected]of [[[10,-5,20],30],[[-5,10,20],30],[[],0],[[-1,-2],0]]){
  const actual=total(input);
  if(actual!==expected){failed++;console.log(`${fileURLToPath(file)}:5:1: error ${JSON.stringify(input)} → expected ${expected}, got ${actual}`);}
}
console.log(failed?`${failed} checks failed`:'4 checks passed');process.exitCode=failed?1:0;
