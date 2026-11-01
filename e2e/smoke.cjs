// End-to-end smoke test: built CLI server + demo → the UI shows the expected agents.
// Requires `npm run build` first and Playwright available (`require('playwright')`).
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = process.env.E2E_PORT || '4899';
const URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'packages/cli/dist/agentdash.mjs');
const EXPECTED = ['refactor-auth', 'test-runner', 'stripe-docs', 'power: stripe', 'checkout-spec', 'Esperando input', 'deploy-check', 'Error'];

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, ...args], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`agentdash ${args[0]} salió con ${code}`))));
  });

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('el servidor no respondió en /api/health');
}

(async () => {
  const server = spawn(process.execPath, [CLI, 'start', '--port', PORT, '--db', ':memory:'], { stdio: 'inherit' });
  let browser;
  let code = 1;
  try {
    await waitForHealth();
    await run(['demo', '--url', URL, '--speed', '8']);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL);
    for (const text of EXPECTED) await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
    if (errors.length) throw new Error(`errores en la página: ${errors.join('; ')}`);
    await page.screenshot({ path: path.join(__dirname, 'screenshot.png'), fullPage: true });
    console.log('e2e ok');
    code = 0;
  } catch (err) {
    console.error('e2e falló:', err.message);
  } finally {
    await browser?.close();
    server.kill();
    process.exit(code);
  }
})();
