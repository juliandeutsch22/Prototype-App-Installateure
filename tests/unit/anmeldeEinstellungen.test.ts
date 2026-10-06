import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Die Anmeldung im örtlichen Stack steht so wie in der Produktion.
 *
 * PRÜFLAUF 25.09.2026 (P3-22). `supabase/config.toml` liess die Selbst-
 * registrierung offen und nahm Passwörter ab sechs Zeichen an — die Doku
 * (`docs/MIGRATION-SUPABASE.md`) sagt „Registrieren aus", die App verlangt
 * acht. Jede Prüfung gegen den örtlichen Stack lief damit gegen eine
 * Anmeldung, die es draussen nicht gibt; ein Fehler, der nur mit offener
 * Registrierung funktioniert, fiele hier nie auf.
 *
 * `secure_password_change` ist seit dem 28.09.2026 an (offene Punkte B5).
 * Bei einer Sitzung, die älter als ein Tag ist, verlangt der Dienst vor dem
 * Ändern eine frische Anmeldung; die App holt sie mit dem eben geprüften
 * aktuellen Passwort nach (`lib/auth/pg/sitzung.ts`), statt einen Einmalcode
 * per Mail zu schicken, den ein Benutzernamen-Konto nie bekäme.
 */
const toml = readFileSync(resolve(__dirname, '../../supabase/config.toml'), 'utf8');

/** Der Wert eines Schlüssels in einem Abschnitt — ohne Kommentarzeilen. */
function wert(abschnitt: string, schluessel: string): string | undefined {
  const teile = toml.split(/^\[/m);
  const block = teile.find((t) => t.startsWith(`${abschnitt}]`));
  const zeile = block
    ?.split('\n')
    .find((z) => new RegExp(`^${schluessel}\\s*=`).test(z.trim()));
  return zeile?.split('=')[1]?.trim();
}

describe('Die Anmeldung im örtlichen Stack', () => {
  it('lässt niemanden sich selbst registrieren', () => {
    expect(wert('auth', 'enable_signup')).toBe('false');
  });

  it('lässt die Anmeldung per E-Mail an — der Schalter darunter ist der Anbieter selbst', () => {
    // [auth.email] enable_signup ist in der CLI GOTRUE_EXTERNAL_EMAIL_ENABLED:
    // aus, und niemand kann sich mehr anmelden („Email logins are disabled“).
    expect(wert('auth.email', 'enable_signup')).toBe('true');
  });

  it('verlangt für eine Passwortänderung eine frische Anmeldung', () => {
    expect(wert('auth.email', 'secure_password_change')).toBe('true');
  });

  it('verlangt acht Zeichen, wie die App', () => {
    expect(wert('auth', 'minimum_password_length')).toBe('8');
  });

  /*
    Runde 3, H1: die Zwei-Faktor-Anmeldung braucht TOTP. Aus, und das
    Plattformkonto käme im örtlichen Stack nie auf seine Seite — die Prüfungen
    dazu liefen gegen eine Anmeldung, die es so nicht gibt.
  */
  it('kennt TOTP als zweiten Faktor — Einrichten und Prüfen', () => {
    expect(wert('auth.mfa.totp', 'enroll_enabled')).toBe('true');
    expect(wert('auth.mfa.totp', 'verify_enabled')).toBe('true');
  });
});
