interface ProgressBarProps {
  label: string;
  done: number;
  total: number;
}

/** Barra de avance con su texto para lectores de pantalla («5 de 10 tareas listas»). */
export function ProgressBar({ label, done, total }: ProgressBarProps) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
