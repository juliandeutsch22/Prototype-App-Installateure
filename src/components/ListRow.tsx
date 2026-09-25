import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * Einheitliche Listenzeile: linke Beschreibung (Titel + Sekundärzeile),
 * rechte Aktionen/Status, wahlweise etwas davor (`vorne`) und ein Block
 * darunter (`unten`). Sorgt für gleiche Abstände und Ausrichtung in
 * allen Listen-Screens.
 */
export function ListRow({
  title,
  subtitle,
  zustand,
  wert,
  vorne,
  unten,
  ziel,
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
  /** Vor dem Titel, schrumpft nicht: ein Mengenfeld, ein Vorschaubild. */
  vorne?: ReactNode;
  /**
   * Unter der Zeile, über die volle Breite: eine Warnung zur Zeile oder
   * aufklappbare Einzelheiten. Gehört zur Zeile, nicht zur Liste — deshalb
   * steht es IN ihr, über der Trennlinie zur nächsten.
   */
  unten?: ReactNode;
  /**
   * Führt die Zeile woanders hin, ist die GANZE Zeile der Link und trägt
   * rechts einen Pfeil (›) — die Linie, docs/design/linie.md 3. Dann keine
   * eigenen Knöpfe in der Zeile (`children`): ein Knopf im Link wäre eine
   * Tastfläche in der Tastfläche.
   */
  ziel?: string;
  children?: ReactNode; // rechte Seite (Aktionen)
}) {
  if (ziel) {
    return (
      <li className="zeile-huelle">
        <Link to={ziel} className="zeile-link">
          {vorne && <div className="zeile-vorne">{vorne}</div>}
          {/* Text und rechte Seite dürfen untereinander rutschen, wenn beides
              nicht in eine Zeile passt — der Pfeil bleibt rechts stehen.
              Sonst trennte ein langer Kundenname am Telefon mitten im Wort,
              sobald rechts eine Marke stand. */}
          <div className="zeile-link-inhalt">
            <div className="zeile-text">
              <div className="zeile-titel-stark">{title}</div>
              {subtitle && <p className="zeile-unter">{subtitle}</p>}
            </div>
            {(zustand || wert != null) && (
              <div className="zeile-rechts">
                {zustand}
                {wert != null && <span className="zeile-wert">{wert}</span>}
              </div>
            )}
          </div>
          <Icon name="weiter" size={20} className="zeile-pfeil" />
        </Link>
        {unten && <div className="zeile-unten">{unten}</div>}
      </li>
    );
  }
  return (
    <li className="zeile">
      {vorne && <div className="zeile-vorne">{vorne}</div>}
      {/*
        Untergrenze statt min-w-0. `flex-1` allein bedeutet flex-basis:0 — der
        Titel durfte damit auf 33 px schrumpfen, waehrend die Knoepfe den Rest
        beanspruchten. Der Name lief dann ueber seine Box und wurde ueber die
        Knoepfe gemalt; genau das war am Telefon zu sehen. Mit einer
        Mindestbreite passen Titel und Aktionen entweder nebeneinander, oder
        die Aktionen rutschen sauber in die naechste Zeile.
      */}
      <div className="zeile-text">
        <div className="zeile-titel">{title}</div>
        {subtitle && <p className="zeile-unter">{subtitle}</p>}
      </div>
      {/* Der Umbruch bleibt als Fangnetz. Er ist aber nicht mehr die Antwort
          auf zu viele Aktionen: drei Textknöpfe brauchen gemessene 343 px,
          hier stehen 324 zur Verfügung, und kleiner zu setzen verschiebt das
          Problem nur auf das nächste längere Wort. Wo es mehr als zwei
          Aktionen gibt, gehört alles Seltene in ein RowMenu. */}
      {(zustand || wert != null || children) && (
        // Knoepfe in einer Listenzeile sind Nebenhandlungen, keine
        // Hauptaktionen: kleinere Schrift und schmalere Polsterung. Die
        // Tasthoehe bleibt bei 44 px, also innerhalb dessen, was die
        // Plattformrichtlinien verlangen. Symbolknoepfe sind ausgenommen,
        // sonst schruempfte das Symbol mit.
        <div className="zeile-rechts">
          {zustand}
          {wert != null && <span className="zeile-wert">{wert}</span>}
          {children}
        </div>
      )}
      {unten && <div className="zeile-unten">{unten}</div>}
    </li>
  );
}

/** Trennlinien-Liste als Container für ListRow. */
export function List({ children }: { children: ReactNode }) {
  return <ul className="liste">{children}</ul>;
}
