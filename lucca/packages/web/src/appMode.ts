import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/** true en la app de Android (compilación `--mode app`): el servidor va dentro del dispositivo. */
export const IS_APP = import.meta.env.VITE_LUCCA_APP === '1';

/**
 * Abre una página fuera del asistente (Mereb, la consola de IA). En el teléfono usa el navegador del sistema
 * (pestaña segura de Chrome): allí papá escribe sus datos de Mereb, que nunca pasan por Lucca.
 * Se llama sin esperas antes: un navegador bloquea las ventanas que no se abren justo al tocar.
 */
export function openExternal(url: string): void {
  if (IS_APP && Capacitor.isNativePlatform()) {
    void Browser.open({ url }).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
