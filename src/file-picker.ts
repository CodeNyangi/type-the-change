import * as vscode from 'vscode';
import * as path from 'node:path';
import {text as t} from './locale.js';
import {validateRelativePath} from './plan.js';

export const FILE_SEARCH_LIMIT=200;
export function eligibleFile(root:string,uri:vscode.Uri):string|undefined {
  if(uri.scheme!=='file')return;
  const file=path.relative(root,uri.fsPath).split(path.sep).join('/');
  try{validateRelativePath(file);}catch{return;}
  if(file.split('/').some(part=>['node_modules','.vscode-test'].includes(part.toLowerCase())))return;
  return file;
}
export function fileSearchPattern(query:string):string {
  // Treat the user's query as text, not a glob. ASCII case folding keeps file
  // discovery consistent on Linux, macOS and Windows.
  const escaped=[...query.slice(0,256).replaceAll('\\','/')].map(c=>/[a-z]/i.test(c)?`[${c.toLowerCase()}${c.toUpperCase()}]`:'*?[]{}'.includes(c)?`[${c}]`:c).join('');
  return `**/*${escaped}*`;
}
type Item=vscode.QuickPickItem&{file:string};

function recentFiles(root:string):Map<string,string>{
  const result=new Map<string,string>();
  const include=(uri:vscode.Uri,label:string)=>{const file=eligibleFile(root,uri);if(file&&!result.has(file)&&result.size<FILE_SEARCH_LIMIT)result.set(file,label);};
  const active=vscode.window.activeTextEditor?.document.uri;if(active)include(active,t("열린 파일","Open file"));
  for(const document of vscode.workspace.textDocuments)include(document.uri,t("열린 파일","Open file"));
  // Use the already running Git extension's index; never launch a repository scan.
  const git=vscode.extensions.getExtension('vscode.git');
  if(git?.isActive){
    try{
      const api=git.exports.getAPI(1) as {repositories:{state:{workingTreeChanges:{uri:vscode.Uri}[];indexChanges:{uri:vscode.Uri}[]}}[]};
      for(const repo of api.repositories){
        for(const changes of [repo.state.workingTreeChanges,repo.state.indexChanges])for(const change of changes){
          if(result.size>=FILE_SEARCH_LIMIT)break;include(change.uri,t("Git 변경","Git changes"));
        }
        if(result.size>=FILE_SEARCH_LIMIT)break;
      }
    }catch{/* File-name search remains available if Git is disabled or initializing. */}
  }
  return result;
}

export async function pickFiles(root:string,previous:readonly string[],folderName:string):Promise<string[]|undefined>{
  const selected=new Set(previous),recent=recentFiles(root),picker=vscode.window.createQuickPick<Item>();
  picker.canSelectMany=true;picker.ignoreFocusOut=true;picker.matchOnDescription=false;
  picker.title=`${t('파일 참고 자료','Reference files')} · ${folderName}`;
  picker.placeholder=t("이름으로 검색 · Space 선택 · Enter 완료 · 최대 8개","Search by name \u00b7 Space to select \u00b7 Enter to finish \u00b7 Up to 8");
  let serial=0,disposed=false,updating=false,timer:NodeJS.Timeout|undefined,cancellation:vscode.CancellationTokenSource|undefined;
  const subscriptions:vscode.Disposable[]=[];
  const show=(files:Map<string,string>,limited=false)=>{
    if(disposed)return;updating=true;
    const merged=new Map([...selected].map(file=>[file,t("선택됨","Selected")]));
    for(const [file,label]of files)if(!merged.has(file))merged.set(file,label);
    picker.items=[...merged].map(([file,description])=>({label:file,file,description,alwaysShow:true}));
    picker.selectedItems=picker.items.filter(item=>selected.has(item.file));
    picker.title=selected.size>8?t("파일은 최대 8개까지 선택하세요.","Select up to eight files."):`${folderName} · ${selected.size}/8 ${t('선택','selected')}${limited?t(' · 200개 표시, 검색어를 좁혀 주세요',' · Showing 200; narrow your search'):''}`;
    updating=false;
  };
  show(recent);
  try{return await new Promise<string[]|undefined>((resolve,reject)=>{
    subscriptions.push(picker.onDidChangeSelection(items=>{
      if(updating)return;
      for(const item of picker.items)selected.delete(item.file);
      for(const item of items)selected.add(item.file);
      picker.title=selected.size>8?t("파일은 최대 8개까지 선택하세요.","Select up to eight files."):`${folderName} · ${selected.size}/8 ${t('선택','selected')}`;
    }));
    subscriptions.push(picker.onDidChangeValue(value=>{
      const request=++serial;clearTimeout(timer);cancellation?.cancel();cancellation?.dispose();
      const query=value.trim().slice(0,256);picker.busy=false;
      if(!query){show(recent);return;}
      show(new Map([...recent].filter(([file])=>file.toLowerCase().includes(query.toLowerCase()))));
      picker.busy=true;
      timer=setTimeout(()=>{
        cancellation=new vscode.CancellationTokenSource();
        void vscode.workspace.findFiles(new vscode.RelativePattern(root,fileSearchPattern(query)),undefined,FILE_SEARCH_LIMIT,cancellation.token).then(uris=>{
          if(disposed||request!==serial)return;
          const found=new Map<string,string>();for(const uri of uris){const file=eligibleFile(root,uri);if(file)found.set(file,'');}
          show(found,uris.length>=FILE_SEARCH_LIMIT);picker.busy=false;
        },()=>{if(!disposed&&request===serial){picker.busy=false;picker.title=t("검색하지 못했어요 · 이름을 다시 입력해 주세요","Search failed \u00b7 Try the file name again");}});
      },150);
    }));
    subscriptions.push(picker.onDidAccept(()=>{if(selected.size>8)reject(Error(t("한 번에 파일 8개까지 선택하세요.","Select up to eight files.")));else resolve([...selected]);}));
    subscriptions.push(picker.onDidHide(()=>resolve(undefined)));
    picker.show();
  });}finally{disposed=true;clearTimeout(timer);cancellation?.cancel();cancellation?.dispose();for(const subscription of subscriptions)subscription.dispose();picker.dispose();}
}
