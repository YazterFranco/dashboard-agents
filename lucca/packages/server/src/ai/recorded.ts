import { bi, type BiText, type Block, type LessonDoc, type QuizBlock, type Subject } from '@lucca/shared';
import type { LessonModel, LessonRequest, ModelResult } from './generate.js';

// Lecciones grabadas: sirven para la demo (LUCCA_DEMO=1 con LUCCA_AI=recorded) y para todas las pruebas, sin red ni
// coste. Están escritas a mano con las mismas reglas que se piden a la IA (frases cortas, dos idiomas, 4–6 pantallas).

type Pair = [string, string];
const t = ([es, en]: Pair): BiText => bi(es, en);
/** Texto en español con una palabra en inglés (se lee con la voz inglesa). */
const mixed = (before: string, word: string, after: string, en: string): BiText => ({
  es: [{ text: before }, { text: word, lang: 'en' as const }, { text: after }].filter((s) => s.text !== ''),
  en: [{ text: en }],
});

const ex = (es: string, en: string, emoji?: string): Block => ({ type: 'explain', text: bi(es, en), ...(emoji ? { emoji } : {}) });
const story = (...panels: [string, string, string][]): Block => ({ type: 'story', panels: panels.map(([es, en, emoji]) => ({ text: bi(es, en), emoji })) });
const count = (es: string, en: string, emoji: string, amount: number): Block & QuizBlock => ({ type: 'count', question: bi(es, en), emoji, amount });
const line = (es: string, en: string, min: number, max: number, answer: number): Block => ({ type: 'numberLine', question: bi(es, en), min, max, answer });
const order = (es: string, en: string, ...items: Pair[]): Block => ({ type: 'order', question: bi(es, en), items: items.map(t) });
const match = (es: string, en: string, ...pairs: [Pair, Pair][]): Block => ({ type: 'match', question: bi(es, en), pairs: pairs.map(([l, r]) => ({ left: t(l), right: t(r) })) });
const sort = (es: string, en: string, g0: Pair, g1: Pair, ...items: [string, string, 0 | 1, string?][]): Block => ({
  type: 'sort',
  question: bi(es, en),
  groups: [t(g0), t(g1)],
  items: items.map(([ies, ien, group, emoji]) => ({ text: bi(ies, ien), group, ...(emoji ? { emoji } : {}) })),
});
const choice = (es: string, en: string, correct: number, ...options: [string, string, string?][]): Block & QuizBlock => ({
  type: 'choice',
  question: bi(es, en),
  options: options.map(([oes, oen, emoji]) => ({ text: bi(oes, oen), ...(emoji ? { emoji } : {}) })),
  correct,
});
const tf = (es: string, en: string, answer: boolean): QuizBlock => ({ type: 'trueFalse', statement: bi(es, en), answer });
const fill = (es: string, en: string, correct: number, ...options: Pair[]): QuizBlock => ({ type: 'fillWord', sentence: bi(es, en), options: options.map(t), correct });
const lesson = (title: Pair, screens: Block[][], quiz: QuizBlock[]): LessonDoc => ({ title: t(title), screens: screens.map((blocks) => ({ blocks })), quiz });

interface Recorded {
  match: RegExp;
  default: LessonDoc;
  alternative?: LessonDoc;
}

