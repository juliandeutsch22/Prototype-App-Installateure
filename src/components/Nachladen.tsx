import Button from './Button';

/**
 * „So weit reicht diese Liste — und hier ist mehr."
 *
 * WARUM DAS EIN EIGENER BAUSTEIN IST. Jede Liste dieser App hat eine
 * Obergrenze, und bis zum 08.09.2026 sagte keine einzige, wenn sie erreicht
 * war. Das ist kein Geschwindigkeitsproblem, es ist ein Wahrheitsproblem: der
 * 501. Kunde existierte für die App schlicht nicht — nicht in der Kundenliste,
 * nicht im Rechnungsformular, nicht bei den Wartungen. Und nichts sagte es.
 *
 * Eine stillschweigend abgeschnittene Liste ist schlimmer als eine langsame.
 * Bei der langsamen wartet man; bei der abgeschnittenen trifft man
 * Entscheidungen über einen Bestand, den man für vollständig hält.
 *
 * DIE SUCHE IST DER GRUND FÜR DEN ZWEITEN SATZ. Sie läuft in den meisten
 * Ansichten im Browser und damit nur über das GELADENE. Ohne diesen Hinweis
 * sucht jemand einen alten Kunden, findet nichts und schliesst daraus, es
 * gebe ihn nicht — der Fehler wird also gerade dort gefährlich, wo jemand
 * gezielt nachschlägt.
 */
export default function Nachladen({
  geladen,
  grenze,
  laeuft,
  onMehr,
  einheit,
  sucheImBrowser = true,
}: {
  /** Wie viele Datensätze gerade da sind. */
  geladen: number;
  /** Wie viele höchstens geholt wurden. */
  grenze: number;
  laeuft?: boolean;
  onMehr: () => void;
  /** „Kunden", „Baustellen" — im Plural, klein geschrieben. */
  einheit: string;
  /** Läuft die Suche dieser Ansicht nur über das Geladene? */
  sucheImBrowser?: boolean;
}) {
  /*
    NUR WENN DIE GRENZE WIRKLICH GREIFT. Steht die Liste bei 43 von 500, ist
    nichts abgeschnitten und ein Hinweis wäre Lärm — und Lärm gewöhnt man sich
    ab, gerade den, der einmal im Jahr wichtig wäre.
  */
  if (geladen < grenze) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
      <Button variant="secondary" loading={laeuft} onClick={onMehr}>
        Weitere {einheit} laden
      </Button>
      <span className="text-sm text-ink-muted">
        {geladen} von möglicherweise mehr geladen.
        {sucheImBrowser ? ' Die Suche geht nur über diese.' : ''}
      </span>
    </div>
  );
}
