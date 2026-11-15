/**
 * VERSENDEN ERST MIT POSITION, UND EIN RÜCKWEG (Durchsicht 15.11.2026, A5).
 *
 * Vorher ließ sich ein leeres Angebot versenden und verlinken; „versendet“
 * und „abgelehnt“ hatten keinen Rückweg, der die Regeln kannte. Ohne
 * `20261116041500` geht jede Prüfung hier durch, die rot sein müsste.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'a5-versand';
let chefin: Konto;
let lauf = 0;
const ZEILE = [{ label: 'Montage', qty: 2, unit: 'h', unit_price: 70, netto: 140, ist_arbeitszeit: true }];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function angebot(positionen: unknown[] = ZEILE, extra: Record<string, unknown> = {}): Promise<string> {
  lauf += 1;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-A5-${Date.now()}-${lauf}`, customer_name: 'Familie Versand', quote_date: '2026-11-10',
      valid_until: '2099-12-31', vat_rate: 0.2, status: 'Entwurf', kalkulierte_stunden: 2, ...extra,
    },
    p_positionen: positionen,
  });
  if (error) throw new Error(error.message);
  return String(data);
}
const setze = (id: string, status: string) =>
  chefin.client.rpc('angebot_speichern', { p_id: id, p_kopf: { status }, p_positionen: null });
const zeile = async (id: string) => (await admin.from('quotes').select('*').eq('id', id).single()).data as Record<string, unknown>;
const link = (id: string) => chefin.client.rpc('angebot_link_erzeugen', { p_angebot: id, p_abrechnung: 'Regie', p_praefix: 'VS', p_gueltig_bis: null });

beforeAll(async () => {
  await betriebAnlegen(A, 'Versand Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a5-chefin');
}, 60_000);

describe('Versenden erst mit Position', () => {
  it('ein leerer Entwurf wird weder versendet noch verlinkt — auch nur mit Titel nicht', async () => {
    for (const positionen of [[], [{ art: 'titel', label: 'Bad', qty: 0, unit: '', unit_price: 0, netto: 0 }]]) {
      const id = await angebot(positionen);
      expect((await setze(id, 'Versendet')).error?.message).toMatch(/hat keine Position — ein leeres Angebot wird nicht versendet/);
      expect((await link(id)).error?.message).toMatch(/keine Position/);
      expect(await zeile(id)).toMatchObject({ status: 'Entwurf', versendet_am: null });
    }
  });

  it('Bestand: ein schon versendetes leeres Angebot bleibt — nur ein Link entsteht nicht', async () => {
    const id = await angebot([]);
    await admin.from('quotes').update({ status: 'Versendet' }).eq('id', id);
    expect((await link(id)).error?.message).toMatch(/ohne Position bekommt keinen Annahme-Link/);
    expect((await zeile(id)).status).toBe('Versendet');
  });

  it('bleibt gleich: mit Position wird versendet wie bisher — Tag und Firmendaten', async () => {
    const id = await angebot();
    expect((await setze(id, 'Versendet')).error).toBeNull();
    const z = await zeile(id);
    expect(z.versendet_am).not.toBeNull();
    expect(z.aussteller_stand).not.toBeNull();
  });
});

describe('Zurück in den Entwurf', () => {
  it('solange kein Link geöffnet ist — ein offener Link wird widerrufen, der Versand fällt weg', async () => {
    const id = await angebot();
    const { data: l } = await link(id);
    expect((await zeile(id)).status).toBe('Versendet');
    expect((await setze(id, 'Entwurf')).error).toBeNull();
    expect(await zeile(id)).toMatchObject({ status: 'Entwurf', versendet_am: null, aussteller_stand: null });
    const lz = (await admin.from('angebot_links').select('widerrufen_am, widerrufen_von_uid').eq('id', (l as { id: string }).id).single()).data!;
    expect(lz.widerrufen_am).not.toBeNull();
    expect(lz.widerrufen_von_uid).toBe(chefin.uid);
    // Als Entwurf wieder bearbeitbar.
    expect((await chefin.client.rpc('angebot_speichern', { p_id: id, p_kopf: { notes: 'geändert' }, p_positionen: null })).error).toBeNull();
  });

  it('hat der Kunde den Link geöffnet, geht es nicht mehr', async () => {
    const id = await angebot();
    const { data: l } = await link(id);
    await admin.rpc('angebot_link_abruf', { p_hash: sha((l as { schluessel: string }).schluessel) });
    expect((await setze(id, 'Entwurf')).error?.message).toMatch(/schon geöffnet — zurück in den Entwurf geht nicht mehr/);
    expect((await zeile(id)).status).toBe('Versendet');
  });
});

describe('Ablehnung zurücknehmen', () => {
  it('eine im Büro vermerkte: zurück auf „Versendet“ mit dem alten Tag', async () => {
    const id = await angebot();
    await setze(id, 'Versendet');
    const vorher = await zeile(id);
    expect((await setze(id, 'Abgelehnt')).error).toBeNull();
    expect((await setze(id, 'Versendet')).error).toBeNull();
    expect(await zeile(id)).toMatchObject({
      status: 'Versendet', abgelehnt_am: null, versendet_am: vorher.versendet_am, aussteller_stand: vorher.aussteller_stand,
    });
  });

  it('die des Kunden über den Link bleibt', async () => {
    const id = await angebot();
    const { data: l } = await link(id);
    await admin.rpc('angebot_link_ablehnen', { p_hash: sha((l as { schluessel: string }).schluessel), p_name: 'Vera Versand', p_grund: null });
    expect((await setze(id, 'Versendet')).error?.message).toMatch(/über den Link abgelehnt — das bleibt/);
    expect((await zeile(id)).status).toBe('Abgelehnt');
  });

  it('nicht, wenn inzwischen eine andere Fassung angenommen ist', async () => {
    const alt = await angebot();
    await setze(alt, 'Versendet');
    await setze(alt, 'Abgelehnt');
    const neu = await angebot(ZEILE, { vorgaenger_id: alt });
    await chefin.client.rpc('angebot_annehmen', { p_angebot: neu, p_praefix: 'VS', p_abrechnung: 'Pauschal' });
    expect((await setze(alt, 'Versendet')).error?.message).toMatch(/inzwischen die Fassung .* angenommen/);
  });
});
