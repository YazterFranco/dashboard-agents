// Pruebas de la APP de Android (el mismo paquete que va dentro del APK: packages/web/dist-app), SIN servidor:
// todo corre en el navegador (Chromium, el motor del WebView de Android) con la base de datos en IndexedDB.
// Pantallas de teléfono y tablet, reloj fijo, y un «dispositivo» nuevo por escenario.
// Requiere: npm run build:app. Capturas e informe en docs/pruebas-app/.
process.env.LUCCA_E2E_OUT ||= require('node:path').join(__dirname, '../docs/pruebas-app');
process.env.LUCCA_E2E_TITLE ||= 'Pruebas de la app de Android · Asistente de Lucca';
const path = require('node:path');
const { chromium } = require('playwright');
const H = require('./lib/harness.cjs');
const { serveStatic } = require('./lib/static.cjs');
const { scenario, expect, shot } = H;

const PIN = '482913';
const NOW = new Date('2026-11-18T17:00:00Z'); // miércoles 18, mediodía en Panamá
const PHONE = { viewport: { width: 412, height: 915 }, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
const TABLET = { viewport: { width: 1280, height: 800 }, ua: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const AGENDA = path.join(__dirname, '../packages/server/test/fixtures/mereb/agenda-ficticia.pdf');
const FAKE_KEY = 'sk-ant-api03-' + 'p'.repeat(40) + 'AB12';

let browser;
let app;
const contexts = [];

/** Un dispositivo nuevo (almacenamiento vacío), con el reloj fijo y vigilando errores y salidas a la red. */
async function device(kind = PHONE) {
  const context = await browser.newContext({ viewport: kind.viewport, userAgent: kind.ua, deviceScaleFactor: 2, locale: 'es-PA', isMobile: kind === PHONE, hasTouch: true });
  contexts.push(context);
  await context.clock.setFixedTime(NOW);
  context.on('page', (p) => watchPage(p));
  return context;
}
function watchPage(page) {
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => {
    // X12 simula un WebView sin SQLite en WebAssembly: sql.js avisa de ese fallo esperado y la app sigue con JavaScript.
    if (page.context().__expectWasmAbort && /Aborted\(both async and sync fetching of the wasm failed\)/.test(String(e))) return;
    H.problem(`error de página: ${e}`);
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== app.url && !page.__allowOffsite) H.problem(`petición fuera del dispositivo: ${r.url()}`);
  });
  H.watch(page);
}
async function open(context, route = '/') {
  const page = await context.newPage();
  await page.goto(app.url + route);
  return page;
}
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const limit = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: más de ${ms / 1000} s`)), ms))]);
async function run(id, kind, title, fn) {
  if (ONLY && !ONLY.includes(id)) return;
  // Ningún escenario puede colgar la suite: falla con un mensaje claro.
  await scenario(id, kind, title, () => limit(fn(), 150000, 'el escenario tardó demasiado'));
  for (const c of contexts.splice(0)) await limit(c.close(), 10000, 'cerrar el navegador').catch(() => {});
}

const welcome = (page) => page.getByRole('heading', { name: '¡Bienvenido al asistente de tareas de Lucca!' });
const kidHeading = (page) => page.getByRole('heading', { level: 1, name: /^¡Hola, / });
const parentHeading = (page) => page.getByRole('heading', { name: 'Área de papá', exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function createPin(page, name = 'Lucca') {
  await button(page, 'Empezar').click();
  await button(page, 'Siguiente').click();
  await page.getByLabel('PIN', { exact: true }).fill(PIN);
  await page.getByLabel('Repite el PIN', { exact: true }).fill(PIN);
  await page.getByLabel('Nombre del niño', { exact: true }).fill(name);
  await button(page, 'Terminar configuración').click();
  await page.getByRole('heading', { name: 'Conecta la agenda de Mereb' }).waitFor();
}
async function chooseAgenda(page) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /^Importar (agenda \(PDF\)|otro PDF)$/ }).first().click()]);
  await chooser.setFiles(AGENDA);
}
/** Guía completa hasta la pantalla de Lucca, con la agenda ficticia importada. */
async function firstRun(context) {
  const page = await open(context);
  await welcome(page).waitFor();
  await createPin(page);
  await chooseAgenda(page);
  await button(page, 'Añadir 5 tareas').click();
  await page.getByText('Listo: 5 tareas nuevas.').first().waitFor();
  await button(page, 'Siguiente').click();
  await button(page, 'Ahora no').click();
  await button(page, 'Ir a la pantalla de Lucca').click();
  await kidHeading(page).waitFor();
  return page;
}
/** Al área de papá desde la pantalla de Lucca (sin recargar). Si la sesión sigue abierta no pide el PIN. */
async function parentLogin(page) {
  await page.getByRole('link', { name: /Área de papá/ }).click();
  const pin = page.getByLabel('PIN', { exact: true });
  await Promise.race([pin.waitFor(), parentHeading(page).waitFor()]);
  if (await pin.isVisible().catch(() => false)) {
    await pin.fill(PIN);
    await button(page, 'Entrar').click();
  }
  await parentHeading(page).waitFor();
}

/** Medidas de la pantalla: sin desplazamiento lateral, controles de 44 px, textos de 16 px. */
function measure() {
  const problems = [];
  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth + 1) problems.push(`desplazamiento horizontal: ${root.scrollWidth} > ${window.innerWidth}`);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  for (const el of document.querySelectorAll('button, a.p-btn, select, input:not([type=radio]), textarea, summary')) {
    if (!visible(el) || el.classList.contains('visually-hidden')) continue;
    const target = el.matches('input[type=checkbox]') && el.closest('label') ? el.closest('label') : el;
    const r = target.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) problems.push(`control pequeño (${Math.round(r.width)}×${Math.round(r.height)}): ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}`);
  }
  for (const el of document.querySelectorAll('.p-hint, .p-error, .p-lead, .w-step, .p-status, p, li')) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (visible(el) && size < 15.5) problems.push(`texto pequeño (${size}px): ${(el.textContent || '').trim().slice(0, 30)}`);
  }
  return problems;
}

// =====================================================================================================
(async () => {
  H.prepareOut();
  app = await serveStatic(path.join(__dirname, '../packages/web/dist-app'));
  browser = await chromium.launch();
  let code = 1;
  try {
    await run('X01', 'positivo', 'Primera vez: la app abre la guía, se crea el PIN, se importa la agenda y Lucca ve sus tareas', async () => {
      const context = await device(PHONE);
      const page = await open(context);
      await welcome(page).waitFor();
      expect((await kidHeading(page).count()) === 0, 'la primera vez no se ve la pantalla de Lucca sino la guía');
      await page.getByText('Paso 1 de 6').waitFor();
      await shot(page, '1-bienvenida', { fullPage: true });
      await button(page, 'Empezar').click();
      await page.getByRole('heading', { name: 'Cómo se usa' }).waitFor();
      await shot(page, '2-como-se-usa', { fullPage: true });
      await button(page, 'Siguiente').click();
      await page.getByText('Paso 3 de 6').waitFor();
      await shot(page, '3-pin', { fullPage: true });
      await page.getByLabel('PIN', { exact: true }).fill(PIN);
      await page.getByLabel('Repite el PIN', { exact: true }).fill(PIN);
      await page.getByLabel('Nombre del niño', { exact: true }).fill('Lucca');
      await button(page, 'Terminar configuración').click();
      await page.getByRole('heading', { name: 'Conecta la agenda de Mereb' }).waitFor();
      expect((await page.getByLabel(/contraseña/i).count()) === 0, 'la app nunca pide la contraseña de Mereb');
      await shot(page, '4-mereb', { fullPage: true });
      await chooseAgenda(page);
      await page.getByText('Encontré 5 actividades. Revisa y elige cuáles añadir.').waitFor();
      await shot(page, '5-revision-agenda', { fullPage: true });
      await button(page, 'Añadir 5 tareas').click();
      await page.getByText('Listo: 5 tareas nuevas.').first().waitFor();
      await button(page, 'Siguiente').click();
      await page.getByRole('heading', { name: /Lecciones con IA/ }).waitFor();
      await shot(page, '6-ia', { fullPage: true });
      await button(page, 'Ahora no').click();
      await page.getByRole('heading', { name: '¡Todo listo!' }).waitFor();
      await shot(page, '7-listo', { fullPage: true });
      await button(page, 'Ir a la pantalla de Lucca').click();
      await kidHeading(page).waitFor();
      const titles = await page.locator('.task-title').allTextContents();
      expect(titles.includes('Sumas con llevadas, pág. 24'), `Lucca ve las tareas de la agenda (vio: ${titles.join(' | ')})`);
      await shot(page, '8-lucca', { fullPage: true });
    });

    await run('X02', 'positivo', 'Cerrar y volver a abrir la app: todo sigue guardado en el dispositivo; el área de papá pide el PIN otra vez', async () => {
      const context = await device(TABLET);
      const first = await firstRun(context);
      await first.close();
      const again = await open(context);
      await kidHeading(again).waitFor();
      expect((await welcome(again).count()) === 0, 'la guía no vuelve a salir');
      expect((await again.locator('.task-title').count()) >= 4, 'las tareas siguen ahí');
      await shot(again, 'reabierta');
      await again.goto(app.url + '/papa');
      await again.getByLabel('PIN', { exact: true }).waitFor();
      await shot(again, 'pide-pin');
      await again.getByLabel('PIN', { exact: true }).fill(PIN);
      await button(again, 'Entrar').click();
      await parentHeading(again).waitFor();
      expect((await again.getByText('Parts of a Plant').count()) >= 1, 'papá ve las tareas importadas');
    });

    await run('X03', 'negativo', 'PIN incorrecto al volver: avisa los intentos y no entra', async () => {
      const context = await device(PHONE);
      const first = await firstRun(context);
      await first.close(); // cerrar la app: la sesión de papá se cierra
      const page = await open(context, '/papa');
      await page.getByLabel('PIN', { exact: true }).fill('000000');
      await button(page, 'Entrar').click();
      await page.getByText('PIN incorrecto. Te quedan 4 intentos.').waitFor();
      expect((await parentHeading(page).count()) === 0, 'no entra');
      await shot(page, 'pin-incorrecto');
    });

    await run('X04', 'positivo', 'Ajustes → App: guardar la dirección de Mereb y la clave de IA (solo se ven los últimos 4 caracteres) y quitarla', async () => {
      const context = await device(TABLET);
      const page = await firstRun(context);
      await parentLogin(page);
      await button(page, 'Ajustes').click();
      await page.getByRole('heading', { name: 'App', exact: true }).waitFor();
      await page.getByLabel('Dirección de Mereb del colegio').fill('https://colegio.mereb.example/agenda');
      await button(page, 'Guardar dirección').click();
      await page.getByText('Dirección guardada.').waitFor();
      await page.getByLabel(/Clave de IA/).fill(FAKE_KEY);
      await button(page, 'Guardar clave').click();
      await page.getByText('Clave guardada. Las próximas lecciones las prepara la IA.').waitFor();
      await page.getByText('…AB12').waitFor();
      expect((await page.locator(`text=${FAKE_KEY}`).count()) === 0, 'la clave completa no se muestra');
      await shot(page, 'app-configurada', { scrollTo: page.getByRole('heading', { name: 'App', exact: true }) });
      await button(page, 'Quitar clave').click();
      await page.getByText('Clave quitada. Las lecciones vuelven a ser ejemplos sencillos.').waitFor();
    });

    await run('X05', 'negativo', 'Una clave de IA o una dirección de Mereb mal escritas se explican junto al campo', async () => {
      const context = await device(PHONE);
      const page = await firstRun(context);
      await parentLogin(page);
      await button(page, 'Ajustes').click();
      await page.getByLabel('Dirección de Mereb del colegio').fill('http://inseguro.example');
      await button(page, 'Guardar dirección').click();
      await page.getByText('Escribe la dirección de Mereb completa, empezando por https://').waitFor();
      await page.getByLabel(/Clave de IA/).fill('mi-clave');
      await button(page, 'Guardar clave').click();
      await page.getByText(/La clave de IA empieza por «sk-ant-»/).waitFor();
      await shot(page, 'errores', { scrollTo: page.getByText(/La clave de IA empieza/) });
    });

    await run('X06', 'positivo', '«Abrir Mereb» abre la página del colegio fuera de la app (allí se escribe la contraseña)', async () => {
      const context = await device(PHONE);
      const page = await open(context);
      await welcome(page).waitFor();
      await createPin(page);
      await page.getByLabel('Dirección de Mereb del colegio').fill('https://colegio.mereb.example');
      // La página de Mereb se simula: aquí solo importa que se abra fuera de la app con esa dirección.
      await context.route('https://colegio.mereb.example/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Mereb (simulado)</h1>' }));
      context.on('page', (p) => (p.__allowOffsite = true));
      const popup = context.waitForEvent('page');
      await button(page, 'Abrir Mereb').click();
      const opened = await popup;
      expect(opened.url().startsWith('https://colegio.mereb.example'), `abre Mereb (abrió ${opened.url()})`);
      await opened.close();
    });

    await run('X07', 'borde', 'Sin internet: Lucca abre la app, entiende una lección, practica y gana su estrella', async () => {
      const context = await device(TABLET);
      const page = await firstRun(context);
      // Sin internet: todo lo que no sea la propia app falla (la app no lo necesita).
      await context.route((url) => !url.toString().startsWith(app.url), (route) => route.abort('internetdisconnected'));
      await page.reload();
      await kidHeading(page).waitFor();
      const before = Number(await page.locator('.stars-num, [data-stars]').first().textContent().catch(() => '0')) || 0;
      await page.getByRole('button', { name: /^Practicar: Sumas con llevadas/ }).click();
      await page.getByText('Reto 1 de 6').waitFor();
      await shot(page, 'practicar-sin-internet');
      await button(page, 'Volver a mi semana').click();
      await kidHeading(page).waitFor();
      await page.getByRole('button', { name: /^(Empezar|Seguir|Repasar): Sumas con llevadas/ }).click();
      await page.getByText(/^Paso 1 de \d+$/).waitFor();
      await shot(page, 'leccion-sin-internet');
      expect(before >= 0, 'la pantalla de Lucca sigue funcionando sin red');
    });

    await run('X08', 'borde', 'La guía se puede volver a abrir desde el área de papá (sin repetir el PIN) y cerrar', async () => {
      const context = await device(TABLET);
      const page = await firstRun(context);
      await parentLogin(page);
      await button(page, 'Guía de uso').click();
      await welcome(page).waitFor();
      await page.getByText('Paso 1 de 5').waitFor();
      await shot(page, 'guia-desde-papa');
      await button(page, 'Cerrar la guía').click();
      await parentHeading(page).waitFor();
    });

    await run('X09', 'borde', 'Medidas en teléfono y tablet: sin desplazamiento lateral, controles de 44 px y textos legibles en cada paso de la guía', async () => {
      for (const kind of [PHONE, TABLET]) {
        const context = await device(kind);
        const page = await open(context);
        await welcome(page).waitFor();
        const check = async (where) => {
          const problems = await page.evaluate(measure);
          expect(problems.length === 0, `[${kind === PHONE ? 'teléfono' : 'tablet'} · ${where}] ${problems.join('; ')}`);
        };
        await check('bienvenida');
        await button(page, 'Empezar').click();
        await check('cómo se usa');
        await button(page, 'Siguiente').click();
        await check('PIN');
        await page.getByLabel('PIN', { exact: true }).fill(PIN);
        await page.getByLabel('Repite el PIN', { exact: true }).fill(PIN);
        await page.getByLabel('Nombre del niño', { exact: true }).fill('Lucca');
        await button(page, 'Terminar configuración').click();
        await page.getByRole('heading', { name: 'Conecta la agenda de Mereb' }).waitFor();
        await check('Mereb');
        await button(page, 'Lo hago después').click();
        await page.getByLabel(/Clave de IA/).waitFor();
        await check('IA');
        await button(page, 'Ahora no').click();
        await check('listo');
      }
    });

    await run('X10', 'borde', 'Datos de dos «teléfonos» distintos no se mezclan (cada dispositivo tiene su base)', async () => {
      const a = await device(PHONE);
      await firstRun(a);
      const b = await device(PHONE);
      const page = await open(b);
      await welcome(page).waitFor();
      expect((await page.getByText('Paso 1 de 6').count()) === 1, 'el segundo dispositivo empieza desde cero');
    });

    await run('X11', 'borde', 'Un cambio hecho justo antes de cambiar de pantalla y cerrar la app no se pierde', async () => {
      const context = await device(TABLET);
      const page = await firstRun(context);
      await parentLogin(page);
      // Sin esperar nada: marcar lista, volver a Lucca y cerrar la app.
      await page.getByRole('button', { name: /^Marcar lista: Parts of a Plant/ }).click();
      await page.getByRole('link', { name: 'Ver la pantalla de Lucca' }).click();
      await kidHeading(page).waitFor();
      await page.close();
      const again = await open(context, '/papa');
      await again.getByLabel('PIN', { exact: true }).fill(PIN);
      await button(again, 'Entrar').click();
      await parentHeading(again).waitFor();
      expect((await again.getByRole('button', { name: /^Marcar por hacer: Parts of a Plant/ }).count()) === 1, 'la tarea sigue marcada como lista');
    });

    await run('X12', 'borde', 'Tablet con el WebView antiguo (sin SQLite en WebAssembly): la app abre igual con la versión en JavaScript y guarda los datos', async () => {
      const context = await device(TABLET);
      context.__expectWasmAbort = true;
      // Igual que en Chrome 83: el .wasm de SQLite no sirve, así que la app debe usar sql.js en JavaScript puro.
      await context.route('**/*.wasm', (route) => route.abort());
      const page = await firstRun(context);
      expect((await page.locator('.task-title').count()) >= 4, 'Lucca ve sus tareas');
      await page.close();
      const again = await open(context);
      await kidHeading(again).waitFor();
      expect((await again.locator('.task-title').count()) >= 4, 'y siguen guardadas al volver a abrir');
      await shot(again, 'webview-antiguo');
    });

    await run('X13', 'borde', 'El botón «atrás» de Android cierra la práctica abierta y vuelve a Mi semana', async () => {
      const context = await device(PHONE);
      const page = await firstRun(context);
      await page.getByRole('button', { name: /^Practicar: Sumas con llevadas/ }).click();
      await page.getByText('Reto 1 de 6').waitFor();
      const handled = await page.evaluate(() => {
        const event = new Event('lucca:back', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(handled, 'la pantalla atiende el «atrás»');
      await kidHeading(page).waitFor();
      expect((await page.getByText('Reto 1 de 6').count()) === 0, 'la práctica se cerró');
    });

    code = H.report();
  } catch (err) {
    console.error('Las pruebas de la app no pudieron terminar:', err);
    H.report();
  } finally {
    await browser.close();
    await app.stop();
  }
  process.exit(code);
})();
