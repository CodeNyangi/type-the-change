import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inspectStep, parsePlan, resolveStep, validatePlanAgainstFiles, validateRelativePath, type Plan, type Step } from '../src/plan.js';

const step: Step = { file: 'src/math.ts', before: 'return a - b;', after: 'return a + b;', reason: 'Add rather than subtract.' };
const makePlan = (changes: Partial<Plan> = {}): Plan => ({ version: 1, title: 'Fix addition', intent: 'Return the sum.', steps: [step], ...changes });
const parse = (value: unknown) => parsePlan(JSON.stringify(value));

test('accepts JSON and a single JSON fence, preserving code whitespace and Unicode', () => {
  const value = makePlan({ steps: [{ ...step, before: '\tconst 이름 = "🐈";\n', after: '\tconst 이름 = "사이";\n' }] });
  const parsed = parsePlan('```json\n' + JSON.stringify(value) + '\n```');
  assert.deepEqual(parsed, value);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.steps[0]));
  assert.throws(() => parsePlan('Here is your plan:\n' + JSON.stringify(value)), /JSON/);
  assert.throws(() => parsePlan('```json\n' + JSON.stringify(value) + '\n```\nDo this too.'), /JSON/);
});

test('rejects malformed shapes, empty intent, unknown fields and changes that do nothing', () => {
  for (const value of [null, [], {}, { ...makePlan(), version: 2 }, { ...makePlan(), title: ' ' },
    { ...makePlan(), intent: '' }, { ...makePlan(), execute: 'shell command' },
    { ...makePlan(), steps: [] }, { ...makePlan(), steps: [{ ...step, before: '' }] },
    { ...makePlan(), steps: [{ ...step, after: step.before }] },
    { ...makePlan(), steps: [{ ...step, reason: null }] },
    { ...makePlan(), steps: [{ ...step, command: 'run' }] },
    { ...makePlan(), steps: [{ ...step, before: 'a\r\nb', after: 'a\nb' }] }]) {
    assert.throws(() => parse(value));
  }
});

test('rejects unsafe paths, credential files, control characters and encoded ambiguity', () => {
  const paths = ['/tmp/source.ts', 'C:/source.ts', 'C:\\source.ts', '\\\\host\\share', 'file:///tmp/a',
    '../a', 'src/../../a', './a', 'src//a', 'src/./a', '~/a', 'src/a/', ' src/a', 'src/a ',
    '.git/config', 'src/.GIT/config', '.env', '.env.local', 'src/.ENV.production', '.ssh/config',
    '.aws/credentials', '.type-the-change/plan.json', '.codex/config.toml', '.environment', 'auth.json', 'tokens.json',
    'cert.pem', 'private.key', 'id_ed25519', '.npmrc', 'src/a\0.ts',
    'src/a\n.ts', 'src/con.txt', 'src/NUL', 'src/name./file'];
  for (const file of paths) assert.throws(() => parse(makePlan({ steps: [{ ...step, file }] })), Error, file);
  assert.doesNotThrow(() => parse(makePlan({ steps: [{ ...step, file: 'src/한글 이름.ts' }] })));
  assert.doesNotThrow(() => parse(makePlan({ steps: [{ ...step, file: '.github/workflows/test.yml' }] })));
  assert.doesNotThrow(() => parse(makePlan({ steps: [{ ...step, file: '.gitignore' }] })));
  assert.throws(() => validateRelativePath('../outside.ts'), /path/);
  assert.doesNotThrow(() => validateRelativePath('src/auth.ts'));
});

test('rejects nulls and oversized plans before processing a model response', () => {
  assert.throws(() => parse(makePlan({ steps: [{ ...step, after: 'a\0b' }] })), /null/);
  assert.throws(() => parse(makePlan({ steps: Array.from({ length: 21 }, () => step) })), /20/);
  assert.throws(() => parse(makePlan({ steps: [{ ...step, after: 'x'.repeat(16_385) }] })), /16384/);
  assert.throws(() => parsePlan(' '.repeat(256 * 1024 + 1)), /256 KiB/);
  assert.throws(() => parsePlan('🐈'.repeat(70_000)), /256 KiB/);
});

test('resolves only one exact anchor, including overlapping duplicate anchors', () => {
  const original = 'function add(a, b) {\n  return a - b;\n}\n';
  const resolved = resolveStep(original, step);
  assert.equal(resolved.start, original.indexOf(step.before));
  assert.equal(resolved.end, resolved.start + step.before.length);
  assert.equal(resolved.prefix + resolved.before + resolved.suffix, original);
  assert.throws(() => resolveStep('return a * b;', step), /no longer present/);
  assert.throws(() => resolveStep(step.before + '\n' + step.before, step), /more than once/);
  assert.throws(() => resolveStep('aaa', { ...step, before: 'aa', after: 'bb' }), /more than once/);
});

