/**
 * WER GEMAHNT HAT (A2 der Durchsicht vom 24.10.2026).
 *
 * Eine Mahnung hält seit dieser Migration Kennung und Namen der Person fest,
 * die sie ausgestellt hat — gesetzt von der Datenbank aus der Anmeldung,
 * nicht aus einem Wert der App. Geprüft gegen die echte Datenbank:
 *
 *   - die Mahnung trägt die Person, und das erneute Laden liefert sie mit;
 *   - der Name bleibt der von damals, auch wenn die Person umbenannt wird;
 *   - der Rücklauf einer Sicherung behält, was er mitbringt;
 *   - die Datenauskunft der Person zählt ihre Mahnungen;
 *   - die Auskunft des Kunden nennt die Person NICHT (Gleichbleiben: der
 *     Inhalt dort gehört dem Kunden, die Person nicht).
 *
 * Gegenprobe: ohne die Migration fehlen Spalten und Zähler — alle Fälle
 * außer dem letzten sind rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto, mahnInhalt } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'mahn-wer';
let buch: Konto;
let chefin: Konto;
let kunde = '';

async function rechnung(nummer: string): Promise<string> {
  clientEinreichen(buch.client);
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: nummer, projectNumber: 'B-1', customerName: 'Familie Gruber', ...{ customerId: kunde },
    address: 'Hauptplatz 3, 8010 Graz',
    invoiceDate: '2026-01-02', leistungVon: '2026-01-02', leistungBis: '2026-01-02', dueDate: '2026-01-16', subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120,
    vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  });
}

async function mahnen(id: string, nummer: string): Promise<string> {
  clientEinreichen(buch.client);
  return rechnungen.mahnungFesthalten(id, {
    stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 0,
    inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08', nummer),
  });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'werbuch');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'wergf');
  const { error: n } = await admin.from('users').update({ name: 'Bettina Buch' }).eq('id', buch.uid);
  expect(n).toBeNull();
  const { data, error } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Familie Gruber', kundenart: 'privat', strasse: 'Hauptplatz 3', plz: '8010', ort: 'Graz' })
    .select('id').single();
  expect(error).toBeNull();
  kunde = data!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Wer gemahnt hat', () => {
  it('die Mahnung trägt Kennung und Namen der Person, die mahnt', async () => {
    const id = await rechnung('RE-W-0001');
    const mahnung = await mahnen(id, 'RE-W-0001');
    const { data } = await admin.from('mahnungen').select('gemahnt_von, gemahnt_von_name').eq('id', mahnung).single();
    expect(data).toEqual({ gemahnt_von: buch.uid, gemahnt_von_name: 'Bettina Buch' });

    const liste = await rechnungen.listMahnungenZurRechnung(BETRIEB, id);
    expect(liste.map((m) => [m.gemahntVon, m.gemahntVonName])).toEqual([[buch.uid, 'Bettina Buch']]);
  });

  it('der Name bleibt der von damals, auch nach einer Umbenennung', async () => {
    const id = await rechnung('RE-W-0002');
    const mahnung = await mahnen(id, 'RE-W-0002');
    const { error } = await admin.from('users').update({ name: 'Bettina Neu' }).eq('id', buch.uid);
    expect(error).toBeNull();
    try {
      const { data } = await admin.from('mahnungen').select('gemahnt_von_name').eq('id', mahnung).single();
      expect(data!.gemahnt_von_name).toBe('Bettina Buch');
    } finally {
      await admin.from('users').update({ name: 'Bettina Buch' }).eq('id', buch.uid);
    }
  });

  it('der Rücklauf einer Sicherung behält, was er mitbringt', async () => {
    const id = await rechnung('RE-W-0003');
    const { data, error } = await admin.from('mahnungen').insert({
      company_id: BETRIEB, invoice_id: id, stufe: 1, datum: '2026-02-01', frist: '2026-02-08', spesen: 0,
      inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08', 'RE-W-0003'),
      gemahnt_von: chefin.uid, gemahnt_von_name: 'Clara Chefin',
    }).select('gemahnt_von, gemahnt_von_name').single();
    expect(error).toBeNull();
    expect(data).toEqual({ gemahnt_von: chefin.uid, gemahnt_von_name: 'Clara Chefin' });
  });

  it('die Datenauskunft der Person zählt ihre Mahnungen', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buch.uid });
    expect(error).toBeNull();
    // Zwei aus den Fällen oben; die aus dem Rücklauf zählt bei der Chefin.
    expect((data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.mahnungen_ausgestellt).toBe(2);
    const ihre = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chefin.uid });
    expect((ihre.data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.mahnungen_ausgestellt).toBe(1);
  });

  it('gleich bleibt: die Auskunft des Kunden nennt die Person nicht', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
    expect(error).toBeNull();
    const text = JSON.stringify(data);
    expect(text).toContain('Zahlungserinnerung');
    expect(text).not.toContain('Bettina Buch');
    expect(text).not.toContain(buch.uid);
  });
});
