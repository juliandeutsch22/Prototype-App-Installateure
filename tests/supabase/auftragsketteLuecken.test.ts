/**
 * KLEINE LÜCKEN DER AUFTRAGSKETTE (Durchsicht 15.11.2026, A12).
 *
 * Kundenimport mit Kundenart und Kundennummer, die Besichtigung eines
 * abgelehnten oder gelöschten Eingangs, der Name eines umbenannten Kunden
 * in Wartungen und Angebotsentwürfen. Ohne `20261116044500` ist jede
 * Prüfung hier rot (bis auf die „bleibt gleich“-Fälle).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a12-luecken';
let chefin: Konto;
let verwaltung: Konto;

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heute()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  await betriebAnlegen(A, 'Lücken Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a12-chefin');
  verwaltung = await konto(A, 'Verwaltung', 'a12-verw');
}, 60_000);

describe('Kundenimport mit Kundenart und Kundennummer', () => {
  it('Kundenart, Kundennummer und Anschrift in ihre Felder; eine vergebene Nummer in die Notiz', async () => {
    await admin.from('customers').insert({ company_id: A, name: 'Schon Da', kundennummer: 'A12-1' });
    const { error } = await chefin.client.rpc('kunden_einspielen', {
      p_kunden: [
        { name: 'Imp Privat', kundenart: 'privat', kundennummer: 'A12-2', strasse: 'Weg 1', plz: '1010', ort: 'Wien' },
        { name: 'Imp Firma', kundenart: 'unternehmen', kundennummer: 'A12-1', notes: 'Alt' },
        { name: 'Imp Offen', kundennummer: 'A12-2' },
      ],
      p_nur_pruefen: false,
    });
    expect(error).toBeNull();
    const { data } = await admin.from('customers').select('name, kundenart, kundennummer, notes, strasse, plz, ort')
      .eq('company_id', A).like('name', 'Imp %').order('name');
    expect(data).toEqual([
      { name: 'Imp Firma', kundenart: 'unternehmen', kundennummer: null, notes: 'Alt\nKundennummer im Altsystem: A12-1', strasse: null, plz: null, ort: null },
      { name: 'Imp Offen', kundenart: null, kundennummer: null, notes: 'Kundennummer im Altsystem: A12-2', strasse: null, plz: null, ort: null },
      { name: 'Imp Privat', kundenart: 'privat', kundennummer: 'A12-2', notes: null, strasse: 'Weg 1', plz: '1010', ort: 'Wien' },
    ]);
  });

  it('eine unbekannte Kundenart wird abgewiesen — nichts wird angelegt', async () => {
    const { error } = await chefin.client.rpc('kunden_einspielen', {
      p_kunden: [{ name: 'Imp Verein', kundenart: 'verein' }], p_nur_pruefen: false,
    });
    expect(error?.message).toMatch(/privat oder unternehmen/);
    expect((await admin.from('customers').select('id').eq('company_id', A).eq('name', 'Imp Verein')).data).toEqual([]);
  });

  it('bleibt gleich: ohne die neuen Angaben (alte App) wie bisher', async () => {
    const { data } = await chefin.client.rpc('kunden_einspielen', { p_kunden: [{ name: 'Imp Alt', notes: 'n' }], p_nur_pruefen: false });
    expect(data).toEqual({ angelegt: 1, uebersprungen: 0 });
  });
});

describe('Die Besichtigung eines abgelehnten oder gelöschten Eingangs', () => {
  async function eingangMitTermin(datum: string) {
    const k = await kunde();
    const { data: t } = await admin.from('termine').insert({
      company_id: A, art: 'Besichtigung', datum, customer_id: k.id,
    }).select('id').single();
    const { data: e, error } = await verwaltung.client.from('auftragseingaenge').insert({
      company_id: A, quelle: 'telefon', customer_id: k.id, anliegen: 'Tropft',
    }).select('id').single();
    if (error) throw new Error(error.message);
    await admin.from('auftragseingaenge').update({ termin_id: (t as { id: string }).id }).eq('id', (e as { id: string }).id);
    return { eingang: (e as { id: string }).id, termin: (t as { id: string }).id };
  }
  async function kunde() {
    const { data } = await admin.from('customers').insert({ company_id: A, name: `Termin ${Date.now()}` }).select('id').single();
    return data as { id: string };
  }
  const termin = async (id: string) => (await admin.from('termine').select('id').eq('id', id)).data ?? [];

  it('Ablehnen nimmt eine kommende Besichtigung aus dem Plan', async () => {
    const x = await eingangMitTermin(tagPlus(3));
    expect((await verwaltung.client.rpc('eingang_ablehnen', { p_eingang: x.eingang, p_grund: 'Kunde sagt ab' })).error).toBeNull();
    expect(await termin(x.termin)).toEqual([]);
  });

  it('eine Besichtigung, die schon war, bleibt', async () => {
    const x = await eingangMitTermin(tagPlus(-3));
    await verwaltung.client.rpc('eingang_ablehnen', { p_eingang: x.eingang, p_grund: 'Kunde sagt ab' });
    expect(await termin(x.termin)).toHaveLength(1);
  });

  it('Löschen nimmt sie ebenso mit', async () => {
    const x = await eingangMitTermin(tagPlus(5));
    expect((await chefin.client.from('auftragseingaenge').delete().eq('id', x.eingang)).error).toBeNull();
    expect(await termin(x.termin)).toEqual([]);
  });
});

describe('Ein umbenannter Kunde', () => {
  it('heißt auch in seinen Wartungen und Angebotsentwürfen neu — versendete Angebote bleiben', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: A, name: 'Alter Name' }).select('id').single();
    const id = (k as { id: string }).id;
    const { data: w } = await admin.from('wartungen').insert({
      company_id: A, customer_id: id, customer_name: 'Alter Name', anlage: 'Therme', intervall_monate: 12, faellig_am: '2027-01-01',
    }).select('id').single();
    const angebot = async (status: string) => ((await admin.from('quotes').insert({
      company_id: A, quote_number: `AN-A12-${status}-${Date.now()}`, customer_id: id, customer_name: 'Alter Name',
      quote_date: '2026-11-01', valid_until: '2026-12-01', vat_rate: 0.2, status,
    }).select('id').single()).data as { id: string }).id;
    const entwurf = await angebot('Entwurf');
    const versendet = await angebot('Versendet');
    const { error } = await chefin.client.rpc('kunde_umbenennen', { p_kunde: id, p_name: 'Neuer Name', p_rest: {} });
    expect(error).toBeNull();
    expect((await admin.from('wartungen').select('customer_name').eq('id', (w as { id: string }).id).single()).data)
      .toEqual({ customer_name: 'Neuer Name' });
    expect((await admin.from('quotes').select('customer_name').eq('id', entwurf).single()).data).toEqual({ customer_name: 'Neuer Name' });
    expect((await admin.from('quotes').select('customer_name').eq('id', versendet).single()).data).toEqual({ customer_name: 'Alter Name' });
  });
});
