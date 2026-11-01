# AgentDash v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard local en vivo que muestra agentes de Claude Code y Kiro (IDE/CLI) trabajando, alimentado por hooks.

**Architecture:** Un hook sin dependencias reenvía el JSON de cada evento a un servidor Fastify local; adaptadores por plataforma lo normalizan a `AgentEvent`, un pipeline deriva `AgentState`, SQLite guarda el historial y un WebSocket empuja los cambios a una UI React (diseño C · Híbrido).

**Tech Stack:** Node ≥ 22.13, TypeScript 5.9, npm workspaces, Fastify 5 (+ @fastify/websocket 11, @fastify/static 8), zod 4, `node:sqlite`, React 19 + Vite 7, Vitest 3, esbuild 0.25, Playwright (preinstalado, solo e2e), Docker.

**Spec:** `docs/superpowers/specs/2026-10-31-agent-dashboard-design.md`

## Global Constraints

- Servidor: Node ≥ 22.13 (por `node:sqlite`); hook: Node ≥ 18, **cero dependencias**, un solo archivo `.mjs`.
- Puerto por defecto `4820`, host por defecto `127.0.0.1`; env `AGENTDASH_HOST`, `AGENTDASH_PORT`, `AGENTDASH_DB`, `AGENTDASH_RETENTION_DAYS`, `AGENTDASH_URL`, `AGENTDASH_DEBUG`.
- Hook: lee stdin ≤ 1 MB con timeout 200 ms, POST con timeout 500 ms, **siempre exit 0**, **nunca escribe en stdout**.
- `raw` ≤ 8 KB tras redactar; `summary` ≤ 120 caracteres; texto redactado = `«redactado»`.
- `stale` tras 10 min sin eventos; replay de 24 h al arrancar; retención 7 días; poda cada hora.
- ESM en todo el repo (`"type": "module"`). Identificadores en inglés, textos de UI y README en español.
- Las entradas instaladas se reconocen porque el comando contiene `.agentdash/hook.mjs`.

## Review Focus

1. **Payload enorme** (un `Write` de un archivo de 3 MB): el hook recorta a 1 MB y el servidor sigue registrando el evento con su `summary` → test en Task 6 y Task 5.
2. **Dos sesiones en la misma carpeta** (dos terminales de Claude en el mismo proyecto, o dos Kiro CLI): agentes distintos por `session_id` / `ppid` → test en Task 2 y Task 3.
3. **Dashboard arrancado a mitad de sesión** (`tool.end` sin `tool.start`, evento sin `session.start`): no falla, crea el agente, `durationMs` indefinido → test en Task 5.
4. **`settings.json` existente con otros hooks o JSON inválido**: se conservan los hooks ajenos; con JSON inválido no se sobrescribe y se informa → test en Task 7.
5. **Rutas con espacios** (`/Users/Juan Pérez`, `C:\Users\Juan Pérez`): el comando del hook entrecomilla la ruta → test en Task 7.

---

## File Structure

```
package.json                    workspaces, scripts: build, test, typecheck, e2e
tsconfig.base.json              strict, ES2022, moduleResolution bundler
vitest.config.ts                include packages/*/test/**, packages/web/src/**/*.test.ts; alias @agentdash/shared
packages/shared/src/
  types.ts                      todos los tipos de la spec §4.1, §5 + HookEnvelope + WsMessage
  constants.ts                  DEFAULT_PORT, DEFAULT_HOST, STALE_AFTER_MS, REPLAY_WINDOW_MS, RETENTION_DAYS, RAW_MAX_BYTES, SUMMARY_MAX, REDACTED, STATUS_LABELS
  envelope.ts                   HookEnvelopeSchema (zod), parseEnvelope
  tools.ts                      classifyTool, summarizeToolInput, extensionLabel
  redact.ts                     redact, truncate
  index.ts                      re-exporta todo
packages/server/src/
  adapters/common.ts            baseEvent, makeRaw, unparsedEvent
  adapters/claude.ts            adaptClaude
  adapters/kiro.ts              adaptKiro
  adapters/index.ts             adapt (dispatch + try/catch → unparsed)
  state.ts                      reduce, markStale, AgentMap
  pipeline.ts                   Pipeline (resolución de subagentes, duraciones, replay)
  store.ts                      EventStore (node:sqlite)
  app.ts                        buildApp, startServer
packages/server/test/fixtures/{claude,kiro-cli,kiro-ide}/*.json
packages/cli/hook/hook.mjs      el hook
packages/cli/src/
  paths.ts                      agentdashHome, hookCommand, installHookFile
  install/claude.ts             addClaudeHooks, removeClaudeHooks
  install/kiro-cli.ts           addKiroCliHooks, removeKiroCliHooks
  install/kiro-ide.ts           kiroIdeHookFiles
  install/index.ts              install, uninstall
  demo.ts                       demoScript, runDemo
  main.ts                       parser de comandos (node:util parseArgs)
packages/cli/build.mjs          esbuild → dist/agentdash.mjs; copia hook y web/dist
packages/web/                   Vite app (src/lib/*.ts puros + src/components/*.tsx)
e2e/smoke.cjs                   Playwright: servidor + demo → asserts + screenshot
Dockerfile, docker-compose.yml, .dockerignore, README.md
```

