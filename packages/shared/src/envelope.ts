import { z } from 'zod';
import type { HookEnvelope } from './types.js';

export const HookEnvelopeSchema = z.object({
  v: z.literal(1),
  platform: z.enum(['claude', 'kiro-cli', 'kiro-ide']),
  eventHint: z.string().max(100).optional(),
  receivedAt: z.number(),
  cwd: z.string().optional(),
  ppid: z.number().int().optional(),
  pid: z.number().int().optional(),
  envHints: z.record(z.string(), z.string()).optional(),
  payload: z.unknown(),
  payloadText: z.string().optional(),
});

export function parseEnvelope(x: unknown): HookEnvelope {
  const parsed = HookEnvelopeSchema.parse(x);
  return { ...parsed, payload: parsed.payload ?? null } as HookEnvelope;
}
