import { rechneBaustelle } from '@/features/costing/nachkalkulation';
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
  return { user: u, monthEntries: entries, stats: calcMonthStats(u, entries, entries, 2025, 5, true) };
}

describe('CSV-Aufbau', () => {
  it('setzt Kopfzeile, Detailzeile und Zusammenfassung', () => {
    const csv = buildMonthCsv([makeRow([entry()])], 2025, 5, true);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Mitarbeiter;Datum;Status');
    expect(lines[1]).toContain('Max Mustermann;02.06.2025;Anwesend');
    expect(csv).toContain('Mitarbeiter-Zusammenfassung');
    expect(csv).toContain('Name;Ist(Std);Soll(Std);Saldo(Std)');
  });

  it('rechnet Arbeitszeit als Dezimalstunden mit Komma', () => {
    // 07:00–16:30 minus 30 min Pause = 9,00 h
    const csv = buildMonthCsv([makeRow([entry()])], 2025, 5, true);
    expect(csv.split('\n')[1]).toContain(';9,00;');
  });

  it('addiert die Wegzeit nur in der Spalte Gesamtzeit', () => {
    const csv = buildMonthCsv([makeRow([entry({ travelTime: 30 })])], 2025, 5, true);
    const [kopf, erste] = csv.split('\n');
    // Über die Kopfzeile, nicht vom Ende her gezählt: hinter der Gesamtzeit
    // stehen inzwischen die Zuschlagskennzeichen, und ein Test, der die
    // letzte Spalte meint, misst nach jeder Erweiterung etwas anderes.
    const spalten = kopf.split(';');
    const cells = erste.split(';');
    expect(cells[spalten.indexOf('Arbeitszeit(Std)')]).toBe('9,00');
    expect(cells[spalten.indexOf('Gesamtzeit(Std)')]).toBe('9,50'); // + 30 min Wegzeit
  });

  it('escaped Semikolon und Anführungszeichen in JEDEM Feld', () => {
    // Im Legacy war nur der Kommentar gequotet — ein Semikolon im Kundennamen
    // verschob dort alle folgenden Spalten.
    const csv = buildMonthCsv(
      [makeRow([entry({ customerName: 'Müller; Sohn', comment: 'sagte "ok"' })])],
      2025,
      5, true,
    );
    const line = csv.split('\n')[1];
    expect(line).toContain('"Müller; Sohn"');
    expect(line).toContain('"sagte ""ok"""');
    // Kopf- und Datenzeile müssen gleich viele Felder haben.
    const countFields = (s: string) => s.match(/(^|;)(?:"(?:[^"]|"")*"|[^;]*)/g)?.length ?? 0;
    expect(countFields(line)).toBe(countFields(csv.split('\n')[0]));
  });

  it('weist Helferstunden in der Projektauswertung getrennt aus', () => {
    const csv = buildMonthCsv(
      [
        makeRow([
          entry({ projectNumber: '2025-001', isHelper: false }),
          entry({ id: 'e2', date: '2025-06-03', projectNumber: '2025-001', isHelper: true }),
        ]),
      ],
      2025,
      5, true,
    );
    const projLine = csv.split('\n').find((l) => l.startsWith('2025-001;'));
    // Seit 30.09.2026 (M25) wie die Übersicht: Fach und Helfer getrennt,
    // die Fachstunden (fürs Budget) stehen weiter für sich. Seit 03.10.2026
    // hinten angehängt: Lehrlingsstunden, die nicht ins Budget zählen.
    // Seit Runde 3 (M6) je Einstufung: Facharbeiter, Obermonteur, Helfer, Lehrling.
    expect(projLine).toBe('2025-001;9,00;0,00;9,00;0,00;18,00;0,00');
  });

  it('hängt Lehrlingsstunden ohne Budget hinten an und zählt sie in „Gesamt“ (03.10.2026)', () => {
    const csv = buildMonthCsv(
      [
        makeRow([
          entry({ projectNumber: '2025-001' }),
          entry({ id: 'e2', date: '2025-06-03', projectNumber: '2025-001', insBudget: false, satz: 'lj2' }),
        ]),
      ],
      2025,
      5, true,
    );
    expect(csv).toContain('Projektnummer;Facharbeiter(Std);Obermonteur(Std);Helfer(Std);Lehrling(Std);Gesamt(Std);Lehrling nicht im Budget(Std)');
    expect(csv.split('\n').find((l) => l.startsWith('2025-001;'))).toBe('2025-001;9,00;0,00;0,00;9,00;18,00;9,00');
  });

  /*
    RUNDE 3, M6: 10,75 Std. eines Lehrlings standen unter „Facharbeiter
    (Std)“, weil sie ins Budget zählten. Jetzt je Einstufung, mit denselben
    Werten wie die Nachkalkulation.
  */
  it('Lehrlingsstunden im Budget stehen unter „Lehrling“, nicht unter „Facharbeiter“', () => {
    const eintraege = [
      entry({ projectNumber: 'PR-193', satz: 'facharbeiter' }),
      entry({ id: 'e2', date: '2025-06-03', projectNumber: 'PR-193', satz: 'lj1', insBudget: true }),
      entry({ id: 'e3', date: '2025-06-04', projectNumber: 'PR-193', satz: 'obermonteur' }),
    ];
    const csv = buildMonthCsv([makeRow(eintraege)], 2025, 5, true);
    expect(csv.split('\n').find((l) => l.startsWith('PR-193;'))).toBe('PR-193;9,00;9,00;0,00;9,00;27,00;0,00');
    const nk = rechneBaustelle('PR-193', 'Huber', eintraege, [], undefined, {} as never);
    expect(nk.lehrlingStunden).toBe(9);
    expect(nk.fachStunden).toBe(18);
  });

  it('gibt für Krank/Urlaub keine Arbeitszeit aus', () => {
    const csv = buildMonthCsv([makeRow([entry({ status: 'Krank', hours: 8 })])], 2025, 5, true);
    expect(csv.split('\n')[1]).toContain(';0,00;0,00');
  });
});

