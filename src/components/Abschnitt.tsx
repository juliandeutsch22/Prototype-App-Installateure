import type { ReactNode } from 'react';

/**
 * Eine getönte Abschnittszeile INNERHALB einer Karte — statt einer Karte in
 * der Karte (Designlinie „Fassung 3", docs/design/linie.md § 7).
 *
 * Zwei weisse Kästen ineinander liessen jede Gruppe gleich laut stehen wie
 * die Karte selbst; eine Zeile mit leichter Tönung und Trennlinie gliedert,
 * ohne einen neuen Rahmen aufzumachen. Die Anzahl steht gedämpft hinter dem
 * Titel („Meine Anträge · 2"), ein Link („Alle ›") rechts.
 *
 * `h3`, weil der Abschnitt unter dem Kartentitel (`h2`) steht — so bleibt
 * die Gliederung für einen Vorleser dieselbe wie fürs Auge.
 */
export default function Abschnitt({
  titel,
  anzahl,
  link,
  children,
}: {
  titel: ReactNode;
  anzahl?: ReactNode;
  /** Rechts in der Zeile, meist ein `.link-still`. */
  link?: ReactNode;
  /** Inhalt unter der Abschnittszeile (Zeilen, Text). */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="abschnitt">
        <h3>
          {titel}
          {anzahl != null && <span className="anzahl">· {anzahl}</span>}
        </h3>
        {link}
      </div>
      {children}
    </>
  );
}
