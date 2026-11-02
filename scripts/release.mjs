import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const validationCommands=['check','test','build','test:host','test:ui:companion','test:editor'];
export const bundles=['extension.cjs','mcp-server.cjs','codex-hook.cjs'];
const json=file=>JSON.parse(readFileSync(file,'utf8'));
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const requireThat=(condition,message)=>{if(!condition)throw Error(message);};

export function checkMetadata(root=process.cwd()){
 const read=file=>json(path.join(root,file)),manifest=read('package.json'),lock=read('package-lock.json'),config=read('release.config.json');
 requireThat(/^\d+\.\d+\.\d+$/.test(manifest.version),'Use a stable x.y.z package version.');
 requireThat(manifest.version===lock.version&&manifest.version===lock.packages?.['']?.version,'Package and lockfile versions differ.');
 requireThat(manifest.engines?.vscode===lock.packages?.['']?.engines?.vscode,'Package and lockfile VS Code requirements differ.');
 requireThat(manifest.name===config.name&&manifest.publisher===config.publisher&&manifest.repository?.url===config.repository,'Release target differs from release.config.json.');
 requireThat(/^[a-f0-9]{40}$/.test(config.mediaRevision),'Pin public media to a full source SHA.');
 const changelog=readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
 requireThat(changelog.match(/^## (\d+\.\d+\.\d+)/m)?.[1]===manifest.version,'The first changelog release must match package.json.');
 requireThat(existsSync(path.join(root,`docs/verification-${manifest.version}.md`)),'Missing verification report for this version.');
 const english=read('package.nls.json'),korean=read('package.nls.ko.json');
 requireThat(JSON.stringify(Object.keys(english).sort())===JSON.stringify(Object.keys(korean).sort()),'English and Korean extension metadata keys differ.');
 for(const [,key]of JSON.stringify(manifest).matchAll(/%([^%]+)%/g))for(const [locale,values]of [['en',english],['ko',korean]])requireThat(typeof values[key]==='string'&&values[key].trim(),`Missing ${locale} metadata: ${key}`);
 requireThat(/^\^\d+\.\d+\.\d+$/.test(manifest.engines?.vscode),'Use an explicit minimum VS Code version.');
 const releaseDirectory=path.join(root,'releases'),versionParts=manifest.version.split('.').map(Number);
 for(const file of existsSync(releaseDirectory)?readdirSync(releaseDirectory):[]){
  if(!/^\d+\.\d+\.\d+\.json$/.test(file))continue;
  const previous=file.slice(0,-5).split('.').map(Number),different=versionParts.findIndex((value,index)=>value!==previous[index]);
  requireThat(different<0||versionParts[different]>previous[different],'Package version is older than a recorded public release.');
 }
 return {manifest,config};
}

export function sourceIdentity(root=process.cwd(),clean=true){
 if(clean)requireThat(!git(root,'status','--porcelain','--untracked-files=all'),'Commit source and documentation before preparing a release.');
 return {commit:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}')};
}
export function bundleHashes(root=process.cwd()){
 return Object.fromEntries(bundles.map(name=>[name,sha256(readFileSync(path.join(root,'dist',name)))]));
}
export function checkedRelease(root=process.cwd()){
 const {manifest,config}=checkMetadata(root),source=sourceIdentity(root);
 requireThat(git(root,'remote','get-url','origin')===config.repository,'Git origin differs from the approved release target.');
 requireThat(!existsSync(path.join(root,'releases',`${manifest.version}.json`)),`Version ${manifest.version} already has a published release record. Bump the version.`);
 requireThat(!git(root,'tag','--list',`v${manifest.version}`),'Version already has a release tag. Bump the version.');
 const file=path.join(root,'artifacts',`release-check-${manifest.version}.json`);
 requireThat(existsSync(file),'Run npm run release:verify from the committed source first.');
 const evidence=json(file);
 requireThat(evidence.version===manifest.version&&evidence.source?.commit===source.commit&&evidence.source?.tree===source.tree,'Verification belongs to different source. Run release:verify again.');
 requireThat(JSON.stringify(evidence.commands)===JSON.stringify(validationCommands),'Required release checks are incomplete.');
 requireThat(JSON.stringify(evidence.bundles)===JSON.stringify(bundleHashes(root)),'Build outputs changed after verification.');
 return {manifest,config,source,evidence};
}

function verify(root){
 const {manifest}=checkMetadata(root),source=sourceIdentity(root),startedAt=new Date().toISOString();
 requireThat(!existsSync(path.join(root,'releases',`${manifest.version}.json`)),'Bump the version before preparing another published release.');
 for(const command of validationCommands){
  console.log(`Release check: ${command}`);
  const npmCli=process.env.npm_execpath;
  requireThat(npmCli,'Run this command with npm run release:verify.');
  execFileSync(process.execPath,[npmCli,'run',command],{cwd:root,stdio:'inherit',env:process.env});
 }
 requireThat(JSON.stringify(sourceIdentity(root))===JSON.stringify(source),'Source changed during validation.');
 const evidence={version:manifest.version,source,commands:validationCommands,bundles:bundleHashes(root),startedAt,checkedAt:new Date().toISOString()};
 mkdirSync(path.join(root,'artifacts'),{recursive:true});
 writeFileSync(path.join(root,'artifacts',`release-check-${manifest.version}.json`),JSON.stringify(evidence,null,2)+'\n');
 console.log(`Verified ${manifest.version} at ${source.commit}.`);
}

export function publicationRecord(artifact,metadata){
 const version=metadata.versions?.find(v=>v.version===artifact.version&&!v.targetPlatform),remoteHash=version?.properties?.find(p=>p.key==='Microsoft.VisualStudio.Services.VsixSha256')?.value;
 requireThat(metadata.publisher?.publisherName===artifact.publisher&&metadata.extensionName===artifact.name,'Marketplace identity differs from the package.');
 requireThat(version&&remoteHash===artifact.sha256,'Marketplace package is missing or differs from the prepared VSIX.');
 return {schemaVersion:1,version:artifact.version,publisher:artifact.publisher,name:artifact.name,sourceCommit:artifact.source.commit,sourceTree:artifact.source.tree,mediaRevision:artifact.mediaRevision,sha256:artifact.sha256,bytes:artifact.bytes,bundles:artifact.bundles,checks:artifact.checks,publishedAt:version.lastUpdated,verifiedAt:new Date().toISOString(),url:`https://marketplace.visualstudio.com/items?itemName=${artifact.publisher}.${artifact.name}`};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const root=process.cwd(),command=process.argv[2];
  if(command==='check'){const {manifest}=checkMetadata(root);console.log(`Release metadata matches ${manifest.version}.`);}
  else if(command==='verify')verify(root);
  else if(command==='record'){
   const {manifest}=checkMetadata(root),file=process.argv[3];requireThat(file,'Provide the downloaded public Marketplace metadata JSON.');
   const artifact=json(path.join(root,'artifacts',`type-the-change-${manifest.version}-marketplace.release.json`));
   requireThat(sha256(readFileSync(path.join(root,'artifacts',artifact.artifact)))===artifact.sha256,'Local VSIX changed after packaging.');
   const record=publicationRecord(artifact,json(file)),destination=path.join(root,'releases',`${manifest.version}.json`);
   requireThat(!existsSync(destination),'Published release records are immutable.');mkdirSync(path.dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(`Recorded verified Marketplace release ${manifest.version}.`);
  }else throw Error('Use check, verify, or record.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
