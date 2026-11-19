# Lucca — Área de papá y pruebas funcionales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un área de papá protegida con PIN (configuración inicial, tareas manuales, progreso, ajustes) más pruebas funcionales en navegador real con capturas de cada escenario positivo, negativo y de borde.

**Architecture:** `shared` gana los esquemas del área de papá (`parent.ts`) y el cálculo del progreso semanal. El servidor gana `auth.ts` (PIN con scrypt, bloqueo por intentos, sesiones) y `parent.ts` (rutas `/api/parent/*` con cookie de sesión). La web gana `ParentApp` (en `/papa`): puerta (configuración / PIN / bloqueo) y panel con pestañas Tareas, Progreso y Ajustes. Las pruebas funcionales son un recorrido Playwright (`e2e/functional.cjs`) con un arnés que guarda capturas y un informe.

**Tech Stack:** el de la fase 1 más `node:crypto` (scrypt, sha256, randomBytes). Sin dependencias nuevas.

**Spec:** `openspec/changes/add-lucca-homework-assistant/specs/lucca/parent-area/spec.md` (todos los escenarios nuevos), `design.md` D8, `tasks.md` 3.1, 3.2, 3.3 y parte de 3.10.

## Global Constraints

- PIN: 4 a 6 dígitos, solo dígitos; guardado con scrypt (sal aleatoria de 16 bytes), nunca en claro ni en respuestas ni en registros.
- Bloqueo: 5 fallos seguidos → 5 minutos; un PIN correcto pone la cuenta de fallos a cero; durante el bloqueo ni el PIN correcto entra y no reinicia el bloqueo; un formato inválido no cuenta como fallo.
- Sesión: cookie `lucca_parent` (`HttpOnly; SameSite=Strict; Path=/`), valor aleatorio de 32 bytes del que el servidor guarda solo el sha256; caduca a los 15 minutos sin actividad (ventana deslizante); "Salir" y el cambio de PIN la invalidan.
- Sin sesión, toda ruta `/api/parent/*` salvo `status`, `setup`, `login` y `logout` responde 401 `{ error: 'Hace falta el PIN' }` sin datos.
- La configuración inicial solo se puede hacer una vez (después 409). La API key y Mereb **no bloquean** la configuración (decisión de papá: el `.env` se completa al final).
- Límites: nombre del niño 1–30 caracteres; título de tarea 1–200; descripción ≤ 2000; grado 1–6; velocidad de voz 0,7–1,2; la entrega no puede ser antes del día asignado.
- Borrar: tarea manual → se elimina; tarea de otro origen → `retired = true`. Marcar lista desde el área de papá no crea eventos de progreso (no da estrella).
- Área de papá: texto en español, controles ≥ 44 px, texto ≥ 16 px, contraste 4,5:1, sin desplazamiento horizontal de 390 a 1280 px, etiquetas visibles en cada campo, errores junto al campo.
- Todo texto de tareas se muestra como texto (nunca como HTML).
- Reloj de pruebas: `LUCCA_FAKE_NOW` (instante ISO) fija "ahora" del servidor; solo para pruebas y se documenta como tal.

## Review Focus

1. **Bloqueo y reloj**: el sexto intento con el PIN correcto durante el bloqueo sigue bloqueado; tras 5 minutos exactos entra; las sesiones expiran por inactividad, no por antigüedad → tests en Task 2 y Task 3.
2. **Orden de validación**: PIN de formato inválido en login/cambio de PIN no gasta intentos; en `PUT /pin` un `newPin` inválido no cambia nada aunque el actual sea correcto → Task 3.
3. **Fechas al mover**: mover a un día posterior a la entrega no deja una tarea con la entrega antes del día asignado → Task 4 y Task 6.
4. **Texto malicioso o raro** en títulos (`<script>`, comillas, emoji, 200 caracteres): se guarda y se muestra literal, sin desbordes → Task 4 y e2e.
5. **Cookie de otro PIN**: tras cambiar el PIN, la cookie anterior de otra pestaña/dispositivo deja de valer → Task 3.

---

### Task 1: Esquemas compartidos, progreso semanal y almacén

**Files:**
- Create: `lucca/packages/shared/src/parent.ts`, `lucca/packages/shared/test/parent.test.ts`
- Modify: `lucca/packages/shared/src/schemas.ts`, `lucca/packages/shared/src/progress.ts`, `lucca/packages/shared/src/index.ts`, `lucca/packages/shared/test/schemas.test.ts`, `lucca/packages/shared/test/progress.test.ts`
- Modify: `lucca/packages/server/src/db.ts`, `lucca/packages/server/test/db.test.ts`