---

### Task 1: Scaffold del monorepo + `@agentdash/shared`

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `packages/shared/{package.json,tsconfig.json}`, `packages/shared/src/{types,constants,envelope,tools,redact,index}.ts`
- Test: `packages/shared/test/{tools,redact,envelope}.test.ts`

**Interfaces:**
- Produces:
  - Tipos: `Platform = 'claude'|'kiro'`, `Surface = 'cli'|'ide'|'vscode'|'unknown'`, `HookPlatform = 'claude'|'kiro-cli'|'kiro-ide'`, `EventType` (spec §4.1), `ToolKind = 'builtin'|'mcp'|'power'|'plugin'`, `ToolInfo`, `AgentEvent` (spec §4.1 + `externalAgentId?: string` = `agent_id` de Claude), `AgentStatus`, `AgentState` (spec §5), `HookEnvelope = { v: 1; platform: HookPlatform; eventHint?: string; receivedAt: number; cwd?: string; ppid?: number; pid?: number; envHints?: Record<string, string>; payload: unknown | null; payloadText?: string }`, `WsMessage = { type: 'snapshot'; agents: AgentState[] } | { type: 'event'; event: AgentEvent; agents: AgentState[] }`.
  - `parseEnvelope(x: unknown): HookEnvelope` (lanza `ZodError`).
  - `classifyTool(name: string): { kind: ToolKind; source?: string }`
  - `summarizeToolInput(name: string, input: unknown): string | undefined`
  - `extensionLabel(tool: Pick<ToolInfo,'kind'|'source'>): string | undefined` → `"mcp: github"`, `"power: stripe"`, `"plugin: code-review"`; `undefined` para builtin.
  - `redact(text: string): string`, `truncate(text: string, max: number): string` (añade `…` al recortar).
  - `STATUS_LABELS: Record<AgentStatus,string>` = `{ working: 'Trabajando', waiting: 'Esperando input', error: 'Error', done: 'Terminado', stale: 'Inactivo' }`.

- [ ] **Step 1: Root scaffold.** Root `package.json` con `"private": true`, `"type": "module"`, `"workspaces": ["packages/*"]`, `"engines": {"node": ">=22.13"}`, scripts `test: vitest run`, `typecheck: tsc -p packages/shared && tsc -p packages/server && tsc -p packages/cli && tsc -p packages/web`, `build: npm run build -w @agentdash/web && npm run build -w @agentdash/cli`, `e2e: node e2e/smoke.cjs`. devDeps: `typescript@~5.9.3`, `vitest@^3.2.7`, `@types/node@^22`. `vitest.config.ts` con alias `@agentdash/shared` → `packages/shared/src/index.ts`. Run `npm install`. Expected: sin errores.
- [ ] **Step 2: Write failing tests**
```ts
// tools.test.ts
expect(classifyTool('Edit')).toEqual({ kind: 'builtin' });
expect(classifyTool('mcp__github__create_issue')).toEqual({ kind: 'mcp', source: 'github' });
expect(classifyTool('mcp__plugin_code-review_github__list')).toEqual({ kind: 'plugin', source: 'code-review' });
expect(classifyTool('@powers/stripe/search_docs')).toEqual({ kind: 'power', source: 'stripe' });
expect(classifyTool('stripe___search_docs')).toEqual({ kind: 'power', source: 'stripe' });
expect(classifyTool('@mcp/github/list_prs')).toEqual({ kind: 'mcp', source: 'github' });
expect(summarizeToolInput('Edit', { file_path: 'src/a.ts' })).toBe('src/a.ts');
expect(summarizeToolInput('Bash', { command: 'npm test' })).toBe('npm test');
expect(summarizeToolInput('Task', { description: 'run tests', subagent_type: 'test-runner' })).toBe('run tests');
expect(summarizeToolInput('x', { a: 'y'.repeat(500) })!.length).toBeLessThanOrEqual(120);
expect(extensionLabel({ kind: 'power', source: 'stripe' })).toBe('power: stripe');
// redact.test.ts
expect(redact('key sk-ant-abc123def456ghi789')).toBe('key «redactado»');
expect(redact('Authorization: Bearer eyJhbGciOi.x.y')).toContain('«redactado»');
expect(redact('password=hunter2 ok')).toBe('password=«redactado» ok');
expect(redact('-----BEGIN RSA PRIVATE KEY-----\nAAA\n-----END RSA PRIVATE KEY-----')).toBe('«redactado»');
expect(redact('ghp_' + 'a'.repeat(36))).toBe('«redactado»');
expect(truncate('abcdef', 4)).toBe('abc…');
// envelope.test.ts
expect(parseEnvelope({ v: 1, platform: 'claude', receivedAt: 1, payload: {} }).platform).toBe('claude');
expect(() => parseEnvelope({ v: 1, platform: 'otro', receivedAt: 1, payload: null })).toThrow();
```
- [ ] **Step 3: Run** `npx vitest run packages/shared` → FAIL (módulos no existen).
- [ ] **Step 4: Implement** los archivos de `packages/shared/src`. `summarizeToolInput`: primera clave presente en orden `file_path, path, command, pattern, url, query, description, prompt`; si no, `key=value` de las 2 primeras claves; siempre `redact` + `truncate(…, SUMMARY_MAX=120)`. `HookEnvelopeSchema` con `z.object` estricto en `v`/`platform`/`receivedAt`, `payload: z.unknown()`.
- [ ] **Step 5: Run** `npx vitest run packages/shared && npx tsc -p packages/shared` → PASS.
- [ ] **Step 6: Commit** `feat(shared): tipos, sobre del hook, clasificación de herramientas y redacción`

