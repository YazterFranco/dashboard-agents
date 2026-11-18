# Lucca — Elegir la semana y guías por semana y por día Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Lucca pueda elegir la semana (anterior, siguiente, esta), ver el "Plan de la semana" con su avance y pedir "Guíame" para recorrer las tareas del día una a una.

**Architecture:** Lógica pura nueva en `lucca/packages/shared/src/guide.ts` (semana, totales, orden y arranque sugerido). La web gana tres piezas dentro de `WeekScreen`: navegación y resumen de semana, vista `WeekPlan` y vista `DayGuide`. `App` envía el progreso a `/api/kid/progress` y devuelve a las vistas el resultado del servidor (estado y estrellas); la API del servidor no cambia.

**Tech Stack:** el de la fase 1 (TypeScript, React 19, vitest + Testing Library, Playwright para el e2e).

**Spec:** `openspec/changes/add-lucca-homework-assistant/specs/lucca/weekly-planner/spec.md` (requisitos "Elegir la semana", "Resumen de la semana", "Plan de la semana", "Guía del día"), `design.md` D15, `tasks.md` grupo 2b.

## Global Constraints

- Los de la fase 1 (`docs/superpowers/plans/2026-11-17-lucca-fase-1-base-y-mi-semana.md`): controles ≥ 60 px, acciones principales ≥ 76 px, texto de lectura ≥ 19 px, sin desplazamiento horizontal a 1024×768 y 768×1024, ES/EN, modo oscuro y claro, sin regaños ni castigos.
- Textos de la spec, tal cual: `Semana anterior`, `Semana siguiente`, `Esta semana`, `Plan de la semana`, `Guíame`, `Tarea N de M`, `¡Ya la hice!`, `Más tarde`, `Volver a mi semana`, `¡Terminaste el día!`, `Sin tareas esta semana`, rango `23 – 27 de noviembre` y `30 nov – 4 dic`.
- La estrella la decide el servidor: la web nunca suma estrellas por su cuenta (una por tarea y tipo, ya implementado).
- La guía no abre lecciones (no existen todavía): sus acciones son solo "¡Ya la hice!" y "Más tarde".

## Review Focus

1. **Semanas que cruzan mes o año** (30 nov – 4 dic; 28 dic → 4 ene): rango, desplazamiento y selección de día correctos → tests en Task 1 y Task 2.
2. **Fallo de red al pulsar "¡Ya la hice!"**: la tarea no queda marcada, Lucca ve "Inténtalo otra vez" sin detalle técnico y puede reintentar → test en Task 3 y Task 6.
3. **Doble toque en "¡Ya la hice!"**: no se envía dos veces ni se salta una tarea → test en Task 6.
4. **Tareas que cambian mientras la guía está abierta** (otra pestaña o papá las marca; el refresco por visibilidad actualiza el estado): la guía no se rompe si la tarea actual ya está lista o desapareció → test en Task 6.
5. **Semana pasada o futura**: las tareas atrasadas no se muestran en semanas pasadas (se adelantan a hoy) y la guía de un día pasado funciona igual → test en Task 4.

---

### Task 1: Lógica pura de semana, totales, orden y arranque

**Files:**
- Create: `lucca/packages/shared/src/guide.ts`, `lucca/packages/shared/test/guide.test.ts`
- Modify: `lucca/packages/shared/src/index.ts` (reexportar)

**Interfaces:**
- Consumes: `addDays`, `mondayOf`, `weekDays`, `weekSummary`, `DaySummary`, `DayTask` de `week.ts`; `SUBJECTS`, `Task`, `IsoDate` de `schemas.ts`.
- Produces:
  - `shiftWeek(monday: IsoDate, weeks: number): IsoDate` — lunes de la semana desplazada `weeks` semanas (acepta cualquier día como entrada).
  - `interface WeekTotals { total: number; done: number; pending: number }` y `weekTotals(summaries: DaySummary[]): WeekTotals`.
  - `guideOrder(items: DayTask[]): DayTask[]` — solo las no listas: primero `doing`, luego `urgent`, luego por `SUBJECTS`, luego por título (`localeCompare` `es`).
  - `suggestedStart(summaries: DaySummary[], today: IsoDate): IsoDate | null` — con `today` dentro de la semana: hoy si tiene pendientes, si no el primer día posterior a hoy con pendientes, si no el primer día anterior con pendientes; con `today` fuera de la semana: el primer día con pendientes; `null` si no hay ninguno.
  - `defaultDayOf(monday: IsoDate, tasks: Task[], today: IsoDate): IsoDate` — `today` si cae en esa semana; si no, `suggestedStart` de esa semana o el lunes.

