# Asistente de Lucca — Fase 1 (base y "Mi semana") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una aplicación en `lucca/` que, sin IA ni Mereb todavía, sirve la pantalla "Mi semana" (estilo C · Bento, oscuro y claro, ES/EN, voz Escuchar/Leer/Ambos) con tareas guardadas en SQLite.

**Architecture:** Monorepo npm independiente en `lucca/` (`shared` = esquemas y lógica de fechas/estrellas/estados que corren en servidor y navegador; `server` = Fastify + `node:sqlite` solo para red privada; `web` = React + Vite). El servidor entrega el estado crudo (`/api/kid/state`) y el navegador calcula la vista del día con la lógica compartida. Las tareas de esta fase vienen de un sembrado de demostración (`LUCCA_DEMO=1`); la sincronización con Mereb y el área del padre son fases siguientes.

**Tech Stack:** Node ≥ 22.13, TypeScript ~5.9, Fastify 5 (+ `@fastify/static`), zod 4, `node:sqlite`, React 19, Vite 7, vitest 3 (+ jsdom y Testing Library), esbuild, tsx (solo desarrollo), `@fontsource/andika` y `@fontsource/bricolage-grotesque`, Playwright (preinstalado, solo verificación de layout).

**Spec:** `openspec/changes/add-lucca-homework-assistant/` (`proposal.md`, `design.md`, `specs/lucca/*/spec.md`, `tasks.md` secciones 1 y 2). Diseño visual: lienzo "Asistente de Lucca — estilos", tablero "C · Bento".

## Global Constraints