const RECORDED: Recorded[] = [
  {
    match: /planta|plant/i,
    default: lesson(
      ['Las partes de la planta', 'The parts of a plant'],
      [
        [ex('Una planta es un ser vivo. ¡Crece como tú!', 'A plant is alive. It grows like you!', '🌱')],
        [ex('La raíz está bajo la tierra. Bebe agua.', 'The root is under the soil. It drinks water.', '💧')],
        [ex('El tallo sube el agua a las hojas.', 'The stem carries water up to the leaves.', '🌿')],
        [ex('Las hojas toman la luz del sol.', 'The leaves take in sunlight.', '☀️'), count('¿Cuántas hojas ves?', 'How many leaves do you see?', '🍃', 4)],
        [ex('La flor hace las semillas.', 'The flower makes the seeds.', '🌸')],
        [order('Ordena de abajo hacia arriba.', 'Order from bottom to top.', ['Raíz', 'Root'], ['Tallo', 'Stem'], ['Hojas', 'Leaves'], ['Flor', 'Flower'])],
      ],
      [
        choice('¿Qué parte bebe agua?', 'Which part drinks water?', 0, ['La raíz', 'The root', '🥕'], ['La flor', 'The flower', '🌸'], ['Las hojas', 'The leaves', '🍃']),
        tf('Las hojas toman la luz del sol.', 'Leaves take in sunlight.', true),
        fill('La flor hace las ___.', 'The flower makes the ___.', 1, ['piedras', 'stones'], ['semillas', 'seeds']),
      ],
    ),
    alternative: lesson(
      ['Las partes de la planta', 'The parts of a plant'],
      [
        [story(['Imagina que la planta es una casa.', 'Imagine the plant is a house.', '🏠'], ['La raíz es el sótano con agua.', 'The root is the basement with water.', '💧'], ['El tallo es la escalera.', 'The stem is the staircase.', '🪜'])],
        [ex('Las hojas son las ventanas al sol.', 'The leaves are windows to the sun.', '🪟')],
        [ex('La flor es el jardín de arriba.', 'The flower is the garden on top.', '🌸')],
        [match('Une cada parte con su trabajo.', 'Match each part with its job.', [['Raíz', 'Root'], ['Bebe agua', 'Drinks water']], [['Hojas', 'Leaves'], ['Toman sol', 'Take in sun']], [['Flor', 'Flower'], ['Hace semillas', 'Makes seeds']])],
      ],
      [
        choice('¿Qué parte es como la escalera?', 'Which part is like the staircase?', 1, ['La flor', 'The flower', '🌸'], ['El tallo', 'The stem', '🌿']),
        tf('La raíz está en el techo.', 'The root is on the roof.', false),
      ],
    ),
  },
  {
    match: /resta|subtract/i,
    default: lesson(
      ['Restas sin llevar', 'Subtraction'],
      [
        [ex('Restar es quitar. ¡Al final quedan menos!', 'To subtract is to take away. You end with fewer!', '➖')],
        [story(['Tienes 5 manzanas.', 'You have 5 apples.', '🍎🍎🍎🍎🍎'], ['Te comes 2.', 'You eat 2.', '😋'], ['Te quedan 3.', 'You have 3 left.', '🍎🍎🍎'])],
        [count('¿Cuántas estrellas quedan si quito una de cuatro?', 'How many stars are left if I take one of four?', '⭐', 3)],
        [ex('Con números grandes, resta primero las unidades.', 'With big numbers, subtract the ones first.', '🔢'), ex('Después resta las decenas.', 'Then subtract the tens.', '🔟')],
        [line('Salta hacia atrás: 9 menos 4.', 'Jump back: 9 minus 4.', 0, 10, 5)],
      ],
      [
        choice('¿Cuánto es 8 menos 3?', 'What is 8 minus 3?', 2, ['4', '4'], ['6', '6'], ['5', '5']),
        tf('Al restar, el número se hace más pequeño.', 'When you subtract, the number gets smaller.', true),
        count('¿Cuántos globos quedan de 6 si vuelan 2?', 'How many balloons are left of 6 if 2 fly away?', '🎈', 4),
      ],
    ),
    alternative: lesson(
      ['Restas sin llevar', 'Subtraction'],
      [
        [ex('Piensa en tus juguetes en una caja.', 'Think of your toys in a box.', '🧸')],
        [story(['En la caja hay 7 carritos.', 'There are 7 toy cars in the box.', '🚗'], ['Le prestas 3 a un amigo.', 'You lend 3 to a friend.', '🤝'], ['En la caja quedan 4.', '4 are left in the box.', '📦'])],
        [line('Empieza en 7 y salta 3 hacia atrás.', 'Start at 7 and jump back 3.', 0, 10, 4)],
        [ex('Tus dedos también sirven para restar.', 'Your fingers can help you subtract too.', '✋')],
      ],
      [
        choice('Tienes 6 lápices y regalas 1. ¿Cuántos quedan?', 'You have 6 pencils and give 1 away. How many are left?', 0, ['5', '5'], ['7', '7']),
        tf('Restar es quitar.', 'Subtracting is taking away.', true),
      ],
    ),
  },
  {
    match: /suma|addition|carry/i,
    default: lesson(
      ['Sumas con llevadas', 'Addition with carrying'],
      [
        [ex('Sumar es juntar cosas. ¡Al final hay más!', 'To add is to put things together. You end with more!', '➕')],
        [ex('Primero suma las unidades, la columna de la derecha.', 'First add the ones, the right column.', '👉')],
        [ex('Si llegas a 10 o más, llevas una decena.', 'If you reach 10 or more, carry a ten.', '🔟')],
        [story(['7 más 5 son 12.', '7 plus 5 is 12.', '🧮'], ['Escribe el 2 abajo.', 'Write the 2 below.', '✏️'], ['Lleva el 1 a las decenas.', 'Carry the 1 to the tens.', '☝️'])],
        [line('¿Dónde cae 8 más 4?', 'Where does 8 plus 4 land?', 0, 20, 12)],
      ],
      [
        choice('¿Cuánto es 9 más 3?', 'What is 9 plus 3?', 1, ['11', '11'], ['12', '12'], ['13', '13']),
        tf('Si las unidades suman 10 o más, llevo una.', 'If the ones add up to 10 or more, I carry one.', true),
      ],
    ),
  },
  {
    match: /\bcat\b|\bhat\b|\bbat\b/i,
    default: lesson(
      ['Palabras: cat, hat, bat', 'Words: cat, hat, bat'],
      [
        [{ type: 'explain', text: mixed('Hoy aprendemos palabras que terminan en ', '-at', '.', 'Today we learn words that end in -at.'), emoji: '🔤' }],
        [{ type: 'explain', text: mixed('', 'Cat', ' es gato.', 'Cat is a pet that says meow.'), emoji: '🐱' }],
        [{ type: 'explain', text: mixed('', 'Hat', ' es sombrero.', 'A hat goes on your head.'), emoji: '🎩' }],
        [{ type: 'explain', text: mixed('', 'Bat', ' es murciélago.', 'A bat flies at night.'), emoji: '🦇' }],
        [match('Une cada palabra con su dibujo.', 'Match each word with its picture.', [['cat', 'cat'], ['🐱 gato', '🐱 cat']], [['hat', 'hat'], ['🎩 sombrero', '🎩 hat']], [['bat', 'bat'], ['🦇 murciélago', '🦇 bat']])],
      ],
      [
        choice('¿Cuál es el gato?', 'Which one is the cat?', 0, ['cat', 'cat', '🐱'], ['hat', 'hat', '🎩'], ['bat', 'bat', '🦇']),
        fill('El sombrero es h___.', 'A hat is h___.', 0, ['at', 'at'], ['op', 'op']),
        tf('Cat, hat y bat riman.', 'Cat, hat and bat rhyme.', true),
      ],
    ),
  },
  {
    match: /my pet|mascota/i,
    default: lesson(
      ['Lectura: My Pet', 'Reading: My Pet'],
      [
        [{ type: 'explain', text: mixed('', 'Pet', ' quiere decir mascota.', 'A pet is an animal that lives with you.'), emoji: '🐾' }],
        [{ type: 'explain', text: mixed('', 'Dog', ' es perro.', 'A dog says woof.'), emoji: '🐶' }],
        [{ type: 'explain', text: mixed('', 'Fish', ' es pez.', 'A fish swims in water.'), emoji: '🐟' }],
        [sort('¿Vive en el agua o en la tierra?', 'Does it live in water or on land?', ['Agua', 'Water'], ['Tierra', 'Land'], ['Pez', 'Fish', 0, '🐟'], ['Perro', 'Dog', 1, '🐶'], ['Gato', 'Cat', 1, '🐱'], ['Tortuga marina', 'Sea turtle', 0, '🐢'])],
      ],
      [
        choice('¿Qué es dog?', 'Which one is a dog?', 1, ['Gato', 'Cat', '🐱'], ['Perro', 'Dog', '🐶']),
        tf('Un pez vive en el agua.', 'A fish lives in water.', true),
      ],
    ),
  },
  {
    match: /semilla|seed/i,
    default: lesson(
      ['La semilla mágica', 'The Magic Seed'],
      [
        [ex('Todo cuento tiene inicio, medio y final.', 'Every story has a beginning, middle and end.', '📖')],
        [story(['Inicio: alguien encuentra una semilla.', 'Beginning: someone finds a seed.', '🌰'], ['Medio: la semilla crece y crece.', 'Middle: the seed grows and grows.', '🌱'], ['Final: ¿qué pasa al final?', 'End: what happens at the end?', '❓'])],
        [ex('Tú vas a dibujar el final.', 'You will draw the ending.', '🖍️')],
        [order('Ordena el cuento.', 'Put the story in order.', ['Encuentra la semilla', 'Finds the seed'], ['La planta', 'Plants it'], ['Crece un árbol', 'A tree grows'])],
      ],
      [
        choice('¿Qué parte del cuento vas a dibujar?', 'Which part of the story will you draw?', 2, ['El inicio', 'The beginning'], ['El medio', 'The middle'], ['El final', 'The end']),
        tf('Un cuento tiene inicio, medio y final.', 'A story has a beginning, middle and end.', true),
      ],
    ),
  },
  {
    match: /moneda|coin/i,
    default: lesson(
      ['Problemas con monedas', 'Problems with coins'],
      [
        [ex('Las monedas sirven para comprar cosas.', 'Coins are used to buy things.', '🪙')],
        [ex('Para saber cuánto tienes, suma las monedas.', 'To know how much you have, add the coins.', '➕')],
        [count('¿Cuántas monedas hay?', 'How many coins are there?', '🪙', 6)],
        [story(['Tienes 5 centavos.', 'You have 5 cents.', '🪙'], ['Te dan 5 más.', 'You get 5 more.', '🤲'], ['Ahora tienes 10 centavos.', 'Now you have 10 cents.', '😀'])],
      ],
      [
        choice('¿Cuánto es 5 centavos más 5 centavos?', 'What is 5 cents plus 5 cents?', 0, ['10 centavos', '10 cents'], ['15 centavos', '15 cents']),
        tf('Para saber cuánto dinero tengo, sumo.', 'To know how much money I have, I add.', true),
      ],
    ),
  },
  {
    match: /hoja|leaf/i,
    default: lesson(
      ['Traer una hoja del jardín', 'Bring a leaf from the garden'],
      [
        [ex('Las hojas son parte de las plantas.', 'Leaves are part of plants.', '🍃')],
        [ex('Hay hojas grandes, pequeñas, lisas y con bordes.', 'Leaves can be big, small, smooth or jagged.', '🌿')],
        [ex('Toma una hoja que ya esté en el suelo.', 'Pick a leaf that is already on the ground.', '🍂')],
        [sort('¿Es una hoja o no?', 'Is it a leaf or not?', ['Hoja', 'Leaf'], ['No es hoja', 'Not a leaf'], ['Hoja de mango', 'Mango leaf', 0, '🍃'], ['Piedra', 'Stone', 1, '🪨'], ['Hoja seca', 'Dry leaf', 0, '🍂'], ['Botón', 'Button', 1, '🔘'])],
      ],
      [
        tf('Es mejor tomar hojas del suelo.', 'It is better to pick leaves from the ground.', true),
        choice('¿Dónde van las hojas?', 'Where are leaves found?', 0, ['En las plantas', 'On plants', '🌳'], ['En los carros', 'On cars', '🚗']),
      ],
    ),
  },
  {
    match: /familia|family/i,
    default: lesson(
      ['Dibujo de mi familia', 'A drawing of my family'],
      [
        [ex('Vas a dibujar a tu familia. ¡Qué divertido!', 'You will draw your family. How fun!', '🎨')],
        [ex('Primero piensa quiénes viven contigo.', 'First think about who lives with you.', '🏠')],
        [ex('Dibuja las cabezas como círculos.', 'Draw the heads as circles.', '⭕'), ex('Después agrega cuerpo, brazos y piernas.', 'Then add body, arms and legs.', '🧍')],
        [order('Ordena cómo se dibuja.', 'Order how to draw it.', ['Pensar en la familia', 'Think of the family'], ['Dibujar cabezas', 'Draw heads'], ['Dibujar cuerpos', 'Draw bodies'], ['Colorear', 'Color it'])],
      ],
      [
        choice('¿Qué figura sirve para la cabeza?', 'Which shape works for the head?', 0, ['Un círculo', 'A circle', '⭕'], ['Un triángulo', 'A triangle', '🔺']),
        tf('Coloreo al final.', 'I color at the end.', true),
      ],
    ),
  },
  {
    match: /dictado|\bll\b|“ll”/i,
    default: lesson(
      ['Dictado de palabras con ll', 'Dictation: words with ll'],
      [
        [ex('La ll suena como en lluvia.', 'The Spanish ll sounds like in lluvia (rain).', '🌧️')],
        [ex('Llave, pollo y silla llevan ll.', 'Llave, pollo and silla have ll.', '🔑')],
        [ex('Escucha bien cada palabra antes de escribir.', 'Listen well to each word before writing.', '👂')],
        [sort('¿Lleva ll o no?', 'Does it have ll or not?', ['Con ll', 'With ll'], ['Sin ll', 'Without ll'], ['Silla', 'Silla', 0, '🪑'], ['Mesa', 'Mesa', 1], ['Pollo', 'Pollo', 0, '🐔'], ['Gato', 'Gato', 1, '🐱'])],
      ],
      [
        fill('La ___ave abre la puerta.', 'The ___ave opens the door (llave).', 0, ['ll', 'll'], ['y', 'y']),
        tf('Pollo se escribe con ll.', 'Pollo is written with ll.', true),
      ],
    ),
  },
];

