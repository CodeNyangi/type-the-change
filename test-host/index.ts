import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import type {Plan} from '../src/plan.js';

interface SessionState {file:string;index:number;complete:boolean;status:string;judgment:{phase:string};replan:boolean;check?:{status:string;exitCode?:number}}
interface ExtensionApi {
  startPlan(plan:Plan,root:string):Promise<void>;
  next():Promise<void>;
  predict(value:string):Promise<void>;
  decide(value:{decision:string;evidence:string}):Promise<void>;
  stop():Promise<void>;
  getState():SessionState|null;
}

async function compare(api:ExtensionApi){
  if(api.getState()?.judgment.phase==='predict')await api.predict('The changed branch returns the expected test value.');
  await api.next();
}
async function acceptMatched(api:ExtensionApi){
  await compare(api);
  if(api.getState()?.status==='matched'&&!api.getState()?.complete)await api.decide({decision:'keep',evidence:'Host-test fixture: inspected the exact expected buffer.'});
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
  await replaceDocument(first,firstAfter);await acceptMatched(api);
  assert.equal(api.getState()?.index,1,'the accepted first step advances to the second file');
  await replaceDocument(second,secondAfter);
  assert.equal(api.getState()?.status,'matched');

  // Undo an already accepted edit while the last file itself still matches.
  await replaceDocument(first,firstBefore);
  assert.equal(api.getState()?.status,'outside','a prior file is still part of the comparison');
  await acceptMatched(api);assert.equal(api.getState()?.complete,false,'a matching current file cannot hide a reverted earlier edit');
  assert.equal(api.getState()?.index,1);
  await waitForStatus(root,'outside');
  await replaceDocument(first,firstAfter);
  assert.equal(api.getState()?.status,'matched');await acceptMatched(api);
  assert.equal(api.getState()?.complete,true);await waitForStatus(root,'complete');

  // A completed session must also notice a later change in a different file.
  await replaceDocument(first,'// changed after review\n'+firstAfter);
  assert.equal(api.getState()?.complete,false,'completion is not an immutable claim about later file content');
  assert.equal(api.getState()?.status,'outside');await waitForStatus(root,'outside');
  await replaceDocument(first,firstAfter);await acceptMatched(api);
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
  await api.predict('The first value becomes 2.');
  const pendingNext=api.next();
  await api.stop();await pendingNext;
  assert.equal(api.getState(),null,'a pending next-file read cannot recreate a stopped session');
  assert.equal(first.getText(),firstAfter,'stopping retains the human edit');
  assert.equal(await readFile(firstFile,'utf8'),firstBefore,'stopping does not save or revert the human edit');
  assert.equal(await readFile(secondFile,'utf8'),secondBefore,'the pending step never edits its target');

  // A failed replacement plan leaves the current guide intact.
  await replaceDocument(first,firstBefore);
  await api.startPlan(plan,root);
  await assert.rejects(api.startPlan({...replacement,steps:[{...plan.steps[1],before:'missing anchor'}]},root));
  assert.equal(api.getState()?.file,'race-first.ts','a rejected replacement plan preserves the current session');

  // Future-file changes are part of the consistency check before their turn.
  const second=await vscode.workspace.openTextDocument(vscode.Uri.file(secondFile));
  await replaceDocument(second,secondAfter);
  await replaceDocument(first,firstAfter);
  assert.equal(api.getState()?.status,'outside','editing a future file pauses acceptance of the current step');
  await acceptMatched(api);assert.equal(api.getState()?.index,0);
  await replaceDocument(second,secondBefore);

  // A target disappearing between preflight and Next cannot discard the valid guide.
  await unlink(secondFile);
  await assert.rejects(api.next());
  assert.equal(api.getState()?.file,'race-first.ts');
  assert.equal(api.getState()?.status,'matched');
  await writeFile(secondFile,secondBefore);

  // A double click must not skip over the next typing step.
  await compare(api);
  await Promise.all([api.decide({decision:'keep',evidence:'Concurrent decision fixture.'}),api.decide({decision:'keep',evidence:'Concurrent decision fixture.'})]);
  assert.equal(api.getState()?.index,1,'concurrent decisions advance only once');
  assert.equal(api.getState()?.status,'untouched');
  assert.equal(api.getState()?.complete,false);
  await api.stop();

  const pendingDemo=vscode.commands.executeCommand('typeTheChange.demo');
  await vscode.commands.executeCommand('typeTheChange.stop');
  await pendingDemo;
  assert.equal(api.getState(),null,'End Session cancels a demo that is still preparing its temporary files');
}

