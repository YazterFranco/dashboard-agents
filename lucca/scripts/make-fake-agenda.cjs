#!/usr/bin/env node
/**
 * Genera un PDF de agenda FICTICIO con la misma forma que «Exportar actividades» de Mereb (impreso por Chromium,
 * tabla de tres columnas). Sirve para las pruebas sin guardar en el repo la agenda real del colegio.
 *
 *   node scripts/make-fake-agenda.cjs [salida.pdf] [--empty] [--many N]
 */
const { chromium } = require('playwright');
const path = require('node:path');

const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'packages/server/test/fixtures/mereb/agenda-ficticia.pdf');
const empty = process.argv.includes('--empty');

const ENTRIES = [
  {
    day: 'Lunes 16/11',
    subject: 'MATEMATICAS',
    kind: '+EJERCICIO - 2',
    teacher: 'Docente Ficticio',
    attach: 'Cantidad de adjuntos: 1',
    tema: 'Sumas con llevadas, pág. 24',
    detalle: 'Los niños resolverán sumas de dos cifras con llevadas.<br>Traer el libro de Matemáticas.',
    sugerencia: 'Practicar en el cuaderno.<br>Video de repaso: <a href="https://youtu.be/ejemplo123">https://youtu.be/ejemplo123</a>',
  },
  {
    day: 'Martes 17/11',
    subject: 'READING',
    kind: '+CLASS WORK1',
    teacher: 'Teacher Example',
    attach: 'Nombre del adjunto: My_Pet_Rubric.pdf',
    tema: '<b>My Pet – Reading comprehension</b>',
    detalle: 'Students will read a short story and answer five questions about the characters.',
    sugerencia: 'Read the story at home.<ul><li>Pencil and eraser</li><li>Colored pencils</li></ul>',
  },
  {
    day: 'Martes 17/11',
    subject: 'ESPAÑOL',
    kind: '+EJERCICIO 1',
    teacher: 'Docente Ficticio',
    tema: 'EJERCICIO 1-ESPAÑOL',
    detalle: 'Los niños realizarán un ejercicio sobre los siguientes conceptos:<br>-Sustantivos comunes y propios.<br>-Singular y plural.',
    sugerencia: 'Ver páginas 40 y 41 del libro.',
  },
  {
    day: 'Jueves 19/11',
    subject: 'SCIENCE',
    kind: '+MINI BOOK',
    teacher: 'Teacher Example',
    attach: 'Nombre del adjunto: Plants_Mini_Book_Rubric.pdf',
    tema: 'Parts of a Plant',
    detalle:
      'Students will make a mini book with the parts of a plant: roots, stem, leaves, flower and seeds.<br><b>Materials to Bring:</b><ul><li>Pencil and eraser.</li><li>Glue stick</li></ul>',
    sugerencia: 'Science notebook<br>Lesson plan #1 "Plants around us"',
  },
  {
    day: 'Viernes 20/11',
    subject: 'FOLKLORE/ DANZA',
    kind: 'Baile Folclórico ',
    teacher: 'Docente de Danza',
    yellow: true,
    tema: 'Tamborito pueden apoyarse con este link en casa para aprender el baile el cual será para evaluación la próxima semana.<br><a href="https://www.youtube.com/watch?v=ejemplo">https://www.youtube.com/watch?v=ejemplo&list=RDejemplo&start_radio=1</a>',
    detalle:
      '<table class="rubric"><tr><th>Criterio</th><th>Puntos</th></tr><tr><td>Sigue el ritmo de la música.</td><td>5 pts</td></tr><tr><td>Ejecuta los pasos básicos.</td><td>5 pts</td></tr><tr><td><b>Total</b></td><td><b>10 pts</b></td></tr></table>',
    sugerencia: 'Traer pollera o sombrero, no es obligatorio.',
  },
];

const DAYS = ['Domingo 15/11', 'Lunes 16/11', 'Martes 17/11', 'Miércoles 18/11', 'Jueves 19/11', 'Viernes 20/11', 'Sábado 21/11'];

function html() {
  const blocks = DAYS.map((day) => {
    const entries = empty ? [] : ENTRIES.filter((e) => e.day === day);
    if (!entries.length) return `<div class="day">${day}</div><div class="day">No hay actividades para este día.</div>`;
    return (
      `<div class="day">${day}</div>` +
      entries
        .map(
          (e) => `
      <table class="act">
        <tr><th colspan="3" class="head ${e.yellow ? 'yellow' : ''}"><span class="title">2-B(${e.subject}) (${e.kind}) Prof:${e.teacher}</span>${e.attach ? `<span class="att">${e.attach}</span>` : ''}</th></tr>
        <tr class="cols"><th>Tema</th><th>Detalle de evaluación</th><th>Sugerencia de estudio</th></tr>
        <tr><td>${e.tema}</td><td>${e.detalle}</td><td>${e.sugerencia}</td></tr>
      </table>`,
        )
        .join('')
    );
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 12px; margin: 0; }
    h1 { font-size: 16px; margin: 0 0 6px; }
    .day { font-size: 12px; margin: 2px 0; }
    table.act { width: 100%; border-collapse: collapse; margin: 4px 0 12px; table-layout: fixed; }
    table.act td, table.act th { border: 1px solid #ccc; vertical-align: top; padding: 2px 3px; text-align: left; }
    th.head { background: #cfc; padding: 10px; font-weight: bold; }
    th.head.yellow { background: #ffc; }
    th.head .att { float: right; color: #1a4f8a; }
    tr.cols th { background: #5b85aa; color: #000; text-align: center; font-weight: bold; }
    ul { margin: 0; padding-left: 22px; }
    table.rubric { border-collapse: collapse; width: 100%; }
    table.rubric th { background: #1f4e79; color: #fff; }
  </style><h1>Semana del 15 al 21 de noviembre del 2026</h1>${blocks}`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html());
  await page.pdf({ path: out, format: 'Letter', margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' } });
  await browser.close();
  console.log(`[agenda ficticia] ${out}`);
})();