### Task 2: Adaptadores Claude y Kiro

**Files:**
- Create: `packages/server/{package.json,tsconfig.json}`, `packages/server/src/adapters/{common,claude,kiro,index}.ts`, fixtures en `packages/server/test/fixtures/`
- Test: `packages/server/test/adapters.test.ts`

**Interfaces:**
- Consumes: Task 1 (tipos, `classifyTool`, `summarizeToolInput`, `redact`, `truncate`).
- Produces: `adapt(env: HookEnvelope): AgentEvent[]` — nunca lanza; en error devuelve `[unparsedEvent(env, reason)]`. `sessionIdFor(env): string`.

Fixtures (uno por evento, sobre completo): `claude/{session-start,prompt,pre-edit,post-edit,post-bash-error,pre-task,post-task,pre-mcp,notification,stop,subagent-stop,session-end,tool-in-subagent}.json`, `kiro-cli/{agent-spawn,prompt,pre-tool,post-tool,pre-power,stop,v3-pre-tool}.json`, `kiro-ide/{empty-pre-tool,pre-tool-with-payload}.json`. Payloads con la forma documentada en spec §4.3 (`hook_event_name`, `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_use_id`, `tool_response`, `agent_id` en `tool-in-subagent`).

- [ ] **Step 1: Write failing tests** (helper `load(name)` lee el fixture):
```ts
const [e] = adapt(load('claude/pre-edit'));
expect(e).toMatchObject({ platform: 'claude', surface: 'cli', type: 'tool.start', sessionId: 'sess-1', agentId: 'sess-1', tool: { name: 'Edit', kind: 'builtin', callId: 'tu-1', summary: 'src/auth/session.ts' } });
expect(adapt(load('claude/post-bash-error'))[0].tool!.ok).toBe(false);
const t = adapt(load('claude/pre-task')).map(x => x.type);
expect(t).toEqual(['tool.start', 'subagent.start']);
expect(adapt(load('claude/pre-task'))[1]).toMatchObject({ agentId: 'sess-1:tu-task', parentAgentId: 'sess-1', subagent: { name: 'test-runner' } });
expect(adapt(load('claude/post-task')).map(x => x.type)).toEqual(['tool.end', 'subagent.end']);
expect(adapt(load('claude/pre-mcp'))[0].tool).toMatchObject({ kind: 'mcp', source: 'github' });
expect(adapt(load('claude/stop'))[0].type).toBe('waiting');
expect(adapt(load('claude/tool-in-subagent'))[0].externalAgentId).toBe('agent-7');
expect(adapt({ ...load('claude/pre-edit'), payload: { ...load('claude/pre-edit').payload, session_id: 'sess-2' } })[0].agentId).toBe('sess-2'); // Review Focus 2
// Kiro
expect(adapt(load('kiro-cli/pre-tool'))[0]).toMatchObject({ platform: 'kiro', surface: 'cli', type: 'tool.start', sessionId: 'kiro:cli:4242:/home/u/shop' });
expect(adapt(load('kiro-cli/v3-pre-tool'))[0].type).toBe('tool.start');
expect(adapt(load('kiro-cli/pre-power'))[0].tool).toMatchObject({ kind: 'power', source: 'stripe' });
expect(adapt(load('kiro-cli/agent-spawn'))[0].type).toBe('session.start');
expect(adapt(load('kiro-ide/empty-pre-tool'))[0]).toMatchObject({ surface: 'ide', type: 'tool.start', tool: { name: 'desconocida' } });
expect(adapt({ ...load('kiro-cli/pre-tool'), ppid: 9999 })[0].sessionId).not.toBe(adapt(load('kiro-cli/pre-tool'))[0].sessionId); // Review Focus 2
// Desconocido
expect(adapt({ v: 1, platform: 'claude', receivedAt: 1, payload: { hook_event_name: 'Nuevo' } })[0].type).toBe('unparsed');
expect(adapt(load('claude/pre-edit'))[0].raw!.length).toBeLessThanOrEqual(8192);
```
- [ ] **Step 2: Run** `npx vitest run packages/server/test/adapters.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Superficie Claude: `'vscode'` si `env.envHints?.CLAUDE_CODE_ENTRYPOINT` contiene `vscode` o `env.envHints?.TERM_PROGRAM === 'vscode'`; si no, `'cli'` (añadir el test correspondiente con un sobre que traiga `envHints: { TERM_PROGRAM: 'vscode' }`). Kiro: `kiro-cli` → `cli`, `kiro-ide` → `ide`. Normaliza el nombre del evento con `name.toLowerCase().replace(/[^a-z]/g,'')` y una tabla (`pretooluse`, `posttooluse`, `agentspawn`, `sessionstart`, `userpromptsubmit`, `promptsubmit`, `stop`, `agentstop`, `posttaskexecution`, …). `ok` = `!(tool_response?.is_error || tool_response?.error || (typeof tool_response?.exitCode === 'number' && tool_response.exitCode !== 0) || (typeof tool_response?.exit_status === 'number' && tool_response.exit_status !== 0))`. `raw = truncate(redact(JSON.stringify(payload ?? payloadText ?? null)), 8192)`. `id = crypto.randomUUID()`, `ts = env.receivedAt`.
- [ ] **Step 4: Run** tests → PASS; `npx tsc -p packages/server` → sin errores.
- [ ] **Step 5: Commit** `feat(server): adaptadores Claude y Kiro con fixtures`

### Task 3: Reductor de estado

**Files:**
- Create: `packages/server/src/state.ts`
- Test: `packages/server/test/state.test.ts`

**Interfaces:**
- Consumes: Task 1 tipos, `extensionLabel`.
- Produces: `type AgentMap = Map<string, AgentState>`; `reduce(agents: AgentMap, ev: AgentEvent): string[]` (muta el mapa, devuelve ids cambiados); `markStale(agents: AgentMap, now: number): string[]`.

- [ ] **Step 1: Write failing tests** (helper `ev(partial)` crea `AgentEvent` con valores por defecto):
```ts
reduce(m, ev({ type: 'session.start', cwd: '/home/u/api' }));
expect(m.get('s1')).toMatchObject({ status: 'waiting', name: 'api', platform: 'claude', toolCount: 0 });
reduce(m, ev({ type: 'prompt', text: 'refactoriza auth' }));
expect(m.get('s1')).toMatchObject({ status: 'working', title: 'refactoriza auth' });
reduce(m, ev({ type: 'tool.start', tool: { name: 'mcp__github__x', kind: 'mcp', source: 'github' } }));
expect(m.get('s1')!.currentTool!.name).toBe('mcp__github__x');
expect(m.get('s1')!.extensions).toEqual(['mcp: github']);
reduce(m, ev({ type: 'tool.end', tool: { name: 'Bash', kind: 'builtin', ok: false } }));
expect(m.get('s1')!.status).toBe('error');
reduce(m, ev({ type: 'waiting' }));
expect(m.get('s1')!.status).toBe('error');           // error se conserva
reduce(m, ev({ type: 'subagent.start', agentId: 's1:t1', parentAgentId: 's1', subagent: { name: 'test-runner' } }));
expect(m.get('s1')!.children).toEqual(['s1:t1']);
expect(m.get('s1:t1')).toMatchObject({ name: 'test-runner', parentId: 's1', status: 'working' });
reduce(m, ev({ type: 'session.end' }));
expect(m.get('s1')!.status).toBe('done'); expect(m.get('s1:t1')!.status).toBe('done');
// sin session.start
reduce(m2, ev({ sessionId: 'x', agentId: 'x', type: 'tool.end', tool: { name: 'Read', kind: 'builtin', ok: true } }));
expect(m2.get('x')!.status).toBe('working');
// stale
expect(markStale(m3, t0 + 600_001)).toEqual(['s9']); expect(m3.get('s9')!.status).toBe('stale');
// unparsed no cambia estado pero actualiza lastEventAt
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** según spec §5 (toolCount sube en `tool.start`; `currentTool` se limpia en `tool.end`/`waiting`/`session.end`, `lastTool` = último `tool.end`; un evento de un agente `stale` lo vuelve a `working`/`waiting` según el tipo). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): reductor de estado de agentes`

### Task 4: Almacén SQLite

**Files:**
- Create: `packages/server/src/store.ts`
- Test: `packages/server/test/store.test.ts`

**Interfaces:**
- Produces: `class EventStore { constructor(path: string); insert(ev: AgentEvent): void; since(ts: number): AgentEvent[] /* asc */; byAgent(agentId: string, limit: number): AgentEvent[] /* desc */; raw(platform: Platform | undefined, limit: number): AgentEvent[] /* desc */; prune(beforeTs: number): number; count(): number; close(): void }`. `path` acepta `':memory:'`; crea el directorio padre si no existe.

- [ ] **Step 1: Failing tests:** insertar 3 eventos (ts 1,2,3) → `since(2)` devuelve ts [2,3]; `byAgent('a',2)` devuelve los 2 más recientes de `a`; `prune(3)` devuelve 2 y `count()` = 1; `raw('kiro', 10)` solo kiro; un evento con `raw` y `tool` sobrevive la ida y vuelta (`toEqual`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** con `DatabaseSync` de `node:sqlite`, `PRAGMA journal_mode=WAL`, tabla e índices de spec §6, columna `json` con el evento completo. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): almacén de eventos en SQLite`

