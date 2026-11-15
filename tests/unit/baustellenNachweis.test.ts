// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/*
  Wie in `stundennachweisZuschlag`: der Ersatz für autotable zeichnet nichts,
  merkt sich aber Kopf und Zeilen der Tabelle — geprüft wird, WAS auf das
  Blatt kommt.
*/
let kopf: string[][] = [];
let zeilen: string[][] = [];
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number; head?: string[][]; body?: string[][] }) => {
    kopf = opts.head ?? [];
    zeilen = opts.body ?? [];
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { minutenJeSatz, nachweisZeilen, nachweisDateiname } from '@/features/accounting/baustellenNachweis';
import { generateBaustellenNachweisPdf } from '@/features/accounting/baustellenNachweisPdf';
import { generateHoursPdf } from '@/features/accounting/hoursPdf';
import type { AppUser, Company, TimeEntry } from '@/types';

/**
 * F12 und Z8 (Durchsicht 15.11.2026): der Stundennachweis „auch für Kunden“
 * war der Nachweis EINER PERSON — mit Krankenstand, Arztbesuch,
 * Pflegefreistellung und den Baustellen anderer Kunden samt Kommentaren. Der
 * Nachweis der Baustelle zeigt nur die Arbeitszeit auf ihr, alle Personen.
 */
const firma = { id: 'perl', name: 'Perl Installationen GmbH' } as Company;
const e = (over: Partial<TimeEntry>): TimeEntry =>
  ({
    id: crypto.randomUUID(), companyId: 'perl', date: '2026-11-02', status: 'Anwesend', userId: 'u1', userName: 'Max',
    startTime: '07:00', endTime: '15:30', breakDuration: 30, projectNumber: 'PR-14', customerName: 'Huber', ...over,
  }) as TimeEntry;

// Die Woche eines Monteurs: zwei Tage bei Huber (eine Buchung ohne „PR-“), ein Tag bei Maier, krank, Arzt.
const woche: TimeEntry[] = [
  e({ date: '2026-11-03', comment: 'Bad verrohrt' }),
  e({ date: '2026-11-02', projectNumber: '14', userId: 'u2', userName: 'Anna', isHelper: true, startTime: '08:00', endTime: '12:00', breakDuration: 0 }),
  e({ date: '2026-11-04', projectNumber: 'PR-99', customerName: 'Maier', comment: 'Privates bei Maier' }),
  e({ date: '2026-11-05', status: 'Krank', projectNumber: '', startTime: '', endTime: '', breakDuration: 0 }),
  e({ date: '2026-11-06', status: 'Dienstverhinderung', projectNumber: '', comment: 'Arztbesuch', startTime: '08:00', endTime: '10:00', breakDuration: 0 }),
  e({ date: '2026-11-06', startTime: '10:30', endTime: '10:30', breakDuration: 0 }),
];

describe('Stundennachweis der Baustelle (F12)', () => {
  it('nimmt nur gearbeitete Zeit auf dieser Baustelle — alle Personen, beide Schreibweisen der Nummer', () => {
    const z = nachweisZeilen(woche, ['PR-14']);
    expect(z.map((x) => [x.eintrag.date, x.eintrag.userName, x.minuten, x.einstufung])).toEqual([
      ['2026-11-02', 'Anna', 240, 'Helfer'],
      ['2026-11-03', 'Max', 480, 'Facharbeiter'],
    ]);
  });

  it('das Blatt nennt weder Krankenstand noch Arztbesuch noch den anderen Kunden', () => {
    const doc = generateBaustellenNachweisPdf({
      company: firma, bezug: ['Baustelle:', 'PR-14 · Bad'], angaben: [['Kunde:', 'Huber']],
      zeilen: nachweisZeilen(woche, ['PR-14']), mitBaustelle: false, von: '2026-11-01', bis: '2026-11-30',
    });
    const text = JSON.stringify(zeilen) + (doc as unknown as { internal: { pages: string[][] } }).internal.pages.filter(Boolean).map((p) => p.join('\n')).join('\n');
    expect(text).not.toMatch(/Krank|Arzt|Maier|Privates|PR-99|Urlaub/);
    expect(text).toMatch(/Bad verrohrt/);
    expect(text).toMatch(/Gesamtstunden: 12,00 h/);
    expect(text).toMatch(/Facharbeiter: 8,00 h {4}Helfer: 4,00 h/);
    expect(kopf[0]).toEqual(['Datum', 'Mitarbeiter', 'Zeit', 'Pause', 'Std', 'Einstufung', 'Zuschlag', 'Tätigkeit']);
  });

  it('beim Kunden mit mehreren Baustellen steht die Nummer je Zeile', () => {
    generateBaustellenNachweisPdf({
      company: firma, bezug: ['Kunde:', 'Huber'], zeilen: nachweisZeilen(woche, ['PR-14', 'PR-15']),
      mitBaustelle: true, von: '2026-11-01', bis: '2026-11-30',
    });
    expect(kopf[0]).toContain('Baustelle');
    expect(zeilen.map((r) => r[2])).toEqual(['14', 'PR-14']);
  });

  it('Stunden je Einstufung: Lehrjahre zusammen, in fester Reihenfolge', () => {
    const z = nachweisZeilen([
      e({ satz: 'lj2' }), e({ satz: 'lj1', date: '2026-11-03' }), e({ isHelper: true, date: '2026-11-04' }), e({ date: '2026-11-05' }),
    ], ['PR-14']);
    expect(minutenJeSatz(z)).toEqual([
      { satz: 'Facharbeiter', minuten: 480 }, { satz: 'Helfer', minuten: 480 }, { satz: 'Lehrling', minuten: 960 },
    ]);
    expect(nachweisDateiname('Huber & Söhne', '2026-11-01', '2026-11-30')).toBe('Stundennachweis_Huber___Söhne_2026-11-01_2026-11-30.pdf');
  });

  it('Gegenprobe: der Nachweis einer Person zeigt weiter alles — er ist für die Lohnverrechnung', () => {
    const doc = generateHoursPdf({ company: firma, user: { id: 'u1', name: 'Max' } as AppUser, entries: woche.filter((x) => x.userId === 'u1'), from: '2026-11-01', to: '2026-11-30' });
    const text = JSON.stringify(zeilen) + (doc as unknown as { internal: { pages: string[][] } }).internal.pages.filter(Boolean).map((p) => p.join('\n')).join('\n');
    expect(text).toMatch(/Krank/);
    expect(text).toMatch(/Maier/);
  });
});
