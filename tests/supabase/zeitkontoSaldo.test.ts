/**
 * DAS ZEITKONTO AUS DER DATENBANK (Durchsicht 15.11.2026, Z3, L1, L2).
 *
 * Die eine Eigenschaft, auf die es ankommt: `zeitkonto_salden` rechnet auf
 * die Hundertstelstunde dieselbe Zahl wie `calcOverallSaldo` in der App —
 * auf einem gewachsenen Bestand (kurzer Freitag, Vier-Tage-Woche, Schultag
 * mit Arbeit, halbe Tage am 24./31.12. und ohne, Freistellungen, Krank am
 * Wochenende, Nachtschicht, Urlaub in der Zukunft, Konto ohne Saldo-Start,
 * Geschäftsführung mit und ohne Zeitkonto). Der Saldo geht auf den
 * Lohnzettel; eine Abweichung wäre eine falsche Zahl dort.
 *
 * Dazu der Verlauf: eine Änderung „ab“ lässt die Monate davor stehen, die
 * alte App (Spalten direkt) erzeugt einen Eintrag ab heute, und nur
 * Geschäftsführung/Administration schreiben ihn.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto, type Rolle } from './helfer';
import { calcOverallSaldo, isAustrianHoliday, localDateStr, todayStr } from '@/lib/time';
import { zeitkontoBestand, type BestandPerson } from '../fixtures/zeitkontoBestand';
import type { AppUser, TimeEntry } from '@/types';

const PRAEFIX = `zk-saldo-${randomUUID().slice(0, 6)}`;
const bestand = zeitkontoBestand(todayStr(), 4711, PRAEFIX);
/** Je Person des Bestands ihr echtes Konto in der Datenbank. */
const konten = new Map<string, Konto>();
const buero = new Map<string, Konto>();
let chefin: Konto;
let monteur: Konto;

const zeile = (e: TimeEntry, uid: string) => ({
  id: randomUUID(), company_id: e.companyId, user_id: uid, user_name: e.userName, date: e.date, status: e.status,
  start_time: e.startTime ?? null, end_time: e.endTime ?? null, break_duration: e.breakDuration ?? 0,
  hours: e.hours ?? null, unterricht_min: e.unterrichtMin ?? null,
});

beforeAll(async () => {
  for (const b of bestand.betriebe) {
    await betriebAnlegen(b.id);
    await admin.from('companies').update({ dezember_halbtage: b.halbeTage }).eq('id', b.id);
    buero.set(b.id, await konto(b.id, 'Buchhaltung', 'zk-buero'));
  }
  for (const p of bestand.personen) {
    const k = await konto(p.companyId, p.role as Rolle, 'zk');
    konten.set(p.uid, k);
    const { error } = await admin.from('users').update({
      weekly_target_hours: p.weeklyTargetHours ?? null, work_days: p.workDays, tagessoll: p.tagessoll ?? null,
      yearly_vacation_days: p.yearlyVacationDays ?? 25, app_start_date: p.appStartDate ?? null, eintritt: null,
      initial_overtime: p.initialOvertime ?? 0, fuehrt_zeitkonto: p.fuehrtZeitkonto === true,
      // Z2: der Bestand kennt einen Ausgetretenen — sein Saldo endet am Austrittstag.
      austritt: p.austritt ?? null,
    }).eq('id', k.uid);
    if (error) throw new Error(error.message);
    const zeilen = bestand.buchungen.filter((e) => e.userId === p.uid).map((e) => zeile(e, k.uid));
    for (let i = 0; i < zeilen.length; i += 500) {
      const { error: f } = await admin.from('time_entries').insert(zeilen.slice(i, i + 500));
      if (f) throw new Error(f.message);
    }
  }
  chefin = await konto(bestand.betriebe[0].id, 'Geschäftsführung', 'zk-chefin');
  monteur = konten.get(bestand.personen[0].uid)!;
}, 300_000);

const erwartet = (p: BestandPerson, over: Partial<AppUser> = {}) =>
  calcOverallSaldo({ ...p, ...over }, bestand.buchungen.filter((e) => e.userId === p.uid), p.halbeTage);

