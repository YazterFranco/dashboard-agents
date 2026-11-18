# Tasks

## 0. Prerrequisitos (padre)

- [ ] 0.1 Instalar Docker Desktop (o Podman) y Git en la computadora de casa y verificar que `docker compose version` responde
- [ ] 0.2 Crear una API key de Anthropic con facturación activa y verificar que se puede pegar en `lucca/.env` (no en el chat)
- [ ] 0.3 Guardar la página de la agenda de Mereb (Ctrl+S, "página completa") con los datos personales tapados y verificar que está en `lucca/server/test/fixtures/mereb/` al empezar la sección 3
- [ ] 0.4 Instalar en la tablet voces de español e inglés y verificar que suenan en los ajustes de texto a voz del sistema

## 1. Base del proyecto

- [x] 1.1 Crear `lucca/` con `package.json` (workspaces `shared`, `server`, `web`), `tsconfig.base.json`, `vitest.config.ts` y `.gitignore` (incluye `.env` y `data/`), y verificar que `npm install` y `npm run typecheck` pasan en `lucca/`
- [x] 1.2 Añadir `lucca/.env.example` (`ANTHROPIC_API_KEY`, `MEREB_URL`, `MEREB_USER`, `MEREB_PASSWORD`, `MEREB_STUDENT` opcional, `LUCCA_PUBLIC_URL`, `LUCCA_PORT`, `TZ`) y verificar que no contiene valores reales
- [x] 1.3 Crear en `shared` los esquemas zod (`Task`, `Subject`, `TaskStatus`, `Settings`, mensajes WS) y verificar con pruebas de vitest que aceptan y rechazan los casos de ejemplo _(hecho sin los mensajes WS: no hay WebSocket hasta la fase 4)_
- [x] 1.4 Crear el servidor Fastify con `/api/health`, carga de configuración desde `.env` y registros sin secretos, y verificar con una prueba que `/api/health` no expone ningún valor del `.env`
- [x] 1.5 Implementar la BD SQLite (`node:sqlite`) con migraciones para `tasks`, `progress_events`, `settings` y `parent_sessions`, y verificar con pruebas que las migraciones se aplican sobre una BD vacía y son idempotentes _(hecho con las tablas de la fase 1; el resto llega con su fase)_
- [x] 1.6 Implementar el middleware de solo red privada y verificar con pruebas que rechaza una IP pública con 403 y acepta 192.168.x.x, 10.x.x.x y 127.0.0.1

## 2. "Mi semana", voz e idioma (sin IA)

- [x] 2.1 Crear la web Vite + React con los tokens del estilo C · Bento (oscuro y claro) y las fuentes autoalojadas Andika y Bricolage Grotesque, y verificar que `npm run build -w web` termina sin errores
- [x] 2.2 Implementar la lógica de "día de trabajo", atrasadas, fines de semana y estados en `shared`, y verificar con pruebas los escenarios de weekly-planner (martes 17, domingo, entrega el miércoles, atrasada)
- [x] 2.3 Implementar la pantalla "Mi semana" (saludo, mascota Nova, días, tarjetas, estado vacío, "sin agenda todavía") y verificar con Testing Library que el día de hoy queda seleccionado y que todos los controles miden ≥ 60 px _(los tamaños ≥ 60 px se verifican en navegador real con `npm run e2e`, no en jsdom)_
- [x] 2.4 Implementar las estrellas como derivación de `progress_events` (nunca restan, reinicio semanal) y verificar con pruebas
- [x] 2.5 Implementar el diccionario ES/EN de la interfaz y el cambio de idioma sin perder la pantalla actual, y verificar con una prueba de componente
- [x] 2.6 Implementar `Speaker` con Web Speech API (modos Escuchar/Leer/Ambos, velocidad 0,9, preferencia de voces, fragmentos por idioma, resaltado por palabra o frase, desbloqueo con el primer toque) y verificar con pruebas usando un `speechSynthesis` simulado _(el resaltado visual palabra por palabra llega con las pantallas de lección; `Speaker` ya emite `onWord`)_
- [x] 2.7 Añadir `manifest.webmanifest`, iconos y metadatos de "Añadir a pantalla de inicio", y verificar que el manifiesto es válido en la build _(manifiesto e icono incluidos en la build; no se validó con una herramienta externa)_
- [x] 2.8 Verificar en un navegador real a 1024×768 y 768×1024 que "Mi semana" no tiene desplazamiento horizontal (captura con Playwright)

## 2b. Elegir la semana y guías por semana y por día (petición de papá)

