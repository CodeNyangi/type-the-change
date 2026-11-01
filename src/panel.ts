import * as vscode from 'vscode';
import {randomBytes} from 'node:crypto';
import {panelHtml, PANEL_COMMANDS, type PanelState} from './panel-view.js';
export type {PanelState} from './panel-view.js';

export interface PanelMessage {command:string;intent?:string}
export class GuidePanel implements vscode.Disposable {
  private panel:vscode.WebviewPanel|undefined;
  private state:PanelState={};
  constructor(private onCommand:(message:PanelMessage)=>void){}
  show(preserveFocus=false){
    if(this.panel){this.panel.reveal(vscode.ViewColumn.Beside,preserveFocus);return;}
    this.panel=vscode.window.createWebviewPanel('typeTheChange.guide','Type the Change',
      {viewColumn:vscode.ViewColumn.Beside,preserveFocus},
      {enableScripts:true,localResourceRoots:[],retainContextWhenHidden:true});
    this.panel.webview.html=panelHtml(randomBytes(24).toString('base64'),process.platform==='darwin');
    this.panel.webview.onDidReceiveMessage(message=>{
      if(message?.command==='ready'){this.update(this.state);if(!this.state.file)this.focusIntent();}
      else if(typeof message?.command==='string'&&PANEL_COMMANDS.has(message.command)){
        if(message.command==='generate'&&(typeof message.intent!=='string'||!message.intent.trim()||message.intent.length>4000))return;
        this.onCommand({command:message.command,...(message.command==='generate'?{intent:message.intent}:{})});
      }
    });
    this.panel.onDidDispose(()=>{this.panel=undefined;});
  }
  update(state:PanelState){this.state=state;void this.panel?.webview.postMessage(state);}
  focusIntent(){void this.panel?.webview.postMessage({type:'focusIntent'});}
  dispose(){this.panel?.dispose();}
}