describe('Saldo aus der Datenbank = Saldo der App', () => {
  it('je Person dieselbe Zahl und dieselben Lücken — eine Anfrage je Betrieb (L2)', async () => {
    for (const b of bestand.betriebe) {
      const { data, error } = await buero.get(b.id)!.client.rpc('zeitkonto_salden', {});
      expect(error).toBeNull();
      const zeilen = new Map((data as Array<{ user_id: string; saldo_h: number; tage_ohne_buchung: number; hat_konfig: boolean }>)
        .map((z) => [z.user_id, z]));
      for (const p of bestand.personen.filter((x) => x.companyId === b.id)) {
        const z = zeilen.get(konten.get(p.uid)!.uid)!;
        const e = erwartet(p);
        expect({ name: p.name, saldo: Number(z.saldo_h), luecken: z.tage_ohne_buchung, konfig: z.hat_konfig })
          .toEqual({ name: p.name, saldo: e.saldoH, luecken: e.daysWithoutEntry, konfig: e.hasConfig });
      }
    }
  });

  it('der Monteur bekommt nur sein eigenes Konto (wie `time_entries_lesen`)', async () => {
    const { data } = await monteur.client.rpc('zeitkonto_salden', {});
    expect((data as Array<{ user_id: string }>).map((z) => z.user_id)).toEqual([monteur.uid]);
    const fremd = await monteur.client.rpc('zeitkonto_salden', { p_user: konten.get(bestand.personen[1].uid)!.uid });
    expect(fremd.data).toEqual([]);
  });

  it('die Monatsbilanzen tragen das Soll des Monats und summieren sich zum Saldo', async () => {
    const p = bestand.personen[1]; // kurzer Freitag
    const uid = konten.get(p.uid)!.uid;
    const { data } = await buero.get(p.companyId)!.client.rpc('zeitkonto_monate', {
      p_von: p.appStartDate, p_bis: todayStr(), p_user: uid,
    });
    const monate = data as Array<{ saldo_min: number; soll_min: number }>;
    expect(monate.length).toBeGreaterThan(50);
    expect(monate.every((m) => Number(m.soll_min) >= 0)).toBe(true);
    const summe = monate.reduce((s, m) => s + Number(m.saldo_min), 0);
    expect(Math.round((Number(p.initialOvertime ?? 0) + summe / 60) * 100) / 100).toBe(erwartet(p).saldoH);
  });
});