- [ ] 2b.1 Añadir en `shared` la lógica pura (`shiftWeek`, `weekTotals`, `guideOrder`, `defaultDayOf`) y verificar con pruebas los escenarios de elegir semana, resumen y orden de la guía
- [ ] 2b.2 Añadir los textos ES/EN (rango de fechas, resumen, plan, guía) y verificar con pruebas que no falta ninguna clave y que el rango cruza bien de mes
- [ ] 2b.3 Enviar el progreso desde la pantalla con actualización optimista y verificar con pruebas que se deshace si el servidor falla
- [ ] 2b.4 Implementar los botones de semana y el resumen con barra de progreso, y verificar con Testing Library los escenarios de elegir la semana
- [ ] 2b.5 Implementar "Plan de la semana" y verificar con Testing Library sus escenarios
- [ ] 2b.6 Implementar "Guíame" (orden, "¡Ya la hice!", "Más tarde", cierre, voz) y verificar con Testing Library sus escenarios
- [ ] 2b.7 Verificar en navegador real que las tres vistas no desbordan a 1024×768 y 768×1024, en oscuro y claro

## 3. Área del padre y agenda

- [ ] 3.1 Implementar el PIN (hash scrypt, bloqueo tras 5 intentos, sesión de 15 min, cookie httpOnly SameSite=Strict) y verificar con pruebas los escenarios de parent-area
- [ ] 3.2 Implementar la primera configuración (PIN, comprobación de API key, Mereb, nombre, grado, idioma, tema y `LUCCA_PUBLIC_URL`) y verificar con e2e que no deja terminar sin API key
- [ ] 3.3 Implementar la gestión de tareas del padre (crear, editar, mover de día, ocultar, marcar lista, ver 3 semanas) y verificar con e2e que una tarea movida aparece en el nuevo día para Lucca
- [ ] 3.4 Implementar la normalización e idempotencia de tareas (`source_id`, actualización, "retirada" con progreso) y verificar con pruebas los escenarios de agenda-sync
- [ ] 3.5 Implementar el lector de Mereb con Playwright (inicio de sesión, `storageState` con permisos 600, máximo 6 inicios de sesión al día y 1 sincronización cada 15 min) contra un Mereb falso servido con la muestra de 0.3, y verificar con pruebas que lee las tareas de la muestra
- [ ] 3.6 Implementar la extracción asistida por IA (texto visible con nombres eliminados → tareas "por confirmar") con la IA simulada, y verificar con pruebas que los nombres configurados no salen en la petición
- [ ] 3.7 Implementar la foto de la agenda (P1) con confirmación del padre, y verificar con e2e (IA simulada) que no se añade nada hasta pulsar "Añadir tareas"
- [ ] 3.8 Implementar el planificador (al arrancar, cada 3 h, manual), el estado de sincronización y los avisos al padre, y verificar con pruebas usando un reloj simulado
- [ ] 3.9 Descargar los adjuntos de Mereb y verificar con el Mereb falso que una ficha PDF queda guardada en la tarea
- [ ] 3.10 Implementar el progreso semanal, los ajustes y el medidor de gasto de IA con tope (aviso al 80 %, corte al 100 %), y verificar con pruebas el escenario "Tope alcanzado"
- [ ] 3.11 Documentar en `lucca/README.md` cómo conectar Mereb y qué hacer si falla, y verificar que los pasos coinciden con la primera configuración

## 4. Cliente de IA y controles de contenido

- [ ] 4.1 Crear el cliente de Claude (`@anthropic-ai/sdk`, `claude-opus-5-5`, pensamiento adaptativo, `effort` explícito, *prompt caching* del sistema, `fallbacks: "default"` con la beta `server-side-fallback-2026-07-01`, comprobación de `refusal`, registro en `ai_usage`) y verificar con pruebas usando respuestas grabadas
- [ ] 4.2 Implementar el modo de pruebas con respuestas grabadas (sin red ni coste) que usan todas las pruebas y el e2e, y verificar que `npm test` pasa sin `ANTHROPIC_API_KEY`
- [ ] 4.3 Implementar la cadena de controles D6 (zod, URLs, longitud de frase, idioma por fragmento, limpieza de SVG con DOMPurify, tamaños, fuga de respuesta incluidos números con letras, revisión P5) y verificar con pruebas cada regla y el escenario "Pista que revela la respuesta"
- [ ] 4.4 Implementar la minimización de datos (sin nombre completo, colegio ni credenciales; fotos sin EXIF y reescaladas con `sharp`) y verificar con una prueba que inspecciona las peticiones salientes

## 5. "Entender": lecciones interactivas

