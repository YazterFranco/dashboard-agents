import type { HookEnvelope } from '@agentdash/shared';

export interface DemoStep {
  delayMs: number;
  envelope: HookEnvelope;
}

type P = Record<string, unknown>;
type Partial = Omit<HookEnvelope, 'receivedAt'>;

const ROOT = '/home/dev/proyectos';

function claudeAgent(session: string, folder: string, ppid: number, vscode = false) {
  const cwd = `${ROOT}/${folder}`;
  return (payload: P): Partial => ({
    v: 1,
    platform: 'claude',
    cwd,
    ppid,
    pid: ppid + 1,
    sessionPid: ppid,
    envHints: vscode ? { TERM_PROGRAM: 'vscode' } : {},
    payload: { session_id: session, cwd, transcript_path: `/home/dev/.claude/projects/${folder}/${session}.jsonl`, ...payload },
  });
}

function kiroAgent(platform: 'kiro-cli' | 'kiro-ide', folder: string, ppid: number) {
  const cwd = `${ROOT}/${folder}`;
  return (payload: P | null, eventHint?: string): Partial => ({
    v: 1,
    platform,
    ...(eventHint ? { eventHint } : {}),
    cwd,
    ppid,
    pid: ppid + 1,
    sessionPid: ppid,
    payload: payload ? { cwd, ...payload } : null,
  });
}

function claudeTool(name: string, input: P, id: string, extra: P = {}, response: P = { success: true }): P[] {
  return [
    { hook_event_name: 'PreToolUse', tool_name: name, tool_input: input, tool_use_id: id, ...extra },
    { hook_event_name: 'PostToolUse', tool_name: name, tool_input: input, tool_use_id: id, tool_response: response, ...extra },
  ];
}

function kiroTool(name: string, input: P, response: P = { success: true }): P[] {
  return [
    { hook_event_name: 'preToolUse', tool_name: name, tool_input: input },
    { hook_event_name: 'postToolUse', tool_name: name, tool_input: input, tool_response: response },
  ];
}

function sequences(): Partial[][] {
  const auth = claudeAgent('demo-auth', 'refactor-auth', 4101);
  const sub = { agent_id: 'demo-sub-1', agent_type: 'test-runner' };
  const refactorAuth = [
    { hook_event_name: 'SessionStart', source: 'startup' },
    { hook_event_name: 'UserPromptSubmit', prompt: 'refactoriza auth para usar verifySession()' },
    ...claudeTool('Read', { file_path: 'src/auth/session.ts' }, 'a1'),
    ...claudeTool('Grep', { pattern: 'validateToken' }, 'a2'),
    ...claudeTool('Edit', { file_path: 'src/auth/middleware.ts' }, 'a3'),
    ...claudeTool('mcp__github__list_pull_requests', { repo: 'acme/api' }, 'a4'),
    { hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 'a5', tool_input: { description: 'ejecutar tests de auth', prompt: 'Corre la suite de auth y resume los fallos', subagent_type: 'test-runner' } },
    ...claudeTool('Bash', { command: 'npm test -- auth' }, 's1', sub),
    ...claudeTool('Read', { file_path: 'tests/auth.test.ts' }, 's2', sub),
    { hook_event_name: 'SubagentStop', stop_hook_active: false, agent_id: 'demo-sub-1' },
    { hook_event_name: 'PostToolUse', tool_name: 'Task', tool_use_id: 'a5', tool_input: { subagent_type: 'test-runner' }, tool_response: { content: [{ type: 'text', text: '12 tests ok' }] } },
    { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_use_id: 'a6', tool_input: { file_path: 'src/auth/session.ts' } },
  ].map(auth);

  const lint = claudeAgent('demo-lint', 'lint-fix', 4201, true);
  const lintFix = [
    { hook_event_name: 'SessionStart', source: 'startup' },
    { hook_event_name: 'UserPromptSubmit', prompt: 'corrige los avisos del linter' },
    ...claudeTool('Bash', { command: 'npm run lint -- --fix' }, 'l1'),
    ...claudeTool('Edit', { file_path: 'src/utils/date.ts' }, 'l2'),
    ...claudeTool('Edit', { file_path: 'src/utils/format.ts' }, 'l3'),
    { hook_event_name: 'Stop', stop_hook_active: false },
    { hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' },
  ].map(lint);

  const ide = kiroAgent('kiro-ide', 'checkout-spec', 7101);
  const checkoutSpec = [
    ide(null, 'PromptSubmit'),
    ...kiroTool('fsWrite', { path: '.kiro/specs/checkout/requirements.md' }).map((p) => ide(p, String(p.hook_event_name))),
    ...kiroTool('fsWrite', { path: '.kiro/specs/checkout/design.md' }).map((p) => ide(p, String(p.hook_event_name))),
    ide(null, 'AgentStop'),
  ];

  const docs = kiroAgent('kiro-cli', 'stripe-docs', 7102);
  const stripeDocs = [
    { hook_event_name: 'agentSpawn' },
    { hook_event_name: 'userPromptSubmit', prompt: 'busca en la doc de stripe cómo validar webhooks' },
    ...kiroTool('@powers/stripe/search_docs', { query: 'webhook signature' }),
    ...kiroTool('fs_read', { path: 'src/webhooks.ts' }),
    ...kiroTool('fs_write', { path: 'src/webhooks.ts' }),
    { hook_event_name: 'preToolUse', tool_name: '@powers/stripe/search_docs', tool_input: { query: 'idempotency keys' } },
  ].map((p) => docs(p));

  const deploy = kiroAgent('kiro-cli', 'deploy-check', 7103);
  const deployCheck = [
    { hook_event_name: 'agentSpawn' },
    { hook_event_name: 'userPromptSubmit', prompt: 'revisa el plan de terraform de staging' },
    ...kiroTool('execute_bash', { command: 'terraform plan -out plan.tfplan' }, { exit_status: 1, stderr: 'Error: missing variable "region"' }),
    { hook_event_name: 'stop' },
  ].map((p) => deploy(p));

  return [refactorAuth, stripeDocs, checkoutSpec, deployCheck, lintFix];
}

/** A scripted, realistic multi-agent session used for development, e2e tests and trying the UI. */
export function demoScript(now: number): DemoStep[] {
  const seqs = sequences();
  const steps: DemoStep[] = [];
  let t = now;
  let i = 0;
  for (let round = 0; seqs.some((s) => round < s.length); round++) {
    for (const seq of seqs) {
      const partial = seq[round];
      if (!partial) continue;
      const delayMs = 650 + ((i * 137) % 400);
      t += delayMs;
      i += 1;
      steps.push({ delayMs, envelope: { ...partial, receivedAt: t } as HookEnvelope });
    }
  }
  return steps;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(url: string, speed = 1, onStep?: (n: number, total: number) => void): Promise<number> {
  const steps = demoScript(Date.now());
  const base = url.replace(/\/+$/, '');
  let sent = 0;
  for (const step of steps) {
    await sleep(step.delayMs / Math.max(speed, 0.01));
    let res: Response;
    try {
      res = await fetch(`${base}/api/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...step.envelope, receivedAt: Date.now() }),
      });
    } catch {
      throw new Error(`No pude conectar con ${base}. ¿Está corriendo el dashboard? Arráncalo con "agentdash start" o "docker compose up".`);
    }
    if (!res.ok) throw new Error(`El servidor respondió ${res.status} al enviar el paso ${sent + 1}.`);
    sent += 1;
    onStep?.(sent, steps.length);
  }
  return sent;
}
