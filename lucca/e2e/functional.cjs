// Pruebas funcionales: navegador real contra el servidor real, con escenarios positivos, negativos y de borde.
// Cada escenario deja capturas en docs/pruebas-funcionales/ y el informe index.html. Requiere `npm run build`.
const { chromium } = require('playwright');
const H = require('./lib/harness.cjs');
const { scenario, expect, shot } = H;

const PIN = '482913';
const NEW_PIN = '135790';
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const PORTRAIT = { width: 768, height: 1024 };

let browser;
const opened = [];

/** Contexto + página con las vigilancias comunes: errores de página y peticiones fuera de casa. */
async function open(server, { viewport = TABLET, theme, cookie } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'es-PA' });
  opened.push(context);
  if (cookie) await context.addCookies([{ name: 'lucca_parent', value: cookie, url: server.url }]);
  if (theme) await context.addInitScript((t) => localStorage.setItem('lucca.theme', t), theme);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => H.problem(`error de página: ${e}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== server.url) H.problem(`petición fuera de casa: ${r.url()}`);
  });
  const writes = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  H.watch(page);
  return { context, page, writes };
}

/** Un escenario que además cierra los navegadores que abrió. */
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
async function run(id, kind, title, fn) {
  if (ONLY && !ONLY.includes(id)) return;
  await scenario(id, kind, title, fn);
  for (const c of opened.splice(0)) await c.close().catch(() => {});
}

async function withServer(env, fn) {
  const server = await H.startServer(env);
  try {
    await fn(server);
  } finally {
    await server.stop();
  }
}

const text = async (locator) => ((await locator.textContent()) || '').trim();
const field = (page, label) => page.locator('.p-field', { has: page.getByLabel(label, { exact: true }) });
const fieldError = (page, label) => field(page, label).getByRole('alert');
const focusedId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const parentHeading = (page) => page.getByRole('heading', { name: 'Área de papá', exact: true });
const goParent = async (page, server) => page.goto(`${server.url}/papa`);

async function fillSetup(page, { pin = PIN, pin2 = pin, name = 'Lucca', grade, lang, theme } = {}) {
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByLabel('Repite el PIN', { exact: true }).fill(pin2);
  await page.getByLabel('Nombre del niño', { exact: true }).fill(name);
  if (grade) await page.getByLabel('Grado', { exact: true }).selectOption(String(grade));
  if (lang === 'en') await page.getByRole('radio', { name: 'English' }).check();
  if (theme === 'light') await page.getByRole('radio', { name: 'Claro' }).check();
}
const finishSetup = (page) => page.getByRole('button', { name: 'Terminar configuración' }).click();

async function tryPin(page, pin) {
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
async function login(page, pin = PIN) {
  await tryPin(page, pin);
  await parentHeading(page).waitFor();
}

// ---------- Pantalla de Lucca: ayudas ----------
const kidHeading = (page) => page.getByRole('heading', { level: 1, name: /^(¡Hola, |Hi, )/ });
async function openKid(server, options) {
  const o = await open(server, options);
  await o.page.goto(server.url);
  await kidHeading(o.page).waitFor();
  return o;
}
const dayButton = (page, re) => page.getByRole('button', { name: re });
const kidTitles = (page) => page.locator('.task-title').allTextContents();
const kidState = async (server) => (await H.api(server, 'GET', '/api/kid/state')).json;
const taskByTitle = (tasks, re) => tasks.find((t) => re.test(t.title));

// =====================================================================================================
// Acceso: configuración, PIN, bloqueo y sesión
// =====================================================================================================
async function accessGroup() {
  await withServer({}, async (s) => {
    await run('P01', 'positivo', 'Primera vez: aparece el asistente de configuración y la falta de IA/Mereb no bloquea', async () => {
      const { page } = await open(s);
      await goParent(page, s);
      await page.getByRole('heading', { name: 'Configura el asistente de Lucca' }).waitFor();
      await page.getByText('ANTHROPIC_API_KEY').waitFor();
      await page.getByText('MEREB_URL').waitFor();
      expect(await page.getByRole('button', { name: 'Terminar configuración' }).isEnabled(), 'el botón de terminar debe seguir activo aunque falten IA y Mereb');
      expect((await page.getByText('Falta conectar').count()) === 2, 'IA y Mereb deben verse como "Falta conectar"');
      const st = (await H.api(s, 'GET', '/api/parent/status')).json;
      expect(st.setupDone === false && st.authenticated === false, 'el servidor aún no debe estar configurado');
      await shot(page, 'asistente-primera-vez', { fullPage: true });
    });

    const negativeSetup = async (id, title, values, label, message, shotName) =>
      run(id, 'negativo', title, async () => {
        const { page, writes } = await open(s);
        await goParent(page, s);
        await fillSetup(page, values);
        await finishSetup(page);
        await fieldError(page, label).waitFor();
        expect((await text(fieldError(page, label))) === message, `el mensaje debía ser «${message}»`);
        expect(writes.length === 0, `no debía llamar al servidor (${writes.join(', ')})`);
        expect((await field(page, label).locator('input').getAttribute('aria-invalid')) === 'true', 'el campo debe marcarse como inválido');
        const id2 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-invalid'));
        expect(id2 === 'true', 'el foco debe quedar en el campo con el error');
        expect((await H.api(s, 'GET', '/api/parent/status')).json.setupDone === false, 'no debía guardarse nada');
        await shot(page, shotName, { fullPage: true });
      });
    await negativeSetup('P02', 'PIN de 3 dígitos: mensaje junto al campo y nada se guarda', { pin: '123' }, 'PIN', 'El PIN debe tener de 4 a 6 dígitos', 'pin-corto');
    await negativeSetup('P03', 'PIN con letras: se rechaza', { pin: '12ab' }, 'PIN', 'El PIN debe tener de 4 a 6 dígitos', 'pin-con-letras');
    await negativeSetup('P04', 'Confirmación distinta: se rechaza', { pin: PIN, pin2: '482914' }, 'Repite el PIN', 'Los dos PIN deben ser iguales', 'confirmacion-distinta');
    await negativeSetup('P05', 'Nombre vacío: se rechaza', { name: '   ' }, 'Nombre del niño', 'Escribe el nombre', 'nombre-vacio');
    await negativeSetup('P06', 'Nombre de 31 caracteres: se rechaza (el de 30 se acepta en P06b)', { name: 'a'.repeat(31) }, 'Nombre del niño', 'El nombre puede tener hasta 30 letras', 'nombre-31');

    await run('P07', 'positivo', 'Configuración completa: entra al panel y la cookie de sesión es segura', async () => {
      const { page, context } = await open(s);
      await goParent(page, s);
      await fillSetup(page, { grade: 3 });
      await shot(page, 'asistente-lleno', { fullPage: true });
      await finishSetup(page);
      await parentHeading(page).waitFor();
      expect((await page.getByText('Lucca', { exact: true }).count()) === 1, 'el panel debe mostrar el nombre del niño');
      await page.getByText('3.º grado').waitFor();
      const st = await (await context.request.get(`${s.url}/api/parent/status`)).json();
      expect(st.setupDone === true && st.authenticated === true, 'el servidor debe quedar configurado y con sesión abierta');
      const cookie = (await context.cookies()).find((c) => c.name === 'lucca_parent');
      expect(cookie && cookie.httpOnly && cookie.sameSite === 'Strict', 'la cookie debe ser HttpOnly y SameSite=Strict');
      await shot(page, 'panel-tras-configurar');
    });

    await run('P08', 'positivo', '"Salir" cierra la sesión: volver atrás o pedir datos ya no muestra nada', async () => {
      const { page, context } = await open(s);
      await goParent(page, s);
      await login(page);
      await page.getByRole('button', { name: 'Salir' }).click();
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      await shot(page, 'tras-salir');
      await page.goto(s.url);
      await kidHeading(page).waitFor();
      await page.goBack();
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      expect((await parentHeading(page).count()) === 0, 'tras volver atrás no debe verse el panel');
      const overview = await context.request.get(`${s.url}/api/parent/overview`);
      expect(overview.status() === 401, `la API debía responder 401 y respondió ${overview.status()}`);
      expect(!('tasks' in (await overview.json())), 'la respuesta sin sesión no debe traer datos');
      await shot(page, 'volver-atras-pide-pin');
    });

    await run('P09', 'negativo', 'PIN incorrecto: dice cuántos intentos quedan', async () => {
      const { page } = await open(s);
      await goParent(page, s);
      await tryPin(page, '000000');
      await fieldError(page, 'PIN').waitFor();
      expect((await text(fieldError(page, 'PIN'))) === 'PIN incorrecto. Te quedan 4 intentos.', 'debía decir que quedan 4 intentos');
      expect((await page.getByLabel('PIN', { exact: true }).inputValue()) === '', 'el campo se vacía tras un fallo');
      expect((await parentHeading(page).count()) === 0, 'no debe entrar');
      await shot(page, 'pin-incorrecto');
    });

    await run('P10', 'borde', 'Un PIN con formato inválido ("12") no gasta intento', async () => {
      const { page, writes } = await open(s);
      await goParent(page, s);
      await tryPin(page, '12');
      await fieldError(page, 'PIN').waitFor();
      expect((await text(fieldError(page, 'PIN'))) === 'El PIN debe tener de 4 a 6 dígitos', 'debía pedir de 4 a 6 dígitos');
      expect(writes.length === 0, 'un formato inválido no debe llegar al servidor');
      await shot(page, 'formato-invalido');
      await tryPin(page, '000000');
      await page.getByText('PIN incorrecto. Te quedan 3 intentos.').waitFor();
      await shot(page, 'sigue-contando-bien');
    });

    await run('P13', 'positivo', 'El PIN correcto después de varios fallos reinicia la cuenta', async () => {
      const { page } = await open(s);
      await goParent(page, s);
      await tryPin(page, '000000');
      await page.getByText('PIN incorrecto. Te quedan 2 intentos.').waitFor();
      await tryPin(page, '111111');
      await page.getByText('PIN incorrecto. Te queda 1 intento.').waitFor();
      await shot(page, 'ultimo-intento');
      await login(page);
      await page.getByRole('button', { name: 'Salir' }).click();
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      await tryPin(page, '000000');
      await page.getByText('PIN incorrecto. Te quedan 4 intentos.').waitFor();
      await shot(page, 'cuenta-reiniciada');
    });

    await run('P12', 'negativo', 'Sin sesión (navegador limpio): /papa pide el PIN y la API responde 401 sin datos', async () => {
      const { page, context } = await open(s);
      await goParent(page, s);
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      expect((await page.getByRole('button', { name: 'Nueva tarea' }).count()) === 0, 'no debe verse nada del panel');
      for (const [method, route] of [['get', '/api/parent/overview'], ['get', '/api/parent/progress'], ['post', '/api/parent/tasks'], ['put', '/api/parent/settings'], ['put', '/api/parent/pin']]) {
        const res = await context.request[method](`${s.url}${route}`, method === 'get' ? {} : { data: {} });
        expect(res.status() === 401, `${method.toUpperCase()} ${route} debía responder 401 y respondió ${res.status()}`);
        const body = await res.json();
        expect(!('tasks' in body) && !('settings' in body), `${route} no debe devolver datos sin sesión`);
      }
      await shot(page, 'sin-sesion');
    });
  });

  await withServer({}, async (s) => {
    await run('P06b', 'borde', 'Nombre de exactamente 30 caracteres: se acepta y se ve sin desbordes', async () => {
      const { page } = await open(s, { viewport: PHONE });
      await goParent(page, s);
      const name = 'Lucca '.repeat(5).trim().padEnd(30, 'x').slice(0, 30);
      expect(name.length === 30, 'el nombre de prueba debe tener 30 caracteres');
      await fillSetup(page, { name });
      await finishSetup(page);
      await parentHeading(page).waitFor();
      await page.getByText(name, { exact: true }).waitFor();
      await shot(page, 'nombre-30-en-movil');
    });
  });

  await withServer({}, async (s) => {
    await setupAndLock(s);
  });
}

async function expiredSessionGroup() {
  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const cookie = await H.setupParent(s);
    await run('P14', 'negativo', 'Sesión caducada a mitad de uso: la siguiente acción vuelve al PIN con un aviso, sin mostrar datos', async () => {
      const { page, context } = await open(s, { cookie });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      await page.getByRole('button', { name: /^Marcar lista: Restas sin llevar/ }).waitFor();
      // Se simula el paso de 15 minutos cerrando la sesión en el servidor (con el reloj fijo no pasa el tiempo).
      const closed = await H.api(s, 'POST', '/api/parent/logout', { cookie });
      expect(closed.status === 204, 'la sesión se cierra en el servidor');
      await page.getByRole('button', { name: /^Marcar lista: Restas sin llevar/ }).click();
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      expect((await text(page.getByRole('status'))) === 'Tu sesión terminó por inactividad. Escribe tu PIN para seguir.', 'debía avisar que la sesión terminó');
      expect((await page.getByRole('button', { name: /Marcar lista/ }).count()) === 0, 'no debe quedar ningún dato en pantalla');
      expect(taskByTitle((await kidState(s)).tasks, /Restas/).status === 'todo', 'la acción de una sesión caducada no debe aplicarse');
      await shot(page, 'sesion-caducada');
      await login(page);
      await page.getByRole('button', { name: /^Marcar lista: Restas sin llevar/ }).waitFor();
      await shot(page, 'de-vuelta-en-el-panel');
      const cookies = await context.cookies();
      expect(cookies.some((c) => c.name === 'lucca_parent' && c.value !== cookie), 'tras entrar de nuevo hay una sesión nueva');
    });
  });
}

async function setupAndLock(s) {
  await H.setupParent(s);
  await run('P11', 'borde', 'Cinco fallos seguidos bloquean: cuenta atrás en pantalla y el PIN correcto no entra', async () => {
    const { page, context } = await open(s);
    await goParent(page, s);
    for (let i = 4; i >= 1; i--) {
      await tryPin(page, '000000');
      await page.getByText(i === 1 ? 'PIN incorrecto. Te queda 1 intento.' : `PIN incorrecto. Te quedan ${i} intentos.`).waitFor();
    }
    await tryPin(page, '000000');
    await page.getByRole('timer').waitFor();
    expect((await text(page.getByRole('timer'))) === '5:00', 'la cuenta atrás debía empezar en 5:00');
    expect(await page.getByLabel('PIN', { exact: true }).isDisabled(), 'el campo debe quedar deshabilitado');
    expect(await page.getByRole('button', { name: 'Entrar' }).isDisabled(), 'el botón debe quedar deshabilitado');
    await shot(page, 'bloqueado');
    // El PIN correcto durante el bloqueo no entra (ni por la pantalla ni por la API) y la pantalla recuerda el bloqueo al recargar.
    const direct = await H.api(s, 'POST', '/api/parent/login', { body: { pin: PIN } });
    expect(direct.status === 423 && !direct.cookie, `el PIN correcto en bloqueo debía dar 423 sin cookie (dio ${direct.status})`);
    await page.reload();
    await page.getByRole('timer').waitFor();
    expect((await parentHeading(page).count()) === 0, 'tras recargar no debe entrar');
    const overview = await context.request.get(`${s.url}/api/parent/overview`);
    expect(overview.status() === 401, 'tampoco hay sesión por la API');
    await shot(page, 'bloqueo-persiste-al-recargar');
  });
}


// =====================================================================================================
// Tareas (agenda): crear, mover, ocultar, marcar, editar, borrar, semanas, sin fecha, 30 tareas
// =====================================================================================================
const tasksTab = (page) => page.getByRole('button', { name: 'Tareas', exact: true });
const weekGroup = (page, name) => page.getByRole('region', { name, exact: true });
const overviewTasks = async (s, cookie) => (await H.api(s, 'GET', '/api/parent/overview', { cookie })).json.tasks;

async function openTaskForm(page) {
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await page.getByRole('heading', { name: 'Nueva tarea', exact: true }).waitFor();
}
async function fillTask(page, { subject = 'Ciencias', title, titleEn, assigned, due, description } = {}) {
  if (subject) await page.getByLabel('Materia', { exact: true }).selectOption({ label: subject });
  if (title !== undefined) await page.getByLabel('Título', { exact: true }).fill(title);
  if (titleEn !== undefined) await page.getByLabel('Título en inglés', { exact: true }).fill(titleEn);
  if (assigned !== undefined) await page.getByLabel('Día asignado', { exact: true }).fill(assigned);
  if (due !== undefined) await page.getByLabel('Entrega', { exact: true }).fill(due);
  if (description !== undefined) await page.getByLabel('Descripción', { exact: true }).fill(description);
}
const saveTask = (page) => page.getByRole('button', { name: 'Guardar tarea' }).click();

async function tasksGroup() {
  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const cookie = await H.setupParent(s);
    const parent = (options) => open(s, { cookie, ...options });
    const goPanel = async (options) => {
      const o = await parent(options);
      await goParent(o.page, s);
      await parentHeading(o.page).waitFor();
      return o;
    };

    await run('P20', 'positivo', 'Crear una tarea manual con título en inglés: Lucca la ve el jueves en español e inglés', async () => {
      const { page } = await goPanel();
      const title = 'Observar un insecto con lupa';
      await openTaskForm(page);
      await fillTask(page, { subject: 'Ciencias', title, titleEn: 'Look at an insect with a magnifier', assigned: '2026-11-19' });
      await shot(page, 'formulario-lleno');
      await saveTask(page);
      await weekGroup(page, 'Jueves 19').getByText(title, { exact: true }).waitFor();
      expect((await weekGroup(page, 'Jueves 19').getByText('Manual').count()) >= 1, 'el origen debe ser Manual');
      await shot(page, 'tarea-creada', { scrollTo: weekGroup(page, 'Jueves 19') });

      const kid = await openKid(s);
      await dayButton(kid.page, /^Jueves 19/).click();
      await kid.page.getByRole('heading', { name: title, exact: true }).waitFor();
      await shot(kid.page, 'lucca-jueves-es');
      await kid.page.getByRole('button', { name: 'English', exact: true }).click();
      await kid.page.getByRole('heading', { name: 'Look at an insect with a magnifier', exact: true }).waitFor();
      await shot(kid.page, 'lucca-jueves-en');
      const created = taskByTitle((await kidState(s)).tasks, /insecto/);
      expect(created && created.source === 'manual' && created.titleTranslations.en === 'Look at an insect with a magnifier', 'el servidor debe guardar origen manual y título en inglés');
    });

    await run('P21', 'negativo', 'Tarea inválida (sin título, entrega antes del día) no se guarda y dice el motivo', async () => {
      const { page, writes } = await goPanel();
      const before = (await overviewTasks(s, cookie)).length;
      await openTaskForm(page);
      await saveTask(page);
      await fieldError(page, 'Materia').waitFor();
      expect((await text(fieldError(page, 'Materia'))) === 'Elige la materia', 'debía pedir la materia');
      expect((await focusedId(page)) === 'task-subject', 'el foco debe ir al primer campo con error');
      await fillTask(page, { subject: 'Matemáticas', title: '' });
      await saveTask(page);
      expect((await text(fieldError(page, 'Título'))) === 'Escribe el título', 'debía pedir el título');
      await fillTask(page, { subject: null, title: 'Algo', assigned: '2026-11-19', due: '2026-11-18' });
      await saveTask(page);
      await fieldError(page, 'Entrega').waitFor();
      expect((await text(fieldError(page, 'Entrega'))) === 'La entrega no puede ser antes del día asignado', 'debía decir que la entrega no puede ir antes');
      expect(writes.filter((w) => w.includes('/api/parent/tasks')).length === 0, 'nada debe enviarse al servidor');
      expect((await overviewTasks(s, cookie)).length === before, 'no debe haberse guardado ninguna tarea');
      await shot(page, 'errores-junto-a-los-campos');
    });

    await run('P22', 'borde', 'Título de 200 caracteres con <script>, comillas y emoji: se ve como texto, sin desbordes, en papá y en Lucca', async () => {
      const { page } = await goPanel({ viewport: PORTRAIT });
      const base = '<script>window.__xss=1</script> "comillas" \'simples\' ¡Ñandú! 😀 <b>negrita</b> ';
      const title = base.repeat(4).slice(0, 200);
      expect(title.length === 200, 'el título de prueba debe tener 200 caracteres');
      await openTaskForm(page);
      await fillTask(page, { subject: 'Español', title, assigned: '2026-11-20' });
      await saveTask(page);
      const row = weekGroup(page, 'Viernes 20').locator('.p-task-title', { hasText: '<script>' });
      await row.waitFor();
      expect((await text(row)) === title, 'el título debe verse completo y como texto');
      expect((await page.locator('.p-task-title b, .p-task-title script').count()) === 0, 'no debe interpretarse como HTML');
      expect((await page.evaluate(() => window.__xss)) === undefined, 'no debe ejecutarse el script');
      await shot(page, 'papa-titulo-200', { scrollTo: row });

      const kid = await openKid(s, { viewport: PORTRAIT });
      await dayButton(kid.page, /^Viernes 20/).click();
      const card = kid.page.locator('.task-card', { hasText: '<script>' });
      await card.waitFor();
      const fits = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = el.querySelector('.task-title');
        const inside = [...el.querySelectorAll('button')].every((b) => b.getBoundingClientRect().right <= r.right + 0.5);
        return { inside, title: t.scrollWidth <= t.clientWidth + 1 };
      });
      expect(fits.inside && fits.title, 'el título largo no debe desbordar la tarjeta de Lucca');
      expect((await kid.page.evaluate(() => window.__xss)) === undefined, 'no debe ejecutarse el script en la pantalla de Lucca');
      await shot(kid.page, 'lucca-titulo-200');
    });

    await run('P23', 'positivo', 'Mover una tarea de día: Lucca la ve en el día nuevo', async () => {
      const { page } = await goPanel();
      await page.getByLabel(/^Mover a otro día: Lectura/).selectOption('2026-11-20');
      await weekGroup(page, 'Viernes 20').getByText(/Lectura/).waitFor();
      expect((await weekGroup(page, 'Miércoles 18').getByText(/Lectura/).count()) === 0, 'ya no debe estar el miércoles');
      await shot(page, 'movida-al-viernes', { scrollTo: weekGroup(page, 'Viernes 20') });
      const moved = taskByTitle(await overviewTasks(s, cookie), /Lectura/);
      expect(moved.assignedDate === '2026-11-20' && moved.dueDate >= '2026-11-20', 'la entrega no puede quedar antes del nuevo día');
      const kid = await openKid(s);
      expect((await kidTitles(kid.page)).every((t) => !/Lectura/.test(t)), 'hoy (miércoles) Lucca ya no la ve');
      await dayButton(kid.page, /^Viernes 20/).click();
      await kid.page.getByRole('heading', { name: /Lectura/ }).waitFor();
      await shot(kid.page, 'lucca-viernes');
    });

    await run('P24', 'positivo', 'Ocultar una tarea: Lucca deja de verla, papá la ve atenuada y puede mostrarla de nuevo', async () => {
      const { page } = await goPanel();
      await page.getByRole('button', { name: /^Ocultar: Dibujo de mi familia/ }).click();
      const row = weekGroup(page, 'Miércoles 18').locator('.p-task', { hasText: 'Dibujo de mi familia' });
      await row.getByText('Oculta', { exact: true }).waitFor();
      await shot(page, 'oculta', { scrollTo: row });
      let kid = await openKid(s);
      expect((await kidTitles(kid.page)).every((t) => !/Dibujo de mi familia/.test(t)), 'Lucca no debe ver la tarea oculta');
      await shot(kid.page, 'lucca-sin-la-tarea');
      await page.getByRole('button', { name: /^Mostrar: Dibujo de mi familia/ }).click();
      await row.getByText('Oculta', { exact: true }).waitFor({ state: 'detached' });
      kid = await openKid(s);
      expect((await kidTitles(kid.page)).some((t) => /Dibujo de mi familia/.test(t)), 'Lucca vuelve a ver la tarea');
    });

    await run('P25', 'positivo', 'Marcar lista no da estrellas: Lucca la ve lista y sus estrellas no cambian', async () => {
      const { page } = await goPanel();
      const before = (await kidState(s)).starsThisWeek;
      await page.getByRole('button', { name: /^Marcar lista: Restas sin llevar/ }).click();
      const row = weekGroup(page, 'Martes 17').locator('.p-task', { hasText: 'Restas sin llevar' });
      await row.getByText('Lista', { exact: true }).waitFor();
      await shot(page, 'marcada-lista', { scrollTo: row });
      const after = await kidState(s);
      expect(taskByTitle(after.tasks, /Restas/).status === 'done', 'Lucca debe verla como lista');
      expect(after.starsThisWeek === before, `las estrellas no deben cambiar (antes ${before}, ahora ${after.starsThisWeek})`);
      await page.getByRole('button', { name: /^Marcar por hacer: Restas sin llevar/ }).click();
      await row.getByText('Por hacer', { exact: true }).waitFor();
      expect(taskByTitle((await kidState(s)).tasks, /Restas/).status === 'todo', 'se puede volver a por hacer');
    });

    await run('P26', 'positivo', 'Editar el título: el formulario viene lleno y Lucca ve el cambio', async () => {
      const { page } = await goPanel();
      await page.getByRole('button', { name: /^Editar: Problemas con monedas/ }).click();
      await page.getByRole('heading', { name: 'Editar tarea' }).waitFor();
      expect((await page.getByLabel('Título', { exact: true }).inputValue()) === 'Problemas con monedas', 'el título debe venir precargado');
      expect((await page.getByLabel('Día asignado', { exact: true }).inputValue()) === '2026-11-19', 'el día debe venir precargado');
      await page.getByLabel('Título', { exact: true }).fill('Problemas con monedas y billetes');
      await shot(page, 'editando');
      await saveTask(page);
      await weekGroup(page, 'Jueves 19').getByText('Problemas con monedas y billetes', { exact: true }).waitFor();
      const kid = await openKid(s);
      await dayButton(kid.page, /^Jueves 19/).click();
      await kid.page.getByRole('heading', { name: 'Problemas con monedas y billetes', exact: true }).waitFor();
    });

    await run('P27', 'negativo', 'Borrar: cancelar no cambia nada; confirmar elimina del todo una tarea manual', async () => {
      const { page } = await goPanel();
      const target = 'Dictado de palabras con';
      const before = (await overviewTasks(s, cookie)).length;
      await page.getByRole('button', { name: new RegExp(`^Borrar: ${target}`) }).click();
      await page.getByText('Se borrará del todo').waitFor();
      await shot(page, 'pregunta-de-borrado');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      expect((await page.getByText('Se borrará del todo').count()) === 0, 'cancelar cierra la pregunta');
      expect((await overviewTasks(s, cookie)).length === before, 'cancelar no debe borrar nada');
      await page.getByRole('button', { name: new RegExp(`^Borrar: ${target}`) }).click();
      await page.getByRole('button', { name: 'Sí, borrar', exact: true }).click();
      await weekGroup(page, 'Viernes 20').getByText(new RegExp(target)).waitFor({ state: 'detached' });
      const after = await overviewTasks(s, cookie);
      expect(after.length === before - 1 && !after.some((t) => new RegExp(target).test(t.title)), 'la tarea debe desaparecer del todo');
      await shot(page, 'borrada', { scrollTo: weekGroup(page, 'Viernes 20') });
    });

    await run('P28', 'borde', 'Semanas: solo la anterior, la actual y la siguiente; los extremos se deshabilitan y se puede crear en la siguiente', async () => {
      const { page } = await goPanel();
      const prev = page.getByRole('button', { name: 'Semana anterior' });
      const next = page.getByRole('button', { name: 'Semana siguiente' });
      await page.getByText('16 – 20 de noviembre').waitFor();
      await prev.click();
      await page.getByText('9 – 13 de noviembre').waitFor();
      await page.getByText('No hay tareas esta semana').waitFor();
      expect(await prev.isDisabled(), 'no debe poder ir más atrás de la semana anterior');
      await shot(page, 'semana-anterior-vacia');
      await next.click();
      await next.click();
      await page.getByText('23 – 27 de noviembre').waitFor();
      expect(await next.isDisabled(), 'no debe poder ir más allá de la semana siguiente');
      await openTaskForm(page);
      expect((await page.getByLabel('Día asignado', { exact: true }).inputValue()) === '2026-11-23', 'por defecto el lunes de la semana que se mira');
      await fillTask(page, { subject: 'Arte', title: 'Maqueta del sistema solar' });
      await saveTask(page);
      await weekGroup(page, 'Lunes 23').getByText('Maqueta del sistema solar').waitFor();
      await shot(page, 'semana-siguiente-con-tarea');
      await page.getByRole('button', { name: 'Esta semana', exact: true }).click();
      await page.getByText('16 – 20 de noviembre').waitFor();
      const kid = await openKid(s);
      await kid.page.getByRole('button', { name: 'Semana siguiente' }).click();
      await kid.page.getByRole('heading', { name: 'Maqueta del sistema solar' }).waitFor();
      await shot(kid.page, 'lucca-semana-siguiente');
    });

    await run('P29', 'borde', 'Tarea sin fechas: papá la ve en "Sin fecha" y Lucca la ve hoy', async () => {
      const { page } = await goPanel();
      await openTaskForm(page);
      await fillTask(page, { subject: 'Música', title: 'Practicar la canción nueva', assigned: '' });
      await saveTask(page);
      await weekGroup(page, 'Sin fecha').getByText('Practicar la canción nueva').waitFor();
      await shot(page, 'sin-fecha', { scrollTo: weekGroup(page, 'Sin fecha') });
      const kid = await openKid(s);
      expect((await kidTitles(kid.page)).includes('Practicar la canción nueva'), 'Lucca la ve hoy');
      await shot(kid.page, 'lucca-hoy-con-la-tarea');
      await page.getByRole('button', { name: 'Semana siguiente' }).click();
      expect((await page.getByRole('region', { name: 'Sin fecha' }).count()) === 0, '"Sin fecha" solo aparece en la semana actual');
    });
  });

  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const cookie = await H.setupParent(s);
    await run('P31', 'negativo', 'Se cae la conexión al guardar en el panel: mensaje amable junto a la tarea, nada cambia y al volver se puede repetir', async () => {
      const { page } = await open(s, { cookie });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      const target = /^Marcar lista: Restas sin llevar/;
      await page.getByRole('button', { name: target }).waitFor();
      await page.route('**/api/parent/tasks/**', (route) => route.abort());
      await page.getByRole('button', { name: target }).click();
      const alert = weekGroup(page, 'Martes 17').getByRole('alert');
      await alert.waitFor();
      expect((await text(alert)) === 'No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.', 'debía decir que no se pudo guardar');
      expect((await page.getByText(/failed|TypeError|fetch/i).count()) === 0, 'no debe mostrar mensajes técnicos');
      expect(taskByTitle(await overviewTasks(s, cookie), /Restas/).status === 'todo', 'la tarea no debe haber cambiado');
      await shot(page, 'sin-conexion-al-guardar', { scrollTo: alert });
      await page.unroute('**/api/parent/tasks/**');
      await page.getByRole('button', { name: target }).click();
      await page.getByRole('button', { name: /^Marcar por hacer: Restas sin llevar/ }).waitFor();
      expect(taskByTitle(await overviewTasks(s, cookie), /Restas/).status === 'done', 'al volver la conexión se guarda');
      expect((await weekGroup(page, 'Martes 17').getByRole('alert').count()) === 0, 'el mensaje de error desaparece');
    });

    await run('P30', 'borde', '30 tareas en un día: papá y Lucca las muestran todas sin romper el diseño', async () => {
      for (let i = 1; i <= 30; i++) {
        const res = await H.api(s, 'POST', '/api/parent/tasks', {
          cookie,
          body: { subject: ['math', 'spanish', 'english', 'science'][i % 4], title: `Ejercicio número ${i} del cuaderno de práctica`, assignedDate: '2026-11-19', dueDate: '2026-11-20' },
        });
        expect(res.status === 201, `la tarea ${i} debía crearse (${res.status})`);
      }
      const { page } = await open(s, { cookie, viewport: PHONE });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      await weekGroup(page, 'Jueves 19').waitFor();
      const count = await weekGroup(page, 'Jueves 19').locator('.p-task').count();
      expect(count === 32, `papá debía ver 32 tareas el jueves (30 nuevas + 2 de la demo) y vio ${count}`);
      await shot(page, 'papa-30-tareas');
      await shot(page, 'papa-30-tareas-completa', { fullPage: true });
      const kid = await openKid(s, { viewport: PHONE });
      await dayButton(kid.page, /^Jueves 19/).click();
      await kid.page.locator('.task-card').first().waitFor();
      const cards = await kid.page.locator('.task-card').count();
      expect(cards === 32, `Lucca debía ver 32 tarjetas y vio ${cards}`);
      await shot(kid.page, 'lucca-30-tareas');
    });
  });
}

// =====================================================================================================
// Progreso y ajustes
// =====================================================================================================
const tab = (page, name) => page.getByRole('button', { name, exact: true }).click();
const postKid = (s, taskId, kind) => H.api(s, 'POST', '/api/kid/progress', { body: { taskId, kind } });

async function progressGroup() {
  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const cookie = await H.setupParent(s);
    await run('P40', 'borde', 'Sin actividad de Lucca: el progreso lo dice claramente en vez de mostrar ceros confusos', async () => {
      const { page } = await open(s, { cookie });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      await tab(page, 'Progreso');
      await page.getByText('Todavía no hay actividad de Lucca esta semana').waitFor();
      await page.getByText('Lucca no ha pedido ayuda en estas semanas').waitFor();
      await page.getByText('2 de 10 tareas listas').first().waitFor();
      await shot(page, 'sin-actividad');
    });

    await run('P41', 'positivo', 'Lucca completa tareas, usa pistas y pide ayuda: el progreso de papá lo muestra', async () => {
      const tasks = (await kidState(s)).tasks;
      const restas = taskByTitle(tasks, /Restas/).id;
      const lectura = taskByTitle(tasks, /Leer/).id;
      for (const [id, kind] of [[restas, 'task_done'], [lectura, 'task_done'], [restas, 'hint_used'], [restas, 'hint_used'], [restas, 'help_requested']]) {
        const res = await postKid(s, id, kind);
        expect(res.status === 200, `el avance ${kind} debía aceptarse (${res.status})`);
      }
      const { page } = await open(s, { cookie });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      await tab(page, 'Progreso');
      const week = page.getByRole('region', { name: '16 – 20 de noviembre', exact: true });
      await week.getByText('2 estrellas', { exact: true }).waitFor();
      await week.getByText('2 pistas usadas', { exact: true }).waitFor();
      await week.getByText('Pidió ayuda 1 vez', { exact: true }).waitFor();
      await week.getByText('4 de 10 tareas listas').first().waitFor();
      const help = page.getByRole('region', { name: 'Necesita ayuda', exact: true });
      await help.getByText('Restas sin llevar, pág. 26', { exact: true }).waitFor();
      await help.getByText('Pidió ayuda 1 vez', { exact: true }).waitFor();
      expect((await page.getByText('Todavía no hay actividad de Lucca esta semana').count()) === 0, 'ya no debe decir que no hay actividad');
      const api = (await H.api(s, 'GET', '/api/parent/progress?weeks=4', { cookie })).json;
      expect(api.weeks[0].stars === 2 && api.weeks[0].hints === 2 && api.weeks[0].helpRequests === 1, 'la API y la pantalla deben coincidir');
      await shot(page, 'con-actividad');
    });
  });
}

async function settingsGroup() {
  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const setupCookie = await H.setupParent(s);
    const panel = async (options) => {
      const o = await open(s, { cookie: setupCookie, ...options });
      await goParent(o.page, s);
      await parentHeading(o.page).waitFor();
      await tab(o.page, 'Ajustes');
      await o.page.getByRole('heading', { name: 'Ajustes', exact: true }).waitFor();
      return o;
    };
    const saveSettings = (page) => page.getByRole('button', { name: 'Guardar ajustes' }).click();

    await run('P50', 'positivo', 'Cambiar el nombre: el panel y el saludo de Lucca cambian', async () => {
      const { page } = await panel();
      await page.getByLabel('Nombre del niño', { exact: true }).fill('Mateo');
      await saveSettings(page);
      await page.getByText('Ajustes guardados', { exact: true }).waitFor();
      await page.locator('.p-top strong', { hasText: 'Mateo' }).waitFor();
      await shot(page, 'ajustes-guardados');
      const kid = await openKid(s);
      await kid.page.getByRole('heading', { level: 1, name: '¡Hola, Mateo!' }).waitFor();
      await shot(kid.page, 'lucca-saluda-a-mateo');
    });

    await run('P51', 'positivo', 'Tema claro y velocidad 1,1: papá lo ve al instante y Lucca desde la siguiente carga', async () => {
      const { page } = await panel();
      await page.getByRole('radio', { name: 'Claro' }).check();
      await page.getByLabel('Velocidad de la voz', { exact: true }).fill('1,1');
      await saveSettings(page);
      await page.getByText('Ajustes guardados', { exact: true }).waitFor();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      await shot(page, 'tema-claro');
      await page.reload();
      await parentHeading(page).waitFor();
      await tab(page, 'Ajustes');
      expect((await page.getByLabel('Velocidad de la voz', { exact: true }).inputValue()) === '1,1', 'la velocidad debe verse como 1,1 tras recargar');
      const kid = await openKid(s);
      expect((await kid.page.locator('html').getAttribute('data-theme')) === 'light', 'Lucca debe ver el tema claro');
      expect((await kidState(s)).settings.speechRate === 1.1, 'la velocidad de la voz debe ser 1,1');
      await shot(kid.page, 'lucca-tema-claro');
    });

    await run('P51b', 'borde', 'Si Lucca solo cambió el idioma en su tablet, el tema que papá cambie después sí se aplica', async () => {
      const kid = await openKid(s);
      expect((await kid.page.locator('html').getAttribute('data-theme')) === 'light', 'parte del tema claro de papá');
      await kid.page.getByRole('button', { name: 'English', exact: true }).click();
      await kid.page.getByRole('heading', { level: 1, name: 'Hi, Mateo!' }).waitFor();
      const res = await H.api(s, 'PUT', '/api/parent/settings', { cookie: setupCookie, body: { theme: 'dark' } });
      expect(res.status === 200, 'papá cambia el tema a oscuro');
      await kid.page.reload();
      await kid.page.getByRole('heading', { level: 1, name: 'Hi, Mateo!' }).waitFor();
      expect((await kid.page.locator('html').getAttribute('data-theme')) === 'dark', 'la tablet debe mostrar el tema nuevo de papá (Lucca nunca eligió tema)');
      expect((await kid.page.locator('html').getAttribute('lang')) === 'en', 'lo que Lucca eligió (inglés) se conserva');
      await shot(kid.page, 'tema-de-papa-e-idioma-de-lucca');
    });

    await run('P52', 'negativo', 'Velocidad 2 y nombre vacío: se rechazan con el motivo y los ajustes anteriores se conservan', async () => {
      const { page, writes } = await panel();
      const before = (await H.api(s, 'GET', '/api/parent/overview', { cookie: setupCookie })).json.settings;
      await page.getByLabel('Nombre del niño', { exact: true }).fill('');
      await page.getByLabel('Velocidad de la voz', { exact: true }).fill('2');
      await saveSettings(page);
      await fieldError(page, 'Nombre del niño').waitFor();
      expect((await text(fieldError(page, 'Nombre del niño'))) === 'Escribe el nombre', 'debía pedir el nombre');
      expect((await text(fieldError(page, 'Velocidad de la voz'))) === 'La velocidad va de 0,7 a 1,2', 'debía explicar el rango de la velocidad');
      expect((await focusedId(page)) === 'set-name', 'el foco va al primer error');
      expect(writes.filter((w) => w.startsWith('PUT')).length === 0, 'nada debe enviarse');
      const after = (await H.api(s, 'GET', '/api/parent/overview', { cookie: setupCookie })).json.settings;
      expect(JSON.stringify(after) === JSON.stringify(before), 'los ajustes anteriores se conservan');
      await shot(page, 'valores-fuera-de-rango');
      // La API también los rechaza (no depende de la pantalla).
      const direct = await H.api(s, 'PUT', '/api/parent/settings', { cookie: setupCookie, body: { speechRate: 2, tz: 'Mars/Base' } });
      expect(direct.status === 400 && direct.json.fields.speechRate && direct.json.fields.tz, 'la API debe rechazar velocidad 2 y zona horaria');
    });

    await run('P53', 'positivo', 'Cambiar el PIN: el nuevo entra, el viejo ya no y las demás sesiones se cierran', async () => {
      const { page } = await panel();
      await page.getByLabel('PIN actual', { exact: true }).fill(PIN);
      await page.getByLabel('PIN nuevo', { exact: true }).fill(NEW_PIN);
      await page.getByLabel('Repite el PIN nuevo', { exact: true }).fill(NEW_PIN);
      await page.getByRole('button', { name: 'Cambiar PIN', exact: true }).click();
      await page.getByText('PIN cambiado. Usa el nuevo la próxima vez.').waitFor();
      expect((await page.getByLabel('PIN actual', { exact: true }).inputValue()) === '', 'los campos de PIN se vacían');
      expect((await parentHeading(page).count()) === 1, 'quien cambió el PIN sigue dentro');
      await shot(page, 'pin-cambiado');
      const old = await H.api(s, 'GET', '/api/parent/overview', { cookie: setupCookie });
      expect(old.status === 401, `otra sesión abierta antes debía cerrarse (dio ${old.status})`);
      const fresh = await open(s);
      await goParent(fresh.page, s);
      await tryPin(fresh.page, PIN);
      await fieldError(fresh.page, 'PIN').waitFor();
      expect((await text(fieldError(fresh.page, 'PIN'))) === 'PIN incorrecto. Te quedan 4 intentos.', 'el PIN viejo ya no entra');
      await login(fresh.page, NEW_PIN);
      await shot(fresh.page, 'entra-con-el-pin-nuevo');
    });

    await run('P54', 'negativo', 'PIN actual incorrecto al cambiarlo: no cambia y cuenta como intento fallido', async () => {
      const { page } = await open(s);
      await goParent(page, s);
      await login(page, NEW_PIN);
      await tab(page, 'Ajustes');
      await page.getByLabel('PIN actual', { exact: true }).fill('000000');
      await page.getByLabel('PIN nuevo', { exact: true }).fill('246810');
      await page.getByLabel('Repite el PIN nuevo', { exact: true }).fill('246810');
      await page.getByRole('button', { name: 'Cambiar PIN', exact: true }).click();
      await fieldError(page, 'PIN actual').waitFor();
      expect((await text(fieldError(page, 'PIN actual'))) === 'PIN actual incorrecto. Te quedan 4 intentos.', 'debía contar como intento fallido');
      expect((await page.getByText('PIN cambiado').count()) === 0, 'no debe decir que cambió');
      await shot(page, 'pin-actual-incorrecto');
      const still = await H.api(s, 'POST', '/api/parent/login', { body: { pin: NEW_PIN } });
      const wrong = await H.api(s, 'POST', '/api/parent/login', { body: { pin: '246810' } });
      expect(still.status === 200 && wrong.status === 401, 'el PIN no cambió: sigue valiendo el anterior');
    });
  });
}

// =====================================================================================================
// Diseño adaptable y teclado
// =====================================================================================================
/** Se ejecuta dentro de la página: tamaño táctil, texto legible, contraste y que nada se salga de su tarjeta. */
function measureParent() {
  const problems = [];
  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth) problems.push(`desplazamiento horizontal: ${root.scrollWidth} > ${window.innerWidth}`);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 40);
  for (const bar of document.querySelectorAll('.bar')) {
    const h = bar.getBoundingClientRect().height;
    if (visible(bar) && h > 24) problems.push(`barra de progreso demasiado alta (${Math.round(h)}px)`);
  }
  const nav = document.querySelector('.p-weeknav');
  if (nav) {
    const arrows = [...nav.querySelectorAll('.p-btn-icon')].map((b) => b.getBoundingClientRect().top);
    if (arrows.length === 2 && Math.abs(arrows[0] - arrows[1]) > 8) problems.push('la navegación de semanas se parte en varias filas');
  }
  for (const el of document.querySelectorAll('button, a.p-btn, select, input:not([type=radio]), textarea, .p-choice-opt span')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) problems.push(`control pequeño (${Math.round(r.width)}×${Math.round(r.height)}): ${label(el)}`);
  }
  for (const el of document.querySelectorAll('.p-hint, .p-error, .p-chip, .p-due, .p-subject, .p-badge, .p-field label, .p-task-title, .p-lead, .p-status, .p-lock, .p-notice')) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (visible(el) && size < 16) problems.push(`texto pequeño (${size}px): ${label(el)}`);
  }
  for (const card of document.querySelectorAll('.p-card, .p-task')) {
    const c = card.getBoundingClientRect();
    for (const el of card.querySelectorAll('button, select, input, textarea, p, h2, h3, .p-chip')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > c.right + 0.5 || r.left < c.left - 0.5) problems.push(`se sale de su tarjeta: ${label(el)}`);
    }
  }
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
  const mix = (a, b, w) => ({ r: a.r * w + b.r * (1 - w), g: a.g * w + b.g * (1 - w), b: a.b * w + b.b * (1 - w), a: 1 });
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
      out = mix(c, out, c.a);
    }
    return out;
  };
  /** Opacidad acumulada del elemento y el ancestro que la aplica (lo atenuado se ve más pálido). */
  const faded = (el) => {
    let op = 1;
    let holder = null;
    for (let n = el; n; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (o < 1) {
        op *= o;
        holder = n;
      }
    }
    return { op, holder };
  };
  const SELECTORS = ['.p-btn', '.p-tab-btn', '.p-chip', '.p-hint', '.p-error', '.p-form-error', '.p-status', '.p-lead', '.p-subject', '.p-due', '.p-badge', '.p-field label', '.p-task-title', '.p-day', '.p-lock', '.p-notice', '.p-move', '.p-choice-opt span', 'h1', 'h2', '.p-range'];
  for (const sel of SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el) || !(el.textContent || '').trim()) continue;
      let fg = rgb(getComputedStyle(el).color);
      let bg = effectiveBg(el);
      const { op, holder } = faded(el);
      if (op < 1 && holder) {
        const backdrop = effectiveBg(holder.parentElement || holder);
        fg = mix(fg, backdrop, op);
        bg = mix(bg, backdrop, op);
      }
      const [hi, lo] = [Math.max(lum(bg), lum(fg)), Math.min(lum(bg), lum(fg))];
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 4.5) problems.push(`poco contraste (${ratio.toFixed(1)}:1) en ${sel}: ${label(el)}`);
    }
  }
  return problems;
}

async function responsiveGroup() {
  const COMBOS = [
    { viewport: PHONE, theme: 'dark', shoot: ['tareas', 'formulario', 'ajustes', 'configuracion', 'acceso'] },
    { viewport: PHONE, theme: 'light', shoot: ['tareas'] },
    { viewport: PORTRAIT, theme: 'dark', shoot: ['tareas'] },
    { viewport: PORTRAIT, theme: 'light', shoot: ['ajustes', 'progreso'] },
    { viewport: TABLET, theme: 'dark', shoot: ['progreso'] },
    { viewport: TABLET, theme: 'light', shoot: ['tareas', 'formulario', 'configuracion', 'acceso'] },
  ];
  const fresh = await H.startServer({ LUCCA_DEMO: '1' });
  const themed = {};
  for (const theme of ['dark', 'light']) {
    const srv = await H.startServer({ LUCCA_DEMO: '1' });
    themed[theme] = { srv, cookie: await H.setupParent(srv, { theme }) };
  }
  try {
    await run('P60', 'borde', 'Todas las pantallas de papá a 390, 768 y 1024 px en oscuro y claro: sin desplazamiento, controles ≥ 44 px, texto ≥ 16 px y contraste 4,5:1', async () => {
      const found = [];
      for (const { viewport, theme, shoot } of COMBOS) {
        const tag = `${viewport.width}×${viewport.height} ${theme}`;
        const audit = async (page, screen) => {
          for (const p of await page.evaluate(measureParent)) found.push(`[${tag} · ${screen}] ${p}`);
        };
        const snap = async (page, screen) => {
          await audit(page, screen);
          if (shoot.includes(screen)) await shot(page, `${screen}-${viewport.width}-${theme}`);
        };
        const { srv, cookie } = themed[theme];

        let o = await open(fresh, { viewport, theme });
        await goParent(o.page, fresh);
        await o.page.getByRole('heading', { name: 'Configura el asistente de Lucca' }).waitFor();
        await snap(o.page, 'configuracion');

        o = await open(srv, { viewport, theme });
        await goParent(o.page, srv);
        await o.page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
        await snap(o.page, 'acceso');

        o = await open(srv, { viewport, cookie });
        await goParent(o.page, srv);
        await parentHeading(o.page).waitFor();
        await o.page.getByRole('region', { name: 'Miércoles 18' }).waitFor();
        expect((await o.page.locator('html').getAttribute('data-theme')) === theme, `el tema ${theme} no se aplicó`);
        await snap(o.page, 'tareas');
        await o.page.getByRole('button', { name: /^Borrar: Restas/ }).click();
        await audit(o.page, 'tareas con pregunta de borrado');
        await o.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await openTaskForm(o.page);
        await saveTask(o.page);
        await fieldError(o.page, 'Materia').waitFor();
        await snap(o.page, 'formulario');
        await o.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await o.page.getByRole('button', { name: /^Ocultar: Restas/ }).click();
        await o.page.getByText('Oculta', { exact: true }).waitFor();
        await audit(o.page, 'tarea oculta (atenuada)');
        await o.page.getByRole('button', { name: /^Mostrar: Restas/ }).click();
        await tab(o.page, 'Progreso');
        await o.page.getByText('Lucca no ha pedido ayuda en estas semanas').waitFor();
        await snap(o.page, 'progreso');
        await tab(o.page, 'Ajustes');
        await o.page.getByRole('heading', { name: 'Cambiar PIN' }).waitFor();
        await snap(o.page, 'ajustes');
        for (const c of opened.splice(0)) await c.close().catch(() => {});
      }
      expect(found.length === 0, `Incumplimientos:\n      ${found.join('\n      ')}`);
    });
  } finally {
    await fresh.stop();
    for (const { srv } of Object.values(themed)) await srv.stop();
  }
}

async function keyboardGroup() {
  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    await H.setupParent(s);
    await run('P61', 'positivo', 'Todo el flujo con solo teclado: PIN, abrir el formulario, elegir materia, escribir, guardar y cerrar con Esc', async () => {
      const { page } = await open(s);
      await goParent(page, s);
      const active = () => page.evaluate(() => ({ id: document.activeElement.id, name: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim() }));
      const tabTo = async (name) => {
        for (let i = 0; i < 40; i++) {
          if ((await active()).name === name) return;
          await page.keyboard.press('Tab');
        }
        throw new Error(`con Tab no se llegó a «${name}»`);
      };
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      await page.keyboard.press('Tab');
      expect((await active()).id === 'login-pin', 'el primer Tab debe llegar al campo del PIN');
      await page.keyboard.type(PIN);
      await page.keyboard.press('Enter');
      await parentHeading(page).waitFor();
      await page.getByRole('button', { name: 'Nueva tarea', exact: true }).waitFor();
      await tabTo('Nueva tarea');
      const ring = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement);
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
      });
      expect(ring.style !== 'none' && ring.width >= 3, 'el foco del teclado debe verse (anillo ≥ 3 px)');
      await shot(page, 'foco-visible');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Nueva tarea', exact: true }).waitFor();
      expect((await active()).id === 'task-title', 'al abrir el formulario el foco va al título');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.type('Ci');
      expect((await page.getByLabel('Materia', { exact: true }).inputValue()) === 'science', 'con el teclado se elige Ciencias');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Pintar con acuarela');
      await shot(page, 'formulario-con-teclado');
      await page.keyboard.press('Enter');
      await weekGroup(page, 'Miércoles 18').getByText('Pintar con acuarela', { exact: true }).waitFor();
      await tabTo('Nueva tarea');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Nueva tarea', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('heading', { name: 'Nueva tarea', exact: true }).waitFor({ state: 'detached' });
      await shot(page, 'tras-guardar-y-cerrar');
    });
  });
}

// =====================================================================================================
// Pantalla de Lucca
// =====================================================================================================
async function kidGroup() {
  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const cookie = await H.setupParent(s);

    await run('K07', 'positivo', 'Inglés y modo "Leer": el texto cambia de idioma y desaparecen los botones de audio', async () => {
      const { page } = await openKid(s);
      expect((await page.getByRole('button', { name: /^Escuchar(:| a )/ }).count()) > 0, 'en modo Ambos hay botones de escuchar');
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.getByRole('heading', { level: 1, name: 'Hi, Lucca!' }).waitFor();
      expect((await page.locator('html').getAttribute('lang')) === 'en', '<html lang> debe pasar a en');
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      expect((await page.getByRole('button', { name: /^Listen(:| to )/ }).count()) === 0, 'en modo Leer no debe haber botones de audio');
      await shot(page, 'ingles-modo-leer', { fullPage: true });
      await page.getByRole('button', { name: 'Both', exact: true }).click();
      expect((await page.getByRole('button', { name: /^Listen(:| to )/ }).count()) > 0, 'al volver a Ambos reaparecen');
      const link = await page.locator('a.parent-link').evaluate((a) => a.getBoundingClientRect().height);
      expect(link >= 60 && link <= 90, `el enlace al área de papá debe medir entre 60 y 90 px de alto y mide ${Math.round(link)}px`);
      await shot(page, 'ingles-modo-ambos', { fullPage: true });
    });

    await run('K08', 'borde', 'Título de 200 caracteres en la tarjeta de Lucca en móvil y tablet vertical, sin desbordes', async () => {
      const title = 'Escribe una historia muy larga sobre lo que hiciste durante las vacaciones con tu familia, tus amigos y tus mascotas, contando qué lugares visitaste, qué comiste y qué fue lo más divertido de todo el viaje, sin olvidar nada'.slice(0, 200);
      expect(title.length === 200, 'el título debe tener 200 caracteres');
      const res = await H.api(s, 'POST', '/api/parent/tasks', { cookie, body: { subject: 'spanish', title, assignedDate: '2026-11-20' } });
      expect(res.status === 201, 'la tarea debía crearse');
      for (const viewport of [PHONE, PORTRAIT]) {
        const { page } = await openKid(s, { viewport });
        await dayButton(page, /^Viernes 20/).click();
        const card = page.locator('.task-card', { hasText: 'Escribe una historia muy larga' });
        await card.waitFor();
        const fits = await card.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const t = el.querySelector('.task-title');
          return {
            buttons: [...el.querySelectorAll('button')].every((b) => b.getBoundingClientRect().right <= r.right + 0.5 && b.getBoundingClientRect().left >= r.left - 0.5),
            title: t.scrollWidth <= t.clientWidth + 1,
          };
        });
        expect(fits.buttons && fits.title, `desborda a ${viewport.width}px`);
        await shot(page, `titulo-200-${viewport.width}`);
      }
    });

    await run('K03', 'negativo', 'Servidor caído: pantalla amable con reintento, y al volver la agenda aparece', async () => {
      const { page } = await open(s);
      await page.route('**/api/kid/state', (route) => route.abort());
      await page.goto(s.url);
      await page.getByText('No encuentro tu agenda ahora. ¡Díselo a papá!').waitFor();
      expect((await page.getByText(/failed|error|undefined|TypeError/i).count()) === 0, 'no debe mostrar mensajes técnicos');
      const ratio = await page.getByRole('button', { name: 'Intentar de nuevo' }).evaluate((button) => {
        const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => {
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const a = lum(rgb(getComputedStyle(button).backgroundColor));
        const b = lum(rgb(getComputedStyle(document.body).backgroundColor));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio >= 3, `el botón de reintentar se confunde con el fondo (contraste ${ratio.toFixed(1)}:1, mínimo 3:1)`);
      await shot(page, 'sin-conexion');
      await page.unroute('**/api/kid/state');
      await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
      await kidHeading(page).waitFor();
      expect((await page.locator('.task-card').count()) > 0, 'al volver el servidor se ve la agenda');
      await shot(page, 'conexion-recuperada');
    });

    await run('K04', 'negativo', 'Falla "¡Ya la hice!" (error 500): dice "Inténtalo otra vez", no marca nada y el reintento funciona', async () => {
      const { page } = await openKid(s);
      await dayButton(page, /^Jueves 19/).click();
      let failing = true;
      await page.route('**/api/kid/progress', (route) => (failing ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue()));
      await page.getByRole('button', { name: 'Guíame', exact: true }).click();
      await page.getByText(/^Tarea 1 de \d+$/).waitFor();
      const before = (await kidState(s)).tasks.filter((t) => t.status === 'done').length;
      await page.getByRole('button', { name: '¡Ya la hice!', exact: true }).click();
      await page.getByText('Inténtalo otra vez', { exact: true }).waitFor();
      expect((await page.getByText(/^Tarea 1 de \d+$/).count()) === 1, 'sigue en la misma tarea');
      expect((await kidState(s)).tasks.filter((t) => t.status === 'done').length === before, 'no se marcó nada');
      await shot(page, 'error-al-marcar');
      failing = false;
      await page.getByRole('button', { name: '¡Ya la hice!', exact: true }).click();
      await page.getByText(/^Tarea 2 de \d+$/).waitFor();
      expect((await kidState(s)).tasks.filter((t) => t.status === 'done').length === before + 1, 'el reintento sí marca la tarea');
      await shot(page, 'reintento-correcto');
    });

    await run('K01', 'positivo', 'Recorrido completo: semana, plan, guía del día hasta el final y estrellas', async () => {
      const startStars = (await kidState(s)).starsThisWeek;
      const { page } = await openKid(s);
      await shot(page, 'mi-semana');
      await page.getByRole('button', { name: 'Plan de la semana', exact: true }).click();
      await page.getByRole('heading', { level: 1, name: 'Plan de la semana' }).waitFor();
      await shot(page, 'plan-de-la-semana');
      await page.getByRole('button', { name: 'Volver a mi semana' }).click();
      // Hoy (miércoles) se muestran también las pendientes de días anteriores: la guía debe recorrer exactamente las que no están listas.
      const pendingCards = await page.locator('.task-card', { hasNot: page.getByText('¡Lista!', { exact: true }) }).count();
      await page.getByRole('button', { name: 'Guíame', exact: true }).click();
      const step = await page.getByText(/^Tarea 1 de \d+$/).textContent();
      const total = Number(step.match(/de (\d+)/)[1]);
      expect(total >= 2 && total === pendingCards, `la guía debía recorrer las ${pendingCards} tareas pendientes de hoy y dijo ${total}`);
      await shot(page, 'guia-tarea-1');
      for (let i = 0; i < total; i++) {
        await page.getByRole('button', { name: '¡Ya la hice!', exact: true }).click();
        if (i < total - 1) await page.getByText(`Tarea ${i + 2} de ${total}`).waitFor();
      }
      await page.getByRole('heading', { level: 1, name: '¡Terminaste el día!' }).waitFor();
      const earned = Number((await page.locator('.guide-stars').textContent()).match(/(\d+)/)[1]);
      expect(earned === total, `estrellas ganadas ${earned}, se esperaban ${total}`);
      await shot(page, 'guia-terminada');
      await page.getByRole('button', { name: 'Volver a mi semana' }).click();
      const stars = Number(await page.locator('.stars-number').textContent());
      expect(stars === startStars + total && stars === (await kidState(s)).starsThisWeek, `las estrellas de la semana deben ser ${startStars + total} y la pantalla dice ${stars}`);
      await shot(page, 'semana-con-estrellas');
    });
  });

  await withServer({}, async (s) => {
    await H.setupParent(s);
    await run('K02', 'borde', 'Sin agenda: Lucca ve "Pídele a papá que conecte tu agenda" y el enlace al área de papá lleva al PIN', async () => {
      const { page } = await open(s);
      await page.goto(s.url);
      await page.getByText('Pídele a papá que conecte tu agenda').waitFor();
      expect((await page.getByRole('button', { name: 'Plan de la semana' }).count()) === 0, 'sin agenda no hay plan de la semana');
      await shot(page, 'sin-agenda');
      await page.getByRole('link', { name: 'Área de papá' }).click();
      await page.getByRole('heading', { name: 'Entra con tu PIN' }).waitFor();
      expect(new URL(page.url()).pathname === '/papa', 'el enlace lleva a /papa');
      await shot(page, 'enlace-a-papa');
    });
  });

  await withServer({ LUCCA_DEMO: '1', LUCCA_FAKE_NOW: '2026-11-22T17:00:00Z' }, async (s) => {
    await run('K05', 'borde', 'Domingo: abre el lunes siguiente y ningún día es "Hoy"', async () => {
      const { page } = await openKid(s);
      await page.getByText('23 – 27 de noviembre').first().waitFor();
      expect((await dayButton(page, /^Lunes 23/).getAttribute('aria-pressed')) === 'true', 'debe estar seleccionado el lunes 23');
      expect((await dayButton(page, /, Hoy/).count()) === 0, 'en domingo ningún día se llama Hoy');
      await shot(page, 'domingo-abre-el-lunes');
    });
  });

  await withServer({ LUCCA_DEMO: '1', LUCCA_FAKE_NOW: '2026-11-18T03:00:00Z' }, async (s) => {
    await run('K06', 'borde', 'Martes 22:00 en Panamá (ya miércoles en UTC): Lucca ve el martes', async () => {
      const { page } = await openKid(s);
      expect((await dayButton(page, /^Martes 17, Hoy/).getAttribute('aria-pressed')) === 'true', 'el martes 17 es hoy y está seleccionado');
      expect((await dayButton(page, /^Miércoles 18, Hoy/).count()) === 0, 'el miércoles aún no es hoy');
      expect((await kidState(s)).today === '2026-11-17', 'el servidor usa la hora de Panamá, no la de UTC');
      await shot(page, 'martes-22h-en-panama');
    });
  });
}


// =====================================================================================================
// Entender: lecciones interactivas (lecciones grabadas: sin red ni coste)
// =====================================================================================================
/** Dentro de la lección: tamaños táctiles de Lucca, texto ≥ 19 px, contraste 4,5:1 y nada fuera de su tarjeta. */
function measureLesson() {
  const problems = [];
  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth) problems.push(`desplazamiento horizontal: ${root.scrollWidth} > ${window.innerWidth}`);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
  for (const b of document.querySelectorAll('.lesson button')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 59.5 || r.height < 59.5) problems.push(`botón pequeño (${Math.round(r.width)}×${Math.round(r.height)}): ${label(b)}`);
  }
  for (const el of document.querySelectorAll('.lesson-text, .lesson-option, .lesson-feedback, .guide-step, .lesson-sort-item')) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (visible(el) && (el.textContent || '').trim() && size < 19) problems.push(`texto pequeño (${size}px): ${label(el)}`);
  }
  const card = document.querySelector('.lesson-card');
  if (card) {
    const c = card.getBoundingClientRect();
    for (const el of card.querySelectorAll('button, p, h1, li')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > c.right + 0.5 || r.left < c.left - 0.5) problems.push(`se sale de la tarjeta: ${label(el)}`);
    }
  }
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
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 1) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  for (const el of document.querySelectorAll('.lesson-text, .lesson-option:not(:disabled), .lesson-feedback, .lesson-title, .lesson-next, .lesson-nav .seg-btn:not(:disabled), .lesson-lang, .lesson-tick:not(:disabled), .lesson-wait p')) {
    if (!visible(el) || !(el.textContent || '').trim()) continue;
    const fg = rgb(getComputedStyle(el).color);
    const bg = bgOf(el);
    const [hi, lo] = [Math.max(lum(bg), lum(fg)), Math.min(lum(bg), lum(fg))];
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 4.5) problems.push(`poco contraste (${ratio.toFixed(1)}:1): ${label(el)}`);
  }
  return problems;
}

async function startLesson(page, name) {
  await page.getByRole('button', { name }).click();
  await page.getByText(/^Paso 1 de \d+$/).waitFor();
}
const lessonNext = (page) => page.getByRole('button', { name: /^(Siguiente|Terminar)$/ }).click();

async function lessonGroup() {
  await withServer({ LUCCA_DEMO: '1', LUCCA_AI: 'recorded' }, async (s) => {
    const cookie = await H.setupParent(s);

    await run('E01', 'positivo', 'Lucca abre «Entender» desde su tarea, recorre la lección, responde las preguntas y gana una estrella', async () => {
      const before = await kidState(s);
      const { page } = await openKid(s);
      await startLesson(page, /^(Empezar|Seguir|Repasar): Las partes de la planta/);
      expect((await text(page.getByText(/^Paso 1 de \d+$/))) === 'Paso 1 de 9', 'la lección de la planta tiene 6 pantallas y 3 preguntas');
      expect(await page.getByRole('button', { name: 'Atrás' }).isDisabled(), 'en el primer paso no se puede ir atrás');
      await shot(page, 'pantalla-1');
      for (let i = 0; i < 5; i++) await lessonNext(page);
      await page.getByText('Paso 6 de 9').waitFor();
      await lessonNext(page);
      await page.getByText('Pregunta 1 de 3').waitFor();
      expect(await page.getByRole('button', { name: 'Siguiente' }).isDisabled(), 'no se avanza sin responder');
      await page.getByRole('button', { name: 'La raíz' }).click();
      await page.getByText('¡Muy bien pensado!').waitFor();
      await shot(page, 'pregunta-acertada');
      await lessonNext(page);
      await page.getByRole('button', { name: 'Verdadero' }).click();
      await lessonNext(page);
      await page.getByRole('button', { name: 'semillas' }).click();
      await page.getByRole('button', { name: 'Terminar' }).click();
      await page.getByRole('heading', { name: '¡Lo entendiste!' }).waitFor();
      await page.getByText(/Ganaste una estrella/).waitFor();
      await shot(page, 'leccion-terminada');
      const after = await kidState(s);
      expect(after.starsThisWeek === before.starsThisWeek + 1, `debía ganar 1 estrella (antes ${before.starsThisWeek}, ahora ${after.starsThisWeek})`);
      await page.getByRole('button', { name: /Volver a mi semana/ }).click();
      await kidHeading(page).waitFor();
      expect(Number(await page.locator('.stars-number').textContent()) === after.starsThisWeek, 'la semana muestra la estrella nueva');
      await shot(page, 'semana-con-la-estrella');
    });

    await run('E02', 'positivo', 'Los bloques interactivos responden: contar hojas, ordenar las partes de la planta', async () => {
      const { page } = await openKid(s);
      await startLesson(page, /^(Empezar|Seguir|Repasar): Las partes de la planta/);
      for (let i = 0; i < 3; i++) await lessonNext(page);
      await page.getByText('Paso 4 de 9').waitFor();
      expect((await page.locator('.lesson-count [role=img]').count()) === 4, 'debía haber 4 hojas para contar');
      await page.getByRole('button', { name: '3', exact: true }).click();
      await page.getByText('Casi. Inténtalo otra vez.').waitFor();
      await page.getByRole('button', { name: '4', exact: true }).click();
      await page.getByText('¡Seguiste intentando y lo lograste!').waitFor();
      await shot(page, 'contar');
      await lessonNext(page);
      await lessonNext(page);
      await page.getByText('Paso 6 de 9').waitFor();
      for (const part of ['Raíz', 'Tallo', 'Hojas', 'Flor']) await page.getByRole('button', { name: part, exact: true }).click();
      await page.getByText('¡Muy bien pensado!').waitFor();
      expect((await text(page.getByRole('list', { name: 'Tu orden' }))) === 'RaízTalloHojasFlor', 'el orden elegido se muestra');
      await shot(page, 'ordenar');
    });

    await run('E03', 'positivo', 'Una tarea de Inglés se ve en inglés y «¿Me lo dices en español?» la cambia sin perder el paso', async () => {
      const { page } = await openKid(s);
      await dayButton(page, /^Lunes 16/).click();
      await startLesson(page, 'Repasar: Palabras: cat, hat, bat');
      await page.getByText('Today we learn words that end in -at.').waitFor();
      await lessonNext(page);
      await shot(page, 'en-ingles');
      await page.getByRole('button', { name: '¿Me lo dices en español?' }).click();
      await page.getByText('Paso 2 de 8').waitFor();
      expect((await page.locator('.lesson-text [lang=en]').first().textContent()) === 'Cat', 'la palabra en inglés va marcada con su idioma');
      await shot(page, 'en-espanol');
    });

    await run('E04', 'negativo', 'Dos fallos en una pregunta: la mascota ofrece otra explicación y llega con otro enfoque', async () => {
      const { page } = await openKid(s);
      await startLesson(page, /^(Empezar|Seguir|Repasar): Las partes de la planta/);
      for (let i = 0; i < 6; i++) await lessonNext(page);
      await page.getByText('Pregunta 1 de 3').waitFor();
      await page.getByRole('button', { name: 'La flor' }).click();
      expect((await page.getByText('¿Te lo explico de otra forma?').count()) === 0, 'con un fallo todavía no ofrece');
      await page.getByText('Piensa: ¿qué parte está bajo la tierra?').waitFor();
      await shot(page, 'pista-tras-el-primer-fallo');
      await page.getByRole('button', { name: 'Las hojas' }).click();
      await page.getByText('¿Te lo explico de otra forma?').waitFor();
      await shot(page, 'oferta-de-otra-explicacion');
      await page.getByRole('button', { name: 'Sí, explícamelo' }).click();
      await page.getByText('Imagina que la planta es una casa.').waitFor();
      await page.getByText(/^Paso 1 de \d+$/).waitFor();
      await shot(page, 'otra-explicacion');
    });

    await run('E05', 'borde', 'La lección en móvil y tablet, en oscuro y claro: sin desbordes, botones ≥ 60 px, texto ≥ 19 px y contraste 4,5:1', async () => {
      const found = [];
      for (const [viewport, theme] of [[PHONE, 'dark'], [PHONE, 'light'], [PORTRAIT, 'light'], [TABLET, 'dark']]) {
        const tag = `${viewport.width} ${theme}`;
        const { page } = await openKid(s, { viewport, theme });
        await startLesson(page, /^(Empezar|Seguir|Repasar): Restas sin llevar/);
        const steps = Number((await text(page.getByText(/^Paso 1 de \d+$/))).match(/de (\d+)/)[1]);
        for (let i = 0; i < steps; i++) {
          for (const p of await page.evaluate(measureLesson)) found.push(`[${tag} · paso ${i + 1}] ${p}`);
          if (i === 1 && viewport === PHONE) await shot(page, `cuento-${viewport.width}-${theme}`);
          if (i === 4 && viewport !== TABLET) await shot(page, `recta-numerica-${viewport.width}-${theme}`);
          const next = page.getByRole('button', { name: /^(Siguiente|Terminar)$/ });
          if (await next.isDisabled()) break;
          if (i < steps - 1) await next.click();
        }
        for (const c of opened.splice(0)) await c.close().catch(() => {});
      }
      expect(found.length === 0, `Incumplimientos:\n      ${found.join('\n      ')}`);
    });

    await run('E06', 'borde', 'Modo «Leer»: la lección no tiene botón de escuchar; en «Escuchar» sí', async () => {
      const { page } = await openKid(s);
      await page.getByRole('button', { name: 'Leer', exact: true }).click();
      await startLesson(page, /^(Empezar|Seguir|Repasar): Restas sin llevar/);
      expect((await page.getByRole('button', { name: 'Escuchar esta pantalla' }).count()) === 0, 'en modo Leer no hay botón de audio');
      await page.getByRole('button', { name: /Volver a mi semana/ }).click();
      await page.getByRole('button', { name: 'Escuchar', exact: true }).click();
      await startLesson(page, /^(Empezar|Seguir|Repasar): Restas sin llevar/);
      expect((await page.getByRole('button', { name: 'Escuchar esta pantalla' }).count()) === 1, 'en modo Escuchar sí hay botón');
    });

    await run('E07', 'negativo', 'Sin conexión al abrir la lección: mensaje amable y el reintento funciona', async () => {
      const { page } = await openKid(s);
      await page.route('**/api/kid/lessons/**', (route) => route.abort());
      await page.getByRole('button', { name: /^(Empezar|Seguir|Repasar): Restas sin llevar/ }).click();
      await page.getByText('No encuentro tu lección ahora. ¡Díselo a papá!').waitFor();
      expect((await page.getByText(/failed|TypeError|fetch/i).count()) === 0, 'sin mensajes técnicos');
      await shot(page, 'sin-conexion');
      await page.unroute('**/api/kid/lessons/**');
      await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
      await page.getByText(/^Paso 1 de \d+$/).waitFor();
    });

    await run('E08', 'positivo', 'Papá ve la lección como Lucca, sin que cuente como progreso, y puede regenerarla', async () => {
      const before = await kidState(s);
      const { page } = await open(s, { cookie });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      await page.getByRole('button', { name: /^Ver lección: Dibujo de mi familia/ }).click();
      await page.getByText('Vas a dibujar a tu familia. ¡Qué divertido!').waitFor();
      await shot(page, 'vista-previa');
      for (let i = 0; i < 4; i++) await lessonNext(page);
      await page.getByRole('button', { name: 'Un círculo' }).click();
      await lessonNext(page);
      await page.getByRole('button', { name: 'Verdadero' }).click();
      await page.getByRole('button', { name: 'Terminar' }).click();
      await page.getByRole('heading', { name: '¡Lo entendiste!' }).waitFor();
      const after = await kidState(s);
      expect(after.starsThisWeek === before.starsThisWeek, 'la vista previa no da estrellas');
      expect(taskByTitle(after.tasks, /Dibujo/).status === taskByTitle(before.tasks, /Dibujo/).status, 'la vista previa no cambia el estado de la tarea');
      await page.getByRole('button', { name: 'Regenerar lección' }).click();
      await page.getByText('Lección nueva lista.').waitFor();
      await shot(page, 'regenerada');
      await page.getByRole('button', { name: /Cerrar la vista previa/ }).click();
      await page.getByRole('button', { name: 'Nueva tarea' }).waitFor();
    });

    await run('E09', 'borde', 'Ajustes de IA: modo, gasto del mes frente al tope y cambio del tope (fuera de rango se rechaza)', async () => {
      const { page } = await open(s, { cookie });
      await goParent(page, s);
      await parentHeading(page).waitFor();
      await tab(page, 'Ajustes');
      await page.getByText(/Lecciones grabadas \(modo de prueba/).waitFor();
      await page.getByText('US$ 0,00').first().waitFor();
      await page.getByLabel('Tope mensual de IA (dólares)', { exact: true }).fill('500');
      await page.getByRole('button', { name: 'Guardar ajustes' }).click();
      await fieldError(page, 'Tope mensual de IA (dólares)').waitFor();
      expect((await text(fieldError(page, 'Tope mensual de IA (dólares)'))) === 'El tope va de 1 a 200 dólares', 'debía explicar el rango');
      await page.getByLabel('Tope mensual de IA (dólares)', { exact: true }).fill('35');
      await page.getByRole('button', { name: 'Guardar ajustes' }).click();
      await page.getByText('Ajustes guardados', { exact: true }).waitFor();
      expect((await H.api(s, 'GET', '/api/parent/overview', { cookie })).json.ai.capUsd === 35, 'el tope nuevo queda guardado');
      await shot(page, 'ia-en-ajustes', { scrollTo: page.getByRole('heading', { name: 'Inteligencia artificial' }) });
    });
  });

  await withServer({ LUCCA_DEMO: '1' }, async (s) => {
    const cookie = await H.setupParent(s);
    await run('E10', 'negativo', 'Sin clave de IA: Lucca ve «Esta tarea la vemos con papá» (sin errores) y papá ve qué falta', async () => {
      const { page } = await openKid(s);
      await page.getByRole('button', { name: /^(Empezar|Seguir|Repasar): Restas sin llevar/ }).click();
      await page.getByText('Esta tarea la vemos con papá.').waitFor();
      expect((await page.getByRole('button', { name: 'Intentar de nuevo' }).count()) === 0, 'no hay nada que reintentar');
      await shot(page, 'con-papa');
      const parent = await open(s, { cookie });
      await goParent(parent.page, s);
      await parentHeading(parent.page).waitFor();
      await tab(parent.page, 'Ajustes');
      await parent.page.getByText(/falta ANTHROPIC_API_KEY en el archivo \.env/).waitFor();
      await shot(parent.page, 'papa-ve-que-falta', { scrollTo: parent.page.getByRole('heading', { name: 'Inteligencia artificial' }) });
    });
  });
}

(async () => {
  H.prepareOut();
  browser = await chromium.launch();
  let code = 1;
  try {
    await accessGroup();
    await expiredSessionGroup();
    await tasksGroup();
    await progressGroup();
    await settingsGroup();
    await responsiveGroup();
    await keyboardGroup();
    await kidGroup();
    await lessonGroup();
    code = H.report();
  } catch (err) {
    console.error('Las pruebas funcionales no pudieron terminar:', err);
    H.report();
  } finally {
    await browser.close();
  }
  process.exit(code);
})();
