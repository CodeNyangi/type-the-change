import * as vscode from 'vscode';
import {randomBytes} from 'node:crypto';
import {panelHtml, PANEL_COMMANDS, type PanelState} from './panel-view.js';
export type {PanelState} from './panel-view.js';

export interface PanelMessage {command:string;intent?:string;prediction?:string;evidence?:string;decision?:string}
export class GuidePanel implements vscode.Disposable {
  private panel:vscode.WebviewPanel|undefined;
  private state:PanelState={};
  private revision=0;
  private handoff=false;
  private focusRequest=0;
  private rendered=new Map<number,{resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>();
  private focused:{request:number;resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}|undefined;
  constructor(private onCommand:(message:PanelMessage)=>void){}
  show(preserveFocus=false){
    const viewColumn=this.state.file?vscode.ViewColumn.Two:(this.panel?.viewColumn??vscode.ViewColumn.Beside);
    if(this.panel){this.panel.reveal(viewColumn,preserveFocus);return;}
    this.panel=vscode.window.createWebviewPanel('typeTheChange.guide','Type the Change',
      {viewColumn,preserveFocus},
      {enableScripts:true,localResourceRoots:[],retainContextWhenHidden:true});
    this.panel.webview.html=panelHtml(randomBytes(24).toString('base64'),process.platform==='darwin',vscode.env?.language?.startsWith('ko')??true);
    this.panel.webview.onDidReceiveMessage(message=>{
      if(message?.command==='ready'){this.postState();if(!this.state.file&&!this.handoff)this.focusIntent();}
      else if(message?.command==='rendered'&&Number.isSafeInteger(message.revision)&&message.revision<=this.revision){
        for(const [revision,pending]of this.rendered)if(revision<=message.revision){clearTimeout(pending.timer);this.rendered.delete(revision);pending.resolve();}
      }
      else if(message?.command==='focused'&&this.focused&&message.request===this.focused.request){const pending=this.focused;this.focused=undefined;clearTimeout(pending.timer);pending.resolve();}
      else if(typeof message?.command==='string'&&PANEL_COMMANDS.has(message.command)){
        if(message.command==='generate'&&(typeof message.intent!=='string'||!message.intent.trim()||message.intent.length>4000))return;
        if(message.command==='predict'&&(typeof message.prediction!=='string'||!message.prediction.trim()||message.prediction.length>280))return;
        if(message.command==='decide'&&(!['keep','reject','defer'].includes(message.decision)||typeof message.evidence!=='string'||message.evidence.length>280))return;
        this.onCommand({command:message.command,...(message.command==='generate'?{intent:message.intent}:message.command==='predict'?{prediction:message.prediction}:message.command==='decide'?{decision:message.decision,evidence:message.evidence}:{})});
      }
    });
    this.panel.onDidDispose(()=>{this.panel=undefined;this.cancelFocus();for(const pending of this.rendered.values()){clearTimeout(pending.timer);pending.resolve();}this.rendered.clear();});
  }
  private postState(){void this.panel?.webview.postMessage({...this.state,handoff:this.handoff,revision:++this.revision});}
  update(state:PanelState){this.state=state;this.postState();}
  focusIntent(){void this.panel?.webview.postMessage({type:'focusIntent'});}
  private cancelFocus(){
    this.focusRequest++;
    if(this.focused){clearTimeout(this.focused.timer);this.focused.resolve();this.focused=undefined;}
  }
  holdFocus(){this.cancelFocus();this.handoff=true;this.postState();}
  releaseFocus(){this.handoff=false;this.postState();}
  // A workbench command finishing does not mean the iframe has rendered it.
  // Drain earlier state/focus messages before returning typing to native code.
  private flush(){
    if(!this.panel)return Promise.resolve();
    const revision=this.revision+1;
    const result=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.rendered.delete(revision);reject(Error('안내 화면이 응답하지 않아요. Type the Change를 다시 열어 주세요.'));},5000);
      this.rendered.set(revision,{resolve,reject,timer});
    });
    this.postState();return result;
  }
  async prepareSourceFocus(){this.holdFocus();await this.flush();}
  async focusStep(){
    this.holdFocus();const request=this.focusRequest;
    // Reveal without taking focus. Explicit workbench and iframe handoffs below
    // must both finish before callers can start a new action.
    this.show(true);await this.flush();
    if(request!==this.focusRequest||!this.panel||!this.state.file)return;
    await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    if(request!==this.focusRequest||!this.panel||!this.state.file)return;
    this.releaseFocus();
    const result=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{if(this.focused?.request===request)this.focused=undefined;reject(Error('입력 위치를 준비하지 못했어요. 다음 동작 키를 다시 눌러 주세요.'));},5000);
      this.focused={request,resolve,reject,timer};
    });
    void this.panel.webview.postMessage({type:'focusStep',request});
    await result;
  }
  dispose(){this.panel?.dispose();}
}
