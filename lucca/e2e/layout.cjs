// Verificación en un navegador real: sin desplazamiento horizontal, controles de tamaño táctil,
// texto legible, sin errores y sin peticiones fuera de casa. Requiere `npm run build` y Playwright.
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = process.env.E2E_PORT || '4898';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
];
const THEMES = ['dark', 'light'];
const MIN_TAP = 60;
const MIN_PRIMARY = 76;
const MIN_FONT = 19;

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${ORIGIN}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('el servidor no respondió en /api/health');
}

/** Se ejecuta dentro de la página. */
function measure({ MIN_TAP, MIN_PRIMARY, MIN_FONT }) {
  const problems = [];
  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth) problems.push(`desplazamiento horizontal: scrollWidth ${root.scrollWidth} > ${window.innerWidth}`);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  // El enlace al área de papá también es un control táctil, y no debe estirarse llenando la columna.
  for (const a of document.querySelectorAll('a.parent-link')) {
    if (!visible(a)) continue;
    const r = a.getBoundingClientRect();
    if (r.height < MIN_TAP - 0.5) problems.push(`enlace a papá bajo (${Math.round(r.height)}px)`);
    if (r.height > MIN_TAP * 1.6) problems.push(`enlace a papá estirado (${Math.round(r.height)}px)`);
  }
  for (const b of document.querySelectorAll('button')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    const name = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40);
    if (r.width < MIN_TAP - 0.5 || r.height < MIN_TAP - 0.5) problems.push(`botón pequeño (${Math.round(r.width)}×${Math.round(r.height)}): ${name}`);
    if (b.classList.contains('btn-primary') && r.height < MIN_PRIMARY - 0.5) problems.push(`acción principal baja (${Math.round(r.height)}px): ${name}`);
  }
  for (const b of document.querySelectorAll('.task-card button')) {
    const card = b.closest('.task-card').getBoundingClientRect();
    const r = b.getBoundingClientRect();
    if (r.right > card.right + 0.5 || r.left < card.left - 0.5) {
      problems.push(`botón fuera de su tarjeta: ${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)}`);
    }
  }
  // Contraste del texto (4.5:1) sobre el fondo real: los fondos translúcidos se mezclan con lo que tienen detrás.
  const rgb = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const effectiveBg = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let out = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 };
    while (layers.length) {
      const c = layers.pop();
      out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a), a: 1 };
    }
    return out;
  };
  const CONTRAST = ['.pill', '.pill-this', '.today-pill', '.btn-guide', '.btn-primary', '.seg-btn', '.day-btn', '.chip', '.chip-status', '.task-card', '.guide-card', '.plan-day', '.guide-later', '.week-range'];
  for (const sel of CONTRAST) {
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el) || !(el.textContent || '').trim()) continue;
      const fg = rgb(getComputedStyle(el).color);
      const bg = effectiveBg(el);
      const [hi, lo] = [Math.max(lum(bg), lum(fg)), Math.min(lum(bg), lum(fg))];
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 4.5) problems.push(`poco contraste (${ratio.toFixed(1)}:1) en ${sel}: ${(el.textContent || '').trim().slice(0, 30)}`);
    }
  }
  for (const b of document.querySelectorAll('.guide-card button')) {
    const card = b.closest('.guide-card').getBoundingClientRect();
    const r = b.getBoundingClientRect();
    if (r.right > card.right + 0.5 || r.left < card.left - 0.5) {
      problems.push(`botón fuera de la guía: ${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)}`);
    }
  }
  for (const chip of document.querySelectorAll('.chip')) {
    const row = chip.closest('.plan-day').getBoundingClientRect();
    const r = chip.getBoundingClientRect();
    if (r.right > row.right + 0.5 || r.left < row.left - 0.5) {
      problems.push(`etiqueta fuera de su día en el plan: ${(chip.textContent || '').trim().slice(0, 40)}`);
    }
  }
  for (const sel of ['.summary', '.suggestion', '.task-title', '.free-day p', '.guide-card h1', '.chip-title', '.plan-start', '.week-progress-text']) {
    for (const el of document.querySelectorAll(sel)) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (visible(el) && size < MIN_FONT) problems.push(`texto pequeño (${size}px): ${sel}`);
    }
  }
  return problems;
}

