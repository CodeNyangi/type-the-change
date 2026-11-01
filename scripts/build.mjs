import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
await build({entryPoints:{extension:'src/extension.ts','mcp-server':'src/mcp-server.ts'},outdir:'dist',outExtension:{'.js':'.cjs'},bundle:true,platform:'node',target:'node22',format:'cjs',external:['vscode'],sourcemap:false,logLevel:'info'});