### Task 5: Pipeline + API HTTP/WS

**Files:**
- Create: `packages/server/src/pipeline.ts`, `packages/server/src/app.ts`, `packages/server/src/index.ts`
- Test: `packages/server/test/pipeline.test.ts`, `packages/server/test/app.test.ts`

**Interfaces:**
- Consumes: `adapt` (Task 2), `reduce`/`markStale` (Task 3), `EventStore` (Task 4).
- Produces:
  - `class Pipeline { constructor(store: EventStore | null); ingest(env: HookEnvelope): { events: AgentEvent[]; changed: AgentState[] }; agents(): AgentState[]; tick(now: number): AgentState[] /* markStale */; replay(events: AgentEvent[]): void }`.
  - `buildApp(opts: { store: EventStore | null; webDir?: string }): Promise<{ app: FastifyInstance; pipeline: Pipeline }>`.
  - `startServer(opts: { host?: string; port?: number; dbPath?: string; webDir?: string; retentionDays?: number }): Promise<{ url: string; close(): Promise<void> }>` — lee los env de Global Constraints como valores por defecto; replay de 24 h; intervalos de `tick` (30 s) y `prune` (1 h).

Reglas del pipeline (spec §4.3): `durationMs` = `ts(tool.end) − ts(tool.start)` emparejando por `callId` (mapa en memoria). Resolución de subagentes por sesión: `externalAgentId` → si ya está vinculado, usa ese hijo; si no, vincula al hijo activo más reciente sin vínculo; si no hay, crea `"<sessionId>:<externalAgentId>"` con `subagent.start` implícito. `subagent.end` sin `externalAgentId` cierra el hijo activo más reciente. Cada evento se guarda (store) y se reduce; el resultado lleva los estados cambiados.

