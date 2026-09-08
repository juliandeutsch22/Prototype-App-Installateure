// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/*
  Wie in `pdfUnveraendert`: `jspdf-autotable` liefert unter Node ein Objekt
  als Default, im Vite-Build die Funktion. Der Ersatz zeichnet nichts und
  meldet nur die Endhöhe — geprüft wird hier der SUMMENBLOCK darunter.

  Der Ersatz merkt sich zusätzlich die Kopfzeile der Tabelle: dass die Spalte
  „Zuschlag" überhaupt angelegt wird, ist Teil des Befunds.
*/
let kopfzeile: string[][] = [];
vi.mock('jspdf-autotable', () => ({
  default: (
    doc: { lastAutoTable?: { finalY: number } },
    opts: { startY?: number; head?: string[][]; body?: string[][] },
  ) => {
    kopfzeile = opts.head ?? [];
    zeilen = opts.body ?? [];
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));
let zeilen: string[][] = [];

import { generateHoursPdf } from '@/features/accounting/hoursPdf';
import type { AppUser, Company, TimeEntry } from '@/types';

/**
 * Der Stundennachweis wies Zuschlagsstunden nicht aus.
 *
 * Wer ihn vorlegt, um Nacht- oder Notdienststunden geltend zu machen, hatte
 * ein Blatt in der Hand, auf dem sie nicht vorkommen — obwohl die Rechnung
 * aus denselben Kennzeichen Positionen mit Aufschlag bildet.
 */

const firma: Company = { id: 'perl', name: 'Perl Installationen GmbH' } as Company;
const mann: AppUser = { id: 'u1', name: 'Max Mustermann' } as AppUser;

const eintrag = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e1', companyId: 'perl', date: '2026-09-01', status: 'Anwesend', userId: 'u1',
    startTime: '22:00', endTime: '02:00', breakDuration: 0, ...over,
  }) as TimeEntry;

/**
 * Die Zeichenbefehle des Dokuments — Text samt Koordinaten.
 *
 * Der Umweg über `unknown` wie in `pdfUnveraendert`: jsPDF deklariert
 * `internal.pages` als Zahlenfeld, obwohl dort die Befehlszeilen stehen.
 */
function befehle(doc: unknown): string {
  const d = doc as { internal: { pages: string[][] } };
  return d.internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
}

function nachweis(entries: TimeEntry[]) {
  return generateHoursPdf({
    company: firma,
    user: mann,
    entries,
    from: '2026-09-01',
    to: '2026-09-30',
  });
}

describe('Zuschlagsstunden im Stundennachweis', () => {
  it('führt eine eigene Spalte und kürzt sie ab', () => {
    nachweis([eintrag({ isNightWork: true, isEmergency: true })]);
    expect(kopfzeile[0]).toContain('Zuschlag');
    expect(zeilen[0]).toContain('N+ND');
  });

  it('lässt die Spalte leer, wo kein Kennzeichen gesetzt ist', () => {
    nachweis([eintrag()]);
    expect(zeilen[0]).toContain('');
    expect(zeilen[0].some((z) => z === 'N' || z === 'ND' || z === 'N+ND')).toBe(false);
  });

  it('nennt die Summen unter der Tabelle, samt Legende', () => {
    const text = befehle(nachweis([eintrag({ isNightWork: true })]));
    expect(text).toContain('Zuschlagsstunden');
    expect(text).toContain('N = Nacht, ND = Notdienst');
    expect(text).toContain('Nacht: 4,00 h');
  });

  /*
    Nacht und Notdienst schliessen einander nicht aus. Ohne den Zusatz
    addierte der Leser die beiden Zahlen und zählte die Stunden doppelt.
  */
  it('sagt dazu, wie viel davon beides war', () => {
    const text = befehle(nachweis([eintrag({ isNightWork: true, isEmergency: true })]));
    expect(text).toContain('davon beides: 4,00 h');
  });

  /*
    Auf einem Nachweis ohne Zuschlagsstunden wäre die Zeile Zierrat — anders
    als in der CSV, die die Lohnverrechnung maschinell liest und wo eine
    fehlende Spalte etwas anderes bedeutet als eine leere.
  */
  it('schweigt, wenn keine anfielen', () => {
    const text = befehle(nachweis([eintrag()]));
    expect(text).not.toContain('Zuschlagsstunden');
  });
});
