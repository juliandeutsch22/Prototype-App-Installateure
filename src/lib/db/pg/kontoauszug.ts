/**
 * Kontoauszug abgleichen (F13) — auf Postgres.
 *
 * Gelesen und zugeordnet wird im Browser; hierher kommt nur, was bestätigt
 * ist. Verbucht wird in EINEM Aufruf (`kontoauszug_verbuchen`), je Bewegung
 * ganz oder gar nicht, mit der Wiederholungssperre der Datenbank.
 */
import type { RechnungsKopf } from '@/types';
import { abfragen, derClient, type WithId } from './kern';

/** Eine bestätigte Bewegung, wie sie an die Datenbank geht. */
export interface ZuVerbuchen {
  kennung: string;
  buchungstag: string;
  betrag: number;
  hinweis?: string;
  /** `aus`: eine Abbuchung — die Teile sind Rückzahlungen eines Guthabens. Ohne Angabe ein Eingang. */
  richtung?: 'ein' | 'aus';
  teile: { rechnung: string; betrag: number; skonto: number; mahnkosten: number; rueckzahlung?: number }[];
}

export interface VerbuchtErgebnis {
  kennung: string;
  ergebnis: 'gebucht' | 'schon_verbucht' | 'abgewiesen';
  grund?: string;
}

/** Wie viele Bewegungen die Datenbank je Aufruf annimmt. */
export const JE_AUFRUF = 500;

export async function kontoauszugVerbuchen(posten: ZuVerbuchen[]): Promise<VerbuchtErgebnis[]> {
  const ergebnisse: VerbuchtErgebnis[] = [];
  // In Blöcken: jeder Block ist für sich eine Transaktion; ein Auszug mit 1.200 Eingängen geht in drei.
  for (let i = 0; i < posten.length; i += JE_AUFRUF) {
    const { data, error } = await derClient().rpc('kontoauszug_verbuchen', { p_posten: posten.slice(i, i + JE_AUFRUF) });
    if (error) throw new Error(error.message);
    for (const z of (data as { kennung: string; ergebnis: VerbuchtErgebnis['ergebnis']; grund?: string }[] | null) ?? []) {
      ergebnisse.push({ kennung: z.kennung, ergebnis: z.ergebnis, ...(z.grund ? { grund: z.grund } : {}) });
    }
  }
  return ergebnisse;
}

/** Welche dieser Kennungen schon verbucht sind — ein lesender Aufruf (`LESENDE_FUNKTIONEN`). */
export async function kontoauszugSchonVerbucht(kennungen: string[]): Promise<Map<string, { am: number; von?: string }>> {
  const raus = new Map<string, { am: number; von?: string }>();
  for (let i = 0; i < kennungen.length; i += JE_AUFRUF) {
    const { data, error } = await derClient().rpc('kontoauszug_schon_verbucht', { p_kennungen: kennungen.slice(i, i + JE_AUFRUF) });
    if (error) throw new Error(error.message);
    for (const z of (data as { kennung: string; verbucht_am: string; verbucht_von_name: string | null }[] | null) ?? []) {
      raus.set(z.kennung, { am: Date.parse(z.verbucht_am), ...(z.verbucht_von_name ? { von: z.verbucht_von_name } : {}) });
    }
  }
  return raus;
}

/**
 * Rechnungen nach Nummer — die Köpfe, ohne Positionen. Für Nummern im
 * Verwendungszweck, die unter den offenen Rechnungen nicht stehen (schon
 * bezahlt, storniert): der Abgleich soll sagen, was mit ihnen ist, statt die
 * Zahlung als „nicht zuordenbar“ stehen zu lassen.
 */
export async function rechnungsKoepfeNachNummer(companyId: string, nummern: string[]): Promise<WithId<RechnungsKopf>[]> {
  if (nummern.length === 0) return [];
  return abfragen<RechnungsKopf>('invoices', companyId, {
    wo: [{ art: 'in', feld: 'invoiceNumber', werte: [...new Set(nummern)] }],
  });
}

/**
 * Rechnungen mit Guthaben des Kunden — die Köpfe. Für Abbuchungen im
 * Kontoauszug: eine Rückzahlung gehört zu einer überzahlten oder stornierten,
 * aber bezahlten Rechnung (`zahlstand().guthaben`).
 */
export async function rechnungsKoepfeMitGuthaben(companyId: string): Promise<WithId<RechnungsKopf>[]> {
  return abfragen<RechnungsKopf>('invoices', companyId, {
    oder: 'payment_status.eq.Überzahlt,and(payment_status.eq.Storniert,bezahlt_betrag.gt.0)',
  });
}