/** Lección general por materia, para tareas que no tienen una grabada. */
function generic(subject: Subject, title: string, titleEn: string, alternative: boolean): LessonDoc {
  const name: Record<Subject, Pair> = {
    math: ['Matemáticas', 'Math'],
    spanish: ['Español', 'Spanish'],
    english: ['Inglés', 'English'],
    science: ['Ciencias', 'Science'],
    social: ['Sociales', 'Social studies'],
    art: ['Arte', 'Art'],
    music: ['Música', 'Music'],
    pe: ['Educación física', 'PE'],
    religion: ['Religión', 'Religion'],
    other: ['Tarea', 'Homework'],
  };
  const [es, en] = name[subject];
  const screens: Block[][] = alternative
    ? [
        [story(['Imagina que eres un explorador.', 'Imagine you are an explorer.', '🧭'], ['Tu misión es esta tarea.', 'Your mission is this homework.', '🗺️'], ['¡Vamos a resolverla juntos!', "Let's solve it together!", '🤝'])],
        [ex('Los exploradores miran todo con calma.', 'Explorers look at everything calmly.', '🔎')],
        [ex('Si algo es difícil, prueban otro camino.', 'If something is hard, they try another way.', '🔀')],
        [order('Ordena la misión.', 'Order the mission.', ['Mirar', 'Look'], ['Pensar', 'Think'], ['Hacer', 'Do'])],
      ]
    : [
        [ex(`Hoy trabajamos en ${es}.`, `Today we work on ${en}.`, '📚')],
        [ex('Lee la tarea despacio, palabra por palabra.', 'Read the homework slowly, word by word.', '👀')],
        [ex('Piensa qué te piden hacer.', 'Think about what you need to do.', '💭')],
        [order('Ordena los pasos.', 'Put the steps in order.', ['Leer', 'Read'], ['Pensar', 'Think'], ['Hacer', 'Do'], ['Revisar', 'Check'])],
      ];
  return lesson([title, titleEn || title], screens, [
    tf('Revisar mi trabajo me ayuda.', 'Checking my work helps me.', true),
    choice('¿Qué hago primero?', 'What do I do first?', 0, ['Leer la tarea', 'Read the homework', '👀'], ['Guardar el cuaderno', 'Put the notebook away', '🎒']),
  ]);
}

export const RECORDED_KEYS = RECORDED.map((r) => r.match.source);
const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** «IA» grabada: devuelve lecciones escritas a mano, sin red ni coste (LUCCA_AI=recorded y pruebas). */
export class RecordedLessonModel implements LessonModel {
  async generate(req: LessonRequest): Promise<ModelResult> {
    const { subject, title, titleEn } = req.task;
    const found = RECORDED.find((r) => r.match.test(title) || (titleEn && r.match.test(titleEn)));
    const alt = req.variant === 'alternative';
    const doc = found ? (alt ? (found.alternative ?? generic(subject, title, titleEn, true)) : found.default) : generic(subject, title, titleEn, alt);
    return { kind: 'ok', doc: structuredClone(doc), usage: { ...NO_USAGE } };
  }
}