- Node ≥ 22.13; ESM en todo (`"type": "module"`); identificadores en inglés, textos de interfaz en español e inglés, documentación en español.
- Zona horaria por defecto `America/Panama`; puerto por defecto `4830`; host por defecto `0.0.0.0`; BD por defecto `./data/lucca.db`.
- El servidor MUST rechazar con 403 toda petición cuya IP no sea privada (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10` e IPv4 mapeada en IPv6).
- Estrellas: nunca restan; empiezan de cero cada lunes (semana lunes–domingo en la zona horaria configurada).
- Controles de Lucca ≥ 60 × 60 px CSS; acciones principales ≥ 76 px de alto; texto de lectura ≥ 19 px; sin desplazamiento horizontal a 1024×768 y 768×1024.
- Voz: velocidad por defecto 0,9; voces preferidas en español `es-PA`, `es-MX`, `es-US`, `es-419`, luego cualquier `es-*`; en inglés `en-US`, luego cualquier `en-*`. Modo por defecto `both`, idioma `es`, tema `dark`.
- Fuentes autoalojadas (`@fontsource/*`); la web no pide nada a servicios externos.
- Textos fijos de la spec (copiar tal cual): `¡Nada más por hoy! Tiempo de jugar.`, `Pídele a papá que conecte tu agenda`, `¡Para hoy!`, `Entregar: mié 18`, `Hoy, martes 17 · Te faltan 2 tareas`.
- Nada de `ANTHROPIC_API_KEY`, Mereb ni área del padre en esta fase.

## Review Focus

1. **Cerca de medianoche UTC** (Panamá es UTC−5; a las 22:00 locales ya es el día siguiente en UTC): la fecha de "hoy" y la semana de las estrellas se calculan en la zona horaria configurada → tests en Task 2 y Task 3.
2. **Fin de semana:** en sábado o domingo la vista abre el lunes siguiente, y una tarea con entrega ese lunes aparece ese lunes como "¡Para hoy!" → test en Task 2.
3. **IP privada con formas raras:** `::ffff:192.168.1.5`, `172.15.x.x` y `172.32.x.x` (fuera del rango), `100.64.x.x` (CGNAT, no es la casa) → test en Task 4.
4. **Eventos repetidos** (doble toque en "¡Terminé!" o reintento de red): no dan una segunda estrella ni cambian el estado → test en Task 3 y Task 6.
5. **`speechSynthesis` ausente** (navegadores sin voz): pulsar escuchar no lanza errores y la interfaz no muestra nada técnico → test en Task 8.

---

## File Structure

```
lucca/
  package.json  tsconfig.base.json  vitest.config.ts  .gitignore  .env.example  README.md
  packages/shared/   src/{index,schemas,week,progress}.ts          test/{schemas,week,progress}.test.ts
  packages/server/   src/{config,privateNet,db,app,seed,index}.ts  test/{config,privateNet,db,app,seed}.test.ts
  packages/web/      index.html  vite.config.ts  public/{manifest.webmanifest,icon.svg}
                     src/{main.tsx,App.tsx,styles.css,i18n.ts,prefs.ts,speaker.ts,api.ts,*.test.ts(x)}
                     src/components/{WeekScreen,DayStrip,TaskCard,Mascot,StarsTile,Controls,SubjectIcon}.tsx
  e2e/layout.cjs
```

---

### Task 1: Andamiaje del monorepo y esquemas compartidos

**Files:**
- Create: `lucca/package.json`, `lucca/tsconfig.base.json`, `lucca/vitest.config.ts`, `lucca/.gitignore`, `lucca/.env.example`
- Create: `lucca/packages/shared/{package.json,tsconfig.json,src/index.ts,src/schemas.ts,test/schemas.test.ts}`

**Interfaces:**
- Produces (`@lucca/shared`, en `src/schemas.ts`, reexportado por `src/index.ts`):
  - `type IsoDate = string` y `IsoDateSchema` (`YYYY-MM-DD` y fecha real)
  - `SUBJECTS = ['math','spanish','english','science','social','art','music','pe','religion','other'] as const`, `type Subject`
  - `TASK_STATUSES = ['todo','doing','done'] as const`, `type TaskStatus`
  - `LANGS = ['es','en'] as const`, `type Lang`; `VOICE_MODES = ['audio','text','both'] as const`, `type VoiceMode`; `THEMES = ['dark','light'] as const`, `type Theme`
  - `TaskSchema` / `type Task = { id: string; subject: Subject; subjectLabel?: string; title: string; titleTranslations: Partial<Record<Lang, string>>; description: string; assignedDate: IsoDate | null; dueDate: IsoDate | null; source: 'mereb' | 'photo' | 'manual'; status: TaskStatus; hidden: boolean; retired: boolean }` (por defecto: `titleTranslations {}`, `description ''`, `assignedDate null`, `dueDate null`, `hidden false`, `retired false`, `status 'todo'`)
  - `SettingsSchema` / `type Settings = { childName: string; lang: Lang; voiceMode: VoiceMode; theme: Theme; tz: string }` (defecto `Lucca`, `es`, `both`, `dark`, `America/Panama`)
  - `taskTitle(task: Task, lang: Lang): string` → traducción si existe, si no `task.title`

- [ ] **Step 1: Crear el esqueleto.** `lucca/package.json` (`name: "lucca-monorepo"`, `private`, `type: module`, `engines.node: ">=22.13"`, workspaces `packages/shared|server|web`, scripts `test` = `vitest run`, `typecheck` = `tsc -p` de cada paquete, `build`, `dev:server`, `dev:web`, `start`); `tsconfig.base.json` copiado de AgentDash con `paths` `@lucca/shared`; `vitest.config.ts` con alias `@lucca/shared` y `include: ['packages/*/test/**/*.test.ts', 'packages/web/src/**/*.test.{ts,tsx}']`; `.gitignore` con `node_modules/`, `dist/`, `data/`, `.env`, `*.db`, `*.db-*`; `.env.example` con `ANTHROPIC_API_KEY=`, `MEREB_URL=`, `MEREB_USER=`, `MEREB_PASSWORD=`, `MEREB_STUDENT=`, `LUCCA_PUBLIC_URL=`, `LUCCA_PORT=4830`, `LUCCA_DEMO=0`, `TZ=America/Panama` (todo vacío salvo los valores por defecto). `packages/shared` depende solo de `zod ^4.1.13`.
- [ ] **Step 2: Escribir `test/schemas.test.ts` (debe fallar):** `accepts a manual task with defaults` (el resultado trae `hidden false`, `retired false`, `titleTranslations {}`); `rejects an impossible date` (`'2026-02-30'` y `'17/11/2026'` fallan en `IsoDateSchema`); `rejects an unknown subject`; `taskTitle prefers the translation` (`{en:'The parts of a plant'}` con `'en'`) `and falls back to the original title`; `settings defaults` (`SettingsSchema.parse({})` = Lucca/es/both/dark/America/Panama).
- [ ] **Step 3: Ejecutar** `cd lucca && npm install && npx vitest run packages/shared` → FAIL (no existe `schemas.ts`).
- [ ] **Step 4: Implementar** `schemas.ts` con zod 4 (la fecha real se valida con un `refine` que reconstruye la fecha en UTC) e `index.ts` que reexporta.
- [ ] **Step 5: Ejecutar** `npx vitest run packages/shared && npm run typecheck` → PASS.
- [ ] **Step 6: Commit** `feat(lucca): andamiaje del monorepo y esquemas compartidos`.

---

### Task 2: Lógica de semana y de "día de trabajo"

**Files:**
- Create: `lucca/packages/shared/src/week.ts`, `lucca/packages/shared/test/week.test.ts`
- Modify: `lucca/packages/shared/src/index.ts` (reexportar)

**Interfaces:**
- Consumes: `IsoDate`, `Task`, `Lang` de Task 1.
- Produces (todas puras, sin `Date.now()`):
  - `localDate(now: Date, tz: string): IsoDate`
  - `weekdayOf(date: IsoDate): number` (0 = domingo … 6 = sábado)
  - `addDays(date: IsoDate, n: number): IsoDate`
  - `mondayOf(date: IsoDate): IsoDate` (lunes de la semana lunes–domingo que contiene `date`)
  - `plannerToday(today: IsoDate): IsoDate` (sábado/domingo → lunes siguiente; si no, igual)
  - `weekDays(anchor: IsoDate): IsoDate[]` (lunes a viernes de esa semana)
  - `previousSchoolDay(date: IsoDate): IsoDate` (salta fines de semana)
  - `workDateOf(t: Pick<Task,'assignedDate'|'dueDate'>, today: IsoDate): IsoDate` (`assignedDate`, o `previousSchoolDay(dueDate)`, o `today` si no hay fechas)
  - `interface DayTask { task: Task; dueDate: IsoDate | null; urgent: boolean }`
  - `dayTasks(tasks: Task[], day: IsoDate, today: IsoDate): DayTask[]`: excluye `hidden`/`retired`; una tarea no lista con `dueDate <= today` se mueve a `today` y es `urgent`; las demás van a su `workDateOf`; orden estable por materia y título
  - `interface DaySummary { date: IsoDate; total: number; pending: number; allDone: boolean }` y `weekSummary(tasks: Task[], days: IsoDate[], today: IsoDate): DaySummary[]` (misma regla de ubicación que `dayTasks`)

- [ ] **Step 1: Escribir `test/week.test.ts` (debe fallar).** Fechas de referencia: martes 2026-11-17, lunes 2026-11-23. Tests y aserciones:
  - `localDate converts near midnight`: `localDate(new Date('2026-11-18T03:00:00Z'), 'America/Panama')` = `'2026-11-17'`; con `'2026-11-18T05:00:00Z'` = `'2026-11-18'`.
  - `weekdayOf / addDays / mondayOf`: `weekdayOf('2026-11-17')` = 2; `addDays('2026-11-30', 1)` = `'2026-12-01'`; `mondayOf('2026-11-22')` = `'2026-11-16'`; `mondayOf('2026-11-23')` = `'2026-11-23'`.
  - `plannerToday on weekends`: `'2026-11-21'` y `'2026-11-22'` → `'2026-11-23'`; `'2026-11-17'` queda igual.
  - `weekDays` de `'2026-11-17'` = `['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20']`.
  - `previousSchoolDay`: `'2026-11-23'` → `'2026-11-20'`; `'2026-11-18'` → `'2026-11-17'`.
  - `workDateOf`: entrega miércoles 18 sin fecha asignada → `'2026-11-17'`; con `assignedDate` `'2026-11-16'` gana la asignada; sin fechas → `today`.
  - `dayTasks puts a due-Wednesday task on Tuesday keeping its due date`: en `dayTasks(tasks,'2026-11-17','2026-11-17')` aparece con `dueDate '2026-11-18'` y `urgent false`.
  - `dayTasks moves an overdue unfinished task to today as urgent` (entrega lunes 16, hoy martes 17); la misma tarea con `status 'done'` no se mueve.
  - `weekend rollover`: con `today = plannerToday('2026-11-22')` = `'2026-11-23'`, una tarea que se entrega el lunes 23 aparece el lunes 23 con `urgent true`.
  - `dayTasks hides hidden and retired tasks`.
  - `weekSummary` cuenta `total`, `pending` y `allDone` (un día sin tareas tiene `allDone false`).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/test/week.test.ts` → FAIL.
- [ ] **Step 3: Implementar `week.ts`.** Aritmética de fechas solo con `Date.UTC` y `getUTCDay`; `localDate` con `Intl.DateTimeFormat('en-CA', { timeZone, year, month, day })`.
- [ ] **Step 4: Ejecutar** el mismo comando → PASS; luego `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(lucca): lógica de semana y día de trabajo`.

---

### Task 3: Progreso, estados y estrellas

**Files:**
- Create: `lucca/packages/shared/src/progress.ts`, `lucca/packages/shared/test/progress.test.ts`
- Modify: `lucca/packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `localDate`, `addDays`, `mondayOf`, `IsoDate`, `TaskStatus` (Tasks 1–2).
- Produces:
  - `PROGRESS_KINDS = ['lesson_step','lesson_done','practice_done','task_done','hint_used','help_requested'] as const`, `type ProgressKind`, `ProgressKindSchema`
  - `interface ProgressEvent { id: string; taskId: string; kind: ProgressKind; at: string }` (`at` = instante ISO en UTC)
  - `STAR_KINDS: ProgressKind[]` = `['lesson_done','practice_done','task_done']`
  - `starsForWeek(events: ProgressEvent[], weekStart: IsoDate, tz: string): number` (una estrella por cada pareja distinta `taskId`+`kind` de `STAR_KINDS` cuyo `at`, en la zona horaria, cae entre `weekStart` y `weekStart + 6`)
  - `nextStatus(current: TaskStatus, kind: ProgressKind): TaskStatus` (`task_done` → `done`; `lesson_step`/`lesson_done`/`practice_done`/`hint_used` desde `todo` → `doing`; `done` nunca retrocede)

- [ ] **Step 1: Escribir `test/progress.test.ts` (debe fallar):** `one star per distinct task and kind` (tres eventos distintos del mismo `taskId` = 3 estrellas); `duplicates do not add stars` (dos `task_done` iguales = 1); `lesson_step, hint_used and help_requested give no stars`; `week boundary uses the timezone`: con `weekStart '2026-11-16'` y `tz America/Panama`, un `task_done` en `'2026-11-23T04:30:00Z'` (domingo 23:30 local) cuenta, y uno en `'2026-11-23T05:30:00Z'` (lunes 00:30 local) no cuenta y sí cuenta con `weekStart '2026-11-23'`; `stars never decrease when a hint is used afterwards`; `nextStatus transitions` (`todo`+`lesson_step`→`doing`; `doing`+`task_done`→`done`; `done`+`lesson_step`→`done`; `todo`+`help_requested`→`todo`).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/shared/test/progress.test.ts` → FAIL.
- [ ] **Step 3: Implementar `progress.ts`.**
- [ ] **Step 4: Ejecutar** los tests y `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): progreso, estados y estrellas`.

---

### Task 4: Configuración y control de red privada

**Files:**
- Create: `lucca/packages/server/{package.json,tsconfig.json}`, `src/config.ts`, `src/privateNet.ts`, `test/config.test.ts`, `test/privateNet.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores (solo `zod` y Node).
- Produces:
  - `isPrivateAddress(ip: string): boolean`
  - `interface Config { host: string; port: number; dbPath: string; tz: string; demo: boolean; webDir: string | null; publicUrl: string | null; aiConfigured: boolean }`
  - `loadConfig(env: NodeJS.ProcessEnv): Config` — `LUCCA_HOST` (0.0.0.0), `LUCCA_PORT` (4830, entero 1–65535 o lanza `Error`), `LUCCA_DB` (`./data/lucca.db`), `TZ` (America/Panama; debe ser una zona válida para `Intl` o lanza), `LUCCA_DEMO` (`'1'` → true), `LUCCA_WEB_DIR` (null), `LUCCA_PUBLIC_URL` (null, sin barra final), `aiConfigured` = `Boolean(env.ANTHROPIC_API_KEY)`. El valor de la clave nunca se guarda.
