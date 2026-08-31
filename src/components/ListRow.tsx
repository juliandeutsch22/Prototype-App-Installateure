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
  stackActions = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode; // rechte Seite (Status, Aktionen)
  /**
   * Aktionen am Telefon in eine eigene, linksbuendige Zeile unter den Titel.
   *
   * Fuer Zeilen mit drei oder mehr Textknoepfen. Rechtsbuendig neben dem
   * Titel bleiben auf 390 px nur 186 px — die drei Knoepfe der
   * Benutzerverwaltung brauchen 307 px, brechen also um, und der letzte steht
   * allein rechts mit einem Loch daneben. Ueber die volle Breite passen sie
   * in EINE Zeile. Bewusst nicht der Standard: Zeilen, deren rechte Seite nur
   * ein Abzeichen oder eine Summe traegt, wuerden dadurch ohne Not eine Zeile
   * hoeher.
   */
  stackActions?: boolean;
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
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {/* Auch die Aktionen umbrechen. Vorher standen sie in einer starren
          Reihe: drei Textknöpfe passen auf 390 px nicht nebeneinander, und
          weil die Karte overflow-hidden trägt, war „Deaktivieren" schlicht
          abgeschnitten — nicht scrollbar, sondern weg. */}
      {children && (
        // Knoepfe in einer Listenzeile sind Nebenhandlungen, keine
        // Hauptaktionen: kleinere Schrift und schmalere Polsterung. Die
        // Tasthoehe bleibt bei 44 px, also innerhalb dessen, was die
        // Plattformrichtlinien verlangen. Symbolknoepfe sind ausgenommen,
        // sonst schruempfte das Symbol mit.
        <div
          className={`flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 [&>button:not([data-icon])]:min-h-[2.75rem] [&>button:not([data-icon])]:px-2.5 [&>button:not([data-icon])]:text-sm ${
            stackActions
              ? '-ml-2.5 w-full justify-start sm:ml-0 sm:w-auto sm:justify-end'
              : 'justify-end'
          }`}
        >
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
