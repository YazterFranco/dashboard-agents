#!/usr/bin/env node
// AgentDash hook — forwards one agent hook event to the local dashboard.
//
// Usage: node hook.mjs <claude|kiro-cli|kiro-ide> [eventHint]
//
// Contract (do not break): zero dependencies, never writes to stdout (Claude
// Code and Kiro inject the stdout of some hooks into the agent's context),
// and always exits 0 (exit 2 would block the agent's tool call).

const PLATFORMS = new Set(['claude', 'kiro-cli', 'kiro-ide']);
const ENV_HINTS = ['TERM_PROGRAM', 'CLAUDE_CODE_ENTRYPOINT'];
const MAX_STDIN_BYTES = 16 * 1024 * 1024;
const STDIN_IDLE_MS = 200;
const POST_TIMEOUT_MS = 500;
const MAX_STRING = 2000;
const MAX_ARRAY = 200;
const MAX_DEPTH = 20;
const TEXT_MAX = 8192;

const debug = (msg) => {
  if (process.env.AGENTDASH_DEBUG === '1') process.stderr.write(`[agentdash-hook] ${msg}\n`);
};

process.on('uncaughtException', (err) => {
  debug(String(err));
  process.exit(0);
});

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    const chunks = [];
    let size = 0;
    let done = false;
    let timer;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, STDIN_IDLE_MS);
    };
    process.stdin.on('data', (chunk) => {
      if (size < MAX_STDIN_BYTES) {
        chunks.push(chunk);
        size += chunk.length;
      }
      arm();
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    arm();
  });
}

/** Caps long strings and arrays so the envelope stays small but valid JSON. */
function shrink(value, depth = 0) {
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value;
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => shrink(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = shrink(v, depth + 1);
  return out;
}

function envHints() {
  const hints = {};
  for (const key of ENV_HINTS) if (process.env[key]) hints[key] = process.env[key];
  return hints;
}

async function main() {
  const [platform, eventHint] = process.argv.slice(2);
  if (!PLATFORMS.has(platform)) {
    debug(`plataforma desconocida: ${platform}`);
    return;
  }
  const text = await readStdin();
  let payload = null;
  let payloadText;
  if (text.trim()) {
    try {
      payload = shrink(JSON.parse(text));
    } catch {
      payloadText = text.slice(0, TEXT_MAX);
    }
  }
  const envelope = {
    v: 1,
    platform,
    ...(eventHint ? { eventHint: eventHint.slice(0, 100) } : {}),
    receivedAt: Date.now(),
    cwd: process.cwd(),
    ppid: process.ppid,
    pid: process.pid,
    envHints: envHints(),
    payload,
    ...(payloadText !== undefined ? { payloadText } : {}),
  };
  const base = (process.env.AGENTDASH_URL || 'http://127.0.0.1:4820').replace(/\/+$/, '');
  await fetch(`${base}/api/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });
}

main()
  .catch((err) => debug(String(err)))
  .finally(() => process.exit(0));
