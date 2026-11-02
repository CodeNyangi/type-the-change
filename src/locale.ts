import * as vscode from 'vscode';
export function language():string{
  const selected=vscode.workspace?.getConfiguration?.('typeTheChange').get<string>('language');
  return selected==='ko'||selected==='en'?selected:(vscode.env?.language??'ko');
}
export const text=(ko:string,en:string)=>language().startsWith('ko')?ko:en;
