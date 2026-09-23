/**
 * Der Wochenplan für alle — was ein Monteur über die Abwesenheit anderer
 * erfährt, gegen die echte Datenbank.
 *
 * Die Zusage: mit dem Schalter WER, VON, BIS — nichts weiter. Ohne Schalter
 * nichts. Und die Urlaubstabelle selbst bleibt für fremde Zeilen zu.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'woche-a';
const ANDERER = 'woche-b';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let kollegin: Konto;
let fremd: Konto;
let plattform: Konto;

async function schalter(an: boolean) {
  const { error } = await admin.from('companies').update({ wochenplan_fuer_alle: an }).eq('id', BETRIEB);
  if (error) throw new Error(error.message);
}

const abwesend = (wer: Konto) =>
  wer.client.rpc('wochenplan_abwesend', { p_von: '2026-10-05', p_bis: '2026-10-11' });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Woche A');
  await betriebAnlegen(ANDERER, 'Woche B');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'wochegf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'wochebu');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'wochemon');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'wochekol');
  fremd = await konto(ANDERER, 'Mitarbeiter', 'wochefremd');
  plattform = await plattformkonto('wocheplattform');
  const urlaub = (uid: string, status: string, von: string, bis: string, betrieb = BETRIEB) => ({
    company_id: betrieb, user_id: uid, user_name: 'x', von, bis, tage: 3, status,
    notiz: 'Hochzeit der Schwester',
  });
  const { error } = await admin.from('vacations').insert([
    urlaub(kollegin.uid, 'Genehmigt', '2026-10-01', '2026-10-07'),
    urlaub(kollegin.uid, 'Beantragt', '2026-10-09', '2026-10-09'),
    urlaub(fremd.uid, 'Genehmigt', '2026-10-05', '2026-10-06', ANDERER),
  ]);
  if (error) throw new Error(error.message);
}, 180_000);

afterAll(async () => {
  await admin.from('vacations').delete().in('company_id', [BETRIEB, ANDERER]);
  await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
  await schalter(false);
});

describe('Ohne Schalter', () => {
  it('erfährt der Monteur nichts', async () => {
    await schalter(false);
    const { data, error } = await abwesend(monteur);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('sieht das Büro die Abwesenheiten trotzdem — es plant damit', async () => {
    await schalter(false);
    for (const wer of [chef, buch]) {
      const { data } = await abwesend(wer);
      expect(data).toHaveLength(1);
    }
  });
});

describe('Mit Schalter', () => {
  it('bekommt der Monteur WER, VON, BIS — und nichts weiter', async () => {
    await schalter(true);
    const { data, error } = await abwesend(monteur);
    expect(error).toBeNull();
    // Auf die Woche zugeschnitten; kein Grund, keine Notiz, kein Status.
    expect(data).toEqual([
      { user_id: kollegin.uid, von: '2026-10-05', bis: '2026-10-07', grund: null, zeiten: null },
    ]);
  });

  it('zeigt nur GENEHMIGTEN Urlaub — ein Antrag ist noch keine Abwesenheit', async () => {
    await schalter(true);
    const { data } = await abwesend(monteur);
    expect((data as { bis: string }[]).some((z) => z.bis === '2026-10-09')).toBe(false);
  });

  it('lässt die Urlaubstabelle selbst für fremde Zeilen zu', async () => {
    await schalter(true);
    const { data } = await monteur.client.from('vacations').select('id, notiz').eq('user_id', kollegin.uid);
    expect(data ?? []).toEqual([]);
  });

  it('zeigt keinem Betrieb die Abwesenheiten eines anderen', async () => {
    await schalter(true);
    const { data } = await abwesend(fremd);
    expect(data).toEqual([]);
  });

  it('gibt dem Support nichts — auch nicht mit Freigabe', async () => {
    await schalter(true);
    const { error } = await chef.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chef.uid, grund: 'Rechnung prüfen',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(error).toBeNull();
    const { data } = await abwesend(plattform);
    expect(data ?? []).toEqual([]);
  });

  it('nimmt keinen beliebig langen Zeitraum an', async () => {
    await schalter(true);
    const { data } = await monteur.client.rpc('wochenplan_abwesend', { p_von: '2026-01-01', p_bis: '2026-12-31' });
    expect(data).toEqual([]);
  });
});

describe('Der Schalter', () => {
  it('setzt nur die Spitze — nicht der Monteur', async () => {
    const { error, count } = await monteur.client
      .from('companies').update({ wochenplan_fuer_alle: true }, { count: 'exact' }).eq('id', BETRIEB);
    expect(error !== null || count === 0).toBe(true);
  });
});
