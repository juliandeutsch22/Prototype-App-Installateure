/**
 * Wie ein Termin dasteht und wen er betrifft (Plan 10.4).
 */
import { describe, it, expect } from 'vitest';
import { artName, betrifftMich, bezugText, datumKurz, terminKopf, terminZeit } from '@/features/termine/terminText';

describe('Die Uhrzeit eines Termins', () => {
  it('von–bis, nur von, nur bis, oder gar nicht', () => {
    expect(terminZeit({ zeitVon: '08:00', zeitBis: '10:00' })).toBe('08:00–10:00');
    expect(terminZeit({ zeitVon: '08:00', zeitBis: null })).toBe('ab 08:00');
    expect(terminZeit({ zeitVon: null, zeitBis: '10:00' })).toBe('bis 10:00');
    expect(terminZeit({ zeitVon: null, zeitBis: null })).toBe('');
  });

  it('die Kopfzeile: Art und Uhrzeit, ohne Uhrzeit nur die Art', () => {
    expect(terminKopf({ art: 'Lieferung', zeitVon: '08:00', zeitBis: '10:00' })).toBe('Lieferung (Aviso) · 08:00–10:00');
    expect(terminKopf({ art: 'Abnahme', zeitVon: null, zeitBis: null })).toBe('Abnahme');
  });

  it('nur die Lieferung heißt zusätzlich „Aviso"', () => {
    expect(artName('Lieferung')).toBe('Lieferung (Aviso)');
    expect(artName('Besichtigung')).toBe('Besichtigung');
  });

  it('der Tag kurz, mit Wochentag', () => {
    expect(datumKurz('2026-06-02')).toBe('Di, 02.06.');
  });
});

describe('Woran ein Termin hängt', () => {
  it('Baustelle mit Kundenname, Kunde ohne Baustelle — und ohne Namen wenigstens die Nummer', () => {
    expect(bezugText({ projectNumber: '2026-042', ortName: 'Familie Huber' })).toBe('Familie Huber · 2026-042');
    expect(bezugText({ projectNumber: null, ortName: 'Hausverwaltung Nord' })).toBe('Hausverwaltung Nord (ohne Baustelle)');
    expect(bezugText({ projectNumber: '2026-042', ortName: null })).toBe('2026-042');
    expect(bezugText({ projectNumber: null, ortName: null })).toBe('beim Kunden');
  });
});

describe('Wen ein Termin betrifft — „Mein Einsatzplan"', () => {
  const einsaetze = [{ date: '2026-06-02', projectNumber: '2026-042' }];
  const termin = { teilnehmer: ['anna'], projectNumber: '2026-042', datum: '2026-06-02' };

  it('den Teilnehmer', () => {
    expect(betrifftMich(termin, 'anna', [])).toBe(true);
  });

  it('wer am selben Tag auf derselben Baustelle eingeteilt ist', () => {
    expect(betrifftMich(termin, 'bert', einsaetze)).toBe(true);
  });

  it('nicht: anderer Tag, andere Baustelle, Termin ohne Baustelle', () => {
    expect(betrifftMich({ ...termin, datum: '2026-06-03' }, 'bert', einsaetze)).toBe(false);
    expect(betrifftMich({ ...termin, projectNumber: '2026-099' }, 'bert', einsaetze)).toBe(false);
    expect(betrifftMich({ ...termin, projectNumber: null }, 'bert', einsaetze)).toBe(false);
  });
});
