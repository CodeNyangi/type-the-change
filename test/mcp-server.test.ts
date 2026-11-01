import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('MCP path failures expose neither external file contents nor absolute paths', async t => {
  const { root, client } = await setup(t);
  const result = await client.callTool({ name: 'read_file', arguments: { file: '../.env' } });
  assert.equal(result.isError, true);
  assert.equal(data(result).reason, 'unsafe_path');
  assert.equal(JSON.stringify(result).includes(root), false);
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
