import type { Invoice, RechnungsArt } from '@/types';

/**
 * Haft- und Deckungsrücklass (Stand-Datei 11.1, Punkt 5).
 *
 * HAFTRÜCKLASS: der Kunde behält einen Teil der Rechnung über die ganze
 * Leistung ein, bis die Gewährleistung abläuft — bei Bauleistungen meist drei
 * Jahre. DECKUNGSRÜCKLASS: ein Teil jeder Teilrechnung, bis abgerechnet ist.
 *
 * Beide mindern den ZAHLBETRAG, nicht das Entgelt: Die Umsatzsteuer steht
 * voll auf der Rechnung. Als Rabatt gebucht, wäre die UVA falsch.
 */

export type RuecklassArt = NonNullable<Invoice['ruecklassArt']>;

export const RUECKLASS_NAME: Record<RuecklassArt, string> = {
  haft: 'Haftrücklass',
  deckung: 'Deckungsrücklass',
};

/** Welcher Rücklass zu welcher Rechnungsart passt — Anzahlungen tragen keinen. */
export function ruecklassArtFuer(art: RechnungsArt): RuecklassArt | null {
  if (art === 'teil') return 'deckung';
  if (art === 'einzel' || art === 'schluss') return 'haft';
  return null;
}

/**
 * Der Betrag, brutto, auf den Cent — dieselbe Formel rechnet die Datenbank
 * in `rechnung_anlegen` nach.
 *
 * DIE GRUNDLAGE IST DIE GANZE LEISTUNG (bei der Schlussrechnung vor Abzug der
 * Teilrechnungen), einbehalten wird aber höchstens, was diese Rechnung noch
 * fordert.
 */
export function ruecklassBetrag(o: { grundlageBrutto: number; prozent: number; forderungBrutto: number }): number {
  const roh = Math.round(o.grundlageBrutto * o.prozent) / 100;
  return Math.min(roh, o.forderungBrutto);
}

/** Vorschlag für die Fälligkeit eines Haftrücklasses: drei Jahre Gewährleistung. */
export function haftruecklassBisVorschlag(rechnungsdatum: string): string {
  const d = new Date(`${rechnungsdatum}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 3);
  return d.toISOString().slice(0, 10);
}
