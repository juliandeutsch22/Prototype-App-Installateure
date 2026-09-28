import type { ReactNode } from 'react';

export interface Spalte {
  name: ReactNode;
  /** Rechtsbündig — für Beträge, Stunden, Mengen. */
  r?: boolean;
  /** Nur für Vorlesehilfen (z. B. die Spalte mit dem Zeilenmenü). */
  versteckt?: boolean;
}

/**
 * Eine Liste als Tabelle am Schreibtisch (Designlinie „Fassung 3",
 * `.tabelle`): Kopf getönt, Zahlen rechtsbündig, Status als `.stand`.
 *
 * Steht bündig in einer Karte (`Card buendig`). Wird der Platz knapp, rollt
 * die Tabelle in ihrem eigenen Behälter — die Seite selbst schiebt sich nie
 * seitwärts.
 */
export default function Tabelle({
  spalten,
  children,
  eng = false,
}: {
  spalten: Spalte[];
  children: ReactNode;
  eng?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`tabelle ${eng ? 'tabelle-eng' : ''}`}>
        <thead>
          <tr>
            {spalten.map((s, i) => (
              <th key={i} scope="col" className={s.r ? 'r' : undefined}>
                {s.versteckt ? <span className="sr-only">{s.name}</span> : s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
