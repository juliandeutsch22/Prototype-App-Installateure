/**
 * Was eine Maske sagt, wenn der Server ablehnt.
 *
 * Die Meldungen unten sind die echten — abgefragt am 24.09.2026 gegen die
 * örtliche Datenbank (doppelte Baustellennummer, Anlegen ohne Recht). Ein
 * vorübergehender Fehler darf nach „noch einmal" klingen, eine Ablehnung
 * nicht: die scheitert beim zweiten Mal genauso.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { grundAus, einblickNurLesend } from '@/lib/fehlerGrund';

const ERSATZ = 'Die Baustelle konnte nicht gespeichert werden.';

afterEach(() => einblickNurLesend(false));

describe('grundAus', () => {
  it('lässt den Grund unserer Datenbank unverändert durch', () => {
    expect(grundAus(new Error('Urlaub wird beantragt und genehmigt, nicht direkt gebucht'), ERSATZ)).toBe(
      'Urlaub wird beantragt und genehmigt, nicht direkt gebucht',
    );
    expect(grundAus(new Error('Dieser Supportzugang darf lesen und sonst nichts'), ERSATZ)).toBe(
      'Dieser Supportzugang darf lesen und sonst nichts',
    );
  });

  it('übersetzt einen doppelten Wert — mit dem Satz der Maske, wenn sie einen hat', () => {
    const doppelt = new Error('duplicate key value violates unique constraint "projects_nummer_je_betrieb"');
    expect(grundAus(doppelt, ERSATZ)).toMatch(/^Das gibt es schon/);
    expect(grundAus(doppelt, ERSATZ, { doppelt: 'Die Nummer B-1 ist schon vergeben.' })).toBe(
      'Die Nummer B-1 ist schon vergeben.',
    );
  });

  it('nennt ein fehlendes Recht — und im Einblick den Einblick', () => {
    const rls = new Error('new row violates row-level security policy for table "projects"');
    expect(grundAus(rls, ERSATZ)).toMatch(/^Dafür fehlt die Berechtigung/);
    einblickNurLesend(true);
    expect(grundAus(rls, ERSATZ)).toMatch(/^Im Einblick wird nur gelesen/);
    expect(
      grundAus(new Error('Kein Datensatz in customers geändert — es gibt ihn nicht, oder er gehört nicht zu diesem Betrieb.'), ERSATZ),
    ).toMatch(/^Im Einblick wird nur gelesen/);
  });

  it('sagt bei fehlendem Netz, dass es am Netz liegt', () => {
    expect(grundAus(new TypeError('Failed to fetch'), ERSATZ)).toBe(
      `${ERSATZ} Keine Verbindung zum Server — bitte noch einmal, sobald das Netz wieder da ist.`,
    );
  });

  it('verschluckt andere technische Meldungen hinter dem Satz der Maske', () => {
    expect(
      grundAus(new Error('insert or update on table "projects" violates foreign key constraint "x"'), ERSATZ),
    ).toBe(ERSATZ);
    expect(grundAus(new Error('null value in column "customer_name" violates not-null constraint'), ERSATZ)).toBe(
      `${ERSATZ} Eine Angabe fehlt oder hat die falsche Form.`,
    );
    expect(grundAus(undefined, ERSATZ)).toBe(ERSATZ);
    expect(grundAus(new Error(''), ERSATZ)).toBe(ERSATZ);
  });
});
