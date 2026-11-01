import type { Platform } from '@agentdash/shared';

/** Pixel character: a person for Claude, a ghost for Kiro (shape differs, not only color). */
export function Sprite({ platform, working, size = 30 }: { platform: Platform; working: boolean; size?: number }) {
  const cls = `sprite${working ? ' is-working' : ''}`;
  if (platform === 'kiro') {
    return (
      <svg className={cls} width={size} height={size * 1.2} viewBox="0 0 10 12" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="3" y="0" width="4" height="1" fill="#CFC6FF" />
        <rect x="2" y="1" width="6" height="1" fill="#CFC6FF" />
        <rect x="1" y="2" width="8" height="8" fill="#CFC6FF" />
        <rect x="1" y="10" width="2" height="1" fill="#CFC6FF" />
        <rect x="4" y="10" width="2" height="1" fill="#CFC6FF" />
        <rect x="7" y="10" width="2" height="1" fill="#CFC6FF" />
        <rect x="3" y="4" width="1" height="2" fill="#1B1E24" />
        <rect x="6" y="4" width="1" height="2" fill="#1B1E24" />
      </svg>
    );
  }
  return (
    <svg className={cls} width={size} height={size * 1.2} viewBox="0 0 10 12" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="0" width="6" height="2" fill="#3A2A20" />
      <rect x="2" y="2" width="6" height="3" fill="#F2C9A0" />
      <rect x="3" y="3" width="1" height="1" fill="#1B1E24" />
      <rect x="6" y="3" width="1" height="1" fill="#1B1E24" />
      <rect x="1" y="5" width="8" height="4" fill="#F0A060" />
      <rect x="2" y="9" width="2" height="3" fill="#3A4150" />
      <rect x="6" y="9" width="2" height="3" fill="#3A4150" />
    </svg>
  );
}