**Interfaces:**
- Produces en `schemas.ts`: `SettingsSchema` pasa a `{ childName (trim, 1–30, def 'Lucca'), grade (int 1–6, def 2), lang, voiceMode, theme, speechRate (0,7–1,2, def 0,9), tz }`; `SettingsFields` (los esquemas de cada campo sin valor por defecto, para el parche).
- Produces en `parent.ts`: `PinSchema` (`/^\d{4,6}$/`, mensaje `El PIN debe tener de 4 a 6 dígitos`); `TaskInputSchema` (`{ subject, subjectLabel?, title, titleEn?, description, assignedDate, dueDate }` con la entrega ≥ día asignado, error en `dueDate`: `La entrega no puede ser antes del día asignado`); `TaskPatchSchema` (los mismos campos opcionales + `status?`, `hidden?`, sin la comprobación de fechas); `datesInOrder(assigned: IsoDate | null, due: IsoDate | null): boolean`; `SetupBodySchema` (`{ pin, childName, grade, lang, theme }`); `LoginBodySchema` (`{ pin: string }`); `ChangePinBodySchema` (`{ currentPin: string, newPin: PinSchema }`); `SettingsPatchSchema` (`.strict()`, campos de `SettingsFields` salvo `tz`, todos opcionales); `fieldErrors(error: z.ZodError): Record<string, string>` (primer mensaje por campo; clave `dueDate`, `title`, …).
- Produces en `progress.ts`: `interface WeekProgress { weekStart: IsoDate; total: number; done: number; pending: number; stars: number; hints: number; helpRequests: number }` y `weeklyProgress(tasks: Task[], events: ProgressEvent[], weekStart: IsoDate, today: IsoDate, tz: string): WeekProgress`; `needsHelp(tasks: Task[], events: ProgressEvent[], weekStart: IsoDate, tz: string): { taskId: string; title: string; count: number }[]` (tareas con eventos `help_requested` en esa semana, más veces primero, solo tareas que existen).
- Produces en `db.ts` (`LuccaDb`): `deleteTask(id: string): void`; `getPinRecord(): string | null`; `setPinRecord(record: string): void`; `createSession(id: string, at: string): void`; `getSession(id: string): { id: string; createdAt: string; lastSeen: string } | null`; `touchSession(id: string, at: string): void`; `deleteSession(id: string): void`; `deleteSessionsIdleSince(before: string): number`; `deleteAllSessions(): void`.

- [ ] **Step 1: Tests (deben fallar).** `schemas.test.ts`: los defaults de `SettingsSchema.parse({})` incluyen `grade 2` y `speechRate 0.9`; rechaza nombre de 31 caracteres, nombre vacío o de espacios, `grade` 0 y 7, `speechRate` 0,6 y 1,3; acepta 0,7 y 1,2 (bordes); el nombre se recorta (`'  Lucca '` → `'Lucca'`). `parent.test.ts`: `PinSchema` acepta `'1234'` y `'123456'`, rechaza `'123'`, `'1234567'`, `'12a4'`, `''`, `' 1234'`; `TaskInputSchema` acepta una tarea mínima, rechaza título vacío / de espacios / de 201 caracteres (acepta 200), sin materia, con materia desconocida, con fecha `'2026-02-30'`, con entrega anterior al día asignado (error en `dueDate`), y acepta entrega igual al día asignado y fechas `null`; recorta el título; `titleEn` vacío es válido; `TaskPatchSchema` acepta `{}`, `{ hidden: true }`, `{ status: 'done' }` y rechaza `{ status: 'hecho' }`; `SettingsPatchSchema` rechaza `{ tz: 'x' }` y claves desconocidas, acepta `{ lang: 'en' }`; `SetupBodySchema` rechaza PIN corto; `fieldErrors` devuelve `{ pin: 'El PIN debe tener de 4 a 6 dígitos' }`. `progress.test.ts`: `weeklyProgress` cuenta total/hechas/pendientes, estrellas, pistas y ayudas solo de esa semana (evento en domingo 23:30 Panamá cuenta en la semana anterior); excluye tareas ocultas; semana sin datos = ceros; `needsHelp` ordena por conteo, ignora tareas borradas y eventos de otras semanas. `db.test.ts`: `deleteTask` quita la tarea y no falla con un id inexistente; `setPinRecord`/`getPinRecord` (null al inicio, persiste tras reabrir y sobrescribe); sesiones: crear/leer/`touchSession` cambia `lastSeen`/borrar; `deleteSessionsIdleSince` borra solo las inactivas y devuelve cuántas; `deleteAllSessions`; `getSession` de un id inexistente = null; los ajustes antiguos guardados sin `grade` ni `speechRate` se leen con sus valores por defecto.
- [ ] **Step 2: Ejecutar** `cd lucca && npx vitest run packages/shared packages/server/test/db.test.ts` → FAIL.
- [ ] **Step 3: Implementar** esquemas, `parent.ts`, `weeklyProgress`/`needsHelp` y los métodos de `LuccaDb` (la clave del PIN en `settings` con clave `pin`; las sesiones en `parent_sessions`).
- [ ] **Step 4: Ejecutar** los mismos tests y `npm run typecheck` → PASS (corregir los tests de la fase 1 que fijaban la forma exacta de `Settings`).
- [ ] **Step 5: Commit** `feat(lucca): esquemas del área de papá, progreso semanal y almacén`.

---

### Task 2: PIN, bloqueo y sesiones (núcleo de autenticación)

**Files:**
- Create: `lucca/packages/server/src/auth.ts`, `lucca/packages/server/test/auth.test.ts`

