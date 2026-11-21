import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PdfReadError, readPdfText } from '../src/agenda/pdfText.js';
import { parseMerebAgenda } from '../src/agenda/merebPdf.js';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/mereb/${name}`, import.meta.url)));

describe('readPdfText + parseMerebAgenda con un PDF de verdad (agenda ficticia)', () => {
  it('lee las 5 actividades de la semana del 15 al 21 de noviembre', async () => {
    const preview = parseMerebAgenda(await readPdfText(fixture('agenda-ficticia.pdf')), { today: '2026-11-18' });
    expect(preview.weekStart).toBe('2026-11-15');
    expect(preview.weekEnd).toBe('2026-11-21');
    expect(preview.drafts.map((d) => [d.dueDate, d.subject, d.title])).toEqual([
      ['2026-11-16', 'math', 'Sumas con llevadas, pág. 24'],
      ['2026-11-17', 'english', 'My Pet – Reading comprehension'],
      ['2026-11-17', 'spanish', 'Ejercicio 1: sustantivos comunes y propios, singular y plural'],
      ['2026-11-19', 'science', 'Parts of a Plant'],
      ['2026-11-20', 'music', 'Tamborito'],
    ]);
  });

  it('las ligaduras («fi», «fl») no parten palabras y los renglones partidos por el ancho se unen', async () => {
    const preview = parseMerebAgenda(await readPdfText(fixture('agenda-ficticia.pdf')), { today: '2026-11-18' });
    const all = preview.drafts.map((d) => d.description).join('\n');
    expect(all).toContain('answer five questions');
    expect(all).toContain('Students will make a mini book with the parts of a plant: roots, stem, leaves, flower and seeds.');
    expect(all).not.toMatch(/https?:|youtu|Prof|Docente|Teacher Example/);
  });

  it('una agenda sin actividades no propone nada', async () => {
    const preview = parseMerebAgenda(await readPdfText(fixture('agenda-vacia.pdf')), { today: '2026-11-18' });
    expect(preview.drafts).toEqual([]);
    expect(preview.weekStart).toBe('2026-11-15');
  });

  it('lo que no es un PDF se rechaza con un error propio', async () => {
    await expect(readPdfText(new TextEncoder().encode('hola, no soy un PDF'))).rejects.toBeInstanceOf(PdfReadError);
    await expect(readPdfText(new Uint8Array())).rejects.toBeInstanceOf(PdfReadError);
  });

  it('un PDF cortado a la mitad se rechaza sin colgarse', async () => {
    const whole = fixture('agenda-ficticia.pdf');
    await expect(readPdfText(whole.slice(0, 400))).rejects.toBeInstanceOf(PdfReadError);
  });
});
