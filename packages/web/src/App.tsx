import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, AgentState } from '@agentdash/shared';
import { AgentDetail } from './components/AgentDetail';
import { EmptyState } from './components/EmptyState';
import { FlowTree } from './components/FlowTree';
import { Header } from './components/Header';
import { OfficeStrip } from './components/OfficeStrip';
import { buildTree, type PlatformFilter } from './lib/tree';
import { connect, wsUrl, type ConnStatus } from './lib/ws';

const DONE_VISIBLE_MS = 10 * 60 * 1000;

function mergeEvents(a: AgentEvent[], b: AgentEvent[]): AgentEvent[] {
  const byId = new Map<string, AgentEvent>();
  for (const e of [...a, ...b]) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => y.ts - x.ts).slice(0, 300);
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function App() {
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [conn, setConn] = useState<ConnStatus>('reconnecting');
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const now = useNow(1000);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(
    () =>
      connect(
        wsUrl(),
        (msg) => {
          if (msg.type === 'snapshot') {
            setAgents(new Map(msg.agents.map((a) => [a.id, a])));
            return;
          }
          if (msg.agents.length) {
            setAgents((prev) => {
              const next = new Map(prev);
              for (const a of msg.agents) next.set(a.id, a);
              return next;
            });
          }
          if (msg.event.agentId === selectedRef.current) setEvents((prev) => mergeEvents(prev, [msg.event]));
        },
        setConn,
      ),
    [],
  );

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setEvents([]);
    fetch(`/api/agents/${encodeURIComponent(selectedId)}/events?limit=200`)
      .then((r) => (r.ok ? r.json() : []))
      .then((evs: AgentEvent[]) => {
        if (!cancelled) setEvents((prev) => mergeEvents(prev, evs));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, conn]);

  const list = useMemo(() => [...agents.values()], [agents]);
  const rows = useMemo(() => buildTree(list, filter), [list, filter]);
  const counts = useMemo(
    () => ({ all: list.length, claude: list.filter((a) => a.platform === 'claude').length, kiro: list.filter((a) => a.platform === 'kiro').length }),
    [list],
  );
  const office = rows.map((r) => r.agent).filter((a) => a.status !== 'done' || now - (a.endedAt ?? a.lastEventAt) < DONE_VISIBLE_MS);

  useEffect(() => {
    if (selectedId && rows.some((r) => r.agent.id === selectedId)) return;
    const first = rows.find((r) => r.agent.status !== 'done') ?? rows[0];
    setSelectedId(first?.agent.id ?? null);
  }, [rows, selectedId]);

  const selected = selectedId ? agents.get(selectedId) : undefined;

  return (
    <div className="app">
      <Header conn={conn} filter={filter} onFilter={setFilter} counts={counts} />
      <main className="main">
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <OfficeStrip agents={office} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="split">
              <FlowTree rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
              {selected ? <AgentDetail agent={selected} events={events} now={now} /> : <section className="panel detail muted">Elige un agente.</section>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
