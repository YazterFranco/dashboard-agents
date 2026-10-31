import type { AgentEvent } from '@agentdash/shared';
import { duration } from './format';

export type FlowState = 'ok' | 'error' | 'now' | 'sub';
export interface FlowStep {
  label: string;
  count: number;
  state: FlowState;
}

export type RowTone = 'ok' | 'error' | 'now' | 'sub' | 'muted';
export interface TimelineRow {
  id: string;
  ts: number;
  label: string;
  text?: string;
  result?: string;
  tone: RowTone;
}

const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);

const chronological = (events: AgentEvent[]) => [...events].sort((a, b) => a.ts - b.ts);

/** Pairs each tool.start with its tool.end (by callId, else first-in-first-out by tool name). */
export function pairTools(events: AgentEvent[]): { endOf: Map<string, AgentEvent>; startOf: Map<string, AgentEvent> } {
  const openById = new Map<string, AgentEvent>();
  const openByName = new Map<string, AgentEvent[]>();
  const endOf = new Map<string, AgentEvent>();
  const startOf = new Map<string, AgentEvent>();
  for (const ev of chronological(events)) {
    if (!ev.tool) continue;
    if (ev.type === 'tool.start') {
      if (ev.tool.callId) openById.set(ev.tool.callId, ev);
      else openByName.set(ev.tool.name, [...(openByName.get(ev.tool.name) ?? []), ev]);
    } else if (ev.type === 'tool.end') {
      const s = ev.tool.callId ? openById.get(ev.tool.callId) : openByName.get(ev.tool.name)?.shift();
      if (!s) continue;
      if (ev.tool.callId) openById.delete(ev.tool.callId);
      endOf.set(s.id, ev);
      startOf.set(ev.id, s);
    }
  }
  return { endOf, startOf };
}

export function compressFlow(events: AgentEvent[], max = 12): FlowStep[] {
  const evs = chronological(events);
  const { endOf } = pairTools(evs);
  const starts = evs.filter((e) => e.type === 'tool.start' && e.tool);
  const lastOpen = [...starts].reverse().find((s) => !endOf.has(s.id));
  const steps: FlowStep[] = [];
  for (const s of starts) {
    const end = endOf.get(s.id);
    const state: FlowState = SUBAGENT_TOOLS.has(s.tool!.name)
      ? 'sub'
      : end
        ? end.tool?.ok === false
          ? 'error'
          : 'ok'
        : s === lastOpen
          ? 'now'
          : 'ok';
    const prev = steps.at(-1);
    if (prev && prev.label === s.tool!.name && prev.state === state) prev.count += 1;
    else steps.push({ label: s.tool!.name, count: 1, state });
  }
  return steps.slice(-max);
}

export function timelineRows(events: AgentEvent[]): TimelineRow[] {
  const { endOf, startOf } = pairTools(events);
  const rows: TimelineRow[] = [];
  for (const ev of chronological(events).reverse()) {
    const base = { id: ev.id, ts: ev.ts };
    switch (ev.type) {
      case 'tool.start':
        if (endOf.has(ev.id)) break;
        rows.push({ ...base, label: ev.tool?.name ?? 'herramienta', text: ev.tool?.summary, result: 'en curso', tone: SUBAGENT_TOOLS.has(ev.tool?.name ?? '') ? 'sub' : 'now' });
        break;
      case 'tool.end': {
        const s = startOf.get(ev.id);
        const failed = ev.tool?.ok === false;
        const d = ev.tool?.durationMs;
        rows.push({
          ...base,
          label: s?.tool?.name ?? ev.tool?.name ?? 'herramienta',
          text: s?.tool?.summary ?? ev.tool?.summary,
          result: failed ? 'falló' : d !== undefined ? `ok · ${duration(d)}` : 'ok',
          tone: failed ? 'error' : 'ok',
        });
        break;
      }
      case 'prompt':
        rows.push({ ...base, label: 'Prompt', text: ev.text, tone: 'muted' });
        break;
      case 'waiting':
        rows.push({ ...base, label: 'Esperando', text: ev.text ?? 'terminó su turno', tone: 'muted' });
        break;
      case 'session.start':
        rows.push({ ...base, label: 'Sesión iniciada', text: ev.text, tone: 'muted' });
        break;
      case 'session.end':
        rows.push({ ...base, label: 'Sesión terminada', text: ev.text, tone: 'muted' });
        break;
      case 'subagent.start':
        rows.push({ ...base, label: 'Subagente', text: ev.subagent?.name, tone: 'sub' });
        break;
      case 'subagent.end':
        rows.push({ ...base, label: 'Subagente terminó', tone: 'muted' });
        break;
      case 'unparsed':
        rows.push({ ...base, label: 'Evento no reconocido', text: ev.text, tone: 'muted' });
        break;
    }
  }
  return rows;
}
