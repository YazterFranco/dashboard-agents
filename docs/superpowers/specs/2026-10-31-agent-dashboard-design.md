# AgentDash — dashboard multiplataforma de agentes (diseño v1)

Fecha: 2026-10-31 · Estado: aprobado en conversación (partes 1 y 2; parte 3 incluida aquí)

## 1. Objetivo

Ver en vivo a los agentes de IA trabajando en tareas, sin importar la plataforma.
La v1 cubre **Claude Code** (CLI y extensión de VS Code) y **Kiro** (IDE y CLI):
qué agente está activo, qué herramienta usa en este momento, sus subagentes,
qué extensiones usa (Powers de Kiro, plugins/MCP de Claude) y el historial.

Referencias: Pixel Agents (oficina pixel-art, lee transcripciones JSONL) y
claude-code-hooks-multi-agent-observability (hooks → servidor → WebSocket).
Tomamos lo visual de la primera y lo fiable de la segunda.

### Criterios de éxito

1. Al instalar los hooks y abrir una sesión de Claude Code o Kiro CLI, el agente
   aparece en el dashboard en < 1 s y su estado cambia con cada herramienta.
2. Los subagentes de Claude aparecen colgando de su agente padre.
3. Una herramienta de un Power de Kiro o de un MCP/plugin de Claude se etiqueta
   como tal (`power: stripe`, `mcp: github`, `plugin: code-review`).
4. Si el dashboard está apagado, los agentes funcionan exactamente igual (fail-open).
5. Se levanta con `docker compose up` o `npx agentdash start`.

### Fuera de alcance (v1)

- Lanzar tareas desde el dashboard (opción B) y aprobar/bloquear acciones (opción C).
  El modelo de eventos no las impide: se añadirán después.
- Multi-máquina / multi-usuario, autenticación, despliegue remoto.
- Otras plataformas (Codex, Gemini CLI…): solo se garantiza que añadirlas sea
  escribir un adaptador.
- Tema claro (los colores ya son tokens; se añade luego).

## 2. Arquitectura

```
 Claude Code (CLI / VS Code) ─┐
 Kiro IDE (.kiro/hooks)       ├─ agentdash-hook <plataforma> [evento] ──HTTP POST──▶ servidor
 Kiro CLI (agent config)      ┘   lee stdin, reenvía, exit 0                          │
                                                                                      ├─ adaptador → AgentEvent
                                                                                      ├─ SQLite (historial)
                                                                                      ├─ estado en memoria
                                                                                      └─ WebSocket ──▶ UI React
```

Monorepo TypeScript con npm workspaces:

| Paquete | Responsabilidad | Depende de |
| --- | --- | --- |
| `packages/shared` | Tipos y esquema zod de `HookEnvelope`, `AgentEvent`, `AgentState`, mensajes WS; clasificación de herramientas | zod |
| `packages/server` | Ingesta HTTP, adaptadores por plataforma, reductor de estado, almacén SQLite, WebSocket, servir la UI | shared, fastify, `node:sqlite` |
| `packages/web` | UI (diseño C · Híbrido) | shared, react, vite |
| `packages/cli` | Binario `agentdash`: `start`, `install`, `uninstall`, `demo`, `export-fixtures`; contiene el script del hook | server, shared |

## 3. El hook (`agentdash-hook`)

Archivo único `hook.mjs`, **sin dependencias**, Node ≥ 18. El instalador lo copia a
`~/.agentdash/hook.mjs` (ruta estable; no depende de la caché de npx).

Invocación: `node ~/.agentdash/hook.mjs <platform> [eventName]`

- `platform`: `claude` | `kiro-cli` | `kiro-ide`.
- `eventName` (opcional): lo pone el instalador cuando la plataforma puede no
  mandar payload (Kiro IDE), para saber qué evento ocurrió aunque stdin venga vacío.

Comportamiento:

