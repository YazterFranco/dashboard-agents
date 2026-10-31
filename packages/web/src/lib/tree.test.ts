import { describe, expect, it } from 'vitest';
import { buildTree } from './tree';
import { agent } from './fixtures';

describe('buildTree', () => {
  it('orders active roots by recent activity, children after parents, finished roots last', () => {
    const rows = buildTree(
      [agent('a', 'working', 5, { children: ['a1'] }), agent('a1', 'working', 6, { parentId: 'a', sessionId: 'a' }), agent('b', 'done', 9), agent('c', 'waiting', 7)],
      'all',
    );
    expect(rows.map((r) => [r.agent.id, r.depth])).toEqual([['c', 0], ['a', 0], ['a1', 1], ['b', 0]]);
  });
  it('filters by platform', () => {
    expect(buildTree([agent('a'), agent('k', 'working', 1, { platform: 'kiro' })], 'kiro').map((r) => r.agent.id)).toEqual(['k']);
  });
  it('treats orphans as roots', () => {
    expect(buildTree([agent('x', 'working', 1, { parentId: 'gone' })], 'all').map((r) => r.depth)).toEqual([0]);
  });
});
