/**
 * Die Obergrenze des Materialkatalogs — und die Frage, ob sie greift.
 *
 * WARUM EINE EIGENE DATEI. Sechs Ansichten stellen dieselbe Frage, und eine
 * falsche Antwort sähe an jeder Stelle anders aus: mal eine leere Suche, mal
 * eine zu niedrige Materialkostensumme. Sie steht deshalb an EINEM Ort — und
 * ohne Firebase-Abhängigkeit, damit sie überall zu haben ist, wo sie gebraucht
 * wird, und in den Tests nicht nachgebaut werden muss.
 */

/**
 * Wie viele Artikel höchstens geholt werden.
 *
 * BIS HIERHER GAB ES KEINE GRENZE — in sechs Ansichten, vier davon als
 * Live-Abo. Bei ein paar hundert von Hand gepflegten Artikeln ist das
 * harmlos; es wächst nur ohne jedes Signal, und bemerkt würde es an dem Tag,
 * an dem die Anwendung stehen bleibt.
 *
 * TAUSEND, nicht mehr: ein von Hand gepflegter Katalog liegt bei einigen
 * hundert Artikeln, die Grenze greift also heute nirgends. Sie ist eine
 * Sicherung, keine Portionierung — und wo sie doch greift, sagt es die
 * Ansicht und lädt auf Knopfdruck nach.
 *
 * WAS SIE NICHT LÖST: einen Datanorm-Import. Ein Großhandelskatalog hat
 * 50.000 bis 500.000 Artikel, und dann ist eine Suche über den geladenen
 * Bestand nutzlos, egal wie hoch die Grenze steht. Dafür braucht es eine
 * serverseitige Suche — eine eigene Entscheidung mit eigenem Preis, siehe
 * `features/projects/baustellenSuche.ts`. Diese Grenze ist die Vorbedingung
 * dafür, nicht der Ersatz.
 */
export const KATALOG_GRENZE = 1000;

/**
 * Ist der Katalog an der Grenze abgeschnitten?
 *
 * `>=`, nicht `>`: genau an der Grenze weiss niemand, ob noch etwas käme.
 * Das ist dieselbe Lesart wie beim Nachladen der übrigen Listen — lieber
 * einmal zu oft gefragt als einmal zu wenig gesagt.
 */
export function katalogAbgeschnitten(artikel: readonly unknown[], grenze = KATALOG_GRENZE) {
  return artikel.length >= grenze;
}
