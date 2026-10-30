import type { Gruppe } from './planTypen';

/*
  DER GRUPPENKOPF (Einstufung) — benutzen das Raster der Einsatzplanung, die
  Team-Woche und der Monat. Hier stand bis 10.10.2026 auch das ältere Raster
  der Team-Woche; sie zeichnet seither mit den Bausteinen der Planung
  (`WochenRaster`, `HandyWoche`, je mit `lesen`).
*/

/**
 * Ein Gruppenkopf (Einstufung) — nur, wenn es mehr als eine Gruppe gibt.
 * Eingeklappt bleiben die Zeilen weg; der Kopf sagt, wie viele es sind.
 *
 * SEIT DER PLANLINIE (B5) die Achse: die Zahl im Achskreis vor dem Namen,
 * dahinter die Achslinie und der Winkel fürs Auf- und Zuklappen. Ersetzt
 * „▾ Facharbeiter · 2“ auf grauer Fläche. Der Name für die Vorlesehilfe
 * bleibt „Facharbeiter · 2“ — so heißt der Knopf wie vorher.
 */
export function GruppenKopf({
  gruppe,
  spalten,
  offen,
  onUmschalten,
}: {
  gruppe: Gruppe;
  spalten: number;
  offen: boolean;
  onUmschalten: () => void;
}) {
  return (
    <tr>
      <th colSpan={spalten} scope="rowgroup" className="planung-gruppe-zelle">
        <GruppenAchse gruppe={gruppe} offen={offen} onUmschalten={onUmschalten} />
      </th>
    </tr>
  );
}

/**
 * Der Knopf einer Gruppe als Achse — im Raster der Woche und im Monat
 * derselbe, damit beide dieselbe Achse zeigen.
 *
 * DIE ACHSLINIE ZIEHT IN DER WOCHE DIE ZELLE (`.planung-gruppe-zelle`):
 * dort rollt das Raster am Tablet seitlich, und der Knopf bleibt wie die
 * Namensspalte links stehen (`sticky`) — die Linie muss trotzdem bis ans
 * Ende der Tabelle reichen. Im Monat rollt nichts; dort steht sie im Knopf
 * (`linie`).
 */
export function GruppenAchse({
  gruppe,
  offen,
  onUmschalten,
  linie = false,
}: {
  gruppe: Gruppe;
  offen: boolean;
  onUmschalten: () => void;
  /** Monat: der Knopf ist die ganze Zeile und trägt die Linie selbst. */
  linie?: boolean;
}) {
  return (
    <button
      type="button"
      className={linie ? 'mo-gruppe' : 'planung-gruppe'}
      aria-expanded={offen}
      aria-label={`${gruppe.name} · ${gruppe.leute.length}`}
      onClick={onUmschalten}
    >
      <span className="gruppe-winkel" aria-hidden="true">
        {offen ? '▾' : '▸'}
      </span>
      <span className="achskreis" aria-hidden="true">
        {gruppe.leute.length}
      </span>
      <span className="gruppe-name">{gruppe.name}</span>
      {linie && <span className="abschnitt-linie" aria-hidden="true" />}
    </button>
  );
}
