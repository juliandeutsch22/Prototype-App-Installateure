import type { ReactNode } from 'react';
import Icon from './Icon';

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
  offen,
  onUmschalten,
  steuert,
}: {
  titel: ReactNode;
  anzahl?: ReactNode;
  /** Rechts in der Zeile, meist ein `.link-still`. */
  link?: ReactNode;
  /** Inhalt unter der Abschnittszeile (Zeilen, Text). */
  children?: ReactNode;
  /**
   * AUFKLAPPBAR, wenn `onUmschalten` gesetzt ist: die ganze Abschnittszeile
   * wird zum Knopf, der Inhalt steht nur da, solange `offen`. Für lange
   * Verläufe (Wochen der Zeiterfassung), die sonst eine einzige Wurst wären.
   * Nach dem Muster der WAI-ARIA-Akkordeons: Knopf mit `aria-expanded` IN
   * der Überschrift, nicht um sie herum.
   */
  offen?: boolean;
  onUmschalten?: () => void;
  /** Kennung des Inhalts, den der Knopf auf- und zuklappt. */
  steuert?: string;
}) {
  if (onUmschalten) {
    return (
      <>
        <div className="abschnitt p-0">
          <h3 className="w-full">
            <button
              type="button"
              aria-expanded={!!offen}
              aria-controls={steuert}
              onClick={onUmschalten}
              className="flex min-h-touch w-full items-center gap-3 px-4 py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                {titel}
                {anzahl != null && <span className="anzahl">· {anzahl}</span>}
              </span>
              {link}
              <Icon
                name="chevron"
                size={16}
                className={`shrink-0 text-ink-placeholder transition-transform ${offen ? 'rotate-180' : ''}`}
              />
            </button>
          </h3>
        </div>
        {offen && <div id={steuert}>{children}</div>}
      </>
    );
  }
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
