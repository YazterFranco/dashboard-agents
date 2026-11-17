import type { Subject } from '@lucca/shared';

const COMMON = {
  width: 30,
  height: 30,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Iconos del tablero Bento. Son decorativos: el nombre de la materia va en texto. */
export function SubjectIcon({ subject }: { subject: Subject }) {
  switch (subject) {
    case 'math':
      return (
        <svg {...COMMON}>
          <path d="M7 4v6M4 7h6M14 7h6M4.5 14.5l5 5M9.5 14.5l-5 5M14 15.5h6M14 18.5h6" />
        </svg>
      );
    case 'spanish':
      return (
        <svg {...COMMON}>
          <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z" />
          <path d="M12 6.5v13" />
        </svg>
      );
    case 'english':
      return (
        <svg {...COMMON}>
          <path d="M4 5h16v11H9l-5 4V5Z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      );
    case 'science':
      return (
        <svg {...COMMON}>
          <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14Z" />
          <path d="M5 19l8-8" />
        </svg>
      );
    case 'art':
      return (
        <svg {...COMMON}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8Z" />
          <circle cx="7.5" cy="11" r="1.2" />
          <circle cx="10" cy="7" r="1.2" />
          <circle cx="15" cy="7.5" r="1.2" />
        </svg>
      );
    default:
      return (
        <svg {...COMMON}>
          <path d="M12 3l2.4 5.2 5.6.7-4.1 3.9 1 5.6L12 15.6 7.1 18.4l1-5.6L4 8.9l5.6-.7L12 3Z" />
        </svg>
      );
  }
}

export function SpeakerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
