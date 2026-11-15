/**
 * „Stornieren und neu ausstellen“ in einem Zug (Durchsicht 15.11.2026, V6/F4).
 *
 * `rechnung_ersetzen` storniert die alte und stellt die neue aus — in einer
 * Transaktion. Scheitert das Ausstellen, ist auch der Storno nicht geschehen.
 * Ohne `20261116050700_rechnung_ersetzen.sql` gibt es die Funktion nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'ersetzen-v6';
let buch: Konto;
let anton: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'v6buch');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'v6anton');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

async function stunde(): Promise<string> {
  const z = buchung(anton, heute(), { project_number: 'B-V6' });
  const { error } = await admin.from('time_entries').insert(z);
  if (error) throw new Error(error.message);
  return z.id;
}

const entwurf = (preis: number, eintrag: string) => ({
  projectNumber: 'B-V6', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
  invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
  subtotalNetto: 8 * preis, totalNetto: 8 * preis, totalVat: 1.6 * preis, totalBrutto: 9.6 * preis, vatRate: 0.2,
  paymentStatus: 'Offen' as const,
  positions: [{ label: 'Facharbeit', qty: 8, unit: 'h', unitPrice: preis, netto: 8 * preis }],
  linkedEntries: [eintrag],
});

async function lies(id: string) {
  const { data } = await admin.from('invoices').select('payment_status, cancellation_note, invoice_number').eq('id', id).single();
  return data!;
}
async function stand(eintrag: string) {
  const { data } = await admin.from('time_entries').select('is_billed, invoice_number').eq('id', eintrag).single();
  return data!;
}

describe('Rechnung ersetzen (V6/F4)', () => {
  it('storniert die alte und stellt die neue aus — die Stunde wandert mit', async () => {
    const e = await stunde();
    const alt = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(80, e), { praefix: 'RE' });
    const neu = await rechnungen.rechnungErsetzen(BETRIEB, { id: alt.id, grund: 'Falscher Stundensatz' }, entwurf(70, e), { praefix: 'RE' });
    expect(await lies(alt.id)).toMatchObject({ payment_status: 'Storniert', cancellation_note: 'Falscher Stundensatz' });
    expect(await lies(neu.id)).toMatchObject({ payment_status: 'Offen' });
    expect(await stand(e)).toEqual({ is_billed: true, invoice_number: neu.invoiceNumber });
  });

  it('scheitert das Ausstellen, bleibt die alte unverändert', async () => {
    const e = await stunde();
    const alt = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(80, e), { praefix: 'RE' });
    await expect(rechnungen.rechnungErsetzen(BETRIEB, { id: alt.id, grund: 'Preis' }, { ...entwurf(0, e) }, { praefix: 'RE' }))
      .rejects.toThrow(/null Euro/);
    expect(await lies(alt.id)).toMatchObject({ payment_status: 'Offen', cancellation_note: null });
    expect(await stand(e)).toEqual({ is_billed: true, invoice_number: alt.invoiceNumber });
  });

  it('ohne Grund kein Ersatz; ein Monteur ersetzt nicht', async () => {
    const e = await stunde();
    const alt = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(80, e), { praefix: 'RE' });
    await expect(rechnungen.rechnungErsetzen(BETRIEB, { id: alt.id, grund: ' ' }, entwurf(70, e), { praefix: 'RE' }))
      .rejects.toThrow(/Grund/);
    clientEinreichen(anton.client);
    try {
      await expect(rechnungen.rechnungErsetzen(BETRIEB, { id: alt.id, grund: 'x' }, entwurf(70, e), { praefix: 'RE' }))
        .rejects.toThrow();
    } finally {
      clientEinreichen(buch.client);
    }
    expect(await lies(alt.id)).toMatchObject({ payment_status: 'Offen' });
  });

  it('derselbe Versuch zweimal: ein Ersatz (G2)', async () => {
    const e = await stunde();
    const alt = await rechnungen.rechnungAusstellen(BETRIEB, entwurf(80, e), { praefix: 'RE' });
    const v = crypto.randomUUID();
    const erst = await rechnungen.rechnungErsetzen(BETRIEB, { id: alt.id, grund: 'Preis' }, entwurf(70, e), { praefix: 'RE', versuch: v });
    const wieder = await rechnungen.rechnungErsetzen(BETRIEB, { id: alt.id, grund: 'Preis' }, entwurf(70, e), { praefix: 'RE', versuch: v });
    expect(wieder).toMatchObject({ id: erst.id, bereits: true });
  });
});