**Interfaces:**
- Consumes: nada de las tareas anteriores (solo `node:crypto`).
- Produces: `hashPin(pin: string): string` (`scrypt$<salHex>$<hashHex>`); `verifyPin(pin: string, record: string): boolean` (comparación en tiempo constante; `false` para un registro mal formado); `class LoginThrottle { constructor(maxFails = 5, lockMs = 300_000); status(nowMs: number): { locked: boolean; retryAfterSeconds: number; attemptsLeft: number }; fail(nowMs: number): { locked: boolean; retryAfterSeconds: number; attemptsLeft: number }; succeed(): void }` (un fallo durante el bloqueo no cuenta ni lo alarga; al vencer el bloqueo la cuenta vuelve a 0); `newToken(): string` (64 hex); `tokenId(token: string): string` (sha256 hex); `readCookie(header: string | undefined, name: string): string | null`; `sessionCookie(token: string): string` (`lucca_parent=<token>; HttpOnly; SameSite=Strict; Path=/`); `clearedCookie(): string` (`Max-Age=0`); `SESSION_IDLE_MS = 900_000`; `COOKIE_NAME = 'lucca_parent'`.

- [ ] **Step 1: Tests (deben fallar).** `hashPin` produce registros distintos para el mismo PIN (sal aleatoria) y no contiene el PIN; `verifyPin` acepta el correcto, rechaza `'0000'` frente a `'1234'`, rechaza registros vacíos/`'x'`/con hash de longitud incorrecta sin lanzar. `LoginThrottle`: 4 fallos → `attemptsLeft` 1 y sin bloqueo; el 5.º → `locked`, `retryAfterSeconds` 300; a los 299 s sigue bloqueado con `retryAfterSeconds` 1; a los 300 s exactos se desbloquea con `attemptsLeft` 5; `fail` durante el bloqueo devuelve el mismo estado y no mueve el vencimiento; `succeed` tras 4 fallos reinicia la cuenta; 4 fallos + éxito + 4 fallos no bloquea; parámetros personalizados. `readCookie`: encuentra la cookie entre varias, devuelve `null` si no existe o el encabezado es `undefined`/vacío, no confunde `x_lucca_parent` con `lucca_parent`, tolera espacios y valores con `=`. `sessionCookie` contiene `HttpOnly`, `SameSite=Strict`, `Path=/` y no `Secure`; `clearedCookie` contiene `Max-Age=0`. `newToken` da 64 hex distintos; `tokenId` es determinista y no contiene el token.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/server/test/auth.test.ts` → FAIL.
- [ ] **Step 3: Implementar `auth.ts`** (`scryptSync(pin, sal, 32)`, `timingSafeEqual`).
- [ ] **Step 4: Ejecutar** el test y `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): PIN con scrypt, bloqueo por intentos y sesiones`.

---

### Task 3: API de acceso del padre (estado, configuración, entrada, salida, cambio de PIN)

**Files:**
- Create: `lucca/packages/server/src/parent.ts`, `lucca/packages/server/test/parent-auth.test.ts`
- Modify: `lucca/packages/server/src/app.ts` (registrar las rutas del padre y crear el `LoginThrottle`), `lucca/packages/server/src/config.ts` (`merebConfigured`), `lucca/packages/server/test/config.test.ts`

**Interfaces:**
- Consumes: `auth.ts`, `LuccaDb` (Task 1), esquemas de `parent.ts`.
- Produces: `registerParentRoutes(app: FastifyInstance, deps: { db: LuccaDb; config: Config; now: () => Date; throttle: LoginThrottle }): void` con las rutas y respuestas siguientes (todas JSON):
  - `GET /api/parent/status` → `{ setupDone, authenticated, locked, retryAfterSeconds, connections: { ai: boolean, mereb: boolean } }`
  - `POST /api/parent/setup` → 201 `{ ok: true }` + cookie de sesión; 400 `{ error: 'Datos inválidos', fields }`; 409 `{ error: 'La configuración ya se hizo' }`
  - `POST /api/parent/login` → 200 `{ ok: true }` + cookie; 400 `{ error, fields: { pin } }` (formato; no cuenta); 401 `{ error: 'PIN incorrecto', attemptsLeft }`; 423 `{ error: 'Demasiados intentos', retryAfterSeconds }` + cabecera `Retry-After`; 409 `{ error: 'Falta la configuración inicial' }`
  - `POST /api/parent/logout` → 204 siempre (borra la sesión si existe y limpia la cookie)
  - `PUT /api/parent/pin` (con sesión) `{ currentPin, newPin }` → 200 `{ ok: true }` + cookie nueva (todas las demás sesiones se borran); 400 (`newPin` inválido, antes de contar nada); 401 con `attemptsLeft` (cuenta); 423 bloqueado
  - Gancho de sesión para todo lo demás bajo `/api/parent/`: 401 `{ error: 'Hace falta el PIN' }` si no hay cookie, no existe la sesión o pasó `SESSION_IDLE_MS` desde `lastSeen` (se borra y se limpia la cookie); si es válida, `touchSession`. Se purgan las sesiones inactivas al entrar.
  - `Config` gana `merebConfigured: boolean` (`MEREB_URL`, `MEREB_USER` y `MEREB_PASSWORD` no vacíos; sin guardar valores).

- [ ] **Step 1: Tests (deben fallar)** con `app.inject`, BD `:memory:`, reloj mutable y cabecera `cookie` reutilizada (helper `cookieOf(res)`): **positivos:** `status` inicial `setupDone false`; `setup` crea el PIN, devuelve cookie `HttpOnly`/`SameSite=Strict` y la sesión vale (`overview` 200 en Task 4 → aquí con `PUT /pin` o un `GET /api/parent/ping` de prueba registrado solo por el gancho: usar `PUT /pin` con datos inválidos para comprobar que responde 400 y no 401); `login` correcto entra; `logout` invalida la cookie (la ruta protegida da 401); `status` con cookie → `authenticated true`; la configuración guarda `childName`, `grade`, `lang`, `theme` en los ajustes del niño (`/api/kid/state`); `PUT /pin` correcto: el PIN nuevo entra, el viejo da 401, la cookie vieja de otra "pestaña" deja de valer y la nueva sí. **Negativos:** `setup` con PIN `'123'`, `'12a4'`, sin `pin`, nombre vacío, nombre de 31 caracteres, grado 9, idioma `'fr'`, cuerpo vacío o no JSON → 400 con `fields` por campo y nada guardado (`status.setupDone` sigue en false); segundo `setup` → 409 y el PIN original sigue valiendo; `login` antes de configurar → 409; PIN incorrecto → 401 con `attemptsLeft` 4, 3, 2…; `login` con `'12'` → 400 y el siguiente fallo sigue mostrando `attemptsLeft` 4; `login` con cuerpo vacío → 400; `PUT /pin` sin sesión → 401; con `currentPin` incorrecto → 401 y cuenta como fallo; con `newPin` inválido y `currentPin` correcto → 400 y el PIN no cambia; cookie con valor inventado, cookie vacía y cookie de otra aplicación → 401; el PIN y su registro no aparecen en ninguna respuesta (`JSON.stringify` de todas las respuestas no contiene `scrypt$` ni el PIN). **Bordes:** 5 fallos → 5.º devuelve 423 y `Retry-After: 300`; el PIN correcto durante el bloqueo → 423, no entra y no alarga el bloqueo; a los 299 s sigue 423 con `retryAfterSeconds` 1; a los 300 s entra; 4 fallos + éxito + 4 fallos → sin bloqueo; `status` refleja `locked` y `retryAfterSeconds`; sesión: a los 14 min 59 s sigue válida y **se renueva** (nuevo plazo de 15 min desde ahí), a los 15 min 1 s sin actividad → 401 y la cookie se limpia; dos sesiones simultáneas son independientes; `logout` sin sesión → 204; `logout` de una sesión no cierra la otra; `PUT /pin` bloqueado → 423; `GET /api/parent/status` y las rutas del niño siguen funcionando durante el bloqueo; `connections` refleja `aiConfigured` y `merebConfigured` sin exponer valores.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/server` → FAIL en los nuevos.
- [ ] **Step 3: Implementar** `parent.ts` (plugin con ámbito propio para el gancho de sesión), registrarlo en `buildApp` y añadir `merebConfigured` a la configuración con su prueba.
- [ ] **Step 4: Ejecutar** `npx vitest run packages/server && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): API de acceso del padre`.

