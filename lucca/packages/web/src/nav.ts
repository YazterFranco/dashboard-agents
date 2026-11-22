/**
 * Cambiar entre la pantalla de Lucca (`/`) y el área de papá (`/papa`) SIN recargar la página. En la app de Android
 * eso importa: el servidor interno sigue vivo y un cambio recién hecho termina de guardarse en el dispositivo.
 */
export const NAVIGATE_EVENT = 'lucca:navigate';

export const isParentPath = (path: string): boolean => /^\/papa(\/|$)/.test(path);

export function navigate(path: string): void {
  if (window.location.pathname !== path) window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** Los enlaces internos (`<a href="/papa">`, `<a href="/">`) se atienden sin recargar. */
export function interceptInternalLinks(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname !== '/' && !isParentPath(url.pathname)) return;
    event.preventDefault();
    navigate(url.pathname);
  });
}
