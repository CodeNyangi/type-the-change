#!/usr/bin/env node
import readline from 'node:readline';
if(process.argv.includes('--version')){console.log('codex-cli 0.166.0');process.exit(0);}
const scenario=process.env.TTC_CODEX_FIXTURE||'normal';
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const event=(method,params)=>send({method,params});
let loggedIn=scenario!=='signed-out',thread=0,turn=0,active,toolId=9000;
const sourcePlan={version:1,title:'상수 변경으로 배우기',intent:'Change the value',steps:[{file:'source.ts',before:'export const value = 1;',after:'export const value = 2;',reason:'반환값이 바뀌는 지점을 확인하세요.'}]};
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line),p=m.params||{};
 if(m.id>=9000&&m.result){
  if(active){event('item/completed',{threadId:active.thread,turnId:active.turn,item:{type:'agentMessage',id:'answer',text:m.result.success?'변경 지점을 준비했습니다.':'제안을 확인하지 못했습니다.'}});event('turn/completed',{threadId:active.thread,turn:{id:active.turn,status:'completed'}});active=undefined;}
  continue;
 }
 if(m.method==='initialize')send({id:m.id,result:{userAgent:'test-codex'}});
 else if(m.method==='initialized'){}
 else if(m.method==='account/read')send({id:m.id,result:{account:loggedIn?{type:'chatgpt'}:null,requiresOpenaiAuth:true}});
 else if(m.method==='account/login/start'){
  send({id:m.id,result:{type:'chatgpt',loginId:'login-1',authUrl:'https://auth.openai.com/authorize?fixture=1'}});
  if(scenario!=='login-wait')setTimeout(()=>{loggedIn=true;event('account/login/completed',{loginId:'login-1',success:true});},30);
 }else if(m.method==='account/login/cancel')send({id:m.id,result:{status:'cancelled'}});
 else if(m.method==='model/list')send({id:m.id,result:{data:[{model:'test-model',displayName:'Test model',hidden:false,isDefault:true}],nextCursor:null}});
 else if(m.method==='thread/start'){
  if(p.sandbox!=='read-only'||p.approvalPolicy!=='never'||p.dynamicTools?.[0]?.name!=='prepare_typing_plan')send({id:m.id,error:{code:-32602,message:'Read-only learning thread required'}});
  else send({id:m.id,result:{thread:{id:'fixture-thread-'+(++thread)}}});
 }else if(m.method==='thread/resume'){
  if(p.sandbox!=='read-only'||p.approvalPolicy!=='never'||!p.excludeTurns)send({id:m.id,error:{code:-32602,message:'Read-only resume required'}});
  else send({id:m.id,result:{thread:{id:p.threadId}}});
 }else if(m.method==='turn/start'){
  const text=p.input[0].text;active={thread:p.threadId,turn:'turn-'+(++turn)};
  event('turn/started',{threadId:active.thread,turn:{id:active.turn}});
  event('item/agentMessage/delta',{threadId:active.thread,turnId:active.turn,itemId:'answer',delta:'먼저 관련 코드를 살펴보겠습니다.'});
  // Exercise notification-before-RPC-response ordering.
  send({id:m.id,result:{turn:{id:active.turn,status:'inProgress'}}});
  if(text.includes('HANG'))continue;
  if(text.includes('FAIL')){event('turn/completed',{threadId:active.thread,turn:{id:active.turn,status:'failed',error:{codexErrorInfo:'usageLimitExceeded',message:'hidden provider text'}}});continue;}
  if(text.includes('LARGE'))for(let i=0;i<1500;i++)event('item/reasoning/textDelta',{threadId:active.thread,turnId:active.turn,delta:'metadata'.repeat(150)});
  if(text.includes('LEARN')){await new Promise(resolve=>setTimeout(resolve,100));send({id:toolId++,method:'item/tool/call',params:{threadId:active.thread,turnId:active.turn,callId:'proposal',tool:'prepare_typing_plan',arguments:sourcePlan}});}
  else{event('item/completed',{threadId:active.thread,turnId:active.turn,item:{type:'agentMessage',id:'answer',text:'source.ts:1의 값을 확인하세요.'}});event('turn/completed',{threadId:active.thread,turn:{id:active.turn,status:'completed'}});active=undefined;}
 }else if(m.method==='turn/interrupt'){send({id:m.id,result:{}});if(active)event('turn/completed',{threadId:active.thread,turn:{id:active.turn,status:'interrupted'}});active=undefined;}
 else send({id:m.id,error:{code:-32601,message:'unsupported'}});
}
