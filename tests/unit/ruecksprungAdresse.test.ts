/**
 * Wohin ein Rücksetz- oder Einladungslink führt (Testbericht 30.09.2026, K1).
 *
 * Ohne ausdrückliche Zieladresse nahm der Anmeldedienst seine „Site URL" —
 * und die stand auf `localhost`. Ein neuer Betrieb kam nie in sein Konto.
 */
import { describe, it, expect } from 'vitest';
import { ruecksprungAdresse } from '@shared/plattform';

describe('ruecksprungAdresse', () => {
  it('nimmt die festgelegte Adresse vor der Herkunft der Anfrage', () => {
    expect(ruecksprungAdresse('https://app.senklot.at', 'https://installateur-demo.firebaseapp.com'))
      .toBe('https://app.senklot.at/');
  });

  it('nimmt die Herkunft, wenn nichts festgelegt ist', () => {
    expect(ruecksprungAdresse(undefined, 'https://installateur-demo.firebaseapp.com'))
      .toBe('https://installateur-demo.firebaseapp.com/');
    expect(ruecksprungAdresse('  ', 'https://installateur-demo.firebaseapp.com'))
      .toBe('https://installateur-demo.firebaseapp.com/');
  });

  it('führt immer auf die Wurzel — ein mitgegebener Pfad fällt weg', () => {
    expect(ruecksprungAdresse('https://app.senklot.at/login?x=1', null)).toBe('https://app.senklot.at/');
  });

  it('überspringt, was keine Web-Adresse ist', () => {
    expect(ruecksprungAdresse('kein link', 'https://a.example')).toBe('https://a.example/');
    expect(ruecksprungAdresse('javascript:alert(1)', null)).toBeNull();
  });

  // Gegenprobe: ohne jede Angabe bleibt es beim Dienst — kein erfundenes Ziel.
  it('liefert null, wenn es keine Quelle gibt', () => {
    expect(ruecksprungAdresse(null, null)).toBeNull();
    expect(ruecksprungAdresse(undefined, undefined)).toBeNull();
  });
});
