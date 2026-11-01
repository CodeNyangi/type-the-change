import {readFile} from 'node:fs/promises';
// Import exactly the saved tutorial file, with no dependency or model request.
const source = await readFile(new URL('./total.js', import.meta.url), 'utf8');
const {total} = await import('data:text/javascript,' + encodeURIComponent(source));
const input = [10, -5, 20];
const actual = total(input);
console.log('Input:    [10, -5, 20]');
console.log('Expected: 30');
console.log('Actual:   ' + actual);
console.log(actual === 30 ? 'PASS' : 'FAIL — the last price was lost');
process.exitCode = actual === 30 ? 0 : 1;
