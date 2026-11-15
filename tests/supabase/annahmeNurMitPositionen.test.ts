/**
 * EIN LEERES ANGEBOT WIRD NICHT ANGENOMMEN (Durchsicht 15.11.2026, A14) —
 * an jedem Annahmeweg: Büro (`angebot_annehmen`, auch die alte App),
 * `angebot_annehmen_mit_ziel`, direktes Setzen des Stands und der
 * Annahme-Link.
 *
 * Gegenprobe: ohne `20261116045500` nimmt jeder dieser Wege das leere
 * Angebot an (Baustelle entsteht, Stand „Angenommen“) — die Fälle mit „rot
 * ohne die Änderung“ sind rot; „bleibt gleich“ ist vorher und nachher grün.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a14-leer';
let chefin: Konto;
let lauf = 0;
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ZEILE = [{ label: 'Montage', qty: 2, unit: 'h', unit_price: 70, netto: 140, ist_arbeitszeit: true }];
const NUR_TEXT = [{ art: 'titel', label: 'Bad', qty: 0, unit: '', unit_price: 0, netto: 0 }];

async function angebot(positionen: unknown[], status = 'Entwurf'): Promise<string> {
  lauf += 1;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-A14-${Date.now()}-${lauf}`, customer_name: 'Familie Leer', quote_date: '2026-11-10',
      valid_until: '2099-12-31', vat_rate: 0.2, status, kalkulierte_stunden: 2,
    },
    p_positionen: positionen,
  });
  if (error) throw new Error(error.message);
  return String(data);
}
const status = async (id: string) =>
  ((await admin.from('quotes').select('status').eq('id', id).single()).data as { status: string }).status;
const baustellen = async () => (await admin.from('projects').select('id').eq('company_id', A)).data!.length;

beforeAll(async () => {
  await betriebAnlegen(A, 'Leer Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a14-chefin');
}, 60_000);

describe('A14 — angenommen wird nur mit Position', () => {
  it('rot ohne die Änderung: Büro, alte App und Annahme mit Ziel weisen den leeren Entwurf ab', async () => {
    const vorher = await baustellen();
    for (const positionen of [[], NUR_TEXT]) {
      const id = await angebot(positionen);
      const alt = await chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'LE', p_abrechnung: 'Pauschal' });
      expect(alt.error?.code).toBe('55000');
      expect(alt.error?.message).toMatch(/hat keine Position/);
      const mitZiel = await chefin.client.rpc('angebot_annehmen_mit_ziel', { p_angebot: id, p_praefix: 'LE', p_abrechnung: 'Pauschal', p_baustelle: null });
      expect(mitZiel.error?.code).toBe('55000');
      expect(await status(id)).toBe('Entwurf');
    }
    expect(await baustellen()).toBe(vorher);
  });

  it('rot ohne die Änderung: auch das direkte Setzen des Stands', async () => {
    const id = await angebot([]);
    const r = await chefin.client.from('quotes').update({ status: 'Angenommen' }).eq('id', id);
    expect(r.error?.code).toBe('55000');
    expect(await status(id)).toBe('Entwurf');
  });

  it('rot ohne die Änderung: ein Link aus der Zeit vor A5 zu einem leeren Angebot nimmt nichts an', async () => {
    const id = await angebot(ZEILE, 'Versendet');
    const { data: l, error } = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: id, p_abrechnung: 'Pauschal', p_praefix: 'LE', p_gueltig_bis: null });
    expect(error).toBeNull();
    // So steht ein Altbestand da: versendet, verlinkt, ohne Position.
    expect((await admin.from('quote_lines').delete().eq('quote_id', id)).error).toBeNull();
    const vorher = await baustellen();
    const schluessel = (l as { schluessel: string }).schluessel;
    expect((await admin.rpc('angebot_link_abruf', { p_hash: sha(schluessel) })).data).toMatchObject({ zustand: 'gegenstandslos' });
    const an = await admin.rpc('angebot_link_annehmen', { p_hash: sha(schluessel), p_name: 'Franz Leer', p_unterschrift: BILD, p_bestaetigt: true });
    expect(an.error).toBeNull();
    expect(an.data).toMatchObject({ zustand: 'gegenstandslos', neu: false });
    expect(await status(id)).toBe('Versendet');
    expect(await baustellen()).toBe(vorher);
  });

  it('bleibt gleich: mit Position wird angenommen, im Büro und über den Link', async () => {
    const intern = await angebot(ZEILE);
    const r = await chefin.client.rpc('angebot_annehmen', { p_angebot: intern, p_praefix: 'LE', p_abrechnung: 'Pauschal' });
    expect(r.error).toBeNull();
    expect(await status(intern)).toBe('Angenommen');

    const verlinkt = await angebot(ZEILE, 'Versendet');
    const { data: l } = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: verlinkt, p_abrechnung: 'Pauschal', p_praefix: 'LE', p_gueltig_bis: null });
    const schluessel = (l as { schluessel: string }).schluessel;
    const an = await admin.rpc('angebot_link_annehmen', { p_hash: sha(schluessel), p_name: 'Franz Voll', p_unterschrift: BILD, p_bestaetigt: true });
    expect(an.data).toMatchObject({ zustand: 'angenommen' });
    expect(await status(verlinkt)).toBe('Angenommen');
  });

  it('bleibt gleich: ein schon angenommenes leeres Angebot (Altbestand) bleibt, wie es ist', async () => {
    const id = await angebot(ZEILE);
    await chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'LE', p_abrechnung: 'Pauschal' });
    expect((await admin.from('quote_lines').delete().eq('quote_id', id)).error).toBeNull();
    // Eine Änderung, die den Stand nicht berührt, geht weiter.
    expect((await admin.from('quotes').update({ notes: 'Altbestand' }).eq('id', id)).error).toBeNull();
    expect(await status(id)).toBe('Angenommen');
  });
});
