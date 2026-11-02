import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Companion} from '../src/companion.js';
export async function run(){
 const extension=vscode.extensions.all.find(e=>e.id.toLowerCase()==='codenyangi.type-the-change');assert.ok(extension);
 const api=await extension.activate() as {companion:Companion},model=api.companion,id=process.env.TTC_REAL_THREAD!;
 try{
  await vscode.commands.executeCommand('typeTheChange.start');await vscode.commands.executeCommand('typeTheChange.selectChat',{id});
  const end=Date.now()+30000;while(!model.state.lesson&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(model.state.lesson,'real Codex card must match a recorded edit: '+model.state.lessonStatus);
  const lesson=model.state.lesson,file=path.join(lesson.root,lesson.file),before=lesson.historical?undefined:await readFile(file).catch(()=>undefined);
  await vscode.commands.executeCommand('typeTheChange.openLessonDiff');const tab=vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  assert.ok(tab instanceof vscode.TabInputTextDiff);assert.equal(tab.original.scheme,'ttc-codex-review');assert.equal(tab.modified.scheme,'ttc-codex-review');
  assert.equal((await vscode.workspace.openTextDocument(tab.original)).getText(),lesson.card.source.before);assert.equal((await vscode.workspace.openTextDocument(tab.modified)).getText(),lesson.card.source.after);
  const after=before?await readFile(file):undefined;assert.deepEqual(after,before);
  const output=process.env.TTC_REAL_OUTPUT!;await mkdir(output,{recursive:true});await writeFile(path.join(output,'native.json'),JSON.stringify({version:extension.packageJSON.version,threadId:id,cardId:lesson.id,cardTitle:lesson.card.title,sourceFile:lesson.file,historical:!!lesson.historical,nativeReadOnlyDiff:true,sourceUnchanged:before?true:undefined,sourceSha256:before?createHash('sha256').update(before).digest('hex'):undefined,noHistoricalFilesystemRead:!!lesson.historical,checkedAt:new Date().toISOString()},null,2)+'\n');console.log('REAL LESSON NATIVE PASSED');
 }finally{model.track(false);}
}
