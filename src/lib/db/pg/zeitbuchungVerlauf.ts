/**
 * Das Änderungsprotokoll der Zeitbuchungen (E50) — nur lesen.
 *
 * Geschrieben wird es ausschließlich vom Trigger an `time_entries`
 * (`20261105100000_zeitbuchung_verlauf.sql`); die App hat dafür keinen Weg,
 * und es soll auch keinen geben. Lesen darf, wer die Buchung lesen darf.
 */
import { abfragen } from './kern';

export type VerlaufArt = 'angelegt' | 'geaendert' | 'geloescht';

export interface VerlaufZeile {
  eintragId: string;
  userId: string;
  datum: string;
  art: VerlaufArt;
  /**
   * Beim Anlegen und Löschen der ganze Stand der Buchung, beim Ändern je
   * geänderter Spalte `{ alt, neu }` — Spaltennamen der Datenbank, Werte wie
   * Postgres sie liefert („07:00:00“).
   */
  aenderungen: Record<string, unknown>;
  vonUid?: string;
  vonName?: string;
  /** Millisekunden — `am` ist ein Zeitpunkt (`spaltentypen.ts`). */
  am: number;
}

/** Der Verlauf EINER Buchung, ältester Eintrag zuerst. */
export function listVerlaufEintrag(companyId: string, eintragId: string) {
  return abfragen<VerlaufZeile>('zeitbuchung_verlauf', companyId, {
    wo: [{ art: 'gleich', feld: 'eintragId', wert: eintragId }],
    sortiere: { feld: 'am' },
  });
}

/**
 * Was an den Buchungen einer Person in einem Zeitraum geschah — auch an
 * gelöschten, neueste zuerst. Der Zeitraum gilt für den Tag der Buchung.
 */
export function listVerlaufZeitraum(companyId: string, userId: string, von: string, bis: string) {
  return abfragen<VerlaufZeile>('zeitbuchung_verlauf', companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: userId },
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
    sortiere: { feld: 'am', absteigend: true },
  });
}
