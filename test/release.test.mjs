import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkMetadata,checkedRelease,sourceIdentity,bundleHashes,validationCommands,publicationRecord} from '../scripts/release.mjs';
import {inspectArchive} from '../scripts/release-archive.mjs';

function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'ttc-release-')),put=(file,value)=>{mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));};
 const config={publisher:'Example',name:'example',repository:'https://example.test/repo.git',mediaRevision:'a'.repeat(40)};
 const manifest={...config,version:'1.2.3',repository:{url:config.repository},description:'%description%',engines:{vscode:'^1.106.0'}};
 put('package.json',manifest);put('package-lock.json',{version:'1.2.3',packages:{'':{version:'1.2.3',engines:{vscode:'^1.106.0'}}}});put('release.config.json',config);put('package.nls.json',{description:'English'});put('package.nls.ko.json',{description:'한국어'});put('CHANGELOG.md','# Changelog\n\n## 1.2.3\n');put('docs/verification-1.2.3.md','# Verification\n');put('.gitignore','artifacts/\ndist/\n');
 for(const name of ['extension.cjs','mcp-server.cjs','codex-hook.cjs'])put('dist/'+name,name);
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('config','commit.gpgSign','false');git('config','core.hooksPath',path.join(root,'none'));git('remote','add','origin',config.repository);git('add','.');git('commit','-qm','fixture');
 return {root,put,git,manifest,close:()=>rmSync(root,{recursive:true,force:true})};
}

test('release metadata rejects mismatched lock versions and missing localized labels',()=>{
 const f=fixture();try{assert.equal(checkMetadata(f.root).manifest.version,'1.2.3');
  f.put('package-lock.json',{version:'1.2.2',packages:{'':{version:'1.2.3',engines:{vscode:'^1.106.0'}}}});assert.throws(()=>checkMetadata(f.root),/versions differ/);
  f.put('package-lock.json',{version:'1.2.3',packages:{'':{version:'1.2.3',engines:{vscode:'^1.106.0'}}}});f.put('package.nls.ko.json',{});assert.throws(()=>checkMetadata(f.root),/metadata keys differ/);
  f.put('package.nls.ko.json',{description:'한국어'});f.put('releases/1.3.0.json',{});assert.throws(()=>checkMetadata(f.root),/older than a recorded/);
 }finally{f.close();}
});

test('release packaging requires clean source and verification of its exact commit and build',()=>{
 const f=fixture();try{
  const source=sourceIdentity(f.root),evidence={version:'1.2.3',source,commands:validationCommands,bundles:bundleHashes(f.root)};
  f.put('artifacts/release-check-1.2.3.json',evidence);assert.equal(checkedRelease(f.root).source.commit,source.commit);
  f.put('uncommitted.txt','changed');assert.throws(()=>checkedRelease(f.root),/Commit source/);rmSync(path.join(f.root,'uncommitted.txt'));
  f.put('dist/extension.cjs','unverified build');assert.throws(()=>checkedRelease(f.root),/Build outputs changed/);f.put('dist/extension.cjs','extension.cjs');
  f.put('artifacts/release-check-1.2.3.json',{...evidence,source:{...source,commit:'b'.repeat(40)}});assert.throws(()=>checkedRelease(f.root),/different source/);
  f.put('artifacts/release-check-1.2.3.json',evidence);f.git('tag','v1.2.3');assert.throws(()=>checkedRelease(f.root),/release tag/);
  f.put('releases/1.2.3.json',{});f.git('add','.');f.git('commit','-qm','published');assert.throws(()=>checkedRelease(f.root),/already has a published/);
 }finally{f.close();}
});

test('VSIX inspection rejects private evidence, changed bundle bytes and the wrong version',()=>{
 const f=fixture();try{
  const entries=new Map([['extension/LICENSE.txt',Buffer.from('MIT')],['extension/package.json',Buffer.from(JSON.stringify(f.manifest))],['extension/readme.md',Buffer.from('## Korean\n## Guide\n## Privacy and local data\n## Verification')]]);
  for(const name of Object.keys(bundleHashes(f.root)))entries.set('extension/dist/'+name,readFileSync(path.join(f.root,'dist',name)));
  assert.equal(inspectArchive(entries,f.root,f.manifest).bundlesMatch,true);
  entries.set('extension/artifacts/private-chat.json',Buffer.from('private'));assert.throws(()=>inspectArchive(entries,f.root,f.manifest),/Unapproved package file/);entries.delete('extension/artifacts/private-chat.json');
  entries.set('extension/dist/extension.cjs',Buffer.from('changed'));assert.throws(()=>inspectArchive(entries,f.root,f.manifest),/bundle differs/);entries.set('extension/dist/extension.cjs',readFileSync(path.join(f.root,'dist/extension.cjs')));
  entries.set('extension/package.json',Buffer.from(JSON.stringify({...f.manifest,version:'1.2.2'})));assert.throws(()=>inspectArchive(entries,f.root,f.manifest),/identity or version/);
 }finally{f.close();}
});

test('publication records require the exact public publisher, extension, version and hash',()=>{
 const artifact={version:'1.2.3',publisher:'Example',name:'example',source:{commit:'a'.repeat(40),tree:'b'.repeat(40)},sha256:'c'.repeat(64),bytes:100,checks:{}};
 const metadata={publisher:{publisherName:'Example'},extensionName:'example',versions:[{version:'1.2.3',lastUpdated:'2026-11-02T00:00:00Z',properties:[{key:'Microsoft.VisualStudio.Services.VsixSha256',value:artifact.sha256}]}]};
 assert.equal(publicationRecord(artifact,metadata).sha256,artifact.sha256);
 assert.throws(()=>publicationRecord(artifact,{...metadata,publisher:{publisherName:'Other'}}),/identity/);
 assert.throws(()=>publicationRecord({...artifact,sha256:'d'.repeat(64)},metadata),/missing or differs/);
 assert.throws(()=>publicationRecord({...artifact,version:'1.2.4'},metadata),/missing or differs/);
});
