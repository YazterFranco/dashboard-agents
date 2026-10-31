import type { WsMessage } from '@agentdash/shared';

export type ConnStatus = 'live' | 'reconnecting';

export function wsUrl(loc: Location = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

/** Opens the dashboard WebSocket and keeps it open with exponential backoff (0.5 s → 10 s). */
export function connect(url: string, onMessage: (m: WsMessage) => void, onStatus: (s: ConnStatus) => void): () => void {
  let ws: WebSocket | null = null;
  let delay = 500;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      delay = 500;
      onStatus('live');
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as WsMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (stopped) return;
      onStatus('reconnecting');
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, 10_000);
    };
    ws.onerror = () => ws?.close();
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}
