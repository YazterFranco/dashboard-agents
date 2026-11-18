# Design

## Context

- **Motivación:** ver `proposal.md` (sección Why). Los requisitos de comportamiento están en `specs/lucca/*/spec.md`.
- **Repo actual:** monorepo de AgentDash (TypeScript, npm workspaces, Fastify 5, zod 4, React 19, Vite 7, `node:sqlite`, vitest, Docker/Podman). El asistente es un producto distinto: vive en `lucca/` y no toca `packages/*`.
- **Mereb (I-Mereb, BIOS Software, Panamá):** no tiene API pública. El padre entra por la web y va directo a la sección de agenda. Todavía no conocemos el HTML de esa página.
- **Dónde corre:** en la computadora de la casa, con Docker. Lucca lo usa cuando esa computadora está encendida, desde el navegador de la propia compu o de una tablet en el mismo wifi.
- **Red local por HTTP:** el acceso desde la tablet es `http://<ip-de-la-compu>:4830`, que **no es un contexto seguro**. Eso impide `getUserMedia` (cámara en vivo), service workers (PWA sin conexión) y cookies `Secure`. El diseño evita depender de ellos.
- **Diseño visual aprobado:** estilo C · Bento, con modo oscuro y claro, tipografías Bricolage Grotesque (títulos) y Andika (lectura) y la mascota "Nova". Referencia: lienzo [Asistente de Lucca — estilos](https://claude.ai/artifact/1Qw3NwooJZKTLqEKw7bTVB), tablero "C · Bento".
- **Referencias actuales usadas:**
  - Generative UI declarativa: A2UI 1.0 (Google, nov. 2026). El agente describe la interfaz y el cliente la dibuja con sus propios componentes.
  - Google Research "Learning Interactives" (sept. 2026): el docente aprueba los objetivos y el contenido generado pasa controles automáticos antes de llegar al alumno.
  - Ensayo aleatorizado con LearnLM en el Reino Unido: la tutoría con pistas interactivas corrigió más errores que las pistas fijas.
  - Estudio de Khanmigo en Tennessee: los alumnos abandonan cuando las pistas frustran. Moderar el ritmo fue la intervención humana más frecuente.
  - NN/g: los niños pequeños necesitan objetivos táctiles de unos 2 × 2 cm y les cuesta arrastrar.
  - SIL/Google Fonts: Andika está pensada para lectores principiantes.
  - Buenas prácticas de sandbox para HTML generado: `allow-scripts` sin `allow-same-origin`, más CSP.
  - Playwright `storageState` para reutilizar sesiones.
  - Ley 81 de 2019 de Panamá: interés superior del menor en el tratamiento de sus datos.

## Goals / Non-Goals

**Goals:**
- Que Lucca complete su rutina (ver la semana, entender, hacer y practicar) sin ayuda para manejar la app, solo con toques y voz.
- Que el contenido generado sea **predecible y seguro**: siempre con el estilo Bento, validado antes de mostrarse y sin respuestas reveladas.
- Coste de IA bajo y con techo: preparación por lotes, caché y tope mensual.
- Resistencia a fallos de Mereb: lector automático, extracción asistida por IA y foto del padre, en ese orden.
- Que el padre siga presente: la tutoría con IA para 5 a 7 años funciona mejor supervisada. El área del padre, las marcas de "Necesita ayuda" y la revisión de lecciones son parte del producto, no un extra.

**Non-Goals (v1):**
- Entrada por voz de Lucca (reconocimiento de voz). Responde con toques y con un teclado grande.
- Corregir lo que Lucca escribe a mano en su hoja: él responde en la app o dice "¡Terminé!".
- Escribir en Mereb (entregar tareas o mensajes a docentes). Solo lectura.
- Varios niños, acceso desde fuera de casa, HTTPS en la red local y app nativa.
- Generar imágenes con modelos de imagen: se usan una biblioteca de ilustraciones y SVG simples.
- Voces neuronales locales: v1 usa las voces del dispositivo, y v1.1 añade Kokoro/Piper detrás de la misma interfaz (ver D10).

## Decisions

### D1. Aplicación independiente en `lucca/` con el stack de AgentDash
`lucca/` tiene su propio `package.json` con workspaces (`shared`, `server`, `web`), su `package-lock.json`, `Dockerfile` y `docker-compose.yml`. Usa Node ≥ 22.13, TypeScript ~5.9, Fastify 5, zod 4, React 19, Vite 7, `node:sqlite` y vitest.
- **Por qué:** es un stack ya probado en el repo y el padre lo conoce. Al tener su propia raíz, no altera la build ni la imagen de AgentDash, y se puede mover a un repo propio copiando la carpeta.
- **Alternativas:** Next.js (descartado: no necesitamos SSR y añade complejidad); un workspace más de la raíz (descartado: mezcla las dependencias y la imagen de AgentDash).

### D2. Lecciones como UI generativa declarativa por bloques (enfoque C aprobado)
La IA no escribe HTML: devuelve un documento `LessonDoc` en JSON (pantallas → bloques), validado por un esquema zod compartido entre `server` y `web`. La web lo dibuja con componentes React propios del estilo Bento. Es el mismo principio que A2UI: el agente describe la intención y el cliente controla cómo se dibuja.
- **Catálogo v1:** `explain` (texto + ilustración), `hotspots` (tocar partes de un dibujo), `count`, `numberLine`, `order`, `match`, `choice`, `trueFalse`, `fillWord`, `sort`, `story` y `freeform`.
- **Texto bilingüe y por fragmentos:** cada texto es `{ es: Segment[], en: Segment[] }`, donde `Segment = { text, lang? }`. Así las palabras en otro idioma se leen con su voz (ver voice-and-language).
- **Ilustraciones:** se referencian por `id` a una biblioteca local curada de Fluent Emoji 3D (licencia MIT, unas 300 imágenes) o con un SVG simple escrito por la IA. El SVG se limpia con DOMPurify (perfil SVG, sin scripts ni referencias externas, máximo 30 KB). Los `hotspots` apuntan a `id` de regiones de ese SVG.
- **Generación:** se usan *structured outputs* (`output_config.format` con el JSON Schema obtenido de zod con `z.toJSONSchema`), luego validación zod y después los controles semánticos (D6).
- **Alternativas:** HTML libre (A, descartado: inconsistente, inseguro, se lee mal en voz alta); adoptar el protocolo A2UI completo (descartado en v1: sus componentes genéricos no cubren los bloques educativos y nuestro catálogo es pequeño, pero el `LessonDoc` se podría traducir a A2UI en el futuro).

### D3. Bloque libre en un iframe aislado
`freeform` lleva `html` (máximo 100 KB) y se muestra en `<iframe sandbox="allow-scripts" srcdoc=…>`, nunca con `allow-same-origin`, así que corre en un origen opaco. Dentro lleva una CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`. La comunicación es solo por `postMessage` con una lista blanca de mensajes (`done` y `answer`). Si no envía `ready` en 3 s, se omite el bloque.
- **Alternativa:** ejecutar el código en un web worker con un canvas (descartado: limita demasiado las animaciones simples).

### D4. IA: Claude con el SDK oficial de TypeScript
Se usa `@anthropic-ai/sdk` con el modelo `claude-opus-5-5` en todas las tareas (el valor por defecto recomendado; el padre no pidió otro). Pensamiento adaptativo por defecto y `effort` explícito: `medium` para lecciones, práctica y lectura de fotos, y `low` para la revisión de seguridad.
- **Refusals:** se usa `fallbacks: "default"` con la beta `server-side-fallback-2026-07-01` en las llamadas directas, y siempre se comprueba `stop_reason === "refusal"` antes de leer el contenido.
- **Coste:** se usa *prompt caching* en el prompt de sistema estable (reglas, catálogo, ejemplos), poniendo lo variable al final. La preparación semanal va por la **Message Batches API** (50 % más barata y asíncrona). La Batches API no acepta `fallbacks`, así que un refusal en lote se reintenta en llamada directa. Las llamadas en vivo ("Explícamelo de otra forma" o una lección que no está lista) usan streaming con `finalMessage()`.
- **Flujos de IA:**
  - **P1 agenda desde imagen:** imagen → `Task[]` propuestas.
  - **P2 lección y banco de práctica:** tarea → `LessonDoc` (ES y EN) + `PracticeItem[]` (≥ 20, en 3 niveles).
  - **P3 lectura de la hoja con guía:** foto o PDF → `Exercise[]` con pasos, 3 pistas, ejemplo parecido resuelto y `answerKey`.
  - **P4 explicación alternativa:** bajo demanda.
  - **P5 revisión de seguridad y calidad:** contenido → `{ ok, issues[] }`.
- **Datos no confiables:** el texto de Mereb y las fotos se envían entre delimitadores y el prompt de sistema indica tratarlos solo como datos. Las respuestas de Lucca **no se envían a la IA**: se comprueban de forma determinista (números y palabras normalizados, sin acentos ni mayúsculas).
- **Coste estimado:** en torno a 0,10–0,20 USD por tarea preparada por lotes, más unos 0,05–0,10 USD por foto leída. Con unas 10 tareas a la semana, entre 2 y 4 USD semanales. El tope mensual por defecto es 20 USD. Se medirá con `usage` real y se mostrará en el área del padre.

### D5. Lector de Mereb con Playwright y tres niveles de respaldo
Playwright con Chromium sin interfaz corre dentro del contenedor. El inicio de sesión usa las variables del `.env` y la sesión se guarda con `storageState` en `/data/mereb/state.json` (permisos 600). El adaptador está aislado (`server/src/mereb/`), con los selectores en un único archivo y pruebas contra un HTML de muestra guardado por el padre (con datos personales borrados).
1. **Lector determinista** por selectores.
2. **Extracción asistida:** si los selectores fallan, se toma el texto visible de la agenda, se quitan los nombres conocidos (de Lucca y del padre) y se envía a P1 en modo texto. Las tareas resultantes quedan como "por confirmar" para el padre.
3. **Foto del padre** (P1 con imagen).
- **Buenas prácticas:** solo lectura, la cuenta propia del padre, como máximo cada 3 horas y 6 inicios de sesión al día, y se espera a que la página termine de cargar antes de guardar la sesión.
- **Zona horaria:** `America/Panama`, configurable.

### D6. Controles automáticos de contenido (cadena común)
Todo contenido pasa, en este orden:
1. Validación zod.
2. Reglas deterministas: sin URLs, frases de 12 palabras o menos para el grado configurado, idioma del fragmento coherente, SVG limpio y tamaño máximo.
3. Para las pistas: **control de fuga de respuesta**, que normaliza la `answerKey` y la busca en el texto de cada pista, incluidos números escritos con letras.
4. Revisión P5 de seguridad.

Si algo falla, se regenera solo la parte afectada, hasta 2 veces. Después se usa la lección sencilla de respaldo o el mensaje "con papá". La `answerKey` **nunca sale del servidor**: el cliente envía la respuesta y el servidor responde si es correcta o qué paso revisar.

### D7. Datos (SQLite con `node:sqlite`)
| Tabla | Contenido |
| --- | --- |
| `tasks` | Tareas normalizadas (`source_id` único por origen, `status`, `work_date`, `due_date`, `hidden`, `retired`) |
| `attachments` | Adjuntos de Mereb |
| `lessons` | `LessonDoc` por tarea y versión, con `status` (`pending`/`ready`/`needs_review`/`hidden`/`failed`) |
| `practice_items` | Banco de práctica |
| `worksheets` | Fotos y fichas, con los ejercicios leídos |
| `exercise_keys` | Respuestas, solo en el servidor |
| `progress_events` | Registro solo de añadidos: paso completado, respuesta, pista usada, tarea terminada, pausa… De ahí se derivan estados, estrellas y el progreso semanal |
| `settings` | Ajustes |
| `ai_usage` | Tokens y coste por llamada |
| `sync_runs` | Historial de sincronizaciones |
| `upload_tokens` | Tokens de un solo uso para el QR |
| `parent_sessions` | Sesiones del padre |

Las fotos se guardan en `/data/photos`, reescaladas a un máximo de 1568 px de lado largo y sin EXIF (con `sharp`).

### D8. Servidor, API y tiempo real
- **API:** Fastify con rutas `/api/kid/*`, `/api/parent/*` (requieren cookie de sesión del padre), `/api/upload/:token` (página y subida desde el celular) y `/api/health`.
- **Tiempo real:** WebSocket (`@fastify/websocket`, como AgentDash) para "foto recibida", "lección lista" y "sincronización terminada".
- **Planificador en proceso:** sincroniza al arrancar y cada 3 h, pone en cola la preparación tras cada sincronización, consulta el lote cada 2 min mientras haya uno pendiente, y hace el respaldo diario y la limpieza de fotos.
- **Acceso:**
  - Un middleware rechaza IP no privadas.
  - PIN con hash scrypt y bloqueo tras 5 intentos.
  - Cookie `httpOnly; SameSite=Strict` con 15 min de inactividad.
- **Aviso sobre Docker Desktop:** el contenedor puede ver la IP de la pasarela de Docker y no la del cliente. La protección real es **no abrir el puerto en el router** más el PIN, y la guía lo dirá claramente.

### D9. Web (React)
- **Rutas:**
  - `/` — Mi semana
  - `/tarea/:id` y sus secciones `/entender`, `/hacer` y `/practicar`
  - `/papa/*` — área del padre
  - `/subir/:token` — página para el celular
- **Diseño:** tokens del lienzo Bento (fondos, tiles, acentos por materia, radios de 36 px y formas expresivas). Fuentes Andika y Bricolage Grotesque **autoalojadas** (`@fontsource/*`), sin pedir nada a Google desde la tablet. Texto de lectura de al menos 19 px. Controles de al menos 60 px, y las acciones principales de al menos 76 px.
- **Animación:** CSS y Web Animations con `prefers-reduced-motion`. La celebración es breve y no bloquea.
- **i18n:** diccionario propio ES/EN para la interfaz. El contenido viene bilingüe en `LessonDoc`.
- **Acceso directo:** `manifest.webmanifest` e iconos para "Añadir a pantalla de inicio", sin service worker porque no es un contexto seguro.

### D10. Voz: Web Speech API ahora, voz neuronal local después
`speechSynthesis` funciona por HTTP y usa voces del dispositivo, sin coste ni datos fuera de casa.
- **Voces:** la preferencia en español es `es-PA`, luego `es-MX`, `es-US`, `es-419` y cualquier `es-*`; en inglés, `en-US` y luego cualquier `en-*`.
- **Velocidad:** 0,9 por defecto.
- **Resaltado:** por evento `boundary` (palabra), y por frase si el motor no lo emite.
- **Idiomas mezclados:** un `SpeechSynthesisUtterance` por fragmento, con su idioma.
- **Desbloqueo en iOS:** Safari exige un gesto del usuario para empezar a hablar, así que el modo "Escuchar" se activa con el primer toque ("Empezar" o el saludo).
- **Interfaz `Speaker`:** permite enchufar en v1.1 un motor local en el servidor (Kokoro‑82M, Apache‑2.0, con voces en español e inglés, o Piper `es_MX`) con caché de audio. TTS en la nube descartado por coste y privacidad.

### D11. Fotos sin cámara en vivo
Se usa `<input type="file" accept="image/*" capture="environment">`, que abre la app de cámara del dispositivo y funciona por HTTP, en lugar de `getUserMedia`, que exige contexto seguro.
- **QR:** codifica `LUCCA_PUBLIC_URL/subir/<token>`, de un solo uso y válido 10 min. `LUCCA_PUBLIC_URL` (p. ej. `http://192.168.1.50:4830`) se configura en `.env`, porque el contenedor no conoce de forma fiable la IP de la compu en la red. La configuración inicial lo muestra y lo comprueba.
- **PDF de Mereb:** se envían a P3 como bloque `document`.

### D12. Pruebas
- **vitest:** esquemas, controles de contenido (incluida la fuga de respuestas), normalización de tareas, idempotencia de la sincronización, planificador y lógica de estrellas y estados.
- **Testing Library:** componentes de bloques y accesibilidad (etiquetas, tamaños).
- **e2e con Playwright:** contra un **Mereb falso** (HTML de muestra servido localmente) y con la **IA simulada** con respuestas grabadas, sin coste.
- **Evaluación de calidad aparte:** un conjunto pequeño (unas 10 tareas reales) para medir la calidad de las lecciones con la IA real. Se ejecuta a mano y con presupuesto aprobado por el padre.

### D13. Contenedor
- **Imagen:** multi-etapa. Construye `web` y `server` con `node:22`, y la ejecución usa la imagen oficial de Playwright con la **misma versión** que el `package.json` (trae Chromium y sus dependencias). Corre con un usuario sin privilegios, volumen `/data`, `TZ=America/Panama` y `HEALTHCHECK` a `/api/health`.
- **Compose:** `ports: "4830:4830"` (necesario para la tablet; distinto de AgentDash, que solo publica en 127.0.0.1), `env_file: .env` y `restart: unless-stopped`.
- **Podman:** archivo quadlet equivalente, como `deploy/podman` de AgentDash.

### D14. Decisiones menores tomadas en la revisión (el padre puede cambiarlas)
- **Varios hijos en la cuenta de Mereb:** variable opcional `MEREB_STUDENT` para elegir a Lucca si la cuenta muestra más de un estudiante.
- **"Revisar antes de mostrar":** desactivado por defecto. Los controles automáticos (D6) se aplican siempre.
- **Avisos al padre:** solo dentro de la app (un indicador en el candado y una lista en su área). No hay correo ni notificaciones push en v1.
- **Idioma por materia:** Inglés se muestra en inglés y Español en español por defecto, con un botón para ver la otra versión.
- **Ejercicios que no se pueden comprobar** (dibujar, leer un cuento): pasos guiados y un botón "Lo hice" en lugar de comprobar la respuesta.
- **Tareas de otros días:** Lucca puede abrir las tareas de cualquier día de la semana visible, no solo las de hoy.

### D15. Elegir la semana y guías por semana y por día (petición posterior)
La elección de semana, el plan y la guía son **estado de pantalla del cliente**: no cambian la API de lectura (`/api/kid/state` ya trae las tareas) y toda la lógica es pura y compartida (`shiftWeek`, `weekTotals`, `guideOrder`, `defaultDayOf` en `shared`).
- **Vistas:** `WeekPlan` y `DayGuide` son vistas de pantalla completa dentro de `WeekScreen` (con botón "Volver a mi semana"); no son rutas todavía, así que el botón "atrás" del navegador no las recorre. Las rutas llegan con "Entender / Hacer la tarea".
- **"¡Ya la hice!"** envía `task_done` a `/api/kid/progress` con actualización optimista; si falla, deshace el cambio y la mascota dice "Inténtalo otra vez". La estrella la decide el servidor (una por tarea y tipo, ver D14/I5).
- **La guía no abre lecciones** hasta que existan (fase 3); entonces "Empezar" se añade antes de "¡Ya la hice!".
- **Orden de la guía:** empezada, urgentes, materia; "Más tarde" manda la tarea al final de la ronda, solo en memoria.
- **Alternativas descartadas:** guía como asistente conversacional con IA (sin chat libre y con costo por tarea); calendario mensual (demasiado abstracto a los 7 años).

## Risks / Trade-offs

- **[La página de Mereb cambia o pide captcha]** → Hay 3 niveles de respaldo (D5), avisos al padre y el adaptador aislado con pruebas sobre HTML de muestra.
- **[Términos de uso de Mereb]** → Solo lectura, con la cuenta del padre y frecuencia baja. Si el colegio lo prohíbe, se desactiva el lector y queda la foto.
- **[Contenido incorrecto o inadecuado]** → Bloques validados, controles D6, revisión de seguridad, "Revisar antes de mostrar" y vista previa del padre.
- **[Lucca se frustra con las pistas (Khanmigo)]** → Pistas cortas, el ejemplo resuelto como tercer nivel, "Pide ayuda a papá" tras 3 pistas, pausas y seguimiento de las pistas usadas en el progreso.
- **[Coste de IA mayor de lo estimado]** → Lotes, caché, banco de práctica reutilizable, tope mensual y medición real en las primeras semanas.
- **[HTTP en la red local]** → Sin PWA offline, sin cámara en vivo y cookies sin `Secure`. Se mitiga con el acceso solo por red local, `capture` para fotos y la recomendación de no abrir el puerto. HTTPS local (Caddy con CA propia) queda para después.
- **[Voces del dispositivo de calidad variable]** → El padre elige la voz, y la voz neuronal local llega en v1.1.
- **[La IA rechaza un contenido escolar legítimo]** → `fallbacks: "default"`, reintento y mensaje amable "con papá".
- **[La computadora apagada]** → La tablet mostrará el error del navegador. Es aceptado en v1 y la guía lo explica.

## Migration Plan

Es una aplicación nueva, así que no hay datos que migrar. Se entrega por fases (detalle en `tasks.md`):
- **Fase 0 — prerrequisitos.**
  - En la PC de casa: Docker Desktop o Podman, y Git.
  - Una API key de Anthropic con facturación activa.
  - La cuenta de padre en Mereb.
  - Una muestra de la página de agenda guardada con Ctrl+S, con los datos personales tapados.
  - La tablet en el mismo wifi, con voces en español e inglés.
  - En este entorno de desarrollo ya están Node 22.23, npm 10.9, OpenSpec 2.1.0, Docker, y Playwright con Chromium.
- **Fase 1 — base:** carpeta `lucca/`, servidor, BD, "Mi semana" con tareas manuales, área del padre (PIN, tareas), voz e idioma.
- **Fase 2 — agenda:** lector de Mereb, extracción asistida y foto de la agenda.
- **Fase 3 — Entender:** catálogo de bloques, generación, controles, preparación por lotes y revisión.
- **Fase 4 — Hacer la tarea:** fotos, QR, lectura de la hoja, pasos y pistas.
- **Fase 5 — Practicar.**
- **Fase 6 — Cierre:** seguridad, pausas, respaldos, contenedor, e2e y guía para el padre.

**Vuelta atrás:** `docker compose down` (el volumen conserva los datos). AgentDash no se ve afectado.

## Open Questions

- Estructura exacta del HTML de la agenda de Mereb. Solo afecta al adaptador (D5) y se resuelve con la muestra de la Fase 0.
- Grado exacto de Lucca y nombre definitivo de la mascota. Se configuran en la primera configuración.
- Si conviene pasar a voz neuronal local en v1.1, según la calidad de las voces de la tablet.
