import { describe, it, expect } from 'vitest';
import {
  calcWorkMin,
  fmtMin,
  isAustrianHoliday,
  isWeekend,
  getEasterDate,
  calcOverallSaldo,
  calcMonthStats,
  calcCompleteness,
  groupProjectHours,
  calcBudgetState,
  normProjectNumber,
  localDateStr,
} from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

const entry = (e: Partial<TimeEntry>): TimeEntry =>
  ({ id: 'x', companyId: 'c', date: '2026-06-15', status: 'Anwesend', userId: 'u', ...e }) as TimeEntry;

describe('calcWorkMin', () => {
  it('rechnet (Ende − Start − Pause) für Anwesend', () => {
    expect(calcWorkMin(entry({ startTime: '07:00', endTime: '16:30', breakDuration: 30 }))).toBe(540);
  });
  it('nutzt explizite hours, wenn keine Zeitspanne gesetzt ist (Sprach-Einträge)', () => {
    expect(calcWorkMin(entry({ hours: 4 }))).toBe(240);
  });
  it('lässt eine nachgetragene Zeitspanne den KI-Wert überschreiben', () => {
    // Sonst bliebe ein korrigierter Sprach-Eintrag stillschweigend beim alten Wert.
    expect(
      calcWorkMin(entry({ hours: 4, startTime: '07:00', endTime: '16:30', breakDuration: 30 })),
    ).toBe(540);
  });
  it('ist 0 für Krank/Urlaub und für unvollständige Zeiten', () => {
    expect(calcWorkMin(entry({ status: 'Krank' }))).toBe(0);
    expect(calcWorkMin(entry({ status: 'Anwesend', startTime: '', endTime: '' }))).toBe(0);
  });
  it('ist 0 für Krank/Urlaub AUCH mit gesetztem hours', () => {
    // Die Gutschrift für Abwesenheit passiert allein im Saldo (voller Solltag).
    // Zählte calcWorkMin hier mit, stünde der Tag doppelt in der Wochensumme.
    expect(calcWorkMin(entry({ status: 'Krank', hours: 8 }))).toBe(0);
    expect(calcWorkMin(entry({ status: 'Urlaub', hours: 8 }))).toBe(0);
  });
  it('rechnet über Mitternacht (Notdienst/Bereitschaft)', () => {
    // 22:00-06:00 ergab vorher 0 Stunden — die Nacht war schlicht unbezahlt.
    expect(calcWorkMin(entry({ startTime: '22:00', endTime: '06:00', breakDuration: 0 }))).toBe(480);
    expect(calcWorkMin(entry({ startTime: '20:00', endTime: '02:30', breakDuration: 30 }))).toBe(360);
  });

  it('behandelt gleiche Start- und Endzeit als 0, nicht als 24 Stunden', () => {
    expect(calcWorkMin(entry({ startTime: '08:00', endTime: '08:00', breakDuration: 0 }))).toBe(0);
  });

  it('floort auf 0, wenn die Pause länger ist als die Arbeitszeit', () => {
    expect(calcWorkMin(entry({ startTime: '08:00', endTime: '09:00', breakDuration: 120 }))).toBe(0);
  });
});

describe('fmtMin', () => {
  it('formatiert Minuten als HH:MM, auch negativ', () => {
    expect(fmtMin(540)).toBe('09:00');
    expect(fmtMin(-90)).toBe('-01:30');
  });
});

describe('Österreichische Feiertage', () => {
  it('Ostersonntag 2026 ist der 5. April (Gauß-Algorithmus)', () => {
    expect(localDateStr(getEasterDate(2026))).toBe('2026-04-05');
  });
  it('erkennt fixe und osterabhängige Feiertage', () => {
    expect(isAustrianHoliday(new Date(2026, 0, 1))).toBe(true); // Neujahr
    expect(isAustrianHoliday(new Date(2026, 9, 26))).toBe(true); // Nationalfeiertag
    expect(isAustrianHoliday(new Date(2026, 3, 6))).toBe(true); // Ostermontag
    expect(isAustrianHoliday(new Date(2026, 5, 17))).toBe(false); // normaler Mittwoch
  });
  it('erkennt das Wochenende', () => {
    expect(isWeekend(new Date(2026, 5, 14))).toBe(true); // Sonntag
    expect(isWeekend(new Date(2026, 5, 15))).toBe(false); // Montag
  });
});

