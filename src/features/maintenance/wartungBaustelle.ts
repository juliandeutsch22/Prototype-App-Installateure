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

/*
 * DIE NUMMER KOMMT NICHT MEHR VON HIER. Bis zum 23.09.2026 stand hier ein
 * eigener Vorschlag nach dem Muster „2026-014" — ohne den Vorsatz, den der
 * Betrieb eingestellt hat. Die Wartung nutzt jetzt denselben Weg wie „Neue
 * Baustelle": Vorschlag nach dem Schema des Betriebs, verbindlich aus dem
 * Zähler, eine eigene Nummer bleibt erlaubt (siehe `WartungenView`).
 */

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
