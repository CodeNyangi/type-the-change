/** A plan proposes edits. This module never reads or writes workspace files. */
export interface Step {
  readonly file: string;
  readonly before: string;
  readonly after: string;
  readonly reason: string;
}

export interface Plan {
  readonly version: 1;
  readonly title: string;
  readonly intent: string;
  readonly steps: readonly Step[];
}

export interface ResolvedStep {
  readonly prefix: string;
  readonly suffix: string;
  readonly before: string;
  readonly after: string;
  /** UTF-16 offsets, matching VS Code's TextDocument.offsetAt convention. */
  readonly start: number;
  readonly end: number;
}

export interface StepInspection {
  readonly status: 'untouched' | 'editing' | 'matched' | 'outside';
  readonly current: string;
  /** Offset within current/after; -1 for a match or an invalidated range. */
  readonly firstDifference: number;
  /** Text agreement, not test coverage, time spent, or semantic correctness. */
  readonly progress: number;
}

const LIMITS = {
  planBytes: 256 * 1024,
  steps: 20,
  title: 120,
  intent: 4000,
  path: 512,
  code: 16_384,
  reason: 1000,
} as const;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unsupported fields.`);
  }
}

function boundedString(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.length === 0)) {
    fail(`${label} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${max} characters.`);
  }
  if (value.includes('\0')) fail(`${label} must not contain a null character.`);
  return value;
}

function prose(value: unknown, label: string, max: number): string {
  const result = boundedString(value, label, max);
  if (!result.trim()) fail(`${label} must not be blank.`);
  return result;
}

/** Only ordinary, portable workspace-relative paths are accepted. */
function safePath(value: unknown): string {
  const file = boundedString(value, 'Step file', LIMITS.path);
  if (file.trim() !== file || /[\\:\x00-\x1f\x7f]/u.test(file) || file.startsWith('/') || file.startsWith('~')) {
    fail('Step file must be a safe workspace-relative path.');
  }
  const parts = file.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part))) {
    fail('Step file must not contain empty or traversal path segments.');
  }
  if (parts.some(part => /^(?:\.git|\.hg|\.svn|\.ssh|\.aws|\.azure|\.gnupg|\.codex|\.type-the-change)$/iu.test(part)
    || /^\.env/iu.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    fail('Step file names a protected or unsupported path.');
  }
  const name = parts[parts.length - 1];
  if (/\.(?:pem|key|p12|pfx)$/iu.test(name)
    || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials(?:\.json)?|auth\.json|tokens?\.json|\.npmrc|\.netrc)$/iu.test(name)) {
    fail('Step file names a credential file.');
  }
  return file;
}

/** Shared lexical boundary for file reads; callers must additionally check real paths/symlinks. */
export function validateRelativePath(file: string): void {
  safePath(file);
}

function canonicalEol(value: string, label: string): string {
  if (/\r(?!\n)/u.test(value)) fail(`${label} uses unsupported carriage-return line endings.`);
  return value.replace(/\r\n/gu, '\n');
}

/** Parse model/imported data, including an optional single JSON code fence. */
export function parsePlan(text: string): Plan {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > LIMITS.planBytes) {
    fail('Plan exceeds the 256 KiB input limit.');
  }
  let source = text.trim();
  if (source.startsWith('```')) {
    const fenced = /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(source);
    if (!fenced) fail('Plan must contain only JSON or a single JSON code block.');
    source = fenced[1];
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    fail('Plan is not valid JSON.');
  }
  const data = record(input, 'Plan');
  exactKeys(data, ['version', 'title', 'intent', 'steps'], 'Plan');
  if (data.version !== 1) fail('Unsupported plan version. Expected version 1.');
  const title = prose(data.title, 'Plan title', LIMITS.title);
  const intent = prose(data.intent, 'Plan intent', LIMITS.intent);
  if (!Array.isArray(data.steps) || data.steps.length < 1 || data.steps.length > LIMITS.steps) {
    fail('Plan must contain between 1 and 20 steps.');
  }
  const steps: Step[] = data.steps.map((inputStep, index) => {
    const label = `Step ${index + 1}`;
    const step = record(inputStep, label);
    exactKeys(step, ['file', 'before', 'after', 'reason'], label);
    const file = safePath(step.file);
    const before = canonicalEol(boundedString(step.before, `${label} before`, LIMITS.code), label);
    const after = canonicalEol(boundedString(step.after, `${label} after`, LIMITS.code, true), label);
    if (before === after) fail(`${label} must propose an actual change.`);
    const reason = prose(step.reason, `${label} reason`, LIMITS.reason);
    return Object.freeze({ file, before, after, reason });
  });
  return Object.freeze({ version: 1, title, intent, steps: Object.freeze(steps) });
}

/** Resolve an exact, unique anchor in the current document, without changing it. */
export function resolveStep(fullText: string, step: Step): ResolvedStep {
  const hasCrLf = fullText.includes('\r\n');
  const hasBareLf = /(?<!\r)\n/u.test(fullText);
  canonicalEol(fullText, 'Document');
  if (hasCrLf && hasBareLf) fail('Document has mixed line endings. Normalize them before starting.');
  const eol = hasCrLf ? '\r\n' : '\n';
  const before = canonicalEol(step.before, 'Step before').replace(/\n/gu, eol);
  const after = canonicalEol(step.after, 'Step after').replace(/\n/gu, eol);
  if (!before) fail('Step before must include existing context.');
  if (before === after) fail('Step must propose an actual change.');
  const start = fullText.indexOf(before);
  if (start === -1) fail(`The proposed original text is no longer present in ${step.file}.`);
  if (fullText.indexOf(before, start + 1) !== -1) {
    fail(`The proposed original text occurs more than once in ${step.file}. Include more context.`);
  }
  const end = start + before.length;
  return Object.freeze({ prefix: fullText.slice(0, start), suffix: fullText.slice(end), before, after, start, end });
}

/** Compare the user's current edit. Changed surrounding text invalidates guidance. */
export function inspectStep(fullText: string, resolved: ResolvedStep): StepInspection {
  const { prefix, suffix, before, after } = resolved;
  if (fullText.length < prefix.length + suffix.length || !fullText.startsWith(prefix) || !fullText.endsWith(suffix)) {
    return { status: 'outside', current: '', firstDifference: -1, progress: 0 };
  }
  const current = fullText.slice(prefix.length, fullText.length - suffix.length);
  if (current === after) return { status: 'matched', current, firstDifference: -1, progress: 1 };
  let firstDifference = 0;
  while (firstDifference < current.length && firstDifference < after.length && current[firstDifference] === after[firstDifference]) {
    firstDifference += 1;
  }
  return {
    status: current === before ? 'untouched' : 'editing',
    current,
    firstDifference,
    progress: firstDifference / Math.max(current.length, after.length, 1),
  };
}

/** Preflight the complete plan on copies, so a later invalid step cannot surprise the user. */
export function validatePlanAgainstFiles(plan: Plan, files: Map<string, string>): void {
  const checked = parsePlan(JSON.stringify(plan));
  const virtualFiles = new Map(files);
  for (const [index, step] of checked.steps.entries()) {
    const text = virtualFiles.get(step.file);
    if (text === undefined) fail(`Step ${index + 1} references an unavailable file: ${step.file}.`);
    let resolved: ResolvedStep;
    try {
      resolved = resolveStep(text, step);
    } catch (error) {
      fail(`Step ${index + 1}: ${error instanceof Error ? error.message : 'Invalid original text.'}`);
    }
    virtualFiles.set(step.file, resolved.prefix + resolved.after + resolved.suffix);
  }
}
