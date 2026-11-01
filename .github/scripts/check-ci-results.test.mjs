import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-ci-results.mjs', import.meta.url));

function runGate(needs, requiredJobs = ['check']) {
  const env = { ...process.env };
  delete env.NEEDS;
  if (needs !== undefined) env.NEEDS = needs;
  const result = spawnSync(process.execPath, [script, ...requiredJobs], {
    env,
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test('accepts explicit success, including multiple successful dependencies', () => {
  assert.equal(runGate('{"check":{"result":"success"}}').status, 0);
  assert.equal(runGate('{"check":{"result":"success"},"other":{"result":"success"}}', ['check', 'other']).status, 0);
});

for (const result of ['failure', 'cancelled', 'skipped', 'pending', 'neutral', '', true, null]) {
  test(`rejects a dependency result of ${JSON.stringify(result)}`, () => {
    const gate = runGate(JSON.stringify({ check: { result } }));
    assert.equal(gate.status, 1);
    assert.match(gate.stderr, /CI job did not succeed: check/);
  });
}

for (const [description, needs] of [
  ['missing environment', undefined],
  ['empty environment', ''],
  ['malformed JSON', '{'],
  ['null', 'null'],
  ['array', '[]'],
  ['string', '"success"'],
  ['empty results', '{}'],
  ['missing expected job', '{"other":{"result":"success"}}'],
  ['missing result', '{"check":{}}'],
  ['null job', '{"check":null}'],
  ['array job', '{"check":[]}'],
  ['string job', '{"check":"success"}'],
]) {
  test(`fails closed for ${description}`, () => {
    const gate = runGate(needs);
    assert.equal(gate.status, 1);
    assert.ok(gate.stderr.trim(), 'prints a useful failure message');
  });
}

test('rejects a non-successful extra dependency', () => {
  const gate = runGate('{"check":{"result":"success"},"other":{"result":"skipped"}}');
  assert.equal(gate.status, 1);
  assert.match(gate.stderr, /CI job did not succeed: other/);
});

test('rejects missing required job configuration even with successful results', () => {
  const gate = runGate('{"check":{"result":"success"}}', []);
  assert.equal(gate.status, 1);
  assert.match(gate.stderr, /No required CI jobs were specified/);
});
