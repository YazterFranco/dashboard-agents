import { SUBJECTS, addDays, mondayOf, type IsoDate, type Lang, type Subject } from '@lucca/shared';

const ES = {
  hello: '¡Hola, {name}!',
  week: 'Mi semana',
  daysLabel: 'Días de la semana',
  today: 'Hoy',
  urgent: '¡Para hoy!',
  start: 'Empezar',
  continue: 'Seguir',
  review: 'Repasar',
  statusTodo: 'Por hacer',
  statusDoing: 'A medias',
  statusDone: '¡Lista!',
  dayDone: 'Todo listo',
  freeDay: '¡Nada más por hoy! Tiempo de jugar.',
  noAgenda: 'Pídele a papá que conecte tu agenda',
  listen: 'Escuchar',
  listenTask: 'Escuchar: {title}',
  listenMascot: 'Escuchar a Nova',
  mascotSuggest: '¿Empezamos con {subject}?',
  mascotAllDone: '¡Lo hiciste todo! ¡Buen trabajo!',
  starsThisWeek: 'estrellas esta semana',
  modeLabel: 'Cómo quiero aprender',
  modeListen: 'Escuchar',
  modeRead: 'Leer',
  modeBoth: 'Ambos',
  langLabel: 'Idioma',
  themeLabel: 'Tema',
  themeDark: 'Oscuro',
  themeLight: 'Claro',
  loading: 'Un momento…',
  offline: 'No encuentro tu agenda ahora. ¡Díselo a papá!',
  retry: 'Intentar de nuevo',
  parentArea: 'Área de papá',
  weekPrev: 'Semana anterior',
  weekNext: 'Semana siguiente',
  thisWeek: 'Esta semana',
  weekNone: 'Sin tareas esta semana',
  planOpen: 'Plan de la semana',
  planStartToday: 'Empieza por hoy',
  planStartDay: 'Empieza por el {day}',
  planAllDone: '¡Todo listo esta semana!',
  planGoToDay: 'Ir a {day}',
  planFreeDay: 'Día libre',
  guideStart: 'Guíame',
  guideStep: 'Tarea {n} de {m}',
  guideDone: '¡Ya la hice!',
  guideLater: 'Más tarde',
  guideBack: 'Volver a mi semana',
  guideFinished: '¡Terminaste el día!',
  guideStarsEarned: 'Estrellas ganadas: {n}',
  guideRetry: 'Inténtalo otra vez',
  understood: 'Entendida',
  saveFailed: 'No pude guardar tu avance. Revisa la conexión e inténtalo otra vez.',
  pauseTitle: '¡Hora de una pausa!',
  pauseText: 'Estírate, toma agua y mira lejos un ratito.',
  pauseDone: '¡Listo, sigo!',
  celebrate: 'Celebración',
  practiceOpen: 'Practicar',
  practiceTask: 'Practicar: {title}',
  practiceStep: 'Reto {n} de {m}',
  practiceLevel: 'Nivel {n} de 3',
  practiceDone: '¡Práctica terminada!',
  practiceSummary: 'Hiciste {m} retos. {n} a la primera.',
  practiceAgain: 'Otra ronda',
  practiceUp: '¡Subes de nivel!',
  practiceEasier: 'Vamos con uno más fácil.',
  reviewOpen: 'Repaso rápido',
  reviewCount: '{n} para repasar hoy',
  reviewDone: '¡Repaso terminado!',
  reviewDoneText: 'Recordar lo que aprendiste lo hace más fuerte.',
  reviewNone: 'Hoy no hay nada que repasar. ¡Bien!',
  reviewOffline: 'No encuentro tu repaso ahora. ¡Díselo a papá!',
  lessonPreparing: 'Estoy preparando tu lección…',
  lessonWithDad: 'Esta tarea la vemos con papá.',
  lessonSlow: 'Sigo preparando tu lección. Inténtalo en un ratito.',
  lessonOffline: 'No encuentro tu lección ahora. ¡Díselo a papá!',
  lessonStep: 'Paso {n} de {m}',
  lessonBack: 'Atrás',
  lessonNext: 'Siguiente',
  lessonFinish: 'Terminar',
  lessonOtherWay: 'Explícamelo de otra forma',
  lessonOfferOtherWay: '¿Te lo explico de otra forma?',
  lessonYes: 'Sí, explícamelo',
  lessonRight: '¡Muy bien pensado!',
  lessonKeptTrying: '¡Seguiste intentando y lo lograste!',
  lessonHint: 'Pista',
  lessonSay: 'Escuchar: {text}',
  lessonTryAgain: 'Casi. Inténtalo otra vez.',
  lessonTrue: 'Verdadero',
  lessonFalse: 'Falso',
  lessonQuiz: 'Pregunta {n} de {m}',
  lessonDone: '¡Lo entendiste!',
  lessonStar: '¡Ganaste una estrella!',
  lessonListen: 'Escuchar esta pantalla',
  lessonNextItem: 'Ahora: {item}',
  lessonChosen: 'Tu orden',
  'subject.math': 'Matemáticas',
  'subject.spanish': 'Español',
  'subject.english': 'Inglés',
  'subject.science': 'Ciencias',
  'subject.social': 'Sociales',
  'subject.art': 'Arte',
  'subject.music': 'Música',
  'subject.pe': 'Educación física',
  'subject.religion': 'Religión',
  'subject.other': 'Otra',
} as const;

