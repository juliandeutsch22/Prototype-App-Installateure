// @vitest-environment jsdom
/**
 * Was ins Fehlerprotokoll geht — und was nicht.
 *
 * Die Datenbank kann nur prüfen, WER schreibt. Ob in der Meldung ein
 * Kundenname steht, entscheidet der Browser, bevor sie abgeht. Genau das ist
 * hier festgehalten, dazu die Bremsen gegen eine Schleife.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const eintragen = vi.fn();
vi.mock('@/lib/db/fehlerprotokoll', () => ({
  fehlerEintragen: (...a: unknown[]) => eintragen(...a),
}));

import {
  bereinige,
  ansichtOhneKennung,
  istRauschen,
  fehlerErfassen,
  fehlerBeobachten,
  letzterFehler,
  problemMelden,
  _zuruecksetzen,
} from '@/lib/fehlerprotokoll';

beforeEach(() => {
  eintragen.mockReset();
  eintragen.mockResolvedValue(undefined);
  _zuruecksetzen();
  window.history.replaceState(null, '', '/');
});

describe('Putzen', () => {
  it('nimmt Namen in Anführungszeichen, E-Mail-Adressen, Schlüsselwerte und Ziffernfolgen heraus', () => {
    expect(bereinige('„Familie Huber" gibt es bereits')).toBe('„…“ gibt es bereits');
    expect(bereinige('Kunde "Maier GmbH" fehlt')).toBe('Kunde "…" fehlt');
    expect(bereinige('an franz.huber@example.at geschickt')).toBe('an [E-Mail] geschickt');
    expect(bereinige('Key (name)=(Huber) already exists')).toBe('Key (name)=(…) already exists');
    expect(bereinige('Telefon 0664 123 45 67 ungültig')).toBe('Telefon # ungültig');
    expect(bereinige('IBAN AT61 1904 3002 3457 3201')).not.toMatch(/\d{4} \d{4}/);
  });

  it('lässt technische Meldungen stehen und kürzt auf die Länge der Spalte', () => {
    expect(bereinige("Cannot read properties of undefined (reading 'name')"))
      .toBe("Cannot read properties of undefined (reading 'name')");
    expect(bereinige('x'.repeat(900))).toHaveLength(500);
  });

  it('nimmt die Kennung aus der Ansicht, Suchbegriff und Anker ganz weg', () => {
    expect(ansichtOhneKennung('/customers/3f1c2a9e-1b2c-4d5e-8f90-123456789abc'))
      .toBe('/customers/:id');
    expect(ansichtOhneKennung('/invoices?suche=Huber#x')).toBe('/invoices');
  });

  it('hält Rauschen draussen: Nachladen, fehlendes Netz, fremde Skripte, Abbrüche', () => {
    expect(istRauschen('Failed to fetch dynamically imported module: https://x/a.js')).toBe(true);
    expect(istRauschen('Failed to fetch')).toBe(true);
    expect(istRauschen('Load failed')).toBe(true);
    expect(istRauschen('Script error.')).toBe(true);
    expect(istRauschen('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(istRauschen('The user aborted a request.', 'AbortError')).toBe(true);
    expect(istRauschen('  ')).toBe(true);
    expect(istRauschen('x is not a function')).toBe(false);
  });
});

describe('Erfassen', () => {
  it('schreibt einen Absturz mit Ansicht, Fassung, Gerät und Komponentenstapel', () => {
    window.history.replaceState(null, '', '/customers/3f1c2a9e-1b2c-4d5e-8f90-123456789abc?suche=Huber');
    fehlerErfassen('absturz', new TypeError('x is not a function'), '\n    at Kundenakte');
    expect(eintragen).toHaveBeenCalledTimes(1);
    const e = eintragen.mock.calls[0][0];
    expect(e).toMatchObject({ art: 'absturz', nachricht: 'TypeError: x is not a function', pfad: '/customers/:id' });
    expect(e.stapel).toContain('at Kundenakte');
    expect(e.fassung).toBeTruthy();
    expect(e.geraet).toBeTruthy();
  });

  it('schreibt denselben Fehler nur einmal in zehn Minuten, und höchstens 20 je Seite', () => {
    fehlerErfassen('fehler', new Error('immer derselbe'));
    fehlerErfassen('fehler', new Error('immer derselbe'));
    expect(eintragen).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 40; i++) fehlerErfassen('fehler', new Error(`Nummer ${'x'.repeat(i)}`));
    expect(eintragen).toHaveBeenCalledTimes(20);
  });

  it('schreibt nichts ohne Netz und nichts bei Rauschen', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fehlerErfassen('fehler', new Error('ohne Netz'));
    online.mockRestore();
    fehlerErfassen('fehler', new TypeError('Failed to fetch'));
    expect(eintragen).not.toHaveBeenCalled();
  });

  it('wirft nie — auch nicht, wenn das Schreiben scheitert', async () => {
    eintragen.mockRejectedValue(new Error('RLS'));
    expect(() => fehlerErfassen('fehler', new Error('boom'))).not.toThrow();
    expect(() => fehlerErfassen('fehler', { seltsam: true })).not.toThrow();
    await Promise.resolve();
  });

  it('fängt Fehler, die an React vorbeigehen — auch unbehandelte Versprechen', () => {
    const weg = fehlerBeobachten();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('im Klick'), message: 'im Klick' }));
    const ablehnung = new Event('unhandledrejection') as Event & { reason?: unknown };
    ablehnung.reason = new Error('nicht aufgefangen');
    window.dispatchEvent(ablehnung);
    const ab = vi.spyOn(window, 'removeEventListener');
    weg();
    expect(ab.mock.calls.map((c) => c[0])).toEqual(['error', 'unhandledrejection']);
    expect(eintragen.mock.calls.map((c) => c[0].nachricht)).toEqual(['im Klick', 'nicht aufgefangen']);
  });
});

describe('Problem melden', () => {
  it('schickt Beschreibung und den Fehler von eben mit — wohin, entscheidet die Datenbank', async () => {
    fehlerErfassen('absturz', new Error('eben passiert'));
    expect(letzterFehler()).toBe('eben passiert');
    await problemMelden('  Speichern ging nicht  ');
    expect(eintragen).toHaveBeenLastCalledWith(expect.objectContaining({
      art: 'meldung', beschreibung: 'Speichern ging nicht', nachricht: 'eben passiert',
    }));
  });

  it('verlangt eine Beschreibung und reicht einen Fehler beim Schreiben weiter', async () => {
    await expect(problemMelden('   ')).rejects.toThrow('Bitte beschreiben');
    eintragen.mockRejectedValue(new Error('keine Verbindung'));
    await expect(problemMelden('geht nicht')).rejects.toThrow('keine Verbindung');
  });
});
