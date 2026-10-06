import type { Invoice } from '@/types';

/**
 * DAS BELEGDATUM EINER STORNORECHNUNG — AN EINER STELLE (Runde 3, M7).
 *
 * RE-2026-1503 stand in Rechnungsliste und PDF mit 30.09.2026, im
 * Ausgangsbuch und im BMD-Stapel mit 25.09.2026: Liste und Beleg nahmen den
 * Tag der Ausstellung, Journal und Stapel den Tag des Stornos. Jetzt fragen
 * alle hier.
 *
 * VORLÄUFIG GILT DER TAG DER AUSSTELLUNG — das Datum, das auf dem Beleg
 * steht und zur Nummer passt (H6 vom 30.09.). Ohne ausgestellte
 * Stornorechnung zählt der Tag des Stornos. Welches Datum die Buchung trägt,
 * entscheidet die Steuerberatung (offene Frage); umgestellt wird dann nur
 * hier.
 *
 * Gerechnet in Wiener Zeit — ein Storno um 00:30 gehört zum Tag in Wien,
 * nicht zum Vortag in UTC und nicht zur Zeitzone des Rechners.
 */
export function stornoBelegTag(i: Pick<Invoice, 'stornoAm' | 'cancelledAt'>): string | null {
  const t = i.stornoAm ?? i.cancelledAt;
  return t != null ? wienerTag(t) : null;
}

/** Der Kalendertag eines Zeitpunkts in Wien, `JJJJ-MM-TT`. */
export function wienerTag(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date(ms));
}
