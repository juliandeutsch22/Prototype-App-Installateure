import type { ReactNode } from 'react';
import Icon from './Icon';

/*
  DIE ZAHL IM ACHSKREIS (Planlinie B5, 30.10.2026): statt „Dringend · 2“ steht
  die Zahl in einem Kreis vor dem Titel, wie die Achsbezeichnung eines
  Grundrisses, und eine Achslinie läuft bis zum Rand. Nur eine kurze Zahl oder
  ein Buchstabe passt in den Kreis; ein längerer Zusatz bleibt Text hinter
  dem Titel.
*/
function Kopf({ titel, anzahl }: { titel: ReactNode; anzahl?: ReactNode }) {
  const imKreis = typeof anzahl === 'number' || (typeof anzahl === 'string' && anzahl.length <= 3);
  return (
    <>
      {imKreis && <><span className="achskreis">{anzahl}</span>{' '}</>}
      <span>{titel}</span>
      {anzahl != null && !imKreis && <span className="anzahl-text">· {anzahl}</span>}
    </>
  );
}

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
    /*
      DER KOPF AUF DER FLUCHT DES BLATTS (E72, 09.11.2026). Der Knopf trug
      eigene 16 px Einzug, `p-0` am Abschnitt griff im Blatt nicht (dort
      setzt `lot-blatt.css` 12 px 24 px): die Wochenköpfe in „Meine Einträge“
      standen 40 px eingerückt, die Zeilen darunter 24. Jetzt gibt der
      Abschnitt den Einzug wie jeder andere, und der Knopf greift mit
      negativem Rand über dessen Polster oben und unten — die ganze Zeile
      bleibt antippbar und 48 px hoch.
    */
    return (
      <>
        <div className="abschnitt">
          <h3 className="w-full">
            <button
              type="button"
              aria-expanded={!!offen}
              aria-controls={steuert}
              onClick={onUmschalten}
              className="-my-3 flex min-h-touch w-full items-center gap-3 px-0 py-2 text-left"
            >
              <span className="abschnitt-kopf min-w-0">
                <Kopf titel={titel} anzahl={anzahl} />
              </span>
              <span className="abschnitt-linie" aria-hidden="true" />
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
          <Kopf titel={titel} anzahl={anzahl} />
        </h3>
        <span className="abschnitt-linie" aria-hidden="true" />
        {link}
      </div>
      {children}
    </>
  );
}
