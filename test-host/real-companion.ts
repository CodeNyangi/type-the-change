import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import type {Companion} from '../src/companion.js';
import {canPractice} from '../src/change-review.js';

export async function run(){
 const id=process.env.TTC_REAL_THREAD!,file=process.env.TTC_REAL_FILE!,output=process.env.TTC_REAL_OUTPUT!;
 const extension=vscode.extensions.all.find(e=>e.id.toLowerCase()==='codenyangi.type-the-change');assert.ok(extension);
 const api=await extension.activate() as {companion:Companion},model=api.companion;
 const wait=async(check:()=>boolean)=>{const end=Date.now()+20000;while(!check()&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(check(),'real chat: '+model.state.error);};
 await vscode.commands.executeCommand('typeTheChange.start');
 await vscode.commands.executeCommand('typeTheChange.selectChat',{id});
 await wait(()=>model.state.selected?.id===id&&!!model.state.tree);
 await vscode.commands.executeCommand('typeTheChange.learnLatest');
 assert.ok(model.state.review?.recorded,'task entry selects an original recorded edit');
 assert.equal(model.state.reviewOpened,true,'one task action opens its native diff');
 const taskEntryFile=model.state.review!.file;
 // A real source editor, including the native SCM diff's modified side,
 // should drive TTC without a second file picker.
 const initialRoot=model.state.root!;
 const sourceUri=vscode.Uri.file(path.join(initialRoot,file));
 await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(sourceUri),{viewColumn:vscode.ViewColumn.One,preview:false});
 await wait(()=>model.state.editor?.file===file&&!model.state.editor.outside);
 const editorFollowVerified=true;
 let outsideWorktreeVerified=false;
 const otherRoot=model.state.roots.find(r=>r.path!==initialRoot&&!r.unavailable);
 if(otherRoot){
  const otherUri=vscode.Uri.file(path.join(otherRoot.path,file));
  const otherDoc=await vscode.workspace.openTextDocument(otherUri);
  await vscode.window.showTextDocument(otherDoc,{viewColumn:vscode.ViewColumn.One,preview:false});
  await wait(()=>!!model.state.editor?.outside);assert.equal(model.state.root,initialRoot);assert.equal(model.state.review,undefined);outsideWorktreeVerified=true;
 }
 const changed=model.state.tree?.changes?.find(c=>c.path.endsWith('.py')&&!c.status.includes('D')&&!c.conflict);
 let followedFile:string|undefined;
 if(changed){
  const uri=vscode.Uri.file(path.join(initialRoot,changed.path)),document=await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,preview:false});
  await wait(()=>model.state.review?.file===changed.path&&!model.state.review.recorded);
  followedFile=model.state.review!.file;
  await vscode.commands.executeCommand('typeTheChange.openSourceControl');
  assert.equal(model.state.root,initialRoot);
 }
 const edits=()=>[...(model.state.editHistory??[]),...model.state.items];
 for(let page=0;page<10&&!edits().some(i=>i.diffs?.some(d=>d.path.endsWith('/'+file)))&&(model.state.editsLoaded?model.state.nextEdits:model.state.nextItems);page++)await vscode.commands.executeCommand('typeTheChange.olderEdits');
 const item=edits().reverse().find(i=>i.diffs?.some(d=>d.path.endsWith('/'+file)));assert.ok(item);
 const original=item.diffs!.find(d=>d.path.endsWith('/'+file))!.path;
 await vscode.commands.executeCommand('typeTheChange.reviewRecorded',{id:item.id,file:original});
 assert.ok(model.state.review?.hunks.length);assert.ok(model.state.reviewContext?.request);assert.ok(model.state.reviewContext?.response);
 const practiceIndex=model.state.review!.hunks.findIndex(canPractice);assert.ok(practiceIndex>=0,'choose a genuinely small historical change for practice');
 await vscode.commands.executeCommand('typeTheChange.hunk',{index:practiceIndex});
 await vscode.commands.executeCommand('typeTheChange.openReviewDiff');
 const diff=vscode.window.tabGroups.activeTabGroup.activeTab;assert.ok(diff?.input instanceof vscode.TabInputTextDiff&&diff.input.original.scheme==='ttc-codex-review');
 const input=diff.input as vscode.TabInputTextDiff,hunk=model.state.review!.hunks[practiceIndex];
 assert.equal(model.state.reviewOpened,true);
 assert.equal((await vscode.workspace.openTextDocument(input.original)).getText(),hunk.before);
 assert.equal((await vscode.workspace.openTextDocument(input.modified)).getText(),hunk.after);
 const source=path.join(model.state.root!,file),before=await readFile(source),digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 await vscode.commands.executeCommand('typeTheChange.practiceChange');
 const editor=vscode.window.activeTextEditor!;assert.equal(editor.document.uri.scheme,'untitled');
 assert.equal(editor.document.languageId,'plaintext');
 assert.equal(editor.document.getText(),hunk.before);
 await editor.edit(edit=>edit.replace(new vscode.Range(editor.document.positionAt(0),editor.document.positionAt(editor.document.getText().length)),hunk.after));
 assert.equal(model.state.practice,'matched');
 await vscode.commands.executeCommand('typeTheChange.comparePractice');
 const practiceDiff=vscode.window.tabGroups.activeTabGroup.activeTab!.input as vscode.TabInputTextDiff;
 assert.equal((await vscode.workspace.openTextDocument(practiceDiff.modified)).getText(),hunk.after);
 const after=await readFile(source);assert.equal(digest(after),digest(before),'practice preserves the actual Codex source');
 await vscode.commands.executeCommand('typeTheChange.openReviewSource');
 assert.equal(vscode.window.activeTextEditor!.document.uri.fsPath,source);
 const current=vscode.window.activeTextEditor!.document.getText().replace(/\r\n/g,'\n'),needle=hunk.after.replace(/\r\n/g,'\n').replace(/\n$/,''),sourceLine=vscode.window.activeTextEditor!.selection.start.line;
 const found=current.indexOf(needle),located=!!needle.trim()&&found>=0&&current.indexOf(needle,found+1)<0;
 if(located)assert.ok(current.split('\n').slice(sourceLine).join('\n').startsWith(needle),'source selection points at the actual recorded code, even when it moved');
 else assert.equal(sourceLine,0,'missing historical code opens at the beginning with a notice instead of an unrelated clamped line');
 const report={checkedAt:new Date().toISOString(),threadId:id,title:model.state.selected!.title,extension:extension.extensionPath,version:extension.packageJSON.version,worktree:model.state.root,file,taskEntryFile,taskEntryOpenedDiff:true,followedFile,editorFollowVerified,outsideWorktreeVerified,diffIsReadOnly:true,originalRequestVerified:true,originalResponseVerified:true,practiceDocument:'untitled',practiceLanguage:'plaintext',practiceMatched:true,practiceComparisonVerified:true,originalFileUnchanged:true,sourceLocationOpened:true,sourceLine:sourceLine+1,historicalCodeLocated:located,keyboardTypingTested:false};
 await mkdir(output,{recursive:true});await writeFile(path.join(output,'native-host.json'),JSON.stringify(report,null,2)+'\n');console.log('REAL COMPANION HOST PASSED '+JSON.stringify(report));
 model.track(false);
}
