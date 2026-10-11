/**
 * Der Zwischenspeicher über den Seitenwechsel (Laden ohne Springen, Stufe 3).
 *
 * Zweierlei wird hier festgehalten:
 *   - Er gehört dem, der angemeldet ist. Wechselt Benutzer oder Betrieb, ist
 *     alles andere weg, und eine späte Antwort schreibt nichts mehr zurück —
 *     auf dem geteilten Werkstatt-Tablet sähe der Monteur sonst, was die
 *     Geschäftsführung vor ihm sah.
 *   - Sonst verhält sich die App wie bisher: ohne Netz scheitert eine Abfrage
 *     sofort, sie wird nicht wiederholt, und nichts lädt von selbst nach.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AUFBEWAHREN_MS,
  liveGeneration,
  liveLesen,
  liveMerken,
  zwischenspeicherFuer,
} from '@/lib/liveSpeicher';
import { abfrageSpeicher, schluessel, zwischenspeicherLeeren } from '@/lib/zwischenspeicher';

beforeEach(() => {
  zwischenspeicherLeeren();
  zwischenspeicherFuer('a', 'perl');
});
afterEach(() => { vi.useRealTimers(); });

describe('Live-Listen merken sich ihren letzten Bestand', () => {
  it('und geben ihn beim nächsten Mal heraus', () => {
    liveMerken('materials|perl|{}', [{ id: '1' }], liveGeneration());
    expect(liveLesen('materials|perl|{}')).toEqual([{ id: '1' }]);
  });

  it('nach zehn Minuten nicht mehr', () => {
    vi.useFakeTimers();
    liveMerken('materials|perl|{}', [{ id: '1' }], liveGeneration());
    vi.advanceTimersByTime(AUFBEWAHREN_MS + 1);
    expect(liveLesen('materials|perl|{}')).toBeUndefined();
  });

  it('höchstens vierzig — die älteste geht zuerst', () => {
    const gen = liveGeneration();
    for (let i = 0; i < 41; i++) liveMerken(`t${i}`, [i], gen);
    expect(liveLesen('t0')).toBeUndefined();
    expect(liveLesen('t1')).toEqual([1]);
    expect(liveLesen('t40')).toEqual([40]);
  });
});

describe('Der Speicher gehört dem, der angemeldet ist', () => {
  it('ein anderer Benutzer: die Live-Stände sind weg', () => {
    liveMerken('materials|perl|{}', [{ id: '1' }], liveGeneration());
    zwischenspeicherFuer('b', 'perl');
    expect(liveLesen('materials|perl|{}')).toBeUndefined();
  });

  it('abgemeldet: ebenso', () => {
    liveMerken('materials|perl|{}', [{ id: '1' }], liveGeneration());
    zwischenspeicherFuer(null, null);
    expect(liveLesen('materials|perl|{}')).toBeUndefined();
  });

  it('eine Antwort, die erst nach dem Wechsel kommt, merkt sich nichts mehr', () => {
    const gen = liveGeneration();
    zwischenspeicherFuer('b', 'perl');
    liveMerken('materials|perl|{}', [{ id: 'von a' }], gen);
    expect(liveLesen('materials|perl|{}')).toBeUndefined();
  });

  it('derselbe Benutzer noch einmal gemeldet: alles bleibt', () => {
    liveMerken('materials|perl|{}', [{ id: '1' }], liveGeneration());
    zwischenspeicherFuer('a', 'perl');
    expect(liveLesen('materials|perl|{}')).toEqual([{ id: '1' }]);
  });

  it('Abfragen eines anderen Benutzers oder Betriebs fliegen hinaus, die eigenen bleiben', () => {
    abfrageSpeicher.setQueryData(schluessel('startseite', { uid: 'a', companyId: 'perl' }), 'von a');
    abfrageSpeicher.setQueryData(schluessel('startseite', { uid: 'b', companyId: 'perl' }), 'von b');
    abfrageSpeicher.setQueryData(schluessel('startseite', { uid: 'b', companyId: 'andere' }), 'b im Einblick');
    zwischenspeicherFuer('b', 'perl');
    expect(abfrageSpeicher.getQueryData(schluessel('startseite', { uid: 'a', companyId: 'perl' }))).toBeUndefined();
    expect(abfrageSpeicher.getQueryData(schluessel('startseite', { uid: 'b', companyId: 'andere' }))).toBeUndefined();
    expect(abfrageSpeicher.getQueryData(schluessel('startseite', { uid: 'b', companyId: 'perl' }))).toBe('von b');
  });

  it('der Schlüssel trägt Benutzer und Betrieb an zweiter und dritter Stelle', () => {
    expect(schluessel('x', { uid: 'u', companyId: 'c' }, 1)).toEqual(['x', 'u', 'c', 1]);
  });
});

describe('Sonst wie bisher', () => {
  it('ohne Netz scheitert eine Abfrage gleich, ohne Wiederholung, und nichts lädt von selbst nach', () => {
    const q = abfrageSpeicher.getDefaultOptions().queries!;
    expect(q.networkMode).toBe('always');
    expect(q.retry).toBe(false);
    expect(q.refetchOnWindowFocus).toBe(false);
    expect(q.refetchOnReconnect).toBe(false);
    expect(q.gcTime).toBe(AUFBEWAHREN_MS);
  });
});
