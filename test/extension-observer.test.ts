import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
test('the shipped companion cannot execute or resume Codex agents or authenticate independently',async()=>{
 const result=await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],write:false});
 const code=result.outputFiles[0].text;
 for(const method of ['thread/start','thread/resume','thread/fork','turn/start','turn/steer','turn/interrupt','account/login/start','model/list'])assert.ok(!code.includes('"'+method+'"'),method+' must not ship');
 assert.ok(!code.includes('api.openai.com'));assert.ok(!code.includes('auth.openai.com'));
});
test('the public extension exposes a movable companion with no independent agent entry points',async()=>{
 const manifest=JSON.parse(await readFile('package.json','utf8'));
 assert.equal(manifest.contributes.viewsContainers.secondarySidebar[0].id,'typeTheChange');
 const commands=manifest.contributes.commands.map((c:any)=>c.command);
 for(const name of ['generate','chooseModel','signIn','newChat'])assert.ok(!commands.includes('typeTheChange.'+name));
 for(const name of ['moveView','refreshChats','setupLive','openCodexThread'])assert.ok(commands.includes('typeTheChange.'+name));
});
