import type { ReactNode } from 'react';

/**
 * Einheitlicher Seitenkopf: gleiche Größe/Hierarchie/Position auf jedem Screen.
 * Optionaler `action`-Slot rechts (z. B. Primäraktion), `subtitle` darunter.
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
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
