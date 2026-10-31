import { hookCommand } from '../paths.js';

const IDE_HOOKS: Array<[file: string, trigger: string, matcher: boolean]> = [
  ['agentdash-pre-tool.json', 'PreToolUse', true],
  ['agentdash-post-tool.json', 'PostToolUse', true],
  ['agentdash-agent-stop.json', 'AgentStop', false],
  ['agentdash-prompt.json', 'PromptSubmit', false],
];

/**
 * One Kiro IDE (v1 format) command hook per event. The event name is passed as an
 * argument because older IDE builds send nothing on stdin.
 */
export function kiroIdeHookFiles(home: string): Record<string, object> {
  const files: Record<string, object> = {};
  for (const [file, trigger, matcher] of IDE_HOOKS) {
    files[file] = {
      version: 'v1',
      name: `AgentDash · ${trigger}`,
      description: 'Envía este evento al dashboard local de AgentDash (no modifica nada).',
      enabled: true,
      trigger,
      ...(matcher ? { matcher: '*' } : {}),
      action: { type: 'command', command: hookCommand(home, 'kiro-ide', trigger) },
    };
  }
  return files;
}