test('inspection distinguishes untouched, partial, wrong, and complete text without trimming', () => {
  const original = 'prefix\n' + step.before + '\nsuffix';
  const resolved = resolveStep(original, step);
  assert.equal(inspectStep(original, resolved).status, 'untouched');
  const partial = inspectStep(resolved.prefix + 'return a +' + resolved.suffix, resolved);
  assert.equal(partial.status, 'editing');
  assert.equal(partial.firstDifference, 10);
  assert.ok(partial.progress > 0 && partial.progress < 1);
  assert.equal(inspectStep(resolved.prefix + step.after + resolved.suffix, resolved).status, 'matched');
  const extra = inspectStep(resolved.prefix + step.after + ' ' + resolved.suffix, resolved);
  assert.equal(extra.status, 'editing');
  assert.ok(extra.progress < 1);
  assert.equal(inspectStep(resolved.prefix + 'return a+b;' + resolved.suffix, resolved).status, 'editing');
});

test('edits outside the active range invalidate the comparison and never appear as completion', () => {
  const original = 'const prefix = 1;\n' + step.before + '\nconst suffix = 2;';
  const resolved = resolveStep(original, step);
  for (const text of ['changed\n' + step.after + resolved.suffix,
    resolved.prefix + step.after + '\nchanged', '', resolved.prefix.slice(1) + step.after + resolved.suffix]) {
    assert.deepEqual(inspectStep(text, resolved), { status: 'outside', current: '', firstDifference: -1, progress: 0 });
  }
  // Restoring surrounding text restores the comparison without rewriting anything.
  assert.equal(inspectStep(resolved.prefix + step.after + resolved.suffix, resolved).status, 'matched');
});

test('deletion, file-boundary replacement, and UTF-16 positions work without invented content', () => {
  const deletion = resolveStep('remove\nkeep', { ...step, before: 'remove\n', after: '' });
  assert.equal(inspectStep('keep', deletion).status, 'matched');
  assert.equal(inspectStep('remove\nkeep', deletion).status, 'untouched');
  const whole = resolveStep('old', { ...step, before: 'old', after: 'new' });
  assert.equal(inspectStep('new', whole).status, 'matched');
  const unicode = resolveStep('🐈\n기존', { ...step, before: '기존', after: '변경' });
  assert.equal(unicode.start, 3);
  assert.equal(inspectStep('🐈\n변경', unicode).status, 'matched');
});

test('LF plans preserve CRLF files and mixed or lone-CR endings fail explicitly', () => {
  const crlfStep = { ...step, before: 'function f() {\n  return 1;\n}', after: 'function f() {\n  return 2;\n}' };
  const original = '// keep\r\nfunction f() {\r\n  return 1;\r\n}\r\n';
  const resolved = resolveStep(original, crlfStep);
  assert.equal(resolved.after, crlfStep.after.replace(/\n/g, '\r\n'));
  assert.equal(inspectStep(resolved.prefix + resolved.after + resolved.suffix, resolved).status, 'matched');
  assert.equal(inspectStep(resolved.prefix + crlfStep.after + resolved.suffix, resolved).status, 'editing');
  assert.throws(() => resolveStep('// keep\nfunction f() {\r\n  return 1;\r\n}\r\n', crlfStep), /mixed/);
  assert.throws(() => resolveStep('a\rb', { ...step, before: 'a', after: 'b' }), /carriage-return/);
});

test('preflight simulates sequential changes and leaves input files untouched', () => {
  const files = new Map([['src/math.ts', 'return a - b;'], ['src/name.ts', 'const name = "old";']]);
  const initial = new Map(files);
  const plan = makePlan({ steps: [step,
    { ...step, before: step.after, after: 'return Number(a) + Number(b);' },
    { file: 'src/name.ts', before: '"old"', after: '"new"', reason: 'Rename.' }] });
  validatePlanAgainstFiles(plan, files);
  assert.deepEqual(files, initial);
  assert.throws(() => validatePlanAgainstFiles(makePlan({ steps: [step, step] }), files), /Step 2/);
  assert.throws(() => validatePlanAgainstFiles(plan, new Map()), /unavailable file/);
  assert.throws(() => validatePlanAgainstFiles(makePlan({ steps: [{ ...step, file: '../outside.ts' }] }), files), /path/);
});
