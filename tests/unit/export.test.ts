import { describe, it, expect } from 'vitest';
import {
  buildMonthCsv,
  buildUserCsv,
  buildUserProjectCsv,
  monthCsvFilename,
  userCsvFilename,
  hoursPdfFilename,
  entriesInRange,
  type UserWithEntries,
} from '@/features/accounting/export';
import { calcMonthStats } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

const user = (over: Partial<AppUser> = {}): AppUser =>
  ({
    id: 'u1', companyId: 'c', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25,
    workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01', initialOvertime: 0, ...over,
  }) as AppUser;

const entry = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1',
    userName: 'Max Mustermann', startTime: '07:00', endTime: '16:30', breakDuration: 30,
    ...over,
  }) as TimeEntry;

function makeRow(entries: TimeEntry[], u = user()): UserWithEntries {
  return { user: u, monthEntries: entries, stats: calcMonthStats(u, entries, entries, 2025, 5) };
}

describe('CSV-Aufbau', () => {
  it('setzt Kopfzeile, Detailzeile und Zusammenfassung', () => {
    const csv = buildMonthCsv([makeRow([entry()])], 2025, 5);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Mitarbeiter;Datum;Status');
    expect(lines[1]).toContain('Max Mustermann;02.06.2025;Anwesend');
    expect(csv).toContain('Mitarbeiter-Zusammenfassung');
    expect(csv).toContain('Name;Ist(Std);Soll(Std);Saldo(Std)');
  });

  it('rechnet Arbeitszeit als Dezimalstunden mit Komma', () => {
    // 07:00–16:30 minus 30 min Pause = 9,00 h
    const csv = buildMonthCsv([makeRow([entry()])], 2025, 5);
    expect(csv.split('\n')[1]).toContain(';9,00;');
  });

  it('addiert die Wegzeit nur in der Spalte Gesamtzeit', () => {
    const csv = buildMonthCsv([makeRow([entry({ travelTime: 30 })])], 2025, 5);
    const cells = csv.split('\n')[1].split(';');
    expect(cells[cells.length - 2]).toBe('9,00'); // Arbeitszeit
    expect(cells[cells.length - 1]).toBe('9,50'); // + 30 min Wegzeit
  });

  it('escaped Semikolon und Anführungszeichen in JEDEM Feld', () => {
    // Im Legacy war nur der Kommentar gequotet — ein Semikolon im Kundennamen
    // verschob dort alle folgenden Spalten.
    const csv = buildMonthCsv(
      [makeRow([entry({ customerName: 'Müller; Sohn', comment: 'sagte "ok"' })])],
      2025,
      5,
    );
    const line = csv.split('\n')[1];
    expect(line).toContain('"Müller; Sohn"');
    expect(line).toContain('"sagte ""ok"""');
    // Kopf- und Datenzeile müssen gleich viele Felder haben.
    const countFields = (s: string) => s.match(/(^|;)(?:"(?:[^"]|"")*"|[^;]*)/g)?.length ?? 0;
    expect(countFields(line)).toBe(countFields(csv.split('\n')[0]));
  });

  it('schließt Helferstunden aus der Projektauswertung aus', () => {
    const csv = buildMonthCsv(
      [
        makeRow([
          entry({ projectNumber: '2025-001', isHelper: false }),
          entry({ id: 'e2', date: '2025-06-03', projectNumber: '2025-001', isHelper: true }),
        ]),
      ],
      2025,
      5,
    );
    const projLine = csv.split('\n').find((l) => l.startsWith('2025-001;'));
    expect(projLine).toBe('2025-001;9,00'); // nur der Fachkraft-Eintrag
  });

  it('gibt für Krank/Urlaub keine Arbeitszeit aus', () => {
    const csv = buildMonthCsv([makeRow([entry({ status: 'Krank', hours: 8 })])], 2025, 5);
    expect(csv.split('\n')[1]).toContain(';0,00;0,00');
  });
});

describe('Mitarbeiter-CSV', () => {
  it('enthält Kopfdaten und den Summenblock', () => {
    const e = [entry()];
    const csv = buildUserCsv(user(), e, calcMonthStats(user(), e, e, 2025, 5), 2025, 5);
    expect(csv).toContain('Zeiterfassung: Max Mustermann');
    expect(csv).toContain('Monat: Juni 2025');
    expect(csv).toContain('Wochensoll: 40 h');
    expect(csv).toContain('Ist;9,00 h');
    expect(csv).toContain('Resturlaub;25 Tage');
  });
});

describe('Projekt-CSV', () => {
  it('zählt Einsatztage distinkt je Projekt', () => {
    const entries = [
      entry({ date: '2025-06-02', projectNumber: 'P1' }),
      entry({ id: 'e2', date: '2025-06-02', projectNumber: 'P2' }),
      entry({ id: 'e3', date: '2025-06-03', projectNumber: 'P1' }),
    ];
    const csv = buildUserProjectCsv(user(), entries, '2025-06-01', '2025-06-30');
    expect(csv).toContain('P1;;2;18,00');
    // Gesamt zählt Tage projektübergreifend distinkt: 02.06. und 03.06. = 2
    expect(csv.trim().split('\n').pop()).toBe('Gesamt;;2;27,00');
  });
});

describe('Dateinamen', () => {
  it('nutzt Monat-Jahr bzw. den Zeitraum', () => {
    expect(monthCsvFilename(2025, 5)).toBe('zeiterfassung_06-2025.csv');
    expect(userCsvFilename(user(), 2025, 5)).toBe('zeiterfassung_Max_Mustermann_06-2025.csv');
    expect(hoursPdfFilename(user(), '2025-06-01', '2025-06-30')).toBe(
      'Stunden_Max_Mustermann_2025-06-01_2025-06-30.pdf',
    );
  });

  it('behält Umlaute und ersetzt nur Sonderzeichen', () => {
    expect(userCsvFilename(user({ name: 'Jörg Ö/Kunz' }), 2025, 0)).toBe(
      'zeiterfassung_Jörg_Ö_Kunz_01-2025.csv',
    );
  });
});

describe('entriesInRange', () => {
  it('grenzt auf Nutzer und Zeitraum ein und sortiert aufsteigend', () => {
    const all = [
      entry({ id: 'a', date: '2025-06-10' }),
      entry({ id: 'b', date: '2025-05-30' }),
      entry({ id: 'c', date: '2025-06-02' }),
      entry({ id: 'd', date: '2025-06-05', userId: 'other' }),
    ];
    const res = entriesInRange(all, 'u1', '2025-06-01', '2025-06-30');
    expect(res.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('schließt die Grenztage ein', () => {
    const all = [entry({ id: 'a', date: '2025-06-01' }), entry({ id: 'b', date: '2025-06-30' })];
    expect(entriesInRange(all, 'u1', '2025-06-01', '2025-06-30')).toHaveLength(2);
  });
});
