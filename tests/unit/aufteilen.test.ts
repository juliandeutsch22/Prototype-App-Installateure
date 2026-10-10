import { describe, it, expect } from 'vitest';
import { aufteilenGeht, aufteilung, stundenAusEingabe } from '@/features/time/aufteilen';

/**
 * Eine Buchung auf mehrere Baustellen aufteilen (10.10.2026): die Rechnung
 * in der Maske — dieselben Regeln wie `public.zeit_aufteilen`.
 */

const TAG = { startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-1' };

describe('Aufteilen', () => {
  it('die Buchung behält Beginn, Pause und den Rest; die Teile schliessen lückenlos an', () => {
    const a = aufteilung(TAG, [{ projectNumber: 'B-2', stunden: '2' }, { projectNumber: 'B-3', stunden: '1,5' }]);
    expect(a.fehler).toBeNull();
    expect(a.teile).toEqual([{ projectNumber: 'B-2', minuten: 120 }, { projectNumber: 'B-3', minuten: 90 }]);
    expect(a.rest).toBe(300);
    expect(a.plan).toEqual([
      { projectNumber: 'B-1', von: '07:00', bis: '12:30', minuten: 300 },
      { projectNumber: 'B-2', von: '12:30', bis: '14:30', minuten: 120 },
      { projectNumber: 'B-3', von: '14:30', bis: '16:00', minuten: 90 },
    ]);
  });

  it('Zeilen ohne Stunden sind Vorschläge, die nicht gebucht werden', () => {
    const a = aufteilung(TAG, [{ projectNumber: 'B-2', stunden: '' }, { projectNumber: 'B-3', stunden: '1:30' }]);
    expect(a.teile).toEqual([{ projectNumber: 'B-3', minuten: 90 }]);
    expect(a.fehler).toBeNull();
  });

  it('Gegenprobe: ohne Stunden, ohne Baustelle, doppelt oder zu lang — mit Grund', () => {
    expect(aufteilung(TAG, [{ projectNumber: 'B-2', stunden: '' }]).fehler).toMatch(/mindestens einer weiteren Baustelle/);
    expect(aufteilung(TAG, [{ projectNumber: '', stunden: '2' }]).fehler).toMatch(/gehört eine Baustelle/);
    expect(aufteilung(TAG, [{ projectNumber: 'PR-B-1', stunden: '2' }]).fehler).toMatch(/steht doppelt/);
    expect(aufteilung(TAG, [{ projectNumber: 'B-2', stunden: '1' }, { projectNumber: 'B-2', stunden: '1' }]).fehler).toMatch(/steht doppelt/);
    const zuLang = aufteilung(TAG, [{ projectNumber: 'B-2', stunden: '8,5' }]);
    expect(zuLang.fehler).toMatch(/bleibt keine Zeit/);
    expect(zuLang.plan).toEqual([]);
    expect(aufteilung(TAG, [{ projectNumber: 'B-2', stunden: 'zwei' }]).fehler).toMatch(/keine Stunden/);
  });

  it('Stunden: „2“, „1,5“, „1.5“, „1:30“', () => {
    expect(['2', '1,5', '1.5', '1:30', ' 0,25 '].map((t) => stundenAusEingabe(t).min)).toEqual([120, 90, 90, 90, 15]);
    expect(stundenAusEingabe('')).toEqual({ min: null, fehler: null });
    expect(stundenAusEingabe('0').fehler).toMatch(/mehr als null/);
  });

  it('nur gearbeitete Zeit mit Von und Bis am selben Tag, nicht verrechnet', () => {
    const ok = { status: 'Anwesend' as const, startTime: '07:00', endTime: '16:00', isBilled: false };
    expect(aufteilenGeht(ok)).toBeNull();
    expect(aufteilenGeht({ ...ok, status: 'Urlaub' })).toMatch(/gearbeitete Zeit/);
    expect(aufteilenGeht({ ...ok, startTime: undefined })).toMatch(/Von und Bis/);
    expect(aufteilenGeht({ ...ok, startTime: '20:00', endTime: '02:00' })).toMatch(/Mitternacht/);
    expect(aufteilenGeht({ ...ok, isBilled: true })).toMatch(/verrechnet/);
  });
});
