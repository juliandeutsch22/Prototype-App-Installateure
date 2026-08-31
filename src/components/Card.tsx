import { useId, useState, type ReactNode } from 'react';
import { InfoButton, InfoPanel } from './InfoHint';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode; // optionale Aktion rechts neben dem Titel
  /**
   * Stehende Erklärung zur ganzen Karte — erscheint als „i" neben dem Titel
   * und klappt darunter auf. Für Regeln, die immer gelten („nur unbenutztes
   * Material wird gutgeschrieben"), nicht für Rückmeldungen zum aktuellen
   * Zustand: die müssen ohne Tipp zu sehen sein.
   */
  hint?: ReactNode;
  footer?: ReactNode;
}

/**
 * Ruhige Karte: dünne Linie, flacher Schatten, kompaktes Innenmaß.
 *
 * Der farbige Balken links ist entfallen. Er war als Signatur gedacht,
 * markierte am Ende aber fast jede Karte — und was überall steht, hebt
 * nichts mehr hervor. Übrig blieb eine Oberfläche, die an jeder Kante
 * etwas behauptet. Betont wird jetzt über Inhalt und Badge, nicht über
 * Rahmenschmuck.
 *
 * Auch der Schatten beim Überfahren ist weg: Karten sind hier keine
 * Schaltflächen, sie sollen nicht so tun.
 */
export default function Card({
  children,
  className = '',
  title,
  action,
  hint,
  footer,
}: CardProps) {
  const [hinweisOffen, setHinweisOffen] = useState(false);
  const hinweisId = useId();

  return (
    <section className={`overflow-hidden rounded-lg border border-line bg-surface ${className}`}>
      {title && (
        <header className="border-b border-line px-4 py-3">
          {/* Auf schmalen Schirmen Titel und Aktionen untereinander: sonst
              überlagern breite Aktionen (mehrere Knöpfe) den Titel. */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {/* Kartentitel sind im Prototyp klein, fett und versal gesetzt —
                sie ordnen den Inhalt, ohne mit der Seitenüberschrift zu
                konkurrieren. Das „i" gehört zum Titel, nicht zu den
                Aktionen — deshalb steht es in derselben Zeile links. */}
            {/* normal-case am „i": section-label setzt Versalien, sonst
                stünde dort ein grosses I. */}
            <h2 className="section-label flex items-center gap-2 [&>button]:normal-case">
              {title}
              {hint && (
                <InfoButton
                  about={title}
                  offen={hinweisOffen}
                  onToggle={() => setHinweisOffen((o) => !o)}
                  controls={hinweisId}
                />
              )}
            </h2>
            {action}
          </div>
          {/* Der Text steht UNTER der Kopfzeile, nicht darin: die Kopfzeile
              ist mobil eine Spalte, und in einer Spalten-Flexbox bedeutet
              „volle Basis" volle Höhe statt voller Breite. */}
          {hint && hinweisOffen && (
            <InfoPanel id={hinweisId} className="mt-3">
              {hint}
            </InfoPanel>
          )}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
    </section>
  );
}
