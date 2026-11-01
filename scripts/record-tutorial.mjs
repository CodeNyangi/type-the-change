// Real VS Code on a GitHub Linux virtual display. Never launch on the user's Mac.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
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
async function command(title){
  await page.keyboard.press('F1');const input=page.locator('.quick-input-widget input[type="text"]');
  await input.waitFor({state:'visible'});await input.fill('>'+title);
  const row=page.locator('.quick-input-list .monaco-list-row').filter({hasText:title.includes(': ')?title.split(': ').slice(1).join(': '):title}).first();await row.waitFor({state:'visible'});await page.keyboard.press('Enter');
}
async function panel(){
  const end=Date.now()+30000;
  while(Date.now()<end){for(const frame of page.frames()){try{if(await frame.locator('#intent').count())return frame;}catch{}}await pause(100);}
  throw Error('Extension webview missing');
}
async function state(view,value){
  await view.waitForFunction(value=>document.querySelector('#status')?.dataset.state===value,value);
}
async function typeField(locator,text){await locator.pressSequentially(text,{delay:30});assert.equal(await locator.inputValue(),text);await pause(500);}
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
  app=await electron.launch({executablePath,env,timeout:60000,args:[folder,`--user-data-dir=${profile}`,`--extensions-dir=${path.join(root,'extensions')}`,`--extensionDevelopmentPath=${process.cwd()}`,'--disable-workspace-trust','--skip-welcome','--skip-release-notes','--disable-updates','--no-sandbox']});
  page=await app.firstWindow();page.setDefaultTimeout(20000);
  await page.locator('.statusbar-item').filter({hasText:'Type the Change'}).waitFor({state:'visible',timeout:60000});
  if(await page.locator('.part.sidebar').isVisible())await page.keyboard.press('Control+b');
  if(await page.locator('.part.auxiliarybar').isVisible())await page.keyboard.press('Control+Alt+b');
  await command('Type the Change: Start');const view=await panel();await view.locator('#home').waitFor({state:'visible'});
  // Substitute only the platform file dialog. The extension parses and opens the real fixture.
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(folder,'plan.json'));
  recorder=spawn('ffmpeg',['-y','-loglevel','error','-f','x11grab','-video_size','1440x1000','-framerate','24','-i',process.env.DISPLAY,'-an','-c:v','libx264','-preset','ultrafast','-crf','18',path.join(output,'capture.mp4')],{stdio:['pipe','inherit','inherit']});
  recordingFinished=once(recorder,'exit');started=Date.now();
  subtitle('AI 제안, 그대로 받아도 될까요?');await pause(2200);
  await command('Type the Change: Open a Plan');await view.locator('#prediction').waitFor({state:'visible'});
  await command('Type the Change: Next Action');
  await view.waitForFunction(()=>document.activeElement?.id==='prediction');
  subtitle('1. 결과를 예상하고 Ctrl+Enter. 코드로 이어집니다.');
  await typeField(view.locator('#prediction'),'음수를 빼면 10 + 20 = 30');await page.keyboard.press('Control+Enter');
  await page.waitForFunction(()=>Boolean(document.activeElement?.closest('.monaco-editor')));await pause(1600);
  assert.equal(await readFile(path.join(folder,'total.js'),'utf8'),await readFile('examples/judgment/total.js','utf8'));
  subtitle('일부러 틀린 연습용 제안: return → break');
  await page.keyboard.type('      break;',{delay:110});await state(view,'matched');await pause(1300);
  subtitle('2. Ctrl+Alt+Enter. 저장하고 검사합니다.');
  await page.keyboard.press('Control+Alt+Enter');
  await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'합계 동작 검사'}).waitFor({state:'visible'});
  subtitle('처음 한 번 선택. 검토 파일만 저장하도록 설정합니다.');await pause(1400);await page.keyboard.press('Enter');
  await view.locator('#check-result[data-status=failed]').waitFor({state:'visible'});
  await view.waitForFunction(()=>document.activeElement?.id==='evidence');
  assert.equal(await page.locator('.terminal-wrapper').first().isVisible(),false);
  assert.match(await readFile(path.join(folder,'total.js'),'utf8'),/break;/);
  subtitle('기대 30, 실제 10. 결과가 코드 옆에 나타납니다.');await pause(2300);
  await page.screenshot({path:path.join(output,'counterexample.png')});
  subtitle('3. 이유 한 줄. Ctrl+Enter → 방향키 → Enter로 거절.');
  await typeField(view.locator('#evidence'),'break도 반복을 끝내서 뒤의 20을 놓친다.');
  await page.keyboard.press('Control+Enter');await page.keyboard.press('ArrowRight');await pause(1000);await page.keyboard.press('Enter');await state(view,'rejected');await pause(1500);
  subtitle('Ctrl+Alt+T로 코드에 돌아와 직접 고칩니다.');
  await page.keyboard.press('Control+Alt+t');await page.waitForFunction(()=>Boolean(document.activeElement?.closest('.monaco-editor')));
  await page.keyboard.press('Shift+Home');await page.keyboard.type('continue;',{delay:100});await state(view,'editing');
  subtitle('같은 단축키로 다시 검사. 터미널 이동 없이.');
  await page.keyboard.press('Control+Alt+Enter');await view.locator('#check-result[data-status=passed]').waitFor({state:'visible'});
  await view.waitForFunction(()=>document.activeElement?.id==='evidence');
  assert.match(await readFile(path.join(folder,'total.js'),'utf8'),/continue;/);
  await typeField(view.locator('#evidence'),'같은 입력으로 30. continue는 다음 반복으로 이동한다.');
  await page.keyboard.press('Control+Enter');await pause(800);await page.keyboard.press('Enter');await state(view,'complete');
  subtitle('검사는 자동으로, 채택은 내 판단으로.');await pause(2500);
  await page.screenshot({path:path.join(output,'poster.png')});
  const duration=(Date.now()-started)/1000;recorder.stdin.write('q');await recordingFinished;recorder=undefined;
  const srt=captions.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(captions[i+1]?.start??duration)}\n${c.text}\n`).join('\n');
  await writeFile(path.join(output,'tutorial.ko.srt'),srt);
  // Encode a shareable H.264 MP4 with burned-in Korean captions and web streaming metadata.
  await run('ffmpeg',['-y','-loglevel','error','-i',path.join(output,'capture.mp4'),'-vf',`subtitles=${path.join(output,'tutorial.ko.srt')}:force_style='FontName=Noto Sans CJK KR,FontSize=20,Outline=1,BorderStyle=3,BackColour=&H80000000,MarginV=26'`,'-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(output,'type-the-change-quickstart.mp4')]);
  await run('ffmpeg',['-y','-loglevel','error','-i',path.join(output,'type-the-change-quickstart.mp4'),'-vf','setpts=0.7*PTS,fps=6,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse','-loop','0',path.join(output,'quickstart.gif')]);
  for(const [name,time] of [['caption-start',5],['caption-test',19],['caption-decision',37]])await run('ffmpeg',['-y','-loglevel','error','-ss',String(time),'-i',path.join(output,'type-the-change-quickstart.mp4'),'-frames:v','1',path.join(output,name+'.png')]);
  await rm(path.join(output,'capture.mp4'));
  await writeFile(path.join(output,'recording.json'),JSON.stringify({success:true,durationSeconds:duration,environment:'Real VS Code 1.142.0, isolated Linux CI display',fixture:'examples/judgment',sourceCommit:process.env.GITHUB_SHA,limitations:['Deliberately wrong local exercise, not a live AI response.','One example input, not proof of general correctness or learning gain.','File dialog is substituted; all editing, task execution, comparison and decisions use real VS Code keyboard controls.','Silent video with burned-in Korean captions.']},null,2));
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
finally{if(recorder){recorder.stdin.write('q');await recordingFinished.catch(()=>{});}await app?.close().catch(()=>{});await rm(root,{recursive:true,force:true});}
