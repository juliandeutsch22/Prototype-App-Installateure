/**
 * Wie weit die Nachschlage-Listen reichen — und die Frage, ob die Grenze
 * greift.
 *
 * WARUM EINE EIGENE DATEI. Ein Dutzend Ansichten stellt dieselbe Frage, und
 * eine falsche Antwort sähe an jeder Stelle anders aus: mal eine leere Suche,
 * mal ein Kunde, der im Auswahlfeld fehlt, mal eine zu niedrige
 * Materialkostensumme. Sie steht deshalb an EINEM Ort — und ohne
 * Firebase-Abhängigkeit, damit sie überall zu haben ist, wo sie gebraucht
 * wird, und in den Tests nicht nachgebaut werden muss.
 *
 * DREI LISTEN, DREI GRÜNDE. Keine davon wächst mit der ZEIT — dafür sorgen
 * Statusfilter und die Natur der Sache. Alle drei wachsen mit dem BETRIEB,
 * und keine wird je kleiner. Eine Grenze ohne Ansage wäre bei jeder von ihnen
 * ein stiller Verlust an einer Stelle, an der man ihn nicht sucht.
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
export function abgeschnitten(zeilen: readonly unknown[], grenze: number) {
  return zeilen.length >= grenze;
}

/** Der Materialkatalog. Eigener Name, weil sechs Ansichten ihn nennen. */
export function katalogAbgeschnitten(artikel: readonly unknown[], grenze = KATALOG_GRENZE) {
  return abgeschnitten(artikel, grenze);
}

/**
 * Wie viele Kunden höchstens geholt werden.
 *
 * DIESE GRENZE GAB ES SCHON — sie stand als Standardwert in `listCustomers`
 * und sagte nichts. Damit war sie die einzige Liste der App, die noch
 * stillschweigend abschnitt: „keine Liste schneidet mehr ab" (L2) hatte sie
 * übersehen, weil sie eine Grenze HAT und dem Wächter deshalb genügte.
 *
 * Der Schaden wäre nicht die Kundenliste selbst, sondern die
 * AUSWAHLFELDER: vier Masken bieten Kunden zum Zuordnen an — Baustelle,
 * Angebot, Rechnung, Wartung. Fehlt einer davon, legt jemand die Baustelle
 * ohne Kunden an oder tippt den Namen von Hand. Genau die Dublette, gegen
 * die die Kundenstammdaten eingeführt wurden.
 */
export const KUNDEN_GRENZE = 500;

export function kundenAbgeschnitten(kunden: readonly unknown[], grenze = KUNDEN_GRENZE) {
  return abgeschnitten(kunden, grenze);
}

/**
 * Wie viele laufende Baustellen höchstens geholt werden.
 *
 * `listActiveProjects` filtert auf „Aktiv" und „Pausiert" und genügte dem
 * Wächter damit — abgeschlossene fallen weg, und die machen mit der Zeit den
 * Grossteil aus. Das stimmt, und es ist trotzdem keine Grenze: die Zahl der
 * OFFENEN Baustellen wächst nicht mit der Zeit, wohl aber mit dem Betrieb,
 * und sie wird nie wieder kleiner.
 *
 * FÜNFHUNDERT, weil hier die Baustellenauswahl beim BUCHEN hängt. Fehlt dort
 * eine Baustelle, bucht der Monteur auf die falsche oder gar nicht — und das
 * ist teurer als eine lange Liste. Die Grenze ist als Sicherung gedacht und
 * greift bei einem Betrieb dieser Grösse nirgends.
 */
export const BAUSTELLEN_AUSWAHL_GRENZE = 500;

export function baustellenAuswahlAbgeschnitten(
  baustellen: readonly unknown[],
  grenze = BAUSTELLEN_AUSWAHL_GRENZE,
) {
  return abgeschnitten(baustellen, grenze);
}
