import type { ReactNode } from 'react';
import Icon from './Icon';

/**
 * Einheitliche Listenzeile (Designlinie „Fassung 3", `.zeile`): Titel mit
 * Meta darunter links, Status und Wert rechts, dahinter Aktionen oder ein
 * Pfeil. Sorgt für gleiche Abstände und Ausrichtung in allen Listen-Screens.
 */
export function ListRow({
  title,
  subtitle,
  zustand,
  wert,
  pfeil = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * Betrag oder Stunden der Zeile — steht RECHTS, vor Status und Aktionen.
   * Im Untertitel lief die Zahl mit der Länge des Datums davor hin und her;
   * rechtsbündig stehen die Beträge untereinander und lassen sich vergleichen.
   */
  wert?: ReactNode;
  /** Status der Zeile — steht VOR dem Wert, damit der Wert am rechten Rand fluchtet. */
  zustand?: ReactNode;
  /** Pfeil am Ende: für Zeilen, die als Ganzes eine Akte öffnen. */
  pfeil?: boolean;
  children?: ReactNode; // rechte Seite (Aktionen)
}) {
  return (
    <li className="zeile flex-wrap gap-y-2">
      {/*
        Untergrenze statt min-w-0. `flex: 1` allein bedeutet flex-basis:0 — der
        Titel durfte damit auf 33 px schrumpfen, waehrend die Knoepfe den Rest
        beanspruchten. Der Name lief dann ueber seine Box und wurde ueber die
        Knoepfe gemalt; genau das war am Telefon zu sehen. Mit einer
        Mindestbreite passen Titel und Aktionen entweder nebeneinander, oder
        die Aktionen rutschen sauber in die naechste Zeile.
      */}
      <div className="zeile-text min-w-[9rem]">
        {/*
          `flex` und `block` heben das Kürzen auf zwei Zeilen aus `.zeile-titel`
          und `.zeile-meta` auf (es braucht `display: -webkit-box`). Die Zeilen
          dieser App tragen im Titel oft Marken („inaktiv", „Eil") und in der
          Meta Datum und Ort — abgeschnitten wäre genau das weg, wonach jemand
          sucht. Lange Wörter brechen ohnehin (`overflow-wrap` am `body`).
        */}
        <div className="zeile-titel flex flex-wrap items-center gap-x-2">{title}</div>
        {subtitle && <p className="zeile-meta mt-0.5 block">{subtitle}</p>}
      </div>
      {/* Der Umbruch bleibt als Fangnetz. Er ist aber nicht mehr die Antwort
          auf zu viele Aktionen: drei Textknöpfe brauchen gemessene 343 px,
          hier stehen 324 zur Verfügung, und kleiner zu setzen verschiebt das
          Problem nur auf das nächste längere Wort. Wo es mehr als zwei
          Aktionen gibt, gehört alles Seltene in ein RowMenu. */}
      {(zustand || wert != null || children || pfeil) && (
        // Knoepfe in einer Listenzeile sind Nebenhandlungen, keine
        // Hauptaktionen: kleinere Schrift und schmalere Polsterung. Die
        // Tasthoehe bleibt bei 44 px, also innerhalb dessen, was die
        // Plattformrichtlinien verlangen. Symbolknoepfe sind ausgenommen,
        // sonst schruempfte das Symbol mit.
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 [&>button:not([data-icon])]:min-h-[2.75rem] [&>button:not([data-icon])]:px-3 [&>button:not([data-icon])]:text-sm">
          {zustand}
          {wert != null && <span className="zeile-wert">{wert}</span>}
          {children}
          {pfeil && <Icon name="weiter" size={16} className="zeile-pfeil" />}
        </div>
      )}
    </li>
  );
}

/**
 * Container für ListRow. Ohne `divide-y`: jede Zeile trägt ihre Trennlinie
 * oben selbst (`.zeile`), die erste keine — so bleibt die Linie auch dort
 * richtig, wo zwischen den Zeilen ein Abschnitt steht.
 */
export function List({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}
