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
export default function Aktionsleiste({ children }: { children: ReactNode }) {
  return <div className="aktionsleiste">{children}</div>;
}
