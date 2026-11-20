import { bi, type Block, type LessonDoc } from './lesson.js';

export { checkPracticeBlock } from './lesson.js';

/**
 * «Practicar»: sesiones cortas de retos con dificultad que se adapta (dos aciertos seguidos suben un nivel, dos fallos
 * bajan uno) y sin quitar nada por equivocarse. Los retos salen de un generador (sumas y restas) o de las lecciones.
 */
export type Level = 1 | 2 | 3;
export interface PracticeItem {
  id: string;
  level: Level;
  block: Block;
}
export const SESSION_LENGTH = 6;
export interface AdaptState {
  level: Level;
  right: number;
  wrong: number;
}
export const START: AdaptState = { level: 1, right: 0, wrong: 0 };

export function adapt(s: AdaptState, correct: boolean): AdaptState {
  if (correct) {
    const right = s.right + 1;
    return right >= 2 ? { level: Math.min(3, s.level + 1) as Level, right: 0, wrong: 0 } : { level: s.level, right, wrong: 0 };
  }
  const wrong = s.wrong + 1;
  return wrong >= 2 ? { level: Math.max(1, s.level - 1) as Level, right: 0, wrong: 0 } : { level: s.level, right: 0, wrong };
}

/** Juegos sencillos (nivel 1), de elegir (2) y de ordenar o relacionar (3). */
export function levelOf(block: Block): Level {
  if (block.type === 'trueFalse' || block.type === 'count') return 1;
  if (block.type === 'order' || block.type === 'match' || block.type === 'numberLine') return 3;
  return 2;
}

const PRACTICE_TYPES = new Set(['choice', 'trueFalse', 'count', 'fillWord', 'numberLine', 'order', 'match', 'sort']);

/** Retos a partir de las lecciones guardadas: sus actividades y sus preguntas (sin las explicaciones). */
export function lessonBank(docs: LessonDoc[]): PracticeItem[] {
  const out: PracticeItem[] = [];
  docs.forEach((doc, d) => {
    doc.screens.forEach((screen, i) =>
      screen.blocks.forEach((block, j) => {
        if (PRACTICE_TYPES.has(block.type)) out.push({ id: `l${d}-s${i}-${j}`, level: levelOf(block), block });
      }),
    );
    doc.quiz.forEach((block, i) => out.push({ id: `l${d}-q${i}`, level: levelOf(block), block }));
  });
  return out;
}

export function mathKind(title: string, description: string): 'add' | 'sub' | null {
  const text = `${title} ${description}`.toLowerCase();
  if (/\bresta|restar|subtract|minus/.test(text)) return 'sub';
  if (/\bsuma|sumar|addition|\bplus\b/.test(text)) return 'add';
  return null;
}

function rng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let x = h;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sumas y restas por niveles, para 2.º grado. Nivel 1: hasta 10 (con recta numérica). Nivel 2: dos cifras sin llevar.
 * Nivel 3: con llevadas (o, si la tarea dice «sin llevar», números más grandes sin llevar).
 */
export function mathBank(kind: 'add' | 'sub', seed: string, noCarry: boolean): PracticeItem[] {
  const rand = rng(`${kind}:${seed}`);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const opWord = kind === 'add' ? ['más', 'plus'] : ['menos', 'minus'];
  const pair = (level: Level): [number, number] => {
    for (;;) {
      if (kind === 'add') {
        if (level === 1) {
          const a = int(1, 9);
          const b = int(1, 10 - a);
          if (a + b <= 10) return [a, b];
        } else {
          const a = int(11, 69);
          const b = int(level === 2 ? 2 : 5, 29);
          const carry = (a % 10) + (b % 10) >= 10;
          if (a + b < 100 && carry === (level === 3)) return [a, b];
        }
      } else if (level === 1) {
        const a = int(3, 9);
        return [a, int(1, a - 1)];
      } else {
        const a = int(level === 2 ? 12 : 31, 99);
        const b = level === 2 ? int(1, 9) : int(11, a - 1);
        const borrow = a % 10 < b % 10;
        if (b < a && (level === 2 || noCarry ? !borrow : borrow)) return [a, b];
      }
    }
  };
  const options = (value: number, level: Level) => {
    const near = level === 1 ? [value + 1, value - 1, value + 2] : [value + 10, value - 10, value + 1, value - 1];
    const wrong = [...new Set(near.filter((n) => n >= 0 && n !== value))].slice(0, 2);
    const all = [value, ...wrong];
    const shift = int(0, all.length - 1);
    const rotated = [...all.slice(shift), ...all.slice(0, shift)];
    return { list: rotated, correct: rotated.indexOf(value) };
  };
  const items: PracticeItem[] = [];
  for (const level of [1, 2, 3] as Level[]) {
    const kinds = level === 1 ? ['numberLine', 'choice', 'trueFalse'] : ['choice', 'fillWord', 'trueFalse'];
    for (let i = 0; i < 10; i++) {
      const [a, b] = pair(level);
      const value = kind === 'add' ? a + b : a - b;
      const es = `${a} ${opWord[0]} ${b}`;
      const en = `${a} ${opWord[1]} ${b}`;
      const type = kinds[i % kinds.length];
      let block: Block;
      if (type === 'numberLine') {
        block = { type: 'numberLine', question: bi(`¿Dónde cae ${es}?`, `Where does ${en} land?`), min: 0, max: 10, answer: value };
      } else if (type === 'choice') {
        const o = options(value, level);
        block = { type: 'choice', question: bi(`¿Cuánto es ${es}?`, `What is ${en}?`), options: o.list.map((n) => ({ text: bi(String(n), String(n)) })), correct: o.correct };
      } else if (type === 'fillWord') {
        const o = options(value, level);
        block = { type: 'fillWord', sentence: bi(`${es} = ___`, `${en} = ___`), options: o.list.map((n) => bi(String(n), String(n))), correct: o.correct };
      } else {
        const truthful = rand() < 0.5;
        const shown = truthful ? value : value + (rand() < 0.5 ? 1 : level === 1 ? 2 : 10);
        block = { type: 'trueFalse', statement: bi(`${es} = ${shown}`, `${en} = ${shown}`), answer: truthful };
      }
      items.push({ id: `${kind}-${level}-${i}`, level, block });
    }
  }
  return items;
}

/**
 * El siguiente reto: uno sin usar del nivel pedido y, si se puede, de otro tipo de juego que el anterior. Si no queda,
 * del nivel más cercano; y solo si ya se usaron todos, se repite uno.
 */
export function pickItem(bank: readonly PracticeItem[], level: Level, used: ReadonlySet<string>, lastType?: string): PracticeItem | null {
  if (bank.length === 0) return null;
  const fresh = bank.filter((i) => !used.has(i.id));
  const byDistance = [0, 1, 2].flatMap((d) => [level - d, level + d]).filter((l, i, arr) => l >= 1 && l <= 3 && arr.indexOf(l) === i);
  for (const l of byDistance) {
    const atLevel = fresh.filter((i) => i.level === l);
    const varied = atLevel.find((i) => i.block.type !== lastType);
    if (varied ?? atLevel[0]) return varied ?? atLevel[0];
  }
  return bank.find((i) => i.block.type !== lastType) ?? bank[0];
}
