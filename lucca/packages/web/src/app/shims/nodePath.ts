export const dirname = (p: string): string => p.replace(/\/[^/]*$/, '') || '/';
export const join = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');
