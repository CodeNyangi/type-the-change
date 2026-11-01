import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// Import exactly the saved tutorial file, with no dependency or model request.
const source = await readFile(new URL('./total.js', import.meta.url), 'utf8');
const {total} = await import('data:text/javascript,' + encodeURIComponent(source));
const input = [10, -5, 20];
const actual = total(input);
console.log('Input:    [10, -5, 20]');
console.log('Expected: 30');
console.log('Actual:   ' + actual);
console.log(actual === 30 ? 'PASS' : 'FAIL — the last price was lost');
if(actual!==30)console.log(`${fileURLToPath(new URL('./total.js',import.meta.url))}:5:1: error [10, -5, 20] → 예상 30, 실제 ${actual}`);
process.exitCode = actual === 30 ? 0 : 1;
