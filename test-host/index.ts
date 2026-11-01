import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Plan} from '../src/plan.js';

interface SessionState {file:string;index:number;complete:boolean;status:string}
interface ExtensionApi {
  startPlan(plan:Plan,root:string):Promise<void>;
  next():Promise<void>;
  stop():Promise<void>;
  getState():SessionState|null;
}

async function replaceDocument(document:vscode.TextDocument,text:string){
  const editor=await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,preview:false});
  const changed=await editor.edit(edit=>edit.replace(new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),text));
  assert.equal(changed,true,'test edit succeeds in the native editor');
  return editor;
}

async function waitForStatus(root:string,state:string){
  const end=Date.now()+5000;
  while(Date.now()<end){
    try{const current=JSON.parse(await readFile(path.join(root,'.type-the-change/status.json'),'utf8'));if(current.state===state)return current;}catch{}
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.fail(`The extension did not persist the ${state} status.`);
}

async function testMultipleFiles(api:ExtensionApi,root:string){
  const firstFile=path.join(root,'first.ts'),secondFile=path.join(root,'second.ts');
  const firstBefore='export const first = 1;\n',firstAfter='export const first = 2;\n';
  const secondBefore='export const second = 10;\n',secondAfter='export const second = 20;\n';
  await writeFile(firstFile,firstBefore);await writeFile(secondFile,secondBefore);
  const plan:Plan={version:1,title:'Two files',intent:'Update both constants.',steps:[
    {file:'first.ts',before:firstBefore,after:firstAfter,reason:'Update the first constant.'},
    {file:'second.ts',before:secondBefore,after:secondAfter,reason:'Update the second constant.'},
  ]};
  await api.startPlan(plan,root);
  const first=await vscode.workspace.openTextDocument(vscode.Uri.file(firstFile));
  const second=await vscode.workspace.openTextDocument(vscode.Uri.file(secondFile));
  assert.equal(first.getText(),firstBefore);assert.equal(second.getText(),secondBefore);
  await replaceDocument(first,firstAfter);await api.next();
  assert.equal(api.getState()?.index,1,'the accepted first step advances to the second file');
  await replaceDocument(second,secondAfter);
  assert.equal(api.getState()?.status,'matched');

  // Undo an already accepted edit while the last file itself still matches.
  await replaceDocument(first,firstBefore);
  assert.equal(api.getState()?.status,'outside','a prior file is still part of the comparison');
  await api.next();assert.equal(api.getState()?.complete,false,'a matching current file cannot hide a reverted earlier edit');
  assert.equal(api.getState()?.index,1);
  await waitForStatus(root,'outside');
  await replaceDocument(first,firstAfter);
  assert.equal(api.getState()?.status,'matched');await api.next();
  assert.equal(api.getState()?.complete,true);await waitForStatus(root,'complete');

  // A completed session must also notice a later change in a different file.
  await replaceDocument(first,'// changed after review\n'+firstAfter);
  assert.equal(api.getState()?.complete,false,'completion is not an immutable claim about later file content');
  assert.equal(api.getState()?.status,'outside');await waitForStatus(root,'outside');
  await replaceDocument(first,firstAfter);await api.next();
  assert.equal(api.getState()?.complete,true,'restoring both files permits deliberate acceptance again');
  assert.equal(await readFile(firstFile,'utf8'),firstBefore,'reviewing never saves the first buffer');
  assert.equal(await readFile(secondFile,'utf8'),secondBefore,'reviewing never saves the second buffer');
  await api.stop();await waitForStatus(root,'idle');
}

async function testAsyncSessionChanges(api:ExtensionApi,root:string){
  const firstFile=path.join(root,'race-first.ts'),secondFile=path.join(root,'race-second.ts');
  const firstBefore='export const beforeFirst = 1;\n',firstAfter='export const beforeFirst = 2;\n';
  const secondBefore='export const beforeSecond = 3;\n',secondAfter='export const beforeSecond = 4;\n';
  await writeFile(firstFile,firstBefore);await writeFile(secondFile,secondBefore);
  const plan:Plan={version:1,title:'Pending operations',intent:'Exercise a sequential change.',steps:[
    {file:'race-first.ts',before:firstBefore,after:firstAfter,reason:'Change the first value.'},
    {file:'race-second.ts',before:secondBefore,after:secondAfter,reason:'Change the second value.'},
  ]};

  // startPlan yields at filesystem validation. Stop must win before it resumes.
  const pendingStart=api.startPlan(plan,root);
  await api.stop();await pendingStart;
  assert.equal(api.getState(),null,'a pending start cannot resurrect a stopped session');

  // The most recent requested plan wins without an older preflight showing over it.
  const replacement:Plan={version:1,title:'Latest plan',intent:'Use only the second file.',steps:[plan.steps[1]]};
  const older=api.startPlan(plan,root),newer=api.startPlan(replacement,root);
  await Promise.all([older,newer]);
  assert.equal(api.getState()?.file,'race-second.ts','a stale plan preflight cannot replace the newer session');
  assert.equal(api.getState()?.index,0);await api.stop();

  await api.startPlan(plan,root);
  const first=await vscode.workspace.openTextDocument(vscode.Uri.file(firstFile));
  await replaceDocument(first,firstAfter);
  assert.equal(api.getState()?.status,'matched');
  const pendingNext=api.next();
  await api.stop();await pendingNext;
  assert.equal(api.getState(),null,'a pending next-file read cannot recreate a stopped session');
  assert.equal(first.getText(),firstAfter,'stopping retains the human edit');
  assert.equal(await readFile(firstFile,'utf8'),firstBefore,'stopping does not save or revert the human edit');
  assert.equal(await readFile(secondFile,'utf8'),secondBefore,'the pending step never edits its target');
}

export async function run(){
  const root=process.env.TTC_HOST_TEST_ROOT!;
  const file=path.join(root,'sample.ts'),original='export function greet() {\n  return "hi";\n}\n';
  await writeFile(file,original);
  const extension=vscode.extensions.all.find(e=>e.id.toLowerCase()==='codenyangi.type-the-change');assert.ok(extension,'extension discovered');
  const api=await extension.activate() as ExtensionApi;
  const plan:Plan={version:1,title:'Greet warmly',intent:'Change the greeting',steps:[{file:'sample.ts',before:'  return "hi";',after:'  return "hello";',reason:'Keep the same function and change its return value.'}]};
  await api.startPlan(plan,root);
  const editor=vscode.window.visibleTextEditors.find(e=>e.document.uri.fsPath===file)!;assert.ok(editor);
  assert.equal(editor.document.getText(),original,'starting never edits source');
  assert.equal(await readFile(file,'utf8'),original,'disk source unchanged');
  assert.equal(editor.document.getText(editor.selection),plan.steps[0].before,'exact change is selected');
  await editor.edit(edit=>edit.replace(editor.selection,'  return "he";'));
  assert.equal(api.getState()?.status,'editing');await api.next();assert.equal(api.getState()?.complete,false,'partial code cannot advance');
  await editor.edit(edit=>edit.replace(new vscode.Range(1,0,1,editor.document.lineAt(1).text.length),plan.steps[0].after));
  assert.equal(api.getState()?.status,'matched');
  await editor.edit(edit=>edit.insert(new vscode.Position(0,0),'// unrelated\n'));
  assert.equal(api.getState()?.status,'outside');await api.next();assert.equal(api.getState()?.complete,false,'outside edits stop acceptance');
  await editor.edit(edit=>edit.delete(new vscode.Range(0,0,1,0)));
  assert.equal(api.getState()?.status,'matched');await api.next();assert.equal(api.getState()?.complete,true);
  await editor.edit(edit=>edit.replace(new vscode.Range(1,0,1,editor.document.lineAt(1).text.length),'  return "hi";'));
  assert.equal(api.getState()?.complete,false,'editing or undo after completion invalidates the claim');
  assert.equal(await readFile(file,'utf8'),original,'extension does not save user edits');
  await api.stop();assert.equal(api.getState(),null);
  await testMultipleFiles(api,root);
  await testAsyncSessionChanges(api,root);
  console.log('HOST TEST PASSED: guide, native typing, mismatch, prior-file divergence, completion invalidation, stale async operations, persisted MCP status, no source writes');
}
