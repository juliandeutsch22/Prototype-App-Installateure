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
  /** Sprungziel, etwa für „Zu meinen Einträgen". */
  id?: string;
}

/**
 * Ruhige Karte: heller Verlauf, türkis getönte Haarlinie, langer flacher
 * Schatten, kompaktes Innenmaß — die Fläche `.panel` aus index.css.
 *
 * Der Verlauf ist kaum zu benennen und genau deshalb richtig: er nimmt der
 * weißen Fläche das Sterile, ohne dass jemand ihn beim Arbeiten bemerkt. Der
 * Schatten liegt mit negativer Streuung UNTER der Karte statt als Rahmen um
 * sie herum; dadurch bleibt die Kante scharf und die Karte hebt sich trotzdem
 * vom Grund ab.
 *
 * Der farbige Balken links ist entfallen. Er war als Signatur gedacht,
 * markierte am Ende aber fast jede Karte — und was überall steht, hebt
 * nichts mehr hervor. Aus demselben Grund trägt die Karte auch keine
 * leuchtende Oberkante: die ist der App-Navigation vorbehalten, wo sie einzeln
 * vorkommt. Betont wird über Inhalt und Badge, nicht über Rahmenschmuck.
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
  id,
}: CardProps) {
  const [hinweisOffen, setHinweisOffen] = useState(false);
  const hinweisId = useId();

  return (
    <section id={id} className={`panel overflow-hidden ${className}`}>
      {title && (
        // Der Kartenkopf sitzt eine Spur kühler als der Körper — so ist er
        // auch dann als Kopf zu lesen, wenn der Titel kurz ist.
        <header className="border-b border-line bg-surface-2/70 px-4 py-3">
          {/* Auf schmalen Schirmen Titel und Aktionen untereinander: sonst
              überlagern breite Aktionen (mehrere Knöpfe) den Titel. */}
          {/* Ein Link als Kartenaktion („Zur Einsatzplanung") bekommt dieselbe
              Höhe wie ein Knopf: 20 px Text sind mit dem Daumen kaum zu
              treffen (Prüflauf 24.09.2026, D6). */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 [&>a]:inline-flex [&>a]:min-h-touch [&>a]:items-center">
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
      {footer && (
        <footer className="border-t border-line bg-surface-2/70 px-4 py-3">{footer}</footer>
      )}
    </section>
  );
}
