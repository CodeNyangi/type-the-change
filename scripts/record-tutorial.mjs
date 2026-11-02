// Real VS Code on a GitHub Linux virtual display. Never launch on the user's Mac.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright';
import {downloadAndUnzipVSCode} from '@vscode/test-electron';
if(process.platform!=='linux'||process.env.CI!=='true'||!process.env.DISPLAY)throw Error('Tutorial recording is restricted to Linux CI with a virtual display.');
const root=await mkdtemp(path.join(tmpdir(),'ttc-film-'));
const folder=path.join(root,'judgment-demo'),profile=path.join(root,'profile');
const output=path.resolve('artifacts/tutorial');
let app,page,recorder,recordingFinished,started=0;
const captions=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const subtitle=text=>captions.push({start:(Date.now()-started)/1000,text});
async function panel(surface='home'){
  const end=Date.now()+30000;
  while(Date.now()<end){for(const frame of page.frames()){try{if(await frame.locator('#'+surface).isVisible())return frame;}catch{}}await pause(100);}
  throw Error('Extension webview missing');
}
async function state(view,value){
  await view.waitForFunction(value=>document.querySelector('#status')?.dataset.state===value,value);
}
async function typeField(locator,text){await locator.pressSequentially(text,{delay:18});assert.equal(await locator.inputValue(),text);await pause(500);}
async function run(file,args){
  const child=spawn(file,args,{stdio:'inherit'});const [code]=await once(child,'exit');if(code!==0)throw Error(`${file} exited ${code}`);
}
function srtTime(seconds){return new Date(Math.round(seconds*1000)).toISOString().slice(11,23).replace('.',',');}
try{
  await mkdir(output,{recursive:true});await cp('examples/judgment',folder,{recursive:true});await mkdir(path.join(profile,'User'),{recursive:true});
  await writeFile(path.join(profile,'User/settings.json'),JSON.stringify({
    'workbench.startupEditor':'none','workbench.colorTheme':'Default Dark Modern','telemetry.telemetryLevel':'off',
    'workbench.enableExperiments':false,'security.workspace.trust.enabled':false,'window.restoreWindows':'none',
    'editor.accessibilitySupport':'off','editor.quickSuggestions':false,'editor.fontSize':20,'editor.lineHeight':32,
    'editor.minimap.enabled':false,'breadcrumbs.enabled':false,'chat.disableAIFeatures':true,
    'workbench.activityBar.location':'hidden','workbench.secondarySideBar.defaultVisibility':'hidden',
    'terminal.integrated.fontSize':18,'terminal.integrated.enablePersistentSessions':false,'files.autoSave':'off',
  }));
  const executablePath=await downloadAndUnzipVSCode('1.142.0');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath,env,timeout:60000,args:[folder,`--user-data-dir=${profile}`,`--extensions-dir=${path.join(root,'extensions')}`,`--extensionDevelopmentPath=${process.cwd()}`,'--disable-workspace-trust','--skip-welcome','--skip-release-notes','--disable-updates','--no-sandbox','--locale=en']});
  page=await app.firstWindow();page.setDefaultTimeout(20000);
  await page.locator('.statusbar-item').filter({hasText:'Type the Change'}).waitFor({state:'visible',timeout:60000});
  if(await page.locator('.part.sidebar').isVisible())await page.keyboard.press('Control+b');
  if(await page.locator('.part.auxiliarybar').isVisible())await page.keyboard.press('Control+Alt+b');
  await page.keyboard.press('Control+p');
  await page.locator('.quick-input-widget input[type="text"]').fill('total.js');
  await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'total.js'}).first().waitFor({state:'visible'});
  await page.keyboard.press('Enter');await page.locator('.quick-input-widget').waitFor({state:'hidden'});
  await page.locator('.editor-actions .action-label[aria-label*="Type the Change"]').first().waitFor({state:'visible'});
  recorder=spawn('ffmpeg',['-y','-loglevel','error','-f','x11grab','-video_size','1440x1000','-framerate','24','-i',process.env.DISPLAY,'-an','-c:v','libx264','-preset','ultrafast','-crf','18',path.join(output,'capture.mp4')],{stdio:['pipe','inherit','inherit']});
  recordingFinished=once(recorder,'exit');started=Date.now();
  subtitle('Open Type the Change from the >_ icon.');await pause(1500);
  await page.locator('.editor-actions .action-label[aria-label*="Type the Change"]').first().click();
  let view=await panel('chat-toggle');await view.locator('#chat-toggle').waitFor({state:'visible'});
  subtitle('Open the included learning exercise. No account needed.');await pause(1600);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(folder,'plan.json'));
  await page.keyboard.press('F1');await page.locator('.quick-input-widget input[type="text"]').fill('>Type the Change: Open a Plan');await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'Type the Change: Open a Plan'}).first().click();view=await panel('guide');await view.locator('#prediction').waitFor({state:'visible'});
  await view.waitForFunction(()=>document.activeElement?.id==='prediction');
  subtitle('1. Predict. Ctrl+Enter returns to your code.');
  await typeField(view.locator('#prediction'),'Skip negatives: 10 + 20 = 30.');await page.keyboard.press('Control+Enter');
  await page.waitForFunction(()=>Boolean(document.activeElement?.closest('.monaco-editor')));await pause(1600);
  subtitle('This practice suggestion is wrong: return → break.');
  await page.keyboard.type('      break;',{delay:110});await state(view,'matched');await pause(1300);
  subtitle('2. Ctrl+Alt+Enter saves and checks.');
  await page.keyboard.press('Control+Alt+Enter');
  await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'Check totals'}).waitFor({state:'visible'});
  subtitle('Choose a check once. Save only reviewed files.');await pause(1400);await page.keyboard.press('Enter');
  await view.locator('#check-result[data-status=failed]').waitFor({state:'visible'});
  await view.waitForFunction(()=>document.activeElement?.id==='evidence');
  assert.equal(await page.locator('.terminal-wrapper').first().isVisible(),false);
  subtitle('Expected 30. Got 10. Evidence beside your code.');await pause(2300);
  await page.screenshot({path:path.join(output,'counterexample.png')});
  subtitle('3. Explain. Ctrl+Enter → arrow → Enter to reject.');
  await typeField(view.locator('#evidence'),'break ends the loop and loses the last 20.');
  await page.keyboard.press('Control+Enter');await page.keyboard.press('ArrowRight');await pause(1000);await page.keyboard.press('Enter');await state(view,'rejected');await pause(1500);
  subtitle('Ctrl+Alt+T returns to the change. Fix it yourself.');
  await page.keyboard.press('Control+Alt+t');await page.waitForFunction(()=>Boolean(document.activeElement?.closest('.monaco-editor')));
  await page.keyboard.press('Shift+Home');await page.keyboard.type('continue;',{delay:100});await state(view,'editing');
  subtitle('Check again with the same shortcut.');
  await page.keyboard.press('Control+Alt+Enter');await view.locator('#check-result[data-status=passed]').waitFor({state:'visible'});
  await view.waitForFunction(()=>document.activeElement?.id==='evidence');
  await typeField(view.locator('#evidence'),'Now 30. continue skips only the negative price.');
  await page.keyboard.press('Control+Enter');await pause(800);await page.keyboard.press('Enter');await state(view,'complete');
  subtitle('The check runs. You decide what stays.');await pause(2500);
  await page.screenshot({path:path.join(output,'poster.png')});
  const duration=(Date.now()-started)/1000;recorder.stdin.write('q');await recordingFinished;recorder=undefined;
  const srt=captions.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(captions[i+1]?.start??duration)}\n${c.text}\n`).join('\n');
  await writeFile(path.join(output,'tutorial.en.srt'),srt);
  // Encode a shareable H.264 MP4 with burned-in English captions and web streaming metadata.
  await run('ffmpeg',['-y','-loglevel','error','-i',path.join(output,'capture.mp4'),'-vf',`subtitles=${path.join(output,'tutorial.en.srt')}:force_style='FontName=DejaVu Sans,FontSize=20,Outline=1,BorderStyle=3,BackColour=&H80000000,MarginV=26'`,'-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(output,'type-the-change-quickstart.mp4')]);
  await run('ffmpeg',['-y','-loglevel','error','-i',path.join(output,'type-the-change-quickstart.mp4'),'-vf','setpts=0.7*PTS,fps=6,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse','-loop','0',path.join(output,'quickstart.gif')]);
  for(const [name,time] of [['caption-start',2],['caption-test',captions.find(c=>c.text.startsWith('Expected 30')).start+1],['caption-decision',duration-1]])await run('ffmpeg',['-y','-loglevel','error','-ss',String(time),'-i',path.join(output,'type-the-change-quickstart.mp4'),'-frames:v','1',path.join(output,name+'.png')]);
  await rm(path.join(output,'capture.mp4'));
  await writeFile(path.join(output,'recording.json'),JSON.stringify({success:true,durationSeconds:duration,environment:'Real VS Code 1.142.0, isolated Linux CI display',fixture:'Imported examples/judgment/plan.json with total.js and check.mjs',sourceCommit:process.env.GITHUB_SHA,limitations:['Deliberately wrong local exercise, not a live AI response.','Four demo inputs, not proof of general correctness or learning gain.','Opened through the editor toolbar and Import a suggestion; editing, checks and decisions use real VS Code keyboard controls.','Silent video with burned-in English captions.']},null,2));
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
finally{if(recorder){recorder.stdin.write('q');await recordingFinished.catch(()=>{});}await app?.close().catch(()=>{});await rm(root,{recursive:true,force:true});}
