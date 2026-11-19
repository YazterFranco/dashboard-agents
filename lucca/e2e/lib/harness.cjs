// Arnés de las pruebas funcionales: servidores reales con el reloj fijo, escenarios etiquetados
// (positivo / negativo / borde), capturas JPEG y un informe HTML con todo.
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { mkdirSync, readdirSync, rmSync, writeFileSync, statSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'docs/pruebas-funcionales');
/** Miércoles 18 de noviembre de 2026, mediodía en Panamá (UTC-5): todas las capturas se repiten igual cualquier día. */
const FAKE_NOW = '2026-11-18T17:00:00Z';
const KINDS = ['positivo', 'negativo', 'borde'];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Arranca el servidor ya construido (`npm run build`) con base en memoria, sin claves y con el reloj fijo. */
async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'packages/server/dist/lucca.mjs')], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      // Vacías, no ausentes: así un `.env` real del equipo no las rellena y "falta conectar" se ve igual en cualquier máquina.
      ANTHROPIC_API_KEY: '',
      MEREB_URL: '',
      MEREB_USER: '',
      MEREB_PASSWORD: '',
      LUCCA_DEMO: '0',
      LUCCA_DB: ':memory:',
      LUCCA_PORT: String(port),
      LUCCA_HOST: '127.0.0.1',
      LUCCA_FAKE_NOW: FAKE_NOW,
      NODE_OPTIONS: '--disable-warning=ExperimentalWarning',
      ...env,
    },
  });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const url = `http://127.0.0.1:${port}`;
  let exited = false;
  child.once('exit', () => (exited = true));
  for (let i = 0; i < 75; i++) {
    if (exited) throw new Error(`el servidor se cerró al arrancar: ${stderr}`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (i === 74) throw new Error(`el servidor no respondió en /api/health: ${stderr}`);
  }
  return {
    url,
    port,
    stop: () =>
      new Promise((resolve) => {
        if (exited) return resolve();
        child.once('exit', resolve);
        child.kill();
      }),
  };
}

/** Llama a la API del servidor. `cookie` es el valor de la cookie de sesión de papá. */
async function api(server, method, route, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = `lucca_parent=${cookie}`;
  const res = await fetch(server.url + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = res.status === 204 ? null : await res.json();
  } catch {}
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const set = cookies.find((c) => c.startsWith('lucca_parent='));
  return { status: res.status, json, cookie: set ? set.split(';')[0].slice('lucca_parent='.length) : null };
}

/** Hace la configuración inicial por la API y devuelve la cookie de sesión de papá. */
async function setupParent(server, body = {}) {
  const res = await api(server, 'POST', '/api/parent/setup', {
    body: { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark', ...body },
  });
  if (res.status !== 201) throw new Error(`la configuración inicial falló: ${res.status} ${JSON.stringify(res.json)}`);
  return res.cookie;
}

// ---------- Escenarios ----------
const results = [];
let current = null;

/** Un escenario: `kind` ∈ positivo | negativo | borde. Si algo lanza, el escenario falla y sigue el siguiente. */
async function scenario(id, kind, title, fn) {
  if (!KINDS.includes(kind)) throw new Error(`tipo de escenario desconocido: ${kind}`);
  current = { id, kind, title, ok: true, shots: [], checks: 0, problems: [], pages: [] };
  const started = Date.now();
  try {
    await fn();
    if (current.problems.length) throw new Error(current.problems.join('; '));
  } catch (err) {
    current.ok = false;
    current.error = (err && err.message) || String(err);
    // Una captura del momento del fallo, para ver qué había en pantalla.
    for (const [i, page] of current.pages.entries()) {
      try {
        const file = `${id}-FALLO${current.pages.length > 1 ? `-${i + 1}` : ''}.jpg`;
        await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 60, timeout: 4000 });
        current.shots.push({ name: 'FALLO', file, failure: true });
      } catch {}
    }
  }
  current.ms = Date.now() - started;
  const { pages, ...kept } = current;
  results.push(kept);
  console.log(`${kept.ok ? '✔' : '✘'} ${id} [${kind}] ${title} (${kept.checks} comprobaciones)${kept.ok ? '' : `\n     ${kept.error}`}`);
  current = null;
}

/** Comprobación con mensaje claro; cuenta para el informe. */
function expect(condition, message) {
  if (current) current.checks++;
  if (!condition) throw new Error(message);
}

/** Registra un problema que no corta el escenario en el momento pero lo hace fallar al terminar. */
function problem(message) {
  if (current) current.problems.push(message);
}

/** Para sacar una captura del fallo: registra la página que usa el escenario. */
function watch(page) {
  if (current) current.pages.push(page);
}

