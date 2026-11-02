#!/usr/bin/env node
import readline from 'node:readline';
if(process.argv.includes('--version')){console.log('codex-cli 0.166.0');process.exit(0);}
if(process.argv[2]==='queue'){process.stderr.write("unrecognized subcommand 'queue'\n");process.exit(2);}
if(process.argv.includes('proxy')&&!process.env.TTC_OBSERVER_SHARED)process.exit(1);
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const thread={id:process.env.TTC_OBSERVER_THREAD_ID||'chat-one',name:'Existing Codex chat',cwd:process.cwd(),updatedAt:1,status:{type:process.env.TTC_OBSERVER_SHARED?'active':'notLoaded'}};
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.method==='initialized')continue;
 if(m.method==='initialize')send({id:m.id,result:{}});
 else if(m.method==='thread/list')send({id:m.id,result:{data:[thread],nextCursor:null}});
 else if(m.method==='thread/read')send({id:m.id,result:{thread:{...thread,id:m.params.threadId}}});
 else if(m.method==='thread/items/list'){
  if(m.params.cursor==='large-frame'){send({id:m.id,result:{data:[{type:'functionCallOutput',id:'large',output:'x'.repeat(17*1024*1024)}]}});continue;}
  // Traffic exceeding the old total response cap must not poison later frames.
  if(m.params.cursor==='traffic')for(let i=0;i<40;i++)send({method:'item/commandExecution/outputDelta',params:{delta:'x'.repeat(50000)}});
  const root=process.env.TTC_OBSERVER_WORKTREE;
  const lesson=root?{version:1,title:'값이 어디에서 결정될까요?',question:'이 변경 후 value를 읽으면 어떤 값인가요?',choices:[{id:'one',text:'1'},{id:'two',text:'2'}],answer:'two',explanation:'내보내는 상수가 1에서 2로 바뀌었습니다.',source:{file:'source.ts',worktree:root,before:'export const value = 1;\n',after:'export const value = 2;\n'}}:undefined;
  send({id:m.id,result:{data:[...(root?[{type:'agentMessage',id:'lesson-one',text:'```ttc-lesson\n'+JSON.stringify(lesson)+'\n```'},{type:'fileChange',id:'fixture-edit',changes:[{path:root+'/source.ts',diff:'@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n'}]},{type:'commandExecution',id:'cmd1',command:'git diff',cwd:root,status:'completed'}]:[]),{type:'agentMessage',id:'a1',text:'Read the existing work.'},{type:'reasoning',id:'r1',content:['not displayed']}],nextCursor:'older'}});
 }else if(m.method==='thread/turns/list')send({id:m.id,result:{data:[{id:'turn-one',status:'interrupted'}],nextCursor:null}});
 else if(m.method==='thread/loaded/list')send({id:m.id,result:{data:[]}});
 else send({id:m.id,error:{message:'Mutation forbidden'}});
}
