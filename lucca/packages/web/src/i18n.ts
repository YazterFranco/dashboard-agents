import { SUBJECTS, type IsoDate, type Lang, type Subject } from '@lucca/shared';

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
