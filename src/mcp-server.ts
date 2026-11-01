import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { stat } from 'node:fs/promises';
import { parsePlan, validatePlanAgainstFiles } from './plan.js';
import { readWorkspaceFile, readBridgeFile, writeBridgeFile, WorkspaceFileError } from './workspace-files.js';

const stepSchema = z.object({
  file: z.string().min(1).max(512),
  before: z.string().min(1).max(16_384),
  after: z.string().max(16_384),
  reason: z.string().min(1).max(1000),
}).strict();
const planSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(120), intent: z.string().min(1).max(4000),
  steps: z.array(stepSchema).min(1).max(20),
}).strict();
const statusSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  state: z.enum(['idle', 'typing', 'matched', 'outside', 'complete']),
  stepIndex: z.number().int().min(0).max(20),
  stepCount: z.number().int().min(0).max(20),
  planHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

function hash(text: string): string { return createHash('sha256').update(text).digest('hex'); }
function result(data: Record<string, unknown>, message: string) {
  return { content: [{ type: 'text' as const, text: message }], structuredContent: data };
}
function failed(code: string) {
  return { ...result({ status: 'unavailable', reason: code }, `The requested operation was not completed (${code}).`), isError: true };
}
function fileFailure(error: unknown) {
  return failed(error instanceof WorkspaceFileError ? error.code : 'unavailable');
}

/** Hosts supply the model and its billing. This server handles local evidence only. */
export function createTypingMcpServer(workspace: string): McpServer {
  const server = new McpServer({ name: 'type-the-change', version: '0.1.0' }, {
    instructions: [
      'Type the Change is a human typing and code review workflow.',
      'Read only the files the user needs for their stated intent; source reads are saved disk contents, not unsaved editor buffers.',
      'Propose small, reasoned replacements with before text copied exactly and uniquely from the current file.',
      'Insertion requires surrounding before context. Steps apply sequentially in the proposed order.',
      'propose_typing_plan sends a local proposal to the VS Code extension. It does not change source code, start typing, run tests, or prove correctness.',
      'The person chooses to load the plan and types the changes in their native editor. Do not apply the changes with another tool.',
      'Use get_typing_status only as a last saved UI status; a text match does not certify understanding or semantic correctness.',
      'The MCP server does not call a model or read authentication tokens. The connected host owns its own model access; ChatGPT/Codex plan usage follows that host’s supported sign-in and limits.',
    ].join(' '),
  });

  server.registerTool('read_file', {
    title: 'Read a workspace source file',
    description: 'Read one explicitly named UTF-8 source file (up to 64 KiB) from this configured workspace. Returns saved disk contents and a SHA-256 fingerprint. Does not read unsaved buffers, credentials, internal directories, symlinks, or files outside the workspace.',
    inputSchema: z.object({ file: z.string().min(1).max(512).describe('Workspace-relative source file path, using forward slashes.') }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ file }) => {
    try {
      const text = await readWorkspaceFile(workspace, file);
      return result({ status: 'read', file, text, sha256: hash(text), bytes: Buffer.byteLength(text), source: 'saved_file' }, 'Read the saved source file. Unsaved editor changes are not included.');
    } catch (error) { return fileFailure(error); }
  });

  server.registerTool('propose_typing_plan', {
    title: 'Propose changes for a person to type',
    description: 'Validate a small sequential typing plan against saved workspace files and atomically replace the local pending proposal. The extension offers the plan to the person; it never applies the edits. This writes only .type-the-change/plan.json. An existing pending proposal is replaced, but source files and the active typing session are unchanged.',
    inputSchema: z.object({ plan: planSchema }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ plan: proposed }) => {
    let plan;
    try { plan = parsePlan(JSON.stringify(proposed)); }
    catch { return failed('invalid_plan'); }
    const files = new Map<string, string>();
    try {
      for (const file of new Set(plan.steps.map(step => step.file))) files.set(file, await readWorkspaceFile(workspace, file));
      try { validatePlanAgainstFiles(plan, files); }
      catch { return failed('source_does_not_match'); }
      // Re-read before publishing so a changed disk file cannot quietly pass a stale preflight.
      for (const [file, text] of files) if (await readWorkspaceFile(workspace, file) !== text) return failed('source_changed');
      await writeBridgeFile(workspace, 'plan.json', plan);
      return result({
        status: 'proposed', title: plan.title, stepCount: plan.steps.length,
        planHash: hash(JSON.stringify(plan)), sourceFiles: [...files.keys()],
        requiresHumanTyping: true, sourceFilesChanged: false,
      }, 'Proposal prepared for the person to load in VS Code. No source code was changed, and no tests were run.');
    } catch (error) { return fileFailure(error); }
  });

  server.registerTool('get_typing_status', {
    title: 'Read the last typing status',
    description: 'Read the last status snapshot saved by the VS Code extension. Unavailable means the extension has not recorded a usable status. A matched or complete snapshot describes text agreement only, not current editor freshness, understanding, test results, or semantic correctness.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      const saved = await readBridgeFile(workspace, 'status.json');
      if (saved === undefined) return result({ status: 'unavailable', reason: 'no_extension_status' }, 'No typing status has been recorded by the VS Code extension.');
      const parsed = statusSchema.safeParse(saved);
      if (!parsed.success) return failed('invalid_extension_status');
      return result({ status: 'available', evidence: 'last_saved_extension_status', ...parsed.data }, 'Last saved extension status. Text agreement does not prove semantic correctness; inspect and test the code separately.');
    } catch (error) { return fileFailure(error); }
  });
  return server;
}

export function parseWorkspaceArgument(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--workspace' || !isAbsolute(args[1] ?? '')) {
    throw new Error('Usage: node mcp-server.cjs --workspace /absolute/workspace');
  }
  return args[1];
}

export async function runMcpServer(args: string[]): Promise<void> {
  const workspace = parseWorkspaceArgument(args);
  if (!(await stat(workspace)).isDirectory()) throw new Error('Workspace unavailable.');
  const handle = serveStdio(() => createTypingMcpServer(workspace));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void handle.close(); });
}

// Avoid import.meta so the same entry can be bundled into a standalone CJS file.
if (process.argv[1] && /(?:^|[\\/])mcp-server\.(?:ts|js|cjs)$/.test(process.argv[1])) {
  void runMcpServer(process.argv.slice(2)).catch(() => {
    process.stderr.write('Type the Change MCP could not start. Use --workspace with an accessible absolute folder.\n');
    process.exitCode = 1;
  });
}