- [ ] **Step 1: Escribir `test/guide.test.ts` (debe fallar).** Fechas: martes 2026-11-17 es hoy. Tests y aserciones:
  - `shiftWeek moves whole weeks`: `shiftWeek('2026-11-16', 1)` = `'2026-11-23'`; `shiftWeek('2026-11-18', -1)` = `'2026-11-09'` (entrada en miércoles); `shiftWeek('2026-12-28', 1)` = `'2027-01-04'`.
  - `weekTotals adds up days`: de tres resúmenes (2/0, 3/2, 0/0 → total/pending) = `{ total: 5, done: 3, pending: 2 }`.
  - `guideOrder puts started first, then urgent, then by subject`: con una `doing` de Ciencias, una `urgent` de Español y una `todo` de Matemáticas → ids en el orden Ciencias, Español, Matemáticas; las `done` no aparecen.
  - `guideOrder is stable by title inside a subject`.
  - `suggestedStart prefers today`, `skips a finished today to the next day with pending`, `falls back to an earlier day when only that one is pending`, `uses the first pending day when today is outside the week`, `returns null when nothing is pending`.
  - `defaultDayOf selects today in the current week`, `selects the first day with pending tasks in another week`, `selects Monday when the week has no tasks`.
- [ ] **Step 2: Ejecutar** `cd lucca && npx vitest run packages/shared/test/guide.test.ts` → FAIL.
- [ ] **Step 3: Implementar `guide.ts`.**
- [ ] **Step 4: Ejecutar** el test y `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): lógica de semana, totales y guía`.

---

### Task 2: Textos ES/EN y formato del rango de semana

**Files:**
- Modify: `lucca/packages/web/src/i18n.ts`, `lucca/packages/web/src/i18n.test.ts`

**Interfaces:**
- Consumes: `addDays` de `@lucca/shared`.
- Produces:
  - Claves nuevas en `MessageKey` (ES y EN): `weekPrev`, `weekNext`, `thisWeek`, `weekNone`, `planOpen`, `planStartToday`, `planStartDay` (`{day}`), `planAllDone`, `planGoToDay` (`{day}`), `guideStart`, `guideStep` (`{n}`, `{m}`), `guideDone`, `guideLater`, `guideBack`, `guideFinished`, `guideStarsEarned` (`{n}`), `guideRetry`.
  - `weekRange(lang: Lang, monday: IsoDate): string` — de lunes a viernes: ES `16 – 20 de noviembre`, cruce de mes `30 nov – 4 dic`; EN `November 16 – 20`, cruce `Nov 30 – Dec 4`.
  - `weekProgressText(lang: Lang, done: number, total: number): string` — ES `5 de 10 tareas listas` (`1 de 1 tarea lista`), EN `5 of 10 tasks done` (`1 of 1 task done`).

- [ ] **Step 1: Añadir tests (deben fallar):** `weekRange('es','2026-11-23')` = `'23 – 27 de noviembre'`; `weekRange('es','2026-11-30')` = `'30 nov – 4 dic'`; `weekRange('en','2026-11-16')` = `'November 16 – 20'`; `weekRange('en','2026-11-30')` = `'Nov 30 – Dec 4'`; `weekRange('es','2026-12-28')` = `'28 dic – 1 ene'`; `weekProgressText('es',5,10)` = `'5 de 10 tareas listas'`, `('es',1,1)` = `'1 de 1 tarea lista'`, `('en',5,10)` = `'5 of 10 tasks done'`; el test de paridad de claves ya cubre las nuevas; `t('es','guideDone')` = `'¡Ya la hice!'`, `t('es','guideStep',{n:'2',m:'3'})` = `'Tarea 2 de 3'`, `t('es','planOpen')` = `'Plan de la semana'`.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web/src/i18n.test.ts` → FAIL.
- [ ] **Step 3: Implementar** las claves y las dos funciones.
- [ ] **Step 4: Ejecutar** el test y `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): textos y rango de semana`.

---

### Task 3: Enviar el progreso desde la pantalla

**Files:**
- Modify: `lucca/packages/web/src/App.tsx`, `lucca/packages/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `postProgress` (`api.ts`), `ProgressKind`, `TaskStatus`.
- Produces: `type ProgressResult = { ok: true; starsGained: number } | { ok: false }` (exportado desde `src/progress.ts`) y la prop `onProgress(taskId: string, kind: ProgressKind): Promise<ProgressResult>` de `WeekScreen`. `App` la implementa: envía el evento, y solo si el servidor responde bien actualiza en el estado `status` de esa tarea y `starsThisWeek`; `starsGained` = diferencia de estrellas; si falla devuelve `{ ok: false }` sin cambiar nada.

