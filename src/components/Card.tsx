import { useId, useState, type ReactNode } from 'react';
import { InfoButton, InfoPanel } from './InfoHint';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode; // optionale Aktion rechts neben dem Titel
  /**
   * Wie viele Einträge die Karte zeigt — rechts in der Titelzeile, gedämpft
   * (`.liste-anzahl`), NICHT in Klammern im Titel. Die Linie
   * (docs/design/linie.md, 2) setzt Stand und Zahl einer Karte rechts; so
   * steht es auf jeder Karte an derselben Stelle.
   */
  anzahl?: ReactNode;
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
 * Ruhige Karte: weiße Fläche, türkis getönte Haarlinie, langer flacher
 * Schatten, kompaktes Innenmaß — `.karte` und ihre Teile aus index.css
 * („Gemeinsame Bausteine“). Kopf, Körper und Fuß tragen je eine Klasse.
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
  anzahl,
  hint,
  footer,
  id,
}: CardProps) {
  const [hinweisOffen, setHinweisOffen] = useState(false);
  const hinweisId = useId();

  return (
    <section id={id} className={className ? `karte ${className}` : 'karte'}>
      {title && (
        // Kopf eine Spur kühler als der Körper; am Telefon Titel und Aktionen
        // untereinander; ein Link als Aktion mit Tasthöhe (Prüflauf
        // 24.09.2026, D6) — alles in `.karte-kopf` / `.karte-kopfzeile`.
        <header className="karte-kopf">
          <div className="karte-kopfzeile">
            {/* Der Kartentitel ordnet den Inhalt, ohne mit der
                Seitenüberschrift zu konkurrieren (`.titel-karte`). Das „i"
                gehört zum Titel, nicht zu den Aktionen — deshalb steht es in
                derselben Zeile links. */}
            <h2 className="titel-karte">
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
            {anzahl != null ? (
              <div className="liste-kopf-rechts">
                <span className="liste-anzahl">{anzahl}</span>
                {action}
              </div>
            ) : (
              action
            )}
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
      <div className="karte-inhalt">{children}</div>
      {footer && (
        <footer className="karte-fuss">{footer}</footer>
      )}
    </section>
  );
}
