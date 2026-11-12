/**
 * EIN EINSATZ ÜBER MEHRERE TAGE (B4, F2, E85) — `einsatz_folgetage`.
 *
 * Geprüft wird je Tag, was das Formular dem Planer danach sagt: ausgelassen
 * (Wochenende, Feiertag, Betriebsurlaub), wer abwesend nicht eingeteilt
 * wurde, wer auch anderswo steht, und dass ein schon geplanter Tag ERGÄNZT
 * wird — nie ersetzt. Dazu die Rechte: nur die Führung, nur der eigene
 * Betrieb, höchstens 62 Tage.
 *
 * Die Tage liegen im Dezember 2027, weit weg von heute und morgen: dort
 * meldete sich sonst die Planänderung (B6) und gehörte nicht hierher.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'folgetage-a';
const FREMD = 'folgetage-b';
const BAU = 'B-FOLGE-1';

let planer: Konto;
let monteur: Konto;
let kollegin: Konto;
let fremd: Konto;
let chefin: Konto;
let plattform: Konto;

const zeilen = () => [
  { user_id: monteur.uid, user_name: 'Max Monteur', as_helper: false, comment: 'Bad', created_by: planer.uid, zeit_von: '07:00', zeit_bis: '15:30' },
  { user_id: kollegin.uid, user_name: 'Erna Kollegin', as_helper: true, comment: 'Bad', created_by: planer.uid, zeit_von: '07:00', zeit_bis: '15:30' },
];

const folgetage = (k: Konto, von: string, bis: string, nurWerktage = true, z: Record<string, unknown>[] = zeilen()) =>
  k.client.rpc('einsatz_folgetage', { p_von: von, p_bis: bis, p_baustelle: BAU, p_zeilen: z, p_nur_werktage: nurWerktage });

async function plan(datum: string) {
  const { data } = await admin.from('assignments').select('user_id, as_helper, comment, zeit_von, zeit_bis')
    .eq('company_id', BETRIEB).eq('date', datum).eq('project_number', BAU).order('user_name');
  return data ?? [];
}

async function aufraeumen() {
  await admin.from('assignments').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('einsatz_material').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('betriebsurlaube').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('vacations').delete().in('company_id', [BETRIEB, FREMD]);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  planer = await konto(BETRIEB, 'Projektleiter', 'fgplan');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'fgmon');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'fgkol');
  fremd = await konto(FREMD, 'Geschäftsführung', 'fgfremd');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'fgchef');
  plattform = await plattformkonto('fg-support');
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

describe('einsatz_folgetage — je Tag', () => {
  it('Wochenende, Feiertag, Betriebsurlaub, Abwesenheit: was ging und was nicht', async () => {
    // Sa 4.12. bis Fr 10.12.2027; Mi 8.12. ist Mariä Empfängnis.
    await admin.from('betriebsurlaube').insert({ company_id: BETRIEB, von: '2027-12-10', bis: '2027-12-10', bezeichnung: 'Inventur' });
    await admin.from('vacations').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'Max Monteur', von: '2027-12-09', bis: '2027-12-09', tage: 1, status: 'Genehmigt',
    });
    const { data, error } = await folgetage(planer, '2027-12-04', '2027-12-10');
    expect(error).toBeNull();
    const je = Object.fromEntries((data ?? []).map((t: { datum: string }) => [t.datum, t]));
    expect(je['2027-12-04']).toMatchObject({ ergebnis: 'wochenende' });
    expect(je['2027-12-05']).toMatchObject({ ergebnis: 'wochenende' });
    expect(je['2027-12-06']).toMatchObject({ ergebnis: 'geplant', eingeteilt: ['Max Monteur', 'Erna Kollegin'], abwesend: [] });
    expect(je['2027-12-07']).toMatchObject({ ergebnis: 'geplant' });
    expect(je['2027-12-08']).toMatchObject({ ergebnis: 'feiertag' });
    expect(je['2027-12-09']).toMatchObject({ ergebnis: 'geplant', eingeteilt: ['Erna Kollegin'], abwesend: ['Max Monteur'] });
    expect(je['2027-12-10']).toMatchObject({ ergebnis: 'betriebsurlaub', abwesend: ['Inventur'] });

    expect(await plan('2027-12-04')).toEqual([]);
    expect(await plan('2027-12-08')).toEqual([]);
    expect(await plan('2027-12-10')).toEqual([]);
    expect((await plan('2027-12-09')).map((a) => a.user_id)).toEqual([kollegin.uid]);
    // Helfer, Aufgabe und Uhrzeit kommen mit — der Helfer-Haken kostet bare Münze.
    const montag = await plan('2027-12-06');
    expect(montag).toHaveLength(2);
    expect(montag).toEqual(expect.arrayContaining([
      { user_id: monteur.uid, as_helper: false, comment: 'Bad', zeit_von: '07:00:00', zeit_bis: '15:30:00' },
      { user_id: kollegin.uid, as_helper: true, comment: 'Bad', zeit_von: '07:00:00', zeit_bis: '15:30:00' },
    ]));
  });

  it('Gegenprobe: ohne „nur Werktage“ wird das Wochenende geplant', async () => {
    const { data } = await folgetage(planer, '2027-12-04', '2027-12-05', false);
    expect((data ?? []).map((t: { ergebnis: string }) => t.ergebnis)).toEqual(['geplant', 'geplant']);
    expect(await plan('2027-12-04')).toHaveLength(2);
  });

  it('ein schon geplanter Tag wird ergänzt, nicht ersetzt — und niemand steht doppelt', async () => {
    await admin.from('assignments').insert({
      company_id: BETRIEB, date: '2027-12-06', project_number: BAU, user_id: kollegin.uid, user_name: 'Erna Kollegin',
      as_helper: false, comment: 'Vorher', created_by: planer.uid,
    });
    const { data } = await folgetage(planer, '2027-12-06', '2027-12-06');
    expect(data?.[0]).toMatchObject({ ergebnis: 'ergaenzt', eingeteilt: ['Max Monteur'] });
    const tag = await plan('2027-12-06');
    expect(tag).toHaveLength(2);
    // Die vorhandene Einteilung bleibt, wie sie war.
    expect(tag.find((a) => a.user_id === kollegin.uid)).toMatchObject({ comment: 'Vorher', as_helper: false });

    const nochmal = await folgetage(planer, '2027-12-06', '2027-12-06');
    expect(nochmal.data?.[0]).toMatchObject({ ergebnis: 'unveraendert', eingeteilt: [] });
    expect(await plan('2027-12-06')).toHaveLength(2);
  });

  it('auch auf einer anderen Baustelle: eingeteilt und genannt', async () => {
    await admin.from('assignments').insert({
      company_id: BETRIEB, date: '2027-12-07', project_number: 'B-ANDERS', user_id: monteur.uid, user_name: 'Max Monteur',
      as_helper: false, created_by: planer.uid,
    });
    const { data } = await folgetage(planer, '2027-12-07', '2027-12-07');
    expect(data?.[0]).toMatchObject({ ergebnis: 'geplant', anderswo: ['Max Monteur'] });
    expect(await plan('2027-12-07')).toHaveLength(2);
  });

  it('alle abwesend: niemand eingeteilt, und das steht da', async () => {
    for (const k of [monteur, kollegin]) {
      await admin.from('vacations').insert({
        company_id: BETRIEB, user_id: k.uid, user_name: 'x', von: '2027-12-07', bis: '2027-12-07', tage: 1, status: 'Genehmigt',
      });
    }
    const { data } = await folgetage(planer, '2027-12-07', '2027-12-07');
    expect(data?.[0]).toMatchObject({ ergebnis: 'alle_abwesend', eingeteilt: [] });
    expect(await plan('2027-12-07')).toEqual([]);
  });

  it('eine vorhandene Rüstliste bekommt die neue Mannschaft', async () => {
    await admin.from('einsatz_material').insert({ company_id: BETRIEB, date: '2027-12-06', project_number: BAU, uids: [] });
    await folgetage(planer, '2027-12-06', '2027-12-07');
    const { data } = await admin.from('einsatz_material').select('date, uids').eq('company_id', BETRIEB).order('date');
    // Am 7.12. gab es keine — eine neue entsteht hier nicht.
    expect(data?.map((m) => m.date)).toEqual(['2027-12-06']);
    expect([...(data?.[0].uids ?? [])].sort()).toEqual([monteur.uid, kollegin.uid].sort());
  });
});

describe('einsatz_folgetage — Rechte und Grenzen', () => {
  it('ein Monteur plant keine Einsätze', async () => {
    const { error } = await folgetage(monteur, '2027-12-06', '2027-12-07');
    expect(error?.code).toBe('42501');
    expect(await plan('2027-12-06')).toEqual([]);
  });

  it('der Betrieb kommt aus der Anmeldung — ein fremder schreibt nur in seinen eigenen, und fremde Leute gar nicht', async () => {
    const eigene = [{ user_id: fremd.uid, user_name: 'Fremd', as_helper: false, created_by: fremd.uid }];
    const { error } = await folgetage(fremd, '2027-12-06', '2027-12-06', true, eigene);
    expect(error).toBeNull();
    expect(await plan('2027-12-06')).toEqual([]);
    const { count } = await admin.from('assignments').select('id', { count: 'exact', head: true })
      .eq('company_id', FREMD).eq('date', '2027-12-06');
    expect(count).toBe(1);
    // Leute eines anderen Betriebs einteilen: abgelehnt, nichts geschrieben.
    const fremdeLeute = await folgetage(fremd, '2027-12-07', '2027-12-07');
    expect(fremdeLeute.error).not.toBeNull();
    const { count: danach } = await admin.from('assignments').select('id', { count: 'exact', head: true })
      .eq('company_id', FREMD).eq('date', '2027-12-07');
    expect(danach).toBe(0);
  });

  it('höchstens 62 Tage, Ende nicht vor dem Beginn, Mannschaft und Baustelle nötig', async () => {
    expect((await folgetage(planer, '2027-12-01', '2028-01-31')).error).toBeNull();
    await aufraeumen();
    expect((await folgetage(planer, '2027-12-01', '2028-02-01')).error?.code).toBe('22023');
    expect((await folgetage(planer, '2027-12-07', '2027-12-06')).error?.code).toBe('22023');
    expect((await folgetage(planer, '2027-12-06', '2027-12-06', true, [])).error?.code).toBe('22023');
    const ohneBau = await planer.client.rpc('einsatz_folgetage', { p_von: '2027-12-06', p_bis: '2027-12-06', p_baustelle: ' ', p_zeilen: zeilen() });
    expect(ohneBau.error?.code).toBe('22023');
  });

  it('nicht im Einblick des Supports, auch mit „mitarbeiten“ — die Abwesenheiten sieht nur der Betrieb', async () => {
    const { data: freigabe } = await chefin.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chefin.uid, grund: 'Planung prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    try {
      await einblickBeginnen(plattform, BETRIEB, freigabe!.id);
      // Gegenprobe: einen einzelnen Tag darf der Support mitplanen.
      const einzeln = await plattform.client.from('assignments').insert({
        company_id: BETRIEB, date: '2027-12-13', project_number: BAU, user_id: monteur.uid, user_name: 'Max Monteur', as_helper: false,
      });
      expect(einzeln.error).toBeNull();
      const { error } = await folgetage(plattform, '2027-12-06', '2027-12-07');
      expect(error?.code).toBe('42501');
      expect(error?.message).toMatch(/im Einblick nur der Betrieb/);
      expect(await plan('2027-12-06')).toEqual([]);
    } finally {
      await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
      await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
    }
  });

  it('nicht ohne Anmeldung', async () => {
    const gast = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await gast.rpc('einsatz_folgetage', { p_von: '2027-12-06', p_bis: '2027-12-06', p_baustelle: BAU, p_zeilen: zeilen() });
    expect(error).not.toBeNull();
    expect(await plan('2027-12-06')).toEqual([]);
  });
});
