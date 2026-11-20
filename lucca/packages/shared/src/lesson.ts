import { z } from 'zod';
import type { Lang } from './schemas.js';

/**
 * Lección "Entender" (design D2): la IA no escribe HTML, devuelve este documento y la web lo dibuja con sus propios
 * componentes. Cada texto va en español e inglés, por fragmentos: una palabra en otro idioma se lee con su voz.
 */
export const SegmentSchema = z.strictObject({
  text: z.string().min(1).max(300),
  lang: z.enum(['es', 'en']).optional(),
});
export const BiTextSchema = z.strictObject({
  es: z.array(SegmentSchema).max(8),
  en: z.array(SegmentSchema).max(8),
});
export type BiText = z.infer<typeof BiTextSchema>;

/** Uno a tres emoji (sin letras): la ilustración de la v1, se ve igual sin red. */
const EmojiSchema = z.string().max(24);

const explain = z.strictObject({ type: z.literal('explain'), text: BiTextSchema, emoji: EmojiSchema.optional() });
const story = z.strictObject({
  type: z.literal('story'),
  panels: z.array(z.strictObject({ text: BiTextSchema, emoji: EmojiSchema })).min(2).max(4),
});
const option = z.strictObject({ text: BiTextSchema, emoji: EmojiSchema.optional() });
/** Pista que se muestra tras el primer fallo: orienta sin decir la respuesta (control de fuga en `checkLesson`). */
const hint = BiTextSchema.optional();
const choice = z.strictObject({ type: z.literal('choice'), question: BiTextSchema, options: z.array(option).min(2).max(4), correct: z.number().int(), hint });
const trueFalse = z.strictObject({ type: z.literal('trueFalse'), statement: BiTextSchema, answer: z.boolean(), hint });
const count = z.strictObject({ type: z.literal('count'), question: BiTextSchema, emoji: EmojiSchema, amount: z.number().int(), hint });
const numberLine = z.strictObject({
  type: z.literal('numberLine'),
  question: BiTextSchema,
  min: z.number().int(),
  max: z.number().int(),
  answer: z.number().int(),
});
const order = z.strictObject({ type: z.literal('order'), question: BiTextSchema, items: z.array(BiTextSchema).min(3).max(5) });
const match = z.strictObject({
  type: z.literal('match'),
  question: BiTextSchema,
  pairs: z.array(z.strictObject({ left: BiTextSchema, right: BiTextSchema })).min(2).max(4),
});
/** `sentence` lleva "___" donde va la palabra que falta. */
const fillWord = z.strictObject({ type: z.literal('fillWord'), sentence: BiTextSchema, options: z.array(BiTextSchema).min(2).max(4), correct: z.number().int(), hint });
const sort = z.strictObject({
  type: z.literal('sort'),
  question: BiTextSchema,
  groups: z.array(BiTextSchema).length(2),
  items: z.array(z.strictObject({ text: BiTextSchema, emoji: EmojiSchema.optional(), group: z.number().int() })).min(3).max(6),
});

export const BlockSchema = z.discriminatedUnion('type', [explain, story, choice, trueFalse, count, numberLine, order, match, fillWord, sort]);
export type Block = z.infer<typeof BlockSchema>;
export const QuizBlockSchema = z.discriminatedUnion('type', [choice, trueFalse, count, fillWord]);
export type QuizBlock = z.infer<typeof QuizBlockSchema>;
export const BLOCK_TYPES = ['explain', 'story', 'choice', 'trueFalse', 'count', 'numberLine', 'order', 'match', 'fillWord', 'sort'] as const;

export const LessonDocSchema = z.strictObject({
  title: BiTextSchema,
  screens: z.array(z.strictObject({ blocks: z.array(BlockSchema).min(1).max(2) })).min(1).max(8),
  quiz: z.array(QuizBlockSchema).min(1).max(4),
});
export type LessonDoc = z.infer<typeof LessonDocSchema>;

/** Texto de un solo fragmento por idioma (para lecciones grabadas y de respaldo). */
export const bi = (es: string, en: string): BiText => ({ es: [{ text: es }], en: [{ text: en }] });
export const lessonText = (t: BiText, lang: Lang): string => t[lang].map((s) => s.text).join('');

