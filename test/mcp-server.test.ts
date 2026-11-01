import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createTypingMcpServer, parseWorkspaceArgument } from '../src/mcp-server.js';
import { writeBridgeFile } from '../src/workspace-files.js';

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'type-change-mcp-'));
  await writeFile(join(root, 'example.ts'), 'export const answer = 41;\n');
  const server = createTypingMcpServer(root);
  const client = new Client({ name: 'type-change-test', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); await rm(root, { recursive: true, force: true }); });
  return { root, client };
}

function data(result: { structuredContent?: unknown }): Record<string, unknown> {
  assert.ok(result.structuredContent && typeof result.structuredContent === 'object' && !Array.isArray(result.structuredContent));
  return result.structuredContent as Record<string, unknown>;
}

const plan = {
  version: 1, title: 'Correct the answer', intent: 'Return the expected constant.',
  steps: [{ file: 'example.ts', before: 'answer = 41', after: 'answer = 42', reason: 'Use the expected value.' }],
};

test('MCP advertises bounded read and proposal tools with truthful annotations', async t => {
  const { client } = await setup(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_typing_status', 'propose_typing_plan', 'read_file']);
  assert.equal(tools.find(tool => tool.name === 'read_file')?.annotations?.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'propose_typing_plan')?.annotations?.readOnlyHint, false);
  const result = await client.callTool({ name: 'read_file', arguments: { file: 'example.ts' } });
  assert.equal(result.isError, undefined);
  assert.equal(data(result).text, 'export const answer = 41;\n');
  assert.equal(data(result).source, 'saved_file');
  assert.match(String(data(result).sha256), /^[a-f0-9]{64}$/);
});