describe('Arbeitszeit mit „gültig ab“ (Z3)', () => {
  const p = bestand.personen[0]; // Vollzeit, 40 Std
  const uid = () => konten.get(p.uid)!.uid;
  const saldo = async () => {
    const { data } = await buero.get(p.companyId)!.client.rpc('zeitkonto_salden', { p_user: uid() });
    return Number((data as Array<{ saldo_h: number }>)[0].saldo_h);
  };
  const zeileHeute = async () => (await admin.from('users').select('weekly_target_hours, arbeitszeit_verlauf').eq('id', uid()).single()).data!;

  it('nur Geschäftsführung und Administration ändern sie', async () => {
    const { error } = await monteur.client.rpc('arbeitszeit_aendern', {
      p_user: uid(), p_ab: todayStr(), p_wochenstunden: 30, p_arbeitstage: [1, 2, 3, 4, 5],
    });
    expect(error?.code).toBe('42501');
  });

  it('ab einem Tag in der Zukunft: Saldo und heutige Werte bleiben', async () => {
    const vorher = await saldo();
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 10);
    const { error } = await chefin.client.rpc('arbeitszeit_aendern', {
      p_user: uid(), p_ab: localDateStr(morgen), p_wochenstunden: 30, p_arbeitstage: [1, 2, 3, 4, 5],
    });
    expect(error).toBeNull();
    expect(await saldo()).toBe(vorher);
    const z = await zeileHeute();
    expect(Number(z.weekly_target_hours)).toBe(40);
    // Der Übergang: der Eintrag „ab Saldo-Start mit den heutigen Werten“ vor dem neuen.
    expect(z.arbeitszeit_verlauf.map((e: { ab: string; wochenstunden: number }) => [e.ab, Number(e.wochenstunden)]))
      .toEqual([[p.appStartDate, 40], [localDateStr(morgen), 30]]);
  });

  it('ab dem Ersten vor drei Monaten: die Monate davor bleiben, danach gilt das neue Soll — wie in der App', async () => {
    const ab = localDateStr(new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1));
    const { error } = await chefin.client.rpc('arbeitszeit_aendern', {
      p_user: uid(), p_ab: ab, p_wochenstunden: 30, p_arbeitstage: [1, 2, 3, 4, 5],
    });
    expect(error).toBeNull();
    const z = await zeileHeute();
    expect(Number(z.weekly_target_hours)).toBe(30);
    const verlauf = z.arbeitszeit_verlauf;
    expect(await saldo()).toBe(erwartet(p, { weeklyTargetHours: 30, arbeitszeitVerlauf: verlauf }).saldoH);
    // Gegenprobe: rückwirkend über alles wäre eine ganz andere Zahl.
    expect(await saldo()).not.toBe(erwartet(p, { weeklyTargetHours: 30 }).saldoH);
  });

  it('den Verlauf schreibt die App nicht direkt mit — ein mitgeschickter wird verworfen', async () => {
    const vorher = (await zeileHeute()).arbeitszeit_verlauf;
    await chefin.client.from('users').update({ arbeitszeit_verlauf: [] }).eq('id', uid());
    expect((await zeileHeute()).arbeitszeit_verlauf).toEqual(vorher);
  });

  it('die alte App ändert die Spalte direkt: daraus wird ein Eintrag ab heute, nie mehr rückwirkend', async () => {
    const andere = bestand.personen[2]; // Vier Tage, 32 Std, ohne Verlauf
    const id = konten.get(andere.uid)!.uid;
    const vorher = erwartet(andere).saldoH;
    const { error } = await chefin.client.from('users').update({ weekly_target_hours: 24 }).eq('id', id);
    expect(error).toBeNull();
    const z = (await admin.from('users').select('weekly_target_hours, arbeitszeit_verlauf').eq('id', id).single()).data!;
    expect(z.arbeitszeit_verlauf.map((e: { ab: string; wochenstunden: number }) => [e.ab, Number(e.wochenstunden)]))
      .toEqual([[andere.appStartDate, 32], [todayStr(), 24]]);
    const { data } = await buero.get(andere.companyId)!.client.rpc('zeitkonto_salden', { p_user: id });
    // Heute zählt noch nicht zum Soll — bis gestern bleibt alles, wie es war.
    expect(Number((data as Array<{ saldo_h: number }>)[0].saldo_h)).toBe(vorher);
  });

  it('weniger Arbeitstage ab einem Tag: Urlaub schreibt davor fünf, danach vier Tage', async () => {
    const lehrling = bestand.personen[3];
    const id = konten.get(lehrling.uid)!.uid;
    // Zwei Wochen im Mai in zwei Jahren — dort ist nichts gebucht und kein Feiertag am Montag oder Freitag zu erwarten.
    const von = new Date(new Date().getFullYear() + 2, 4, 15);
    while (von.getDay() !== 1) von.setDate(von.getDate() + 1);
    const wechsel = new Date(von);
    wechsel.setDate(wechsel.getDate() + 7);
    const bis = new Date(von);
    bis.setDate(bis.getDate() + 11);
    await chefin.client.rpc('arbeitszeit_aendern', {
      p_user: id, p_ab: localDateStr(wechsel), p_wochenstunden: 30.8, p_arbeitstage: [1, 2, 3, 4],
    });
    const { error } = await chefin.client.rpc('urlaub_eintragen', { p_user: id, p_von: localDateStr(von), p_bis: localDateStr(bis) });
    expect(error).toBeNull();
    const { data } = await admin.from('time_entries').select('date').eq('user_id', id).eq('status', 'Urlaub')
      .gte('date', localDateStr(von)).lte('date', localDateStr(bis)).order('date');
    const tage = (data ?? []).map((r: { date: string }) => r.date);
    const erwartetTage = [0, 1, 2, 3, 4, 7, 8, 9, 10].map((n) => {
      const d = new Date(von);
      d.setDate(d.getDate() + n);
      return localDateStr(d);
    }).filter((t) => !isAustrianHoliday(new Date(`${t}T00:00:00`)));
    expect(tage).toEqual(erwartetTage);
  });
});

describe('Urlaubsanspruch ab einem Urlaubsjahr (Z3)', () => {
  it('schreibt den Verlauf samt Übergang; die heutige Spalte folgt dem laufenden Jahr', async () => {
    const p = bestand.personen[1];
    const id = konten.get(p.uid)!.uid;
    const naechstes = new Date().getFullYear() + 1;
    const { error } = await chefin.client.rpc('urlaubsanspruch_aendern', { p_user: id, p_jahr: naechstes, p_tage: 30 });
    expect(error).toBeNull();
    const z = (await admin.from('users').select('yearly_vacation_days, urlaubsanspruch_verlauf').eq('id', id).single()).data!;
    expect(z.yearly_vacation_days).toBe(25);
    expect(z.urlaubsanspruch_verlauf.map((e: { jahr: number; tage: number }) => [e.jahr, e.tage]))
      .toEqual([[Number(p.appStartDate!.slice(0, 4)), 25], [naechstes, 30]]);
  });

  it('Gegenprobe: der Monteur darf es nicht', async () => {
    const { error } = await monteur.client.rpc('urlaubsanspruch_aendern', { p_user: monteur.uid, p_jahr: 2030, p_tage: 40 });
    expect(error?.code).toBe('42501');
  });
});
