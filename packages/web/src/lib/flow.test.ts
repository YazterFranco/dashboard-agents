import { describe, expect, it } from 'vitest';
import { compressFlow, timelineRows } from './flow';
import { end, start } from './fixtures';

describe('compressFlow', () => {
  it('merges consecutive repeats and marks the running tool', () => {
    expect(compressFlow([start('Read', 'a'), end('a'), start('Read', 'b'), end('b'), start('Edit', 'c')])).toEqual([
      { label: 'Read', count: 2, state: 'ok' },
      { label: 'Edit', count: 1, state: 'now' },
    ]);
  });
  it('marks failed tools', () => {
    expect(compressFlow([start('Bash', 'x'), end('x', false)])[0].state).toBe('error');
  });
  it('marks subagent launches', () => {
    expect(compressFlow([start('Task', 't')])[0].state).toBe('sub');
  });
  it('pairs tools without callId by name', () => {
    expect(compressFlow([start('fs_read'), end('fs_read', false, { byName: true })])[0].state).toBe('error');
  });
  it('keeps only the last 12 steps', () => {
    const steps = compressFlow(Array.from({ length: 30 }, (_, i) => start('T' + i, 'c' + i)));
    expect(steps).toHaveLength(12);
    expect(steps.at(-1)!.label).toBe('T29');
    expect(steps.at(-1)!.state).toBe('now');
    expect(steps[0].state).toBe('ok');
  });
  it('accepts events newest-first', () => {
    expect(compressFlow([start('Edit', 'c'), end('a'), start('Read', 'a')].map((e, i) => ({ ...e, ts: 10 - i })))).toEqual([
      { label: 'Read', count: 1, state: 'ok' },
      { label: 'Edit', count: 1, state: 'now' },
    ]);
  });
});

describe('timelineRows', () => {
  it('hides tool.start rows whose tool already ended and lists newest first', () => {
    const rows = timelineRows([start('Read', 'a'), end('a', true, { durationMs: 1200 }), start('Edit', 'b')]);
    expect(rows.map((r) => [r.label, r.result])).toEqual([
      ['Edit', 'en curso'],
      ['Read', 'ok · 1.2s'],
    ]);
  });
  it('describes non-tool events', () => {
    const rows = timelineRows([{ ...start('x'), type: 'prompt', text: 'hola', tool: undefined }, { ...start('x'), type: 'unparsed', tool: undefined }]);
    expect(rows.map((r) => r.label)).toEqual(['Evento no reconocido', 'Prompt']);
    expect(rows[1].text).toBe('hola');
  });
  it('shows failures', () => {
    expect(timelineRows([start('Bash', 'x'), end('x', false)])[0]).toMatchObject({ label: 'Bash', result: 'falló', tone: 'error' });
  });
});

describe('timelineRows — summaries', () => {
  it('prefers the start summary over the end summary', () => {
    const s = start('Task', 't');
    s.tool!.summary = 'ejecutar tests de auth';
    const e = end('t');
    e.tool!.summary = 'subagent_type=test-runner';
    expect(timelineRows([s, e])[0].text).toBe('ejecutar tests de auth');
  });
});