- `server/package.json`: dependencias `@lucca/shared`, `fastify ^5.12.7`, `@fastify/static ^8.3.0`; dev `tsx`, `esbuild ^0.25.12`.

- [ ] **Step 1: Escribir `test/privateNet.test.ts` (debe fallar):** acepta `127.0.0.1`, `10.1.2.3`, `192.168.1.50`, `172.16.0.1`, `172.17.0.1`, `172.31.255.255`, `169.254.1.1`, `::1`, `::ffff:192.168.1.5`, `::ffff:127.0.0.1`, `fd12:3456::1`, `fe80::1`; rechaza `8.8.8.8`, `172.15.255.255`, `172.32.0.1`, `192.169.0.1`, `100.64.0.1`, `::ffff:8.8.8.8`, `2001:4860:4860::8888`, `''`, `'not-an-ip'`, `'192.168.1'`.
- [ ] **Step 2: Escribir `test/config.test.ts` (debe fallar):** `defaults` (`loadConfig({})` = 0.0.0.0 / 4830 / `./data/lucca.db` / America/Panama / demo false / `aiConfigured false`); `reads overrides`; `rejects an invalid port` (`'abc'`, `'70000'`); `rejects an invalid timezone`; `never keeps the API key` (`JSON.stringify(loadConfig({ANTHROPIC_API_KEY:'sk-test'}))` no contiene `sk-test` y `aiConfigured` es true); `strips a trailing slash from the public url`.
- [ ] **Step 3: Ejecutar** `npx vitest run packages/server` → FAIL.
- [ ] **Step 4: Implementar** `privateNet.ts` (IPv4 por octetos, IPv6 con `node:net` `isIPv6` y prefijos; desenvolver `::ffff:a.b.c.d`) y `config.ts`.
- [ ] **Step 5: Ejecutar** los tests y `npm run typecheck` → PASS.
- [ ] **Step 6: Commit** `feat(lucca): configuración y control de red privada`.

