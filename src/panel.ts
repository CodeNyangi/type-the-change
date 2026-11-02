import * as vscode from 'vscode';
import {language,text as t} from './locale.js';
import {randomBytes} from 'node:crypto';
import {panelHtml, PANEL_COMMANDS, type PanelState} from './panel-view.js';
import {companionHtml,COMPANION_COMMANDS} from './companion-view.js';
export type {PanelState} from './panel-view.js';

export interface PanelMessage {command:string;intent?:string;prediction?:string;evidence?:string;decision?:string;root?:string;id?:string;file?:string;index?:number}
export class GuidePanel implements vscode.Disposable {
  private panel:vscode.WebviewPanel|undefined;
  private sidebar:vscode.WebviewView|undefined;
  private sidebarEnabled=false;
  private conversation=false;
  private state:PanelState={};
  private htmlModes=new WeakMap<vscode.Webview,boolean>();
  private revision=0;
  private handoff=false;
  private helpRequested=false;
  private focusRequest=0;
  private rendered=new Map<number,{resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>();
  private focused:{request:number;resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}|undefined;
  constructor(private onCommand:(message:PanelMessage)=>void,private onVisibility?:(visible:boolean)=>void){}
  get visible(){return !!this.panel?.visible||!!this.sidebar?.visible;}
  private get webview(){return this.sidebarEnabled?this.sidebar?.webview:this.panel?.webview;}
  useSidebar(){this.sidebarEnabled=true;}
  attachSidebar(view:vscode.WebviewView){
    this.sidebar=view;view.webview.options={enableScripts:true,localResourceRoots:[]};
    this.initialize(view.webview);
    view.onDidChangeVisibility(()=>this.onVisibility?.(view.visible));
    view.onDidDispose(()=>{if(this.sidebar===view)this.sidebar=undefined;});
    this.postState();
    this.onVisibility?.(view.visible);
  }
  async show(preserveFocus=false){
    if(this.sidebarEnabled){
      if(this.sidebar)this.sidebar.show(preserveFocus);else await vscode.commands.executeCommand('typeTheChange.launcher.focus');
      return;
    }
    const viewColumn=this.state.file?vscode.ViewColumn.Two:(this.panel?.viewColumn??vscode.ViewColumn.Beside);
    if(this.panel){this.panel.reveal(viewColumn,preserveFocus);return;}
    this.panel=vscode.window.createWebviewPanel('typeTheChange.guide','Type the Change',
      {viewColumn,preserveFocus},
      {enableScripts:true,localResourceRoots:[],retainContextWhenHidden:true});
    this.initialize(this.panel.webview);
    this.panel.onDidDispose(()=>{this.panel=undefined;this.cancelFocus();for(const pending of this.rendered.values()){clearTimeout(pending.timer);pending.resolve();}this.rendered.clear();});
  }
  private initialize(webview:vscode.Webview){
    this.writeHtml(webview);
    webview.onDidReceiveMessage(message=>{
      if(message?.command==='ready'){
        this.postState();
        if(this.helpRequested)void webview.postMessage({type:'showHelp'});
        else if(!this.state.file&&!this.handoff)void webview.postMessage({type:'focusIntent'});
      }
      else if(webview===this.webview&&message?.command==='rendered'&&Number.isSafeInteger(message.revision)&&message.revision<=this.revision){
        for(const [revision,pending]of this.rendered)if(revision<=message.revision){clearTimeout(pending.timer);this.rendered.delete(revision);pending.resolve();}
      }
      else if(webview===this.webview&&message?.command==='focused'&&this.focused&&message.request===this.focused.request){const pending=this.focused;this.focused=undefined;clearTimeout(pending.timer);pending.resolve();}
      else if(typeof message?.command==='string'&&COMPANION_COMMANDS.has(message.command)&&this.state.companion&&(!this.state.file||this.conversation)){
        this.onCommand({command:message.command,...(typeof message.id==='string'&&message.id.length<=120?{id:message.id}:{}),...(typeof message.file==='string'&&message.file.length<=4096?{file:message.file}:{}),...(Number.isSafeInteger(message.index)?{index:message.index}:{})});
      }
      else if(typeof message?.command==='string'&&PANEL_COMMANDS.has(message.command)){
        if(message.command==='generate'&&(typeof message.intent!=='string'||!message.intent.trim()||message.intent.length>4000))return;
        if(message.command==='predict'&&(typeof message.prediction!=='string'||!message.prediction.trim()||message.prediction.length>280))return;
        if(message.command==='decide'&&(!['keep','reject','defer'].includes(message.decision)||typeof message.evidence!=='string'||message.evidence.length>280))return;
        this.onCommand({command:message.command,...(message.command==='generate'?{intent:message.intent}:message.command==='predict'?{prediction:message.prediction}:message.command==='decide'?{decision:message.decision,evidence:message.evidence}:message.command==='openWorktree'&&typeof message.root==='string'&&message.root.length<4096?{root:message.root}:{})});
      }
    });
  }
  private writeHtml(webview:vscode.Webview){const mode=!!this.state.companion&&(!this.state.file||this.conversation);this.htmlModes.set(webview,mode);const nonce=randomBytes(24).toString('base64');webview.html=mode?companionHtml(nonce,language().startsWith('ko')):panelHtml(nonce,process.platform==='darwin',language().startsWith('ko'));}
  refreshLanguage(){for(const webview of [this.panel?.webview,this.sidebar?.webview])if(webview)this.writeHtml(webview);}
  private postState(){
    if(this.webview&&this.htmlModes.get(this.webview)!==(!!this.state.companion&&(!this.state.file||this.conversation)))this.writeHtml(this.webview);
    const revision=++this.revision;
    void this.webview?.postMessage({...this.state,surface:this.conversation?'chat':'learn',handoff:this.handoff,revision});
  }
  update(state:PanelState){
    this.state=state;
    if(!state.file)this.conversation=true;
    this.postState();
  }
  focusIntent(){void this.webview?.postMessage({type:'focusIntent'});}
  async showConversation(preserveFocus=false){this.conversation=true;this.releaseFocus();await this.show(preserveFocus);if(!preserveFocus)this.focusIntent();}
  async showLearning(preserveFocus=false){this.conversation=false;this.postState();await this.show(preserveFocus);}
  async showHelp(){this.helpRequested=true;await this.show();void this.webview?.postMessage({type:'showHelp'});}
  async move(){
    await this.show(true);
    // The native picker moves only this view, keeps the user's other views in
    // place, and lets VS Code remember the chosen container across restarts.
    await vscode.commands.executeCommand('workbench.action.moveFocusedView','typeTheChange.launcher');
  }
  private cancelFocus(){
    this.focusRequest++;
    if(this.focused){clearTimeout(this.focused.timer);this.focused.resolve();this.focused=undefined;}
  }
  holdFocus(){this.cancelFocus();this.handoff=true;this.postState();}
  releaseFocus(){this.handoff=false;this.postState();}
  // A workbench command finishing does not mean the iframe has rendered it.
  // Drain earlier state/focus messages before returning typing to native code.
  private flush(){
    if(!this.webview)return Promise.resolve();
    const revision=this.revision+1;
    const result=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.rendered.delete(revision);reject(Error(t("안내 화면이 응답하지 않아요. Type the Change를 다시 열어 주세요.","The guide is not responding. Reopen Type the Change.")));},5000);
      this.rendered.set(revision,{resolve,reject,timer});
    });
    this.postState();return result;
  }
  async prepareSourceFocus(){this.holdFocus();await this.flush();}
  async focusStep(){
    this.holdFocus();const request=this.focusRequest;
    // Reveal without taking focus. Explicit workbench and iframe handoffs below
    // must both finish before callers can start a new action.
    await this.showLearning(true);await this.flush();
    if(request!==this.focusRequest||!this.webview||!this.state.file)return;
    if(this.sidebarEnabled)await vscode.commands.executeCommand('typeTheChange.launcher.focus');
    else await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    if(request!==this.focusRequest||!this.webview||!this.state.file)return;
    this.releaseFocus();await this.flush();
    if(request!==this.focusRequest||!this.webview||!this.state.file)return;
    const result=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{if(this.focused?.request===request)this.focused=undefined;reject(Error(t("입력 위치를 준비하지 못했어요. 다음 동작 키를 다시 눌러 주세요.","Could not focus the input. Press the next-action key again.")));},5000);
      this.focused={request,resolve,reject,timer};
    });
    void this.webview.postMessage({type:'focusStep',request});
    await result;
  }
  dispose(){this.panel?.dispose();}
}
