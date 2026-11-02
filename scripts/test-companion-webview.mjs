import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {companionHtml} from '../src/companion-view.ts';
const output='artifacts/companion-ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});let count=0;
const thread={id:'chat-one',title:'홈 추천과 New 구현 확인',cwd:'/projects/crispy-chatbot',runtime:'notLoaded',flags:[]};
const base={threads:[thread,{...thread,id:'chat-two',title:'API 응답 캐시 정리'}],selected:thread,mode:'history',loading:false,updatedAt:Date.now(),root:'/worktrees/home-recommendations',rootSource:'activity',roots:[],tree:{branch:'codex/home-recommendations',changeCount:2,changes:[{path:'services/home/probability_model.py',status:' M',conflict:false},{path:'tests/home/test_recommendations.py',status:'??',conflict:false}]},items:[{id:'u',kind:'user',text:'추천 순위가 실제 클릭과 이용에 맞게 바뀌는지 확인해 줘.'},{id:'a',kind:'assistant',text:'현재 추천 순위에 어떤 정보가 반영되는지 확인했습니다. 신규 작품의 최신순 정렬은 유지하면서 기존 추천의 계산 부분을 비교하고 있습니다.'},{id:'cmd',kind:'command',status:'completed',text:'관련 코드 확인',cwd:'/worktrees/home-recommendations'}],hunk:0};
const review={file:'services/home/probability_model.py',root:base.root,head:'abc123',hash:'review1',total:2,canPractice:true,kind:'modified',hunk:{before:'score = conversation_count\nreturn score\n',after:'score = paid_usage / max(impressions, 1)\nreturn score\n',oldLine:43,newLine:43,lines:2,hint:'score = paid_usage / max(impressions, 1)\nreturn score\n'}};
const themes={dark:{'foreground':'#ddd','sideBar-background':'#1e1e1e','input-background':'#292929','input-foreground':'#eee',descriptionForeground:'#aaa','widget-border':'#555','textCodeBlock-background':'#292929'},light:{foreground:'#333','sideBar-background':'#fff','input-background':'#fff','input-foreground':'#222',descriptionForeground:'#555','widget-border':'#ccc','textCodeBlock-background':'#f4f4f4'},contrast:{foreground:'#fff','sideBar-background':'#000','input-background':'#000','input-foreground':'#fff',descriptionForeground:'#fff','widget-border':'#fff','textCodeBlock-background':'#111',focusBorder:'#f38518'}};
const states={list:{...base,selected:undefined},activity:base,learning:{...base,review,reviewOpened:true,contextSource:'response',contextExcerpt:'기존 추천의 계산 부분을 비교하고 있습니다.'},newFile:{...base,review:{...review,canPractice:false,kind:'added'},reviewOpened:true},outside:{...base,editor:{file:'/other/source.ts',outside:true}},practice:{...base,review,reviewOpened:true,practice:'editing'},stale:{...base,review:{...review,stale:true},practice:'different'},disconnected:{...base,mode:'shared',selected:{...thread,runtime:'active'},error:'connection'},live:{...base,live:{event:'PreToolUse',at:Date.now(),cwd:base.root}}};
try{for(const korean of [true,false])for(const [theme,tokens]of Object.entries(themes))for(const width of [320,480,900])for(const [name,state]of Object.entries(states)){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const boot='<script nonce="qa">window.__messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.__messages.push(m)});</script>';
 await page.setContent(companionHtml('qa',korean).replace('<script nonce=',boot+'<script nonce='));
 await page.evaluate(tokens=>{for(const [k,v]of Object.entries(tokens))document.documentElement.style.setProperty('--vscode-'+k,v);},tokens);
 await page.evaluate(state=>window.dispatchEvent(new MessageEvent('message',{data:{companion:state}})),state);
 assert.deepEqual(errors,[],`${name} script errors`);assert.equal(await page.locator('#intent').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${theme}/${name} horizontal overflow`);
 if(name==='learning'){assert.equal(await page.locator('#changes').isVisible(),true);await page.locator('#primary-action').click();assert.equal(await page.evaluate(()=>window.__messages.at(-1).command),'practiceChange');}
 if(name==='stale'||name==='newFile')assert.notEqual(await page.locator('#primary-action').getAttribute('data-action'),'practiceChange');
 assert.equal(await page.locator('#file-list').count(),0);assert.equal(await page.locator('#before').count(),0);
 if(name==='learning')assert.ok((await page.locator('#primary-action').boundingBox()).y<650,'next action fits on screen');
 if(width===480&&theme==='dark'&&korean&&name==='learning')await page.screenshot({path:output+'/learning-ko.png',fullPage:true});
 if(width===320&&theme==='light'&&!korean&&name==='activity')await page.screenshot({path:output+'/activity-en.png',fullPage:true});
 count++;await page.close();
}await writeFile(output+'/report.json',JSON.stringify({checks:count,languages:['ko','en'],themes:Object.keys(themes),widths:[320,480,900],states:Object.keys(states)},null,2));console.log(`${count} companion webview states passed`);}finally{await browser.close();}
