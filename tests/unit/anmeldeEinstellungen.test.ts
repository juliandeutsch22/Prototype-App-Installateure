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
 * `secure_password_change` bleibt bewusst aus: die App ändert ein Passwort
 * mit `updateUser` in der laufenden Sitzung und prüft das alte vorher selbst
 * (`lib/auth/pg/sitzung.ts`). Mit dem Schalter verlangte der Dienst bei einer
 * Sitzung, die älter als ein Tag ist, eine erneute Anmeldung samt Einmalcode —
 * und das Ändern scheiterte.
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
    expect(wert('auth.email', 'enable_signup')).toBe('false');
  });

  it('verlangt acht Zeichen, wie die App', () => {
    expect(wert('auth', 'minimum_password_length')).toBe('8');
  });
});