describe('calcOverallSaldo', () => {
  const base: AppUser = {
    id: 'u', companyId: 'c', uid: 'u', name: 'Max', email: 'm@x.at', role: 'Mitarbeiter',
  };
  it('ohne Startdatum: nur Initialsaldo, hasConfig=false', () => {
    const r = calcOverallSaldo({ ...base, initialOvertime: 5 }, []);
    expect(r).toEqual({ saldoH: 5, hasConfig: false, daysWithoutEntry: 0 });
  });
  it('für GF/Admin (kein Soll/Ist): saldoH 0, hasConfig=false', () => {
    const r = calcOverallSaldo({ ...base, role: 'Geschäftsführung', appStartDate: '2026-01-01' }, []);
    expect(r).toEqual({ saldoH: 0, hasConfig: false, daysWithoutEntry: 0 });
  });

  it('meldet Werktage ohne jede Buchung', () => {
    // Der Fall, der die Zahl überhaupt nötig macht: Startdatum weit in der
    // Vergangenheit, aber nie etwas erfasst. Der Saldo ist dann rechnerisch
    // stark negativ — und als Aussage über den Mitarbeiter wertlos.
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const iso = start.toISOString().slice(0, 10);

    const r = calcOverallSaldo({ ...base, appStartDate: iso }, []);
    expect(r.hasConfig).toBe(true);
    expect(r.saldoH).toBeLessThan(0);
    // Rund 30 Kalendertage, davon etwa 20 Werktage — die genaue Zahl hängt
    // vom Wochentag und von Feiertagen ab.
    expect(r.daysWithoutEntry).toBeGreaterThan(15);
  });

  it('zählt Tage MIT Buchung nicht als Lücke', () => {
    const start = new Date();
    start.setDate(start.getDate() - 3);
    const iso = start.toISOString().slice(0, 10);
    const entries: TimeEntry[] = [];
    for (let i = 3; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      entries.push({
        id: `e${i}`, companyId: 'c', userId: 'u', date: d.toISOString().slice(0, 10),
        status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 60,
      } as TimeEntry);
    }
    const r = calcOverallSaldo({ ...base, appStartDate: iso }, entries);
    expect(r.daysWithoutEntry).toBe(0);
  });

  it('zählt auch Krank- und Urlaubstage als gebucht', () => {
    // Sie sind kein Erfassungsloch: der Tag ist bekannt und geht mit vollem
    // Soll ins Ist. Als Lücke gezählt würde die Warnung sinnlos aufleuchten.
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const iso = start.toISOString().slice(0, 10);
    const r = calcOverallSaldo({ ...base, appStartDate: iso }, [
      { id: 'e', companyId: 'c', userId: 'u', date: iso, status: 'Krank' } as TimeEntry,
    ]);
    expect(r.daysWithoutEntry).toBe(0);
  });
});

// Juni 2025 als fester Referenzmonat (liegt sicher in der Vergangenheit):
// 21 Werktage Mo-Fr, davon 2 Feiertage — Pfingstmontag (9.6.) und
// Fronleichnam (19.6.) — bleiben 19 Solltage.
const JUNE = { year: 2025, month: 5 };

const staff = (over: Partial<AppUser> = {}): AppUser =>
  ({
    id: 'u1', companyId: 'c', uid: 'u1', name: 'Test', email: 't@x.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40,
    yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01',
    initialOvertime: 0, ...over,
  }) as AppUser;

