#!/usr/bin/env node
import readline from 'node:readline';
if(process.argv.includes('--version')){console.log('codex-cli 0.166.0');process.exit(0);}
if(process.argv.includes('proxy')&&!process.env.TTC_OBSERVER_SHARED)process.exit(1);
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const thread={id:'chat-one',name:'Existing Codex chat',cwd:process.cwd(),updatedAt:1,status:{type:process.env.TTC_OBSERVER_SHARED?'active':'notLoaded'}};
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.method==='initialized')continue;
 if(m.method==='initialize')send({id:m.id,result:{}});
 else if(m.method==='thread/list')send({id:m.id,result:{data:[thread],nextCursor:null}});
 else if(m.method==='thread/read')send({id:m.id,result:{thread:{...thread,id:m.params.threadId}}});
 else if(m.method==='thread/items/list'){
  if(m.params.cursor==='large-frame'){send({id:m.id,result:{data:[{type:'functionCallOutput',id:'large',output:'x'.repeat(17*1024*1024)}]}});continue;}
  // Traffic exceeding the old total response cap must not poison later frames.
  if(m.params.cursor==='traffic')for(let i=0;i<40;i++)send({method:'item/commandExecution/outputDelta',params:{delta:'x'.repeat(50000)}});
  send({id:m.id,result:{data:[...(process.env.TTC_OBSERVER_WORKTREE?[{type:'commandExecution',id:'cmd1',command:'git diff',cwd:process.env.TTC_OBSERVER_WORKTREE,status:'completed'}]:[]),{type:'agentMessage',id:'a1',text:'Read the existing work.'},{type:'reasoning',id:'r1',content:['not displayed']}],nextCursor:'older'}});
 }else if(m.method==='thread/turns/list')send({id:m.id,result:{data:[{id:'turn-one',status:'interrupted'}],nextCursor:null}});
 else if(m.method==='thread/loaded/list')send({id:m.id,result:{data:[]}});
 else send({id:m.id,error:{message:'Mutation forbidden'}});
}
