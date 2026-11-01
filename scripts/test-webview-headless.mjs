/** Production webview in an isolated, always-headless Chromium process.
 * Run: node --import tsx scripts/test-webview-headless.mjs
 * No VS Code, native desktop input, existing browser profile, or live account.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {panelHtml,PANEL_COMMANDS} from '../src/panel-view.ts';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.TTC_WEBVIEW_ARTIFACT_DIR||'artifacts/headless-webview');
await mkdir(output,{recursive:true});
const nonce='headless-test-host';
const bootstrap=`<script nonce="${nonce}">
window.__ttcHost={messages:[],draft:{}};
window.acquireVsCodeApi=()=>({postMessage:message=>window.__ttcHost.messages.push(message),getState:()=>window.__ttcHost.draft,setState:state=>window.__ttcHost.draft=state});
</script>`;
const html=mac=>panelHtml(nonce,mac).replace('<script nonce=',bootstrap+'<script nonce=');

// Representative VS Code theme tokens. This verifies the webview's rendering
// against supplied themes; it does not run VS Code or claim native theme QA.
const themes={
  dark:{foreground:'#ddd','editor-background':'#1e1e1e',descriptionForeground:'#aaa','input-background':'#292929','input-foreground':'#eee','input-placeholderForeground':'#a6a6a6','input-border':'#555','button-background':'#0067b8','button-foreground':'#fff','button-hoverBackground':'#087bcc','textCodeBlock-background':'#252525','testing-iconPassed':'#89bc83','editorWarning-foreground':'#d5a34c',errorForeground:'#f48771',focusBorder:'#69a9e8'},
  light:{foreground:'#333','editor-background':'#fff',descriptionForeground:'#666','input-background':'#fff','input-foreground':'#222','input-placeholderForeground':'#767676','input-border':'#aaa','button-background':'#0067b8','button-foreground':'#fff','button-hoverBackground':'#087bcc','textCodeBlock-background':'#f3f3f3','testing-iconPassed':'#38743a','editorWarning-foreground':'#855f00',errorForeground:'#a1260d',focusBorder:'#005fb8','widget-border':'#d4d4d4'},
  contrast:{foreground:'#fff','editor-background':'#000',descriptionForeground:'#fff','input-background':'#000','input-foreground':'#fff','input-placeholderForeground':'#a6a6a6','input-border':'#fff','button-background':'#000','button-foreground':'#fff','button-hoverBackground':'#0f4a85','button-border':'#fff',contrastBorder:'#6fc3df','textCodeBlock-background':'#000','testing-iconPassed':'#89bc83','editorWarning-foreground':'#ffcc00',errorForeground:'#f48771',focusBorder:'#f38518','widget-border':'#6fc3df'},
};
const step={title:'음수 가격을 합계에서 제외',file:'src/가격 계산.ts',line:3,before:'    result += price;',after:'    if (price >= 0) {\n      result += price;\n    }',reason:'0 이상의 가격만 합계에 포함하는지 조건을 확인합니다.',step:1,total:2,status:'untouched',message:'선택된 코드를 직접 바꿔 보세요.',canContinue:false};
const longStep={...step,title:'이해하기 어려웠던 코드의 동작을 한 줄씩 살펴보며 변경합니다',file:'src/아주 긴 한글 경로/중첩된 구성 요소/가격계산과예외처리를확인하는파일이름.ts',after:'const 결과 = 상품목록.filter(상품 => 상품.price >= 0).map(상품 => ({ ...상품, 합계: 상품.price * 상품.quantity }));\nreturn 결과;',reason:'긴 경로와 코드는 화면 밖으로 밀려나지 않아야 합니다. 제안 코드는 가로로 이동해 끝까지 읽을 수 있습니다.'};
const states={
  empty:{},
  connected:{connected:true,files:['src/가격 계산.ts','tests/가격 계산.test.ts'],model:'첫 번째 요청 전에 고르는 모델'},
  busy:{busy:true,phase:'수정안을 만드는 중',files:['src/가격 계산.ts']},
  error:{error:'연결할 수 없어요. 다시 시도해 주세요. 오류가 반복되면 연결 상태를 확인해 주세요.'},
  long:longStep,
  outside:{...longStep,status:'outside',message:'다른 부분도 바뀌었어요. 변경 내역을 확인하세요.'},
  delete:{...step,title:'디버그 출력 제거',before:'  console.log(result);',after:'',reason:'계산 중간값을 출력하던 디버그 코드를 제거합니다.',message:'',total:1},
  complete:{...step,status:'matched',canContinue:true,complete:true,step:2},
};
const report={startedAt:new Date().toISOString(),mode:'Chromium headless with isolated browser context and mocked VS Code host',limits:['No native VS Code window or OS keyboard/IME was used.','Composition events verify the JavaScript guard, not real Korean input-method behavior.','No live account, provider request, or source-file edit was performed.','Representative theme tokens and accessibility checks are not a full WCAG or screen-reader certification.'],browser:'',matrix:[],interactionChecks:[],errors:[]};
let browser,page;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:460,height:900},locale:'ko-KR',reducedMotion:'reduce',serviceWorkers:'block'});
  // Everything is local setContent HTML. Accidental network access fails closed.
  await context.route('**/*',route=>route.abort());
  page=await context.newPage();
  const accessibilitySession=await context.newCDPSession(page);
  const runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')runtimeErrors.push(message.text());});
  const update=async state=>page.evaluate(state=>window.dispatchEvent(new MessageEvent('message',{data:state})),state);
  const events=()=>page.evaluate(()=>window.__ttcHost.messages);
  const lastCommand=async()=> (await events()).at(-1)?.command;
  const fresh=async(mac=true)=>{await page.goto('about:blank');await page.setContent(html(mac));await page.waitForFunction(()=>window.__ttcHost?.messages.some(m=>m.command==='ready'));};
  const assertState=async(name,state)=>{
    const active=typeof state.file==='string';
    assert.equal(await page.locator('#home').isVisible(),!active,`${name}: home`);
    assert.equal(await page.locator('#guide').isVisible(),active,`${name}: guide`);
    if(active){
      assert.equal(await page.locator('#after').isVisible(),state.after!=='',`${name}: proposed code`);
      assert.equal(await page.locator('#delete-hint').isVisible(),state.after==='',`${name}: deletion hint`);
      assert.equal(await page.locator('#review').isVisible(),!!state.complete||state.status==='outside',`${name}: review access`);
      if(!state.complete)assert.equal(await page.locator('#next').isEnabled(),!!state.canContinue,`${name}: next state`);
    }
    if(state.error)assert.equal(await page.getByRole('alert').textContent(),state.error);
  };

  // Real rendering and accessibility-tree checks for every layout/state pair.
  for(const width of [300,460,720])for(const [theme,tokens]of Object.entries(themes)){
    await page.setViewportSize({width,height:900});await fresh();
    await page.evaluate(tokens=>{for(const [key,value]of Object.entries(tokens))document.documentElement.style.setProperty('--vscode-'+key,value);},tokens);
    for(const [name,state]of Object.entries(states)){
      await update(state);await assertState(name,state);await page.evaluate(()=>window.scrollTo(0,0));
      const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>({name:(b.getAttribute('aria-label')||b.textContent||'').trim(),left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right})),code:{width:document.querySelector('#after').clientWidth,scrollWidth:document.querySelector('#after').scrollWidth}}));
      assert.ok(metrics.scrollWidth<=width+1,`${theme}/${width}/${name}: outer horizontal overflow ${metrics.scrollWidth}`);
      for(const button of metrics.buttons){assert.ok(button.name,`${name}: unnamed visible button`);assert.ok(button.left>=-1&&button.right<=width+1,`${name}: button outside viewport: ${button.name}`);}
      const accessibilityTree=await accessibilitySession.send('Accessibility.getFullAXTree');
      const accessibleButtons=accessibilityTree.nodes.filter(node=>!node.ignored&&node.role?.value==='button');
      for(const button of accessibleButtons)assert.ok(button.name?.value?.trim(),`${name}: unnamed button in Chromium accessibility tree`);
      if(theme==='contrast'&&!state.file){
        const border=await page.locator('#generate').evaluate(button=>({color:getComputedStyle(button).borderTopColor,width:getComputedStyle(button).borderTopWidth}));
        assert.notEqual(border.color,'rgba(0, 0, 0, 0)');assert.notEqual(border.width,'0px');
      }
      const ax=await page.locator('body').ariaSnapshot();
      const stem=`${width}-${theme}-${name}`;
      await page.screenshot({path:path.join(output,stem+'.png'),fullPage:true});
      await writeFile(path.join(output,stem+'.aria.txt'),ax);
      report.matrix.push({width,theme,state:name,screenshot:stem+'.png',accessibility:stem+'.aria.txt',accessibleButtonCount:accessibleButtons.length,...metrics});
    }
  }

  // Commands are captured locally. None of these mocked messages starts an
  // account flow, VS Code command, network request, or source-file edit.
  for(const mac of [true,false]){
    await page.setViewportSize({width:460,height:900});await fresh(mac);await update({});
    assert.equal(await page.getByRole('button',{name:/수정안 만들기/}).isEnabled(),false);
    await page.getByRole('textbox',{name:'원하는 코드 변경'}).fill('  한글 요청: 음수 제외  ');
    await page.keyboard.press((mac?'Meta':'Control')+'+Enter');
    assert.deepEqual((await events()).at(-1),{command:'generate',intent:'한글 요청: 음수 제외'});
    const beforeComposition=(await events()).length;
    await page.evaluate(mac=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:mac,ctrlKey:!mac,isComposing:true,cancelable:true})),mac);
    assert.equal((await events()).length,beforeComposition,'IME composition Enter cannot submit');
    await update({busy:true,phase:'생성 중'});
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,cancelable:true})));
    assert.equal((await events()).length,beforeComposition,'IME composition Escape cannot cancel');
    await page.keyboard.press('Escape');assert.equal(await lastCommand(),'stop');
    await update({});
    await page.getByRole('textbox',{name:'원하는 코드 변경'}).focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'files');
    const focusStyle=await page.locator('#files').evaluate(button=>({width:getComputedStyle(button).outlineWidth,style:getComputedStyle(button).outlineStyle}));
    assert.notEqual(focusStyle.width,'0px');assert.notEqual(focusStyle.style,'none');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.id),'generate');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.id),'demo');
    await page.keyboard.press('Tab');await page.keyboard.press('Space');assert.equal(await page.locator('#other').evaluate(e=>e.open),true);
    for(const command of ['chooseFiles','demo','import','loadPending','mcpConfig','signIn']){
      await page.locator(`[data-command="${command}"]`).click();assert.equal(await lastCommand(),command);
    }
    await update({connected:true});await page.getByRole('button',{name:'모델 선택',exact:true}).click();assert.equal(await lastCommand(),'chooseModel');
    await page.locator('#account-options summary').click();
    for(const command of ['usage','signOut']){await page.locator(`[data-command="${command}"]`).click();assert.equal(await lastCommand(),command);}
    await update(step);await page.locator('#file').click();assert.equal(await lastCommand(),'focus');
    const blocked=(await events()).length;await page.keyboard.press((mac?'Meta':'Control')+'+Alt+Enter');assert.equal((await events()).length,blocked);
    await page.locator('#original summary').click();await update({...step,status:'editing',message:''});assert.equal(await page.locator('#original').evaluate(e=>e.open),true);
    await update({...step,status:'matched',message:'제안과 일치',canContinue:true});
    await page.evaluate(mac=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:mac,ctrlKey:!mac,altKey:true,isComposing:true,cancelable:true})),mac);
    assert.equal((await events()).length,blocked,'IME composition cannot approve a typing step');
    await page.keyboard.press((mac?'Meta':'Control')+'+Alt+Enter');assert.equal(await lastCommand(),'next');
    await page.locator('#next').click();await update({...step,status:'matched',canContinue:true,complete:true});
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'review','completion moves focus off the hidden next button');
    await page.locator('#review').click();assert.equal(await lastCommand(),'review');
    await update({...step,status:'outside',message:'다른 부분도 바뀌었어요.'});assert.equal(await page.locator('#review').isVisible(),true);assert.equal(await page.locator('#next').isEnabled(),false);
    await page.locator('#review').focus();await update({...step,status:'matched',canContinue:true});assert.equal(await page.evaluate(()=>document.activeElement?.id),'next');
    await update({...step,complete:true});await page.locator('#again').click();assert.equal(await lastCommand(),'stop');await update({});
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'intent');
    await update({error:'연결 오류'});assert.equal(await page.getByRole('alert').isVisible(),true);await update({});assert.equal(await page.getByRole('alert').isVisible(),false);
    assert.deepEqual([...new Set((await events()).map(event=>event.command).filter(command=>command!=='ready'))].sort(),[...PANEL_COMMANDS].sort(),'every production command was exercised');
    report.interactionChecks.push({platform:mac?'mac-shortcuts':'windows-linux-shortcuts',passed:['empty request','trimmed submit','busy cancellation','synthetic IME submit/cancel/next guard','Tab order and visible focus','disclosure keyboard opening','all home commands','first-request model','account commands','blocked and matched next','before disclosure persistence','completion focus','outside-review recovery','end-session focus','error recovery']});
  }
  // Long code must remain accessible via keyboard scrolling at the narrowest width.
  await page.setViewportSize({width:300,height:900});await fresh();await update(longStep);
  await page.locator('#after').focus();assert.equal(await page.evaluate(()=>document.activeElement?.id),'after','overflowing proposal code is focusable');
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('#after').scrollLeft>0);
  report.interactionChecks.push({passed:['keyboard horizontal scrolling of long code']});
  assert.deepEqual(runtimeErrors,[],'no JavaScript or CSP console errors');
  report.passed=true;
}catch(error){
  report.passed=false;report.errors.push(error instanceof Error?error.stack:String(error));process.exitCode=1;
  if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
}
finally{
  if(browser)await browser.close();report.finishedAt=new Date().toISOString();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,matrixCases:report.matrix.length,interactionGroups:report.interactionChecks.length,report:path.join(output,'report.json'),errors:report.errors},null,2));
}
