import type { LeistungsnachweisZeile, TimeEntry } from '@/types';
import type { AssembledInvoice } from './assemble';
import { calcWorkMin } from '@/lib/time';
import { istLehrlingssatz, satzklasse } from '@/lib/einstufung';

/*
  EIGENE DATEI, nicht in `pdf.ts`: die Ansicht braucht die Zeilen beim
  Ausstellen, um sie am Beleg festzuhalten (G6), und `pdf.ts` zieht jsPDF
  mit — das gehört nicht ins Paket, das jeder beim Anmelden lädt.
*/

/**
 * Die Spalte „Typ“ im Leistungsnachweis — seit dem 30.09.2026 aus dem Satz
 * der Buchung (Testbericht 4.1). Das Lehrjahr steht an der Rechnungszeile;
 * hier genügt „Lehrling“.
 */
export function typAufDemNachweis(e: Pick<TimeEntry, 'satz' | 'isHelper'>): string {
  const k = satzklasse(e);
  if (k === 'helfer') return 'Helfer';
  if (k === 'obermonteur') return 'Obermonteur';
  if (istLehrlingssatz(k)) return 'Lehrling';
  return 'Fachkraft';
}

/**
 * Die Zeilen des Leistungsnachweises aus den Buchungen einer Vorschau — EINE
 * Stelle für den ersten Druck und das Festhalten am Beleg (G6). Was hier
 * steht, steht so auf dem PDF und so in `invoices.leistungsnachweis`; der
 * Nachdruck druckt es von dort, ohne neu zu rechnen.
 */
export function leistungsnachweisZeilen(
  assembled: Pick<AssembledInvoice, 'entries' | 'taetigkeiten'>,
): LeistungsnachweisZeile[] {
  return [...assembled.entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      uid: e.userId ?? null,
      datum: e.date,
      mitarbeiter: e.userName ?? '',
      typ: typAufDemNachweis(e),
      // Ganz, nicht auf 60 Zeichen gekappt: die Tabelle bricht um, und ein
      // abgeschnittener Satz belegt nichts. Die Notiz der Buchung, sonst die
      // Tätigkeit aus dem Schein (G17).
      taetigkeit: e.comment?.trim() || assembled.taetigkeiten?.[e.id] || '',
      minuten: calcWorkMin(e),
    }));
}
