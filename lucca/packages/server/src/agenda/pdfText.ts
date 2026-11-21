import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// En Node pdf.js usa un «worker falso»: si ya está en globalThis no lo busca con un import dinámico,
// que dejaría de funcionar al empaquetar el servidor en un solo archivo.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= pdfjsWorker;

/** Un trozo de texto del PDF con su posición en puntos, medida desde arriba a la izquierda de su página. */
export interface PdfItem {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
}

export interface PdfText {
  pageHeight: number;
  items: PdfItem[];
}

export class PdfReadError extends Error {}

const MAX_PAGES = 20;

/** Texto con posiciones de un PDF. No ejecuta scripts del PDF ni carga nada de la red. */
export async function readPdfText(data: Uint8Array): Promise<PdfText> {
  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: false,
    verbosity: 0,
    enableXfa: false,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    await task.destroy();
    throw new PdfReadError('No es un PDF que se pueda leer');
  }
  try {
    if (doc.numPages > MAX_PAGES) throw new PdfReadError(`El PDF tiene más de ${MAX_PAGES} páginas`);
    const items: PdfItem[] = [];
    let pageHeight = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const height = page.getViewport({ scale: 1 }).height;
      pageHeight = Math.max(pageHeight, height);
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({
          page: p,
          x: round(it.transform[4]),
          y: round(height - it.transform[5]),
          w: round(it.width),
          h: round(it.height),
          str: it.str,
        });
      }
    }
    return { pageHeight: round(pageHeight), items };
  } finally {
    await task.destroy();
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
