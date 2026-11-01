import {runTests} from '@vscode/test-electron';
import {build} from 'esbuild';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const workspace=await mkdtemp(path.join(tmpdir(),'ttc-host-test-'));
const profile=await mkdtemp(path.join(tmpdir(),'ttc-host-profile-'));
await build({entryPoints:['test-host/index.ts'],outfile:'dist/test-host.cjs',bundle:true,platform:'node',format:'cjs',external:['vscode'],target:'node22'});
const local='/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const requestedVersion=process.env.TTC_VSCODE_VERSION;
let vscodeExecutablePath;if(!requestedVersion)try{await access(local);vscodeExecutablePath=local;}catch{}
try{await runTests({...(vscodeExecutablePath?{vscodeExecutablePath}:{version:requestedVersion||'1.142.0'}),extensionDevelopmentPath:process.cwd(),extensionTestsPath:path.resolve('dist/test-host.cjs'),launchArgs:[workspace,'--user-data-dir',profile,'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes'],extensionTestsEnv:{TTC_HOST_TEST_ROOT:workspace}});}
finally{await rm(workspace,{recursive:true,force:true});await rm(profile,{recursive:true,force:true});}
