/**
 * RUNDE 4, VORAUSSETZUNG V4: die Exporte der drei umgebauten Bereiche bleiben
 * Byte für Byte, wie sie vor dem Umbau waren.
 *
 * Runde 4 ordnet nur an (Auftrag Abschnitt 1.1): Monats-CSV, „Monat als CSV“
 * einer Person, „Bericht für Zeitraum“ (Stundennachweis und Projekt-CSV) und
 * das Kalender-Abo des Gesamtplans kommen aus denselben Funktionen. Diese
 * Prüfsummen halten das fest; die Monats-CSV und der Stundennachweis stehen
 * zusätzlich in `belegReferenz.test.ts`, hier mit zwei Personen und einer
 * Lücke im Monat — so, wie die Mitarbeiterübersicht sie zieht.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateHoursPdf } from '@/features/accounting/hoursPdf';
import { buildMonthCsv, buildUserCsv, buildUserProjectCsv, type UserWithEntries } from '@/features/accounting/export';
import { calcMonthStats } from '@/lib/time';
import { gesamtplanDatei } from '../../shared/kalenderIcs';
import type { AppUser, Company, TimeEntry } from '@/types';

const REFERENZ = 'docs/ui-umbau/r4/referenz.json';
const UHR = new Date('2026-10-08T10:00:00+02:00');

const firma = { id: 'perl', name: 'Perl Installationen GmbH', addressLine: 'Musterstraße 1 · 2700 Wiener Neustadt' } as Company;

const person = (uid: string, name: string, p: Partial<AppUser> = {}) =>
  ({
    id: uid, companyId: 'perl', uid, name, email: `${uid}@perl.at`, role: 'Mitarbeiter', active: true,
    weeklyTargetHours: 38.5, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01',
    initialOvertime: 0, ...p,
  }) as AppUser;

const max = person('u1', 'Max Mustermann');
const lena = person('u2', 'Lena Lehrling', { einstufung: 'lehrling' } as Partial<AppUser>);

const zeit = (uid: string, name: string, e: Partial<TimeEntry>) =>
  ({ companyId: 'perl', userId: uid, userName: name, ...e }) as TimeEntry;

const ZEITEN: TimeEntry[] = [
  zeit('u1', 'Max Mustermann', { id: 'a1', date: '2026-10-01', status: 'Anwesend', startTime: '07:00', endTime: '11:30', breakDuration: 0, projectNumber: 'B-2026-0147', customerName: 'Hausverwaltung Nord', comment: 'Verteiler gesetzt' }),
  zeit('u1', 'Max Mustermann', { id: 'a2', date: '2026-10-01', status: 'Anwesend', startTime: '12:00', endTime: '15:30', breakDuration: 0, projectNumber: 'B-2026-0148', customerName: 'Familie Huber' }),
  zeit('u1', 'Max Mustermann', { id: 'a3', date: '2026-10-02', status: 'Krank' }),
  zeit('u1', 'Max Mustermann', { id: 'a4', date: '2026-10-05', status: 'Anwesend', startTime: '06:30', endTime: '17:15', breakDuration: 45, projectNumber: 'B-2026-0147', customerName: 'Hausverwaltung Nord', isNightWork: true }),
  zeit('u1', 'Max Mustermann', { id: 'a5', date: '2026-10-06', status: 'Zeitausgleich' }),
  zeit('u2', 'Lena Lehrling', { id: 'b1', date: '2026-10-01', status: 'Berufsschule' }),
  zeit('u2', 'Lena Lehrling', { id: 'b2', date: '2026-10-02', status: 'Anwesend', startTime: '07:00', endTime: '16:30', breakDuration: 30, projectNumber: 'B-2026-0147', customerName: 'Hausverwaltung Nord', isEmergency: true }),
  zeit('u2', 'Lena Lehrling', { id: 'b3', date: '2026-10-07', status: 'Urlaub' }),
];

type Datei = { name: string; bytes: Uint8Array };
const text = (s: string) => new TextEncoder().encode(s);

function erzeugen(zeiten = ZEITEN): Datei[] {
  let s = 20261008;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
  const zeilen: UserWithEntries[] = [max, lena].map((u) => {
    const eigene = zeiten.filter((e) => e.userId === u.uid);
    return { user: u, monthEntries: eigene, stats: calcMonthStats(u, eigene, eigene, 2026, 9, true) };
  });
  const lohn = { nacht: { von: 22 * 60, bis: 6 * 60 } };
  const dateien: Datei[] = [
    { name: 'monats.csv', bytes: text(buildMonthCsv(zeilen, 2026, 9, true, lohn, zeiten)) },
    { name: 'person-max.csv', bytes: text(buildUserCsv(max, zeilen[0].monthEntries, zeilen[0].stats, 2026, 9, true, lohn)) },
    { name: 'person-lena.csv', bytes: text(buildUserCsv(lena, zeilen[1].monthEntries, zeilen[1].stats, 2026, 9, true, lohn)) },
    { name: 'bericht-projekte.csv', bytes: text(buildUserProjectCsv(max, zeilen[0].monthEntries, '2026-10-01', '2026-10-31')) },
    {
      name: 'bericht-stundennachweis.pdf',
      bytes: new Uint8Array(
        generateHoursPdf({ company: firma, user: max, entries: zeilen[0].monthEntries, from: '2026-10-01', to: '2026-10-31' })
          .output('arraybuffer'),
      ),
    },
    {
      name: 'gesamtplan.ics',
      bytes: text(gesamtplanDatei({
        person: 'u9',
        betrieb: firma.name,
        jetzt: UHR,
        baustellen: [
          { datum: '2026-10-07', baustelle: 'B-2026-0147', kunde: 'Hausverwaltung Nord', adresse: 'Ringstraße 1, 1010 Wien',
            leute: [{ name: 'Max Mustermann', von: '07:00', bis: '15:30' }, { name: 'Lena Lehrling', helfer: true, einstufung: 'lehrling', von: '07:00', bis: '15:30' }] },
          { datum: '2026-10-10', baustelle: 'B-2026-0150', kunde: 'Familie Huber', leute: [{ name: 'Max Mustermann' }] },
        ],
        termine: [
          { id: 't1', art: 'Lieferung', datum: '2026-10-07', von: '08:00', bis: '10:00', baustelle: 'B-2026-0147', adresse: 'Ringstraße 1, 1010 Wien', teilnehmer: ['Max Mustermann'] },
          { id: 't2', art: 'Besichtigung', datum: '2026-10-08', notiz: 'Bad, Wanne raus' },
        ],
      })),
    },
  ];
  vi.mocked(Math.random).mockRestore();
  return dateien;
}

const pruefsummen = (d: Datei[]) =>
  Object.fromEntries(d.map((x) => [x.name, { sha256: createHash('sha256').update(x.bytes).digest('hex'), bytes: x.bytes.length }]));

describe('Runde 4: Exporte gleich der Referenz vor dem Umbau', () => {
  let erster: Datei[];
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(UHR);
    erster = erzeugen();
  });
  afterAll(() => vi.useRealTimers());

  it('erzeugt alle sechs Dateien mit Inhalt', () => {
    expect(erster.map((d) => d.name)).toEqual([
      'monats.csv', 'person-max.csv', 'person-lena.csv', 'bericht-projekte.csv', 'bericht-stundennachweis.pdf', 'gesamtplan.ics',
    ]);
    for (const d of erster) expect(d.bytes.length, d.name).toBeGreaterThan(100);
  });

  it('Gegenprobe: eine geänderte Buchung ändert die Exporte der Person, nicht den Plan', () => {
    const anders = ZEITEN.map((e) => (e.id === 'a4' ? { ...e, endTime: '16:15' } : e));
    const a = pruefsummen(erzeugen(anders));
    const b = pruefsummen(erster);
    for (const n of ['monats.csv', 'person-max.csv', 'bericht-stundennachweis.pdf']) expect(a[n].sha256, n).not.toBe(b[n].sha256);
    for (const n of ['person-lena.csv', 'gesamtplan.ics']) expect(a[n].sha256, n).toBe(b[n].sha256);
  });

  it('Prüfsummen gleich docs/ui-umbau/r4/referenz.json', () => {
    const jetzt = pruefsummen(erster);
    if (process.env.REFERENZ_SCHREIBEN === '1') {
      writeFileSync(REFERENZ, `${JSON.stringify({
        hinweis: 'Runde 4, V4. Erzeugt von tests/unit/r4Referenz.test.ts vor dem Umbau (Uhr 08.10.2026 10:00). Neu schreiben nur bei absichtlicher Änderung eines Exports: REFERENZ_SCHREIBEN=1.',
        dateien: jetzt,
      }, null, 2)}\n`);
    }
    expect(existsSync(REFERENZ), `${REFERENZ} fehlt`).toBe(true);
    expect(jetzt).toEqual((JSON.parse(readFileSync(REFERENZ, 'utf8')) as { dateien: typeof jetzt }).dateien);
  });
});
