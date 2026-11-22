// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ParentApi } from '../parent/api';

const appMode = vi.hoisted(() => ({ value: true }));
const opened = vi.hoisted(() => [] as string[]);
vi.mock('../appMode', () => ({
  get IS_APP() {
    return appMode.value;
  },
  openExternal: async (url: string) => {
    opened.push(url);
  },
}));

const { Welcome, stepsFor } = await import('./Welcome');

afterEach(() => {
  cleanup();
  appMode.value = true;
  opened.length = 0;
});

const KEY = 'sk-ant-api03-' + 'x'.repeat(40) + 'WXYZ';
const config = (over = {}) => ({ aiKeySet: false, aiKeyHint: null, merebUrl: null, ...over });

function setup(over: Partial<Record<keyof ParentApi, unknown>> = {}, props: { setupDone?: boolean; onClose?: () => void } = {}) {
  const api = {
    appConfig: vi.fn(async () => config()),
    saveAppConfig: vi.fn(async (body: { aiKey?: string | null; merebUrl?: string | null }) =>
      config({ merebUrl: body.merebUrl ?? null, aiKeySet: Boolean(body.aiKey), aiKeyHint: body.aiKey ? 'WXYZ' : null }),
    ),
    previewAgenda: vi.fn(async () => ({
      weekStart: '2026-11-22',
      weekEnd: '2026-11-28',
      drafts: [{ key: 'a', subject: 'math', subjectLabel: 'Matemáticas', title: 'Números romanos', description: '', dueDate: '2026-11-25', kind: '', state: 'new' }],
    })),
    importAgenda: vi.fn(async () => ({ added: 1, updated: 0, unchanged: 0, skipped: 0 })),
    ...over,
  } as unknown as ParentApi;
  const onFinish = vi.fn();
  render(<Welcome api={api} setupDone={props.setupDone ?? true} connections={{ ai: false, mereb: false }} onFinish={onFinish} onClose={props.onClose} />);
  return { api, onFinish };
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('guía de bienvenida', () => {
  it('primera vez: 6 pasos con la configuración; desde el área de papá: 5 sin repetirla', () => {
    expect(stepsFor(false)).toEqual(['intro', 'howto', 'setup', 'mereb', 'ai', 'done']);
    expect(stepsFor(true)).toEqual(['intro', 'howto', 'mereb', 'ai', 'done']);
  });

  it('explica qué es y cómo lo usan Lucca y papá, y se puede volver atrás', () => {
    setup();
    expect(screen.getByRole('heading', { name: '¡Bienvenido al asistente de tareas de Lucca!' })).toBeTruthy();
    expect(screen.getByText('La semana del colegio')).toBeTruthy();
    click('Empezar');
    expect(screen.getByRole('heading', { name: 'Cómo se usa' })).toBeTruthy();
    expect(screen.getByText(/candado/)).toBeTruthy();
    click('Atrás');
    expect(screen.getByText('Paso 1 de 5')).toBeTruthy();
  });

  it('el foco va al título de cada paso', () => {
    setup();
    click('Empezar');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Cómo se usa' }));
  });

  it('Mereb: guarda la dirección y la abre en el navegador; nunca pide la contraseña', async () => {
    const { api } = setup();
    click('Empezar');
    click('Siguiente');
    expect(await screen.findByLabelText('Dirección de Mereb del colegio')).toBeTruthy();
    expect(screen.queryByLabelText(/contraseña/i)).toBeNull();
    expect(screen.getByText(/no guarda tu contraseña de Mereb/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dirección de Mereb del colegio'), { target: { value: 'https://colegio.mereb.example' } });
    click('Abrir Mereb');
    await waitFor(() => expect(opened).toEqual(['https://colegio.mereb.example']));
    expect(api.saveAppConfig).toHaveBeenCalledWith({ merebUrl: 'https://colegio.mereb.example' });
  });

  it('Mereb: una dirección vacía avisa junto al campo y no abre nada', async () => {
    setup();
    click('Empezar');
    click('Siguiente');
    await screen.findByLabelText('Dirección de Mereb del colegio');
    click('Abrir Mereb');
    expect(await screen.findByText('Escribe la dirección de Mereb, empezando por https://')).toBeTruthy();
    expect(opened).toEqual([]);
  });

  it('se puede importar la agenda desde la guía y el resumen final lo cuenta', async () => {
    const { api } = setup();
    click('Empezar');
    click('Siguiente');
    const file = new File(['%PDF'], 'agenda.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Archivo PDF de la agenda'), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir 1 tarea' }));
    expect(await screen.findByText('Listo: 1 tarea nueva.')).toBeTruthy();
    expect(api.importAgenda).toHaveBeenCalled();
    click('Siguiente');
    click('Ahora no');
    expect(screen.getByRole('heading', { name: '¡Todo listo!' })).toBeTruthy();
    expect(screen.getByText(/Listo: 1 tarea nueva/)).toBeTruthy();
  });

  it('IA: guarda la clave, muestra solo los últimos 4 caracteres y el resumen la da por activa', async () => {
    const { onFinish } = setup();
    click('Empezar');
    click('Siguiente');
    click('Lo hago después');
    fireEvent.change(await screen.findByLabelText('Clave de IA (Anthropic)'), { target: { value: KEY } });
    click('Guardar clave');
    expect(await screen.findByText(/termina en/)).toBeTruthy();
    expect(screen.getByText('…WXYZ')).toBeTruthy();
    click('Siguiente');
    expect(screen.getByText('Lecciones con IA activadas')).toBeTruthy();
    click('Ir a la pantalla de Lucca');
    expect(onFinish).toHaveBeenCalledWith('kid');
  });

  it('IA: «Conseguir una clave» abre la consola de Anthropic', async () => {
    setup();
    click('Empezar');
    click('Siguiente');
    click('Lo hago después');
    await screen.findByLabelText('Clave de IA (Anthropic)');
    click('Conseguir una clave');
    expect(opened).toEqual(['https://console.anthropic.com/settings/keys']);
  });

  it('en la web (servidor de casa) explica el .env en lugar de pedir la clave', () => {
    appMode.value = false;
    setup();
    click('Empezar');
    click('Siguiente');
    expect(screen.queryByLabelText('Dirección de Mereb del colegio')).toBeNull();
    click('Lo hago después');
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
  });

  it('abierta desde el área de papá se puede cerrar en cualquier paso', () => {
    const onClose = vi.fn();
    setup({}, { onClose });
    click('Empezar');
    click('Cerrar la guía');
    expect(onClose).toHaveBeenCalled();
  });

  it('un PDF que no es PDF ni se envía', () => {
    const { api } = setup();
    click('Empezar');
    click('Siguiente');
    fireEvent.change(screen.getByLabelText('Archivo PDF de la agenda'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('alert').textContent).toMatch(/termina en \.pdf/);
    expect(api.previewAgenda).not.toHaveBeenCalled();
  });
});
