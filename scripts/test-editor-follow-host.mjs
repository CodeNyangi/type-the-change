import {runTests} from '@vscode/test-electron';
import {build} from 'esbuild';
import {mkdtemp,rm,writeFile,mkdir,realpath,access,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const directory=await realpath(await mkdtemp(path.join(tmpdir(),'ttc-editor-host-'))),root=path.join(directory,'repo');await mkdir(root);
const git=(...args)=>execFileSync('git',args,{cwd:root});
git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.test');git('config','core.hooksPath',path.join(directory,'none'));git('config','commit.gpgSign','false');
await writeFile(path.join(root,'example.ts'),'const value = 1;\n');git('add','.');git('commit','-qm','base');
await writeFile(path.join(root,'example.ts'),'const value = 2;\n');git('add','.');await writeFile(path.join(root,'example.ts'),'const value = 3;\n');
await build({entryPoints:['test-host/editor-follow.ts'],outfile:path.join(directory,'test.cjs'),bundle:true,platform:'node',format:'cjs',external:['vscode'],target:'node22'});
const requested=process.env.TTC_VSCODE_VERSION==='minimum'?JSON.parse(await readFile('package.json','utf8')).engines.vscode.slice(1):process.env.TTC_VSCODE_VERSION;
const local='/Applications/Visual Studio Code.app/Contents/MacOS/Code';let executable;if(!requested)try{await access(local);executable=local;}catch{}
try{await runTests({...(executable?{vscodeExecutablePath:executable}:{version:requested||'1.142.0'}),extensionDevelopmentPath:process.env.TTC_INSTALLED_EXTENSION||process.cwd(),extensionTestsPath:path.join(directory,'test.cjs'),launchArgs:[root,'--user-data-dir',path.join(directory,'profile'),'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes'],extensionTestsEnv:{TTC_FIXTURE_ROOT:root,TTC_FIXTURE_REPORT:path.resolve('artifacts/real-companion/editor-follow.json')}});}
finally{await rm(directory,{recursive:true,force:true});}
