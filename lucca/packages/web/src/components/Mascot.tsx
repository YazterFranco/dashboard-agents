/** Nova, la estrella mascota del tablero Bento. Decorativa. */
export function Mascot({ size = 112 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" className="mascot">
      <polygon
        points="60,14 75.28,40.97 105.65,47.17 84.73,70.03 88.21,100.83 60,88 31.79,100.83 35.27,70.03 14.35,47.17 44.72,40.97"
        fill="#B79CFF"
        stroke="#B79CFF"
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="58" r="5" fill="#101828" />
      <circle cx="70" cy="58" r="5" fill="#101828" />
      <circle cx="51.5" cy="56.5" r="1.6" fill="#FFFFFF" />
      <circle cx="71.5" cy="56.5" r="1.6" fill="#FFFFFF" />
      <path d="M52 69q8 7 16 0" fill="none" stroke="#101828" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="42" cy="68" r="4" fill="#FF8A7A" />
      <circle cx="78" cy="68" r="4" fill="#FF8A7A" />
    </svg>
  );
}