async function check(page, label, failures) {
  const problems = await page.evaluate(measure, { MIN_TAP, MIN_PRIMARY, MIN_FONT });
  for (const p of problems) failures.push(`[${label}] ${p}`);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'packages/server/dist/lucca.mjs')], {
    stdio: ['ignore', 'ignore', 'inherit'],
    // Reloj fijo (miércoles 18): con el reloj real, un fin de semana cambia las pantallas y la prueba deja de ser repetible.
    env: { ...process.env, LUCCA_DEMO: '1', LUCCA_DB: ':memory:', LUCCA_PORT: PORT, LUCCA_HOST: '127.0.0.1', LUCCA_FAKE_NOW: '2026-11-18T17:00:00Z', NODE_OPTIONS: '--disable-warning=ExperimentalWarning' },
  });
  let browser;
  let code = 1;
  const failures = [];
  try {
    await waitForHealth();
    browser = await chromium.launch();
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        const label = `${theme} ${viewport.width}×${viewport.height}`;
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
        await context.addInitScript((t) => localStorage.setItem('lucca.theme', t), theme);
        const page = await context.newPage();
        page.on('pageerror', (e) => failures.push(`[${label}] error de página: ${e}`));
        page.on('requestfailed', (r) => failures.push(`[${label}] petición fallida: ${r.url()}`));
        page.on('request', (r) => {
          const u = new URL(r.url());
          if (!u.protocol.startsWith('data') && u.origin !== ORIGIN) failures.push(`[${label}] petición fuera de casa: ${r.url()}`);
        });
        await page.goto(ORIGIN);
        await page.waitForSelector('h1');
        if ((await page.locator('html').getAttribute('data-theme')) !== theme) failures.push(`[${label}] el tema no se aplicó`);
        await check(page, label, failures);
        await page.screenshot({ path: path.join(OUT, `${theme}-${viewport.width}x${viewport.height}.png`), fullPage: true });

        // Elegir la semana: la siguiente cambia el rango y "Esta semana" vuelve.
        const range = () => page.locator('.week-range > span').first().textContent();
        const thisWeek = await range();
        await page.getByRole('button', { name: 'Semana siguiente' }).click();
        if ((await range()) === thisWeek) failures.push(`[${label}] «Semana siguiente» no cambió el rango`);
        await check(page, `${label} semana siguiente`, failures);
        await page.getByRole('button', { name: 'Esta semana' }).click();
        if ((await range()) !== thisWeek) failures.push(`[${label}] «Esta semana» no volvió a la semana actual`);

        // Plan de la semana.
        await page.getByRole('button', { name: 'Plan de la semana' }).click();
        await page.getByRole('heading', { level: 1, name: 'Plan de la semana' }).waitFor();
        await check(page, `${label} plan`, failures);
        await page.screenshot({ path: path.join(OUT, `${theme}-${viewport.width}x${viewport.height}-plan.png`), fullPage: true });
        await page.getByRole('button', { name: 'Volver a mi semana' }).click();
        await page.getByRole('heading', { level: 2, name: 'Mi semana' }).waitFor();

        // Guía del día (sin marcar nada, para no cambiar el estado entre combinaciones).
        await page.getByRole('button', { name: 'Guíame' }).click();
        await page.getByText(/^Tarea 1 de \d+$/).waitFor();
        await check(page, `${label} guía`, failures);
        await page.screenshot({ path: path.join(OUT, `${theme}-${viewport.width}x${viewport.height}-guia.png`), fullPage: true });
        await context.close();
      }
    }

    // El mismo control en inglés, con tablet horizontal.
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    await page.goto(ORIGIN);
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('heading', { name: 'Hi, Lucca!' }).waitFor();
    await check(page, 'inglés 1024×768', failures);
    await page.screenshot({ path: path.join(OUT, 'english-1024x768.png'), fullPage: true });
    if ((await page.locator('html').getAttribute('lang')) !== 'en') failures.push('[inglés] <html lang> no cambió a en');

    // De punta a punta: terminar el día con la guía, con el servidor real.
    await page.getByRole('button', { name: 'Guide me' }).click();
    await page.getByText(/^Task 1 of \d+$/).waitFor();
    const total = Number((await page.getByText(/^Task 1 of \d+$/).textContent()).match(/of (\d+)/)[1]);
    for (let i = 0; i < total; i++) {
      await page.getByRole('button', { name: 'I did it!' }).click();
      if (i < total - 1) await page.getByText(`Task ${i + 2} of ${total}`).waitFor();
    }
    await page.getByRole('heading', { level: 1, name: 'You finished the day!' }).waitFor();
    await check(page, 'inglés fin de la guía', failures);
    await page.screenshot({ path: path.join(OUT, 'english-1024x768-guia-fin.png'), fullPage: true });
    const earned = Number((await page.locator('.guide-stars').textContent()).match(/(\d+)/)[1]);
    if (earned !== total) failures.push(`[inglés] estrellas ganadas ${earned}, se esperaban ${total} (una por tarea)`);
    await page.getByRole('button', { name: 'Back to my week' }).click();
    const weekStars = Number(await page.locator('.stars-number').textContent());
    if (weekStars !== total) failures.push(`[inglés] las estrellas de la semana son ${weekStars}, se esperaban ${total}`);
    await context.close();

    if (failures.length) {
      console.error('Incumplimientos:\n' + failures.map((f) => ' - ' + f).join('\n'));
    } else {
      console.log(`OK: ${THEMES.length * VIEWPORTS.length * 4 + 2} pantallas revisadas. Capturas en e2e/out/`);
      code = 0;
    }
  } catch (err) {
    console.error('e2e falló:', err);
  } finally {
    await browser?.close();
    server.kill();
  }
  process.exit(code);
})();