/** Palabras de cada frase (separadas por . ! ?). Los signos sueltos (¿ ¡ —) no cuentan como palabras. */
export function sentenceWords(text: string): number[] {
  return text
    .split(/[.!?…]+/)
    .map((s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length)
    .filter((n) => n > 0);
}

const MAX_WORDS = 12;
const URL_RE = /(https?:\/\/|www\.|\b[\w-]+\.(com|org|net|io|edu|gov|es|pa|ly|co)\b)/i;
const EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}‍️]{1,24}$/u;

/** Todos los textos bilingües de un bloque, con su nombre para los mensajes. */
function textsOf(block: Block): BiText[] {
  switch (block.type) {
    case 'explain':
      return [block.text];
    case 'story':
      return block.panels.map((p) => p.text);
    case 'choice':
      return [block.question, ...block.options.map((o) => o.text), ...(block.hint ? [block.hint] : [])];
    case 'trueFalse':
      return [block.statement, ...(block.hint ? [block.hint] : [])];
    case 'count':
      return [block.question, ...(block.hint ? [block.hint] : [])];
    case 'numberLine':
      return [block.question];
    case 'order':
      return [block.question, ...block.items];
    case 'match':
      return [block.question, ...block.pairs.flatMap((p) => [p.left, p.right])];
    case 'fillWord':
      return [block.sentence, ...block.options, ...(block.hint ? [block.hint] : [])];
    case 'sort':
      return [block.question, ...block.groups, ...block.items.map((i) => i.text)];
  }
}
function emojisOf(block: Block): string[] {
  switch (block.type) {
    case 'explain':
      return block.emoji ? [block.emoji] : [];
    case 'story':
      return block.panels.map((p) => p.emoji);
    case 'choice':
      return block.options.flatMap((o) => (o.emoji ? [o.emoji] : []));
    case 'count':
      return [block.emoji];
    case 'sort':
      return block.items.flatMap((i) => (i.emoji ? [i.emoji] : []));
    default:
      return [];
  }
}

/** Minúsculas, sin acentos ni signos: para buscar la respuesta dentro de una pista. */
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const NUMBER_WORDS: Record<Lang, string[]> = {
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
};
/** Quita los artículos al principio: «la raíz» se reconoce también como «raíz». */
const core = (s: string): string => normalize(s).replace(/^(el|la|los|las|un|una|the|a|an) /, '');
const containsWord = (text: string, word: string): boolean => word !== '' && ` ${normalize(text)} `.includes(` ${word} `);

/** Formas de la respuesta correcta que una pista no puede contener, por idioma. */
function answerForms(block: Block, lang: Lang): string[] {
  switch (block.type) {
    case 'choice':
      return [core(lessonText(block.options[block.correct]?.text ?? { es: [], en: [] }, lang))];
    case 'fillWord':
      return [core(lessonText(block.options[block.correct] ?? { es: [], en: [] }, lang))];
    case 'count':
      return [String(block.amount), NUMBER_WORDS[lang][block.amount] ?? ''];
    case 'trueFalse':
      return lang === 'es' ? ['verdadero', 'falso', 'cierto', 'mentira'] : ['true', 'false'];
    default:
      return [];
  }
}

function checkBlock(block: Block, where: string, issues: string[]): void {
  const hintText = 'hint' in block ? block.hint : undefined;
  if (hintText) {
    for (const lang of ['es', 'en'] as const) {
      if (answerForms(block, lang).some((form) => containsWord(lessonText(hintText, lang), form)))
        issues.push(`${where}: la pista revela la respuesta (${lang === 'es' ? 'español' : 'inglés'})`);
    }
  }
  const dupes = (list: BiText[]) => new Set(list.map((t) => lessonText(t, 'es').trim().toLowerCase())).size !== list.length;
  switch (block.type) {
    case 'choice':
    case 'fillWord': {
      const options = block.type === 'choice' ? block.options.map((o) => o.text) : block.options;
      if (block.correct < 0 || block.correct >= options.length) issues.push(`${where}: la respuesta correcta no está entre las opciones`);
      if (dupes(options)) issues.push(`${where}: hay opciones repetidas`);
      if (block.type === 'fillWord' && (!lessonText(block.sentence, 'es').includes('___') || !lessonText(block.sentence, 'en').includes('___')))
        issues.push(`${where}: la frase para completar debe llevar ___ en los dos idiomas`);
      break;
    }
    case 'count':
      if (block.amount < 1 || block.amount > 20) issues.push(`${where}: para contar, la cantidad va de 1 a 20`);
      break;
    case 'numberLine':
      if (block.max <= block.min || block.max - block.min > 20 || block.answer < block.min || block.answer > block.max)
        issues.push(`${where}: la recta numérica debe tener como mucho 20 pasos y contener la respuesta`);
      break;
    case 'order':
      if (dupes(block.items)) issues.push(`${where}: hay pasos repetidos`);
      break;
    case 'match':
      if (dupes(block.pairs.map((p) => p.left)) || dupes(block.pairs.map((p) => p.right))) issues.push(`${where}: hay parejas repetidas`);
      break;
    case 'sort':
      if (block.items.some((i) => i.group !== 0 && i.group !== 1)) issues.push(`${where}: cada elemento va al grupo 0 o 1`);
      else if (!block.items.some((i) => i.group === 0) || !block.items.some((i) => i.group === 1)) issues.push(`${where}: cada grupo necesita al menos un elemento`);
      break;
  }
}

