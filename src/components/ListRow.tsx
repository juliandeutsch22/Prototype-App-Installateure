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
      {/*
        Untergrenze statt min-w-0. `flex-1` allein bedeutet flex-basis:0 — der
        Titel durfte damit auf 33 px schrumpfen, waehrend die Knoepfe den Rest
        beanspruchten. Der Name lief dann ueber seine Box und wurde ueber die
        Knoepfe gemalt; genau das war am Telefon zu sehen. Mit einer
        Mindestbreite passen Titel und Aktionen entweder nebeneinander, oder
        die Aktionen rutschen sauber in die naechste Zeile.
      */}
      <div className="min-w-[9rem] flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium text-ink">{title}</div>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {/* Der Umbruch bleibt als Fangnetz. Er ist aber nicht mehr die Antwort
          auf zu viele Aktionen: drei Textknöpfe brauchen gemessene 343 px,
          hier stehen 324 zur Verfügung, und kleiner zu setzen verschiebt das
          Problem nur auf das nächste längere Wort. Wo es mehr als zwei
          Aktionen gibt, gehört alles Seltene in ein RowMenu. */}
      {children && (
        // Knoepfe in einer Listenzeile sind Nebenhandlungen, keine
        // Hauptaktionen: kleinere Schrift und schmalere Polsterung. Die
        // Tasthoehe bleibt bei 44 px, also innerhalb dessen, was die
        // Plattformrichtlinien verlangen. Symbolknoepfe sind ausgenommen,
        // sonst schruempfte das Symbol mit.
        <div className="flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 [&>button:not([data-icon])]:min-h-[2.75rem] [&>button:not([data-icon])]:px-3 [&>button:not([data-icon])]:text-sm">
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