/** Captura JPEG del momento clave. Falla si la página se desplaza en horizontal (nunca debe pasar). */
async function shot(page, name, options = {}) {
  expect(current, 'shot() solo dentro de un escenario');
  const file = `${current.id}-${name}.jpg`;
  // `scrollTo`: lo que el escenario quiere mostrar debe quedar a la vista (si no, la captura no prueba nada).
  if (options.scrollTo) await options.scrollTo.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(OUT, file),
    type: 'jpeg',
    quality: 62,
    animations: 'disabled',
    caret: 'hide',
    fullPage: Boolean(options.fullPage),
  });
  current.shots.push({ name, file });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `desplazamiento horizontal de ${overflow}px en «${name}»`);
}

function prepareOut() {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/\.(jpg|json|html)$/.test(f)) rmSync(path.join(OUT, f));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escribe `results.json` e `index.html`. Devuelve el código de salida: 0 si todo pasó. */
function report() {
  results.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  const failed = results.filter((r) => !r.ok);
  const byKind = Object.fromEntries(KINDS.map((k) => [k, results.filter((r) => r.kind === k)]));
  const generated = { clock: FAKE_NOW, total: results.length, passed: results.length - failed.length, failed: failed.length };
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ...generated, results }, null, 2));

  const rows = results
    .map((r) => {
      const thumbs = r.shots
        .map((s) => `<a href="${esc(s.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(s.file)}" alt="${esc(`${r.id} ${s.name}`)}"><span>${esc(s.name)}</span></a>`)
        .join('');
      return `<article class="${r.ok ? 'ok' : 'bad'}" id="${esc(r.id)}">
  <header><span class="id">${esc(r.id)}</span><span class="kind kind-${r.kind}">${r.kind}</span><h2>${esc(r.title)}</h2><span class="res">${r.ok ? '✔ pasó' : '✘ falló'}</span></header>
  <p class="meta">${r.checks} comprobaciones · ${(r.ms / 1000).toFixed(1)} s</p>
  ${r.ok ? '' : `<pre>${esc(r.error)}</pre>`}
  <div class="shots">${thumbs}</div>
</article>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pruebas funcionales · Asistente de Lucca</title>
<style>
:root{color-scheme:light dark;--bg:#0f1626;--card:#1b2436;--ink:#f4f6fb;--muted:#a9b4c8;--line:#4a5670;--ok:#8be28b;--bad:#ff9b8f;--accent:#c6f432}
@media (prefers-color-scheme:light){:root{--bg:#eef1f6;--card:#fff;--ink:#101828;--muted:#4a5568;--line:#b8c2d2;--ok:#166534;--bad:#b42318;--accent:#3b2ee0}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{margin:0 0 4px;font-size:28px}
.sum{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 24px}
.sum span{padding:4px 12px;border-radius:999px;border:2px solid var(--line);font-weight:700}
article{background:var(--card);border-radius:20px;padding:16px;margin:0 0 16px;border:2px solid var(--line)}
article.bad{border-color:var(--bad)}
article header{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
article h2{margin:0;font-size:18px;flex:1 1 280px}
.id{font:700 15px ui-monospace,monospace}
.kind{padding:2px 10px;border-radius:999px;font-size:14px;font-weight:700;border:2px solid var(--line)}
.kind-positivo{color:var(--ok)}.kind-negativo{color:var(--bad)}.kind-borde{color:var(--accent)}
.res{font-weight:700}.ok .res{color:var(--ok)}.bad .res{color:var(--bad)}
.meta{margin:4px 0 8px;color:var(--muted);font-size:14px}
pre{white-space:pre-wrap;color:var(--bad)}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.shots a{display:block;color:var(--muted);text-decoration:none;font-size:14px}
.shots img{width:100%;height:auto;border-radius:10px;border:2px solid var(--line);display:block;margin-bottom:4px}
</style></head><body><main>
<h1>Pruebas funcionales · Asistente de Lucca</h1>
<p>Navegador real (Chromium) contra el servidor real, con el reloj fijo en el miércoles 18 de noviembre de 2026 (mediodía, Panamá).</p>
<div class="sum"><span>${generated.total} escenarios</span><span style="color:var(--ok)">${generated.passed} pasaron</span><span style="color:${failed.length ? 'var(--bad)' : 'var(--muted)'}">${failed.length} fallaron</span>${KINDS.map((k) => `<span>${byKind[k].length} ${k}s</span>`).join('')}</div>
${rows}
</main></body></html>`;
  writeFileSync(path.join(OUT, 'index.html'), html);
  const bytes = readdirSync(OUT)
    .filter((f) => f.endsWith('.jpg'))
    .reduce((n, f) => n + statSync(path.join(OUT, f)).size, 0);
  console.log(`\n${generated.passed}/${generated.total} escenarios pasaron · capturas: ${(bytes / 1e6).toFixed(1)} MB · informe: docs/pruebas-funcionales/index.html`);
  return failed.length === 0 ? 0 : 1;
}

module.exports = { FAKE_NOW, OUT, startServer, api, setupParent, scenario, expect, problem, watch, shot, prepareOut, report };
