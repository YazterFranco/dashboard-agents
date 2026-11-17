import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from '../src/privateNet.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '192.168.1.50',
    '172.16.0.1',
    '172.17.0.1',
    '172.31.255.255',
    '169.254.1.1',
    '::1',
    '::ffff:192.168.1.5',
    '::ffff:127.0.0.1',
    '::ffff:c0a8:105',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
  ])('accepts %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.15.255.255',
    '172.32.0.1',
    '192.169.0.1',
    '100.64.0.1',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '2001:4860:4860::8888',
    '::',
    '',
    'not-an-ip',
    '192.168.1',
    '192.168.1.256',
  ])('rejects %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});