1. Lee stdin hasta 1 MB (si no hay stdin o es TTY, sigue con `null`). Timeout de lectura 200 ms.
2. Construye el sobre `HookEnvelope`:
   `{ v: 1, platform, eventHint, receivedAt, cwd, ppid, pid, envHints, payload, payloadText }`
   (`payload` = JSON parseado o `null`; `payloadText` solo si no era JSON, recortado a 8 KB;
   `envHints` = solo `TERM_PROGRAM` y `CLAUDE_CODE_ENTRYPOINT`, para distinguir
   Claude CLI de Claude en VS Code; ninguna otra variable de entorno sale del proceso).
3. `POST ${AGENTDASH_URL:-http://127.0.0.1:4820}/api/ingest` con timeout de 500 ms.
4. **Siempre** `exit 0` y **nunca escribe en stdout**: en Claude Code y Kiro, el stdout de
   `SessionStart`/`UserPromptSubmit`/`agentSpawn` se inyecta en el contexto del agente, y un
   exit 2 en `PreToolUse` bloquea la herramienta. Errores van a stderr solo si `AGENTDASH_DEBUG=1`.

## 4. Modelo de eventos

### 4.1 `AgentEvent` (normalizado)

```ts
type Platform = 'claude' | 'kiro';
type Surface = 'cli' | 'ide' | 'vscode' | 'unknown';
type EventType =
  | 'session.start' | 'session.end'
  | 'prompt'
  | 'tool.start' | 'tool.end'
  | 'subagent.start' | 'subagent.end'
  | 'waiting'        // terminó su turno o pide permiso/input
  | 'unparsed';      // el adaptador no lo entendió; se guarda para depurar

interface ToolInfo {
  name: string;               // nombre crudo: "Edit", "mcp__github__create_issue", "fs_write"
  kind: 'builtin' | 'mcp' | 'power' | 'plugin';
  source?: string;            // "github", "stripe", "code-review"
  callId?: string;            // tool_use_id cuando existe (empareja start/end)
  summary?: string;           // "src/auth/session.ts", "npm test -- auth"
  ok?: boolean;               // solo en tool.end
  durationMs?: number;        // calculado por el servidor al emparejar start/end
}

interface AgentEvent {
  id: string;                 // uuid
  ts: number;                 // epoch ms (receivedAt del hook)
  platform: Platform;
  surface: Surface;
  sessionId: string;          // id de la sesión raíz
  agentId: string;            // = sessionId para el agente raíz; otro id para subagentes
  parentAgentId?: string;
  type: EventType;
  cwd?: string;
  text?: string;              // prompt (recortado), mensaje de notificación, motivo de fin
  tool?: ToolInfo;
  subagent?: { name: string; description?: string };
  raw?: string;               // payload original redactado y recortado a 8 KB
}
```

### 4.2 Identidad de sesión

- Claude: `session_id` del payload.
- Kiro: `session_id` si llega; si no, `kiro:<surface>:<ppid>:<cwd>`. El `ppid` del hook es el
  proceso del agente (CLI) o del IDE, estable mientras viva.

### 4.3 Adaptadores

Función pura `adapt(envelope): AgentEvent[]` por plataforma, más un registro
`adapters[platform]`. Cada adaptador acepta variantes de nombres de evento.

**Claude** (`hook_event_name`):

| Evento Claude | → `type` |
| --- | --- |
| `SessionStart` | `session.start` (`text` = source) |
| `UserPromptSubmit` | `prompt` (`text` = prompt) |
| `PreToolUse` | `tool.start`; si `tool_name` ∈ {`Task`, `Agent`} → también `subagent.start` |
| `PostToolUse` | `tool.end` (`ok` = no `is_error` / no `error` en `tool_response`); `Task`/`Agent` → también `subagent.end` |
| `PostToolUseFailure` | `tool.end` con `ok: false` |
| `Notification` | `waiting` (`text` = message) |
| `Stop` | `waiting` |
| `SubagentStart` / `SubagentStop` | `subagent.start` / `subagent.end` |
| `SessionEnd` | `session.end` (`text` = reason) |