export type MessageKey = keyof typeof ES;

const EN: Record<MessageKey, string> = {
  hello: 'Hi, {name}!',
  week: 'My week',
  daysLabel: 'Days of the week',
  today: 'Today',
  urgent: 'Due today!',
  start: 'Start',
  continue: 'Continue',
  review: 'Review',
  statusTodo: 'To do',
  statusDoing: 'Halfway',
  statusDone: 'Done!',
  dayDone: 'All done',
  freeDay: 'Nothing else today! Time to play.',
  noAgenda: 'Ask Dad to connect your agenda',
  listen: 'Listen',
  listenTask: 'Listen: {title}',
  listenMascot: 'Listen to Nova',
  mascotSuggest: 'Shall we start with {subject}?',
  mascotAllDone: 'You did it all! Great job!',
  starsThisWeek: 'stars this week',
  modeLabel: 'How I want to learn',
  modeListen: 'Listen',
  modeRead: 'Read',
  modeBoth: 'Both',
  langLabel: 'Language',
  themeLabel: 'Theme',
  themeDark: 'Dark',
  themeLight: 'Light',
  loading: 'Just a moment…',
  offline: "I can't find your agenda right now. Tell Dad!",
  retry: 'Try again',
  parentArea: "Parents' area",
  weekPrev: 'Previous week',
  weekNext: 'Next week',
  thisWeek: 'This week',
  weekNone: 'No tasks this week',
  planOpen: 'Week plan',
  planStartToday: 'Start with today',
  planStartDay: 'Start with {day}',
  planAllDone: 'Everything is done this week!',
  planGoToDay: 'Go to {day}',
  planFreeDay: 'Free day',
  guideStart: 'Guide me',
  guideStep: 'Task {n} of {m}',
  guideDone: 'I did it!',
  guideLater: 'Later',
  guideBack: 'Back to my week',
  guideFinished: 'You finished the day!',
  guideStarsEarned: 'Stars earned: {n}',
  guideRetry: 'Try again',
  understood: 'Understood',
  saveFailed: "I couldn't save your progress. Check the connection and try again.",
  pauseTitle: 'Time for a break!',
  pauseText: 'Stretch, drink some water and look far away for a bit.',
  pauseDone: 'Done, back to work!',
  celebrate: 'Celebration',
  practiceOpen: 'Practice',
  practiceTask: 'Practice: {title}',
  practiceStep: 'Challenge {n} of {m}',
  practiceLevel: 'Level {n} of 3',
  practiceDone: 'Practice finished!',
  practiceSummary: 'You did {m} challenges. {n} on the first try.',
  practiceAgain: 'Another round',
  practiceUp: 'Level up!',
  practiceEasier: "Let's try an easier one.",
  reviewOpen: 'Quick review',
  reviewCount: '{n} to review today',
  reviewDone: 'Review finished!',
  reviewDoneText: 'Remembering what you learned makes it stronger.',
  reviewNone: 'Nothing to review today. Nice!',
  reviewOffline: "I can't find your review right now. Tell Dad!",
  lessonPreparing: 'I am getting your lesson ready…',
  lessonWithDad: 'We will look at this one with Dad.',
  lessonSlow: "I'm still getting your lesson ready. Try again in a little while.",
  lessonOffline: "I can't find your lesson right now. Tell Dad!",
  lessonStep: 'Step {n} of {m}',
  lessonBack: 'Back',
  lessonNext: 'Next',
  lessonFinish: 'Finish',
  lessonOtherWay: 'Explain it another way',
  lessonOfferOtherWay: 'Shall I explain it another way?',
  lessonYes: 'Yes, please',
  lessonRight: 'Great thinking!',
  lessonKeptTrying: 'You kept trying and you did it!',
  lessonHint: 'Hint',
  lessonSay: 'Listen: {text}',
  lessonTryAgain: 'Almost. Try again.',
  lessonTrue: 'True',
  lessonFalse: 'False',
  lessonQuiz: 'Question {n} of {m}',
  lessonDone: 'You got it!',
  lessonStar: 'You earned a star!',
  lessonListen: 'Listen to this screen',
  lessonNextItem: 'Now: {item}',
  lessonChosen: 'Your order',
  'subject.math': 'Math',
  'subject.spanish': 'Spanish',
  'subject.english': 'English',
  'subject.science': 'Science',
  'subject.social': 'Social studies',
  'subject.art': 'Art',
  'subject.music': 'Music',
  'subject.pe': 'PE',
  'subject.religion': 'Religion',
  'subject.other': 'Other',
};

