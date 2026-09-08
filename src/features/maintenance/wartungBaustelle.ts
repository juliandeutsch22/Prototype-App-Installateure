import type { Customer, Project, Wartung } from '@/types';

/**
 * Aus einer fälligen Wartung eine Baustelle machen.
 *
 * WARUM DAS FEHLTE UND WARUM ES ZÄHLT. Die Wartungsliste sagte, was fällig
 * ist — und hörte dort auf. Alles Weitere lief von Hand: Baustelle anlegen,
 * Kundennamen abtippen, Adresse abtippen, einplanen, und nach getaner Arbeit
 * die Projektnummer in den Erledigt-Dialog zurücktippen. Vier Wege durch die
 * App für einen Vorgang, der aus der Liste heraus einer sein sollte.
 *
 * Schlimmer als die Tipparbeit war, dass die Liste den Fortschritt NICHT
 * kannte. Wer sie am Montag durchgeht und drei Baustellen anlegt, sieht am
 * Dienstag dieselben drei Zeilen im selben Rot: „fällig" hiess sowohl „noch
 * nichts passiert" als auch „steht längst im Einsatzplan". Beim zweiten
 * Durchgang entsteht die Baustelle ein zweites Mal.
 */

/** Wie eine Projektnummer aussieht, wenn sie unserem Muster folgt: 2026-014. */
const MUSTER = /^(\d{4})-(\d+)$/;

/**
 * Ein VORSCHLAG für die nächste Projektnummer — kein gezogener Zähler.
 *
 * DAS IST EIN BEWUSSTER UNTERSCHIED ZUR RECHNUNG. Rechnungsnummern kommen aus
 * `counters`, weil eine doppelte oder fehlende Nummer dort ein Mangel der
 * Buchhaltung ist (§ 11 UStG). Projektnummern vergibt der Betrieb frei — hier
 * ist auch „W-2026-3" oder „Huber-Therme" gültig, und in manchen Betrieben
 * hängt die Nummer am Auftrag des Kunden.
 *
 * Ein Zähler würde diese Freiheit stillschweigend abschaffen. Deshalb: das
 * Muster wird ERKANNT, wenn es da ist, und der Vorschlag steht danach in
 * einem Feld, das man überschreiben kann. Folgt keine vorhandene Nummer dem
 * Muster, beginnt der Vorschlag beim ersten des Jahres — dann hat der Betrieb
 * ein eigenes System, und die Zahl ist ohnehin nur ein Startwert.
 *
 * Weil es kein Zähler ist, kann der Vorschlag doppelt sein, wenn zwei Leute
 * gleichzeitig anlegen. Genau deshalb prüft der Aufrufer die Nummer noch
 * einmal gegen die vorhandenen, bevor er speichert — siehe `nummerFrei`.
 */
export function naechsteProjektnummer(vorhandene: string[], jahr: number): string {
  let hoechste = 0;
  let stellen = 3;
  for (const nr of vorhandene) {
    const treffer = MUSTER.exec(nr.trim());
    if (!treffer || Number(treffer[1]) !== jahr) continue;
    const laufend = Number(treffer[2]);
    if (laufend > hoechste) hoechste = laufend;
    // Die Breite vom Bestand übernehmen: wer dreistellig führt, bekommt
    // dreistellig zurück, und die Liste sortiert weiter als Text richtig.
    if (treffer[2].length > stellen) stellen = treffer[2].length;
  }
  return `${jahr}-${String(hoechste + 1).padStart(stellen, '0')}`;
}

/** Ist die Nummer noch frei? Gross-/Kleinschreibung und Leerraum ignoriert. */
export function nummerFrei(nummer: string, vorhandene: string[]): boolean {
  const gesucht = nummer.trim().toLowerCase();
  if (!gesucht) return false;
  return !vorhandene.some((n) => n.trim().toLowerCase() === gesucht);
}

/**
 * Die Baustelle, wie sie aus der Wartung entsteht.
 *
 * DIE ADRESSE IST DER GRUND, WARUM DAS EINE EIGENE FUNKTION IST. Eine
 * Hausverwaltung hat eine Rechnungsadresse und zwanzig Heizungen an zwanzig
 * anderen; die Anlagenadresse der Wartung gewinnt deshalb immer, und die
 * Kundenadresse tritt nur ein, wenn dort nichts steht. Andersherum führe der
 * Monteur zur Hausverwaltung.
 *
 * `billingMode` bleibt OFFEN. Ob eine Wartung pauschal oder nach Aufwand
 * abgerechnet wird, steht im Wartungsvertrag und nicht in dieser App; eine
 * Vorbelegung wäre eine Behauptung über den Vertrag, und sie stünde auf jedem
 * Handwerksschein.
 */
export function baustelleAusWartung(
  wartung: Wartung,
  kunde: Customer | undefined,
  projectNumber: string,
): Omit<Project, 'id' | 'companyId' | 'createdAt'> {
  const beschreibung = [`Wartung: ${wartung.anlage}`.trim(), wartung.hinweis?.trim()]
    .filter(Boolean)
    .join(' · ');
  return {
    projectNumber: projectNumber.trim(),
    // Die Verknüpfung mitnehmen, nicht nur den Namen: sonst hinge die neue
    // Baustelle in der Kundenakte nicht mit drin, und genau dort sucht sie
    // jemand, der den Kunden am Telefon hat.
    customerId: wartung.customerId || undefined,
    customerName: wartung.customerName,
    address: wartung.address?.trim() || kunde?.address || undefined,
    description: beschreibung,
    status: 'Aktiv',
  };
}