async function testHiddenPriorFileChanges(api:ExtensionApi,root:string){
  const firstFile=path.join(root,'hidden-first.ts'),secondFile=path.join(root,'hidden-second.ts');
  const firstBefore='export const first = 1;\n',firstAfter='export const first = 2;\n';
  const secondBefore='export const second = 10;\n',secondAfter='export const second = 20;\n';
  await writeFile(firstFile,firstBefore);await writeFile(secondFile,secondBefore);
  await api.startPlan({version:1,title:'Hidden file changes',intent:'Keep every reviewed file consistent.',steps:[
    {file:'hidden-first.ts',before:firstBefore,after:firstAfter,reason:'Update the first value.'},
    {file:'hidden-second.ts',before:secondBefore,after:secondAfter,reason:'Update the second value.'},
  ]},root);
  const first=await vscode.workspace.openTextDocument(vscode.Uri.file(firstFile));
  await replaceDocument(first,firstAfter);await first.save();await acceptMatched(api);
  const firstTab=vscode.window.tabGroups.all.flatMap(group=>group.tabs).find(tab=>tab.input instanceof vscode.TabInputText&&tab.input.uri.fsPath===firstFile);
  assert.ok(firstTab,'the accepted source has a tab to close');
  await vscode.window.tabGroups.close(firstTab,true);
  await writeFile(firstFile,firstBefore);
  const reopened=await vscode.workspace.openTextDocument(vscode.Uri.file(firstFile));
  const deadline=Date.now()+5000;
  while(reopened.getText()!==firstBefore&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(reopened.getText(),firstBefore,'the hidden document receives the external disk change');
  const second=await vscode.workspace.openTextDocument(vscode.Uri.file(secondFile));
  await replaceDocument(second,secondAfter);
  assert.equal(api.getState()?.status,'outside','a hidden prior file cannot be ignored when accepting the final step');
  await acceptMatched(api);assert.equal(api.getState()?.complete,false);
  await replaceDocument(reopened,firstAfter);await acceptMatched(api);
  assert.equal(api.getState()?.complete,true,'restoring the hidden file permits review again');
  assert.equal(await readFile(firstFile,'utf8'),firstBefore,'review does not save the restored buffer');
  assert.equal(await readFile(secondFile,'utf8'),secondBefore,'review does not save the second buffer');
  await api.stop();
}

async function testNewRequestFromCommandPalette(api:ExtensionApi,root:string){
  const file=path.join(root,'new-request.ts'),original='export const value = 1;\n',replacement='export const value = 2;\n';
  const plan:Plan={version:1,title:'A new value',intent:'Update the value.',steps:[
    {file:'new-request.ts',before:original,after:replacement,reason:'Use the new value.'},
  ]};
  await writeFile(file,original);await api.startPlan(plan,root);
  const document=await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  const partial='export const value = ';await replaceDocument(document,partial);
  await vscode.commands.executeCommand('typeTheChange.start');
  assert.equal(api.getState()?.file,'new-request.ts','Start resumes the active guide');
  await vscode.commands.executeCommand('typeTheChange.generate');
  assert.equal(api.getState(),null,'Plan a Change opens the composer instead of keeping an active guide');
  assert.equal(document.getText(),partial,'opening a new request preserves partial human edits');
  assert.equal(await readFile(file,'utf8'),original,'opening a new request does not save partial edits');

  await replaceDocument(document,original);await api.startPlan(plan,root);
  await replaceDocument(document,replacement);await acceptMatched(api);
  assert.equal(api.getState()?.complete,true);
  await vscode.commands.executeCommand('typeTheChange.start');
  assert.equal(api.getState()?.complete,true,'Start also resumes a completed guide for review');
  await vscode.commands.executeCommand('typeTheChange.generate');
  assert.equal(api.getState(),null,'Plan a Change opens the composer from a completed guide');
  assert.equal(document.getText(),replacement,'opening a new request preserves completed human edits');
  assert.equal(await readFile(file,'utf8'),original,'opening a new request does not save completed edits');
}

async function typeCharacters(text:string){
  for(const character of text)await vscode.commands.executeCommand('type',{text:character});
}

function guideTabs(){
  // Some VS Code versions expose the main-thread prefix in TabInputWebview.
  const types=new Set(['typeTheChange.guide','mainThreadWebview-typeTheChange.guide']);
  return vscode.window.tabGroups.all.flatMap(group=>group.tabs).filter(tab=>tab.input instanceof vscode.TabInputWebview&&types.has(tab.input.viewType));
}

async function assertGuideBesideSource(file:string,sourceFocused=false){
  const deadline=Date.now()+5000;
  const layout=()=>({source:vscode.window.visibleTextEditors.find(editor=>editor.document.uri.fsPath===file),guide:guideTabs().find(tab=>tab.isActive),focused:vscode.window.activeTextEditor});
  let current=layout();
  // Layout and active-editor notifications arrive on separate RPC paths.
  // Require both to settle within the same bound before asserting either.
  while((current.source?.viewColumn!==vscode.ViewColumn.One||current.guide?.group.viewColumn!==vscode.ViewColumn.Two||(sourceFocused&&current.focused?.document.uri.fsPath!==file))&&Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,25));current=layout();
  }
  assert.equal(current.source?.viewColumn,vscode.ViewColumn.One,'the native source remains visible in the first editor group');
  assert.equal(current.guide?.group.viewColumn,vscode.ViewColumn.Two,'the guide is the visible tab in a separate second editor group');
  if(sourceFocused)assert.equal(current.focused?.document.uri.fsPath,file,'revealing the guide preserves native typing focus');
}