Subagentes de Claude: el hijo se crea en el `PreToolUse` de `Task`/`Agent` con
`agentId = <session_id>:<tool_use_id>` y nombre = `subagent_type` o `description`.
Si los eventos traen `agent_id`, el servidor asocia ese `agent_id` al hijo activo más
reciente de la sesión y atribuye sus herramientas al hijo; si no, se atribuyen al padre.

**Kiro** (CLI v2 camelCase y v3 PascalCase; IDE con `eventHint`):

| Evento Kiro | → `type` |
| --- | --- |
| `agentSpawn` / `SessionStart` | `session.start` |
| `userPromptSubmit` / `UserPromptSubmit` | `prompt` |
| `preToolUse` / `PreToolUse` | `tool.start` |
| `postToolUse` / `PostToolUse` | `tool.end` |
| `stop` / `Stop` / `AgentStop` | `waiting` |
| `PostTaskExecution` | `waiting` (`text` = "tarea de spec completada") |

Si el payload viene vacío (Kiro IDE antiguo), el evento sale del `eventHint` y la
herramienta queda como `{ name: 'desconocida', kind: 'builtin' }`.

### 4.4 Clasificación de herramientas (`classifyTool`)

- `mcp__plugin_<plugin>_<server>__<tool>` → `plugin`, `source = <plugin>`.
- `mcp__<server>__<tool>` → `mcp`, `source = <server>`.
- Kiro: prefijo `@powers/`, `powers/`, `power_` o `<power>___<tool>` → `power`;
  prefijo `@mcp/` o `mcp_` → `mcp`. Patrones configurables; se confirmarán con payloads reales.
- Resto → `builtin`.

`summary` por herramienta conocida: ruta de archivo (`file_path`, `path`), comando
(`command`), patrón (`pattern`), URL (`url`), `description` de Task; si no, las primeras
claves del input. Máximo 120 caracteres.

### 4.5 Redacción

Antes de guardar `raw`, `text` y `summary` se reemplazan patrones de secretos
(`sk-…`, `ghp_…`, `AKIA…`, `xox[bp]-…`, `Bearer …`, `password=…`, `api[_-]?key…`,
bloques `-----BEGIN … PRIVATE KEY-----`) por `«redactado»`.

## 5. Estado de los agentes

Reductor puro `reduce(state, event): state` (mismo código en servidor; la UI recibe
el resultado). `AgentState`:

```ts
interface AgentState {
  id: string; sessionId: string; parentId?: string;
  platform: Platform; surface: Surface;
  name: string;          // raíz: nombre de la carpeta de cwd; subagente: subagent.name
  title?: string;        // primer prompt recortado
  cwd?: string;
  status: 'working' | 'waiting' | 'error' | 'done' | 'stale';
  currentTool?: ToolInfo & { startedAt: number };
  lastTool?: ToolInfo;
  extensions: string[];  // "power: stripe", "mcp: github", "plugin: code-review" (únicos)
  toolCount: number;
  startedAt: number; lastEventAt: number; endedAt?: number;
  children: string[];
}
```

Transiciones:

- `session.start` → crea el agente, `waiting` (espera el primer prompt).
- `prompt`, `tool.start`, `subagent.start` → `working`.
- `tool.end` con `ok: false` → `error` (se mantiene hasta el siguiente `prompt`/`tool.start`).
- `waiting` → `waiting` (salvo que esté en `error`, que se conserva).
- `session.end` → `done` (y los hijos aún abiertos también).
- `subagent.end` → hijo `done`.
- Sin eventos durante 10 min y no `done` → `stale` (lo calcula un temporizador del servidor).
- Un evento de una sesión desconocida crea el agente al vuelo (no se exige `session.start`).

Al arrancar, el servidor reconstruye el estado reproduciendo los eventos de las
últimas 24 h desde SQLite.

## 6. Servidor

- Fastify en `127.0.0.1:4820` (`AGENTDASH_HOST`, `AGENTDASH_PORT`). Solo localhost por defecto;
  en Docker escucha en `0.0.0.0` dentro del contenedor y se publica como `127.0.0.1:4820:4820`.
