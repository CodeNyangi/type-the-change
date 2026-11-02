import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('A committed source revision is required for stable documentation links.');
const marketplace=process.argv.includes('--marketplace');
const extra=[];
if(marketplace){
  // Keep release instructions and data handling self-contained: a Marketplace
  // upload must not depend on publishing a separate Git branch first.
  const read=file=>readFileSync(file,'utf8');
  const overview=(file,language)=>read(file)
    .replace('[한국어](README.ko.md)','[한국어](#korean)')
    .replace('[English](README.md)','[English](#type-the-change)')
    .replace(/^.*\]\(docs\/guide.*$/m,language==='ko'
      ? '[사용법](#korean-guide) · [개인정보](#privacy-and-local-data) · [검증](#verification) · [MIT](LICENSE)'
      : '[Guide](#guide) · [Privacy](#privacy-and-local-data) · [Verification](#verification) · [MIT](LICENSE)');
  const section=(file,title)=>'## '+title+'\n\n'+read(file).replace(/^# .+\n+/,'').replace(/^## /gm,'### ').replaceAll('(../PRIVACY.md)','(#privacy-and-local-data)');
  const content=[overview('README.md','en'),'## Korean\n\n'+overview('README.ko.md','ko').replace(/^# .+\n+/,''),section('docs/guide.md','Guide'),section('docs/guide.ko.md','Korean guide'),section('PRIVACY.md','Privacy and local data'),section(`docs/verification-${manifest.version}.md`,'Verification')].join('\n');
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/marketplace-README.md',content);
  writeFileSync('artifacts/marketplace.vscodeignore',read('.vscodeignore').replace(/^!README\.md\r?\n/m,''));
  extra.push('--readme-path','artifacts/marketplace-README.md','--ignoreFile','artifacts/marketplace.vscodeignore');
}
// Freeze the remaining license/contribution links to a known source revision.
execFileSync(process.execPath,[path.resolve('node_modules/@vscode/vsce/vsce'),'package','--no-dependencies','--githubBranch',revision,...extra,'--out',`artifacts/type-the-change-${manifest.version}${marketplace?'-marketplace':''}.vsix`],{stdio:'inherit'});
