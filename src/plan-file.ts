import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

export const MAX_PLAN_FILE_BYTES = 256 * 1024;

export class PlanFileError extends Error {
  constructor(readonly code: 'not_regular_file' | 'too_large' | 'invalid_text' | 'unavailable') {
    super({
      not_regular_file: '일반 로컬 파일로 저장된 수정안을 선택하세요.',
      too_large: '수정안 파일은 256 KiB 이하여야 해요.',
      invalid_text: 'UTF-8 텍스트로 저장된 수정안을 선택하세요.',
      unavailable: '수정안 파일을 읽을 수 없어요.',
    }[code]);
    this.name = 'PlanFileError';
  }
}

/** A selected import may be outside the workspace, but never needs an unbounded read. */
export async function readPlanFile(file: string): Promise<string> {
  try {
    if (!(await lstat(file)).isFile()) throw new PlanFileError('not_regular_file');
    // No-follow and nonblocking open also cover replacement by a link or FIFO
    // between lstat and open. Recheck the opened object, not only its path.
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new PlanFileError('not_regular_file');
      if (stat.size > MAX_PLAN_FILE_BYTES) throw new PlanFileError('too_large');
      // A file can grow after stat. One sentinel byte detects overflow while
      // putting a hard bound on both allocation and the total bytes read.
      const bytes = Buffer.alloc(MAX_PLAN_FILE_BYTES + 1);
      let total = 0;
      while (total < bytes.length) {
        const { bytesRead } = await handle.read(bytes, total, bytes.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > MAX_PLAN_FILE_BYTES) throw new PlanFileError('too_large');
      try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, total)); }
      catch { throw new PlanFileError('invalid_text'); }
    } finally { await handle.close(); }
  } catch (error) {
    if (error instanceof PlanFileError) throw error;
    if ((error as NodeJS.ErrnoException)?.code === 'ELOOP') throw new PlanFileError('not_regular_file');
    throw new PlanFileError('unavailable');
  }
}
