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

Todavía **no** están: la lectura automática de Mereb, las lecciones con IA, la ayuda con fotos de la tarea, los juegos
de práctica, el control del gasto de IA ni el contenedor Docker. Llegan en las siguientes fases del plan.

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
| `LUCCA_FAKE_NOW` | **Solo para pruebas**: fija el "ahora" del servidor (instante ISO, p. ej. `2026-11-18T17:00:00Z`) | el reloj real |

`ANTHROPIC_API_KEY`, `MEREB_*` y `LUCCA_PUBLIC_URL` ya están en `.env.example` porque se usarán en las
fases siguientes; en esta fase no se leen.

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
| **Tareas** | Semana anterior, actual y siguiente. Crear tareas (con título en inglés opcional), editar, mover de día, ocultar y mostrar, marcar lista (sin dar estrella) y borrar. Una tarea manual se borra del todo; una que venga de otro origen se retira para que no vuelva. |
| **Progreso** | Las últimas 4 semanas: tareas listas, estrellas, pistas usadas y las tareas donde Lucca pidió ayuda. |
| **Ajustes** | Nombre, grado, idioma, modo de voz, tema y velocidad de la voz (0,7 a 1,2; se acepta «1,1» o «1.1»). También el estado de las conexiones y el cambio de PIN. |

Los ajustes de papá son los valores por defecto: si Lucca elige idioma, voz o tema en su tablet, lo suyo manda para esa
opción, y lo que nunca eligió sigue los cambios de papá desde la siguiente carga.

**Si olvidas el PIN.** Apaga el asistente y, desde esta carpeta, ejecuta:

```bash
npm run reset-pin
```

Borra el PIN y cierra todas las sesiones (no toca las tareas ni el progreso). Enciende el asistente y abre `/papa`
enseguida para crear uno nuevo. Si la base de datos no está en `./data/lucca.db`, indícala con
`LUCCA_DB=/ruta/lucca.db npm run reset-pin`.

**Todavía no incluye:** la conexión con Mereb y su sincronización, subir la foto de la agenda, la revisión de lecciones,
el tiempo de uso por día y el tope de gasto de IA; llegan con las funciones que los necesitan.

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

`npm run e2e:functional` son las **pruebas funcionales**: 45 escenarios en un navegador real contra el servidor real,
con el reloj fijo en el miércoles 18 de noviembre de 2026 (`LUCCA_FAKE_NOW`) para que se repitan igual cualquier día.
Cada escenario es **positivo**, **negativo** o de **borde** (acceso y bloqueo con PIN, crear/mover/ocultar/borrar tareas,
progreso, ajustes, cambio de PIN, móvil/tablet/escritorio en oscuro y claro, uso solo con teclado, y la pantalla de
Lucca: guía, sin conexión, errores al marcar, domingo y cambio de día en Panamá). Las capturas y el informe quedan en
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
