import { createHash } from 'node:crypto';
import {
  IsoDateSchema,
  foldText,
  mapSubject,
  mondayOf,
  prettyLabel,
  type AgendaPreview,
  type IsoDate,
  type TaskDraft,
} from '@lucca/shared';
import type { PdfItem, PdfText } from './pdfText.js';

/**
 * Lector del PDF «Exportar actividades» de la agenda de Mereb. El PDF es una tabla impresa por el navegador:
 * encabezado de semana, una línea por día («Lunes 23/11») y, por actividad, un encabezado
 * «2-B(MATERIA) (+TIPO) Prof:…» seguido de tres columnas: Tema, Detalle de evaluación y Sugerencia de estudio.
 * Se lee por posición: cada trozo de texto va a la columna que le toca por su x.
 */

/** Trozo de texto con la y de todo el documento (las páginas se apilan), para seguir una tabla entre páginas. */
interface Piece extends PdfItem {
  gy: number;
}

interface Line {
  x: number;
  right: number;
  gy: number;
  pieces: Piece[];
  text: string;
}

interface Block {
  date: IsoDate | null;
  header: string[];
  attachments: string[];
  /** Límites x entre Tema|Detalle y Detalle|Sugerencia; null mientras no aparece la fila de títulos. */
  bounds: [number, number] | null;
  columns: [Piece[], Piece[], Piece[]];
}

const ROW_TOLERANCE = 2.5;
const LEFT_MARGIN = 34;
const MAX_TITLE = 90;
const MAX_DESCRIPTION = 2000;