---

### Task 4: API de gestión del padre (resumen, tareas, ajustes, progreso)

**Files:**
- Modify: `lucca/packages/server/src/parent.ts`
- Create: `lucca/packages/server/test/parent-manage.test.ts`

**Interfaces:**
- Consumes: Task 1 y Task 3.
- Produces (todas con sesión):
  - `GET /api/parent/overview` → `{ today, weekStart, settings, tasks: Task[] (todas, incluso ocultas y retiradas), connections }`
  - `POST /api/parent/tasks` (cuerpo = `TaskInputSchema`) → 201 `Task` (`id` `manual-<uuid>`, `source 'manual'`, `status 'todo'`, `titleTranslations.en` = `titleEn` si viene); 400 `{ error: 'Datos inválidos', fields }`
  - `PATCH /api/parent/tasks/:id` (cuerpo = `TaskPatchSchema`; `titleEn: ''` borra la traducción) → 200 `Task`; 404; 400 con `fields`; 400 `{ error: 'Nada que cambiar' }` con `{}`; el resultado combinado debe cumplir `datesInOrder` (si no, 400 con `fields.dueDate`)
  - `DELETE /api/parent/tasks/:id` → 200 `{ result: 'removed' | 'retired' }`; 404
  - `PUT /api/parent/settings` (cuerpo = `SettingsPatchSchema`) → 200 `Settings`; 400 con `fields`
  - `GET /api/parent/progress?weeks=N` (entero 1–12, por defecto 4) → `{ weeks: WeekProgress[] (la actual primero), needsHelp: { weekStart, taskId, title, count }[] }`; 400 si `weeks` no es entero en rango