describe('Mitarbeiter-CSV', () => {
  it('enthält Kopfdaten und den Summenblock', () => {
    const e = [entry()];
    const csv = buildUserCsv(user(), e, calcMonthStats(user(), e, e, 2025, 5, true), 2025, 5, true);
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

/*
  Z8 (Durchsicht 15.11.2026): EINE RUNDUNGSREGEL FÜR MINUTEN. 20 Tage zu 7:40
  ergaben in der Detailspalte je Zeile 7,67 — Summe 153,40 —, im „Ist“ aber
  153,33. Wer in der Lohnverrechnung die Zeilen summierte, hatte 4 Minuten
  mehr als die Zusammenfassung. Jetzt geht jede Spalte, unter der eine Summe
  steht, auf diese Summe auf; jede Zeile bleibt unter einer Hundertstelstunde
  bei ihrem genauen Wert.
*/
describe('Rundung der Minuten (Z8)', () => {
  // 20 Arbeitstage im Juni 2025 zu je 7:40 (07:00–15:10, 30 Minuten Pause).
  const tage = ['02', '03', '04', '05', '06', '10', '11', '12', '13', '16', '17', '18', '20', '23', '24', '25', '26', '27', '30', '19']
    .map((d, i) => entry({ id: `e${i}`, date: `2025-06-${d}`, endTime: '15:10', projectNumber: 'PR-1', customerName: 'Kunde' }));
  const zahl = (s: string) => Math.round(Number(s.replace(',', '.')) * 100);

  it('Monats-CSV: die Detailspalte summiert sich auf das Ist', () => {
    const csv = buildMonthCsv([makeRow(tage)], 2025, 5, true);
    const zeilen = csv.split('\n');
    const kopf = zeilen[0].split(';');
    const detail = zeilen.slice(1, 21).map((z) => z.split(';')[kopf.indexOf('Arbeitszeit(Std)')]);
    const gesamt = zeilen.slice(1, 21).map((z) => z.split(';')[kopf.indexOf('Gesamtzeit(Std)')]);
    const ist = zeilen.find((z) => z.startsWith('Max Mustermann;') && !/;\d\d\.\d\d\.2025;/.test(z))!.split(';')[1];
    expect(ist).toBe('153,33');
    expect(detail.reduce((s, x) => s + zahl(x), 0)).toBe(15333);
    expect(gesamt.reduce((s, x) => s + zahl(x), 0)).toBe(15333);
    // Keine Zeile weicht mehr als eine Hundertstelstunde von 7:40 (766,67) ab.
    for (const x of detail) expect(Math.abs(zahl(x) - 766.67)).toBeLessThan(1);
  });

  it('Personen-CSV: die Detailspalte summiert sich auf das Ist', () => {
    const u = user();
    const csv = buildUserCsv(u, tage, calcMonthStats(u, tage, tage, 2025, 5, true), 2025, 5, true);
    const zeilen = csv.split('\n');
    const kopfIndex = zeilen.findIndex((z) => z.startsWith('Datum;'));
    const spalte = zeilen[kopfIndex].split(';').indexOf('Arbeitszeit(Std)');
    const detail = zeilen.slice(kopfIndex + 1, kopfIndex + 21).map((z) => z.split(';')[spalte]);
    expect(detail.reduce((s, x) => s + zahl(x), 0)).toBe(15333);
    expect(csv).toMatch(/\nIst;153,33 h\n/);
  });

  it('Projektauswertung: die Zeilen summieren sich auf „Gesamt“, auch quer über die Einstufungen', () => {
    const projekte = [1, 2, 3].map((n) => entry({ id: `p${n}`, date: `2025-06-0${n + 1}`, endTime: '07:50', breakDuration: 30, projectNumber: `PR-${n}` }));
    // je 20 Minuten auf drei Baustellen: 0,33 + 0,33 + 0,33 ≠ 1,00
    const csv = buildUserProjectCsv(user(), projekte, '2025-06-01', '2025-06-30');
    const zeilen = csv.trim().split('\n');
    const werte = zeilen.filter((z) => /^PR-\d;/.test(z)).map((z) => zahl(z.split(';')[3]));
    expect(zeilen[zeilen.length - 1]).toBe('Gesamt;;3;1,00');
    expect(werte.reduce((s, x) => s + x, 0)).toBe(100);

    // Monats-CSV: 20 Minuten je Einstufung, „Gesamt“ = Summe der vier Spalten.
    const quer = [
      entry({ id: 'q1', endTime: '07:50', projectNumber: 'PR-9' }),
      entry({ id: 'q2', date: '2025-06-03', endTime: '07:50', projectNumber: 'PR-9', isHelper: true }),
      entry({ id: 'q3', date: '2025-06-04', endTime: '07:50', projectNumber: 'PR-9', satz: 'obermonteur' }),
    ];
    const monat = buildMonthCsv([makeRow(quer)], 2025, 5, true);
    const z = monat.split('\n').find((l) => l.startsWith('PR-9;'))!.split(';').map((x) => (x.includes(',') ? zahl(x) : x));
    const [, f, o, h, l, g] = z as number[];
    expect(f + o + h + l).toBe(g);
    expect(g).toBe(100);
  });

  it('bleibt gleich: ganze und halbe Stunden stehen wie bisher', () => {
    const csv = buildMonthCsv([makeRow([entry(), entry({ id: 'e2', date: '2025-06-03', endTime: '12:00', breakDuration: 0 })])], 2025, 5, true);
    const kopf = csv.split('\n')[0].split(';');
    const i = kopf.indexOf('Arbeitszeit(Std)');
    expect(csv.split('\n')[1].split(';')[i]).toBe('9,00');
    expect(csv.split('\n')[2].split(';')[i]).toBe('5,00');
  });
});
