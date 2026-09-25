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
 *
 * ER STEHT IM KARTENFUSS (`<Card footer={…}>`), wie „Ältere Einträge laden"
 * in der Zeiterfassung — so endet jede Liste gleich. Die Aufrufstelle gibt
 * ihn dort nur hinein, wenn die Grenze greift (`abgeschnitten` aus
 * `lib/listengrenzen`): ein Fuß ohne Inhalt stünde sonst als leerer Streifen
 * mit Linie unter der Karte. Die Prüfung hier drinnen bleibt trotzdem — sie
 * ist die, auf die sich der Baustein selbst verlässt.
 */
export default function Nachladen({
  geladen,
  grenze,
  laeuft,
  onMehr,
  einheit,
  sucheImBrowser = true,
  sucheSatz,
  imInhalt = false,
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
  /**
   * Ein genauerer Satz zur Reichweite der Suche.
   *
   * Der Standardsatz stimmt für die meisten Listen. Wo ein Teil der Suche
   * SEHR WOHL auf den Server geht — die Baustellen über ihre Nummer —, wäre
   * er falsch, und eine Auskunft, die einmal danebenlag, wird beim nächsten
   * Mal nicht mehr geglaubt.
   */
  sucheSatz?: string;
  /**
   * Steht der Hinweis mitten in einer Karte statt in ihrem Fuß?
   *
   * Im Kartenfuß tragen `.karte-fuss` Haarlinie und Abstand. Nur wo nach
   * der Liste in derselben Karte noch etwas kommt, das man erst nach dem
   * Hinweis lesen soll — der Katalog der
   * Materialanforderung vor „Nicht im Katalog?" —, steht er im Inhalt und
   * bringt seine Linie selbst mit.
   */
  imInhalt?: boolean;
}) {
  /*
    NUR WENN DIE GRENZE WIRKLICH GREIFT. Steht die Liste bei 43 von 500, ist
    nichts abgeschnitten und ein Hinweis wäre Lärm — und Lärm gewöhnt man sich
    ab, gerade den, der einmal im Jahr wichtig wäre.
  */
  if (geladen < grenze) return null;

  return (
    <div className={imInhalt ? 'nachladen-im-inhalt' : 'nachladen'}>
      <Button variant="secondary" loading={laeuft} onClick={onMehr}>
        Weitere {einheit} laden
      </Button>
      <span className="nachladen-hinweis">
        {geladen} von möglicherweise mehr geladen.
        {sucheImBrowser ? ` ${sucheSatz ?? 'Die Suche geht nur über diese.'}` : ''}
      </span>
    </div>
  );
}