describe('calcMonthStats — Eintritt mitten im Zeitraum', () => {
  it('zaehlt nur Tage AB dem Startdatum', () => {
    // Eintritt am 16.06.2025. Vorher war der Mitarbeiter nicht im Betrieb;
    // fuer diese Tage darf ihm kein Soll angelastet werden.
    const s = calcMonthStats(
      staff({ appStartDate: '2025-06-16' }), [], [], JUNE.year, JUNE.month,
    );
    // 16.6. bis 30.6.: 11 Werktage Mo-Fr, davon Fronleichnam (19.6.) ->
    // 10 Solltage statt der 19 des ganzen Monats.
    expect(s.workdaysInMonth).toBe(10);
    expect(s.holidaysInMonth).toBe(1);
    expect(s.sollMin).toBe(10 * 8 * 60);
  });

  it('verlangt fuer Monate VOR dem Eintritt gar nichts', () => {
    // Der eigentliche Aerger: wer im Juni eintritt, sah fuer Jaenner bis Mai
    // je ein volles Monatsminus - fuer Zeit, in der er nicht angestellt war.
    const s = calcMonthStats(
      staff({ appStartDate: '2025-06-16' }), [], [], 2025, 2, // Maerz
    );
    expect(s.workdaysInMonth).toBe(0);
    expect(s.sollMin).toBe(0);
    expect(s.saldoMin).toBe(0);
  });

  it('rechnet ohne Startdatum weiterhin den ganzen Monat', () => {
    // Kein Startdatum heisst "gilt seit jeher" - das Verhalten bleibt.
    const s = calcMonthStats(
      staff({ appStartDate: null }), [], [], JUNE.year, JUNE.month,
    );
    expect(s.workdaysInMonth).toBe(19);
  });
});

describe('calcMonthStats', () => {
  it('zieht Feiertage vom Monatssoll ab', () => {
    const s = calcMonthStats(staff(), [], [], JUNE.year, JUNE.month);
    expect(s.workdaysInMonth).toBe(19);
    expect(s.holidaysInMonth).toBe(2);
    expect(s.dailyTargetH).toBe(8); // 40 h / 5 Arbeitstage
    expect(s.sollMin).toBe(19 * 8 * 60);
  });

  it('lässt Krank/Urlaub das Soll REDUZIEREN (abweichend vom Gesamtsaldo)', () => {
    const month = [
      entry({ date: '2025-06-02', status: 'Krank' }),
      entry({ date: '2025-06-03', status: 'Urlaub' }),
    ];
    const s = calcMonthStats(staff(), month, month, JUNE.year, JUNE.month);
    expect(s.krankDays).toBe(1);
    expect(s.urlaubDays).toBe(1);
    expect(s.requiredDays).toBe(17); // 19 − 1 − 1
    expect(s.istMin).toBe(0); // Abwesenheit zählt hier NICHT zum Ist
    expect(s.saldoMin).toBe(-17 * 8 * 60);
  });

  it('rechnet den Resturlaub über das ganze Jahr', () => {
    const year = [
      entry({ date: '2025-03-10', status: 'Urlaub' }),
      entry({ date: '2025-06-03', status: 'Urlaub' }),
    ];
    const s = calcMonthStats(staff(), [year[1]], year, JUNE.year, JUNE.month);
    expect(s.yearlyUrlaubDays).toBe(2);
    expect(s.urlaubRest).toBe(23); // 25 − 2
  });

  it('rechnet Teilzeit gleich wie der Gesamtsaldo', () => {
    // 4-Tage-Woche mit 32 h: 8,0 h/Tag — NICHT 32/5 = 6,4 h.
    // Sonst sähen Mitarbeiter und Buchhaltung verschiedene Salden.
    const teilzeit = staff({ workDays: [1, 2, 3, 4], weeklyTargetHours: 32 });
    const s = calcMonthStats(teilzeit, [], [], JUNE.year, JUNE.month);
    expect(s.dailyTargetH).toBe(8);
    expect(s.workdaysInMonth).toBeLessThan(19);
  });
});