const DAY_RE = /^(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+(\d{1,2})\s*\/\s*(\d{1,2})$/i;
const BLOCK_RE = /^\s*\d{1,2}\s*-\s*[A-Z0-9]{1,3}\s*\(/i;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const GENERIC_TITLE_RE = /^(ejercicio|exercise|test|prueba|examen|quiz|taller|evaluaci[oó]n|proyecto|project)\b/i;

export interface ParseOptions {
  /** Hoy, para deducir el año si el PDF no trae el encabezado de la semana. */
  today: IsoDate;
}

export function parseMerebAgenda(pdf: PdfText, opts: ParseOptions): AgendaPreview {
  const week = findWeek(pdf.items);
  const blocks: ReadyBlock[] = [];
  let date: IsoDate | null = null;
  let block: Block | null = null;

  const close = (): void => {
    if (block?.date && block.bounds) blocks.push(block as ReadyBlock);
    block = null;
  };

  for (const row of rowsOf(pdf)) {
    const text = row.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim();
    const first = row[0];
    if (first.x < LEFT_MARGIN && /^semana del\b/i.test(text)) continue;
    const day = first.x < LEFT_MARGIN ? DAY_RE.exec(text) : null;
    if (day) {
      close();
      date = dateOf(Number(day[2]), Number(day[3]), week, opts.today);
      continue;
    }
    if (first.x < LEFT_MARGIN && /^no hay actividades/i.test(text)) continue;

    if (row.some((p) => p.x < 60 && BLOCK_RE.test(p.str))) {
      close();
      block = { date, header: [], attachments: [], bounds: null, columns: [[], [], []] };
      addHeaderRow(block, row);
      continue;
    }
    if (!block) continue;
    const current: Block = block;

    if (!current.bounds) {
      const bounds = tableBounds(row);
      if (bounds) current.bounds = bounds;
      else addHeaderRow(current, row);
      continue;
    }
    for (const piece of row) {
      const col = piece.x < current.bounds[0] ? 0 : piece.x < current.bounds[1] ? 1 : 2;
      current.columns[col].push(piece);
    }
  }
  close();

  // Hasta dónde llega el texto de cada columna en todo el documento: así se sabe si un renglón se partió por el ancho.
  // Un enlace largo no se parte y puede salirse de la celda: no cuenta, y nada pasa del límite con la columna siguiente.
  const rights: [number, number, number] = [0, 0, 0];
  for (const b of blocks) {
    const [b1, b2] = b.bounds;
    const caps = [b1 + 10, b2 + 10, b2 + (b2 - b1) + 10];
    b.columns.forEach((pieces, i) => {
      for (const line of splitRubric(linesOf(pieces)).rest) {
        if (/https?:\/\/|www\./i.test(line.text)) continue;
        rights[i] = Math.max(rights[i], Math.min(line.right, caps[i]));
      }
    });
  }

  const drafts: TaskDraft[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const [b1, b2] = b.bounds;
    const fallback = [b1 + 7, b2 + 7, b2 + (b2 - b1) + 7];
    const draft = buildDraft(b, rights.map((r, i) => r || fallback[i]));
    if (draft && !seen.has(draft.key)) {
      seen.add(draft.key);
      drafts.push(draft);
    }
  }
  return { weekStart: week?.start ?? null, weekEnd: week?.end ?? null, drafts };
}

type ReadyBlock = Block & { date: IsoDate; bounds: [number, number] };

/* ---------- Filas y fechas ---------- */

function rowsOf(pdf: PdfText): Piece[][] {
  const pageHeight = pdf.pageHeight || 792;
  const pieces = pdf.items
    .map((it) => ({ ...it, gy: (it.page - 1) * (pageHeight + 100) + it.y }))
    .sort((a, b) => a.gy - b.gy || a.x - b.x);
  const rows: Piece[][] = [];
  for (const piece of pieces) {
    const last = rows.at(-1);
    if (last && Math.abs(last[0].gy - piece.gy) <= ROW_TOLERANCE) last.push(piece);
    else rows.push([piece]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

interface Week {
  start: IsoDate;
  end: IsoDate;
}

function findWeek(items: PdfItem[]): Week | null {
  const header = items.find((it) => /^\s*semana del\b/i.test(it.str));
  if (!header) return null;
  const m =
    /semana del\s+(\d{1,2})(?:\s+de\s+([a-záéíóú]+))?(?:\s+del?\s+(\d{4}))?\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+del?\s+(\d{4})/i.exec(
      header.str,
    );
  if (!m) return null;
  const endMonth = monthNumber(m[5]);
  const startMonth = m[2] ? monthNumber(m[2]) : endMonth;
  const endYear = Number(m[6]);
  const startYear = m[3] ? Number(m[3]) : startMonth > endMonth ? endYear - 1 : endYear;
  const start = isoOf(startYear, startMonth, Number(m[1]));
  const end = isoOf(endYear, endMonth, Number(m[4]));
  return start && end ? { start, end } : null;
}

function monthNumber(name: string): number {
  return MONTHS.indexOf(foldText(name).toLowerCase()) + 1;
}

function isoOf(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return IsoDateSchema.safeParse(iso).success ? iso : null;
}

/** El año de «23/11»: el de la semana del encabezado, o el que deja la fecha más cerca de hoy. */
function dateOf(day: number, month: number, week: Week | null, today: IsoDate): IsoDate | null {
  const anchor = week ? [week.start, week.end] : [today];
  const years = new Set(anchor.map((d) => Number(d.slice(0, 4))));
  const base = Number(today.slice(0, 4));
  const candidates = week ? [...years] : [base - 1, base, base + 1];
  let best: IsoDate | null = null;
  let bestDistance = Infinity;
  for (const year of candidates) {
    const iso = isoOf(year, month, day);
    if (!iso) continue;
    const distance = Math.min(...anchor.map((a) => Math.abs(Date.parse(iso) - Date.parse(a))));
    if (distance < bestDistance) {
      best = iso;
      bestDistance = distance;
    }
  }
  return best;
}

/* ---------- Encabezado de la actividad ---------- */

function addHeaderRow(block: Block, row: Piece[]): void {
  for (const piece of row) {
    const s = piece.str.trim();
    if (/^(nombre del adjunto|cantidad de adjuntos)/i.test(s)) block.attachments.push(s);
    else if (piece.x < 200) block.header.push(s);
    else if (block.attachments.length) block.attachments[block.attachments.length - 1] += s;
  }
}

/** La fila «Tema | Detalle de evaluación | Sugerencia de estudio» fija dónde empieza cada columna. */
function tableBounds(row: Piece[]): [number, number] | null {
  const find = (re: RegExp) => row.find((p) => re.test(p.str.trim()));
  const tema = find(/^tema$/i);
  const detalle = find(/^detalle/i);
  const sugerencia = find(/^sugerencia/i);
  if (!tema || !detalle || !sugerencia) return null;
  const center = (p: Piece) => p.x + p.w / 2;
  return [(center(tema) + center(detalle)) / 2 - 6, (center(detalle) + center(sugerencia)) / 2 - 6];
}

function parseHeader(header: string[]): { subjectRaw: string; kindRaw: string } {
  const joined = header.join(' ').replace(/\s+/g, ' ');
  const withoutTeacher = joined.replace(/\s*\bProf\s*\.?\s*:.*$/i, '').trim();
  const m = /^\s*\d{1,2}\s*-\s*[A-Z0-9]{1,3}\s*\((.*?)\)\s*(?:\((.*)\))?\s*$/i.exec(withoutTeacher);
  if (!m) return { subjectRaw: withoutTeacher, kindRaw: '' };
  return { subjectRaw: m[1], kindRaw: m[2] ?? '' };
}

function prettyKind(raw: string): string {
  const cleaned = raw.replace(/^\s*\+/, '').replace(/([A-Za-zÁÉÍÓÚÑáéíóúñ])(\d)/g, '$1 $2');
  return cleaned
    .split(/\s*\/\s*/)
    .map((part) => prettyLabel(part))
    .filter(Boolean)
    .join(' / ');
}

/* ---------- Celdas ---------- */

function linesOf(pieces: Piece[]): Line[] {
  const sorted = [...pieces].sort((a, b) => a.gy - b.gy || a.x - b.x);
  const lines: Line[] = [];
  for (const piece of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(last.gy - piece.gy) <= ROW_TOLERANCE) {
      const before = last.pieces[last.pieces.length - 1];
      // Trozos pegados (una ligadura «fi», «fl») son la misma palabra; con hueco, palabras distintas.
      const touching = piece.x - (before.x + before.w) < 1 && !/\s$/.test(before.str) && !/^\s/.test(piece.str);
      last.pieces.push(piece);
      last.right = Math.max(last.right, piece.x + piece.w);
      last.text = `${last.text}${touching ? '' : ' '}${piece.str.trim()}`;
    } else {
      lines.push({ x: piece.x, right: piece.x + piece.w, gy: piece.gy, pieces: [piece], text: piece.str.trim() });
    }
  }
  return lines;
}

const URLISH_TOKEN = /^[\w\-.%/?=&#~+:]+$/;
const ENDS_WITH_URL = /(?:https?:\/\/|www\.)\S*$/i;

/**
 * Los renglones de una celda en párrafos: un renglón partido por el ancho sigue en el siguiente; uno que dejaba sitio, que termina
 * en «:», o el siguiente que empieza con «-» o con otra sangría, cierra el párrafo. Un enlace partido se vuelve a unir.
 */
function paragraphsOf(lines: Line[], columnRight: number): string[] {
  const out: string[] = [];
  let current = '';
  let prev: Line | null = null;
  for (const line of lines) {
    if (prev === null) {
      current = line.text;
    } else if (ENDS_WITH_URL.test(current) && !/^https?:/i.test(line.text) && glueable(current, line.text)) {
      const [head, ...rest] = line.text.split(' ');
      current = `${current}${head}${rest.length ? ` ${rest.join(' ')}` : ''}`;
    } else {
      const hard =
        wouldFit(prev, line, columnRight) ||
        /:$/.test(prev.text) ||
        LIST_MARKER.test(line.text) ||
        Math.abs(line.x - prev.x) > 8;
      if (hard) {
        out.push(current);
        current = line.text;
      } else {
        current = `${current} ${line.text}`;
      }
    }
    prev = line;
  }
  if (prev) out.push(current);
  return out.map(cleanParagraph).filter((p) => p.length > 0);
}

const LIST_MARKER = /^(?:[-•–]|\(\w{1,3}\)\s|\d{1,2}[.)]\s)/;

/** El navegador solo parte un renglón cuando la palabra siguiente no cabe: si cabía, el salto lo puso el docente. */
function wouldFit(prev: Line, line: Line, columnRight: number): boolean {
  const firstWord = line.text.split(' ')[0];
  const perChar = (line.right - line.x) / Math.max(line.text.length, 1);
  return prev.right + perChar * (firstWord.length + 1) < columnRight - 2;
}

function glueable(current: string, next: string): boolean {
  const [head, ...rest] = next.split(' ');
  if (!URLISH_TOKEN.test(head)) return false;
  return rest.length === 0 || /[-/%=&?]$/.test(current);
}

function cleanParagraph(p: string): string {
  return p
    .replace(/\b(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/\S*/gi, ' (video en Mereb)')
    .replace(/\bhttps?:\/\/\S+/gi, ' (enlace en Mereb)')
    .replace(/\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|be|ly|io)\/\S*/gi, ' (enlace en Mereb)')
    .replace(/(\((?:video|enlace) en Mereb\))(?:\s*\1)+/g, '$1')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/:\s*:/g, ':')
    .replace(/\s+/g, ' ')
    .replace(/\s+-$/, '')
    .trim()
    .replace(/^[-–•]\s*$/, '');
}

/** Una tabla «Criterio | Puntos» dentro de la celda se resume en una línea. */
function splitRubric(lines: Line[]): { rest: Line[]; rubric: string | null } {
  const start = lines.findIndex((l) => /^criterio\s+puntos$/i.test(l.text));
  if (start < 0) return { rest: lines, rubric: null };
  const criteria: Array<{ text: string; points: string }> = [];
  let total = '';
  for (const line of lines.slice(start + 1)) {
    const pts = line.pieces.find((p, i) => i > 0 && /^\d+\s*pts?\.?$/i.test(p.str.trim()));
    const left = line.pieces
      .filter((p) => p !== pts)
      .map((p) => p.str.trim())
      .join(' ');
    if (pts && /^total$/i.test(left)) total = pts.str.trim();
    else if (pts) criteria.push({ text: left, points: pts.str.trim() });
    else if (criteria.length) criteria[criteria.length - 1].text += ` ${left}`;
  }
  const body = criteria.map((c) => `${c.text.replace(/\.$/, '')} (${c.points})`).join('; ');
  return { rest: lines.slice(0, start), rubric: criteria.length ? `Rúbrica${total ? ` (${total})` : ''}: ${body}.` : null };
}

/* ---------- Tarea propuesta ---------- */

function buildDraft(block: ReadyBlock, rights: number[]): TaskDraft | null {
  const { subjectRaw, kindRaw } = parseHeader(block.header);
  const { subject, label } = mapSubject(subjectRaw);
  const kind = prettyKind(kindRaw);

  const cells = block.columns.map((pieces, i) => {
    const { rest, rubric } = splitRubric(linesOf(pieces));
    const paragraphs = paragraphsOf(rest, rights[i]);
    return rubric ? [...paragraphs, rubric] : paragraphs;
  });
  const [tema, detalle, sugerencia] = cells;

  const { title, extra } = titleOf(tema, detalle, kind, label);
  if (!title) return null;

  const parts: string[] = [];
  if (kind) parts.push(`Tipo de actividad: ${kind}.`);
  if (extra.length) parts.push(extra.join('\n'));
  if (detalle.length) parts.push(detalle.join('\n'));
  if (sugerencia.length) parts.push(`Para estudiar en casa:\n${sugerencia.join('\n')}`);
  const attachment = attachmentNote(block.attachments);
  if (attachment) parts.push(attachment);

  return {
    key: keyOf(block.date, label, title),
    subject,
    subjectLabel: label.slice(0, 60),
    title,
    description: clip(parts.join('\n\n'), MAX_DESCRIPTION),
    dueDate: block.date,
    kind: kind.slice(0, 80),
  };
}

function titleOf(tema: string[], detalle: string[], kind: string, label: string): { title: string; extra: string[] } {
  const [firstRaw = '', ...rest] = tema;
  let first = firstRaw.replace(/[.:]$/, '').trim();
  if (!/\p{Ll}/u.test(first)) first = sentenceCase(first);

  if (!first || (GENERIC_TITLE_RE.test(first) && first.length <= 30)) {
    const base = genericBase(first, kind);
    const concepts = detalle.filter((p) => /^[-•–]/.test(p)).map((p) => lowerFirst(p.replace(/^[-•–]\s*/, '').replace(/\.$/, '')));
    if (concepts.length) return { title: clip(`${base}: ${concepts.join(', ')}`, 200), extra: rest };
    if (base) return { title: `${base} de ${label}`, extra: rest };
    return { title: '', extra: [] };
  }

  if (first.length <= MAX_TITLE) return { title: first, extra: rest };
  return { title: shorten(first), extra: [firstRaw, ...rest] };
}

/** «EJERCICIO 1-ESPAÑOL» → «Ejercicio 1»; sin tema, el tipo de evaluación («Proyecto 2»). */
function genericBase(first: string, kind: string): string {
  const m = /^(\S+(?:\s*\d+)?)/.exec(first);
  if (first && m) return sentenceCase(m[1].replace(/-$/, ''));
  return kind.split(' / ')[0] ?? '';
}

/** Un tema que es un párrafo largo: se corta en la primera pausa natural, o en una palabra completa. */
function shorten(text: string): string {
  const breaks = ['. ', ', ', ' pueden ', ' puede ', ' para ', ' con '];
  const cuts = breaks.map((b) => text.indexOf(b)).filter((i) => i >= 4 && i <= MAX_TITLE);
  if (cuts.length) return text.slice(0, Math.min(...cuts)).trim();
  return `${text.slice(0, text.lastIndexOf(' ', 80)).trim()}…`;
}

function attachmentNote(attachments: string[]): string | null {
  const names: string[] = [];
  let count = 0;
  for (const a of attachments) {
    const named = /^nombre del adjunto:\s*(.+)$/i.exec(a);
    if (named) names.push(named[1].trim());
    const counted = /^cantidad de adjuntos:\s*(\d+)/i.exec(a);
    if (counted) count += Number(counted[1]);
  }
  if (names.length) return `Adjuntos en Mereb: ${names.join(', ')}`;
  if (count > 0) return `Mereb tiene ${count} ${count === 1 ? 'adjunto' : 'adjuntos'} para esta actividad.`;
  return null;
}

function keyOf(date: IsoDate, label: string, title: string): string {
  const slug = foldText(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  const hash = createHash('sha256').update(foldText(title).replace(/\s+/g, ' ')).digest('hex').slice(0, 10);
  return `${mondayOf(date)}-${slug || 'otra'}-${hash}`;
}

function sentenceCase(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
