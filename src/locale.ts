import * as vscode from 'vscode';
export const text=(ko:string,en:string)=>(vscode.env?.language??'ko').startsWith('ko')?ko:en;
