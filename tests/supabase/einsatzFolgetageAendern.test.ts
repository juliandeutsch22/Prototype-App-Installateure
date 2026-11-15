/**
 * EINEN MEHRTÄGIGEN EINSATZ ALS GANZES ÄNDERN UND ENTFERNEN (Durchsicht
 * 15.11.2026, V13) — `20261116010700_einsatz_folgetage_aendern.sql`.
 *
 * Gegenprobe: ohne die Migration kennt `einsatz_folgetage` kein
 * `p_angleichen` (an einem geplanten Folgetag wurde nur ergänzt: wer
 * herausgenommen war, blieb, Aufgabe und Uhrzeit blieben alt), und
 * `einsatz_folgetage_entfernen` gibt es nicht. „Bleibt gleich“: ohne den
 * Parameter ergänzt die Funktion wie bisher.
 *
 * Die Tage liegen im Dezember 2027 (Mo 06. – Fr 10.; der 08. ist Feiertag).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'folgetage-v13';
const BAU = 'V13-1';
let planer: Konto;
let anton: Konto;
let bernd: Konto;

async function einsatz(k: Konto, name: string, datum: string, comment = 'alt') {
  const { error } = await admin.from('assignments').insert({
    company_id: B, date: datum, project_number: BAU, user_id: k.uid, user_name: name, comment,
  });
  if (error) throw new Error(error.message);
}

const zeilen = async () =>
  ((await admin.from('assignments').select('date, user_id, comment, zeit_von').eq('company_id', B).order('date').order('user_id')).data ?? []);

beforeAll(async () => {
  await betriebAnlegen(B);
  planer = await konto(B, 'Projektleiter', 'v13plan');
  anton = await konto(B, 'Mitarbeiter', 'v13anton');
  bernd = await konto(B, 'Mitarbeiter', 'v13bernd');
}, 120_000);

beforeEach(async () => {
  await admin.from('assignments').delete().eq('company_id', B);
  await admin.from('einsatz_material').delete().eq('company_id', B);
});
afterAll(async () => {
  await admin.from('assignments').delete().eq('company_id', B);
  await admin.from('einsatz_material').delete().eq('company_id', B);
});

const zeileAnton = (comment = 'neu') => ({ user_id: anton.uid, user_name: 'Anton', comment, zeit_von: '07:00', zeit_bis: '12:00' });

describe('ändern: angleichen', () => {
  it('wer nicht mehr steht, geht; Aufgabe und Uhrzeit vom ersten Tag; Feiertag bleibt ausgelassen', async () => {
    for (const d of ['2027-12-07', '2027-12-09']) {
      await einsatz(anton, 'Anton', d);
      await einsatz(bernd, 'Bernd', d);
    }
    const { data, error } = await planer.client.rpc('einsatz_folgetage', {
      p_von: '2027-12-07', p_bis: '2027-12-09', p_baustelle: BAU, p_zeilen: [zeileAnton()], p_nur_werktage: true, p_angleichen: true,
    });
    expect(error).toBeNull();
    expect((data as { datum: string; ergebnis: string; entfernt: string[] }[]).map((t) => [t.datum, t.ergebnis, t.entfernt]))
      .toEqual([['2027-12-07', 'geaendert', ['Bernd']], ['2027-12-08', 'feiertag', []], ['2027-12-09', 'geaendert', ['Bernd']]]);
    expect(await zeilen()).toEqual([
      { date: '2027-12-07', user_id: anton.uid, comment: 'neu', zeit_von: '07:00:00' },
      { date: '2027-12-09', user_id: anton.uid, comment: 'neu', zeit_von: '07:00:00' },
    ]);
  });

  it('bleibt gleich: ohne `p_angleichen` wird nur ergänzt', async () => {
    await einsatz(bernd, 'Bernd', '2027-12-07');
    const { data } = await planer.client.rpc('einsatz_folgetage', {
      p_von: '2027-12-07', p_bis: '2027-12-07', p_baustelle: BAU, p_zeilen: [zeileAnton()], p_nur_werktage: true,
    });
    expect((data as { ergebnis: string }[])[0].ergebnis).toBe('ergaenzt');
    expect((await zeilen()).map((z) => z.comment).sort()).toEqual(['alt', 'neu']);
  });
});

describe('entfernen über mehrere Tage', () => {
  it('eine Person an jedem Tag des Zeitraums; leer gewordene Tage behandeln ihre Rüstliste nach Wahl', async () => {
    for (const d of ['2027-12-07', '2027-12-09', '2027-12-10']) await einsatz(anton, 'Anton', d);
    await einsatz(bernd, 'Bernd', '2027-12-09');
    const { data: kopf } = await admin.from('einsatz_material').insert({ company_id: B, date: '2027-12-10', project_number: BAU, uids: [anton.uid] }).select('id').single();
    await admin.from('einsatz_material_positionen').insert({ id: 'p1', company_id: B, einsatz_material_id: kopf!.id, position: 0, name: 'Therme', menge: 1 });

    const { data, error } = await planer.client.rpc('einsatz_folgetage_entfernen', {
      p_von: '2027-12-07', p_bis: '2027-12-10', p_baustelle: BAU, p_user: anton.uid, p_ruestliste: 'aufloesen',
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      { datum: '2027-12-07', entfernt: 1, ruestliste: null, in_arbeit: 0 },
      { datum: '2027-12-09', entfernt: 1, ruestliste: null, in_arbeit: 0 },
      { datum: '2027-12-10', entfernt: 1, ruestliste: 'aufgeloest', in_arbeit: 0 },
    ]);
    // Bernd bleibt; die Liste des leeren Tages ist aufgelöst.
    expect((await zeilen()).map((z) => z.user_id)).toEqual([bernd.uid]);
    expect((await admin.from('einsatz_material').select('id').eq('company_id', B)).data).toEqual([]);
  });

  it('der Monteur darf nicht; mehr als 62 Tage und „fragen“ weist die Funktion ab', async () => {
    expect((await anton.client.rpc('einsatz_folgetage_entfernen', { p_von: '2027-12-07', p_bis: '2027-12-08', p_baustelle: BAU })).error?.code).toBe('42501');
    expect((await planer.client.rpc('einsatz_folgetage_entfernen', { p_von: '2027-12-01', p_bis: '2028-03-01', p_baustelle: BAU })).error?.code).toBe('22023');
    expect((await planer.client.rpc('einsatz_folgetage_entfernen', { p_von: '2027-12-07', p_bis: '2027-12-08', p_baustelle: BAU, p_ruestliste: 'fragen' })).error?.code).toBe('22023');
  });
});