- [ ] **Step 1: Tests (deben fallar).** **Positivos:** `overview` trae tareas ocultas y retiradas y la hora local; crear tarea manual mínima y completa (título en inglés, descripción, fechas) y verla en `/api/kid/state` el día que toca, con la traducción; editar título/materia/fechas; mover de día; ocultar (desaparece de `/api/kid/state`, sigue en `overview`) y mostrar; marcar lista (aparece `done` para Lucca) **sin** cambiar `starsThisWeek`; volver a "por hacer"; borrar manual (desaparece de `overview`); borrar tarea de origen `mereb` (insertada en la BD) → `retired true` y no sale en `/api/kid/state`; ajustes: cambiar nombre, grado, idioma, modo de voz, tema y velocidad → `/api/kid/state.settings` los refleja; progreso con eventos reales (task_done, lesson_done, hint_used, help_requested) → totales correctos y `needsHelp`. **Negativos:** sin sesión → 401 en cada ruta (tabla de las 6 rutas); crear sin título / de solo espacios / de 201 caracteres / sin materia / materia inventada / fecha `'2026-13-01'` / entrega antes del día asignado → 400 con el campo correcto y **nada** creado (`overview.tasks` igual); cuerpo no JSON o vacío → 400; patch con `status: 'hecho'`, `hidden: 'sí'`, id inexistente (404), `{}` (400), clave desconocida ignorada; borrar id inexistente → 404 y nada cambia; borrar dos veces → segundo 404; ajustes: velocidad 0,6 y 1,3, nombre vacío, nombre de 31, grado 0 y 7, `tz` (rechazado, no se cambia), clave desconocida → 400 y los ajustes anteriores intactos; `weeks=0`, `13`, `abc`, `1.5` → 400. **Bordes:** título de exactamente 200 caracteres OK; título con `<script>alert(1)</script>`, comillas, saltos de línea, emoji y acentos se guarda y se devuelve idéntico; mover una tarea a un día posterior a su entrega con solo `assignedDate` → 400 `fields.dueDate` y la tarea no cambia; entrega igual al día asignado OK; fechas `null` OK (la tarea sale hoy para Lucca); parche parcial no toca los demás campos; `titleEn: ''` quita la traducción; ocultar una tarea ya oculta es idempotente; 30 tareas en un día; la tarea creada el domingo (clock) para el lunes; ajustes parciales (solo `lang`) conservan el resto; `overview` no incluye el PIN ni su registro; progreso con 12 semanas y sin ningún evento (ceros); progreso de una semana con una tarea oculta (no cuenta).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/server/test/parent-manage.test.ts` → FAIL.
- [ ] **Step 3: Implementar** las rutas (validar siempre con los esquemas compartidos; `fieldErrors` para los 400; `randomUUID` para los ids).
- [ ] **Step 4: Ejecutar** `npx vitest run packages/server && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): API de gestión del padre`.

---

### Task 5: Integración con la pantalla de Lucca y reloj de pruebas

**Files:**
- Modify: `lucca/packages/server/src/index.ts`, `lucca/packages/web/src/App.tsx`, `lucca/packages/web/src/components/WeekScreen.tsx`, `lucca/packages/web/src/i18n.ts`, `lucca/packages/web/src/i18n.test.ts`, `lucca/packages/web/src/App.test.tsx`, `lucca/packages/web/src/components/WeekScreen.test.tsx`, `lucca/packages/web/src/styles.css`, `lucca/README.md`

**Interfaces:**
- Produces: la velocidad de lectura de `settings.speechRate` llega a `createSpeaker`; un enlace "Área de papá" (`<a href="/papa">`, clave `parentArea`: `Área de papá` / `Parents' area`) en la columna lateral de "Mi semana" (≥ 60 px); `LUCCA_FAKE_NOW` (ISO) en `index.ts`: si es válido, `now = () => fijo` para la API y el sembrado de demostración, si es inválido el servidor no arranca y dice por qué.

- [ ] **Step 1: Tests (deben fallar):** `App.test`: con `speechSynthesis` simulado y `settings.speechRate 1.1`, pulsar un altavoz crea una locución con `rate 1.1`; con la velocidad por defecto, `0.9`. `WeekScreen.test`: existe un enlace con nombre `Área de papá` que apunta a `/papa` (y `Parents' area` en inglés), también en modo texto. `i18n.test`: paridad ES/EN (ya existe). Para el reloj de pruebas: una función pura `parseFakeNow(value: string | undefined): Date | null` en `lucca/packages/server/src/config.ts` con pruebas (`undefined` → null, ISO válido → fecha, `'ayer'` lanza `Error` con `LUCCA_FAKE_NOW`, cadena vacía → null).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web packages/server/test/config.test.ts` → FAIL.
- [ ] **Step 3: Implementar** las cuatro piezas y documentar en el README `LUCCA_FAKE_NOW` como variable solo para pruebas.
- [ ] **Step 4: Ejecutar** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): velocidad de voz, enlace al área de papá y reloj de pruebas`.

---

### Task 6: Web del área de papá — puerta (configuración, PIN, bloqueo) y panel

**Files:**
- Create: `lucca/packages/web/src/parent/{api.ts,ParentApp.tsx,SetupForm.tsx,LoginForm.tsx,Dashboard.tsx,fields.tsx,parent.css}`, `lucca/packages/web/src/parent/{api.test.ts,ParentApp.test.tsx,SetupForm.test.tsx,LoginForm.test.tsx}`
- Modify: `lucca/packages/web/src/main.tsx` (si la ruta empieza por `/papa`, montar `ParentApp`)

