/**
 * Testbericht 30.09.2026, Paket 2c — Nachtzeit (M35) und Überstundenmodell.
 *
 * Die Nachtminuten standen vorher in `zeitPlausibilitaet.ts` mit fester
 * Nacht 22–6 Uhr; das Kennzeichen „Nacht“ trug die ganze Buchung. Jetzt ist
 * die Nachtzeit je Betrieb einstellbar, und nur die Stunden darin tragen den
 * Zuschlag — in Rechnung, Lohn-CSV und Stundennachweis.
 */
import { describe, it, expect } from 'vitest';
import {
  NACHTZEIT_VORGABE, nachtArbeitMin, nachtMinutenIn, nachtzeitText, nachtzeitVon,
  ueberstundenRegelVon,
} from '@/lib/lohnregeln';
import { zuschlagszeit } from '@/features/accounting/zuschlaege';
import { ueberstundenNachTagesgrenze } from '@/features/accounting/ueberstunden';
import { assembleInvoice } from '@/features/invoices/assemble';
import type { AppUser, TimeEntry } from '@/types';

const eintrag = (over: Partial<TimeEntry> = {}): TimeEntry & { id: string } =>
  ({
    id: 'e1', companyId: 'c', userId: 'u', date: '2026-06-02', status: 'Anwesend',
    startTime: '20:00', endTime: '23:30', breakDuration: 0, isNightWork: true,
    projectNumber: '2026-001', ...over,
  }) as TimeEntry & { id: string };

describe('nachtMinutenIn — was in die Nachtzeit fällt', () => {
  it('zählt über Mitternacht, mit der Vorgabe 22–6 Uhr', () => {
    expect(nachtMinutenIn('20:00', '02:00')).toBe(4 * 60);
    expect(nachtMinutenIn('22:00', '06:00')).toBe(8 * 60);
    expect(nachtMinutenIn('04:00', '08:00')).toBe(2 * 60);
    expect(nachtMinutenIn('20:00', '23:30')).toBe(90);
    expect(nachtMinutenIn('07:00', '16:00')).toBe(0);
    // Beginn gleich Ende ist keine Spanne, ein leeres Feld auch nicht.
    expect(nachtMinutenIn('07:00', '07:00')).toBe(0);
    expect(nachtMinutenIn('', '02:00')).toBe(0);
  });

  it('folgt der Nachtzeit des Betriebs', () => {
    const nacht = nachtzeitVon({ nachtVon: '23:00', nachtBis: '05:00' });
    expect(nacht).toEqual({ von: 23 * 60, bis: 5 * 60 });
    expect(nachtMinutenIn('20:00', '23:30', nacht)).toBe(30);
    expect(nachtzeitText(nacht)).toBe('23–5 Uhr');
    // Eine Nacht, die nicht über Mitternacht geht.
    const frueh = nachtzeitVon({ nachtVon: '00:00', nachtBis: '06:00' });
    expect(nachtMinutenIn('22:00', '02:00', frueh)).toBe(120);
  });

  it('nimmt ohne gültige Angabe 22–6 Uhr', () => {
    expect(nachtzeitVon(null)).toEqual(NACHTZEIT_VORGABE);
    expect(nachtzeitVon({ nachtVon: '25:00', nachtBis: '06:00' })).toEqual(NACHTZEIT_VORGABE);
    expect(nachtzeitText(NACHTZEIT_VORGABE)).toBe('22–6 Uhr');
  });
});

describe('M35 — der Nachtzuschlag gilt nur für die Stunden in der Nachtzeit', () => {
  it('20:00–23:30 mit Kennzeichen: anderthalb Nachtstunden, nicht dreieinhalb', () => {
    expect(nachtArbeitMin(eintrag())).toBe(90);
    expect(zuschlagszeit([eintrag()], true).nachtMin).toBe(90);
  });

  it('die Pause geht zuerst von der Zeit außerhalb der Nacht ab', () => {
    // 20:00–23:30, 30 Minuten Pause: zwei Stunden davor, die Nachtstunden bleiben.
    expect(nachtArbeitMin(eintrag({ breakDuration: 30 }))).toBe(90);
    // 22:00–02:00 mit 30 Minuten Pause: alles ist Nacht, die Pause auch.
    expect(nachtArbeitMin(eintrag({ startTime: '22:00', endTime: '02:00', breakDuration: 30 }))).toBe(210);
  });

  it('ohne Kennzeichen keine Nachtstunden, ohne Uhrzeiten der ganze Eintrag', () => {
    expect(nachtArbeitMin(eintrag({ isNightWork: false }))).toBe(0);
    expect(nachtArbeitMin(eintrag({ startTime: undefined, endTime: undefined, hours: 3 }))).toBe(180);
  });

  it('Nacht und Notdienst: „davon beides“ sind nur die Nachtstunden', () => {
    const z = zuschlagszeit([eintrag({ isEmergency: true })], true);
    expect(z).toMatchObject({ nachtMin: 90, notdienstMin: 210, beidesMin: 90, gesamtMin: 210 });
  });

  it('die Rechnung teilt den Eintrag: zwei Stunden normal, anderthalb mit Nachtzuschlag', () => {
    const res = assembleInvoice('2026-001', [eintrag()]);
    expect(res.positions.map((p) => [p.label, p.qty])).toEqual([
      ['Facharbeiterstunden', 2],
      ['Facharbeiterstunden (Nachtarbeit +50 %)', 1.5],
    ]);
  });
});

