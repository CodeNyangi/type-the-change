import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {Companion} from '../src/companion.js';
export async function run(){
 const extension=vscode.extensions.all.find(e=>e.id.toLowerCase()==='codenyangi.type-the-change')!;
 const model=(await extension.activate() as {companion:Companion}).companion;
 const root=process.env.TTC_FIXTURE_ROOT!,file='example.ts',uri=vscode.Uri.file(path.join(root,file));
 const gitExtension=await vscode.extensions.getExtension('vscode.git')!.activate();
 const api=gitExtension.getAPI(1);
 const wait=async(check:()=>boolean)=>{const until=Date.now()+20000;while(!check()&&Date.now()<until)await new Promise(r=>setTimeout(r,50));assert.ok(check());};
 await wait(()=>!!api.getRepository(uri));
 model.state={threads:[],selected:{id:'fixture',title:'SCM fixture',cwd:root,updatedAt:0,runtime:'notLoaded',flags:[]},items:[],mode:'history',loading:false,roots:[{path:root,current:true,head:'',branch:'main'}],root,tree:{path:root,current:true,head:'',branch:'main',changes:[{path:file,status:'MM',conflict:false}]},hunk:0};
 const head=api.toGitUri(uri,'HEAD'),index=api.toGitUri(uri,'').with({path:uri.path+'.git'});
 await vscode.commands.executeCommand('vscode.diff',head,index,'Staged fixture',{preview:false});
 await wait(()=>model.state.review?.editorDiff===true&&model.state.review.after==='const value = 2;\n');
 assert.equal(model.state.review!.before,'const value = 1;\n');assert.equal(model.state.reviewOpened,true);
 await vscode.commands.executeCommand('vscode.diff',index,uri,'Working fixture',{preview:false});
 await wait(()=>model.state.review?.after==='const value = 3;\n');
 assert.equal(model.state.review!.before,'const value = 2;\n');
 assert.equal(await readFile(uri.fsPath,'utf8'),'const value = 3;\n');
 const document=await vscode.workspace.openTextDocument(uri);
 const editor=await vscode.window.showTextDocument(document,{preview:false});
 await wait(()=>model.state.review?.editorDiff===false);
 assert.equal(model.state.review!.before,'const value = 1;\n');
 // Only this disposable fixture receives an unsaved test edit.
 await editor.edit(edit=>edit.replace(new vscode.Range(0,0,1,0),'const value = 4;\n'));
 model.followAgain();await vscode.commands.executeCommand('typeTheChange.followEditor');
 await wait(()=>model.state.review?.after==='const value = 4;\n');
 assert.equal(model.state.review!.dirty,true);assert.equal(await readFile(uri.fsPath,'utf8'),'const value = 3;\n');
 const report=process.env.TTC_FIXTURE_REPORT!;await mkdir(path.dirname(report),{recursive:true});
 await writeFile(report,JSON.stringify({checkedAt:new Date().toISOString(),syntheticFixture:true,nativeScmStaged:true,nativeScmUnstaged:true,plainEditor:true,unsavedBuffer:true,sourcePreserved:true},null,2)+'\n');
 console.log('NATIVE EDITOR FOLLOW PASSED');model.dispose();
}