**Interfaces:**
- Consumes: esquemas compartidos (`SetupBodySchema`, `LoginBodySchema`, `fieldErrors`), rutas de Task 3.
- Produces: `parent/api.ts`: `class ApiError extends Error { status: number; fields: Record<string,string>; retryAfterSeconds?: number; attemptsLeft?: number }` y `parentApi` con `status()`, `setup(body)`, `login(pin)`, `logout()`, `changePin(currentPin, newPin)`, `overview()`, `createTask(body)`, `patchTask(id, patch)`, `deleteTask(id)`, `saveSettings(patch)`, `progress(weeks)` (lanzan `ApiError` en respuestas no 2xx y dejan pasar el `TypeError` de red). `ParentApp` decide entre: cargando, error de conexión amable con "Intentar de nuevo", `SetupForm`, `LoginForm` (con el aviso "Tu sesión terminó por inactividad" cuando viene de un 401) y `Dashboard`. `Field` (etiqueta visible, error `role="alert"` enlazado con `aria-describedby`, `aria-invalid`). `LoginForm`: PIN `type=password inputMode=numeric maxLength=6 autoComplete=off`, botón `Entrar`, errores `Te quedan N intentos`, bloqueo con cuenta atrás (`m:ss`) que se actualiza cada segundo y rehabilita el formulario al llegar a 0.

- [ ] **Step 1: Tests (deben fallar).** `api.test`: construye `ApiError` con `fields`, `attemptsLeft` y `retryAfterSeconds` desde la respuesta; un fallo de red no es `ApiError`; envía JSON y `credentials` mismo origen. `SetupForm.test`: positivo (rellena todo → llama `setup` con los datos y avisa éxito); negativos (PIN de 3 dígitos, con letras, confirmación distinta, nombre vacío, nombre de 31 → mensaje junto al campo, sin llamada a la red, foco al primer error); borde (nombre de 30 OK, espacios alrededor se recortan, `Enter` envía, doble clic envía una vez, errores del servidor por campo se muestran, el estado de IA/Mereb "falta" muestra cómo añadirla pero **no** deshabilita "Terminar configuración", conectado se ve como conectado). `LoginForm.test`: positivo (PIN correcto → éxito); negativos (vacío, `12`, `abcd` → mensaje y sin llamada; incorrecto → `Te quedan 4 intentos`, singular `Te queda 1 intento`; red caída → mensaje amable); borde (bloqueo 423 → cuenta atrás `5:00` que baja con el reloj simulado y rehabilita al llegar a 0; el campo se vacía tras un fallo; el PIN no se muestra en el DOM como texto). `ParentApp.test`: estado inicial según `status` (sin configurar → asistente; configurado sin sesión → PIN; con sesión → panel; bloqueado → cuenta atrás); error de red → pantalla amable con reintento; un 401 dentro del panel vuelve al PIN con el aviso de inactividad; "Salir" llama `logout` y muestra el PIN.
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web/src/parent` → FAIL.
- [ ] **Step 3: Implementar** (`parent.css` con los tokens ya definidos; controles ≥ 44 px; foco visible; sin `dangerouslySetInnerHTML`).
- [ ] **Step 4: Ejecutar** `npx vitest run packages/web && npm run typecheck && npm run build -w @lucca/web` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): área de papá, puerta de acceso`.

---

### Task 7: Web del área de papá — pestañas Tareas, Progreso y Ajustes

**Files:**
- Create: `lucca/packages/web/src/parent/{TasksTab.tsx,TaskForm.tsx,TaskRow.tsx,ProgressTab.tsx,SettingsTab.tsx}`, `lucca/packages/web/src/parent/{TasksTab.test.tsx,TaskForm.test.tsx,ProgressTab.test.tsx,SettingsTab.test.tsx}`
- Modify: `lucca/packages/web/src/parent/Dashboard.tsx`, `lucca/packages/web/src/parent/parent.css`

**Interfaces:**
- Consumes: `parentApi` (Task 6), `shiftWeek`, `weekDays`, `workDateOf`, `mondayOf`, `weekRange` (es), `ProgressBar`.
- Produces: `TasksTab(props: { tasks: Task[]; today: IsoDate; onChanged(): void; api: typeof parentApi })`: navegación de semana limitada a anterior/actual/siguiente (botones deshabilitados en los extremos, con "Esta semana"), tareas agrupadas por día (por su día de trabajo, sin arrastrar atrasadas) y grupo "Sin fecha" en la semana actual, ocultas atenuadas con la marca "Oculta", retiradas no se listan; acciones por tarea (nombres accesibles con el título): `Marcar lista` / `Marcar por hacer`, `Ocultar` / `Mostrar`, `Editar`, `Mover a otro día`, `Borrar` con confirmación en línea (`Sí, borrar` / `Cancelar`; el texto cambia para tareas que no son manuales: "se retirará y no volverá a aparecer"); botón `Nueva tarea` que abre `TaskForm`. `TaskForm(props: { initial?: Task; defaultDate: IsoDate; onSubmit(values): Promise<void>; onCancel(): void })`: materia, título, título en inglés, día asignado, entrega, descripción; valida con `TaskInputSchema` al enviar y al salir del campo; al mover, si la entrega queda antes del nuevo día se mueve también la entrega. `ProgressTab(props: { api })`: las últimas 4 semanas con barra, estrellas, pistas y "Necesita ayuda"; estado vacío "Todavía no hay actividad de Lucca esta semana". `SettingsTab(props: { settings; connections; onSaved(): void; api })`: nombre, grado, idioma, modo de voz, tema, velocidad (rango 0,7–1,2), "Guardar ajustes", estado de conexiones, y el formulario "Cambiar PIN" (actual, nuevo, confirmación).