describe('Überstunden nach Tagesgrenze', () => {
  const person = {
    weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], tagessoll: null,
  } as Pick<AppUser, 'weeklyTargetHours' | 'workDays' | 'tagessoll'>;
  const tag = (date: string, startTime: string, endTime: string, breakDuration = 30) =>
    eintrag({ date, startTime, endTime, breakDuration, isNightWork: false });
  const regel = (over: Partial<ReturnType<typeof ueberstundenRegelVon>> = {}) => ({
    ...ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' }), ...over,
  });

  it('beim Zeitkonto (Vorgabe) gibt es diese Zahl nicht', () => {
    expect(ueberstundenRegelVon(null).modell).toBe('zeitkonto');
    const ue = ueberstundenNachTagesgrenze(person, [tag('2026-06-02', '06:00', '18:00')], ueberstundenRegelVon(null), true);
    expect(ue).toEqual({ fuenfzigMin: 0, hundertMin: 0 });
  });

  it('über dem Tagessoll: 06:00–18:00 mit Pause sind 11,5 Stunden, 3,5 davon Überstunden', () => {
    const ue = ueberstundenNachTagesgrenze(person, [tag('2026-06-02', '06:00', '18:00')], regel(), true);
    expect(ue).toEqual({ fuenfzigMin: 210, hundertMin: 0 });
  });

  it('bei Gleitzeit erst über zehn Stunden', () => {
    const ue = ueberstundenNachTagesgrenze(person, [tag('2026-06-02', '06:00', '18:00')], regel({ grenze: 'zehn' }), true);
    expect(ue).toEqual({ fuenfzigMin: 90, hundertMin: 0 });
  });

  it('zwei Einträge an einem Tag zählen zusammen', () => {
    const ue = ueberstundenNachTagesgrenze(person, [
      tag('2026-06-02', '07:00', '12:00', 0),
      { ...tag('2026-06-02', '13:00', '18:00', 0), id: 'e2' },
    ], regel(), true);
    expect(ue.fuenfzigMin).toBe(2 * 60);
  });

  it('am Samstag ist jede Stunde eine Überstunde — mit 50 %', () => {
    const ue = ueberstundenNachTagesgrenze(person, [tag('2026-06-06', '08:00', '12:00', 0)], regel(), true);
    expect(ue).toEqual({ fuenfzigMin: 240, hundertMin: 0 });
  });

  it('an Sonn- und Feiertagen mit 100 %, wenn eingeschaltet', () => {
    const sonntag = tag('2026-06-07', '08:00', '12:00', 0);
    const fronleichnam = { ...tag('2026-06-04', '08:00', '10:00', 0), id: 'e2' };
    expect(ueberstundenNachTagesgrenze(person, [sonntag, fronleichnam], regel({ hundertSonnFeiertag: true }), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 360 });
    // Ausgeschaltet bleibt es bei 50 %.
    expect(ueberstundenNachTagesgrenze(person, [sonntag, fronleichnam], regel(), true))
      .toEqual({ fuenfzigMin: 360, hundertMin: 0 });
  });

  it('folgt dem eigenen Tagessoll je Wochentag (M5)', () => {
    const kurzerFreitag = { ...person, tagessoll: { '1': 8.5, '2': 8.5, '3': 8.5, '4': 8.5, '5': 5 } };
    // Freitag 07:00–13:00 ohne Pause: sechs Stunden, eine über dem Soll von fünf.
    const ue = ueberstundenNachTagesgrenze(kurzerFreitag, [tag('2026-06-05', '07:00', '13:00', 0)], regel(), true);
    expect(ue.fuenfzigMin).toBe(60);
  });
});

describe('Überstunden in der Lohn-CSV', () => {
  const mitarbeiter = {
    id: 'u1', uid: 'u1', companyId: 'c', name: 'Max', email: 'm@x.at', role: 'Mitarbeiter',
    weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01',
  } as AppUser;
  const langerTag = eintrag({ date: '2026-06-02', startTime: '06:00', endTime: '18:00', breakDuration: 30, isNightWork: false });

  it('stehen nur beim Modell „Tagesgrenze“ da — hinten angehängt', async () => {
    const { buildMonthCsv } = await import('@/features/accounting/export');
    const { calcMonthStats } = await import('@/lib/time');
    const stats = calcMonthStats(mitarbeiter, [langerTag], [langerTag], 2026, 5, true);
    const zeilen = [{ user: mitarbeiter, monthEntries: [langerTag], stats }];

    const ohne = buildMonthCsv(zeilen, 2026, 5, true);
    expect(ohne).not.toContain('Überstunden');

    const mit = buildMonthCsv(zeilen, 2026, 5, true, {
      ueberstunden: ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' }),
    });
    const zeilenDanach = mit.split('\n');
    const ab = zeilenDanach.indexOf('Mitarbeiter-Zusammenfassung');
    // Direkt hinter der Dezember-Spalte; dahinter nur, was seither hinten angehängt wurde (4.1).
    expect(zeilenDanach[ab + 1]).toContain(
      '24./31.12. ab 12 Uhr(Std);Überstunden 50 %(Std);Überstunden 100 %(Std);Einstufung;Lehrjahr;Berufsschule-Tage;Berufsschule(Std)',
    );
    expect(zeilenDanach[ab + 1].endsWith('Berufsschule(Std)')).toBe(true);
    // 06:00–18:00 mit Pause sind 11,5 Stunden, 3,5 über dem Tagessoll von 8.
    expect(zeilenDanach[ab + 2].endsWith(';3,50;0,00;;;0;0,00')).toBe(true);
  });
});
