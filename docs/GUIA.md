# Guía completa de AgentDash

Esta guía explica, paso a paso, qué necesitas, cómo desplegar AgentDash, cómo usarlo cada día y
cómo seguir ampliándolo. Si solo quieres verlo funcionar sin instalar nada, abre
[`docs/demo/index.html`](demo/index.html) en tu navegador.

- [1. Cómo funciona (en 1 minuto)](#1-cómo-funciona-en-1-minuto)
- [2. Requisitos](#2-requisitos)
- [3. Despliegue](#3-despliegue)
- [4. Uso](#4-uso)
- [5. Solución de problemas](#5-solución-de-problemas)
- [6. Cómo seguir ampliándolo](#6-cómo-seguir-ampliándolo)

---

## 1. Cómo funciona (en 1 minuto)

```
 Claude Code / Kiro                     tu máquina                                   navegador
┌──────────────────┐  hook   ┌──────────────────────┐  HTTP   ┌────────────────────────────┐  WebSocket  ┌─────────┐
│ PreToolUse, Stop │ ──────▶ │ ~/.agentdash/hook.mjs │ ──────▶ │ servidor 127.0.0.1:4820     │ ──────────▶ │   UI    │
│ SessionStart…    │         │ (lee stdin, exit 0)   │         │ adaptadores → SQLite (7 d)  │             │         │
└──────────────────┘         └──────────────────────┘         └────────────────────────────┘             └─────────┘
```

1. Claude Code y Kiro ejecutan **hooks**: comandos que lanzan en momentos concretos (empieza una
   sesión, va a usar una herramienta, terminó su turno…), pasándoles un JSON por stdin.
2. El instalador de AgentDash registra como hook un script pequeño, `hook.mjs`. Ese script reenvía el
   JSON al servidor local y termina enseguida. **Nunca bloquea al agente**: si el servidor no responde
   en 500 ms, se rinde en silencio y sale con código 0.
3. El servidor traduce los eventos de cada plataforma a un formato común, calcula el estado de cada
   agente, guarda el historial en SQLite y empuja los cambios a la UI por WebSocket.

---

## 2. Requisitos

| Qué | Versión | Para qué |
| --- | --- | --- |
| **Node.js** | 22.13 o superior | Compilar el proyecto, ejecutar el servidor sin Docker y el instalador de hooks |
| **npm** | el que trae Node 22 | Instalar dependencias |
| **git** | cualquiera reciente | Clonar el repo |
| **Docker + Docker Compose v2** | opcional | Levantar el servidor en un contenedor |
| **Claude Code** | versión reciente con hooks | CLI o extensión de VS Code |
| **Kiro CLI** | versión con hooks en la config del agente | `~/.kiro/agents/*.json` |
| **Kiro IDE** | 1.0 o superior (hooks en `.kiro/hooks/`) | Por proyecto |
| Navegador | Chrome, Edge, Firefox o Safari actuales | Ver el dashboard |

**Puerto:** el dashboard usa el **4820** en `127.0.0.1`. Si está ocupado, cámbialo (ver
[configuración](#47-configuración)).

**Sistemas operativos:** se desarrolló y probó en Linux. macOS debería funcionar igual (el hook usa
`ps` para identificar la sesión). En Windows el servidor y la UI funcionan; los hooks de Kiro se
agrupan por carpeta porque allí no es posible identificar el proceso del agente de forma barata.

Comprueba tu versión de Node:

```bash
node --version
```

Debe mostrar `v22.13.0` o superior. Si tienes una anterior, instala Node 22 LTS desde
<https://nodejs.org> o con `nvm install 22`.

---

## 3. Despliegue

AgentDash está pensado para correr **en tu propia máquina**, junto a tus agentes. Hay tres formas
de desplegarlo; la recomendada es la 3.1.

### 3.0 Clonar y compilar (siempre)

Este paso es necesario en todos los casos, porque el instalador de hooks se ejecuta desde el repo.

```bash
git clone https://github.com/YazterFranco/dashboard-agents.git
```

```bash
cd dashboard-agents
```

```bash
npm install
```

```bash
npm run build
```

Comprueba que el CLI funciona:

```bash
npm run agentdash -- --version
```

Debe responder `0.1.0`.

> **No uses `npx agentdash`.** En npm existe un paquete público con ese nombre que no tiene nada que
> ver con este proyecto; fuera del repo `npx` lo descargaría y lo ejecutaría. Usa siempre
> `npm run agentdash -- <comando>` desde la carpeta del repo, o enlaza el comando una vez:
>
> ```bash
> npm link -w @agentdash/cli
> ```
>
> Después de eso, `agentdash <comando>` funciona en cualquier carpeta.

### 3.1 Con Docker (recomendado)

El contenedor arranca solo al iniciar Docker, guarda el historial en un volumen y publica el puerto
**solo en localhost**.

1. Construye y arranca:

   ```bash
   docker compose up -d --build
   ```

2. Comprueba que está sano (debe decir `"ok":true`):

   ```bash
   curl -s http://127.0.0.1:4820/api/health
   ```

3. Abre <http://127.0.0.1:4820> en el navegador. Verás la pantalla «Aún no hay agentes».

Operaciones habituales:

| Para | Comando |
| --- | --- |
| Ver logs | `docker compose logs -f agentdash` |
| Parar | `docker compose stop` |
| Arrancar de nuevo | `docker compose start` |
| Reiniciar | `docker compose restart` |
| Borrar contenedor (conserva el historial) | `docker compose down` |
| Borrar contenedor **y** historial | `docker compose down -v` |

**Copia de seguridad del historial** (el volumen se llama `dashboard-agents_agentdash-data`):

```bash
docker run --rm -v dashboard-agents_agentdash-data:/data -v "$PWD":/backup alpine cp /data/agentdash.db /backup/agentdash-backup.db
```

> Si clonaste el repo en una carpeta con otro nombre, el volumen se llama `<carpeta>_agentdash-data`.
> Compruébalo con `docker volume ls`.

**Detrás de un proxy corporativo:** si `npm ci` falla dentro del build por certificados, pasa el
certificado de tu empresa como *secret* (no queda guardado en la imagen):

```bash
docker build --secret id=ca,src=/ruta/a/ca-empresa.crt -t agentdash:local .
```

```bash
docker compose up -d
```

### 3.2 Sin Docker (Node directamente)

```bash
npm run agentdash -- start
```

Deja esa terminal abierta. El historial se guarda en `~/.agentdash/agentdash.db`.

Para que arranque solo al iniciar sesión, crea un servicio del sistema.

**Linux (systemd de usuario).** Crea `~/.config/systemd/user/agentdash.service` (cambia la ruta del repo;
si instalaste Node con `nvm`, pon la ruta completa de `node` en lugar de `/usr/bin/env node`):

```ini
[Unit]
Description=AgentDash

[Service]
WorkingDirectory=%h/dashboard-agents
ExecStart=/usr/bin/env node packages/cli/bin/agentdash.mjs start
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now agentdash
```

**macOS (launchd).** Crea `~/Library/LaunchAgents/dev.agentdash.plist` (cambia las dos rutas):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.agentdash</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/tu-usuario/dashboard-agents/packages/cli/bin/agentdash.mjs</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/dev.agentdash.plist
```

### 3.3 En un servidor compartido (equipo)

AgentDash **no tiene usuarios ni contraseñas**: cualquiera que llegue al puerto ve la actividad de
los agentes (prompts, rutas, comandos). Por eso, por defecto, solo escucha en localhost. Para
compartirlo con un equipo, la forma segura es **no abrir el puerto** y usar un túnel SSH:

1. En el servidor, despliega con Docker como en 3.1 (el puerto queda en `127.0.0.1:4820` del servidor).
2. Cada persona abre un túnel desde su máquina:

   ```bash
   ssh -N -L 4820:127.0.0.1:4820 usuario@tu-servidor
   ```

3. Con el túnel abierto, para esa persona todo funciona como si fuera local: sus hooks envían a
   `127.0.0.1:4820` (que llega al servidor) y abre el dashboard en <http://127.0.0.1:4820>.

Alternativas: una VPN como Tailscale o WireGuard, o un proxy inverso con autenticación (Caddy,
Nginx con *basic auth*, Cloudflare Access). Para que el puerto sea accesible desde fuera del servidor,
cambia en `docker-compose.yml` la línea `"127.0.0.1:4820:4820"` por `"4820:4820"` (hazlo solo dentro
de una red de confianza o detrás de esa autenticación). Si publicas el servidor con otro nombre o IP, añádelo a
`AGENTDASH_ALLOWED_HOSTS` (por ejemplo `AGENTDASH_ALLOWED_HOSTS=agentdash.miempresa.local`) y apunta
los hooks a esa dirección con `AGENTDASH_URL`. Si no, el servidor rechaza las peticiones con 403
(es la protección contra webs maliciosas y *DNS rebinding*).

### 3.4 Actualizar a una versión nueva

```bash
git pull
```

```bash
npm install && npm run build
```

Con Docker, reconstruye el contenedor (el historial se conserva):

```bash
docker compose up -d --build
```

Vuelve a ejecutar el instalador de cada plataforma que uses, para copiar el `hook.mjs` nuevo a
`~/.agentdash/`. Es seguro repetirlo:

```bash
npm run agentdash -- install claude
```

### 3.5 Desinstalar por completo

```bash
npm run agentdash -- uninstall claude
```

```bash
npm run agentdash -- uninstall kiro-cli --agent mi-agente
```

```bash
npm run agentdash -- uninstall kiro-ide --workspace /ruta/a/mi-proyecto
```

```bash
docker compose down -v
```

Por último borra la carpeta `~/.agentdash` (el hook y el historial sin Docker).

---

## 4. Uso

### 4.1 Conectar Claude Code

```bash
npm run agentdash -- install claude
```

Qué hace:

- Copia el hook a `~/.agentdash/hook.mjs`.
- Añade un hook por evento en `~/.claude/settings.json` (`SessionStart`, `UserPromptSubmit`,
  `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `Stop`, `SubagentStop`,
  `SessionEnd`). Tus otros hooks y ajustes no se tocan.
- Guarda una copia `settings.json.bak` antes de modificar el archivo.

Sirve para la CLI de Claude Code **y** para la extensión de VS Code, porque ambas leen ese archivo.
**Abre una sesión nueva** para que cargue los hooks.

### 4.2 Conectar Kiro CLI

Los hooks de Kiro CLI van dentro de la configuración de un agente (`~/.kiro/agents/<nombre>.json`):

```bash
npm run agentdash -- install kiro-cli --agent mi-agente
```

Si solo tienes un agente puedes omitir `--agent`. Si tienes varios y no lo indicas, el instalador
te dice cuáles hay. Inicia una sesión nueva con ese agente.

### 4.3 Conectar Kiro IDE

En el IDE los hooks son **por proyecto** (`<proyecto>/.kiro/hooks/`):

```bash
npm run agentdash -- install kiro-ide --workspace /ruta/a/mi-proyecto
```

Se crean cuatro archivos `agentdash-*.json`. Si no aparecen en el panel de hooks de Kiro, recarga
la ventana. Repite el comando en cada proyecto que quieras ver.

### 4.4 Si prefieres instalarlo a mano

Añade `--print` a cualquier instalación y te muestra el JSON sin tocar nada, para que lo pegues tú
(útil si tu versión de Kiro usa otro formato):

```bash
npm run agentdash -- install kiro-ide --print
```

### 4.5 Comprobar que llega algo

Sin abrir ningún agente, puedes simular un evento con el propio hook:

```bash
echo '{"hook_event_name":"UserPromptSubmit","session_id":"prueba","cwd":"/tmp/prueba","prompt":"hola"}' | node ~/.agentdash/hook.mjs claude
```

En el dashboard aparecerá un agente llamado `prueba` en estado «Trabajando». O lanza la demo
completa (≈40 s de actividad simulada de 6 agentes):

```bash
npm run agentdash -- demo
```

### 4.6 Leer el dashboard

| Zona | Qué muestra |
| --- | --- |
| **Cabecera** | Conexión (`en vivo` / `reconectando…`) y filtros Todos / Claude / Kiro con su número de agentes |
| **Oficina** | Un escritorio por agente. Silueta = plataforma (persona Claude, fantasma Kiro). Burbuja = herramienta actual. Monitor = color del estado. Los terminados desaparecen a los 10 min |
| **Flujos** | Agentes con sus subagentes debajo, plataforma y extensiones (`mcp: github`, `power: stripe`, `plugin: …`). Los terminados se agrupan al final |
| **Detalle** | Carpeta, tiempo, primer prompt, cadena de herramientas (`Read ×3 → Edit → …`), qué hace ahora y timeline con duración y resultado |

Estados:

| Estado | Cuándo |
| --- | --- |
| ● Trabajando | Llega un prompt o empieza una herramienta |
| ● Esperando input | Terminó su turno o pide un permiso |
| ● Error | La última herramienta falló; se mantiene hasta el siguiente prompt o herramienta |
| ● Terminado | La sesión o el subagente terminó |
| ● Inactivo | 10 minutos sin eventos (por ejemplo, cerraste la terminal) |

### 4.7 Configuración

Variables de entorno del **servidor** (en Docker, añádelas en `docker-compose.yml` bajo `environment:`):

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `AGENTDASH_PORT` | `4820` | Puerto |
| `AGENTDASH_HOST` | `127.0.0.1` | Interfaz donde escucha |
| `AGENTDASH_DB` | `~/.agentdash/agentdash.db` | Ruta del historial |
| `AGENTDASH_RETENTION_DAYS` | `7` | Días de historial que se conservan |
| `AGENTDASH_ALLOWED_HOSTS` | — | Nombres o IPs extra permitidos, separados por comas |

Variables del **hook** (en el entorno de tu agente, por ejemplo tu `~/.bashrc` o `~/.zshrc`):

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `AGENTDASH_URL` | `http://127.0.0.1:4820` | Dónde enviar los eventos (si cambiaste el puerto o usas un servidor) |
| `AGENTDASH_DEBUG` | — | `1` para que el hook escriba sus errores en stderr |

Si cambias el puerto, cambia los dos lados: el servidor (`AGENTDASH_PORT`, y en Docker también la
línea `ports:`) y los hooks (`AGENTDASH_URL`).

### 4.8 Privacidad

- El servidor solo acepta peticiones con `Host` y `Origin` locales: una web que visites no puede
  leer tu actividad.
- El hook solo copia dos variables de entorno (`TERM_PROGRAM`, `CLAUDE_CODE_ENTRYPOINT`) y recorta
  cada texto a 2000 caracteres.
- Antes de guardar se redactan patrones de secretos (`sk-…`, `ghp_…`, `AKIA…`, `Bearer …`,
  `password=…`, claves privadas) y cada payload se limita a 8 KB.
- El historial se borra solo a los 7 días.

---

## 5. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| No aparece ningún agente | La sesión se abrió antes de instalar los hooks | Abre una sesión nueva. Prueba con el comando de [4.5](#45-comprobar-que-llega-algo) |
| El comando de 4.5 no hace aparecer nada | El servidor no corre o está en otro puerto | `curl -s http://127.0.0.1:4820/api/health`; revisa `AGENTDASH_URL` |
| `403 host no permitido` u `origen no permitido` | Abriste el dashboard con un nombre que no es local | Usa `127.0.0.1` o `localhost`, o añade el nombre a `AGENTDASH_ALLOWED_HOSTS` |
| `EADDRINUSE` al arrancar | El puerto 4820 está ocupado | Usa otro con `AGENTDASH_PORT` y ajusta `AGENTDASH_URL` |
| `falta compilar` | No se ejecutó el build | `npm install && npm run build` |
| `No such built-in module: node:sqlite` al arrancar | Node < 22.13 | Actualiza Node (`node --version`) |
| `no es JSON válido; no lo modifico` | Tu `settings.json` o el JSON del agente tiene un error | Corrígelo, o usa `--print` y pega el bloque a mano |
| Eventos de Kiro como «Evento no reconocido» | Tu versión de Kiro usa nombres o campos distintos | Ver [6.4](#64-ajustar-kiro-con-payloads-reales) |
| Cada evento de Kiro crea un agente distinto | En Windows no se puede identificar el proceso del agente | Se agrupan por carpeta; usa una carpeta por sesión |

Para depurar el hook, ejecútalo con `AGENTDASH_DEBUG=1`; escribirá en stderr por qué no pudo enviar:

```bash
echo '{}' | AGENTDASH_DEBUG=1 node ~/.agentdash/hook.mjs claude
```

Endpoints útiles: `GET /api/health`, `GET /api/agents`, `GET /api/agents/<id>/events`,
`GET /api/events/raw?platform=kiro`.

---

## 6. Cómo seguir ampliándolo

### 6.1 Mapa del código

| Paquete | Archivo | Responsabilidad |
| --- | --- | --- |
| `packages/shared` | `src/types.ts` | Tipos: `HookEnvelope`, `AgentEvent`, `AgentState`, mensajes WS |
| | `src/envelope.ts` | Validación del sobre que envía el hook (zod) |
| | `src/tools.ts` | `classifyTool` (builtin / mcp / power / plugin) y resúmenes |
| | `src/redact.ts` | Redacción de secretos |
| `packages/server` | `src/adapters/claude.ts`, `kiro.ts` | Traducen cada plataforma a `AgentEvent` |
| | `src/pipeline.ts` | Subagentes, duraciones, persistencia, desalojo |
| | `src/state.ts` | Máquina de estados de cada agente |
| | `src/store.ts` | SQLite |
| | `src/app.ts` | API HTTP, WebSocket, protección Host/Origin |
| `packages/cli` | `hook/hook.mjs` | El hook (sin dependencias) |
| | `src/install/` | Instaladores por plataforma |
| | `src/demo.ts`, `src/main.ts` | Demo y comandos del CLI |
| `packages/web` | `src/lib/` | Lógica pura de la UI (con tests) |
| | `src/components/` | Componentes React |

Recorrido de un evento: `hook.mjs` → `POST /api/ingest` → `parseEnvelope` → `adapt()` →
`Pipeline.resolve` (subagentes) → `pairDuration` → `EventStore.insert` → `reduce()` → WebSocket → UI.

### 6.2 Entorno de desarrollo

```bash
npm test
```

```bash
npm run typecheck
```

Para trabajar en la UI con recarga en caliente, arranca el servidor en una terminal y Vite en otra
(Vite reenvía `/api` y `/ws` al 4820):

```bash
npm run agentdash -- start
```

```bash
npm run dev -w @agentdash/web
```

Tras cambiar el servidor o el CLI, recompila (`npm run build`) y reinicia el servidor. La prueba de
extremo a extremo (servidor real + demo + navegador) necesita Playwright instalado:

```bash
npm run build && npm run e2e
```

Reglas del proyecto:

- **TDD:** cada cambio empieza con un test que falla.
- **El contrato del hook no se rompe:** sin dependencias, nada en stdout, siempre `exit 0`.
- La lógica de la UI vive en `packages/web/src/lib/` como funciones puras con tests; los componentes solo pintan.
- Textos de la UI en español; identificadores en inglés.

### 6.3 Añadir una plataforma nueva (ejemplo: Gemini CLI o Codex)

1. **Tipos.** Añade la plataforma en `packages/shared/src/types.ts` (`Platform` y `HookPlatform`) y
   en el `z.enum` de `packages/shared/src/envelope.ts`.
2. **Hook.** Añade el nombre al conjunto `PLATFORMS` de `packages/cli/hook/hook.mjs`.
3. **Fixtures.** Guarda payloads reales en `packages/server/test/fixtures/<plataforma>/` (uno por
   evento) y escribe sus tests en `packages/server/test/adapters.test.ts`.
4. **Adaptador.** Crea `packages/server/src/adapters/<plataforma>.ts` con una función
   `adaptX(env: HookEnvelope): AgentEvent[]`, usando `kiro.ts` como plantilla: normaliza el nombre del
   evento con `normEvent` y reutiliza `baseEvent`, `toolFrom` y `cleanText` de `common.ts`.
   Regístrala en `packages/server/src/adapters/index.ts`.
5. **Instalador.** Crea `packages/cli/src/install/<plataforma>.ts` (añadir, quitar e idempotencia,
   como `kiro-cli.ts`), conéctalo en `install/index.ts` y añade su test en `install.test.ts`.
6. **UI.** Añade el color y la etiqueta en `packages/web/src/lib/format.ts` (`platformLabel`), en
   los estilos (`.platform-x`) y, si quieres, una silueta nueva en `components/Sprite.tsx`.

### 6.4 Ajustar Kiro con payloads reales

Los hooks de Kiro cambian entre versiones. Cuando algo salga como «Evento no reconocido»:

1. Exporta los eventos reales:

   ```bash
   npm run agentdash -- export-fixtures --out fixtures --platform kiro
   ```

2. Revisa que no contengan datos privados y copia los útiles a
   `packages/server/test/fixtures/kiro-cli/` o `kiro-ide/`.
3. Escribe el test que falla en `adapters.test.ts`, corrige `adapters/kiro.ts` y, si la herramienta
   de un Power tiene otro formato de nombre, ajusta `classifyTool` en `packages/shared/src/tools.ts`.

### 6.5 Ideas para las siguientes versiones

| Idea | Por dónde empezar |
| --- | --- |
| **Aprobar o bloquear acciones** desde el dashboard | Un hook `PreToolUse` puede bloquear con exit 2. Añadir un modo opcional en que el hook espere la decisión de la UI (con timeout) |
| **Lanzar tareas** desde el dashboard | Ejecutar `claude -p "…"` o `kiro-cli` en modo no interactivo desde el servidor |
| **Coste y tokens** por sesión | Claude envía `transcript_path`; leer el uso de tokens del transcript al recibir `Stop` |
| **Notificaciones** cuando un agente espera o falla | Notificaciones del navegador al pasar a `waiting` o `error` |
| **Tema claro** | Los colores ya son variables CSS en `packages/web/src/styles.css` |
| **Multiusuario con login** | Autenticación en `app.ts` antes de exponerlo fuera de localhost |
| **Publicar en npm** | Con otro nombre (`agentdash` ya existe en npm) |
