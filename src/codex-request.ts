import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
export class RequestError extends Error {
 constructor(readonly code:'unsupported'|'failed'|'uncertain'){super(code);}
}
/** A user-initiated message to the original Codex owner. No new chat,
 * app-server, model selection, credentials, tools or approval handling. */
export async function queueExplanation(command:string,threadId:string,message:string,run=execute){
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threadId))throw new RequestError('failed');
 try{
  await run(command,['queue','--thread',threadId,'--message',message,'--resume'],{timeout:30000,maxBuffer:32768,windowsHide:true});
 }catch(error:any){
  // A timed-out command may already have enqueued the message. Never retry it
  // automatically or report that nothing was sent.
  if(error.killed||error.code==='ETIMEDOUT')throw new RequestError('uncertain');
  if(/unrecognized subcommand|unexpected argument|unknown command/i.test(String(error.stderr||'')))throw new RequestError('unsupported');
  throw new RequestError('failed');
 }
}
