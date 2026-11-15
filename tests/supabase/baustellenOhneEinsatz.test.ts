/**
 * „BAUSTELLEN OHNE EINSATZ“ AUS EINER QUELLE (Durchsicht 15.11.2026, P8) —
 * `baustellen_ohne_einsatz` aus
 * `supabase/migrations/20261116010400_baustellen_ohne_einsatz.sql`.
 *
 * Gegenprobe: vorher gab es die Funktion nicht; die Liste hinter dem Zähler
 * holte alle Einsätze mit Grenze 3.000 und rechnete selbst. „Bleibt gleich“:
 * dieselbe Regel wie `ohneEinsatzListe` (aktiv, Fenster 14 Tage, Beginn und
 * Ende, letzter Einsatz der 90 Tage davor).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'ohne-einsatz-p8';
const FREMD = 'ohne-einsatz-p8b';
const HEUTE = '2027-03-01';
let chef: Konto;
let monteur: Konto;
let fremd: Konto;

async function baustelle(nummer: string, mehr: Record<string, unknown> = {}, betrieb = B) {
  const { error } = await admin.from('projects').insert({
    company_id: betrieb, project_number: nummer, customer_name: 'K', status: 'Aktiv', ...mehr,
  });
  if (error) throw new Error(error.message);
}

async function einsatz(nummer: string, datum: string) {
  const { error } = await admin.from('assignments').insert({
    company_id: B, date: datum, project_number: nummer, user_id: monteur.uid, user_name: 'Max',
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(B);
  await betriebAnlegen(FREMD);
  chef = await konto(B, 'Geschäftsführung', 'p8-chef');
  monteur = await konto(B, 'Mitarbeiter', 'p8-mon');
  fremd = await konto(FREMD, 'Geschäftsführung', 'p8-fremd');
  await baustelle('OE-KOMMEND');
  await baustelle('OE-LETZTER');
  await baustelle('OE-NIE');
  await baustelle('OE-PAUSIERT', { status: 'Pausiert' });
  await baustelle('OE-SPAETER', { start_date: '2027-04-01' });
  await baustelle('OE-VORBEI', { start_date: '2027-01-01', end_date: '2027-02-15' });
  await baustelle('OE-FREMD', {}, FREMD);
  await einsatz('OE-KOMMEND', '2027-03-10');
  await einsatz('OE-LETZTER', '2027-02-20');
  await einsatz('OE-LETZTER', '2026-10-01'); // älter als 90 Tage: zählt nicht als „zuletzt“
}, 120_000);

afterAll(async () => {
  await admin.from('assignments').delete().eq('company_id', B);
  await admin.from('projects').delete().in('company_id', [B, FREMD]);
});

describe('baustellen_ohne_einsatz', () => {
  it('genau die aktiven ohne Einsatz in den nächsten 14 Tagen, mit dem letzten der 90 Tage davor', async () => {
    const { data, error } = await chef.client.rpc('baustellen_ohne_einsatz', { p_heute: HEUTE });
    expect(error).toBeNull();
    expect(data).toEqual([
      { project_number: 'OE-LETZTER', zuletzt: '2027-02-20' },
      { project_number: 'OE-NIE', zuletzt: null },
    ]);
  });

  it('ein Einsatz am 14. Tag zählt noch als kommend, am 15. nicht mehr', async () => {
    await baustelle('OE-RAND14');
    await baustelle('OE-RAND15');
    await einsatz('OE-RAND14', '2027-03-15');
    await einsatz('OE-RAND15', '2027-03-16');
    const { data } = await chef.client.rpc('baustellen_ohne_einsatz', { p_heute: HEUTE });
    const nummern = (data as { project_number: string }[]).map((z) => z.project_number);
    expect(nummern).toContain('OE-RAND15');
    expect(nummern).not.toContain('OE-RAND14');
  });

  it('nur der eigene Betrieb', async () => {
    const { data } = await fremd.client.rpc('baustellen_ohne_einsatz', { p_heute: HEUTE });
    expect(data).toEqual([{ project_number: 'OE-FREMD', zuletzt: null }]);
  });
});
