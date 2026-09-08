import { describe, it, expect } from 'vitest';
import { deuteSuche, suchHinweis } from '@/features/worksheets/scheinSuche';

/**
 * Was ein Suchbegriff meint.
 *
 * Die Suche in der Scheinliste filterte den GELADENEN Bestand im Browser —
 * die jüngsten fünfzig. Ein Schein vom März war damit nicht auffindbar, egal
 * was jemand eintippte, und das Feld sagte nichts dazu: es lieferte einfach
 * kein Ergebnis. Dieselbe Fehlerform wie beim Buchhaltungs-Export damals,
 * eine leere Antwort, die wie ein Befund aussieht.
 */

describe('Was der Suchbegriff meint', () => {
  it('erkennt einen einzelnen Tag', () => {
    expect(deuteSuche('2026-03-14')).toEqual({
      art: 'zeitraum',
      von: '2026-03-14',
      bis: '2026-03-14',
      text: '2026-03-14',
    });
  });

  it('erkennt einen Monat in beiden Schreibweisen', () => {
    // ISO tippt das Büro, „09.2026" spricht man hier.
    const erwartet = { art: 'zeitraum', von: '2026-09-01', bis: '2026-09-30' };
    expect(deuteSuche('2026-09')).toMatchObject(erwartet);
    expect(deuteSuche('09.2026')).toMatchObject(erwartet);
  });

  /*
    Der Februar ist der Test, der sich lohnt: eine selbstgebaute
    Schalttagsregel schreibt irgendwann jemand falsch ab.
  */
  it('trifft das Monatsende, auch im Schaltjahr', () => {
    expect(deuteSuche('2024-02')).toMatchObject({ bis: '2024-02-29' });
    expect(deuteSuche('2026-02')).toMatchObject({ bis: '2026-02-28' });
    expect(deuteSuche('2026-12')).toMatchObject({ bis: '2026-12-31' });
  });

  it('erkennt ein ganzes Jahr', () => {
    expect(deuteSuche('2026')).toMatchObject({ von: '2026-01-01', bis: '2026-12-31' });
  });

  it('weist einen unmöglichen Monat zurück', () => {
    // „2026-13" ist kein Monat. Als Zeitraum gedeutet käme eine Abfrage
    // heraus, die nie etwas findet — und das sähe aus wie „gibt es nicht".
    expect(deuteSuche('2026-13').art).toBe('baustelle');
  });

  it('hält alles Übrige mit einer Ziffer für eine Baustellennummer', () => {
    expect(deuteSuche('2026-042')).toEqual({ art: 'baustelle', nummer: '2026-042' });
    expect(deuteSuche('B-001')).toEqual({ art: 'baustelle', nummer: 'B-001' });
  });

  /*
    „PR-" stammt aus Altbeständen und meint dieselbe Baustelle. Ohne die
    Normalisierung fände die Abfrage genau die alten Scheine nicht, um die es
    bei dieser Suche geht.
  */
  it('nimmt das alte „PR-" weg', () => {
    expect(deuteSuche('PR-2026-042')).toEqual({ art: 'baustelle', nummer: '2026-042' });
    expect(deuteSuche('pr-2026-042')).toEqual({ art: 'baustelle', nummer: '2026-042' });
  });

  it('erkennt einen Namen als das, was er ist', () => {
    expect(deuteSuche('Huber')).toEqual({ art: 'text' });
    expect(deuteSuche('   ')).toEqual({ art: 'text' });
  });

  /*
    UND SAGT ES AUCH. Firestore kann keine Volltextsuche; nach einem Namen
    liesse sich nur mit einem zusätzlich gepflegten Feld suchen, und bis das
    auf jedem Altbestand nachgetragen wäre, fände sie alte Scheine
    stillschweigend nicht — genau das Verhalten, das hier weg soll.
  */
  it('sagt beim Namen, was nicht geht, und was stattdessen', () => {
    const hinweis = suchHinweis(deuteSuche('Huber'));
    expect(hinweis).toMatch(/nur im geladenen Bestand/);
    expect(hinweis).toMatch(/Baustellennummer/);
  });

  it('benennt bei Baustelle und Zeitraum, wonach gesucht wird', () => {
    expect(suchHinweis(deuteSuche('2026-042'))).toContain('Baustelle 2026-042');
    expect(suchHinweis(deuteSuche('09.2026'))).toContain('09.2026');
  });
});
