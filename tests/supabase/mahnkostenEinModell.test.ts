/**
 * Mahnspesen und Zinsen nach einem Modell (Durchsicht 15.11.2026, G3) —
 * gegen die Datenbank.
 *
 * Das Schreiben nennt die ganze Mahnforderung der Rechnung (`forderung`);
 * die Verbuchung lässt genau sie zu. Vorher galt „letzte Mahnung minus alle
 * bisherigen Mahnkosten“: nach einer Teilzahlung ließ sich nicht verbuchen,
 * was Mahnung 3 verlangte — der Rest wurde Guthaben. Ohne
 * `20261116050600_mahnkosten_ein_modell.sql` ist die erste Prüfung rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, mahnInhalt, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlungAufgeteilt } from '@/lib/db/pg/zahlungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'mahnkosten-g3';
let buch: Konto;
let kunde: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g3buch');
  kunde = crypto.randomUUID();
  await admin.from('customers').insert({
    id: kunde, company_id: BETRIEB, name: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf', kundenart: 'privat',
  });
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}
const JAHR = Number(heute().slice(0, 4));

async function ueberfaellig(): Promise<string> {
  const r = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-G3', customerName: 'Familie Huber', customerId: kunde, address: 'Gartengasse 4, 8200 Gleisdorf',
    invoiceDate: `${JAHR}-01-15`, leistungVon: `${JAHR}-01-15`, leistungBis: `${JAHR}-01-15`, dueDate: `${JAHR}-01-29`,
    subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200, vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
  } as Parameters<typeof rechnungen.rechnungAusstellen>[1], { praefix: 'RE', datumAusdruecklich: true });
  return r.id;
}

const mahnen = (id: string, stufe: 1 | 2 | 3, kosten: number, zinsen: number, forderung: number) =>
  rechnungen.mahnungFesthalten(id, {
    stufe, gemahntAm: heute(), frist: heute(), spesen: kosten,
    inhalt: { ...mahnInhalt(stufe, heute(), heute()), kosten, zinsen, forderung },
  });

describe('Mahnforderung nach einem Modell (G3)', () => {
  it('was Mahnung 3 nach einer Teilzahlung verlangt, lässt sich ganz verbuchen — kein Guthaben', async () => {
    const id = await ueberfaellig();
    await mahnen(id, 1, 5, 0, 5);
    await mahnen(id, 2, 10, 3.4, 18.4);
    await createZahlungAufgeteilt(BETRIEB, {
      invoiceId: id, datum: heute(), betrag: 600, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    }, { mahnkosten: 18.4 });
    // Mahnung 3: frühere Kosten 15, eigene 15, Zinsen bis heute 5,48 — davon bezahlt 18,40.
    await mahnen(id, 3, 15, 5.48, 35.48);
    await createZahlungAufgeteilt(BETRIEB, {
      invoiceId: id, datum: heute(), betrag: 600, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    }, { mahnkosten: 17.08 });
    const { data } = await admin.from('invoices')
      .select('payment_status, bezahlt_betrag, mahnkosten_betrag').eq('id', id).single();
    expect(data).toMatchObject({ payment_status: 'Bezahlt' });
    expect(Number(data!.bezahlt_betrag)).toBe(1200);
    expect(Number(data!.mahnkosten_betrag)).toBe(35.48);
  });

  it('eine Forderung, die nicht zu den früheren Mahnungen passt, wird nicht festgehalten', async () => {
    const id = await ueberfaellig();
    await mahnen(id, 1, 5, 0, 5);
    await expect(mahnen(id, 2, 10, 3.4, 13.4)).rejects.toThrow(/passen nicht zu den früheren Mahnungen/);
  });

  // Bleibt gleich: ein Schreiben ohne `forderung` (alte App) rechnet wie bisher.
  it('ohne Forderung im Inhalt: letzte Mahnung, Kosten und Zinsen — wie bisher', async () => {
    const id = await ueberfaellig();
    await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: heute(), frist: heute(), spesen: 10,
      inhalt: { ...mahnInhalt(1, heute(), heute()), kosten: 10 },
    });
    await expect(createZahlungAufgeteilt(BETRIEB, {
      invoiceId: id, datum: heute(), betrag: 0, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    }, { mahnkosten: 10.01 })).rejects.toThrow(/fordert 10,00 €/);
  });
});
