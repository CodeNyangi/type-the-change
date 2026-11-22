import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import * as path from 'node:path';
import {reportSchema} from '../src/agent-inbox.js';
import {activityHtml} from '../src/activity-map.js';
import {agentTurnArgs, reviewPrompt} from '../src/agent-review.js';
import {parseThread} from '../src/local-threads.js';

const id = '12345678-1234-1234-1234-123456789abc';
const root = process.platform === 'win32' ? 'C:\\work\\project' : '/work/project';
const nextToRoot = root + '-other';
const jsonl = (...items: unknown[]) => items.map(item => JSON.stringify(item)).join('\n') + '\n';

test('Codex captures completed patches and the current agenda only in the requested workspace', () => {
  const meta = jsonl({type:'session_meta', payload:{id, cwd:root}});
  const event = (type: string, item?: unknown) => ({type:'event_msg', payload:{type,item}});
  const tail = jsonl(
    event('task_started'),
    event('item_completed', {type:'UserMessage', content:[{type:'text',text:'Review traversal\nprivate second line'}]}),
    event('item_completed', {type:'FileChange', status:'completed', changes:{
      'src/edit.ts':{type:'update',unified_diff:'unused private diff'},
      'src/new.ts':{type:'add'},
      '../unrelated.ts':{type:'add'},
      '.env.local':{type:'add'},
    }}),
    event('item_completed', {type:'FileChange', status:'failed', changes:{'failed.ts':{type:'update'}}}),
  );
  assert.equal(parseThread('codex',id,meta,tail,[nextToRoot],1),undefined);
  const thread = parseThread('codex',id,meta,tail,[root],1)!;
  assert.equal(thread.agenda,'Review traversal');
  assert.equal(thread.turn,'started');
  assert.deepEqual(thread.edits,[
    {file:'src/new.ts',kind:'add',pending:false}, {file:'src/edit.ts',kind:'edit',pending:false},
  ]);
});

test('Claude does not label a failed edit as completed and can show a pending request', () => {
  const msg = (type: string,content: unknown) => ({type,cwd:root,sessionId:id,message:{content}});
  const use = (id: string,file_path: string) => ({type:'tool_use',name:'Edit',id,input:{file_path}});
  const result = (tool_use_id: string,is_error?:boolean) => ({type:'tool_result',tool_use_id,is_error});
  const prefix = jsonl(msg('user','Simplify the loop'));
  const tail = prefix + jsonl(
    msg('assistant',[use('one','a.ts'),use('two','b.ts'),use('three','c.ts')]),
    msg('user',[result('one'),result('two',true)]),
  ) + '{partial';
  const parsed = parseThread('claude',id,prefix,tail,[root],9)!;
  assert.equal(parsed.agenda,'Simplify the loop');
  assert.deepEqual(parsed.edits,[{file:'c.ts',kind:'edit',pending:true},{file:'a.ts',kind:'edit',pending:false}]);
});

test('recorded reasons and excerpts require a matching public file reference', () => {
  const prefix=jsonl({type:'session_meta',payload:{id,cwd:root}});
  const item = (item:unknown) => ({type:'event_msg',payload:{type:'item_completed',item}});
  const patch='@@ -1,1 +1,1 @@\n-export const value=1;\n+export const value=2;\n';
  const tail=jsonl(
    item({type:'Reasoning',content:'`src/a.ts` private text'}),
    item({type:'AgentMessage',content:'I will change `src/b.ts` because the value is stale.'}),
    item({type:'FileChange',status:'completed',changes:{'src/a.ts':{type:'update',unified_diff:patch},'src/b.ts':{type:'update',unified_diff:patch}}}),
  );
  const parsed=parseThread('codex',id,prefix,tail,[root],10)!;
  assert.equal(parsed.edits.find(edit=>edit.file==='src/a.ts')?.reason,undefined);
  assert.equal(parsed.edits.find(edit=>edit.file==='src/a.ts')?.context,undefined);
  const edit=parsed.edits.find(edit=>edit.file==='src/b.ts')!;
  assert.match(edit.reason!,/because the value is stale/);
  assert.equal(edit.excerpt?.before.trim(),'export const value=1;');
  assert.equal(edit.excerpt?.after.trim(),'export const value=2;');
  const contextOnly = parseThread('codex',id,prefix,jsonl(item({type:'AgentMessage',content:'Remove the redundant tooltip.'}),
    item({type:'FileChange',status:'completed',changes:{'src/b.ts':{type:'update',unified_diff:patch}}})),[root],10)!.edits[0];
  assert.equal(contextOnly.reason,undefined);
  assert.equal(contextOnly.context,'Remove the redundant tooltip.');

});