describe('calcCompleteness', () => {
  it('meldet jeden ungebuchten Arbeitstag eines vergangenen Monats', () => {
    const r = calcCompleteness(staff(), [], JUNE.year, JUNE.month);
    expect(r.status).toBe('missing');
    expect(r.missingCount).toBe(19); // Feiertage brauchen keinen Eintrag
    expect(r.missingDates).not.toContain('2025-06-09'); // Pfingstmontag
    expect(r.missingDates).toContain('2025-06-02');
  });

  it('ist vollständig, wenn jeder Arbeitstag gebucht ist', () => {
    const all = calcCompleteness(staff(), [], JUNE.year, JUNE.month).missingDates
      .map((d) => entry({ date: d }));
    const r = calcCompleteness(staff(), all, JUNE.year, JUNE.month);
    expect(r.status).toBe('complete');
    expect(r.missingCount).toBe(0);
  });

  it('startet frühestens am appStartDate', () => {
    // Eintritt zur Monatsmitte -> die Tage davor dürfen nicht als Versäumnis zählen.
    const r = calcCompleteness(staff({ appStartDate: '2025-06-16' }), [], JUNE.year, JUNE.month);
    expect(r.missingDates).not.toContain('2025-06-02');
    expect(r.missingDates).toContain('2025-06-16');
  });
});

describe('Projektstunden und Budget', () => {
  const pe = (over: Partial<TimeEntry> = {}): TimeEntry =>
    entry({ projectNumber: '2025-001', startTime: '08:00', endTime: '16:00', breakDuration: 0, ...over });

  it('führt Nummern mit und ohne PR-Präfix zusammen', () => {
    expect(normProjectNumber('PR-2025-001')).toBe('2025-001');
    const g = groupProjectHours([pe(), pe({ id: 'e2', projectNumber: 'PR-2025-001' })]);
    expect(g).toHaveLength(1);
    expect(g[0].fachMin).toBe(960); // 2 × 8 h
  });

  it('trennt Fach- von Helferzeit', () => {
    const g = groupProjectHours([pe(), pe({ id: 'e2', isHelper: true })]);
    expect(g[0].fachMin).toBe(480);
    expect(g[0].helperMin).toBe(480);
  });

  it('lässt Abwesenheit und Einträge ohne Baustelle aus', () => {
    expect(groupProjectHours([pe({ status: 'Urlaub' })])).toHaveLength(0);
    expect(groupProjectHours([pe({ projectNumber: '' })])).toHaveLength(0);
  });

  it('ohne Budget gibt es keine Ampel statt einer falschen', () => {
    const b = calcBudgetState(480, undefined);
    expect(b.pct).toBeNull();
    expect(b.tone).toBe('neutral');
  });

  it('ampelt grün, gelb ab 80 % und rot erst ÜBER dem Budget', () => {
    expect(calcBudgetState(10 * 60, 20).tone).toBe('success'); // 50 %
    expect(calcBudgetState(16 * 60, 20).tone).toBe('warning'); // 80 %
    // Genau ausgeschöpft ist noch keine Überschreitung.
    expect(calcBudgetState(20 * 60, 20).over).toBe(false);
    expect(calcBudgetState(20 * 60, 20).tone).toBe('warning');
    expect(calcBudgetState(21 * 60, 20).over).toBe(true);
    expect(calcBudgetState(21 * 60, 20).tone).toBe('danger');
  });

  it('deckelt die Anzeige bei 100 %, meldet die Überschreitung aber', () => {
    const b = calcBudgetState(40 * 60, 20); // 200 %
    expect(b.pct).toBe(100);
    expect(b.over).toBe(true);
  });

  it('rechnet Helferzeit NICHT gegen das Budget', () => {
    // Helferstunden werden verrechnet, sind für die Kalkulation aber neutral.
    const g = groupProjectHours([pe({ isHelper: true })]);
    expect(calcBudgetState(g[0].fachMin, 8).pct).toBe(0);
  });
});
