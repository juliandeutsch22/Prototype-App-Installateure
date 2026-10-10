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
      <th colSpan={spalten} scope="rowgroup" className="border-b border-line bg-surface-2 p-0 text-left">
        <button type="button" className="planung-gruppe" aria-expanded={offen} onClick={onUmschalten}>
          <span aria-hidden="true">{offen ? '▾' : '▸'}</span>
          {gruppe.name} · {gruppe.leute.length}
        </button>
      </th>
    </tr>
  );
}
