/**
 * JEDE MAHNUNG EINZELN GESPEICHERT (10.10.2026, Grenze G3).
 *
 * `public.mahnung_festhalten` hält das Schreiben (`mahnungen.inhalt`) und den
 * Mahnstand der Rechnung in einem Zug fest. Geprüft gegen die echte
 * Datenbank:
 *
 *   - beide Stufen stehen danach als eigene Zeilen da, der Stand an der
 *     Rechnung ist der der letzten; „Überfällig“ nur aus „Offen“;
 *   - die Abfragen für Archiv und erneutes Laden finden sie;
 *   - die Datenauskunft des Kunden nennt sie bei ihrer Rechnung.
 *
 * Gegenproben: ohne Kundenart entsteht weder Stand noch Zeile (ein Zug);
 * der Monteur mahnt nicht und liest nichts; direkt einfügen, ändern oder
 * löschen kann niemand; ein fremder Betrieb sieht nichts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto, mahnInhalt } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'mahn-einzeln';
const FREMD = 'mahn-fremd';
let buch: Konto;
let chefin: Konto;
let monteur: Konto;
let fremd: Konto;
let kundeMit = '';
let kundeOhne = '';

async function rechnung(nummer: string, customerId?: string): Promise<string> {
  clientEinreichen(buch.client);
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: nummer, projectNumber: 'B-1', customerName: customerId ? 'Familie Huber' : 'Laufkunde',
    ...(customerId ? { customerId } : {}),
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: '2026-01-02', dueDate: '2026-01-16', subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120,
    vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'mahnbuch');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'mahngf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mahnmont');
  fremd = await konto(FREMD, 'Buchhaltung', 'mahnfremd');
  const { data: k1, error: e1 } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Familie Huber', kundenart: 'privat', strasse: 'Hauptstraße 1', plz: '2700', ort: 'Wiener Neustadt' }).select('id').single();
  expect(e1).toBeNull();
  kundeMit = k1!.id;
  const { data: k2, error: e2 } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Ohne Art GmbH', kundenart: 'unternehmen', strasse: 'Gasse 2', plz: '2700', ort: 'Wiener Neustadt' }).select('id').single();
  expect(e2).toBeNull();
  kundeOhne = k2!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Mahnungen einzeln festhalten', () => {
  it('beide Stufen als eigene Zeilen, an der Rechnung der letzte Stand', async () => {
    const id = await rechnung('RE-M-0001', kundeMit);
    clientEinreichen(buch.client);
    const erste = await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 0,
      inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08', 'RE-M-0001'),
    });
    const zweite = await rechnungen.mahnungFesthalten(id, {
      stufe: 2, gemahntAm: '2026-02-15', frist: '2026-02-22', spesen: 10,
      inhalt: { ...mahnInhalt(2, '2026-02-15', '2026-02-22', 'RE-M-0001'), zeilen: [['Mahnspesen', '10,00 €']], offen: 130 },
    });
    expect(erste).not.toBe(zweite);

    const { data: kopf } = await admin.from('invoices')
      .select('mahnstufe, gemahnt_am, mahnfrist, mahnspesen, payment_status').eq('id', id).single();
    expect(kopf).toEqual({
      mahnstufe: 2, gemahnt_am: '2026-02-15', mahnfrist: '2026-02-22', mahnspesen: 10, payment_status: 'Überfällig',
    });

    const liste = await rechnungen.listMahnungenZurRechnung(BETRIEB, id);
    expect(liste.map((m) => [m.stufe, m.datum, m.frist, m.spesen])).toEqual([
      [1, '2026-02-01', '2026-02-08', 0],
      [2, '2026-02-15', '2026-02-22', 10],
    ]);
    // Der Inhalt kommt so zurück, wie er gespeichert wurde.
    expect(liste[1].inhalt).toMatchObject({ titel: 'Mahnung', zeilen: [['Mahnspesen', '10,00 €']], offen: 130 });
    expect(typeof liste[0].angelegtAm).toBe('number');

    const imZeitraum = await rechnungen.listMahnungenInRange(BETRIEB, '2026-02-10', '2026-02-28');
    expect(imZeitraum.map((m) => m.id)).toEqual([zweite]);
  });

  it('eine teilbezahlte Rechnung bleibt „Teilbezahlt“', async () => {
    const id = await rechnung('RE-M-0002');
    const { error } = await admin.from('zahlungseingaenge').insert({
      company_id: BETRIEB, invoice_id: id, datum: '2026-01-20', betrag: 20, art: 'Überweisung',
    });
    expect(error).toBeNull();
    clientEinreichen(buch.client);
    await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 0, inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08'),
    });
    const { data } = await admin.from('invoices').select('payment_status, mahnstufe').eq('id', id).single();
    expect(data).toEqual({ payment_status: 'Teilbezahlt', mahnstufe: 1 });
  });

  it('Gegenprobe: ohne Kundenart weder Mahnstand noch Mahnung — ein Zug', async () => {
    // Eine Altrechnung: ausgestellt mit Kundenart, die dem Kunden seither fehlt.
    const id = await rechnung('RE-M-0003', kundeOhne);
    const { error: weg } = await admin.from('customers').update({ kundenart: null }).eq('id', kundeOhne);
    expect(weg).toBeNull();
    clientEinreichen(buch.client);
    await expect(rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 0, inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08'),
    })).rejects.toThrow(/Kundenart/);
    const { data: kopf } = await admin.from('invoices').select('mahnstufe').eq('id', id).single();
    expect(kopf!.mahnstufe ?? 0).toBe(0);
    const { count } = await admin.from('mahnungen').select('id', { count: 'exact', head: true }).eq('invoice_id', id);
    expect(count).toBe(0);
  });

  it('Gegenprobe: ungültige Stufe oder fehlender Inhalt werden abgewiesen', async () => {
    const id = await rechnung('RE-M-0004');
    for (const [stufe, inhalt] of [[4, mahnInhalt(1, '2026-02-01', '2026-02-08')], [1, null], [1, []]] as const) {
      const { error } = await buch.client.rpc('mahnung_festhalten', {
        p_invoice: id, p_stufe: stufe, p_datum: '2026-02-01', p_frist: '2026-02-08', p_spesen: 0, p_inhalt: inhalt,
      });
      expect(error?.code, JSON.stringify([stufe, inhalt])).toBe('22023');
    }
    const { count } = await admin.from('mahnungen').select('id', { count: 'exact', head: true }).eq('invoice_id', id);
    expect(count).toBe(0);
  });

  it('Gegenprobe: der Monteur mahnt nicht und liest keine Mahnung', async () => {
    const id = await rechnung('RE-M-0005');
    const { error } = await monteur.client.rpc('mahnung_festhalten', {
      p_invoice: id, p_stufe: 1, p_datum: '2026-02-01', p_frist: '2026-02-08', p_spesen: 0,
      p_inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08'),
    });
    expect(error?.code).toBe('42501');
    const { count } = await admin.from('mahnungen').select('id', { count: 'exact', head: true }).eq('invoice_id', id);
    expect(count).toBe(0);
    const { data: gelesen } = await monteur.client.from('mahnungen').select('id').eq('company_id', BETRIEB);
    expect(gelesen).toEqual([]);
  });

  it('Gegenprobe: niemand fügt direkt ein, ändert oder löscht', async () => {
    const id = await rechnung('RE-M-0006');
    const { error: direkt } = await buch.client.from('mahnungen').insert({
      company_id: BETRIEB, invoice_id: id, stufe: 1, datum: '2026-02-01', frist: '2026-02-08',
      inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08'),
    });
    expect(direkt?.code).toBe('42501');

    clientEinreichen(buch.client);
    const mid = await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-02-01', frist: '2026-02-08', spesen: 0, inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08'),
    });
    for (const k of [buch, chefin]) {
      const { error: aendern } = await k.client.from('mahnungen').update({ frist: '2026-12-31' }).eq('id', mid);
      expect(aendern).not.toBeNull();
      const { error: loeschen } = await k.client.from('mahnungen').delete().eq('id', mid);
      expect(loeschen).not.toBeNull();
    }
    const { data } = await admin.from('mahnungen').select('frist').eq('id', mid).single();
    expect(data).toEqual({ frist: '2026-02-08' });
  });

  it('Gegenprobe: ein fremder Betrieb sieht keine Mahnung und mahnt keine fremde Rechnung', async () => {
    const id = await rechnung('RE-M-0007');
    const { data } = await fremd.client.from('mahnungen').select('id').eq('company_id', BETRIEB);
    expect(data).toEqual([]);
    const { error } = await fremd.client.rpc('mahnung_festhalten', {
      p_invoice: id, p_stufe: 1, p_datum: '2026-02-01', p_frist: '2026-02-08', p_spesen: 0,
      p_inhalt: mahnInhalt(1, '2026-02-01', '2026-02-08'),
    });
    expect(error?.code).toBe('42501');
  });

  it('die Datenauskunft des Kunden nennt die Mahnungen bei ihrer Rechnung', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kundeMit });
    expect(error).toBeNull();
    const rs = (data as { daten: { rechnungen: { invoice_number: string; mahnungen: { stufe: number; inhalt: { titel: string } }[] }[] } })
      .daten.rechnungen;
    const r = rs.find((x) => x.invoice_number === 'RE-M-0001')!;
    expect(r.mahnungen.map((m) => [m.stufe, m.inhalt.titel])).toEqual([[1, 'Zahlungserinnerung'], [2, 'Mahnung']]);
  });
});
