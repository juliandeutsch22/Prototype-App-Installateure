/**
 * Anmelden mit Benutzername — die Regeln, die Browser und Edge Function teilen.
 *
 * WAS HIER AUF DEM SPIEL STEHT. Aus dem Namen wird eine Kunstadresse. Wird
 * sie beim Anlegen anders gebildet als beim Anmelden, entsteht ein Konto, in
 * das niemand je hineinkommt — und die Anlage meldet trotzdem Erfolg.
 */
import { describe, it, expect } from 'vitest';
import {
  anmeldeAdresse, benutzernameAus, benutzernameFehler, BENUTZER_DOMAIN,
  istBenutzerkonto, kontoAnzeige, kunstadresse,
} from '@shared/benutzername';

describe('Die Kunstadresse', () => {
  it('endet auf einer nie zustellbaren Domain', () => {
    // RFC 2606: `.invalid` gehört niemandem und wird nie zugestellt.
    expect(BENUTZER_DOMAIN.endsWith('.invalid')).toBe(true);
  });

  it('ist beim Anlegen und beim Anmelden dieselbe — auch bei grossem Anfangsbuchstaben', () => {
    expect(anmeldeAdresse('Manfred.Huber')).toBe(kunstadresse('manfred.huber'));
    expect(anmeldeAdresse('  manfred.huber ')).toBe(kunstadresse('manfred.huber'));
  });

  it('lässt eine echte Adresse, wie sie ist', () => {
    expect(anmeldeAdresse('petra@perl.at')).toBe('petra@perl.at');
    expect(istBenutzerkonto('petra@perl.at')).toBe(false);
  });

  it('wird erkannt und zurück in den Namen gelesen', () => {
    const a = kunstadresse('hans-1');
    expect(istBenutzerkonto(a)).toBe(true);
    expect(istBenutzerkonto(a.toUpperCase())).toBe(true);
    expect(benutzernameAus(a)).toBe('hans-1');
    expect(kontoAnzeige(a)).toBe('hans-1');
    expect(kontoAnzeige('petra@perl.at')).toBe('petra@perl.at');
    expect(kontoAnzeige(undefined)).toBe('');
  });

  it('wird nicht mit einer Adresse verwechselt, die nur ähnlich endet', () => {
    expect(istBenutzerkonto(`x@nicht${BENUTZER_DOMAIN}`)).toBe(false);
  });
});

describe('Welche Namen gehen', () => {
  it.each(['manfred', 'manfred.huber', 'm_huber', 'hans-2', 'abc', 'a'.repeat(40)])(
    '„%s" geht', (n) => expect(benutzernameFehler(n)).toBeNull(),
  );

  it.each([
    ['', /fehlt/],
    ['ab', /mindestens 3/],
    ['a'.repeat(41), /höchstens 40/],
    ['jürgen', /ue/],
    ['max mustermann', /Leerzeichen/],
    ['max@perl', /Erlaubt sind nur/],
    ['.max', /beginnen und enden/],
    ['max-', /beginnen und enden/],
    ['max..huber', /Zwei Punkte/],
  ])('„%s" geht nicht', (n, grund) => {
    expect(benutzernameFehler(n)).toMatch(grund);
  });
});
