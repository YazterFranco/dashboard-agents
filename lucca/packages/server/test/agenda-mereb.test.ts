import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TaskDraftSchema } from '@lucca/shared';
import { parseMerebAgenda } from '../src/agenda/merebPdf.js';
import type { PdfItem, PdfText } from '../src/agenda/pdfText.js';

/** Texto con posiciones de una exportación real de la agenda (semana del 22 al 28 de noviembre de 2026), con los nombres de los docentes cambiados. */
const real: PdfText = JSON.parse(readFileSync(new URL('./fixtures/mereb/agenda-2026-11-22.items.json', import.meta.url), 'utf8'));
const TODAY = '2026-11-21';

describe('parseMerebAgenda con la agenda real', () => {
  const preview = parseMerebAgenda(real, { today: TODAY });
  const byTitle = (start: string) => {
    const d = preview.drafts.find((x) => x.title.startsWith(start));
    if (!d) throw new Error(`No está «${start}» en ${preview.drafts.map((x) => x.title).join(' | ')}`);
    return d;
  };

  it('lee la semana del encabezado', () => {
    expect(preview.weekStart).toBe('2026-11-22');
    expect(preview.weekEnd).toBe('2026-11-28');
  });

  it('encuentra las 10 actividades (la de Folklore repetida cuenta una vez)', () => {
    expect(preview.drafts).toHaveLength(10);
    expect(preview.drafts.map((d) => d.dueDate)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-24',
      '2026-11-25',
      '2026-11-25',
      '2026-11-26',
      '2026-11-26',
      '2026-11-26',
      '2026-11-27',
      '2026-11-27',
    ]);
  });

  it('cada propuesta cumple el esquema y su clave es única', () => {
    for (const d of preview.drafts) expect(TaskDraftSchema.safeParse(d).success).toBe(true);
    expect(new Set(preview.drafts.map((d) => d.key)).size).toBe(preview.drafts.length);
  });

  it('mapea las materias y conserva el nombre de la agenda', () => {
    expect(preview.drafts.map((d) => [d.subject, d.subjectLabel])).toEqual([
      ['social', 'Ciencias Sociales'],
      ['english', 'Reading'],
      ['spanish', 'Español'],
      ['english', 'Spelling / Phonics'],
      ['math', 'Matemáticas'],
      ['english', 'Writing and Grammar'],
      ['science', 'Science'],
      ['music', 'Art and Music Appreciation'],
      ['music', 'Folklore / Danza'],
      ['spanish', 'Español'],
    ]);
  });

  it('toma el título de la columna «Tema»', () => {
    expect(preview.drafts[0].title).toBe('Entonación del Himno Nacional de Panamá y Himno del Colegio');
    byTitle('Cloudette – Story Sequence Mini Book');
    byTitle('Long O (o, oa, ow)');
    expect(byTitle('Números').title).toBe('Números Romanos, ordinales y cálculo mental');
    byTitle('Verbs in the Present, Past, and Future Tense');
    byTitle('Land Habitats');
    byTitle('Song La bandera panameña');
    byTitle('Revisión de libro de caligrafía');
  });

  it('un título genérico («EJERCICIO 1-ESPAÑOL») se completa con los temas del detalle', () => {
    expect(preview.drafts[2].title).toBe(
      'Ejercicio 1: familia de palabras (primitiva y derivadas), aumentativos y diminutivos, sujeto, verbo, predicado y adjetivo',
    );
  });

  it('un tema largo se acorta en el título y queda completo en la descripción', () => {
    const cumbia = preview.drafts[8];
    expect(cumbia.title).toBe('Cumbia Veragüense');
    expect(cumbia.description).toContain('pueden apoyarse con este link en casa para aprender el baile');
  });

  it('nombra el tipo de evaluación', () => {
    expect(preview.drafts.map((d) => d.kind)).toEqual([
      'Evaluación Oral 1',
      'Class Work 2 / Story Sequence book',
      'Ejercicio 1',
      'Class Work 1 / Mini Book',
      'Ejercicio 3',
      'Test 1',
      'Mini Book',
      'Songs 1',
      'Baile Folclórico',
      'Caligrafía',
    ]);
  });

  it('la descripción junta detalle y sugerencias, sin enlaces ni nombres de docentes', () => {
    for (const d of preview.drafts) {
      expect(d.description).not.toMatch(/https?:|youtu|wordwall|www\./i);
      expect(d.description).not.toMatch(/Prof|Docente/);
      expect(d.title).not.toMatch(/Prof|Docente|https?:/);
      expect(d.description.length).toBeLessThanOrEqual(2000);
    }
    const himno = preview.drafts[0];
    expect(himno.description).toContain('página 221 del libro de Sociales');
    expect(himno.description).toContain('Para estudiar en casa:');
    expect(himno.description).toContain('Escuchar y cantar ambos himnos.');
    expect(himno.description).toContain('Mereb tiene 2 adjuntos');
    // El enlace no viaja, pero el padre sabe que en Mereb hay un video para practicar.
    expect(himno.description).toContain('Nacional: (video en Mereb)');
  });


  it('las palabras del vocabulario quedan en la descripción', () => {
    const longO = byTitle('Long O');
    expect(longO.description).toContain('\n(OA) road, coat, toad, toast, goat\n(OW) snow, window, bow, pillow, grow');
    expect(longO.description).toContain('Adjuntos en Mereb: Long_O_Mini_Book_Rubric.pdf');
  });

  it('el detalle que sigue en la página siguiente no se pierde', () => {
    const espanol = preview.drafts[2];
    expect(espanol.description).toContain('Aumentativos y diminutivos: pág. 148, pág. 151 (actividad 14)');
  });

  it('una rúbrica en tabla se resume en una línea con los puntos', () => {
    const cumbia = preview.drafts[8];
    expect(cumbia.description).toContain(
      'Rúbrica (20 pts): Sigue el ritmo de la música (5 pts); Ejecuta los pasos básicos enseñados (5 pts); Demuestra coordinación en sus movimientos (5 pts); Participa con entusiasmo y disposición (5 pts)',
    );
  });

  it('es determinista: la misma agenda da las mismas claves', () => {
    expect(parseMerebAgenda(real, { today: '2026-12-01' }).drafts.map((d) => d.key)).toEqual(preview.drafts.map((d) => d.key));
  });
});