/**
 * Controles deterministas (design D6) que el esquema no puede expresar. Devuelve los problemas en español; vacío = se
 * puede mostrar. Se aplican siempre, venga la lección de la IA, grabada o de respaldo.
 */
export function checkLesson(doc: LessonDoc): string[] {
  const issues: string[] = [];
  if (doc.screens.length < 4 || doc.screens.length > 6) issues.push(`la lección debe tener entre 4 y 6 pantallas (tiene ${doc.screens.length})`);
  if (doc.quiz.length < 2 || doc.quiz.length > 3) issues.push(`la lección debe terminar con 2 o 3 preguntas (tiene ${doc.quiz.length})`);
  const all: [string, BiText][] = [['título', doc.title]];
  doc.screens.forEach((s, i) =>
    s.blocks.forEach((b, j) => {
      const where = `pantalla ${i + 1}, bloque ${j + 1} (${b.type})`;
      checkBlock(b, where, issues);
      textsOf(b).forEach((t) => all.push([where, t]));
      for (const e of emojisOf(b)) if (!EMOJI_RE.test(e)) issues.push(`${where}: la ilustración debe ser solo emoji («${e.slice(0, 20)}»)`);
    }),
  );
  doc.quiz.forEach((b, i) => {
    const where = `pregunta ${i + 1} (${b.type})`;
    checkBlock(b, where, issues);
    textsOf(b).forEach((t) => all.push([where, t]));
    for (const e of emojisOf(b)) if (!EMOJI_RE.test(e)) issues.push(`${where}: la ilustración debe ser solo emoji («${e.slice(0, 20)}»)`);
  });
  for (const [where, t] of all) {
    for (const lang of ['es', 'en'] as const) {
      const text = lessonText(t, lang);
      if (!text.trim()) {
        issues.push(`${where}: falta el texto en ${lang === 'es' ? 'español' : 'inglés'}`);
        continue;
      }
      if (URL_RE.test(text)) issues.push(`${where}: no puede llevar enlaces («${text.slice(0, 40)}»)`);
      // El título es el de la tarea (puede venir largo del colegio): no es una frase de la explicación.
      const longest = where === 'título' ? 0 : Math.max(...sentenceWords(text));
      if (longest > MAX_WORDS) issues.push(`${where}: una frase tiene más de ${MAX_WORDS} palabras («${text.slice(0, 50)}…»)`);
    }
  }
  return [...new Set(issues)];
}

/** Controles de un bloque suelto (los retos de Practicar): los mismos que dentro de una lección. */
export function checkPracticeBlock(block: Block): string[] {
  const issues: string[] = [];
  const where = `reto (${block.type})`;
  checkBlock(block, where, issues);
  for (const e of emojisOf(block)) if (!EMOJI_RE.test(e)) issues.push(`${where}: la ilustración debe ser solo emoji`);
  for (const t of textsOf(block)) {
    for (const lang of ['es', 'en'] as const) {
      const text = lessonText(t, lang);
      if (!text.trim()) issues.push(`${where}: falta el texto en ${lang === 'es' ? 'español' : 'inglés'}`);
      else if (URL_RE.test(text)) issues.push(`${where}: no puede llevar enlaces`);
      else if (Math.max(...sentenceWords(text)) > MAX_WORDS) issues.push(`${where}: una frase tiene más de ${MAX_WORDS} palabras`);
    }
  }
  return issues;
}