async function startFixture(api:ExtensionApi,root:string,file:string,original:string,steps:Plan['steps']){
  await writeFile(path.join(root,file),original);
  await api.startPlan({version:1,title:'Native typing',intent:'Change the selected source by typing.',steps},root);
  await assertGuideBesideSource(path.join(root,file));
  await api.predict('The changed branch returns the expected value for this input.');
  const editor=vscode.window.activeTextEditor;
  assert.ok(editor,'starting guidance focuses a native editor');
  assert.equal(editor.document.uri.fsPath,path.join(root,file));
  assert.equal(editor.document.getText(),original,'opening guidance never types on behalf of the person');
  await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
  return editor;
}

async function nativeTypingAvailable(root:string){
  const probeFile=path.join(root,'native-focus-probe.txt');
  await writeFile(probeFile,'');
  const probe=await vscode.workspace.openTextDocument(vscode.Uri.file(probeFile));
  await vscode.window.showTextDocument(probe,{viewColumn:vscode.ViewColumn.One,preserveFocus:false,preview:false});
  await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
  let changed=false;
  const subscription=vscode.workspace.onDidChangeTextDocument(event=>{if(event.document.uri.toString()===probe.uri.toString())changed=true;});
  try{
    await vscode.commands.executeCommand('type',{text:'x'});
    // The native command and TextDocument change arrive on different RPC paths.
    const deadline=Date.now()+500;
    while(!changed&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  }finally{subscription.dispose();}
  if(probe.getText()==='x')return true;
  const explanation=`native keyboard cases: VS Code did not accept the type command (windowFocused=${vscode.window.state.focused}). Unlock and focus the host window to exercise automatic pairs, indentation, CRLF typing, sequential typing, and deleteLeft.`;
  if(process.platform!=='darwin'||process.env.TTC_REQUIRE_NATIVE_TYPING==='1')assert.fail(explanation);
  console.log(`HOST TEST SKIP: ${explanation}`);
  return false;
}

async function testNativeTyping(api:ExtensionApi,root:string){
  const config=vscode.workspace.getConfiguration('editor');
  // Keep native language-defined bracket/quote closing and indentation enabled.
  // Fix only indentation width and asynchronous completion UI in this isolated workspace.
  const settings:Record<string,unknown>={tabSize:2,insertSpaces:true,detectIndentation:false,formatOnType:false,quickSuggestions:false,suggestOnTriggerCharacters:false,acceptSuggestionOnCommitCharacter:false};
  const previous=new Map(Object.keys(settings).map(key=>[key,config.inspect(key)?.workspaceValue]));
  try{
    for(const [key,value]of Object.entries(settings))await config.update(key,value,vscode.ConfigurationTarget.Workspace);

    const original='export function greet() {\n  return "hi";\n}\n';
    const editor=await startFixture(api,root,'native-pairs.ts',original,[{file:'native-pairs.ts',before:'"hi"',after:'buildGreeting("Ada")',reason:'Call the greeting builder.'}]);
    await typeCharacters('buildGreeting(');
    assert.equal(editor.document.lineAt(1).text,'  return buildGreeting();','native typing inserts a closing parenthesis');
    await typeCharacters('"');
    assert.equal(editor.document.lineAt(1).text,'  return buildGreeting("");','native typing inserts a closing quote');
    await typeCharacters('Ada")');
    assert.equal(editor.document.lineAt(1).text,'  return buildGreeting("Ada");','typing closing delimiters steps over auto-inserted characters');
    assert.equal(api.getState()?.status,'matched','native automatic pairs count as exact code');
    assert.equal(api.getState()?.complete,false,'matching alone is never a judgment');
    await vscode.commands.executeCommand('typeTheChange.next');
    assert.equal(api.getState()?.complete,false,'the keyboard command only opens comparison');
    assert.equal(api.getState()?.judgment.phase,'review');
    await api.decide({decision:'keep',evidence:'Checked the native buffer: buildGreeting receives Ada.'});assert.equal(api.getState()?.complete,true);
    assert.equal(await readFile(path.join(root,'native-pairs.ts'),'utf8'),original);
    await api.stop();

    const indentedOriginal='export function value(ready: boolean) {\n  return 0;\n}\n';
    const indented=await startFixture(api,root,'native-indent.ts',indentedOriginal,[{file:'native-indent.ts',before:'return 0;',after:'if (ready) {\n    return 1;\n  }\n  return 0;',reason:'Return early when ready.'}]);
    await typeCharacters('if (ready) {');
    assert.equal(indented.document.lineAt(1).text,'  if (ready) {}','native brace completion stays inside the guided replacement');
    await typeCharacters('\n');
    assert.equal(indented.document.lineAt(2).text,'    ','Enter supplies the block indentation');
    assert.equal(indented.document.lineAt(3).text,'  }','Enter keeps the automatically inserted closing brace on its own line');
    await typeCharacters('return 1;');
    await vscode.commands.executeCommand('cursorDown');await vscode.commands.executeCommand('cursorEnd');
    await typeCharacters('\nreturn 0;');
    assert.equal(api.getState()?.status,'matched','ordinary Enter and cursor movement reproduce a multiline target without manually duplicating indentation');
    await acceptMatched(api);assert.equal(api.getState()?.complete,true);await api.stop();

    const windowsOriginal='export function windowsValue() {\r\n  return 1;\r\n}\r\n';
    const windows=await startFixture(api,root,'native-crlf.ts',windowsOriginal,[{file:'native-crlf.ts',before:'return 1;',after:'const value = 2;\n  return value;',reason:'Name the returned value.'}]);
    assert.equal(windows.document.eol,vscode.EndOfLine.CRLF);
    await typeCharacters('const value = 2;\nreturn value;');
    assert.equal(api.getState()?.status,'matched','LF plan snippets match native Enter in a CRLF document');
    assert.equal(windows.document.getText(),'export function windowsValue() {\r\n  const value = 2;\r\n  return value;\r\n}\r\n');
    await acceptMatched(api);assert.equal(api.getState()?.complete,true);await api.stop();

    const sequenceOriginal='export function total(price: number) {\n  return price;\n}\n';
    const sequence=await startFixture(api,root,'native-sequence.ts',sequenceOriginal,[
      {file:'native-sequence.ts',before:'return price;',after:'const amount = price;\n  return amount;',reason:'Name the amount before returning it.'},
      {file:'native-sequence.ts',before:'return amount;',after:'return Math.max(0, amount);',reason:'Prevent a negative result.'},
    ]);
    await typeCharacters('const amount = price;\nreturn amount;');
    assert.equal(api.getState()?.status,'matched');await acceptMatched(api);
    assert.equal(api.getState()?.index,1,'the next step resolves against the newly typed buffer');
    assert.equal(sequence.document.getText(vscode.window.visibleTextEditors.find(editor=>editor.document.uri.toString()===sequence.document.uri.toString())!.selection),'return amount;','the second same-file replacement is selected without a mouse');
    await api.predict('Negative amounts become zero; positive amounts remain unchanged.');
    await typeCharacters('return Math.max(0, amount);');
    assert.equal(api.getState()?.status,'matched');await acceptMatched(api);assert.equal(api.getState()?.complete,true);
    assert.equal(await readFile(path.join(root,'native-sequence.ts'),'utf8'),sequenceOriginal);await api.stop();
  }finally{
    await api.stop();
    for(const [key,value]of previous)await config.update(key,value,vscode.ConfigurationTarget.Workspace);
  }
}

async function testDeletionAndPanel(api:ExtensionApi,root:string,nativeTyping:boolean){
  await vscode.window.tabGroups.close(guideTabs(),true);
  const original='export function quiet() {\n  console.log("debug");\n  return 1;\n}\n';
  const editor=await startFixture(api,root,'native-delete.ts',original,[{file:'native-delete.ts',before:'  console.log("debug");\n',after:'',reason:'Remove the debug output.'}]);
  const webviewTypes=vscode.window.tabGroups.all.flatMap(group=>group.tabs).flatMap(tab=>tab.input instanceof vscode.TabInputWebview?[tab.input.viewType]:[]);
  assert.equal(guideTabs().length,1,`the guide opens beside the source; webview tab types: ${JSON.stringify(webviewTypes)}`);
  console.log(`HOST TEST: guide tab identified as ${JSON.stringify(webviewTypes)}`);
  assert.equal(editor.document.getText(editor.selection),'  console.log("debug");\n');
  await vscode.window.tabGroups.close(guideTabs(),true);
  assert.equal(guideTabs().length,0,'closing the guide disposes its tab');
  assert.equal(api.getState()?.status,'untouched','closing the guide keeps the typing session');
  await vscode.commands.executeCommand('typeTheChange.start');
  assert.equal(guideTabs().length,1,'Start reopens the existing session guide');
  await assertGuideBesideSource(editor.document.uri.fsPath);
  assert.equal(editor.document.getText(),original,'closing and reopening never changes source');
  await vscode.commands.executeCommand('typeTheChange.focus');
  assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath,editor.document.uri.fsPath,'the focus command returns to native source');
  assert.equal(editor.document.getText(editor.selection),'  console.log("debug");\n','focus reselects an untouched target so native Backspace deletes only the guided range');
  if(nativeTyping)await vscode.commands.executeCommand('deleteLeft');
  else assert.equal(await editor.edit(edit=>edit.delete(editor.selection)),true,'editor-edit fallback verifies deletion matching without claiming native keyboard coverage');
  assert.equal(editor.document.getText(),'export function quiet() {\n  return 1;\n}\n');
  assert.equal(api.getState()?.status,'matched','deletion can complete an empty replacement');
  await acceptMatched(api);assert.equal(api.getState()?.complete,true);
  await vscode.commands.executeCommand('typeTheChange.review');
  const diff=vscode.window.tabGroups.all.flatMap(group=>group.tabs).find(tab=>tab.input instanceof vscode.TabInputTextDiff&&tab.input.modified.fsPath===editor.document.uri.fsPath);
  assert.ok(diff,'Review opens the native before/current diff');
  assert.ok(diff.input instanceof vscode.TabInputTextDiff);
  assert.equal(diff.input.original.scheme,'type-the-change-before');
  assert.equal((await vscode.workspace.openTextDocument(diff.input.original)).getText(),original,'the review keeps the original full file, not the replacement snippet');
  assert.equal((await vscode.workspace.openTextDocument(diff.input.modified)).getText(),editor.document.getText(),'review shows the unsaved human edits');
  assert.equal(api.getState()?.complete,true,'opening review keeps the completed session');
  await vscode.window.tabGroups.close(diff,true);
  await vscode.commands.executeCommand('typeTheChange.stop');assert.equal(api.getState(),null);
  assert.equal(await readFile(path.join(root,'native-delete.ts'),'utf8'),original,'deleting in the editor still requires the person to save');
}

