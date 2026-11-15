/**
 * DER ANNAHME-LINK EINER ÜBERHOLTEN FASSUNG (Durchsicht 15.11.2026, A4).
 *
 * Vorher blieb der Link der alten Fassung offen, bis eine andere ANGENOMMEN
 * war. Ohne `20261116041000` liefert der Abruf hier `offen` samt Inhalt —
 * die Prüfungen sind rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a4-fassung';
let chefin: Konto;
let lauf = 0;
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function angebot(extra: Record<string, unknown> = {}): Promise<string> {
  lauf += 1;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-A4-${Date.now()}-${lauf}`, customer_name: 'Familie Fassung', quote_date: '2026-11-10',
      valid_until: '2099-12-31', vat_rate: 0.2, status: 'Versendet', kalkulierte_stunden: 2, ...extra,
    },
    p_positionen: [{ label: 'Montage', qty: 2, unit: 'h', unit_price: 70, netto: 140, ist_arbeitszeit: true }],
  });
  if (error) throw new Error(error.message);
  return String(data);
}
async function link(id: string) {
  const { data, error } = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: id, p_abrechnung: 'Pauschal', p_praefix: 'NF', p_gueltig_bis: null });
  if (error) throw new Error(error.message);
  return data as { id: string; schluessel: string };
}
const abruf = (s: string) => admin.rpc('angebot_link_abruf', { p_hash: sha(s) });
const stand = async (id: string) =>
  (await chefin.client.rpc('angebot_links_stand', { p_angebot: id })).data as { id: string; zustand: string; neuere_fassung: string | null }[];

beforeAll(async () => {
  await betriebAnlegen(A, 'Fassung Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a4-chefin');
}, 60_000);

describe('Neue Fassung überholt den alten Link', () => {
  it('der Kunde liest „neuere Fassung“, das Büro sieht welche — Annehmen nimmt nichts an', async () => {
    const alt = await angebot();
    const l = await link(alt);
    const neu = await angebot({ vorgaenger_id: alt, status: 'Entwurf' });
    const nummer = ((await admin.from('quotes').select('quote_number').eq('id', neu).single()).data as { quote_number: string }).quote_number;

    const a = await abruf(l.schluessel);
    expect(a.data).toEqual({ zustand: 'neuere_fassung', firma: 'Fassung Installationen', angebot: expect.stringMatching(/^AN-A4-/) });
    expect(await stand(alt)).toEqual([expect.objectContaining({ id: l.id, zustand: 'neuere_fassung', neuere_fassung: nummer })]);

    const an = await admin.rpc('angebot_link_annehmen', { p_hash: sha(l.schluessel), p_name: 'Franz Fassung', p_unterschrift: BILD, p_bestaetigt: true });
    expect(an.data).toMatchObject({ zustand: 'neuere_fassung', neu: false });
    const ab = await admin.rpc('angebot_link_ablehnen', { p_hash: sha(l.schluessel), p_name: 'Franz Fassung', p_grund: null });
    expect(ab.data).toMatchObject({ zustand: 'neuere_fassung', neu: false });
    expect((await admin.from('quotes').select('status').in('id', [alt, neu])).data!.map((x) => x.status).sort())
      .toEqual(['Entwurf', 'Versendet']);
    expect((await admin.from('projects').select('id').eq('company_id', A)).data).toEqual([]);
  });

  it('eine verworfene neue Fassung überholt nicht — der Link gilt wieder', async () => {
    const alt = await angebot();
    const l = await link(alt);
    const neu = await angebot({ vorgaenger_id: alt, status: 'Entwurf' });
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'neuere_fassung' });
    await chefin.client.from('quotes').update({ status: 'Verworfen' }).eq('id', neu);
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'offen' });
  });

  it('bleibt gleich: ein Link, den das Büro NACH der neuen Fassung für die ältere erzeugt, gilt', async () => {
    const alt = await angebot();
    await angebot({ vorgaenger_id: alt, status: 'Entwurf' });
    const l = await link(alt);
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'offen' });
  });

  it('bleibt gleich: ohne neue Fassung ist ein Link offen, widerrufen antwortet wie ungültig', async () => {
    const id = await angebot();
    const l = await link(id);
    expect((await abruf(l.schluessel)).data).toMatchObject({ zustand: 'offen' });
    await chefin.client.rpc('angebot_link_widerrufen', { p_link: l.id });
    expect((await abruf(l.schluessel)).data).toBeNull();
  });
});