- [ ] 5.1 Definir en `shared` el esquema `LessonDoc` (pantallas, 12 tipos de bloque, textos bilingües por fragmentos, ilustraciones por id o SVG) y su JSON Schema, y verificar con pruebas lecciones de ejemplo válidas e inválidas
- [ ] 5.2 Seleccionar e incluir la biblioteca curada de ilustraciones (Fluent Emoji 3D, MIT, unas 300) con su licencia, y verificar que cada `id` del catálogo resuelve a un archivo
- [ ] 5.3 Implementar los componentes React de los 11 bloques no libres con el estilo Bento, accesibles y con objetivos de ≥ 60 px, y verificar cada uno con Testing Library
- [ ] 5.4 Implementar el bloque libre en `iframe sandbox="allow-scripts"` con CSP, mensajes por lista blanca, límite de 100 KB y 3 s de espera, y verificar con e2e que una petición de red y un acceso a `parent` quedan bloqueados
- [ ] 5.5 Implementar el reproductor de lecciones (Atrás/Siguiente, "Paso N de M", preguntas finales, "Explícamelo de otra forma" tras dos fallos, idioma, botón "¿Me lo dices en español?" en Inglés) y verificar con e2e los escenarios de interactive-lessons
- [ ] 5.6 Implementar P2 (lección y banco de práctica ≥ 20 retos) con *structured outputs* y reintentos, y la lección sencilla de respaldo, y verificar con respuestas grabadas válidas e inválidas
- [ ] 5.7 Implementar la preparación por lotes (Message Batches tras la sincronización, consulta cada 2 min, refusal → llamada directa con fallbacks) y la generación en vivo con espera de 60 s como máximo, y verificar con pruebas usando un reloj simulado
- [ ] 5.8 Implementar la revisión del padre (vista previa sin progreso, regenerar, ocultar, "Revisar antes de mostrar") y verificar con e2e el escenario "Aprobación obligatoria"
- [ ] 5.9 Ejecutar la evaluación de calidad con 10 tareas reales y la IA real (con presupuesto aprobado por el padre) y verificar que todas superan los controles y la revisión del padre

## 6. "Hacer la tarea"

- [ ] 6.1 Implementar la subida de fotos (`input capture`, hasta 4, archivo) y la página `/subir/:token` con QR de un solo uso válido 10 min, y verificar con e2e que la foto subida desde la "página del celular" aparece en la pantalla de Lucca por WebSocket
- [ ] 6.2 Implementar P3 (lectura de foto o PDF → ejercicios, pasos, 3 pistas, ejemplo parecido y `answerKey` solo en el servidor) y verificar con respuestas grabadas, incluida la "Foto borrosa"
- [ ] 6.3 Implementar la comprobación de respuestas en el servidor (normalización de números y palabras) y la respuesta "qué paso revisar", y verificar que la API nunca devuelve la `answerKey`
- [ ] 6.4 Implementar la pantalla guiada (tarjetas de ejercicios, confirmación "¡Sí, es mi hoja!", teclado grande, escalera de pistas, "Pide ayuda a papá" y marca para el padre) y verificar con e2e los escenarios de homework-help
- [ ] 6.5 Implementar la guía por tema sin foto, el uso de la ficha adjunta y "¡Terminé!" con celebración (respetando el movimiento reducido), y verificar con e2e
- [ ] 6.6 Implementar el borrado de fotos a los 30 días (configurable), y verificar con pruebas usando un reloj simulado

## 7. "Practicar"

- [ ] 7.1 Implementar la sesión de práctica (5 a 8 retos desde el banco, ≥ 2 tipos de juego, dificultad adaptable 2/2, repaso de lo fallado, sin quitar estrellas) y verificar con pruebas los escenarios de practice-games
- [ ] 7.2 Implementar el cierre de la sesión (resumen hablado, "Otra ronda" y "Volver a mi semana") y verificar con e2e

## 8. Bienestar, respaldos y contenedor

- [ ] 8.1 Implementar el recordatorio de pausa (25 min, configurable) y el límite diario con ampliación por PIN, y verificar con pruebas usando un reloj simulado
- [ ] 8.2 Implementar los mensajes amables de la mascota ante fallos o rechazos de la IA (sin detalles técnicos para Lucca, con detalle para el padre), y verificar con e2e simulando un error de la IA
- [ ] 8.3 Implementar el respaldo diario (conserva 7) y la descarga y restauración desde el área del padre, y verificar con pruebas
- [ ] 8.4 Crear `lucca/Dockerfile` (multietapa, imagen de Playwright de la misma versión, usuario sin privilegios, `/data`, `HEALTHCHECK`), `docker-compose.yml` (`4830:4830`, `env_file`, `restart: unless-stopped`, TZ) y el quadlet de Podman, y verificar que `docker compose up -d` arranca y `/api/health` responde
- [ ] 8.5 Escribir la guía del padre en `lucca/README.md` (prerrequisitos, `.env`, arranque, IP local y QR, "no abras el puerto en el router", voces, solución de problemas), y verificar siguiéndola desde cero en una máquina limpia

## 9. Integración final

- [ ] 9.1 Ejecutar el e2e completo con el Mereb falso y la IA simulada (sincronizar → Mi semana → Entender → Hacer la tarea con foto por QR → Practicar → progreso del padre) y verificar que pasa
- [ ] 9.2 Revisar la accesibilidad (etiquetas en ES y EN, foco visible, contraste en oscuro y claro, tamaños) y verificar que no quedan incumplimientos
- [ ] 9.3 Ejecutar `openspec validate add-lucca-homework-assistant --strict` y verificar que pasa sin avisos

## Workflow follow-up

- Probar una semana real con Lucca y ajustar textos, voces y tope de gasto según el uso medido.
- Archivar el cambio con `openspec archive add-lucca-homework-assistant` cuando el padre dé por buena la v1.