---

### Task 5: Base de datos SQLite

**Files:**
- Create: `lucca/packages/server/src/db.ts`, `lucca/packages/server/test/db.test.ts`

**Interfaces:**
- Consumes: `Task`, `TaskStatus`, `ProgressEvent`, `Settings`, `SettingsSchema` de `@lucca/shared`.
- Produces: `class LuccaDb`:
  - `constructor(path: string)` (`':memory:'` permitido; crea la carpeta si hace falta; carga `node:sqlite` con `createRequire` como `EventStore` de AgentDash; `PRAGMA journal_mode = WAL`; ejecuta las migraciones)
  - `close(): void`, `schemaVersion(): number` (usa `PRAGMA user_version`; la migración 1 crea `tasks`, `progress_events`, `settings`, `parent_sessions`)
  - `upsertTask(task: Task): void`, `getTask(id: string): Task | null`, `listTasks(): Task[]`, `setTaskStatus(id: string, status: TaskStatus): void`
  - `addProgress(ev: ProgressEvent): void` (solo añade; ignora un `id` repetido), `listProgress(): ProgressEvent[]` (ascendente por `at`)
  - `getSettings(): Settings`, `setSettings(patch: Partial<Settings>): Settings`

- [ ] **Step 1: Escribir `test/db.test.ts` (debe fallar):** `migrates an empty db and is idempotent` (abrir dos veces el mismo archivo temporal → `schemaVersion()` = 1 en ambas y sin error); `roundtrips a task with translations` (`upsertTask` + `getTask` devuelven un objeto igual, incluidos `titleTranslations` y `null` en fechas); `upsertTask updates an existing id instead of duplicating`; `listTasks returns every task`; `setTaskStatus changes only the status`; `progress is append-only and ascending` (insertar fuera de orden → ascendente; mismo `id` dos veces → una fila); `settings default and patch` (`getSettings()` = defaults; `setSettings({lang:'en'})` conserva el resto y persiste tras reabrir).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/server/test/db.test.ts` → FAIL.
- [ ] **Step 3: Implementar `db.ts`** guardando `titleTranslations` y `settings` como JSON; los booleanos como 0/1.
- [ ] **Step 4: Ejecutar** el test y `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): base de datos SQLite con migraciones`.

---

### Task 6: API de Lucca, sembrado de demostración y arranque

**Files:**
- Create: `lucca/packages/server/src/{app,seed,index}.ts`, `lucca/packages/server/test/{app,seed}.test.ts`

**Interfaces:**
- Consumes: `LuccaDb` (Task 5), `Config`/`loadConfig`/`isPrivateAddress` (Task 4), `localDate`, `mondayOf`, `plannerToday`, `weekDays`, `addDays`, `starsForWeek`, `nextStatus`, `ProgressKindSchema`, `Task` (Tasks 1–3).
- Produces:
  - `buildApp(opts: { db: LuccaDb; config: Config; now?: () => Date }): Promise<FastifyInstance>`
  - `GET /api/health` → `{ ok: true, version: string, db: 'ok', ai: 'configured' | 'unconfigured' }` (sin ningún secreto)
  - `GET /api/kid/state` → `{ today: IsoDate; weekStart: IsoDate; settings: Settings; tasks: Task[]; starsThisWeek: number }` (sin tareas `hidden` ni `retired`; `today` = `localDate(now, tz)`; `weekStart` = `mondayOf(today)`; `settings.tz` = `config.tz`)
  - `POST /api/kid/progress` con `{ taskId: string; kind: ProgressKind }` → `{ status: TaskStatus; starsThisWeek: number }`; 404 si la tarea no existe; 400 si el cuerpo no cumple el esquema; guarda el evento y actualiza el estado con `nextStatus`; un evento idéntico a uno ya guardado de la misma tarea y tipo en `STAR_KINDS` no vuelve a sumar (las estrellas ya cuentan por pareja distinta)
  - Hook `onRequest`: 403 `{ error: 'solo red local' }` si `!isPrivateAddress(req.ip)`
  - Si `config.webDir` existe: sirve la web con `@fastify/static` y devuelve `index.html` para rutas no `/api` desconocidas
  - `seedDemo(db: LuccaDb, today: IsoDate): void` (idempotente, ids `demo-*`): crea las tareas de ejemplo de la semana de `plannerToday(today)` con las fechas relativas al lunes: lunes — Matemáticas «Sumas con llevadas, pág. 24» y Inglés «Palabras: cat, hat, bat» (ambas `done`); martes — Ciencias «Las partes de la planta» (`doing`), Matemáticas «Restas sin llevar, pág. 26» y Español «Leer “La semilla mágica” y dibujar el final»; miércoles — Inglés «Lectura: “My Pet”» y Arte «Dibujo de mi familia»; jueves — Matemáticas «Problemas con monedas» y Ciencias «Traer una hoja del jardín»; viernes — Español «Dictado de palabras con “ll”». Todas con `source 'manual'`, `assignedDate` = su día, `dueDate` = el día siguiente escolar, y `titleTranslations.en` con la versión en inglés de cada título.
  - `index.ts`: lee `loadConfig(process.env)`, abre la BD, `seedDemo` si `config.demo`, `buildApp`, `listen({ host, port })` y registra la URL; sale con código 1 y mensaje claro si la configuración es inválida.

- [ ] **Step 1: Escribir `test/seed.test.ts` (debe fallar):** `seeds the week of the planner day` (con `today '2026-11-17'` hay 12 tareas); `is idempotent` (sembrar dos veces = 12); `uses next week when today is a weekend` (`today '2026-11-22'` → la primera tarea cae el `'2026-11-23'`); `every task has an english title`.
- [ ] **Step 2: Escribir `test/app.test.ts` (debe fallar)** usando `app.inject`, una BD `:memory:` y un reloj fijo `2026-11-18T03:00:00Z` (= martes 17 en Panamá): `health has no secrets` (200, `ok true`, el JSON no contiene el valor de una `ANTHROPIC_API_KEY` ni rutas de archivos); `rejects public addresses` (`remoteAddress '8.8.8.8'` → 403 `solo red local`; `'192.168.1.50'` → 200); `state returns today and the week start` (`today '2026-11-17'`, `weekStart '2026-11-16'`); `state hides hidden and retired tasks`; `progress moves todo to doing on the first step`; `task_done marks it done and gives one star`; `a repeated task_done adds no second star` (dos POST iguales → `starsThisWeek` 1); `unknown task is 404`; `invalid kind is 400`; `serves index.html for unknown non-api routes when webDir is set` (carpeta temporal con `index.html`); `unknown /api route stays 404 JSON`.
- [ ] **Step 3: Ejecutar** `npx vitest run packages/server` → FAIL.
- [ ] **Step 4: Implementar** `seed.ts`, `app.ts` e `index.ts`. En `package.json` raíz: `dev:server` = `LUCCA_DEMO=1 tsx packages/server/src/index.ts`.
- [ ] **Step 5: Ejecutar** `npx vitest run packages/server && npm run typecheck` → PASS.
- [ ] **Step 6: Comprobar a mano** `LUCCA_DEMO=1 LUCCA_DB=:memory: npx tsx packages/server/src/index.ts &` y `curl -s localhost:4830/api/kid/state | head -c 400` → muestra `today`, `tasks` y `starsThisWeek`; detener el proceso.
- [ ] **Step 7: Commit** `feat(lucca): API del niño, sembrado de demostración y arranque`.

---

### Task 7: Web — andamiaje, tokens Bento, idioma y preferencias

**Files:**
- Create: `lucca/packages/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/{main.tsx,styles.css,i18n.ts,prefs.ts,api.ts}`, `src/i18n.test.ts`, `src/prefs.test.ts`
- Create: `lucca/packages/web/public/{manifest.webmanifest,icon.svg}`

**Interfaces:**
- Consumes: `Lang`, `VoiceMode`, `Theme`, `IsoDate`, `Task`, `Settings`, `ProgressKind` de `@lucca/shared`.
- Produces:
  - `src/i18n.ts`: `t(lang: Lang, key: MessageKey): string`; `dayShort(lang, weekday: number): string` (`Lun…Vie` / `Mon…Fri`); `dayLong(lang, weekday): string` (`martes`/`Tuesday`); `dueLabel(lang, date: IsoDate): string` → ES `Entregar: mié 18`, EN `Due: Wed 18`; `summaryLine(lang, a: { isToday: boolean; date: IsoDate; pending: number }): string` → ES `Hoy, martes 17 · Te faltan 2 tareas` (singular `Te falta 1 tarea`), `Hoy, martes 17 · ¡Todo listo!`, otro día `Miércoles 18 · 2 tareas por hacer`; EN `Today, Tuesday 17 · 2 tasks left`, etc. `MessageKey` cubre: saludo (`hello`), `week`, `today`, `urgent` (`¡Para hoy!` / `Due today!`), `start`/`continue`/`review`, `statusTodo|Doing|Done`, `freeDay` (`¡Nada más por hoy! Tiempo de jugar.`), `noAgenda` (`Pídele a papá que conecte tu agenda`), `listen`, `mascotSuggest` (con `{subject}`), `starsThisWeek`, `modeListen|Read|Both`, `modeLabel`, `langLabel`, `subjects.*`.
  - `src/prefs.ts`: `interface Prefs { lang: Lang; voiceMode: VoiceMode; theme: Theme }`; `loadPrefs(defaults: Prefs, storage?: Pick<Storage,'getItem'>): Prefs`; `savePrefs(p: Prefs, storage?: Pick<Storage,'setItem'>): void` (claves `lucca.lang`, `lucca.mode`, `lucca.theme`; **toda** lectura/escritura envuelta en `try/catch`; valores inválidos → el valor por defecto)
  - `src/api.ts`: `fetchState(): Promise<KidState>` (`GET /api/kid/state`), `postProgress(taskId: string, kind: ProgressKind): Promise<{ status: TaskStatus; starsThisWeek: number }>`; lanzan `Error` si la respuesta no es 2xx.
  - `styles.css`: variables CSS de la paleta Bento. Oscuro (`:root`): `--bg #0F1626`, `--tile #1B2436`, `--chip #263149`, `--ink #F4F6FB`, `--muted #A9B4C8`, `--line #4A5670`; claro (`[data-theme="light"]`): `#EEF1F6`, `#FFFFFF`, `#E6EAF1`, `#101828`, `#4A5568`, `#B8C2D2`; `--accent #C6F432`; `--star #FFD15C`; `--nova #B79CFF`; materias `--subj-math #7CC4FF`, `--subj-spanish #FF8A7A`, `--subj-english #B79CFF`, `--subj-science #C6F432`, `--subj-art #6EE7B7`, `--subj-social #FFB86B`, `--subj-music #F9A8D4`, `--subj-pe #FDE68A`, `--subj-religion #CBD5E1`, `--subj-other #CBD5E1`; `--tap: 60px`, `--tap-primary: 76px`, `--radius-tile: 36px`; fuentes Andika (lectura) y Bricolage Grotesque 700/800 (títulos) importadas de `@fontsource/*`; `:focus-visible` con anillo visible; `@media (prefers-reduced-motion: reduce)` sin animaciones.
  - `vite.config.ts`: alias `@lucca/shared`, proxy `/api` → `http://127.0.0.1:4830`, `build.outDir 'dist'`. `index.html`: `lang="es"`, `viewport`, `theme-color`, enlace al manifiesto y al icono, sin fuentes externas. `manifest.webmanifest`: `name "Asistente de Lucca"`, `short_name "Lucca"`, `display "standalone"`, `start_url "/"`, iconos SVG.

