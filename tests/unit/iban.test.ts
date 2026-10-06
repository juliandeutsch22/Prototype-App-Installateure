import { describe, it, expect } from 'vitest';
import { bicFehler, ibanAnzeige, ibanFehler, ibanNormal } from '@shared/iban';

/**
 * Runde 3, H3: „IBAN AT74123456“ stand auf jedem Beleg. Gültige
 * Beispiel-IBANs (AT, DE) gehen durch, falsche Länge und falsche Prüfziffer
 * nicht. Dieselbe Regel prüft die Datenbank (tests/supabase/ibanPruefung.test.ts).
 */
describe('IBAN', () => {
  it('gültige Beispiele aus AT und DE — auch mit Leerzeichen und klein geschrieben', () => {
    expect(ibanFehler('AT61 1904 3002 3457 3201')).toBeNull();
    expect(ibanFehler('DE89370400440532013000')).toBeNull();
    expect(ibanFehler('de89 3704 0044 0532 0130 00')).toBeNull();
  });

  it('der Befund aus dem Pilotbetrieb: zehn Zeichen statt zwanzig', () => {
    expect(ibanFehler('AT74123456')).toBe('Eine IBAN aus AT hat 20 Zeichen, diese hat 10.');
  });

  it('falsche Prüfziffer — eine vertauschte Stelle', () => {
    expect(ibanFehler('AT61 1904 3002 3457 3210')).toMatch(/Prüfziffer/);
    expect(ibanFehler('DE89370400440532013001')).toMatch(/Prüfziffer/);
  });

  it('falsche Form und unbekanntes Land', () => {
    expect(ibanFehler('1234567890')).toMatch(/Länderkürzel/);
    expect(ibanFehler('XX1234567')).toMatch(/15 bis 34/);
  });

  it('leer ist kein Fehler — die Rechnung nennt dann kein Konto', () => {
    expect(ibanFehler('')).toBeNull();
    expect(ibanFehler(undefined)).toBeNull();
  });

  it('gespeichert ohne Leerzeichen, gezeigt in Vierergruppen', () => {
    expect(ibanNormal(' at61 1904 3002 3457 3201 ')).toBe('AT611904300234573201');
    expect(ibanAnzeige('AT611904300234573201')).toBe('AT61 1904 3002 3457 3201');
    // Gegenprobe: schon gruppiert bleibt gruppiert — die Belege ändern sich nicht.
    expect(ibanAnzeige('AT12 3456 7890 1234 5678')).toBe('AT12 3456 7890 1234 5678');
  });
});

describe('BIC', () => {
  it('8 und 11 Zeichen gehen', () => {
    expect(bicFehler('BKAUATWW')).toBeNull();
    expect(bicFehler('RLNWATWWXXX')).toBeNull();
    expect(bicFehler('bkau atww')).toBeNull();
  });
  it('falsch', () => {
    expect(bicFehler('BKAU')).toMatch(/8 oder 11/);
    expect(bicFehler('12AUATWW')).toMatch(/8 oder 11/);
  });
});