test('MCP proposal writes guidance only; wrong anchors cannot replace the pending plan', async t => {
  const { root, client } = await setup(t);
  const submitted = await client.callTool({ name: 'propose_typing_plan', arguments: { plan } });
  assert.equal(submitted.isError, undefined);
  assert.equal(data(submitted).status, 'proposed');
  assert.equal(data(submitted).sourceFilesChanged, false);
  const pending = await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8');
  assert.deepEqual(JSON.parse(pending), plan);
  assert.equal(await readFile(join(root, 'example.ts'), 'utf8'), 'export const answer = 41;\n');
  const rejected = await client.callTool({ name: 'propose_typing_plan', arguments: { plan: { ...plan, steps: [{ ...plan.steps[0], before: 'does not exist' }] } } });
  assert.equal(rejected.isError, true);
  assert.equal(data(rejected).reason, 'source_does_not_match');
  assert.equal(await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8'), pending);
});

test('MCP rejects a proposal that would grow beyond the readable file limit without replacing pending guidance', async t => {
  const { root, client } = await setup(t);
  await client.callTool({ name: 'propose_typing_plan', arguments: { plan } });
  const pending = await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8');
  const original = 'x'.repeat(65_530) + 'a';
  await writeFile(join(root, 'large.ts'), original);
  const oversized = { ...plan, steps: [{ file: 'large.ts', before: 'a', after: '가나!', reason: 'Expand the label.' }] };
  const rejected = await client.callTool({ name: 'propose_typing_plan', arguments: { plan: oversized } });
  assert.equal(rejected.isError, true);
  assert.equal(await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8'), pending);
  assert.equal(await readFile(join(root, 'large.ts'), 'utf8'), original);
});

test('MCP rejects distinct paths for the same physical source before replacing pending guidance', async t => {
  const { root, client } = await setup(t);
  await client.callTool({ name: 'propose_typing_plan', arguments: { plan } });
  const pending = await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8');
  await link(join(root, 'example.ts'), join(root, 'alias.ts'));
  const aliased = { ...plan, steps: [plan.steps[0], { ...plan.steps[0], file: 'alias.ts', after: 'answer = 43' }] };
  const rejected = await client.callTool({ name: 'propose_typing_plan', arguments: { plan: aliased } });
  assert.equal(rejected.isError, true);
  assert.equal(data(rejected).reason, 'duplicate_file');
  assert.equal(await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8'), pending);
  assert.equal(await readFile(join(root, 'example.ts'), 'utf8'), 'export const answer = 41;\n');
});

test('MCP path failures expose neither external file contents nor absolute paths', async t => {
  const { root, client } = await setup(t);
  const result = await client.callTool({ name: 'read_file', arguments: { file: '../.env' } });
  assert.equal(result.isError, true);
  assert.equal(data(result).reason, 'unsafe_path');
  assert.equal(JSON.stringify(result).includes(root), false);
});

test('MCP preflights sequential multi-file plans without applying any step', async t => {
  const { root, client } = await setup(t);
  await writeFile(join(root, 'helper.ts'), 'export const enabled = false;\n');
  const sequential = {
    ...plan,
    steps: [
      plan.steps[0],
      { ...plan.steps[0], before: 'answer = 42', after: 'answer = 43' },
      { file: 'helper.ts', before: 'enabled = false', after: 'enabled = true', reason: 'Enable the feature.' },
    ],
  };
  const response = await client.callTool({ name: 'propose_typing_plan', arguments: { plan: sequential } });
  assert.equal(response.isError, undefined);
  assert.equal(data(response).stepCount, 3);
  assert.deepEqual(data(response).sourceFiles, ['example.ts', 'helper.ts']);
  assert.equal(data(response).planHash, createHash('sha256').update(JSON.stringify(sequential)).digest('hex'));
  assert.equal(await readFile(join(root, 'example.ts'), 'utf8'), 'export const answer = 41;\n');
  assert.equal(await readFile(join(root, 'helper.ts'), 'utf8'), 'export const enabled = false;\n');
  const pending = await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8');
  const invalidLater = { ...sequential, steps: [...sequential.steps, { ...plan.steps[0], before: 'answer = 42', after: 'answer = 44' }] };
  const rejected = await client.callTool({ name: 'propose_typing_plan', arguments: { plan: invalidLater } });
  assert.equal(rejected.isError, true);
  assert.equal(data(rejected).reason, 'source_does_not_match');
  assert.equal(await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8'), pending);
});

test('typing status is an explicitly dated extension snapshot, not proof of correctness', async t => {
  const { root, client } = await setup(t);
  const empty = await client.callTool({ name: 'get_typing_status', arguments: {} });
  assert.equal(data(empty).status, 'unavailable');
  assert.equal(data(empty).reason, 'no_extension_status');
  const saved = { version: 1, updatedAt: new Date().toISOString(), state: 'matched', stepIndex: 0, stepCount: 1 };
  await writeBridgeFile(root, 'status.json', { ...saved, internalValue: 'must not be returned' });
  const status = await client.callTool({ name: 'get_typing_status', arguments: {} });
  assert.equal(data(status).evidence, 'last_saved_extension_status');
  assert.equal(data(status).state, 'matched');
  assert.equal(data(status).updatedAt, saved.updatedAt);
  assert.equal(data(status).internalValue, undefined);
  await writeBridgeFile(root, 'status.json', { version: 1, state: 'complete' });
  const invalid = await client.callTool({ name: 'get_typing_status', arguments: {} });
  assert.equal(invalid.isError, true);
});

test('MCP entrypoint requires one explicit absolute workspace argument', () => {
  assert.equal(parseWorkspaceArgument(['--workspace', '/tmp/project']), '/tmp/project');
  for (const args of [[], ['--workspace', 'relative'], ['--workspace', '/tmp/project', '--extra'], ['/tmp/project']]) {
    assert.throws(() => parseWorkspaceArgument(args));
  }
});

test('standalone stdio entry initializes and reads a file without contaminating stdout', async t => {
  const root = await mkdtemp(join(tmpdir(), 'type-change-stdio-'));
  await writeFile(join(root, 'example.ts'), 'export const answer = 41;\n');
  const client = new Client({ name: 'type-change-stdio-test', version: '0.1.0' });
  t.after(async () => { await client.close(); await rm(root, { recursive: true, force: true }); });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp-server.ts', '--workspace', root],
    stderr: 'pipe',
  });
  await client.connect(transport);
  const response = await client.callTool({ name: 'read_file', arguments: { file: 'example.ts' } });
  assert.equal(data(response).text, 'export const answer = 41;\n');
});

test('bundled CJS MCP entry accepts a workspace path containing spaces and Korean text', async t => {
  const root = await mkdtemp(join(tmpdir(), 'type-change 코드 '));
  const entry = join(root, 'mcp-server.cjs');
  await writeFile(join(root, 'example.ts'), 'export const answer = 41;\n');
  await build({ entryPoints: ['src/mcp-server.ts'], outfile: entry, bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent' });
  const client = new Client({ name: 'type-change-bundle-test', version: '0.1.0' });
  t.after(async () => { await client.close(); await rm(root, { recursive: true, force: true }); });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--workspace', root], stderr: 'pipe' });
  await client.connect(transport);
  const response = await client.callTool({ name: 'read_file', arguments: { file: 'example.ts' } });
  assert.equal(data(response).text, 'export const answer = 41;\n');
  const proposal = await client.callTool({ name: 'propose_typing_plan', arguments: { plan } });
  assert.equal(data(proposal).status, 'proposed');
  assert.deepEqual(JSON.parse(await readFile(join(root, '.type-the-change', 'plan.json'), 'utf8')), plan);
});
