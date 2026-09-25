import type { ReactNode } from 'react';

/**
 * Die Knöpfe am Ende eines langen Formulars — am Telefon fest am unteren
 * Rand, über der Tableiste.
 *
 * NUR DIE ANORDNUNG ÄNDERT SICH. Es sind dieselben Knöpfe mit denselben
 * Handlern; sie stehen im Markup weiterhin am Ende des Formulars, also auch
 * für Tastatur und Vorlesehilfe dort, wo sie immer standen. Am Telefon klebt
 * die Leiste mit `position: sticky` am unteren Rand, solange man durch das
 * Formular scrollt — die Hauptaktion ist erreichbar, ohne erst ans Ende zu
 * wischen. Am Schreibtisch steht sie ruhig unter dem letzten Feld.
 *
 * Aussehen: `.aktionsleiste` in `index.css`.
 */
export default function Aktionsleiste({
  children,
  summe,
}: {
  children: ReactNode;
  /** Die Zeile über den Knöpfen: was hier zusammenkommt („Material · 3 Positionen“). */
  summe?: { name: ReactNode; wert: ReactNode };
}) {
  return (
    <div className="aktionsleiste">
      {summe && (
        <p className="aktionsleiste-summe">
          <span>{summe.name}</span>
          <span className="aktionsleiste-summe-wert">{summe.wert}</span>
        </p>
      )}
      {children}
    </div>
  );
}