async function testCommands(extension:vscode.Extension<ExtensionApi>){
  const registered=new Set(await vscode.commands.getCommands(true));
  const contributes=extension.packageJSON.contributes as {commands:{command:string}[];keybindings:{command:string;key:string;mac?:string;when:string}[]};
  for(const {command}of contributes.commands)assert.ok(registered.has(command),`${command} is registered and available from the command palette`);
  for(const name of ['review','chooseFiles','chooseModel','usage'])assert.ok(contributes.commands.some(item=>item.command===`typeTheChange.${name}`),`${name} is declared for command-palette access`);
  for(const command of ['typeTheChange.advance','typeTheChange.focus']){
    const shortcut=contributes.keybindings.find(binding=>binding.command===command);
    assert.ok(shortcut,`${command} has a keyboard binding`);
    assert.ok(shortcut.key&&shortcut.mac,`${command} supports both platform keyboard conventions`);
    assert.match(shortcut.when,/typeTheChange\.active/,'session shortcuts do not capture keys globally');
  }
}

async function testIntegratedChecks(api:ExtensionApi,root:string){
  const unrelated=path.join(root,'unrelated.ts');await writeFile(unrelated,'export const untouched = 1;\n');
  const other=await vscode.workspace.openTextDocument(unrelated);await replaceDocument(other,'export const untouched = 2;\n');
  await vscode.commands.executeCommand('typeTheChange.demo');
  const demo=vscode.window.visibleTextEditors.find(editor=>editor.document.fileName.endsWith(path.sep+'price.ts'))!.document;
  await api.predict('The sum is 30 even when a negative occurs before the final price.');
  await replaceDocument(demo,demo.getText().replace('return result;','break;'));
  await vscode.commands.executeCommand('typeTheChange.runCheck');
  assert.equal(api.getState()?.check?.status,'failed','real demo child process reports the wrong branch');
  assert.equal(api.getState()?.check?.exitCode,1);assert.equal(api.getState()?.judgment.phase,'review');assert.equal(api.getState()?.complete,false);
  assert.match(await readFile(demo.uri.fsPath,'utf8'),/break;/,'explicit Save and Check saves the reviewed buffer');
  assert.equal(await readFile(unrelated,'utf8'),'export const untouched = 1;\n','unrelated dirty files are not saved');assert.equal(other.isDirty,true);
  await replaceDocument(demo,demo.getText().replace('break;','continue;'));
  assert.equal(api.getState()?.check?.status,'stale','a subsequent edit invalidates task evidence immediately');
  await vscode.commands.executeCommand('typeTheChange.runCheck');
  assert.equal(api.getState()?.check?.status,'passed');assert.equal(api.getState()?.complete,false,'a zero exit never keeps the proposal');
  await api.decide({decision:'keep',evidence:'The saved continue branch passed the four concrete example inputs.'});
  const journal=JSON.parse(await readFile(path.join(path.dirname(demo.uri.fsPath),'.type-the-change/review.json'),'utf8'));
  assert.equal(journal.records.at(-1).check.exitCode,0);assert.equal(journal.records.at(-1).check.sourceHash,journal.records.at(-1).sourceHash);
  await api.stop();
}

