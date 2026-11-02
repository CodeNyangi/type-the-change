import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {checkMetadata,checkedRelease,sha256} from './release.mjs';
import {readArchive,inspectArchive} from './release-archive.mjs';
const {manifest,config}=checkMetadata();
const marketplace=process.argv.includes('--marketplace');
const release=marketplace?checkedRelease():undefined;
const extra=[];
if(marketplace){
  // Keep release instructions and data handling self-contained: a Marketplace
  // upload must not depend on publishing a separate Git branch first.
  const read=file=>readFileSync(file,'utf8');
  const overview=(file,language)=>read(file)
    .replace(/^(?:Maintainers:|개발·유지보수:).*\n?/gm,'')
    .replace('[한국어](README.ko.md)','[한국어](#korean)')
    .replace('[English](README.md)','[English](#type-the-change)')
    .replace(/^.*\]\(docs\/guide.*$/m,language==='ko'
      ? '[사용법](#korean-guide) · [개인정보](#privacy-and-local-data) · [검증](#verification) · [MIT](LICENSE)'
      : '[Guide](#guide) · [Privacy](#privacy-and-local-data) · [Verification](#verification) · [MIT](LICENSE)');
  const section=(file,title)=>'## '+title+'\n\n'+read(file).replace(/^# .+\n+/,'').replace(/^## /gm,'### ').replaceAll('(../PRIVACY.md)','(#privacy-and-local-data)').replaceAll('(../assets/','(assets/').replace('[0.7.0 verification](verification-0.7.0.md)','the 0.7.0 verification record');
  const content=[overview('README.md','en'),'## Korean\n\n'+overview('README.ko.md','ko').replace(/^# .+\n+/,''),section('docs/guide.md','Guide'),section('docs/guide.ko.md','Korean guide'),section('PRIVACY.md','Privacy and local data'),section(`docs/verification-${manifest.version}.md`,'Verification')].join('\n');
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/marketplace-README.md',content);
  writeFileSync('artifacts/marketplace.vscodeignore',read('.vscodeignore').replace(/^!README\.md\r?\n/m,''));
  extra.push('--readme-path','artifacts/marketplace-README.md','--ignoreFile','artifacts/marketplace.vscodeignore');
}
// The current source can be local-only; remaining static links use an already
// published revision. Current guides/privacy/verification are included above.
const artifact=`type-the-change-${manifest.version}${marketplace?'-marketplace':''}.vsix`;
execFileSync(process.execPath,[path.resolve('node_modules/@vscode/vsce/vsce'),'package','--no-dependencies','--githubBranch',config.mediaRevision,...extra,'--out',`artifacts/${artifact}`],{stdio:'inherit'});
if(marketplace){
 checkedRelease(); // Packaging must not change source or tested build bytes.
 const inspected=inspectArchive(await readArchive(`artifacts/${artifact}`),process.cwd(),manifest),bytes=readFileSync(`artifacts/${artifact}`);
 const receipt={version:manifest.version,publisher:manifest.publisher,name:manifest.name,source:release.source,mediaRevision:config.mediaRevision,artifact,bytes:bytes.length,sha256:sha256(bytes),bundles:release.evidence.bundles,checks:{commands:release.evidence.commands,checkedAt:release.evidence.checkedAt,...inspected}};
 writeFileSync(`artifacts/type-the-change-${manifest.version}-marketplace.release.json`,JSON.stringify(receipt,null,2)+'\n');
 console.log(`Verified release package: ${receipt.sha256}`);
}
