import type { ReactNode } from 'react';

/**
 * Einheitlicher Seitenkopf: gleiche Größe/Hierarchie/Position auf jedem Screen.
 * Optionaler `action`-Slot rechts (z. B. Primäraktion), `subtitle` darunter.
 *
 * Unter der Überschrift steht ein kurzer leuchtender Strich statt einer Linie
 * über die volle Breite. Er bindet jede Seite an dieselbe Marke, ohne den Kopf
 * in einen Kasten zu sperren — und er ist kurz genug, dass er die Überschrift
 * begleitet statt sie zu unterstreichen.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <div className="edge-accent mt-2 h-[3px] w-12 rounded-pill" aria-hidden="true" />
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
