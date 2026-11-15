/**
 * M10 (Befund B11, 15.11.2026): EINE EINGELADENE RÜSTLISTENPOSITION
 * RESERVIERT NICHTS MEHR — AUCH WENN NICHTS GEBUCHT WURDE.
 *
 * Bisher endete die Reservierung erst mit „gebucht“ am Haken. Eingeladen bei
 * leerem Regal (oder ohne Lagerführung) galt die Position bis zum Einsatztag
 * als geplant: frei −5, „5 fehlen“, Bestellvorschlag für Ware im Bus.
 *
 * Gegenprobe: ohne 20261116060800 ist `frei` nach dem Einladen −5 und die
 * Bestellvorschläge nennen die Fehlmenge.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { lagerFrei } from '@/lib/db/pg/materials';

const A = 'm10-eingeladen';
const NR = '2026-190';
let lager: Konto;
let max: Konto;
let dichtung: string;
const morgen = (() => {
  const d = new Date(`${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' })}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm10lager');
  max = await konto(A, 'Mitarbeiter', 'm10max');
  const m = await admin.from('materials').insert({ company_id: A, name: 'Dichtung', unit: 'Stk', stock: 0, lagerartikel: true }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  dichtung = m.data!.id;
  const k = await admin.from('einsatz_material').insert({ company_id: A, date: morgen, project_number: NR, uids: [max.uid] }).select('id').single();
  if (k.error) throw new Error(k.error.message);
  const p = await admin.from('einsatz_material_positionen').insert({
    company_id: A, einsatz_material_id: k.data!.id, id: 'p1', position: 0, name: 'Dichtung', menge: 5, einheit: 'Stk', material_id: dichtung,
  });
  if (p.error) throw new Error(p.error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

const frei = async () => {
  clientEinreichen(lager.client);
  return (await lagerFrei([dichtung])).get(dichtung)?.frei;
};

describe('M10: eingeladen reserviert nicht mehr', () => {
  it('Gleichbleiben: geplant, nicht eingeladen — die Position reserviert', async () => {
    expect(await frei()).toBe(-5);
    const v = await lager.client.rpc('bestellvorschlaege');
    expect(JSON.stringify(v.data ?? [])).toContain(dichtung);
  });

  it('eingeladen bei leerem Regal (nichts gebucht): keine Reservierung, kein Bestellvorschlag', async () => {
    const { data, error } = await max.client.rpc('laden_umschalten', {
      p_datum: morgen, p_baustelle: NR, p_position: 'p1', p_an: true, p_von: 'Max',
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(0);
    expect(await frei()).toBe(0);
    const v = await lager.client.rpc('bestellvorschlaege');
    expect(JSON.stringify(v.data ?? [])).not.toContain(dichtung);
  });

  it('am selben Tag zurückgenommen: die Position reserviert wieder', async () => {
    await max.client.rpc('laden_umschalten', { p_datum: morgen, p_baustelle: NR, p_position: 'p1', p_an: false, p_von: 'Max' });
    expect(await frei()).toBe(-5);
  });
});