/** Arma un PDF de mentira con filas de texto en las posiciones de la exportación de Mereb. */
function fake(rows: Array<[number, number, string]>, page = 1): PdfText {
  const items: PdfItem[] = rows.map(([x, y, str]) => ({ page, x, y, w: str.length * 4.5, h: 10, str }));
  return { pageHeight: 792, items };
}

const TABLE_HEAD: Array<[number, number, string]> = [
  [108, 120, 'Tema'],
  [255, 120, 'Detalle de evaluación'],
  [438, 120, 'Sugerencia de estudio'],
];

describe('parseMerebAgenda: bordes', () => {
  it('un PDF que no es la agenda no propone nada', () => {
    const p = parseMerebAgenda(fake([[40, 40, 'Factura 123'], [40, 60, 'Total: 20 dólares']]), { today: TODAY });
    expect(p).toEqual({ weekStart: null, weekEnd: null, drafts: [] });
  });

  it('una semana sin actividades no propone nada', () => {
    const p = parseMerebAgenda(
      fake([
        [28, 35, 'Semana del 22 al 28 de noviembre del 2026'],
        [28, 50, 'Lunes 23/11'],
        [28, 62, 'No hay actividades para este día.'],
      ]),
      { today: TODAY },
    );
    expect(p.drafts).toEqual([]);
    expect(p.weekStart).toBe('2026-11-22');
  });

  it('una actividad antes de cualquier día se ignora', () => {
    const p = parseMerebAgenda(fake([[36, 97, '2-B(MATEMATICAS) (+EJERCICIO 1)'], ...TABLE_HEAD, [29, 135, 'Sumas']]), { today: TODAY });
    expect(p.drafts).toEqual([]);
  });

  it('sin encabezado de semana usa el año de hoy', () => {
    const p = parseMerebAgenda(
      fake([[28, 74, 'Lunes 23/11'], [36, 97, '2-B(MATEMATICAS) (+EJERCICIO 1)'], ...TABLE_HEAD, [29, 135, 'Sumas con llevadas']]),
      { today: TODAY },
    );
    expect(p.drafts).toHaveLength(1);
    expect(p.drafts[0]).toMatchObject({ dueDate: '2026-11-23', subject: 'math', title: 'Sumas con llevadas', kind: 'Ejercicio 1' });
  });

  it('una semana que cruza el año pone cada día en su año', () => {
    const p = parseMerebAgenda(
      fake([
        [28, 35, 'Semana del 28 de diciembre del 2026 al 3 de enero del 2027'],
        [28, 74, 'Viernes 1/1'],
        [36, 97, '2-B(SCIENCE) (+TEST1)'],
        ...TABLE_HEAD,
        [29, 135, 'Plants'],
      ]),
      { today: '2026-12-26' },
    );
    expect(p.weekStart).toBe('2026-12-28');
    expect(p.weekEnd).toBe('2027-01-03');
    expect(p.drafts[0].dueDate).toBe('2027-01-01');
  });

  it('una fecha imposible (31/02) se salta sin romper el resto', () => {
    const p = parseMerebAgenda(
      fake([
        [28, 40, 'Lunes 31/02'],
        [36, 60, '2-B(MATEMATICAS) (+EJERCICIO 1)'],
        ...TABLE_HEAD.map(([x, , s]) => [x, 80, s] as [number, number, string]),
        [29, 95, 'Restas'],
        [28, 200, 'Martes 24/11'],
        [36, 220, '2-B(ESPAÑOL) (+DICTADO)'],
        ...TABLE_HEAD.map(([x, , s]) => [x, 240, s] as [number, number, string]),
        [29, 255, 'Palabras con ll'],
      ]),
      { today: TODAY },
    );
    expect(p.drafts.map((d) => d.title)).toEqual(['Palabras con ll']);
  });

  it('una actividad sin tema usa el tipo de evaluación y la materia', () => {
    const p = parseMerebAgenda(fake([[28, 74, 'Lunes 23/11'], [36, 97, '2-B(ROBÓTICA) (+PROYECTO 2)'], ...TABLE_HEAD, [214, 135, 'Traer el robot armado.']]), {
      today: TODAY,
    });
    expect(p.drafts[0]).toMatchObject({ subject: 'other', subjectLabel: 'Robótica', title: 'Proyecto 2 de Robótica' });
    expect(p.drafts[0].description).toContain('Traer el robot armado.');
  });
});
