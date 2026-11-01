import * as vscode from 'vscode';
import {randomBytes} from 'node:crypto';
import {panelHtml, PANEL_COMMANDS, type PanelState} from './panel-view.js';
export type {PanelState} from './panel-view.js';

export interface PanelMessage {command:string;intent?:string;prediction?:string;evidence?:string;decision?:string}
export class GuidePanel implements vscode.Disposable {
  private panel:vscode.WebviewPanel|undefined;
  private state:PanelState={};
  private pendingFocus:'focusIntent'|'focusStep'|undefined;
  constructor(private onCommand:(message:PanelMessage)=>void){}
  show(preserveFocus=false){
    const viewColumn=this.state.file?vscode.ViewColumn.Two:(this.panel?.viewColumn??vscode.ViewColumn.Beside);
    if(this.panel){this.panel.reveal(viewColumn,preserveFocus);return;}
    this.panel=vscode.window.createWebviewPanel('typeTheChange.guide','Type the Change',
      {viewColumn,preserveFocus},
      {enableScripts:true,localResourceRoots:[],retainContextWhenHidden:true});
    this.panel.webview.html=panelHtml(randomBytes(24).toString('base64'),process.platform==='darwin');
    this.panel.webview.onDidReceiveMessage(message=>{
      if(message?.command==='ready'){this.update(this.state);if(this.pendingFocus)void this.panel?.webview.postMessage({type:this.pendingFocus});else if(!this.state.file)this.focusIntent();}
      else if(typeof message?.command==='string'&&PANEL_COMMANDS.has(message.command)){
        if(message.command==='generate'&&(typeof message.intent!=='string'||!message.intent.trim()||message.intent.length>4000))return;
        if(message.command==='predict'&&(typeof message.prediction!=='string'||!message.prediction.trim()||message.prediction.length>280))return;
        if(message.command==='decide'&&(!['keep','reject','defer'].includes(message.decision)||typeof message.evidence!=='string'||message.evidence.length>280))return;
        this.onCommand({command:message.command,...(message.command==='generate'?{intent:message.intent}:message.command==='predict'?{prediction:message.prediction}:message.command==='decide'?{decision:message.decision,evidence:message.evidence}:{})});
      }
    });
    this.panel.onDidDispose(()=>{this.panel=undefined;});
  }
  update(state:PanelState){this.state=state;if(!state.file)this.pendingFocus=undefined;void this.panel?.webview.postMessage(state);}
  focusIntent(){void this.panel?.webview.postMessage({type:'focusIntent'});}
  async focusStep(){
    this.pendingFocus='focusStep';this.show();
    await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    if(this.state.file)void this.panel?.webview.postMessage({type:'focusStep'});
  }
  dispose(){this.panel?.dispose();}
}
