import { describe, expect, it } from 'vitest';
import { parseEnvelope } from '@agentdash/shared';

describe('parseEnvelope', () => {
  it('accepts a minimal valid envelope', () => {
    expect(parseEnvelope({ v: 1, platform: 'claude', receivedAt: 1, payload: {} }).platform).toBe('claude');
  });
  it('keeps optional fields', () => {
    const e = parseEnvelope({ v: 1, platform: 'kiro-ide', eventHint: 'PreToolUse', receivedAt: 1, ppid: 3, envHints: { TERM_PROGRAM: 'vscode' }, payload: null });
    expect(e).toMatchObject({ eventHint: 'PreToolUse', ppid: 3, envHints: { TERM_PROGRAM: 'vscode' }, payload: null });
  });
  it('rejects unknown platforms and versions', () => {
    expect(() => parseEnvelope({ v: 1, platform: 'otro', receivedAt: 1, payload: null })).toThrow();
    expect(() => parseEnvelope({ v: 2, platform: 'claude', receivedAt: 1, payload: null })).toThrow();
  });
});
