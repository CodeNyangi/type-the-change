import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('A committed source revision is required for stable documentation links.');
// Freeze README images and video links to the exact packaged source revision.
execFileSync(process.execPath,[path.resolve('node_modules/@vscode/vsce/vsce'),'package','--no-dependencies','--githubBranch',revision,'--out',`artifacts/type-the-change-${manifest.version}.vsix`],{stdio:'inherit'});