test('a parent-directory session is visible only for the nested workspace it edited', () => {
  const parent = path.dirname(root);
  const meta = jsonl({type:'session_meta', payload:{id, cwd:parent}});
  const edit = jsonl({type:'event_msg',payload:{type:'item_completed',item:{type:'FileChange',status:'completed',
    changes:{[path.join(root,'seen.ts')]:{type:'update'},[path.join(nextToRoot,'hidden.ts')]:{type:'update'}}}}});
  assert.equal(parseThread('codex',id,meta,'',[root],2),undefined);
  const scoped = parseThread('codex',id,meta,edit,[root],2)!;
  assert.equal(scoped.cwd,root);
  assert.deepEqual(scoped.edits.map(item => item.file),['seen.ts']);
});

test('send arguments retain new or existing threads with the chosen model and never enable workspace write', () => {
  const codex = agentTurnArgs('codex',{root,threadId:id,model:'custom-model',effort:'medium'},'answer.txt');
  assert.deepEqual(codex.slice(-5),['--model','custom-model','resume',id,'-']);
  assert.ok(codex.includes('read-only'));
  assert.ok(codex.includes('model_reasoning_effort="medium"'));
  const economy = agentTurnArgs('codex',{root,model:'gpt-6-luna',effort:'low'},'answer.txt');
  const defaults = agentTurnArgs('codex',{root},'answer.txt');
  assert.ok(defaults.includes('gpt-6.2-sol'));
  assert.ok(defaults.includes('model_reasoning_effort="medium"'));
  assert.ok(economy.includes('gpt-6-luna'));
  assert.ok(economy.includes('model_reasoning_effort="low"'));
  assert.ok(!codex.includes('--ephemeral'));
  const claude = agentTurnArgs('claude',{root,model:'sonnet'},'answer.txt');
  assert.deepEqual(claude.slice(-2),['--model','sonnet']);
  assert.ok(claude.includes('plan'));
  assert.ok(!claude.includes('--effort'));
  assert.ok(!claude.includes('--safe-mode'));
  const modern = agentTurnArgs('claude',{root,threadId:id,effort:'high'},'answer.txt',{effort:true,safeMode:true});
  assert.deepEqual(modern.slice(-6),['--effort','high','--model','claude-opus-5-5','--resume',id]);
  assert.ok(!claude.includes('--no-session-persistence'));
  const prompt = reviewPrompt('src/edit.ts', 'x'.repeat(50_000), 'change here', 'why?', true, false);
  assert.ok(prompt.includes('[truncated]'));
  assert.ok(prompt.includes('why?'));
});

test('a Claude web explanation carries a bounded link and exact Git commit', () => {
  const report={summary:'Exclude rows already shown',impact:'The carousel only',risk:'Keep the full listing',verification:'Compare the Git diff',
    source:{url:'https://claude.ai/code/cshk_example-link',commit:'a'.repeat(40)},files:[{file:'src/home.ts',line:12,note:'Filter before ranking'}]};
  assert.ok(reportSchema.safeParse(report).success);
  assert.equal(reportSchema.safeParse({...report,source:{...report.source,url:'https://example.com/code/cshk_example-link'}}).success,false);
  assert.equal(reportSchema.safeParse({...report,source:{...report.source,commit:'HEAD'}}).success,false);
});

test('the activity map displays each agenda and dispatches only the chosen thread and file', () => {
  const messages: unknown[] = [];
  const dom = new JSDOM(activityHtml('test', false), {runScripts:'dangerously', beforeParse: win => {
    Object.assign(win,{acquireVsCodeApi:() => ({postMessage: (message: unknown) => messages.push(message)})});
  }});
  try {
    const data = {enabled:true,running:[{agent:'claude',agenda:'Check an invariant'}], threads:[
      {id,agent:'codex',title:'Pagination',agenda:'Change a boundary',turn:'started',
        edits:[{file:'<script>.ts',kind:'edit',pending:false}]},
    ]};
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
    const page = dom.window.document;
    assert.match(page.body.textContent!,/Change a boundary/);
    assert.match(page.body.textContent!,/Check an invariant/);
    assert.ok(page.body.textContent!.includes('<script>.ts'));
    const button = page.querySelector<HTMLButtonElement>('.files button')!;
    button.focus();
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
    assert.equal(page.activeElement?.textContent,'<script>.tsEdited');
    (page.activeElement as HTMLButtonElement).click();
    assert.equal(page.querySelector<HTMLDetailsElement>('.file-entry details')?.open,true);
    assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1))), {command:'evidence',agent:'codex',id,file:'<script>.ts'});
  } finally {dom.window.close();}
});
