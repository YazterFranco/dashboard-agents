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
  for (const sel of ['.summary', '.suggestion', '.task-title', '.free-day p']) {
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
    env: { ...process.env, LUCCA_DEMO: '1', LUCCA_DB: ':memory:', LUCCA_PORT: PORT, LUCCA_HOST: '127.0.0.1', NODE_OPTIONS: '--disable-warning=ExperimentalWarning' },
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
    await context.close();

    if (failures.length) {
      console.error('Incumplimientos:\n' + failures.map((f) => ' - ' + f).join('\n'));
    } else {
      console.log(`OK: ${THEMES.length * VIEWPORTS.length + 1} pantallas revisadas. Capturas en e2e/out/`);
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
