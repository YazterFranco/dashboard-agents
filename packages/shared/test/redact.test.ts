import { describe, expect, it } from 'vitest';
import { redact, truncate } from '@agentdash/shared';

describe('redact', () => {
  it('hides API keys', () => {
    expect(redact('key sk-ant-abc123def456ghi789')).toBe('key «redactado»');
    expect(redact('ghp_' + 'a'.repeat(36))).toBe('«redactado»');
    expect(redact('AKIAABCDEFGHIJKLMNOP')).toBe('«redactado»');
    expect(redact('xoxb-123-456-abc')).toBe('«redactado»');
  });
  it('hides bearer tokens', () => {
    expect(redact('Authorization: Bearer eyJhbGciOi.x.y')).toContain('«redactado»');
    expect(redact('Authorization: Bearer eyJhbGciOi.x.y')).not.toContain('eyJ');
  });
  it('hides password and api key assignments but keeps the key name', () => {
    expect(redact('password=hunter2 ok')).toBe('password=«redactado» ok');
    expect(redact('API_KEY: abcdef123')).toBe('API_KEY: «redactado»');
  });
  it('hides private key blocks', () => {
    expect(redact('-----BEGIN RSA PRIVATE KEY-----\nAAA\n-----END RSA PRIVATE KEY-----')).toBe('«redactado»');
  });
  it('leaves normal text alone', () => {
    expect(redact('npm test -- auth')).toBe('npm test -- auth');
  });
});

describe('truncate', () => {
  it('cuts with an ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});
