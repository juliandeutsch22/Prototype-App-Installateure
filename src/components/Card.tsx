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
  /**
   * Inhalt ohne Seitenrand: für Karten, die aus Zeilen (`List`) und
   * Abschnitten bestehen. Die Zeilen tragen ihren Rand dann selbst und ihre
   * Trennlinien reichen von Kante zu Kante (Designlinie „Fassung 3").
   */
  buendig?: boolean;
}

/**
 * Die Karte — EINE Ebene (Designlinie „Fassung 3", docs/design/linie.md § 7).
 *
 * Der Kopf ist weiss wie der Körper und hat keinen Rand nach unten. Er war
 * eine Spur kühler getönt, damit er auch bei kurzem Titel als Kopf zu lesen
 * ist; seit die Linie Gruppen INNERHALB der Karte mit getönten
 * Abschnittszeilen (`Abschnitt`) gliedert, gehört die Tönung dorthin — ein
 * getönter Kopf sähe aus wie der erste Abschnitt.
 *
 * Kein farbiger Balken, keine leuchtende Oberkante, kein Schatten beim
 * Überfahren: Karten sind hier keine Schaltflächen, und was überall steht,
 * hebt nichts mehr hervor.
 */
export default function Card({
  children,
  className = '',
  title,
  action,
  hint,
  footer,
  id,
  buendig = false,
}: CardProps) {
  const [hinweisOffen, setHinweisOffen] = useState(false);
  const hinweisId = useId();

  /*
    DER KÖRPER: gepolstert (`karte-koerper`), oder bündig für Zeilen. Ohne
    Kopf fehlt oben der Abstand, den sonst der Kopf mitbringt — deshalb dort
    `pt-4`. Eine bündige Karte mit Kopf bekommt die Trennlinie unter dem
    Kopf, weil ihre erste Zeile keine eigene trägt.
  */
  const koerper = buendig
    ? `karte-buendig ${title ? 'border-t border-line' : ''}`
    : `karte-koerper px-4 ${title ? '' : 'pt-4'}`;

  return (
    // `karte` schneidet die Ecken ab, ohne einen Rollbereich aufzumachen
    // (index.css) — sonst klebte die Aktionsleiste eines Formulars nicht.
    <section id={id} className={`panel karte ${className}`}>
      {title && (
        <header className="karte-kopf flex-wrap">
          {/* Titel links, Aktion rechts in EINER Zeile — auch am Telefon,
              wo ein kurzer Link („Mein Einsatzplan ›") sonst allein unter dem
              Titel stand. Ist die Aktion zu breit (mehrere Knöpfe), bricht
              sie in die nächste Zeile um, statt den Titel zu überlagern. Ein
              Link als Kartenaktion bekommt dieselbe Tasthöhe wie ein Knopf:
              20 px Text sind mit dem Daumen kaum zu treffen (Prüflauf
              24.09.2026, D6). */}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 [&>a]:inline-flex [&>a]:min-h-touch [&>a]:items-center">
            {/* Das „i" gehört zum Titel, nicht zu den Aktionen — deshalb
                steht es in derselben Zeile links. */}
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
            {action}
          </div>
          {/* Der Text steht UNTER der Kopfzeile, nicht darin: die Kopfzeile
              ist mobil eine Spalte, und in einer Spalten-Flexbox bedeutet
              „volle Basis" volle Höhe statt voller Breite. */}
          {hint && hinweisOffen && (
            <InfoPanel id={hinweisId} className="mt-1 w-full">
              {hint}
            </InfoPanel>
          )}
        </header>
      )}
      <div className={koerper}>{children}</div>
      {footer && <footer className="karte-fuss">{footer}</footer>}
    </section>
  );
}
