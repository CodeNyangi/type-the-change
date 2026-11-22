import * as z from 'zod/v4';
import {parsePlan, validateRelativePath} from './plan.js';
import {readBridgeFile} from './workspace-files.js';

export const agents = ['codex', 'claude'] as const;
export type Agent = typeof agents[number];
export const agentNames = {codex: 'Codex', claude: 'Claude Code'} as const;
export const planFile = (agent: Agent) => `plan-${agent}.json` as const;
export const reportFile = (agent: Agent) => `report-${agent}.json` as const;
export const inboxFiles = ['plan.json', ...agents.flatMap(agent => [planFile(agent), reportFile(agent)])] as const;
export type InboxFile = typeof inboxFiles[number];

const note = z.string().max(280).trim().min(1);
const filePath = z.string().max(512).refine(file => {
  try { validateRelativePath(file); return true; }
  catch { return false; }
}, 'Use a safe workspace-relative file path.');

export const assessmentSchema = z.object({
  impact: note.describe('Behavior or callers affected, with uncertainty called out.'),
  risk: note.describe('Most important regression or edge case to inspect.'),
  verification: note.describe('A specific check the reviewer can run, or evidence you already checked.'),
}).strict();
export type Assessment = z.infer<typeof assessmentSchema>;

export const reportSchema = assessmentSchema.extend({
  threadId: z.string().uuid().optional().describe('Session ID supplied by the VS Code review request, when available.'),
  summary: note.describe('What changed and why.'),
  source: z.object({
    url: z.string().regex(/^https:\/\/claude\.ai\/code\/[a-zA-Z0-9_-]{8,160}$/),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
  }).strict().optional().describe('An explicitly linked Claude web thread and local Git commit. The thread URL is shown as provenance.'),

  files: z.array(z.object({
    file: filePath,
    line: z.number().int().min(1).max(1_000_000).optional(),
    note: note.describe('What to inspect at this location.'),
  }).strict()).min(1).max(8),
}).strict();

export async function readProposal(root: string, agent?: Agent) {
  const data = await readBridgeFile(root, agent ? planFile(agent) : 'plan.json');
  if (data === undefined) return;
  if (!agent) return {plan: parsePlan(JSON.stringify(data)), assessment: undefined};
  const envelope = z.object({plan: z.unknown(), assessment: assessmentSchema.optional()}).strict().parse(data);
  return {plan: parsePlan(JSON.stringify(envelope.plan)), assessment: envelope.assessment};
}

export async function readReport(root: string, agent: Agent) {
  const data = await readBridgeFile(root, reportFile(agent));
  return data === undefined ? undefined : reportSchema.parse(data);
}
