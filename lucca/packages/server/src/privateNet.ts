import { isIPv4, isIPv6 } from 'node:net';

function parseIPv4(ip: string): [number, number, number, number] | null {
  if (!isIPv4(ip)) return null;
  const [a, b, c, d] = ip.split('.').map(Number);
  return [a, b, c, d];
}

/** Ocho grupos de 16 bits, o null si no es una IPv6 válida. Acepta `::` y un IPv4 incrustado al final. */
function parseIPv6(input: string): number[] | null {
  const ip = input.split('%')[0];
  if (!isIPv6(ip)) return null;

  const groups = (s: string): number[] | null => {
    if (s === '') return [];
    const parts = s.split(':');
    const out: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes('.')) {
        const v4 = parseIPv4(parts[i]);
        if (!v4 || i !== parts.length - 1) return null;
        out.push(v4[0] * 256 + v4[1], v4[2] * 256 + v4[3]);
      } else {
        out.push(parseInt(parts[i], 16));
      }
    }
    return out;
  };

  const gap = ip.indexOf('::');
  if (gap === -1) {
    const all = groups(ip);
    return all && all.length === 8 ? all : null;
  }
  const head = groups(ip.slice(0, gap));
  const tail = groups(ip.slice(gap + 2));
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  return missing < 0 ? null : [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function isPrivateIPv4([a, b]: [number, number, number, number]): boolean {
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * ¿Viene la petición de la propia computadora o de la red de la casa?
 * Cubre las redes privadas, la loopback y la de enlace local, en IPv4 e IPv6 (incluida la IPv4 mapeada en IPv6).
 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPrivateIPv4(v4);

  const g = parseIPv6(ip);
  if (!g) return false;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPrivateIPv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  return false;
}