- [ ] **Step 1: Escribir tests en `App.test.tsx` (deben fallar), pulsando la guía ya implementada con un `WeekScreen` simulado no es posible aún:** probar `onProgress` renderizando `App` con `vi.mock('./components/WeekScreen')` que expone un botón que llama a `props.onProgress('tue-sci','task_done')` y muestra el resultado y las estrellas: `updates the task status and the stars with what the server answers` (POST a `/api/kid/progress` con `{ taskId:'tue-sci', kind:'task_done' }`, el servidor responde `{ status:'done', starsThisWeek: 8 }` → `starsGained` 1 y el estado muestra 8); `keeps the state when the server fails` (el POST rechaza → `{ ok:false }` y las estrellas siguen en 7); `keeps the state on a non-2xx answer`.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web/src/App.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** `onProgress` en `App` (usar una `ref` con el último estado para calcular `starsGained`) y pasarla a `WeekScreen` (la prop se declara ya en `WeekScreen` como obligatoria; los tests existentes de `WeekScreen` pasan `onProgress` simulado).
- [ ] **Step 4: Ejecutar** `npx vitest run packages/web && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): enviar el progreso desde la pantalla`.

---

### Task 4: Elegir la semana y resumen de la semana

**Files:**
- Create: `lucca/packages/web/src/components/WeekNav.tsx`
- Modify: `lucca/packages/web/src/components/WeekScreen.tsx`, `lucca/packages/web/src/components/WeekScreen.test.tsx`, `lucca/packages/web/src/styles.css`

**Interfaces:**
- Consumes: `shiftWeek`, `weekTotals`, `defaultDayOf`, `weekSummary`, `weekDays`, `plannerToday` (shared); `weekRange`, `weekProgressText`, `t` (i18n).
- Produces: `WeekNav(props: { lang: Lang; range: string; isCurrent: boolean; onPrev(): void; onNext(): void; onCurrent(): void })` con botones `Semana anterior`, `Semana siguiente` y, solo fuera de la semana actual, `Esta semana`; el rango y la marca "Esta semana" (pill) en la actual. `WeekScreen` guarda `weekStart` (lunes visto) y recalcula con él `days`, `weekSummary`, `weekTotals`; al cambiar de semana `selected = defaultDayOf(...)`. Resumen: `weekProgressText` + barra (`role="progressbar"`, `aria-valuemin 0`, `aria-valuemax total`, `aria-valuenow done`, `aria-label` con el texto); sin tareas, `weekNone` y sin barra.

