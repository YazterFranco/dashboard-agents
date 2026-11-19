import { useMemo, useState } from 'react';
import type { Task } from '@lucca/shared';
import { LessonPlayer } from '../lesson/LessonPlayer';
import type { Speaker } from '../speaker';
import { ApiError, type ParentApi } from './api';
import { GENERIC_ERROR, NETWORK_ERROR } from './fields';

/** Vista previa para papá: igual que la ve Lucca, sin voz y sin progreso, con «Regenerar». */
export function LessonPreview({ task, api, onClose }: { task: Task; api: ParentApi; onClose(): void }) {
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const silent = useMemo<Speaker>(() => ({ available: () => false, speak: () => {}, stop: () => {}, speaking: false }), []);
  const load = useMemo(() => () => api.lesson(task.id), [api, task.id, version]);

  async function regenerate() {
    setBusy(true);
    setMessage(null);
    try {
      const answer = await api.regenerateLesson(task.id);
      setMessage(answer.status === 'ready' ? 'Lección nueva lista.' : 'No se pudo preparar ahora: revisa la IA en Ajustes.');
      setVersion((v) => v + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setMessage(err instanceof ApiError ? GENERIC_ERROR : NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-preview" aria-label={`Vista previa de la lección: ${task.title}`}>
      <div className="p-card p-preview-bar">
        <p className="p-lead">Vista previa: así la ve Lucca. Nada de lo que hagas aquí cuenta como progreso.</p>
        <div className="p-actions">
          <button type="button" className="p-btn p-btn-ghost" disabled={busy} aria-busy={busy || undefined} onClick={() => void regenerate()}>
            Regenerar lección
          </button>
        </div>
        {message ? (
          <p className="p-status" role="status">
            {message}
          </p>
        ) : null}
      </div>
      <LessonPlayer key={version} task={task} lang="es" voiceMode="text" speaker={silent} load={load} onClose={onClose} closeLabel="Cerrar la vista previa" />
    </section>
  );
}