- [ ] **Step 1: Failing pipeline tests:**
```ts
p.ingest(env('claude/pre-edit')); const r = p.ingest(env('claude/post-edit', { receivedAt: base + 1500 }));
expect(r.events[0].tool!.durationMs).toBe(1500);
p.ingest(env('claude/pre-task')); p.ingest(env('claude/tool-in-subagent'));
expect(p.agents().find(a => a.id === 'sess-1:tu-task')!.toolCount).toBe(1);   // atribuido al hijo
p.ingest(env('claude/subagent-stop'));
expect(p.agents().find(a => a.id === 'sess-1:tu-task')!.status).toBe('done');
const q = new Pipeline(null); q.ingest(env('claude/post-edit'));               // Review Focus 3
expect(q.agents()[0].status).toBe('working'); expect(q.agents()[0].lastTool!.durationMs).toBeUndefined();
const p2 = new Pipeline(null); p2.replay(store.since(0)); expect(p2.agents()).toEqual(p.agents()); // replay
```
- [ ] **Step 2: Failing app tests** (con `app.inject` y `new EventStore(':memory:')`):
```ts
expect((await inject('POST', '/api/ingest', envelope)).statusCode).toBe(202);
expect((await inject('POST', '/api/ingest', { v: 1, platform: 'nope' })).statusCode).toBe(400);
expect((await inject('GET', '/api/agents')).json()[0].id).toBe('sess-1');
expect((await inject('GET', '/api/agents/sess-1/events?limit=1')).json()).toHaveLength(1);
expect((await inject('GET', '/api/health')).json()).toMatchObject({ ok: true, agents: 1 });
// payload de 900 KB → 202 y raw ≤ 8192 (Review Focus 1)
// WS: startServer en puerto 0; cliente `ws` recibe primero {type:'snapshot'}, luego tras un POST {type:'event', agents:[…]}
```
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** Fastify con `bodyLimit: 1_048_576`, `@fastify/websocket` en `/ws`, `@fastify/static` en `webDir` si existe (con fallback `index.html`). Broadcast a todos los sockets abiertos. `devDependencies`: `ws@^8.18`, `@types/ws`. **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(server): pipeline, API HTTP y WebSocket`

### Task 6: El hook

**Files:**
- Create: `packages/cli/{package.json,tsconfig.json}`, `packages/cli/hook/hook.mjs`
- Test: `packages/cli/test/hook.test.ts`

**Interfaces:**
- Produces: script `node hook.mjs <claude|kiro-cli|kiro-ide> [eventHint]` que envía `HookEnvelope` a `${AGENTDASH_URL ?? 'http://127.0.0.1:4820'}/api/ingest`.

- [ ] **Step 1: Failing tests** (spawn `process.execPath hook.mjs …` con `input`):
```ts
// con servidor http de prueba que guarda el body
const r = spawnSync(node, [hook, 'claude'], { input: '{"hook_event_name":"Stop","session_id":"s"}', env: { ...process.env, AGENTDASH_URL: url } });
expect(r.status).toBe(0); expect(r.stdout.toString()).toBe('');
expect(received[0]).toMatchObject({ v: 1, platform: 'claude', payload: { session_id: 's' } });
expect(typeof received[0].ppid).toBe('number');
// con env TERM_PROGRAM=vscode → received envHints.TERM_PROGRAM === 'vscode'; solo se copian TERM_PROGRAM y CLAUDE_CODE_ENTRYPOINT (nunca otras variables, p. ej. KIRO_TOKEN no aparece)
// eventHint
spawn(['kiro-ide', 'PreToolUse'], '') → received.at(-1) toMatchObject({ platform: 'kiro-ide', eventHint: 'PreToolUse', payload: null });
// stdin no JSON → payload null y payloadText
// sin servidor (puerto cerrado): status 0, stdout '', duración < 2000 ms
// stdin de 3 MB → status 0 y el servidor recibe payloadText/payload de ≤ 1 MB (Review Focus 1)
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** con `fetch` + `AbortSignal.timeout(500)`, lectura de stdin con límite y timeout de 200 ms (`process.stdin.isTTY` → sin lectura), todo en `try/catch`, `process.exitCode = 0`. Plataforma inválida → sale con 0 sin enviar. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(cli): hook fail-open sin dependencias`

### Task 7: Instalador

**Files:**
- Create: `packages/cli/src/paths.ts`, `packages/cli/src/install/{claude,kiro-cli,kiro-ide,index}.ts`
- Test: `packages/cli/test/install.test.ts`

**Interfaces:**
- Produces:
  - `agentdashHome(home: string): string` → `<home>/.agentdash`
  - `hookCommand(home: string, platform: HookPlatform, eventHint?: string): string` → `node "<home>/.agentdash/hook.mjs" claude` (ruta siempre entre comillas dobles; separadores del SO).
  - `addClaudeHooks(settings: Record<string, unknown>, cmd: string): Record<string, unknown>`; `removeClaudeHooks(settings)`.
  - `addKiroCliHooks(agent: Record<string, unknown>, cmd: string)`; `removeKiroCliHooks(agent)`.
  - `kiroIdeHookFiles(home: string): Record<string /* filename */, object>`.
  - `install(target: 'claude'|'kiro-cli'|'kiro-ide', opts: { home: string; agent?: string; workspace?: string; print?: boolean; hookSource: string }): Promise<{ written: string[]; printed?: string; message: string }>`; `uninstall(target, opts)` con la misma forma.

- [ ] **Step 1: Failing tests** (con `home = mkdtemp()`):
```ts
const s = addClaudeHooks({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }] }, model: 'x' }, CMD);
expect(s.model).toBe('x');
expect(s.hooks.PreToolUse).toHaveLength(2);                                  // conserva el ajeno
expect(Object.keys(s.hooks).sort()).toEqual(['Notification','PostToolUse','PostToolUseFailure','PreToolUse','SessionEnd','SessionStart','Stop','SubagentStop','UserPromptSubmit']);
expect(addClaudeHooks(s, CMD)).toEqual(s);                                   // idempotente
expect(removeClaudeHooks(s).hooks.PreToolUse).toEqual([{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }]);
await install('claude', { home, hookSource });                               // escribe settings + .bak si existía + copia hook.mjs
expect(existsSync(join(home, '.agentdash/hook.mjs'))).toBe(true);
writeFileSync(settingsPath, '{ roto'); await expect(install('claude', { home, hookSource })).rejects.toThrow(/JSON/); expect(readFileSync(settingsPath,'utf8')).toBe('{ roto'); // Review Focus 4
expect(hookCommand('/Users/Juan Pérez', 'claude')).toBe('node "/Users/Juan Pérez/.agentdash/hook.mjs" claude'); // Review Focus 5
const k = addKiroCliHooks({ name: 'dev', tools: ['*'] }, CMD_K);
expect(Object.keys(k.hooks)).toEqual(['agentSpawn','userPromptSubmit','preToolUse','postToolUse','stop']);
expect(k.hooks.preToolUse[0]).toEqual({ matcher: '*', command: CMD_K });
// kiro-cli sin --agent con 2 agentes → rechaza con mensaje que lista ambos nombres
const files = kiroIdeHookFiles(home);
expect(Object.keys(files)).toEqual(['agentdash-pre-tool.json','agentdash-post-tool.json','agentdash-agent-stop.json','agentdash-prompt.json']);
expect(files['agentdash-pre-tool.json']).toMatchObject({ version: 'v1', trigger: 'PreToolUse', matcher: '*', action: { type: 'command', command: expect.stringContaining('kiro-ide PreToolUse') } });
expect((await install('claude', { home, hookSource, print: true })).written).toEqual([]);
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Entrada de Claude por evento: `{ matcher: '*', hooks: [{ type: 'command', command: cmd, timeout: 5 }] }` para `PreToolUse`/`PostToolUse`/`PostToolUseFailure`; sin `matcher` para el resto. Nuestro = cualquier `command` que contenga `.agentdash/hook.mjs` (normalizando `\`→`/`). Escritura con `.bak` previo y JSON con 2 espacios. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(cli): instalador de hooks para Claude, Kiro CLI y Kiro IDE`

### Task 8: CLI `agentdash` (start, install, uninstall, demo, export-fixtures) + build

**Files:**
- Create: `packages/cli/src/{demo,main}.ts`, `packages/cli/build.mjs`
- Test: `packages/cli/test/demo.test.ts`

**Interfaces:**
- Consumes: `startServer` (Task 5), `install`/`uninstall` (Task 7), `HookEnvelope`.
- Produces: `demoScript(now: number): Array<{ delayMs: number; envelope: HookEnvelope }>`; `runDemo(url: string, speed: number): Promise<number /* enviados */>`; binario `dist/agentdash.mjs`.

El guion reproduce los 6 agentes del mockup C: `refactor-auth` (Claude CLI, `mcp__github__*`, subagente `test-runner` vía `Task`), `lint-fix` (Claude, termina con `SessionEnd`), `checkout-spec` (Kiro IDE, termina en espera), `stripe-docs` (Kiro CLI con `@powers/stripe/search_docs`), `deploy-check` (Kiro CLI, `postToolUse` con `exit_status: 1`). Duración total ≈ 40 s a `speed 1`.

- [ ] **Step 1: Failing test:** `new Pipeline(null)` + ingest de todo `demoScript(0)` → hay 6 agentes; `test-runner` tiene `parentId` de `refactor-auth`; `stripe-docs.extensions` contiene `'power: stripe'`; `deploy-check.status === 'error'`; `checkout-spec.status === 'waiting'`; `lint-fix.status === 'done'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `demo.ts` y `main.ts` (`parseArgs`; comandos de spec §7; `export-fixtures` usa `GET /api/events/raw` y escribe `<out>/<platform>/<n>.json`). `build.mjs`: esbuild `bundle: true, platform: 'node', format: 'esm', target: 'node22'`, banner `#!/usr/bin/env node` + `createRequire`, salida `dist/agentdash.mjs`; copia `hook/hook.mjs` → `dist/hook.mjs` y `../web/dist` → `dist/web`. `package.json` `bin: { agentdash: 'dist/agentdash.mjs' }`. **Step 4: Run** tests → PASS; `npm run build -w @agentdash/cli && node packages/cli/dist/agentdash.mjs start --port 4899 &` + `curl -s localhost:4899/api/health` → `{"ok":true,…}`.
- [ ] **Step 5: Commit** `feat(cli): comandos start, install, demo y export-fixtures`

### Task 9: UI web (diseño C)

**Files:**
- Create: `packages/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `packages/web/src/{main.tsx,App.tsx,styles.css}`, `packages/web/src/lib/{flow,tree,format,ws}.ts`, `packages/web/src/components/{Header,OfficeStrip,Sprite,FlowTree,AgentDetail,EmptyState}.tsx`
- Test: `packages/web/src/lib/{flow,tree,format}.test.ts`

**Interfaces:**
- Consumes: tipos y `STATUS_LABELS` de shared; API y WS de Task 5.
- Produces:
  - `compressFlow(events: AgentEvent[], max?: number /* 12 */): Array<{ label: string; count: number; state: 'ok' | 'error' | 'now' | 'sub' }>` — orden cronológico, solo `tool.start` (+ estado del `tool.end` emparejado por `callId`), repeticiones seguidas del mismo nombre se fusionan con `count`.
  - `buildTree(agents: AgentState[], filter: 'all' | Platform): Array<{ agent: AgentState; depth: number }>` — raíces no terminadas por `lastEventAt` desc, cada una seguida de sus hijos (depth 1); raíces `done` al final.
  - `elapsed(ms: number): string` (`'4m 12s'`, `'1h 03m'`, `'48s'`); `clock(ts: number): string` (`'21:04:12'`).
  - `connect(url: string, onMessage: (m: WsMessage) => void, onStatus: (s: 'live' | 'reconnecting') => void): () => void` — backoff 500 ms ×2 hasta 10 s.

- [ ] **Step 1: Failing tests:**
```ts
expect(compressFlow([start('Read','a'), end('a'), start('Read','b'), end('b'), start('Edit','c')]))
  .toEqual([{ label: 'Read', count: 2, state: 'ok' }, { label: 'Edit', count: 1, state: 'now' }]);
expect(compressFlow([start('Bash','x'), end('x', false)])[0].state).toBe('error');
expect(compressFlow([start('Task','t')])[0].state).toBe('sub');
expect(compressFlow(Array.from({ length: 30 }, (_, i) => start('T' + i, 'c' + i))).length).toBe(12);
expect(buildTree([root('a', 'working', 5), child('a1', 'a'), root('b', 'done', 9), root('c', 'waiting', 7)], 'all').map(r => r.agent.id)).toEqual(['c', 'a', 'a1', 'b']);
expect(buildTree([root('a'), kiroRoot('k')], 'kiro').map(r => r.agent.id)).toEqual(['k']);
expect(elapsed(252_000)).toBe('4m 12s'); expect(elapsed(48_000)).toBe('48s'); expect(elapsed(3_780_000)).toBe('1h 03m');
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement libs** → **Step 4: Run** → PASS.
- [ ] **Step 5: Implement componentes** fieles al tablero C de los mockups: tokens CSS y fuentes de spec §8; `Sprite` dibuja los SVG pixel (persona/fantasma) con `shape-rendering="crispEdges"`, animación `@keyframes` de 2 cuadros solo con estado `working` y desactivada bajo `prefers-reduced-motion`; selección con `<button>` (accesible con teclado, `aria-pressed`); `AgentDetail` pide `GET /api/agents/:id/events?limit=200` al seleccionar y agrega eventos del WS del agente seleccionado; tiempo transcurrido se refresca cada segundo; el estado vacío muestra los comandos `npx agentdash install claude` y `npx agentdash demo`. Vite `server.proxy` de `/api` y `/ws` a `127.0.0.1:4820` para desarrollo.
- [ ] **Step 6: Verify** `npm run build -w @agentdash/web && npx tsc -p packages/web` → sin errores.
- [ ] **Step 7: Commit** `feat(web): UI híbrida con oficina, flujos y detalle`

### Task 10: Docker, README y e2e

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `e2e/smoke.cjs`; Modify: `README.md`

- [ ] **Step 1: e2e** `e2e/smoke.cjs` (CommonJS, `require('playwright')`): construye nada; asume `npm run build`; arranca `node packages/cli/dist/agentdash.mjs start --port 4899 --db :memory:`, espera `/api/health`, ejecuta `demo --url http://127.0.0.1:4899 --speed 8`, abre la UI y espera los textos `refactor-auth`, `test-runner`, `power: stripe`, `Error`; guarda `e2e/screenshot.png`; sale con 1 si algo falta.
- [ ] **Step 2: Run** `npm run build && npm run e2e` → `e2e ok` y screenshot.
- [ ] **Step 3: Docker.** Etapa `build` (`node:22-alpine`): copia manifests, `RUN --mount=type=secret,id=ca,required=false` con `NODE_EXTRA_CA_CERTS=/run/secrets/ca` si existe, `npm ci`, copia el resto, `npm run build`. Etapa final: solo `packages/cli/dist` + dependencias de runtime si esbuild no las empaqueta; `ENV AGENTDASH_HOST=0.0.0.0 AGENTDASH_DB=/data/agentdash.db`, `EXPOSE 4820`, `HEALTHCHECK` contra `/api/health`, `CMD ["node","dist/agentdash.mjs","start"]`. Compose: `ports: ["127.0.0.1:4820:4820"]`, volumen `agentdash-data:/data`, `restart: unless-stopped`.
- [ ] **Step 4: Verify** `docker compose up -d --build` → `curl -s 127.0.0.1:4820/api/health` devuelve `ok: true`; `node packages/cli/dist/agentdash.mjs demo` → `/api/agents` devuelve 6 agentes.
- [ ] **Step 5: README** en español: qué es, requisitos, levantar (Docker y sin Docker), instalar hooks (Claude, Kiro CLI con `--agent`, Kiro IDE con `--workspace`), `--print`, demo, privacidad y redacción, desinstalar, `export-fixtures` y cómo añadir una plataforma (archivo de adaptador + fixtures + entrada en `adapters/index.ts`).
- [ ] **Step 6: Commit** `feat: Docker, README y e2e`
