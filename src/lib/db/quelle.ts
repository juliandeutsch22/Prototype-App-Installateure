/**
 * Woher die Datenschicht ihre Daten nimmt.
 *
 * WARUM EIN SCHALTER UND KEIN HARTER SCHNITT. Der Umzug läuft über mehrere
 * Stufen, und die App muss in jeder davon lauffähig bleiben — sie liegt ja
 * live. Ein Modul, das heute auf Postgres umgestellt wird, während die
 * anderen neunzehn noch auf Firestore lesen, ergäbe eine App, die ihre
 * eigenen Daten nicht mehr findet.
 *
 * Der Schalter ist KEIN Parallelbetrieb mit zwei Datenbanken. Es läuft immer
 * genau eine; die andere Seite ist toter Code, den Stufe 9 entfernt. Der
 * Unterschied ist wesentlich: doppelt SCHREIBEN verdoppelt die Fehlerfläche,
 * ein Schalter tut das nicht.
 *
 * Umgelegt wird er in Stufe 8, und zwar an einer Stelle — nicht
 * modulweise im Betrieb.
 */

/**
 * Liest `VITE_DATENQUELLE`. Alles ausser `postgres` heisst Firestore.
 *
 * Ausdrücklich so herum: wer die Variable vergisst, bekommt den Stand, der
 * heute läuft, und nicht eine leere Datenbank.
 */
export function nutztPostgres(): boolean {
  return import.meta.env.VITE_DATENQUELLE === 'postgres';
}