const DICTIONARY: Record<Lang, Record<MessageKey, string>> = { es: ES, en: EN };

export const MESSAGE_KEYS = Object.keys(ES) as MessageKey[];

export function t(lang: Lang, key: MessageKey, vars?: Record<string, string>): string {
  const text: string = DICTIONARY[lang][key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m) : text;
}

export function subjectName(lang: Lang, subject: Subject): string {
  return t(lang, `subject.${subject}`);
}

export { SUBJECTS };

const DAYS_SHORT: Record<Lang, string[]> = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const DAYS_LONG: Record<Lang, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** `weekday`: 0 = domingo … 6 = sábado. */
export function dayShort(lang: Lang, weekday: number): string {
  return DAYS_SHORT[lang][weekday];
}
export function dayLong(lang: Lang, weekday: number): string {
  return DAYS_LONG[lang][weekday];
}

function weekdayOf(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const dayNumber = (date: IsoDate): number => Number(date.slice(8, 10));
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function dueLabel(lang: Lang, date: IsoDate): string {
  const wd = weekdayOf(date);
  return lang === 'es'
    ? `Entregar: ${dayShort('es', wd).toLowerCase()} ${dayNumber(date)}`
    : `Due: ${dayShort('en', wd)} ${dayNumber(date)}`;
}

export interface SummaryArgs {
  isToday: boolean;
  date: IsoDate;
  pending: number;
  /** Si es 0, no se dice «todo listo»: el día no tiene tareas. */
  total?: number;
}

export function summaryLine(lang: Lang, a: SummaryArgs): string {
  const wd = weekdayOf(a.date);
  const long = dayLong(lang, wd);
  const n = dayNumber(a.date);
  const head =
    lang === 'es' ? (a.isToday ? `Hoy, ${long} ${n}` : `${capitalize(long)} ${n}`) : a.isToday ? `Today, ${long} ${n}` : `${long} ${n}`;
  if (a.total === 0) return head;

  let tail: string;
  if (lang === 'es') {
    if (a.pending === 0) tail = '¡Todo listo!';
    else if (a.isToday) tail = a.pending === 1 ? 'Te falta 1 tarea' : `Te faltan ${a.pending} tareas`;
    else tail = a.pending === 1 ? '1 tarea por hacer' : `${a.pending} tareas por hacer`;
  } else {
    const noun = a.pending === 1 ? 'task' : 'tasks';
    if (a.pending === 0) tail = 'All done!';
    else tail = a.isToday ? `${a.pending} ${noun} left` : `${a.pending} ${noun} to do`;
  }
  return `${head} · ${tail}`;
}

const MONTHS_LONG: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MONTHS_SHORT: Record<Lang, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Rango de lunes a viernes de la semana que contiene `date`: «16 – 20 de noviembre», «30 nov – 4 dic». */
export function weekRange(lang: Lang, date: IsoDate): string {
  const monday = mondayOf(date);
  const friday = addDays(monday, 4);
  const [m1, m2] = [Number(monday.slice(5, 7)) - 1, Number(friday.slice(5, 7)) - 1];
  const [d1, d2] = [Number(monday.slice(8, 10)), Number(friday.slice(8, 10))];
  if (m1 === m2) {
    return lang === 'es' ? `${d1} – ${d2} de ${MONTHS_LONG.es[m1]}` : `${MONTHS_LONG.en[m1]} ${d1} – ${d2}`;
  }
  return lang === 'es'
    ? `${d1} ${MONTHS_SHORT.es[m1]} – ${d2} ${MONTHS_SHORT.es[m2]}`
    : `${MONTHS_SHORT.en[m1]} ${d1} – ${MONTHS_SHORT.en[m2]} ${d2}`;
}

export function weekProgressText(lang: Lang, done: number, total: number): string {
  if (lang === 'es') return `${done} de ${total} ${total === 1 ? 'tarea lista' : 'tareas listas'}`;
  return `${done} of ${total} ${total === 1 ? 'task' : 'tasks'} done`;
}