export async function run(){
  const root=process.env.TTC_HOST_TEST_ROOT!;
  const file=path.join(root,'sample.ts'),original='export function greet() {\n  return "hi";\n}\n';
  await writeFile(file,original);
  const extension=vscode.extensions.all.find(e=>e.id.toLowerCase()==='codenyangi.type-the-change');assert.ok(extension,'extension discovered');
  const api=await extension.activate() as ExtensionApi;
  await testCommands(extension as vscode.Extension<ExtensionApi>);
  // Reproduce the real first-run flow: the home webview initially occupies the
  // only group, then importing/starting guidance must leave both views visible.
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('workbench.action.joinAllGroups');
  await vscode.commands.executeCommand('typeTheChange.start');
  assert.equal(guideTabs().length,1,'the home panel opens in an otherwise empty workbench');
  const plan:Plan={version:1,title:'Greet warmly',intent:'Change the greeting',steps:[{file:'sample.ts',before:'  return "hi";',after:'  return "hello";',reason:'Keep the same function and change its return value.'}]};
  await api.startPlan(plan,root);
  await assertGuideBesideSource(file);
  let editor=vscode.window.visibleTextEditors.find(e=>e.document.uri.fsPath===file)!;assert.ok(editor);
  assert.equal(editor.document.getText(),original,'starting never edits source');
  assert.equal(await readFile(file,'utf8'),original,'disk source unchanged');
  assert.equal(editor.document.getText(editor.selection),plan.steps[0].before,'exact change is selected');
  editor=await vscode.window.showTextDocument(editor.document,{viewColumn:vscode.ViewColumn.One,preview:false});
  await editor.edit(edit=>edit.replace(editor.selection,'  return "he";'));
  assert.equal(api.getState()?.status,'editing');await acceptMatched(api);assert.equal(api.getState()?.complete,false,'partial code cannot advance');
  editor=await vscode.window.showTextDocument(editor.document,{viewColumn:vscode.ViewColumn.One,preview:false});
  await editor.edit(edit=>edit.replace(new vscode.Range(1,0,1,editor.document.lineAt(1).text.length),plan.steps[0].after));
  assert.equal(api.getState()?.status,'matched');
  editor=await vscode.window.showTextDocument(editor.document,{viewColumn:vscode.ViewColumn.One,preview:false});
  await editor.edit(edit=>edit.insert(new vscode.Position(0,0),'// unrelated\n'));
  assert.equal(api.getState()?.status,'outside');await acceptMatched(api);assert.equal(api.getState()?.complete,false,'outside edits stop acceptance');
  editor=await vscode.window.showTextDocument(editor.document,{viewColumn:vscode.ViewColumn.One,preview:false});
  await editor.edit(edit=>edit.delete(new vscode.Range(0,0,1,0)));
  assert.equal(api.getState()?.status,'matched');await acceptMatched(api);assert.equal(api.getState()?.complete,true);
  editor=await vscode.window.showTextDocument(editor.document,{viewColumn:vscode.ViewColumn.One,preview:false});
  await editor.edit(edit=>edit.replace(new vscode.Range(1,0,1,editor.document.lineAt(1).text.length),'  return "hi";'));
  assert.equal(api.getState()?.complete,false,'editing or undo after completion invalidates the claim');
  assert.equal(await readFile(file,'utf8'),original,'extension does not save user edits');
  await api.stop();assert.equal(api.getState(),null);
  await testMultipleFiles(api,root);
  await testAsyncSessionChanges(api,root);
  await testHiddenPriorFileChanges(api,root);
  await testNewRequestFromCommandPalette(api,root);
  const nativeTyping=await nativeTypingAvailable(root);
  if(nativeTyping)await testNativeTyping(api,root);
  await testDeletionAndPanel(api,root,nativeTyping);
  await testIntegratedChecks(api,root);
  console.log(`HOST TEST PASSED: real task failure/pass, explicit scoped saving, unrelated dirty-file preservation, stale task results, judgment journal, deletion comparison, panel reopen, review diff, command registration, mismatch, prior-file divergence, stale operations, MCP status. Native keyboard cases: ${nativeTyping?'PASSED':'SKIPPED (see HOST TEST SKIP; editor-edit fallback is not keyboard verification)'}.`);
}