- [ ] **Step 1: Escribir `src/i18n.test.ts` y `src/prefs.test.ts` (deben fallar).** i18n: `dayShort('es',1)`=`Lun`, `dayShort('en',3)`=`Wed`; `dueLabel('es','2026-11-18')`=`Entregar: mié 18`; `dueLabel('en','2026-11-18')`=`Due: Wed 18`; `summaryLine('es',{isToday:true,date:'2026-11-17',pending:2})`=`Hoy, martes 17 · Te faltan 2 tareas`; con `pending:1` → `Hoy, martes 17 · Te falta 1 tarea`; con `pending:0` → `Hoy, martes 17 · ¡Todo listo!`; `summaryLine('en',{isToday:false,date:'2026-11-18',pending:2})`=`Wednesday 18 · 2 tasks to do`; `t('es','freeDay')`=`¡Nada más por hoy! Tiempo de jugar.`; **toda clave de `MessageKey` existe en ES y en EN** (recorrer las claves del diccionario). prefs: `loadPrefs` devuelve los defaults con almacenamiento vacío; lee valores guardados; ignora valores inválidos (`lang='fr'`); no lanza si `getItem` lanza (almacenamiento bloqueado); `savePrefs` no lanza si `setItem` lanza.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web` → FAIL.
- [ ] **Step 3: Instalar y crear** `packages/web` (deps: `react ^19.3.1`, `react-dom ^19.3.1`, `@lucca/shared`, `@fontsource/andika`, `@fontsource/bricolage-grotesque`; dev: `vite ^7.3.7`, `@vitejs/plugin-react ^5.2.0`, `@types/react`, `@types/react-dom`, `jsdom`, `@testing-library/react`, `@testing-library/dom`); implementar `i18n.ts`, `prefs.ts`, `api.ts`, `styles.css`, `main.tsx` (monta un `<div>` provisional «Lucca»).
- [ ] **Step 4: Ejecutar** `npx vitest run packages/web && npm run typecheck && npm run build -w @lucca/web` → PASS y `packages/web/dist/index.html` existe.
- [ ] **Step 5: Commit** `feat(lucca): web con tokens Bento, idioma y preferencias`.

---

### Task 8: Web — Speaker (voz del navegador)

**Files:**
- Create: `lucca/packages/web/src/speaker.ts`, `lucca/packages/web/src/speaker.test.ts`

**Interfaces:**
- Consumes: `Lang`, `VoiceMode` de `@lucca/shared`.
- Produces:
  - `interface Segment { text: string; lang: Lang }`
  - `pickVoice(voices: readonly { lang: string; name: string }[], lang: Lang): { lang: string; name: string } | null` (preferencias de la sección Global Constraints; el primer coincidente de cada prefijo; `null` si no hay ninguna del idioma; compara ignorando mayúsculas y aceptando `es_PA` y `es-PA`)
  - `interface SpeakHandlers { onWord?: (segmentIndex: number, charStart: number, charLength: number) => void; onSegmentEnd?: (segmentIndex: number) => void; onEnd?: () => void }`
  - `interface Speaker { available(lang: Lang): boolean; speak(segments: Segment[], handlers?: SpeakHandlers): void; stop(): void; readonly speaking: boolean }`
  - `createSpeaker(synth?: SpeechSynthesis | undefined, rate = 0.9): Speaker` — un `SpeechSynthesisUtterance` por segmento, en cola; usa `pickVoice` y `utterance.lang`; `boundary` con `name === 'word'` → `onWord`; `stop()` cancela la cola; si `synth` es `undefined` todo es inofensivo (`available` false, `speak`/`stop` no hacen nada ni lanzan).
  - `shouldAutoSpeak(mode: VoiceMode): boolean` (`true` para `audio` y `both`) y `showSpeakerButtons(mode: VoiceMode): boolean` (`true` para `audio` y `both`).

- [ ] **Step 1: Escribir `src/speaker.test.ts` (debe fallar)** con un `speechSynthesis` simulado que registra los `utterance` y deja disparar `onboundary`/`onend`: `pickVoice prefers es-PA over es-MX over es-US over es-419 over any es-*`; `pickVoice prefers en-US then any en-*`; `pickVoice returns null when no voice matches`; `accepts es_PA written with underscore`; `speaks one utterance per segment with its own lang` (`[{text:'Palabras:',lang:'es'},{text:'cat, hat, bat',lang:'en'}]` → dos utterances con `lang` `es-…`/`en-…`); `uses rate 0.9 by default`; `emits onWord for word boundaries only`; `stop cancels the queue` (llama a `cancel` del sintetizador y `speaking` pasa a false); `a missing speechSynthesis never throws` (`createSpeaker(undefined)`: `available('es')` false, `speak` y `stop` no lanzan); `shouldAutoSpeak and showSpeakerButtons by mode` (audio true/true, text false/false, both true/true).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web/src/speaker.test.ts` → FAIL.
- [ ] **Step 3: Implementar `speaker.ts`.**
- [ ] **Step 4: Ejecutar** el test y `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): lectura en voz alta con Web Speech API`.