- [ ] **Step 1: Escribir tests en `WeekScreen.test.tsx` (deben fallar)** con la semana demo (hoy martes 17): `shows the range and marks the current week`; `next week shows Monday 23 to Friday 27 and the "Esta semana" button` (rango `23 – 27 de noviembre`; ya no está la marca de semana actual); `previous week shows Monday 9`; `"Esta semana" returns to today` (martes 17 seleccionado); `a range that crosses the month` (en `2026-11-30` el rango `30 nov – 4 dic`, navegando dos veces desde el 16); `the first day with pending tasks is selected in another week` (tarea sin hacer el jueves 26 → semana siguiente abre en jueves 26); `an empty week selects Monday and shows the free-day message`; `the summary shows "N de M tareas listas" and a progressbar with the right values` (semana demo: 7 tareas, 2 listas → `2 de 7 tareas listas`, `aria-valuenow 2`, `aria-valuemax 7`); `a week without tasks shows "Sin tareas esta semana" and no progressbar`; `past weeks do not show the overdue unfinished tasks` (semana del 9: ninguna tarea del martes 17 aparece); `weekly summary can be read aloud` (botón de la mascota lee el resumen de semana si no hay día... → el botón de Nova sigue leyendo el día; el resumen semanal se lee con el botón `Escuchar` dentro del bloque de resumen: `speaker.speak` con `5 de 10 tareas listas` precedido por el rango).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web/src/components/WeekScreen.test.tsx` → FAIL en los nuevos.
- [ ] **Step 3: Implementar** `WeekNav`, el estado `weekStart`, el resumen con su botón de escuchar (solo en modos con audio) y los estilos (botones ≥ 60 px, barra con contraste, el rango no desborda a 768 px).
- [ ] **Step 4: Ejecutar** `npx vitest run packages/web && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): elegir la semana y resumen de la semana`.

---

### Task 5: Vista "Plan de la semana"

**Files:**
- Create: `lucca/packages/web/src/components/WeekPlan.tsx`
- Modify: `lucca/packages/web/src/components/WeekScreen.tsx`, `lucca/packages/web/src/components/WeekScreen.test.tsx`, `lucca/packages/web/src/styles.css`

**Interfaces:**
- Consumes: `dayTasks`, `weekSummary`, `weekTotals`, `suggestedStart`, `taskTitle`, `SubjectIcon`, i18n.
- Produces: `WeekPlan(props: { lang; days: IsoDate[]; tasks: Task[]; today: IsoDate; realToday: IsoDate; range: string; onGoToDay(date: IsoDate): void; onBack(): void })`. `WeekScreen` tiene `view: 'week' | 'plan' | 'guide'`; el botón `Plan de la semana` (en el bloque de la semana) abre la vista; `onBack` y `onGoToDay` vuelven a `'week'` (esta última con el día seleccionado). Cabecera con `Volver a mi semana`, `h1` `Plan de la semana`, rango, mensaje de arranque (`Empieza por hoy` / `Empieza por el miércoles` / `¡Todo listo esta semana!` / `Sin tareas esta semana`), barra de progreso, y una fila por día (botón con nombre accesible `Ir a Miércoles 18`) con chips (icono, título, marca de estado) de sus tareas.

- [ ] **Step 1: Escribir tests (deben fallar)** `opens the week plan with every school day`; `says "Empieza por hoy" when today has pending tasks`; `says "Empieza por el miércoles" when today is complete and Wednesday has pending tasks` (hoy con todas listas); `says everything is done when nothing is pending`; `shows each task with its status`; `tapping a day goes back to the week with that day selected` (miércoles 18 `aria-pressed true`); `back returns to the week with the same day selected`; `the plan in English`.
- [ ] **Step 2: Ejecutar** → FAIL.
- [ ] **Step 3: Implementar** `WeekPlan`, el cambio de vista y los estilos; al abrir la vista, el foco va al `h1` (`tabIndex -1`) y al volver, al botón que la abrió.
- [ ] **Step 4: Ejecutar** `npx vitest run packages/web && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): plan de la semana`.

---

### Task 6: Guía del día ("Guíame")

**Files:**
- Create: `lucca/packages/web/src/components/DayGuide.tsx`
- Modify: `lucca/packages/web/src/components/WeekScreen.tsx`, `lucca/packages/web/src/components/WeekScreen.test.tsx`, `lucca/packages/web/src/styles.css`

**Interfaces:**
- Consumes: `guideOrder`, `dayTasks`, `taskTitle`, `onProgress`, `Speaker`, `shouldAutoSpeak`, `showSpeakerButtons`, i18n.
- Produces: `DayGuide(props: { date: IsoDate; lang: Lang; voiceMode: VoiceMode; speaker: Speaker; tasks: Task[]; initialIds: string[]; emptyMessage: string | null; onProgress: (taskId: string, kind: ProgressKind) => Promise<ProgressResult>; onBack(): void })`. `initialIds` es la cola inicial (`guideOrder` de ese día); las tareas se buscan en `tasks` por id para tomar siempre el título y el estado actuales. Estado interno: `queue: string[]`, `total`, `earned`, `busy`, `failed`. `WeekScreen` agrega el botón `Guíame` (≥ 76 px) en el bloque del saludo y pasa `emptyMessage` (`freeDay` si el día no tiene tareas, `mascotAllDone` si todas están listas, `null` si hay pendientes).
- Comportamiento: muestra `Tarea N de M` (N = M − pendientes en cola + 1), materia, título, urgente y entrega; `¡Ya la hice!` envía `task_done`, bloquea el botón mientras espera y, si `ok`, saca la tarea de la cola y suma `starsGained`; si no, muestra `Inténtalo otra vez` y deja reintentar; `Más tarde` manda la tarea al final de la cola (deshabilitado si es la única); con la cola vacía muestra `¡Terminaste el día!`, `Estrellas ganadas: N` y `Volver a mi semana`; una tarea de la cola que ya está lista o desapareció en `tasks` se omite sin error; en modos con audio lee cada paso (`Tarea 2 de 3. Ciencias. Las partes de la planta`) y el botón de escuchar alterna leer/detener; al montar el foco va al `h1`.

- [ ] **Step 1: Escribir tests (deben fallar)** `Guíame opens the guide with the started task first` (`Tarea 1 de 3`, Ciencias); `"¡Ya la hice!" sends task_done, shows the next task and counts the star` (`onProgress('tue-sci','task_done')`; después `Tarea 2 de 3`); `"Más tarde" moves the task to the end without changing it` (`onProgress` no se llama; el orden pasa a Matemáticas, Español, Ciencias); `"Más tarde" is disabled for the last task`; `finishing the last task shows the celebration with the stars earned` (`Estrellas ganadas: 2` con respuestas `starsGained` 1 y 1 y 0 → 2); `a failed send shows "Inténtalo otra vez", keeps the task and allows retrying`; `a double tap sends one event` (dos clics seguidos con la promesa pendiente → `onProgress` 1 vez); `skips a queued task that is already done or gone` (se renderiza con `tasks` donde la primera ya está `done`; se muestra la siguiente sin error); `a day with nothing pending shows the empty message instead of a guide` (día sin tareas y día con todo listo); `reads each step aloud in "both" mode and not in "text" mode`; `the speaker button toggles reading`; `back returns to the week with the same day selected`; `the guide in English`.
- [ ] **Step 2: Ejecutar** → FAIL.
- [ ] **Step 3: Implementar** `DayGuide`, el botón `Guíame`, el cambio de vista y los estilos (tarjeta grande de la materia, puntos de avance, botones ≥ 76 px y ≥ 60 px, sin desbordes a 768 px).
- [ ] **Step 4: Ejecutar** `npx vitest run packages/web && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): guía del día`.

---

### Task 7: Verificación en navegador real, documentación y OpenSpec

**Files:**
- Modify: `lucca/e2e/layout.cjs`, `lucca/README.md`, `openspec/changes/add-lucca-homework-assistant/tasks.md`

**Interfaces:** consume todo lo anterior.

- [ ] **Step 1: Extender `e2e/layout.cjs` (debe fallar si algo desborda o falta):** en cada combinación de tema y tamaño, además de "Mi semana", abrir `Plan de la semana` y `Guíame` (con clic real) y ejecutar las mismas comprobaciones (sin desplazamiento horizontal, botones ≥ 60 px, acciones principales ≥ 76 px, texto ≥ 19 px, botones dentro de su tarjeta/contenedor), guardar capturas `e2e/out/<tema>-<tamaño>-plan.png` y `-guia.png`; y comprobar que `Semana siguiente` cambia el rango y que `Esta semana` vuelve. Se amplía `measure` para incluir `.guide-card .btn-primary` y `.plan-day` en las comprobaciones de tamaño y contención.
- [ ] **Step 2: Ejecutar** `npm run build && npm run e2e` → corregir `styles.css` (sin relajar los límites) hasta que pase; revisar las capturas.
- [ ] **Step 3: Actualizar `README.md`** ("Qué funciona hoy": elegir semana, plan y guía) y marcar `2b.1`–`2b.7` en `tasks.md` de OpenSpec, anotando cualquier desviación (en 2b.3: sin actualización optimista, la estrella la decide el servidor).
- [ ] **Step 4: Corregir `design.md` D15** ("actualización optimista" → "espera la respuesta del servidor; si falla, la tarea no cambia y la mascota dice «Inténtalo otra vez»").
- [ ] **Step 5: Suite completa** `cd lucca && npm test && npm run typecheck && npm run build && npm run e2e` y `openspec validate add-lucca-homework-assistant --strict` → verdes.
- [ ] **Step 6: Commit** `feat(lucca): verificación de la semana y las guías, documentación` y `git push`.

---

## Self-Review

- **Cobertura de spec:** Elegir la semana (Task 1, 2, 4), Resumen de la semana (Task 4), Plan de la semana (Task 1, 5), Guía del día (Task 1, 3, 6); verificación visual (Task 7).
- **Consistencia de tipos:** `ProgressResult` y `onProgress` se definen en Task 3 y se consumen con esos nombres en Task 6; `suggestedStart`/`defaultDayOf`/`guideOrder`/`weekTotals`/`shiftWeek` se definen en Task 1 y se usan con esas firmas en Tasks 4–6.
- **Desviación consciente de D15:** sin actualización optimista (la estrella la decide el servidor); se corrige el texto en Task 7.