- `POST /api/ingest` (cuerpo `HookEnvelope`, límite 1 MB) → valida, adapta, guarda, reduce,
  difunde; responde `202 {accepted: n}`. Sobre inválido → `400`. Fallo del adaptador → evento
  `unparsed` con `raw`, nunca se descarta.
- `GET /api/health` → `{ ok, version, agents, events }`.
- `GET /api/agents` → `AgentState[]`.
- `GET /api/agents/:id/events?limit=200` → `AgentEvent[]` (más recientes primero).
- `GET /api/events/raw?platform=&limit=50` → para `export-fixtures`.
- `WS /ws` → al conectar `{type:'snapshot', agents}`; luego `{type:'event', event, agents: AgentState[] /* solo los cambiados */}`.
- Sirve `packages/web/dist` en `/`.
- SQLite con `node:sqlite` (sin dependencias nativas; Node ≥ 22.13). Tabla `events`
  (`id`, `ts`, `platform`, `surface`, `session_id`, `agent_id`, `parent_agent_id`, `type`, `json`)
  con índices por `ts` y `agent_id`. Retención 7 días (`AGENTDASH_RETENTION_DAYS`), poda al
  arrancar y cada hora. Ruta `~/.agentdash/agentdash.db` (`AGENTDASH_DB`).
- Si SQLite falla, se registra el error y el servidor sigue con el estado en memoria.

## 7. CLI `agentdash`

- `start [--port] [--host]` — arranca el servidor y la UI.
- `install <claude|kiro-cli|kiro-ide> [--agent <name>] [--workspace <dir>] [--print]`
  - Copia `hook.mjs` a `~/.agentdash/`.
  - `claude`: fusiona en `~/.claude/settings.json` un hook `command` por evento
    (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
    `Notification`, `Stop`, `SubagentStop`, `SessionEnd`), `matcher: "*"` donde aplica, `timeout: 5`.
  - `kiro-cli`: añade el bloque `hooks` (camelCase v2: `agentSpawn`, `userPromptSubmit`,
    `preToolUse`, `postToolUse`, `stop`) al agente `~/.kiro/agents/<name>.json`. Sin `--agent`:
    si hay uno solo lo usa; si no, lista los disponibles y sale con error.
  - `kiro-ide`: escribe un archivo `<workspace>/.kiro/hooks/agentdash-<evento>.json` por
    evento (`PreToolUse`, `PostToolUse`, `AgentStop`, `PromptSubmit`) con la forma v1 del IDE
    (`version`, `name`, `trigger`, `matcher`, `action.type = command`) y el evento como argumento.
  - `--print` muestra el JSON en vez de escribirlo (para pegarlo a mano si el formato cambió).
  - Idempotente; copia `.bak` antes de modificar; nuestras entradas se reconocen porque el
    comando contiene `.agentdash/hook.mjs`.
- `uninstall <destino>` — quita solo nuestras entradas.
- `demo [--speed]` — simulador: envía al servidor un guion realista (sesión Claude con
  subagente y MCP; Kiro CLI con un Power; Kiro IDE esperando aprobación; una herramienta
  que falla). Sirve para desarrollar, para el e2e y para probar sin agentes reales.
- `export-fixtures --out <dir>` — vuelca payloads reales recientes como fixtures de test.

## 8. UI (diseño C · Híbrido)

Mockups: https://claude.ai/artifact/ApBTmWVr7xBCMeGt7ieERA (tablero "C · Híbrido").

Vite + React + TypeScript, CSS con variables (sin framework de UI). Tema oscuro.
Tokens: fondo `#0F1115`, superficie `#171A21`, borde `#262B36`, texto `#E6E8EC`,
texto secundario `#9AA3B2`; Claude `#F0A060`, Kiro `#A897FF`; estados: trabajando
`#6CB6FF`, esperando `#F2C14E`, terminado `#5BD08A`, error `#FF7B72`, inactivo `#9AA3B2`.
Fuentes: Inter (UI), JetBrains Mono (herramientas), Silkscreen (nombres en la oficina).
Cada estado lleva siempre texto, no solo color.

