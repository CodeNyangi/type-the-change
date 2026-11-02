import {runTests} from '@vscode/test-electron';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const [threadId,file]=process.argv.slice(2);if(!threadId||!file)throw Error('Existing thread ID and edited file required');
const directory=await mkdtemp(path.join(tmpdir(),'ttc-real-host-'));
await build({entryPoints:['test-host/real-companion.ts'],outfile:path.join(directory,'test.cjs'),bundle:true,platform:'node',format:'cjs',external:['vscode'],target:'node22'});
try{await runTests({vscodeExecutablePath:'/Applications/Visual Studio Code.app/Contents/MacOS/Code',extensionDevelopmentPath:process.env.TTC_INSTALLED_EXTENSION||process.cwd(),extensionTestsPath:path.join(directory,'test.cjs'),launchArgs:[directory,'--user-data-dir',path.join(directory,'profile'),'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes'],extensionTestsEnv:{TTC_REAL_THREAD:threadId,TTC_REAL_FILE:file,TTC_REAL_OUTPUT:path.resolve('artifacts/real-companion')}});}
finally{await rm(directory,{recursive:true,force:true});}
