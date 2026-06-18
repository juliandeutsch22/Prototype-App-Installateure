import type { ReactNode } from 'react';

/**
 * Einheitliche Listenzeile: linke Beschreibung (Titel + Sekundärzeile),
 * rechte Aktionen/Status. Sorgt für gleiche Abstände und Ausrichtung in
 * allen Listen-Screens.
 */
export function ListRow({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode; // rechte Seite (Status, Aktionen)
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium text-ink">{title}</div>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </li>
  );
}

/** Trennlinien-Liste als Container für ListRow. */
export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}