- [ ] **Step 1: Tests (deben fallar).** `TasksTab`: positivos (agrupa por día; marcar lista llama `patchTask(id,{status:'done'})` y vuelve a pedir datos; ocultar/mostrar; mover cambia `assignedDate`; borrar con confirmación llama `deleteTask`); negativos (cancelar el borrado no llama a la red; un error del servidor muestra el mensaje junto a la tarea y conserva el estado; red caída → mensaje amable); bordes (semana anterior/siguiente deshabilitadas más allá de ±1; tarea sin fechas en "Sin fecha"; título de 200 caracteres no desborda (clase de ajuste de línea) y se muestra como texto aunque contenga `<b>`/`<script>`; ocultas con la marca "Oculta" y botón "Mostrar"; retiradas no se listan; mover a un día posterior a la entrega mueve también la entrega; sin tareas → "No hay tareas esta semana" con el botón "Nueva tarea"; 30 tareas se renderizan). `TaskForm`: positivo (envía los valores recortados); negativos (título vacío, de 201, sin materia, entrega antes del día asignado → mensaje junto al campo y sin envío); bordes (título de 200 OK, `titleEn` vacío no se envía, `Enter` envía, el segundo clic mientras envía se ignora, al editar los campos vienen precargados, errores del servidor por campo). `ProgressTab`: positivo con datos; borde sin actividad; "Necesita ayuda" con conteo; fallo de red. `SettingsTab`: positivo (guarda solo lo cambiado); negativos (velocidad 0,6 y 1,3, nombre vacío o de 31 → error y sin envío; cambio de PIN con confirmación distinta o PIN corto → error sin envío; PIN actual incorrecto → mensaje "PIN actual incorrecto. Te quedan N intentos"; bloqueado → mensaje con el tiempo); bordes (0,7 y 1,2 válidos, valores con coma decimal `1,1` aceptados como 1,1).
- [ ] **Step 2: Ejecutar** `npx vitest run packages/web/src/parent` → FAIL en los nuevos.
- [ ] **Step 3: Implementar** las pestañas y el panel con su navegación (`aria-current`).
- [ ] **Step 4: Ejecutar** `npx vitest run && npm run typecheck && npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(lucca): área de papá, tareas, progreso y ajustes`.

---

### Task 8: Pruebas funcionales en navegador real con capturas e informe

**Files:**
- Create: `lucca/e2e/functional.cjs`, `lucca/e2e/lib/harness.cjs`, `lucca/docs/pruebas-funcionales/.gitkeep`
- Modify: `lucca/package.json` (`e2e:functional`), `.gitignore` si hace falta

**Interfaces:** consume todo lo anterior. `harness.cjs` exporta `startServer(env): Promise<{ url, stop() }>` (BD en memoria, puerto libre, `LUCCA_FAKE_NOW`), `scenario(id, kind, title, fn)` con `kind` ∈ `positivo | negativo | borde`, `shot(page, name)` (JPEG 1×, carpeta `lucca/docs/pruebas-funcionales/`, nombre `<id>-<name>.jpg`), `expect(cond, message)`, y `report()` que escribe `docs/pruebas-funcionales/index.html` (tabla de escenarios con tipo, resultado y miniaturas) y `results.json`, y sale con código ≠ 0 si algo falló. Reloj: todos los servidores con `LUCCA_FAKE_NOW=2026-11-18T17:00:00Z` (miércoles 18, mediodía en Panamá) para que las capturas sean reproducibles.

