/**
 * ANSPRECHPARTNER, DRINGLICHKEIT UND WUNSCHTERMIN GEHEN MIT (Durchsicht 15.11.2026, A8).
 *
 * Vorher verlor „Eingang → Angebot → Annahme“ alle drei: die Baustelle trug
 * Ansprechpartner und Telefon des Kunden (der Hausverwaltung), Dringlichkeit
 * und Wunschtermin kamen auf keinem Weg an. Ohne `20261116042500` fehlen die
 * Spalten — jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a8-angaben';
let chefin: Konto;
let verwaltung: Konto;
let kunde = '';

async function eingang(x: Record<string, unknown> = {}) {
  const { data, error } = await verwaltung.client.from('auftragseingaenge').insert({
    company_id: A, quelle: 'hausverwaltung', customer_id: kunde, anliegen: 'Rohrbruch Top 5',
    ansprechpartner_name: 'Frau Huber', ansprechpartner_telefon: '0664 555', dringlichkeit: 'dringend',
    wunschtermin: '2026-11-20', ...x,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
const baustelle = async (nummer: string) =>
  (await admin.from('projects').select('*').eq('company_id', A).eq('project_number', nummer).single()).data as Record<string, unknown>;

beforeAll(async () => {
  await betriebAnlegen(A, 'Angaben Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a8-chefin');
  verwaltung = await konto(A, 'Verwaltung', 'a8-verw');
  const { data } = await admin.from('customers').insert({
    company_id: A, name: 'Hausverwaltung Gruber', contact_name: 'HV Büro', contact_phone: '01 999',
  }).select('id').single();
  kunde = (data as { id: string }).id;
}, 60_000);

describe('Eingang → Angebot → Baustelle', () => {
  it('das Angebot trägt die Angaben, die Annahme gibt sie an die Baustelle — der Ansprechpartner vor dem des Kunden', async () => {
    const e = await eingang();
    const { data: r, error } = await chefin.client.rpc('eingang_zu_angebot', { p_eingang: e });
    expect(error).toBeNull();
    const q = (r as { quote_id: string }).quote_id;
    expect((await admin.from('quotes').select('ansprechpartner_name, ansprechpartner_telefon, dringlichkeit, wunschtermin').eq('id', q).single()).data)
      .toEqual({ ansprechpartner_name: 'Frau Huber', ansprechpartner_telefon: '0664 555', dringlichkeit: 'dringend', wunschtermin: '2026-11-20' });
    const { data: nummer } = await chefin.client.rpc('angebot_annehmen', { p_angebot: q, p_praefix: 'AG', p_abrechnung: 'Regie' });
    expect(await baustelle(String(nummer))).toMatchObject({
      contact_name: 'Frau Huber', contact_phone: '0664 555', dringlichkeit: 'dringend', wunschtermin: '2026-11-20',
    });
  });

  it('direkt Eingang → Baustelle: auch Dringlichkeit und Wunschtermin', async () => {
    const e = await eingang({ dringlichkeit: 'notfall' });
    const { data } = await chefin.client.rpc('eingang_zu_baustelle', { p_eingang: e, p_praefix: 'AG', p_abrechnung: 'Regie' });
    expect(await baustelle((data as { project_number: string }).project_number)).toMatchObject({
      contact_name: 'Frau Huber', dringlichkeit: 'notfall', wunschtermin: '2026-11-20',
    });
  });

  it('bleibt gleich: ein Angebot ohne Ansprechpartner gibt den des Kunden weiter', async () => {
    const { data: q } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: { quote_number: `AN-A8-${Date.now()}`, customer_id: kunde, customer_name: 'Hausverwaltung Gruber',
        quote_date: '2026-11-10', valid_until: '2099-12-31', vat_rate: 0.2, status: 'Versendet' },
      p_positionen: [{ label: 'Montage', qty: 1, unit: 'h', unit_price: 70, netto: 70, ist_arbeitszeit: true }],
    });
    const { data: nummer } = await chefin.client.rpc('angebot_annehmen', { p_angebot: q, p_praefix: 'AG', p_abrechnung: 'Regie' });
    expect(await baustelle(String(nummer))).toMatchObject({ contact_name: 'HV Büro', contact_phone: '01 999', dringlichkeit: null });
  });

  it('die Angaben lassen sich auch nach dem Versand ändern — sie stehen nicht beim Kunden', async () => {
    const { data: q } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: { quote_number: `AN-A8-V-${Date.now()}`, customer_id: kunde, customer_name: 'Hausverwaltung Gruber',
        quote_date: '2026-11-10', valid_until: '2099-12-31', vat_rate: 0.2, status: 'Versendet' },
      p_positionen: [{ label: 'Montage', qty: 1, unit: 'h', unit_price: 70, netto: 70, ist_arbeitszeit: true }],
    });
    const r = await chefin.client.rpc('angebot_speichern', {
      p_id: q, p_kopf: { ansprechpartner_name: 'Herr Neu', dringlichkeit: 'notfall' }, p_positionen: null,
    });
    expect(r.error).toBeNull();
    expect((await admin.from('quotes').select('ansprechpartner_name, dringlichkeit').eq('id', q).single()).data)
      .toEqual({ ansprechpartner_name: 'Herr Neu', dringlichkeit: 'notfall' });
    expect((await chefin.client.rpc('angebot_speichern', { p_id: q, p_kopf: { dringlichkeit: 'irgendwann' }, p_positionen: null })).error?.message)
      .toMatch(/quotes_dringlichkeit/);
  });
});

describe('Löschung des Kunden (Datenschutz)', () => {
  it('am aufbewahrten Angebot gehen Ansprechpartner und Telefon', async () => {
    const { data: k } = await admin.from('customers').insert({ company_id: A, name: 'Familie Weg' }).select('id').single();
    const kid = (k as { id: string }).id;
    const { data: q } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: { quote_number: `AN-A8-L-${Date.now()}`, customer_id: kid, customer_name: 'Familie Weg',
        quote_date: '2026-11-10', valid_until: '2099-12-31', vat_rate: 0.2, status: 'Versendet',
        ansprechpartner_name: 'Opa Weg', ansprechpartner_telefon: '0664 1' },
      p_positionen: [{ label: 'Montage', qty: 1, unit: 'h', unit_price: 70, netto: 70, ist_arbeitszeit: true }],
    });
    const pruefen = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kid, p_nur_pruefen: true });
    expect(pruefen.error).toBeNull();
    expect(((pruefen.data as { sofort: Record<string, number> }).sofort).kontaktdaten).toBeGreaterThanOrEqual(1);
    expect((await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kid, p_nur_pruefen: false })).error).toBeNull();
    expect((await admin.from('quotes').select('ansprechpartner_name, ansprechpartner_telefon').eq('id', q).single()).data)
      .toEqual({ ansprechpartner_name: null, ansprechpartner_telefon: null });
  });
});
