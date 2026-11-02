import {readFileSync} from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import {bundles,sha256} from './release.mjs';

export function readArchive(file){
 return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{
  if(error)return reject(error);
  const entries=new Map();let total=0,failed=false;
  const fail=error=>{if(failed)return;failed=true;zip.close();reject(error);};
  zip.on('error',fail);zip.on('end',()=>resolve(entries));
  zip.on('entry',entry=>{
   if(entries.has(entry.fileName)||entries.size>=256||entry.uncompressedSize>8*1024*1024||(total+=entry.uncompressedSize)>32*1024*1024)return fail(Error('Unexpected or oversized VSIX contents.'));
   zip.openReadStream(entry,(error,stream)=>{
    if(error)return fail(error);const parts=[];stream.on('error',fail);stream.on('data',part=>parts.push(part));stream.on('end',()=>{if(failed)return;entries.set(entry.fileName,Buffer.concat(parts));zip.readEntry();});
   });
  });zip.readEntry();
 }));
}

export function inspectArchive(entries,root,manifest){
 const allowed=/^(?:\[Content_Types\]\.xml|extension\.vsixmanifest|extension\/(?:package(?:\.nls(?:\.ko)?)?\.json|readme(?:\.ko)?\.md|changelog\.md|privacy\.md|license(?:\.txt)?|third_party_notices|plan\.schema\.json|dist\/(?:extension|mcp-server|codex-hook)\.cjs|assets\/(?:icon\.png|toolbar-(?:light|dark)\.svg)|examples\/(?:judgment\/|quickstart\/)?(?:[a-z-]+\.(?:js|mjs|ts|json|md)|\.vscode\/tasks\.json)))$/i;
 for(const name of entries.keys())if(!allowed.test(name))throw Error(`Unapproved package file: ${name}`);
 const packaged=JSON.parse(entries.get('extension/package.json')?.toString()||'null');
 if(!packaged||packaged.version!==manifest.version||packaged.name!==manifest.name||packaged.publisher!==manifest.publisher)throw Error('Packaged identity or version differs.');
 for(const name of bundles)if(sha256(entries.get('extension/dist/'+name)||'')!==sha256(readFileSync(path.join(root,'dist',name))))throw Error(`Packaged bundle differs: ${name}`);
 const readme=[...entries].find(([name])=>name.toLowerCase()==='extension/readme.md')?.[1]?.toString()||'';
 for(const heading of ['## Korean','## Guide','## Privacy and local data','## Verification'])if(!readme.includes(heading))throw Error('Marketplace guide is not self-contained: '+heading);
 return {fileCount:entries.size,bundlesMatch:true,selfContainedGuide:true,privateEvidenceExcluded:true};
}
