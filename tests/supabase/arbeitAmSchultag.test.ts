/**
 * ARBEIT AM BERUFSSCHULTAG (Testbericht Runde 6, M1) — in der Datenbank.
 *
 * Neben dem Schultag steht gearbeitete Zeit; ein zweiter Schultag, Urlaub,
 * Krankenstand und ganztägiger Zeitausgleich bleiben gesperrt, und Arbeit
 * neben Urlaub oder Krankenstand auch. `berufsschule_eintragen` legt den
 * Schultag zur gebuchten Arbeit dazu. Die Monatssicht liefert je Schultag
 * Unterricht und Arbeit, damit das Zeitkonto nicht doppelt zählt.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import { bilanzAusEintraegen } from '@shared/monatsbilanz';

const BETRIEB = 'r6p1-schultag';
let buero: Konto;
let lena: Konto;

// Mo 02.03.2099 bis Fr 06.03.2099.
const MO = '2099-03-02';
const DI = '2099-03-03';
const MI = '2099-03-04';
const DO = '2099-03-05';
const FR = '2099-03-06';

const schule = (von: string, bis = von, unterricht: number | null = 360) =>
  buero.client.rpc('berufsschule_eintragen', {
    p_user: lena.uid, p_von: von, p_bis: bis, p_notiz: null, p_unterricht_min: unterricht, p_wegzeit_min: 60,
  });
const arbeit = (tag: string, von = '16:00', bis = '17:30') =>
  lena.client.from('time_entries').insert(buchung(lena, tag, { start_time: von, end_time: bis, break_duration: 0 }));

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buero = await konto(BETRIEB, 'Buchhaltung', 'r6p1buero');
  lena = await konto(BETRIEB, 'Mitarbeiter', 'r6p1lena');
  const lehre = await admin.from('users')
    .update({ einstufung: 'lehrling', lehrbeginn: '2098-09-01', lehrzeit_monate: 36 }).eq('id', lena.uid);
  if (lehre.error) throw new Error(lehre.error.message);
}, 120_000);

describe('Arbeit neben dem Schultag', () => {
  it('nach dem Unterricht lässt sich Arbeit buchen — auch eine zweite Baustelle', async () => {
    expect((await schule(MO)).error).toBeNull();
    expect((await arbeit(MO)).error).toBeNull();
    expect((await arbeit(MO, '17:30', '18:00')).error).toBeNull();
  });

  it('die Berufsschule kommt zu schon gebuchter Arbeit dazu', async () => {
    expect((await arbeit(DI, '14:00', '16:00')).error).toBeNull();
    const { data, error } = await schule(DI);
    expect(error).toBeNull();
    expect(data).toEqual({ tage: 1, angelegt: 1, uebersprungen: 0 });
  });

  it('Gegenprobe: ein zweiter Schultag am selben Tag entsteht nicht', async () => {
    const { data } = await schule(MO);
    expect(data).toEqual({ tage: 1, angelegt: 0, uebersprungen: 1 });
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true })
      .eq('user_id', lena.uid).eq('date', MO).eq('status', 'Berufsschule');
    expect(count).toBe(1);
  });

  it('Gegenprobe: ganztägiger Zeitausgleich neben dem Schultag bleibt gesperrt', async () => {
    const { error } = await buero.client.from('time_entries')
      .insert(buchung(lena, MO, { status: 'Zeitausgleich', start_time: null, end_time: null, break_duration: 0 }));
    expect(error?.message).toMatch(/gilt für den ganzen Tag/);
  });

  it('Gegenprobe: Arbeit neben Krankenstand und Urlaub bleibt gesperrt', async () => {
    const krank = await buero.client.rpc('krankmeldung_speichern', {
      p_id: null, p_user: lena.uid, p_von: MI, p_bis: MI, p_notiz: null,
    });
    expect(krank.error).toBeNull();
    expect((await arbeit(MI)).error?.message).toMatch(/„Krank"|„Krank“/);

    const urlaub = await buero.client.rpc('urlaub_eintragen', {
      p_user: lena.uid, p_von: DO, p_bis: DO, p_notiz: null, p_name: 'Büro',
    });
    expect(urlaub.error).toBeNull();
    expect((await arbeit(DO)).error?.message).toMatch(/„Urlaub"|„Urlaub“/);
  });

  it('Gegenprobe: neben Krankenstand und Urlaub kommt kein Schultag dazu', async () => {
    const { data } = await schule(MI, DO);
    expect(data).toEqual({ tage: 2, angelegt: 0, uebersprungen: 2 });
  });
});

describe('Die Monatssicht mit Unterricht und Arbeit', () => {
  it('liefert je Schultag mit Unterrichtszeit die Arbeit des Tages — wie die Bilanz der App', async () => {
    expect((await schule(FR, FR, null)).error).toBeNull(); // ohne Unterrichtszeit: nicht in `schultage`
    const { data, error } = await admin.from('monthly_stats')
      .select('anwesend_min, berufsschule_tage, schultage')
      .eq('user_id', lena.uid).eq('monat', '2099-03').single();
    expect(error).toBeNull();
    const zeile = data as { anwesend_min: number; berufsschule_tage: number; schultage: unknown };
    expect(Number(zeile.berufsschule_tage)).toBe(3);
    expect(zeile.schultage).toEqual([
      { tag: MO, unterrichtMin: 360, arbeitMin: 120 },
      { tag: DI, unterrichtMin: 360, arbeitMin: 120 },
    ]);

    // Dieselbe Rechnung wie `bilanzAusEintraegen` (shared) aus den Zeilen selbst.
    const { data: zeilen } = await admin.from('time_entries')
      .select('date, status, start_time, end_time, break_duration, hours, unterricht_min')
      .eq('user_id', lena.uid);
    const bilanz = bilanzAusEintraegen('2099-03', (zeilen ?? []).map((z) => ({
      userId: lena.uid,
      date: z.date as string,
      status: z.status as 'Anwesend',
      startTime: (z.start_time as string | null)?.slice(0, 5) ?? undefined,
      endTime: (z.end_time as string | null)?.slice(0, 5) ?? undefined,
      breakDuration: z.break_duration as number,
      hours: (z.hours as number | null) ?? undefined,
      unterrichtMin: z.unterricht_min as number | null,
    })));
    expect(bilanz.schultage).toEqual(zeile.schultage);
    expect(bilanz.anwesendMin).toBe(Number(zeile.anwesend_min));
  });

  it('die Sammelabfrage der Übersicht bringt die Schultage mit', async () => {
    const { data, error } = await buero.client.rpc('monatsbilanzen_alle', { p_ab_monat: '2099-03' });
    expect(error).toBeNull();
    const ihre = (data as Array<{ user_id: string; bilanzen: Array<{ monat: string; schultage: unknown }> }>)
      .find((z) => z.user_id === lena.uid);
    expect(ihre?.bilanzen.find((b) => b.monat === '2099-03')?.schultage).toEqual([
      { tag: MO, unterrichtMin: 360, arbeitMin: 120 },
      { tag: DI, unterrichtMin: 360, arbeitMin: 120 },
    ]);
  });
});
