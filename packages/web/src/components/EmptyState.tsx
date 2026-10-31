import { useState } from 'react';

const COMMANDS = [
  ['Conecta Claude Code', 'npx agentdash install claude'],
  ['Conecta Kiro CLI', 'npx agentdash install kiro-cli'],
  ['O prueba con datos de ejemplo', 'npx agentdash demo'],
];

export function EmptyState() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  return (
    <section className="panel empty" aria-label="Sin agentes">
      <h2 className="panel-title">Aún no hay agentes</h2>
      <p className="muted">Instala los hooks y abre una sesión nueva: aparecerá aquí en cuanto haga algo.</p>
      <ul className="commands">
        {COMMANDS.map(([label, cmd]) => (
          <li key={cmd}>
            <span className="muted">{label}</span>
            <span className="command">
              <code>{cmd}</code>
              <button type="button" className="copy" onClick={() => copy(cmd)}>
                {copied === cmd ? 'Copiado' : 'Copiar'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
