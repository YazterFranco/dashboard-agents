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

Todavía **no** están: la lectura automática de Mereb, el área de papá con PIN, las lecciones con IA, la ayuda con fotos
de la tarea, los juegos de práctica ni el contenedor Docker. Llegan en las siguientes fases del plan.

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

## Estructura

```
packages/shared   esquemas y lógica compartida (semana, día de trabajo, estrellas)
packages/server   servidor Fastify + SQLite, solo red privada
packages/web      pantalla de Lucca (React + Vite)
e2e/              verificación de layout en navegador real
```
