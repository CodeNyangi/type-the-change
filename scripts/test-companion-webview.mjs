import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {companionHtml} from '../src/companion-view.ts';
const output='artifacts/lesson-ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});let count=0;
const thread={id:'chat-one',title:'로컬라이재이션 대응',cwd:'/projects/example'};
const base={threads:[thread,{id:'chat-two',title:'홈 추천 개선',cwd:thread.cwd}],selected:thread,projectPaths:[thread.cwd],loading:false};
const card={version:1,title:'번역하면 오류 종류도 바뀔까요?',question:'같은 오류 문구를 영어로 바꾸면 이 조건은 어떻게 될까요?',choices:[{id:'a',text:'한글을 찾지 못해 404 분기가 실행되지 않을 수 있다'},{id:'b',text:'오류는 같으니 언제나 404로 처리된다'}],answer:'a',explanation:'기존 코드는 오류의 종류가 아니라 한국어 문장을 찾습니다. 상태 코드를 별도로 보관하면 문구를 번역해도 같은 오류를 같은 상태로 처리할 수 있습니다.',source:{file:'handlers/conversation_handler.py',before:'detail = str(exc)\nif "찾을 수 없" in detail:\n    status = 404',after:'status = exception_status(exc)'}};
const lesson={id:'one',messageId:'a',root:thread.cwd,file:card.source.file,editId:'e',card};
const states={...Object.fromEntries(['sending','queued','unsupported','failed','uncertain'].map(lessonRequest=>[lessonRequest,{...base,lessonRequest}])),list:{...base,selected:undefined},missing:base,checking:{...base,lessonStatus:'checking'},unverified:{...base,lessonStatus:'unverified'},card:{...base,lesson},priorCodeOpen:{...base,lesson},disconnected:{...base,error:'connection'},garbage:{...base,items:[{kind:'assistant',text:'Restart VS Code.'}],review:{file:'test-host/real-companion.ts'},reviewContext:{response:'Restart VS Code.'}},newCode:{...base,lesson:{...lesson,card:{...card,source:{...card.source,before:''}}}}};
const themes={dark:{foreground:'#ddd','sideBar-background':'#1e1e1e','input-background':'#292929','descriptionForeground':'#aaa','widget-border':'#555','textCodeBlock-background':'#292929'},light:{foreground:'#333','sideBar-background':'#fff','input-background':'#fff','descriptionForeground':'#666','widget-border':'#ccc','textCodeBlock-background':'#f5f5f5'},contrast:{foreground:'#fff','sideBar-background':'#000','input-background':'#000','descriptionForeground':'#fff','widget-border':'#fff','textCodeBlock-background':'#111','focusBorder':'#f38518'}};
try{for(const korean of [true,false])for(const [theme,tokens]of Object.entries(themes))for(const width of [320,480,900])for(const [name,state]of Object.entries(states)){
 const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const boot='<script nonce="qa">window.__messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.__messages.push(m)});</script>';
 await page.setContent(companionHtml('qa',korean).replace('<script nonce=',boot+'<script nonce='));
 await page.evaluate(tokens=>{for(const [key,value]of Object.entries(tokens))document.documentElement.style.setProperty('--vscode-'+key,value);},tokens);
 await page.evaluate(state=>window.dispatchEvent(new MessageEvent('message',{data:{companion:state}})),state);
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${theme}/${width}/${name}`);
 assert.equal(await page.locator('#activity-list, #recorded-list, #review-prompt, #changes-tab').count(),0);
 if(name==='card'||name==='priorCodeOpen'){
  assert.equal(await page.locator('#lesson').isVisible(),true);assert.equal(await page.locator('#explanation').innerText(),card.explanation);
  assert.equal(await page.locator('#choices,#question,#answer,#reveal').count(),0);
  assert.ok((await page.locator('#explanation').boundingBox()).y<180,'the reason is visible immediately');
  assert.ok(await page.locator('#after').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'code wraps within the panel');
  if(name==='priorCodeOpen')await page.locator('#before-details > summary').click();
 }
 if(name==='missing'){await page.locator('#prepare').click();assert.equal(await page.evaluate(()=>window.__messages.at(-1).command),'prepareLesson');}
 if(name==='garbage'){assert.equal(await page.getByText('Restart VS Code.',{exact:true}).count(),0);assert.equal(await page.locator('#lesson').isVisible(),false);}
 if(korean&&width===480&&theme==='light'&&['card','priorCodeOpen','missing'].includes(name))await page.screenshot({path:output+'/'+name+'-ko.png',fullPage:true});
 count++;await page.close();
}await writeFile(output+'/report.json',JSON.stringify({checks:count,languages:['ko','en'],themes:Object.keys(themes),widths:[320,480,900],states:Object.keys(states)},null,2)+'\n');console.log(`${count} lesson webview states passed`);}finally{await browser.close();}
