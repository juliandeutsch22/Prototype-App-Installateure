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
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
      {/* min-w-0 UND flex-1: ohne min-w-0 weigert sich ein Flex-Kind zu
          schrumpfen, ein langer Kundenname sprengt dann die Zeile. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium text-ink">{title}</div>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {/* Auch die Aktionen umbrechen. Vorher standen sie in einer starren
          Reihe: drei Textknöpfe passen auf 390 px nicht nebeneinander, und
          weil die Karte overflow-hidden trägt, war „Deaktivieren" schlicht
          abgeschnitten — nicht scrollbar, sondern weg. */}
      {children && (
        <div className="flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {children}
        </div>
      )}
    </li>
  );
}

/** Trennlinien-Liste als Container für ListRow. */
export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}
