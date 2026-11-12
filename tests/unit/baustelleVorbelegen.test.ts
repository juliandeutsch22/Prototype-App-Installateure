// @vitest-environment jsdom
/**
 * B3 (E83): eine Regel für die Baustelle in den Formularen des Monteurs —
 * laufender Arbeitstag, sonst Einsatz des Tages, sonst zuletzt benutzt.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { baustelleVorbelegen, zuletztLesen, zuletztMerken } from '@/lib/baustelleVorbelegen';

describe('baustelleVorbelegen', () => {
  it('der laufende Arbeitstag geht vor Einsatz und zuletzt', () => {
    expect(baustelleVorbelegen({ timer: 'B-2', einsaetze: ['B-1'], zuletzt: 'B-3' })).toEqual({ nr: 'B-2', grund: 'timer' });
  });

  it('ohne Timer der eine Einsatz des Tages', () => {
    expect(baustelleVorbelegen({ timer: '', einsaetze: ['B-1', 'B-1'], zuletzt: 'B-3' })).toEqual({ nr: 'B-1', grund: 'einsatz' });
  });

  it('bei mehreren Einsätzen der zuletzt benutzte unter ihnen', () => {
    expect(baustelleVorbelegen({ einsaetze: ['B-1', 'B-2'], zuletzt: 'B-2' })).toEqual({ nr: 'B-2', grund: 'einsatz' });
  });

  it('bei mehreren Einsätzen ohne Treffer bleibt das Feld leer — nichts geraten', () => {
    expect(baustelleVorbelegen({ einsaetze: ['B-1', 'B-2'], zuletzt: 'B-9' })).toBeNull();
    expect(baustelleVorbelegen({ einsaetze: ['B-1', 'B-2'] })).toBeNull();
  });

  it('nur der Start des Arbeitstags nimmt dann den ersten Einsatz', () => {
    expect(baustelleVorbelegen({ einsaetze: ['B-1', 'B-2'], mehrdeutigErster: true })).toEqual({ nr: 'B-1', grund: 'einsatz' });
  });

  it('ohne Einsatz die zuletzt benutzte', () => {
    expect(baustelleVorbelegen({ einsaetze: [], zuletzt: 'B-3' })).toEqual({ nr: 'B-3', grund: 'zuletzt' });
  });

  it('ohne alles: nichts', () => {
    expect(baustelleVorbelegen({ einsaetze: [] })).toBeNull();
  });

  it('nur, was wählbar ist — auch beim Timer', () => {
    const waehlbar = (nr: string) => nr !== 'B-2';
    expect(baustelleVorbelegen({ timer: 'B-2', einsaetze: ['B-1'], waehlbar })).toEqual({ nr: 'B-1', grund: 'einsatz' });
    expect(baustelleVorbelegen({ einsaetze: ['B-2'], zuletzt: 'B-2', waehlbar })).toBeNull();
  });
});

describe('zuletzt benutzt auf dem Gerät', () => {
  beforeEach(() => localStorage.clear());

  it('je Betrieb und Person getrennt', () => {
    zuletztMerken('perl', 'u1', 'B-1');
    zuletztMerken('perl', 'u2', 'B-2');
    zuletztMerken('andere', 'u1', 'B-9');
    expect(zuletztLesen('perl', 'u1')).toBe('B-1');
    expect(zuletztLesen('perl', 'u2')).toBe('B-2');
    expect(zuletztLesen('andere', 'u1')).toBe('B-9');
  });

  it('eine leere Nummer überschreibt nichts', () => {
    zuletztMerken('perl', 'u1', 'B-1');
    zuletztMerken('perl', 'u1', '');
    zuletztMerken('perl', 'u1', undefined);
    expect(zuletztLesen('perl', 'u1')).toBe('B-1');
  });
});