Componentes:

- **Header**: marca, estado de la conexión (`en vivo` / `reconectando…`), filtros
  Todos/Claude/Kiro con contadores.
- **OfficeStrip**: un escritorio por agente no terminado (los `done` salen a los 10 min).
  Sprite pixel por plataforma (persona = Claude, fantasma = Kiro), burbuja con la herramienta
  actual, monitor del color del estado. Animación de 2 cuadros mientras trabaja; desactivada con
  `prefers-reduced-motion`. Click = seleccionar.
- **FlowTree**: agentes raíz agrupados con sus subagentes sangrados; estado, plataforma ·
  superficie, extensiones. Los terminados se agrupan al final, plegados.
- **AgentDetail**: cabecera (nombre, plataforma, cwd, tiempo transcurrido, estado, chips de
  extensiones), **Flujo** (últimas 12 herramientas como cadena; repeticiones seguidas se
  comprimen, p. ej. `Read ×3`), **Ahora** (herramienta en curso + resumen) y **Timeline**
  (eventos más recientes primero con duración y resultado).
- **Estado vacío**: "Aún no hay agentes" con los comandos `npx agentdash install claude` y
  `npx agentdash demo` listos para copiar.
- Cliente WS con reconexión exponencial (0.5 s → 10 s) y re-snapshot al reconectar.
- Responsive: en móvil el árbol y el detalle se apilan.

## 9. Manejo de errores

| Situación | Comportamiento |
| --- | --- |
| Dashboard apagado | El hook agota su timeout (500 ms) y sale con 0. El agente no nota nada. |
| Payload desconocido | Evento `unparsed` con `raw`; visible en el timeline como "evento no reconocido". |
| Kiro IDE sin payload | Evento a partir del `eventHint`; herramienta "desconocida". |
| Agente muere sin `SessionEnd` | Pasa a `stale` tras 10 min. |
| SQLite no disponible | Log de error y solo memoria. |
| WS caído | La UI muestra "reconectando…" y reintenta. |

## 10. Testing

- **Vitest** en todos los paquetes.
- `shared`: esquemas y `classifyTool`.
- `server`: adaptadores con fixtures JSON por plataforma/evento (primero según la
  documentación; se completan con `export-fixtures` desde tu máquina), reductor de estado
  (puro), almacén con SQLite en memoria, rutas con `fastify.inject`, WS de extremo a extremo.
- `cli`: hook (sale con 0 sin servidor; reenvía el sobre con servidor; no escribe en stdout);
  instalador con un `HOME` temporal (fusión, idempotencia, `.bak`, `uninstall`).
- `web`: funciones puras (compresión del flujo, agrupado del árbol) y un e2e con Playwright:
  servidor + `demo` → aparecen los agentes, el subagente y el chip `power: stripe`.

## 11. Entrega

- `Dockerfile` multi-etapa (`node:22-alpine`): construye web + server, imagen final sin dev deps.
- `docker-compose.yml`: servicio `agentdash`, puerto `127.0.0.1:4820:4820`, volumen `agentdash-data`.
- README en español: requisitos, levantar, instalar hooks por plataforma, demo, privacidad,
  desinstalar, cómo añadir una plataforma.

## 12. Riesgos y verificaciones pendientes (requieren tu máquina)

1. Formato exacto de los archivos de hooks del Kiro IDE v1 y qué payload manda hoy.
2. Cómo nombra Kiro las herramientas de un Power en `tool_name`.
3. Si los eventos de herramientas dentro de un subagente de Claude traen `agent_id`.
4. Si Kiro CLI manda `session_id`.

Mitigación: adaptadores tolerantes, `--print` en el instalador, eventos `unparsed`
visibles y `export-fixtures` para convertir payloads reales en tests.
