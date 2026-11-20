# Asistente de Lucca

Un asistente para que Lucca (7 años) vea qué tareas tiene cada día de la semana y, más adelante,
las entienda con lecciones interactivas y se guíe para hacerlas. Todo con botones grandes, voz y dibujos:
Lucca nunca escribe instrucciones a una IA. Está en español e inglés, con modo **Escuchar**, **Leer** o **Ambos**.

La propuesta completa (por qué, qué, cómo y las tareas) está en
[`../openspec/changes/add-lucca-homework-assistant/`](../openspec/changes/add-lucca-homework-assistant/).

## Qué funciona hoy (fase 1)

- Pantalla **Mi semana** en estilo Bento (modo oscuro y claro): días de lunes a viernes, tareas del día,
  estado (por hacer, a medias, lista), estrellas de la semana y la mascota Nova.
- **Español e inglés** en toda la interfaz y **lectura en voz alta** con las voces del dispositivo.
- Servidor en tu computadora (Node + SQLite) que solo acepta peticiones de tu red de casa.
- **Elegir la semana**: botones «Semana anterior», «Semana siguiente» y «Esta semana», con el rango de fechas y
  el avance de la semana («2 de 10 tareas listas»).
- **Plan de la semana**: todos los días con sus tareas y por dónde empezar.
- **Guíame**: recorre las tareas pendientes del día de una en una, con «¡Ya la hice!» (marca la tarea y da la
  estrella) y «Más tarde», leyendo cada paso en voz alta según el modo.
- Tareas de ejemplo con `LUCCA_DEMO=1`.
- **Área de papá** (`/papa`) con PIN: crear y editar tareas a mano, moverlas de día, ocultarlas, marcarlas listas,
  ver el progreso de Lucca y cambiar los ajustes (nombre, grado, idioma, voz, tema y velocidad de lectura).

- **Entender**: «Empezar» en una tarea abre una lección corta e interactiva (4–6 pantallas y 2–3 preguntas) con
  10 tipos de bloque: explicar, cuento, opción, verdadero/falso, contar, recta numérica, ordenar, unir, completar la
  palabra y clasificar. Inglés se ve en inglés y Español en español, con botón para cambiar. Pistas tras el primer
  fallo (sin dar la respuesta), «Explícamelo de otra forma» (y la mascota lo ofrece tras dos fallos), elogio del
  esfuerzo, tocar cualquier texto para oírlo y una estrella al terminar.
- **Repaso rápido**: las preguntas de cada lección terminada vuelven al día siguiente; si Lucca acierta a la primera,
  vuelven a los 3, 7 y 14 días; si falla, al día siguiente. Como mucho 5 al día y una estrella diaria.
- **Gasto de IA** con tope mensual (20 USD por defecto) visible en Ajustes, y vista previa de cada lección para papá.

Todavía **no** están: la lectura automática de Mereb, la ayuda con fotos de la tarea, los juegos de práctica con
dificultad adaptable ni el contenedor Docker. Llegan en las siguientes fases del plan.

### Por qué funciona así

Las mejoras siguen lo que la investigación respalda para niños de primaria:

- **Recordar en días distintos** (práctica de recuperación espaciada) fija mejor lo aprendido que repasar todo de golpe;
  hay evidencia en preescolar y primaria, aunque los estudios en el aula a esta edad aún son pocos.
  ([Learning Scientists](https://www.learningscientists.org/blog/2022/2/3-1), [Frontiers](https://www.frontiersin.org/articles/10.3389/fpsyg.2016.00350/full))
- **Elogiar el proceso** («lo pensaste bien», «seguiste intentando») y no el talento se asocia con más persistencia en
  niños de 5 y 6 años. ([resumen](https://www.crowthercentre.org.au/resources/the-secrets-to-successful-praise/), [Springer](https://link.springer.com/article/10.1007/s12193-020-00353-9))
- **Pistas en lugar de respuestas**: un tutor que guía con preguntas ayuda más que uno que resuelve, aunque los niños
  tienden a usarlo menos si no es amable; por eso la pista aparece solo tras un fallo y es corta.
  ([Hechinger Report](https://hechingerreport.org/?p=117943))
- **Texto que se oye al tocarlo**, como en Khan Academy Kids, para un lector que empieza.
  ([Khan Academy](https://blog.khanacademy.org/supporting-english-language-acquisition-with-khan-academy-kids/))
  El resaltado palabra por palabra no mostró ventajas claras, así que no se añadió. ([CAST](https://cisl.cast.org/research/read-aloud))

## Requisitos

- Node.js **22.13 o superior** (usa `node:sqlite`).
- Para las pruebas de pantalla (`npm run e2e`): Playwright con Chromium.

## Empezar

Todos los comandos se ejecutan desde esta carpeta (`lucca/`).

```bash
npm install
```

### Probar con tareas de ejemplo

```bash
npm run build
```

```bash
LUCCA_DEMO=1 npm start
```

Abre <http://localhost:4830>. `LUCCA_DEMO=1` carga una semana de tareas de ejemplo; sin ella la pantalla pide
conectar la agenda. Los datos se guardan en `./data/lucca.db`.

### Desarrollo

En dos terminales:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

La web de desarrollo queda en <http://localhost:5173> y usa el servidor de `4830`.

## Abrirlo desde la tablet

1. Averigua la IP de tu computadora en la red de casa (por ejemplo `192.168.1.50`).
2. Con la tablet en el **mismo wifi**, abre `http://192.168.1.50:4830`.
3. Opcional: en el navegador de la tablet, "Añadir a pantalla de inicio" para tener un icono.

> **No abras el puerto 4830 en el router.** El servidor rechaza las direcciones que no son de la red local,
> pero la protección real es que internet nunca llegue hasta él.

Si la tablet no conecta, revisa que el firewall de tu computadora permita conexiones entrantes al puerto `4830`.

## Configuración

Copia `.env.example` a `.env` y completa lo que necesites. **Nunca subas `.env` a git.**

| Variable | Para qué sirve | Por defecto |
| --- | --- | --- |
| `LUCCA_PORT` | Puerto del servidor | `4830` |
| `LUCCA_HOST` | Dirección en la que escucha | `0.0.0.0` |
| `LUCCA_DB` | Ruta de la base de datos | `./data/lucca.db` |
| `LUCCA_DEMO` | `1` carga tareas de ejemplo | `0` |
| `LUCCA_WEB_DIR` | Carpeta de la web ya construida | la que va junto al servidor |
| `TZ` | Zona horaria (define "hoy" y la semana de las estrellas) | `America/Panama` |
| `ANTHROPIC_API_KEY` | Activa las lecciones con IA (Claude Opus 5.5). Sin ella, Lucca ve «Esta tarea la vemos con papá» | vacía |
| `LUCCA_AI` | `recorded` usa lecciones grabadas (demo y pruebas, sin coste); `off` apaga la IA aunque haya clave | según la clave |
| `LUCCA_FAKE_NOW` | **Solo para pruebas**: fija el "ahora" del servidor (instante ISO, p. ej. `2026-11-18T17:00:00Z`) | el reloj real |

`MEREB_*` y `LUCCA_PUBLIC_URL` ya están en `.env.example` porque se usarán en las fases siguientes.

**Lecciones con IA.** Con `ANTHROPIC_API_KEY` en el `.env`, la primera vez que Lucca abre una tarea se prepara su
lección (puede tardar hasta un minuto; después queda guardada y se abre al instante). Cada lección pasa controles
automáticos: esquema, frases de 12 palabras o menos, dos idiomas, sin enlaces y pistas que no revelan la respuesta.
Si la IA falla tres veces, Lucca ve una lección sencilla de respaldo y papá un aviso en Ajustes. La petición a la IA
nunca lleva el nombre del niño. Para probar sin clave ni coste: `LUCCA_DEMO=1 LUCCA_AI=recorded npm start`.

## Área de papá

Se abre desde el candado «Área de papá» de la pantalla de Lucca, o directamente en `http://<tu-computadora>:4830/papa`.

**Primera vez.** El asistente de configuración pide un PIN de 4 a 6 números (y su repetición), el nombre del niño, el
grado, el idioma y el tema. Muestra si la IA y Mereb están conectados; si falta alguno explica qué añadir al archivo
`.env` (`ANTHROPIC_API_KEY`, `MEREB_URL`, `MEREB_USER`, `MEREB_PASSWORD`), pero **nunca impide terminar**: puedes
completar el `.env` después. La configuración se hace una sola vez; mientras no exista un PIN, cualquiera de tu red de
casa podría hacerla, así que conviene hacerla justo después del primer arranque.

**Entrar y salir.** Se entra con el PIN. Cinco fallos seguidos bloquean el acceso 5 minutos (hay cuenta atrás en pantalla,
y un PIN correcto durante el bloqueo no entra). Un PIN con formato inválido no cuenta como fallo. La sesión se cierra sola tras
15 minutos sin actividad y con «Salir»; la cookie es `HttpOnly` y `SameSite=Strict`.

**Qué se puede hacer.**

| Pestaña | Para qué |
| --- | --- |
| **Tareas** | Semana anterior, actual y siguiente. «Ver lección» la muestra como la ve Lucca (sin contar progreso) y permite regenerarla. Crear tareas (con título en inglés opcional), editar, mover de día, ocultar y mostrar, marcar lista (sin dar estrella) y borrar. Una tarea manual se borra del todo; una que venga de otro origen se retira para que no vuelva. |
| **Progreso** | Las últimas 4 semanas: tareas listas, estrellas, pistas usadas, las tareas donde Lucca pidió ayuda y el Repaso rápido (preguntas guardadas, aprendidas y para hoy). |
| **Ajustes** | Nombre, grado, idioma, modo de voz, tema, velocidad de la voz (0,7 a 1,2; se acepta «1,1» o «1.1») y tope mensual de IA (1 a 200 USD). También el estado de las conexiones, el gasto de IA del mes (aviso al 80 %, corte al 100 %), las lecciones de respaldo y el cambio de PIN. |

Los ajustes de papá son los valores por defecto: si Lucca elige idioma, voz o tema en su tablet, lo suyo manda para esa
opción, y lo que nunca eligió sigue los cambios de papá desde la siguiente carga.

**Si olvidas el PIN.** Apaga el asistente y, desde esta carpeta, ejecuta:

```bash
npm run reset-pin
```

Borra el PIN y cierra todas las sesiones (no toca las tareas ni el progreso). Enciende el asistente y abre `/papa`
enseguida para crear uno nuevo. Si la base de datos no está en `./data/lucca.db`, indícala con
`LUCCA_DB=/ruta/lucca.db npm run reset-pin`.

**Todavía no incluye:** la conexión con Mereb y su sincronización, subir la foto de la agenda, ocultar lecciones o
«Revisar antes de mostrar» y el tiempo de uso por día; llegan con las funciones que los necesitan.

## Pruebas

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build && npm run e2e
```

`npm run e2e` abre el asistente en un navegador real a 1366×768, 1024×768 y 768×1024, en oscuro y claro, y comprueba
que no hay desplazamiento horizontal, que todos los botones miden al menos 60 px (76 px las acciones principales),
que el texto de lectura mide al menos 19 px, que el texto tiene contraste 4,5:1 y que no se pide nada fuera de casa.
También recorre el plan de la semana y la guía, y termina un día completo con el servidor real. Deja capturas en `e2e/out/`.

```bash
npm run build && npm run e2e:functional
```

`npm run e2e:functional` son las **pruebas funcionales**: 61 escenarios en un navegador real contra el servidor real,
con el reloj fijo en el miércoles 18 de noviembre de 2026 (`LUCCA_FAKE_NOW`) para que se repitan igual cualquier día.
Cada escenario es **positivo**, **negativo** o de **borde** (acceso y bloqueo con PIN, crear/mover/ocultar/borrar tareas,
progreso, ajustes, cambio de PIN, móvil/tablet/escritorio en oscuro y claro, uso solo con teclado, y la pantalla de
Lucca: guía, sin conexión, errores al marcar, domingo y cambio de día en Panamá; «Entender»: lección completa,
bloques, inglés/español, pistas, otra explicación, sin IA, vista previa de papá y gasto; «Repaso rápido» con varios
días simulados sobre la misma base de datos). Las capturas y el informe quedan en
[`docs/pruebas-funcionales/`](docs/pruebas-funcionales/index.html) (`index.html`, `results.json` y un JPEG por momento clave).
Para repetir solo algunos: `ONLY=P60,K03 npm run e2e:functional`.

## Estructura

```
packages/shared   esquemas y lógica compartida (semana, día de trabajo, estrellas)
packages/server   servidor Fastify + SQLite, solo red privada
packages/web      pantalla de Lucca (React + Vite)
e2e/              verificación de layout y pruebas funcionales en navegador real
scripts/          utilidades (reset-pin)
docs/pruebas-funcionales/   capturas e informe de las pruebas funcionales
```