---

### Task 9: Web — pantalla "Mi semana"

**Files:**
- Create: `lucca/packages/web/src/App.tsx`, `src/components/{WeekScreen,DayStrip,TaskCard,Mascot,StarsTile,Controls,SubjectIcon}.tsx`, `src/App.test.tsx`, `src/components/WeekScreen.test.tsx`
- Modify: `lucca/packages/web/src/main.tsx` (monta `<App />`), `src/styles.css` (cuadrícula Bento y componentes)

**Interfaces:**
- Consumes: `fetchState`/`postProgress` (Task 7), `loadPrefs`/`savePrefs`/`t`/`dayShort`/`dueLabel`/`summaryLine` (Task 7), `createSpeaker`/`shouldAutoSpeak`/`showSpeakerButtons` (Task 8), `plannerToday`, `weekDays`, `dayTasks`, `weekSummary`, `taskTitle` (Tasks 1–2).
- Produces:
  - `App`: carga el estado, aplica `data-theme` y `lang` de `<html>`, guarda cambios de idioma/modo/tema con `savePrefs`; mientras carga muestra la mascota; si hay error de red muestra una pantalla amable sin detalle técnico; si `tasks.length === 0` muestra `t(lang,'noAgenda')`.
  - `WeekScreen(props: { state: KidState; prefs: Prefs; speaker: Speaker; onPrefs(p: Prefs): void; onOpenTask(id: string): void })` (la apertura de tarea es un gancho vacío en esta fase: `onOpenTask` solo se llama)
  - `DayStrip(props: { days: DaySummary[]; selected: IsoDate; today: IsoDate; lang: Lang; onSelect(d: IsoDate): void })` — botones `aria-pressed`; muestra «Hoy» en el día de hoy y marca de completado en `allDone`.
  - `TaskCard(props: { item: DayTask; lang: Lang; showSpeaker: boolean; onOpen(): void; onListen(): void })` — color e icono por materia, estado, `urgent` → `t(lang,'urgent')`, `dueLabel`, botón principal («Empezar» / «Seguir» / «Repasar») de ≥ 76 px, botón altavoz con `aria-label` en el idioma activo (solo si `showSpeaker`).
  - `Mascot`, `StarsTile`, `Controls` (selector de modo y de idioma como grupos con `role="group"` y `aria-pressed`; interruptor de tema), `SubjectIcon(props: { subject: Subject })` con los SVG del tablero Bento (matemáticas, español, inglés, ciencias, arte; los demás usan un icono genérico).
  - Comportamiento: al abrir queda seleccionado `plannerToday(state.today)`; con modo `audio` o `both` se lee automáticamente el saludo/resumen **solo después del primer toque** del usuario (política de autoplay); al elegir un día no se rompe el avance; la mascota sugiere la primera tarea pendiente (`mascotSuggest`) con botón escuchar si `showSpeakerButtons`; las estrellas muestran `starsThisWeek`.

