/**
 * DIE FREIEN ZEITFELDER IM EXPORT (M06b): je Feld eine Spalte hinter der
 * letzten bisherigen — in der Lohn-CSV (Detailzeilen) und in der CSV einer
 * Person; im Stundennachweis (PDF) unter dem Kommentar. Ohne Felder bleibt
 * jede Datei Zeichen für Zeichen, wie sie war (Erhaltung).
 *
 * Gegenprobe: ohne den Parameter `zeitfelder` in `export.ts` fehlen die
 * Spalten — die Fälle mit Feldern sind rot, die Erhaltungsfälle grün.
 */
import { describe, it, expect } from 'vitest';
import { buildMonthCsv, buildUserCsv, type ExportZeitfelder, type UserWithEntries } from '@/features/accounting/export';
import { calcMonthStats } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

const user = { id: 'u1', companyId: 'c', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at', role: 'Mitarbeiter',
  active: true, weeklyTargetHours: 40, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01',
  initialOvertime: 0 } as unknown as AppUser;
const e = (id: string, date: string): TimeEntry => ({
  id, companyId: 'c', date, status: 'Anwesend', userId: 'u1', userName: 'Max Mustermann',
  startTime: '07:00', endTime: '16:30', breakDuration: 30,
}) as TimeEntry;
const eintraege = [e('e1', '2025-06-02'), e('e2', '2025-06-03')];
const row: UserWithEntries = { user, monthEntries: eintraege, stats: calcMonthStats(user, eintraege, eintraege, 2025, 5, true) };

const WIEN = '11111111-1111-4111-8111-111111111111';
const zeitfelder: ExportZeitfelder = {
  definitionen: [
    { id: 'km', name: 'Kilometer', typ: 'zahl', regeln: { stellen: 1, einheit: 'km' }, reihenfolge: 2, aktiv: true },
    { id: 'k', name: 'Kostenstelle', typ: 'auswahl', regeln: { optionen: [{ id: WIEN, text: 'Wien', aktiv: true }] }, reihenfolge: 1, aktiv: true },
    { id: 'alt', name: 'Abnahme', typ: 'datum', regeln: {}, reihenfolge: 3, aktiv: false },
  ],
  werte: new Map([['e1', { k: WIEN, km: 12.5, alt: '2025-06-01' }]]),
};

describe('Lohn-CSV', () => {
  it('hängt je Feld eine Spalte hinten an — die bisherigen bleiben, wo sie waren', () => {
    const ohne = buildMonthCsv([row], 2025, 5, true).split('\n');
    const mit = buildMonthCsv([row], 2025, 5, true, {}, undefined, zeitfelder).split('\n');
    expect(mit[0]).toBe(`${ohne[0]};Kostenstelle;Kilometer (km);Abnahme`);
    expect(mit[1]).toBe(`${ohne[1]};Wien;12,5;01.06.2025`);
    // Eine Buchung ohne Angaben: leere Spalten, keine verschobenen.
    expect(mit[2]).toBe(`${ohne[2]};;;`);
    // Die Zusammenfassung bleibt unberührt.
    expect(mit.slice(3)).toEqual(ohne.slice(3));
  });

  it('ein beendetes Feld ohne Wert im Monat bekommt keine Spalte', () => {
    const ohneAltWert = { ...zeitfelder, werte: new Map([['e1', { k: WIEN }]]) };
    const kopf = buildMonthCsv([row], 2025, 5, true, {}, undefined, ohneAltWert).split('\n')[0];
    expect(kopf.endsWith(';Kostenstelle;Kilometer (km)')).toBe(true);
  });

  it('Erhaltung: ohne Felder ist die Datei dieselbe', () => {
    expect(buildMonthCsv([row], 2025, 5, true, {}, undefined, { definitionen: [], werte: new Map() }))
      .toBe(buildMonthCsv([row], 2025, 5, true));
  });
});

describe('CSV einer Person', () => {
  it('dieselben Spalten hinter dem Kommentar', () => {
    const ohne = buildUserCsv(user, eintraege, row.stats, 2025, 5, true).split('\n');
    const mit = buildUserCsv(user, eintraege, row.stats, 2025, 5, true, {}, [], zeitfelder).split('\n');
    const kopf = ohne.findIndex((z) => z.startsWith('Datum;'));
    expect(mit[kopf]).toBe(`${ohne[kopf]};Kostenstelle;Kilometer (km);Abnahme`);
    expect(mit[kopf + 1]).toBe(`${ohne[kopf + 1]};Wien;12,5;01.06.2025`);
    expect(buildUserCsv(user, eintraege, row.stats, 2025, 5, true, {}, [], { definitionen: [], werte: new Map() }))
      .toBe(buildUserCsv(user, eintraege, row.stats, 2025, 5, true));
  });
});
