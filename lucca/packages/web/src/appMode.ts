/** true en la app de Android (compilación `--mode app`): el servidor va dentro del dispositivo. */
export const IS_APP = import.meta.env.VITE_LUCCA_APP === '1';

/**
 * Abre una página fuera del asistente (Mereb, la consola de IA). En la app usa el navegador del sistema
 * (pestaña segura de Chrome): allí papá escribe sus datos de Mereb, que nunca pasan por Lucca.
 */
export async function openExternal(url: string): Promise<void> {
  if (IS_APP) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch {
      /* sin plugin (navegador de escritorio): se abre como en la web */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
