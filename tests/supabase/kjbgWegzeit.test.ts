/**
 * JUGENDSCHUTZ: WEGZEIT UND VERTEILUNG LAUT KOLLEKTIVVERTRAG (A9 der
 * Durchsicht vom 24.10.2026).
 *
 * Die Wegzeit zwischen Schule und Betrieb geht je Schultag mit
 * `berufsschule_eintragen` mit (§ 11 Abs 7 KJBG); die Datenbank nimmt sie nur
 * am Berufsschultag und bis 4 Std. Ob der Kollektivvertrag eine andere
 * Verteilung zulässt (§ 11 Abs 3), stellt die Geschäftsführung ein.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getAustrianHolidayName } from '@shared/feiertage';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'kjbg-wegzeit';
let chefin: Konto;
let buero: Konto;
let lena: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'kwgf');
  buero = await konto(BETRIEB, 'Buchhaltung', 'kwbuero');
  lena = await konto(BETRIEB, 'Mitarbeiter', 'kwlena');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'kwmon');
  const lehre = await admin.from('users')
    .update({ einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeit_monate: 36 }).eq('id', lena.uid);
  if (lehre.error) throw new Error(lehre.error.message);
}, 120_000);

const schultage = async (tage: string[]) =>
  (await admin.from('time_entries').select('date, unterricht_min, wegzeit_min')
    .eq('user_id', lena.uid).eq('status', 'Berufsschule').in('date', tage).order('date')).data;

describe('Wegzeit am Berufsschultag', () => {
  it('das Büro trägt Unterricht und Weg je Schultag ein', async () => {
    const { error } = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lena.uid, p_von: '2027-05-03', p_bis: '2027-05-04', p_notiz: null,
      p_unterricht_min: 360, p_wegzeit_min: 45,
    });
    expect(error).toBeNull();
    expect(await schultage(['2027-05-03', '2027-05-04'])).toEqual([
      { date: '2027-05-03', unterricht_min: 360, wegzeit_min: 45 },
      { date: '2027-05-04', unterricht_min: 360, wegzeit_min: 45 },
    ]);
  });

  it('bleibt gleich: wie eine ältere App ohne Weg gerufen, bleibt er leer', async () => {
    const { error } = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lena.uid, p_von: '2027-05-05', p_bis: '2027-05-05', p_notiz: null, p_unterricht_min: 420,
    });
    expect(error).toBeNull();
    expect(await schultage(['2027-05-05'])).toEqual([{ date: '2027-05-05', unterricht_min: 420, wegzeit_min: null }]);
  });

  it('der Lehrling trägt seinen Weg selbst ein', async () => {
    /*
      Der jüngste Arbeitstag bis heute — höchstens sechs Tage zurück (selbst
      geht bis 14). Bis 27.10.2026 stand hier „der Montag dieser Woche“: in
      der Woche des Nationalfeiertags (Montag, 26.10.) war das kein
      Arbeitstag, und die Prüfung scheiterte eine ganze Woche lang an
      „Im Zeitraum liegt kein Arbeitstag“.
    */
    const [j, m, t] = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' }).split('-').map(Number);
    const tag = new Date(j, m - 1, t, 12);
    while (tag.getDay() === 0 || tag.getDay() === 6 || getAustrianHolidayName(tag)) tag.setDate(tag.getDate() - 1);
    const arbeitstag = `${tag.getFullYear()}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`;
    const { error } = await lena.client.rpc('berufsschule_eintragen', {
      p_user: null, p_von: arbeitstag, p_bis: arbeitstag, p_notiz: null, p_wegzeit_min: 30,
    });
    expect(error).toBeNull();
    expect(await schultage([arbeitstag])).toEqual([{ date: arbeitstag, unterricht_min: null, wegzeit_min: 30 }]);
  });

  it('Gegenprobe: kein Weg von null Minuten oder über 4 Std., keiner an einem Arbeitstag', async () => {
    for (const falsch of [0, 241]) {
      const { error } = await buero.client.rpc('berufsschule_eintragen', {
        p_user: lena.uid, p_von: '2027-05-06', p_bis: '2027-05-06', p_notiz: null, p_wegzeit_min: falsch,
      });
      expect(error?.message).toMatch(/Wegzeit/);
    }
    expect(await schultage(['2027-05-06'])).toEqual([]);
    const { error } = await admin.from('time_entries').insert(buchung(monteur, '2027-05-06', { wegzeit_min: 30 }));
    expect(error?.message).toMatch(/time_entries_wegzeit/);
  });
});

describe('Andere Verteilung laut Kollektivvertrag', () => {
  const einstellung = async () =>
    (await admin.from('companies').select('kjbg_verteilung_kv').eq('id', BETRIEB).single()).data?.kjbg_verteilung_kv;

  it('ab Werk aus; die Geschäftsführung schaltet sie ein', async () => {
    expect(await einstellung()).toBe(false);
    const { error } = await chefin.client.from('companies').update({ kjbg_verteilung_kv: true }).eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(await einstellung()).toBe(true);
  });

  it('Gegenprobe: ein Monteur nicht', async () => {
    const { count } = await monteur.client.from('companies')
      .update({ kjbg_verteilung_kv: false }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    expect(await einstellung()).toBe(true);
  });
});
