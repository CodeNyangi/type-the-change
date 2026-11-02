/** Human review records. Neither text agreement nor these notes grade understanding. */
export type Decision = 'keep' | 'reject' | 'defer';
export interface Judgment {
  phase: 'predict' | 'edit' | 'review' | 'done';
  prediction: string;
  evidence: string;
  reviewedHash?: string;
  decision?: Decision;
}
export function newJudgment(): Judgment {return {phase:'predict',prediction:'',evidence:''};}
export function shortNote(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value.length>280||value.includes('\0'))throw Error('한 줄로 적어 주세요. (최대 280자)');
  return value.trim();
}
export function predict(judgment:Judgment,value:unknown):void {
  if(judgment.phase!=='predict')return;
  judgment.prediction=shortNote(value);judgment.phase='edit';
}
export function beginReview(judgment:Judgment,hash:string):void {
  if(!judgment.prediction)throw Error('먼저 바뀔 결과를 한 줄로 예상해 보세요.');
  judgment.phase='review';judgment.reviewedHash=hash;judgment.evidence='';delete judgment.decision;
}
export function decide(judgment:Judgment,hash:string,decision:unknown,evidence:unknown):void {
  if(decision!=='keep'&&decision!=='reject'&&decision!=='defer')throw Error('유지, 거절, 보류 중 하나를 선택하세요.');
  if(judgment.phase!=='review'||judgment.reviewedHash!==hash)throw Error('코드가 바뀌었어요. 다시 비교한 뒤 판단해 주세요.');
  judgment.evidence=decision==='defer'&&evidence===''?'':shortNote(evidence);
  judgment.decision=decision;judgment.phase='done';
}
export function invalidateJudgment(judgment:Judgment,hash:string):boolean {
  if(judgment.reviewedHash&&judgment.reviewedHash!==hash){
    judgment.phase='edit';judgment.evidence='';delete judgment.reviewedHash;delete judgment.decision;return true;
  }
  return false;
}