- [ ] **Step 1: Escribir la matriz de escenarios** (cada uno con captura(s) del momento clave y comprobaciones en el DOM y en la API):
  - **Acceso (servidor nuevo por grupo):** P01 positivo — primera vez muestra el asistente y el estado de IA/Mereb "falta" sin bloquear; P02 negativo — PIN de 3 dígitos; P03 negativo — PIN con letras; P04 negativo — confirmación distinta; P05 negativo — nombre vacío; P06 borde — nombre de 31 caracteres rechazado y de 30 aceptado; P07 positivo — configuración completa entra al panel; P08 positivo — "Salir" y volver atrás no muestra datos; P09 negativo — PIN incorrecto "Te quedan 4 intentos"; P10 borde — PIN `12` no gasta intento; P11 borde — 5 fallos → bloqueo con cuenta atrás y el PIN correcto no entra; P12 negativo — `/papa` sin sesión en un contexto limpio pide PIN y la API da 401; P13 positivo — PIN correcto tras 2 fallos reinicia la cuenta.
  - **Tareas (con demo sembrada):** P20 positivo — crear tarea manual con título en inglés y verla en la pantalla de Lucca (ES y EN); P21 negativo — título vacío y entrega antes del día asignado (nada guardado); P22 borde — título de 200 caracteres, `<script>`, comillas y emoji se ven como texto, sin desbordes; P23 positivo — mover de día y verla en el nuevo día de Lucca; P24 positivo — ocultar (Lucca no la ve) y mostrar; P25 positivo — marcar lista sin cambiar las estrellas de Lucca; P26 positivo — editar el título; P27 negativo/positivo — borrar: cancelar no cambia, confirmar elimina; P28 borde — semana anterior y siguiente, extremos deshabilitados, tarea de la semana siguiente; P29 borde — tarea sin fechas en "Sin fecha" y Lucca la ve hoy; P30 borde — 30 tareas en un día.
  - **Progreso y ajustes:** P40 borde — sin actividad; P41 positivo — Lucca completa tareas y pide ayuda (vía API) y el panel lo muestra; P50 positivo — cambiar el nombre y el saludo de Lucca cambia; P51 positivo — tema claro y velocidad; P52 negativo — velocidad 2 y nombre vacío; P53 positivo — cambiar el PIN (el viejo ya no entra); P54 negativo — PIN actual incorrecto cuenta como intento.
  - **Responsive y teclado:** P60 borde — panel y pantalla de PIN a 390×844, 768×1024 y 1024×768, en claro y oscuro: sin desplazamiento horizontal, controles ≥ 44 px, contraste 4,5:1; P61 positivo — todo el flujo de PIN y el formulario de tarea con solo teclado (Tab, Enter, Esc).
  - **Pantalla de Lucca:** K01 positivo — semana, plan y guía completa; K02 borde — sin agenda ("Pídele a papá…"); K03 negativo — servidor caído (peticiones abortadas) → pantalla amable y reintento al volver; K04 negativo — fallo al "¡Ya la hice!" (500) → "Inténtalo otra vez" y reintento correcto; K05 borde — domingo abre el lunes siguiente sin día "Hoy"; K06 borde — martes 22:00 en Panamá (miércoles en UTC) muestra el martes; K07 positivo — inglés y modo "Leer" (sin botones de audio); K08 borde — título de 200 caracteres en la tarjeta sin desbordes.
- [ ] **Step 2: Implementar el arnés y los escenarios** hasta que todos pasen; cada fallo encontrado es un bug real: corregirlo con su prueba unitaria primero (RED→GREEN) y repetir.
- [ ] **Step 3: Revisar las capturas** una a una (que muestren el estado que dice el escenario) y confirmar que `index.html` lista todos los escenarios como pasados.
- [ ] **Step 4: Ejecutar** `npm run build && npm run e2e && npm run e2e:functional` → PASS.
- [ ] **Step 5: Commit** `test(lucca): pruebas funcionales con capturas del área de papá y de Lucca`.

---

### Task 9: Documentación, OpenSpec y cierre

**Files:**
- Modify: `lucca/README.md`, `openspec/changes/add-lucca-homework-assistant/tasks.md`

- [ ] **Step 1:** Documentar en el README el área de papá (`/papa`, primera configuración, qué hacer si olvidas el PIN — borrar la clave `pin` de la BD con el comando exacto —, bloqueo y sesión) y las pruebas funcionales (`npm run e2e:functional`, dónde quedan las capturas).
- [ ] **Step 2:** Marcar `3.1`, `3.2`, `3.3` en `tasks.md` (y la parte de `3.10` de ajustes y progreso, anotando que el gasto de IA llega con el cliente de IA) y anotar desviaciones.
- [ ] **Step 3: Suite completa** `cd lucca && npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:functional`, `openspec validate add-lucca-homework-assistant --strict` y las pruebas de AgentDash → verdes.
- [ ] **Step 4: Commit** `docs(lucca): área de papá y pruebas funcionales` y `git push`.

---

## Self-Review

- **Cobertura de spec (parent-area):** Acceso con PIN (Task 2, 3, 6), Primera configuración (Task 3, 6), Gestión de la agenda sin Mereb ni fotos (Task 4, 7), Progreso semanal sin tiempo de uso ni fotos de ejercicios (Task 1, 4, 7), Ajustes (solo los que ya funcionan: nombre, grado, idioma, modo de voz, tema, velocidad; el resto llega con su función), Cambiar el PIN (Task 3, 7). **Diferido a propósito:** conexión con Mereb, revisión de lecciones, tiempo de uso, gasto de IA, subir foto de la agenda.
- **Consistencia de tipos:** `WeekProgress`, `needsHelp`, `TaskInputSchema`/`TaskPatchSchema`, `fieldErrors` y los métodos de `LuccaDb` se definen en Task 1 y se usan con esos nombres en Tasks 3, 4, 6 y 7; `parentApi` se define en Task 6 y se consume en Task 7.
- **Proporción:** las matrices de escenarios son el entregable pedido (pruebas funcionales positivas, negativas y de borde); el código lo escribe quien implementa.
