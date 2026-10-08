/**
 * Zahlungseingänge — was auf eine Rechnung tatsächlich hereingekommen ist.
 *
 * DIE SCHREIBSEITE IST ABSICHTLICH SCHMAL: anlegen, ändern, löschen. Der
 * Zahlungsstand der Rechnung wird hier NICHT mitgeschrieben — das tut ein
 * Trigger in der Datenbank (`app.zahlstand_setzen`), und er ist die einzige
 * Stelle, die es darf. Zwei Wege zu derselben Zahl wären zwei Wahrheiten.
 */
import type { Zahlungseingang } from '@/types';
import { abfragen, anlegen, aendern, loeschen, derClient, type WithId } from './kern';
import { objektAlsZeile } from './felder';

const ZAHLUNGEN = 'zahlungseingaenge';

/**
 * Die Eingänge EINER Rechnung, ältester zuerst.
 *
 * Die Reihenfolge ist die des Kontoauszugs und nicht die der Erfassung: so
 * liest sich die Liste wie der Verlauf der Forderung — 400, dann 600.
 */
export function listZahlungen(companyId: string, invoiceId: string, max = 100) {
  return abfragen<Zahlungseingang>(ZAHLUNGEN, companyId, {
    wo: [{ art: 'gleich', feld: 'invoiceId', wert: invoiceId }],
    sortiere: { feld: 'datum' },
    grenze: max,
  });
}

/**
 * Die Eingänge eines ZEITRAUMS — für den Buchhaltungs-Export.
 *
 * Begrenzt durch den Zeitraum und nicht durch eine Zeilenzahl: ein Monat hat
 * so viele Zahlungen, wie er hat, und eine Liste, die davon die ersten
 * fünfzig zeigt, wäre im Journal ein Fehler und keine Kürzung.
 */
export function listZahlungenImZeitraum(
  companyId: string, von: string, bis: string, max?: number,
) {
  return abfragen<Zahlungseingang>(ZAHLUNGEN, companyId, {
    wo: [
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
    sortiere: { feld: 'datum' },
    grenze: max,
  });
}

export type NeueZahlung = Omit<
  Zahlungseingang, 'id' | 'companyId' | 'createdAt' | 'updatedAt'
>;

export function createZahlung(companyId: string, z: NeueZahlung): Promise<string> {
  return anlegen(ZAHLUNGEN, companyId, z);
}

/**
 * Eine Zahlung und den Skonto, der den Rest ausgleicht — in EINEM Aufruf.
 *
 * Ein Insert mit zwei Zeilen ist eine Transaktion: weist die Datenbank den
 * Skonto ab (`app.skonto_passt`), ist auch die Zahlung nicht gebucht. Zwei
 * Aufrufe hinterliessen sonst eine Zahlung ohne Ausgleich, und die Rechnung
 * stünde mit zwei Prozent Rest im Mahnlauf.
 */
export async function createZahlungMitSkonto(
  companyId: string, z: NeueZahlung, skonto: number,
): Promise<void> {
  const zeilen = [z, { ...z, betrag: skonto, art: 'Skonto' as const, hinweis: undefined }]
    .map((d) => ({ ...objektAlsZeile(ZAHLUNGEN, d), company_id: companyId }));
  const { error } = await derClient().from(ZAHLUNGEN).insert(zeilen);
  if (error) throw new Error(error.message);
}

export function updateZahlung(id: string, daten: Partial<NeueZahlung>): Promise<void> {
  return aendern(ZAHLUNGEN, id, daten);
}

/**
 * Einen Eingang löschen.
 *
 * ANDERS ALS BEI DER RECHNUNG IST DAS RICHTIG. Die Rechnung ist der Beleg
 * (§ 132 BAO, sieben Jahre); ihre Korrektur heisst Storno. Ein
 * Zahlungseingang ist die Notiz des Betriebs über einen Kontoauszug — wer
 * sich beim Betrag vertippt, muss das geradebiegen können, ohne eine
 * erfundene Gegenbuchung in die Bücher zu schreiben.
 */
export function deleteZahlung(id: string): Promise<void> {
  return loeschen(ZAHLUNGEN, id);
}

export type { WithId };
