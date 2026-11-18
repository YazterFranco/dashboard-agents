# Proposal

## Why

Lucca (7 años) tiene tareas todos los días en la agenda de Mereb, la plataforma de su colegio, pero no puede consultarla solo ni entender cada tema sin un adulto al lado. Queremos un asistente que le muestre **qué hacer cada día de la semana**, le **explique los temas con lecciones interactivas** y lo **guíe a hacer la tarea sin hacérsela**. Todo debe funcionar con botones, voz y dibujos: Lucca nunca escribe instrucciones a una IA. Debe estar en español e inglés (colegio bilingüe), en audio, en texto o en ambos.

Ahora es buen momento porque la IA generativa ya puede crear interfaces interactivas fiables a partir de bloques declarativos (Generative UI, A2UI 1.0 de Google, noviembre de 2026) y leer fotos de una hoja de tarea. Además, la evidencia más reciente sobre tutoría con IA favorece las pistas guiadas frente a dar la respuesta.

## What Changes

- **Nueva aplicación "Asistente de Lucca"** en la carpeta `lucca/` de este repo, separada de AgentDash. Usa el mismo stack: TypeScript, React, Node, SQLite y Docker.
- **Lectura automática de la agenda de Mereb** desde la web, con la sesión del padre. Si falla, el padre sube una captura o foto de la agenda.
- **Pantalla principal "Mi semana"** con el estilo C · Bento aprobado (modo oscuro y claro): días de lunes a viernes, tareas por día, estado y estrellas.
- **Elegir la semana y guías por semana y por día**: Lucca puede ir a la semana anterior o siguiente, ver el "Plan de la semana" con el avance y pedir "Guíame" para recorrer las tareas del día una a una, con voz.
- **"Entender"**: lecciones interactivas generadas con IA a partir de una biblioteca de bloques propios, más un bloque "libre" aislado (sandbox) para animaciones especiales. Se preparan por adelantado y el padre puede revisarlas.
- **"Hacer la tarea"**: foto de la hoja o del libro (con la cámara de la tablet o con el celular mediante un código QR). La IA la lee y lo guía ejercicio por ejercicio con una escalera de 3 pistas, sin dar nunca la respuesta final. Sin foto, guía por tema.
- **"Practicar"**: juegos cortos de unos 5 minutos sobre el mismo tema.
- **Voz e idioma**: modos Escuchar, Leer o Ambos; lectura en voz alta con resaltado palabra por palabra; español e inglés en la interfaz y en el contenido.
- **Área de papá** protegida con PIN: conexión con Mereb, estado de la sincronización, revisión de lecciones, progreso semanal, ajustes y gasto de IA.
- **Seguridad infantil y privacidad**: sin chat libre, contenido adaptado a su edad, datos guardados en casa y al mínimo lo que se envía a la IA.
- **Servidor en casa**: un contenedor Docker en la computadora del padre, accesible solo desde el wifi de la casa.

## Capabilities

### New Capabilities
- `lucca/agenda-sync`: obtener y normalizar las tareas de la agenda de Mereb (automático con navegador sin interfaz, respaldo por foto y captura manual).
- `lucca/weekly-planner`: pantalla principal de Lucca con la semana (elegible), las tareas por día, su estado, las estrellas, el plan de la semana y la guía del día.
- `lucca/interactive-lessons`: generación, validación, preparación anticipada y presentación de lecciones interactivas a partir de bloques.
- `lucca/homework-help`: guía paso a paso para hacer la tarea, a partir de la foto de la hoja o del tema, con escalera de pistas.
- `lucca/practice-games`: sesiones cortas de práctica con juegos sobre el tema de la tarea.
- `lucca/voice-and-language`: modos de audio, lectura y ambos; texto a voz con resaltado; idioma español o inglés.
- `lucca/parent-area`: área protegida con PIN para configurar, supervisar y revisar.
- `lucca/child-safety`: reglas de contenido, privacidad, aislamiento del contenido generado y bienestar (pausas).
- `lucca/home-server`: ejecución local en Docker, acceso solo por red local, arranque con la computadora y respaldos.

### Modified Capabilities
<!-- Ninguna: AgentDash no cambia. -->

## Impact

- **Código nuevo:** `lucca/` (paquetes `shared`, `server`, `web`), con su propio `package.json`, `Dockerfile` y `docker-compose.yml`. Los paquetes de AgentDash (`packages/*`) no se tocan.
- **Dependencias nuevas:** `@anthropic-ai/sdk`, `playwright` (Chromium dentro del contenedor), `fastify`, `zod`, `react`, `vite`, `qrcode` y almacenamiento con `node:sqlite`.
- **Servicios externos:** API de Claude (modelo `claude-opus-5-5`), que requiere API key y tiene costo por uso (estimado entre 2 y 4 USD por semana, con tope mensual configurable de 20 USD por defecto), y la web de Mereb (I-Mereb, BIOS Software) con la cuenta del padre.
- **Datos:** SQLite y fotos en un volumen local de Docker. Las credenciales de Mereb y la API key van en un archivo `.env` fuera de git.
- **Riesgos:** cambios en la página de Mereb (mitigado con el respaldo por foto), costo de IA (mitigado con preparación por lotes, caché y medidor), y contenido incorrecto o inadecuado (mitigado con bloques validados, revisión del padre y reglas de seguridad).