- [ ] **Step 1: Escribir `src/components/WeekScreen.test.tsx` (debe fallar)** (`// @vitest-environment jsdom`, estado de ejemplo = semana demo con `today '2026-11-17'`): `opens on today and shows its tasks` (hay un botón `Mar` con `aria-pressed="true"`, el texto `Hoy, martes 17 · Te faltan 2 tareas` y 3 tarjetas); `weekend opens on next Monday` (`today '2026-11-22'` → el lunes 23 seleccionado); `selecting another day shows its tasks`; `shows the due label` (`Entregar: mié 18` en una tarea con entrega el miércoles); `overdue unfinished task shows ¡Para hoy!`; `empty day shows the free-day message`; `english switches every visible text` (con `lang 'en'` aparecen `Hi, Lucca!`, `Today, Tuesday 17`, el título traducido `The parts of a plant`, y ningún texto de la interfaz en español); `listen buttons depend on the mode` (con `text` no existe ningún botón de altavoz; con `both` hay uno por tarjeta; cada uno tiene `aria-label` en el idioma activo); `clicking the primary button calls onOpenTask`; `mode and language groups expose pressed state`; `nothing technical is shown when empty` (sin tareas: `Pídele a papá que conecte tu agenda`).
- [ ] **Step 2: Escribir `src/App.test.tsx` (debe fallar):** `shows a friendly screen when the server is unreachable` (el `fetch` simulado rechaza → texto amable, sin la palabra `Error` ni la URL); `applies the saved theme and language to the document` (`document.documentElement.dataset.theme` y `lang`).
- [ ] **Step 3: Ejecutar** `npx vitest run packages/web` → FAIL.
- [ ] **Step 4: Implementar** los componentes y estilos: rejilla de 4 columnas a ≥ 1024 px con bloque de saludo (2 col.), bloque de semana (2 col.), tareas (3 col.) y columna lateral (estrellas, modo, idioma, tema); a < 1024 px una sola columna con la tira de días con desplazamiento interno; botones ≥ 60 px y principales ≥ 76 px; texto de lectura ≥ 19 px; títulos con `overflow-wrap: anywhere` para títulos largos.
- [ ] **Step 5: Ejecutar** `npx vitest run packages/web && npm run typecheck` → PASS.
- [ ] **Step 6: Commit** `feat(lucca): pantalla Mi semana en estilo Bento`.

