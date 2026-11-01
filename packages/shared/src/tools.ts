import { SUMMARY_MAX } from './constants.js';
import { redact, truncate } from './redact.js';
import type { ToolInfo, ToolKind } from './types.js';

export function classifyTool(name: string): { kind: ToolKind; source?: string } {
  let m = /^mcp__plugin_(.+?)_[^_]+__.+$/.exec(name);
  if (m) return { kind: 'plugin', source: m[1] };
  m = /^mcp__(.+?)__.+$/.exec(name);
  if (m) return { kind: 'mcp', source: m[1] };
  m = /^@?powers?[/_.:]([^/_.:]+)/i.exec(name);
  if (m) return { kind: 'power', source: m[1] };
  m = /^@mcp[/:]([^/:]+)/i.exec(name);
  if (m) return { kind: 'mcp', source: m[1] };
  m = /^([A-Za-z0-9-]+)___.+$/.exec(name);
  if (m) return { kind: 'power', source: m[1] };
  return { kind: 'builtin' };
}

const PREFERRED_KEYS = ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description', 'prompt'];

function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v) ?? '';
}

export function summarizeToolInput(_name: string, input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  let text: string;
  if (typeof input !== 'object' || Array.isArray(input)) {
    text = asText(input);
  } else {
    const obj = input as Record<string, unknown>;
    const key = PREFERRED_KEYS.find((k) => typeof obj[k] === 'string' && obj[k] !== '');
    text = key
      ? (obj[key] as string)
      : Object.keys(obj)
          .slice(0, 2)
          .map((k) => `${k}=${asText(obj[k])}`)
          .join(' ');
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return truncate(redact(text), SUMMARY_MAX);
}

export function extensionLabel(tool: Pick<ToolInfo, 'kind' | 'source'>): string | undefined {
  if (tool.kind === 'builtin' || !tool.source) return undefined;
  return `${tool.kind}: ${tool.source}`;
}