---

### Task 10: Verificación en navegador real, construcción y documentación

**Files:**
- Create: `lucca/e2e/layout.cjs`, `lucca/README.md`, `lucca/packages/server/build.mjs`
- Modify: `lucca/package.json` (scripts `build`, `start`, `e2e`), `lucca/packages/server/package.json` (script `build`)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `npm run build` (construye `web` y empaqueta el servidor en `packages/server/dist/lucca.mjs` con esbuild como `packages/cli/build.mjs` de AgentDash, copiando `web/dist` a `packages/server/dist/web`); `npm start` = `node packages/server/dist/lucca.mjs` (el servidor usa `dist/web` como `webDir` por defecto si existe); `npm run e2e` = `node e2e/layout.cjs`.

- [ ] **Step 1: Escribir `e2e/layout.cjs`** (requiere `npm run build`; usa `require('playwright')` como `e2e/smoke.cjs` de AgentDash): arranca `node packages/server/dist/lucca.mjs` con `LUCCA_DEMO=1`, `LUCCA_DB=:memory:`, `LUCCA_PORT` libre y reloj real; abre la página en 1366×768, 1024×768 y 768×1024, en oscuro y en claro. Por cada combinación comprueba: `document.documentElement.scrollWidth <= innerWidth` (sin desplazamiento horizontal); cada `button` visible mide ≥ 60 × 60 px y los botones con clase de acción principal ≥ 76 px de alto; ningún `pageerror` ni petición fallida; guarda capturas en `lucca/e2e/out/` (ignorado por git). Comprueba además que con `--host-resolver` no hay peticiones a dominios externos (la lista de peticiones solo contiene el origen local). Sale con código ≠ 0 y lista los incumplimientos.
- [ ] **Step 2: Implementar** `build.mjs`, los scripts y el `webDir` por defecto; ejecutar `cd lucca && npm run build` → termina sin errores y existe `packages/server/dist/lucca.mjs`.
- [ ] **Step 3: Ejecutar** `npm run e2e` → debe pasar; si falla por tamaños o desbordes, corregir `styles.css` (no relajar las comprobaciones) y repetir.
- [ ] **Step 4: Revisar las capturas** (`lucca/e2e/out/*.png`) para confirmar que la pantalla coincide con el tablero C · Bento (bloques, colores por materia, mascota, modo oscuro y claro).
- [ ] **Step 5: Escribir `lucca/README.md`** en español: qué es, requisitos (Node ≥ 22.13), `npm install`, `LUCCA_DEMO=1 npm run dev:server` + `npm run dev:web`, `npm run build && LUCCA_DEMO=1 npm start`, variables de `.env.example`, abrir desde la tablet con `http://<ip-de-la-compu>:4830` y **no abrir el puerto en el router**, qué falta (Mereb, IA, área del padre) y cómo correr pruebas y e2e. Verificar que cada comando del README funciona tal cual.
- [ ] **Step 6: Ejecutar la suite completa** `npm test && npm run typecheck && npm run build` → todo en verde, y `cd .. && npm test` de AgentDash sigue pasando (no se tocó `packages/*`).
- [ ] **Step 7: Marcar en `openspec/changes/add-lucca-homework-assistant/tasks.md`** las tareas de las secciones 1 y 2 que quedaron verificadas (1.1–1.6 y 2.1–2.8, salvo lo que no se haya cubierto: 1.5 incluye solo las tablas de esta fase y 2.7 queda con manifiesto e icono) y anotar al lado cualquier desviación.
- [ ] **Step 8: Commit** `feat(lucca): verificación de layout, build y README` y `git push`.

---

## Self-Review

- **Cobertura de spec (fase 1):** weekly-planner (vista semanal, día de trabajo, tarjetas, estados, estrellas, saludo y mascota, sin agenda, controles táctiles, tema y pantallas) → Tasks 2, 3, 9, 10; voice-and-language (modos, botón escuchar, idioma, fragmentos por idioma, voz no disponible, etiquetas accesibles) → Tasks 7–9, con el aviso al padre de «sin voz» **diferido** a la fase del área del padre; resaltado de palabras: `onWord` está disponible, el resaltado visual llega con las pantallas de lección (Fase 3); home-server (red privada, `.env.example`, salud) → Tasks 1, 4, 6; Docker, respaldos y arranque automático → Fase 6. **Desviación documentada:** `Task.titleTranslations` recibe sus traducciones de la IA en fases siguientes; en esta fase solo las tiene el sembrado de demostración.
- **Consistencia de tipos:** `Task`, `ProgressEvent`, `Settings`, `Lang`, `VoiceMode` se definen en Tasks 1 y 3 y se consumen con esos nombres en Tasks 5–9; `plannerToday(today: IsoDate)` recibe la fecha, no un `Date`, en Tasks 2, 6 y 9.
- **Proporción:** el plan describe firmas, valores de spec y aserciones; los cuerpos los escribe quien implementa.
