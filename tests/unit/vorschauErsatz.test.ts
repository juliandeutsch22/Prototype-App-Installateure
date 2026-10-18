import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Die handgeschriebenen Ersatzmodule der Vorschau tragen jeden Export ihres
 * Vorbilds.
 *
 * Am 02.10.2026 fehlte `kontoUmstellen` in `tools/vorschau/sitzung.ts`. Vite
 * brach darauf die Abhängigkeitssuche ab, die Vorschau lud sich beim ersten
 * Aufruf neu, und die Linkprüfung in der CI scheiterte an einer
 * abgebrochenen Navigation — eine Rolle von sechs, je nach Reihenfolge. Die
 * Datenschicht erzeugt `stubs-erzeugen.mjs` aus den Quellen; diese beiden
 * nicht, darum hier.
 */

function exporte(pfad: string): string[] {
  const text = readFileSync(pfad, 'utf8');
  return [...text.matchAll(/^export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)|^export \{ ([A-Za-z0-9_, ]+) \}/gm)]
    .flatMap((m) => (m[1] ? [m[1]] : m[2].split(',').map((t) => t.trim())))
    .sort();
}

describe('Ersatzmodule der Vorschau', () => {
  for (const [vorbild, ersatz] of [
    ['src/lib/auth/sitzung.ts', 'tools/vorschau/sitzung.ts'],
    ['src/lib/auth/provisionUser.ts', 'tools/vorschau/provisionUser.ts'],
  ]) {
    it(`${ersatz} trägt jeden Export von ${vorbild}`, () => {
      const fehlt = exporte(vorbild).filter((x) => !exporte(ersatz).includes(x));
      expect(fehlt).toEqual([]);
    });
  }

  it('Gegenprobe: die Suche findet die Exporte überhaupt', () => {
    expect(exporte('src/lib/auth/sitzung.ts')).toEqual(expect.arrayContaining(['anmelden', 'kontoUmstellen', 'InactiveUserError']));
  });
});

/**
 * Die erzeugten Ersatzmodule (`stubs-erzeugen.mjs`) liefern, was DATEN und
 * FEST für sie vorsehen.
 *
 * Bis 13.10.2026 galt ein Eintrag in DATEN nur, wenn der Name mit list, get
 * usw. begann — `stundenDerBaustellen` und die beiden Kundenlisten blieben
 * NOOP, und die Kundenseite stürzte bei „Anschrift prüfen“ ab. Und weil
 * `invoices` in FEST zweimal stand, fehlte `scheineAufRechnung`. Beides fiel
 * erst in der Bestandsaufnahme (K4) auf, als Fehlerseite im Bestand.
 */
describe('Erzeugte Ersatzmodule der Vorschau', () => {
  let ziel = '';
  const modul = (name: string) => readFileSync(join(ziel, `${name}.ts`), 'utf8');

  beforeAll(() => {
    ziel = mkdtempSync(join(tmpdir(), 'vorschau-db-'));
    execFileSync('node', ['tools/vorschau/stubs-erzeugen.mjs'], { env: { ...process.env, VORSCHAU_ZIEL: ziel } });
  });
  afterAll(() => rmSync(ziel, { recursive: true, force: true }));

  it('ein Eintrag in DATEN gilt auch ohne passenden Namensanfang', () => {
    expect(modul('timeEntries')).toContain('export const stundenDerBaustellen = () => A([]);');
    expect(modul('customers')).toContain('export const kundenAdressePruefen = () => A(D.kunden.filter(');
    expect(modul('customers')).toContain('export const kundenOhneKundenart = () => A(D.kunden.filter(');
    // Auch im Unterordner `pg/`, den einzelne Ansichten direkt einbinden.
    expect(modul('pg/customers')).toContain('export const kundenAdressePruefen = () => A(');
    // Ein eigener Eintrag schlägt `*`: Ausführungen sind keine Anlagen.
    expect(modul('wartungen')).toContain('export const listAusfuehrungen = () => A([]);');
    expect(modul('invoices')).toContain('export const schlussrechnungenOhneAbzug = () => A([]);');
    expect(modul('wartungen')).toContain('export const listWartungen = () => A(D.wartungen);');
  });

  it('der Katalog vom Server hat in der Vorschau seine Form (18.10.2026)', () => {
    expect(modul('materials')).toContain('export const katalogSeite = () => A({ zeilen: D.materialien, gesamt: D.materialien.length });');
    expect(modul('materials')).toContain('export const katalogAnzahl = () => A(D.materialien.length);');
    expect(modul('materials')).toContain('export const sucheKatalog = () => A(D.materialien);');
    // Eine Aufräumfunktion, kein Versprechen — sonst wirft React beim Verlassen der Seite.
    expect(modul('materials')).toContain('export const katalogBeobachten = () => () => {};');
    expect(modul('materials')).toMatch(/export const subscribeLagerartikel = SUB\(/);
  });

  it('beide FEST-Einträge für Rechnungen gelten', () => {
    expect(modul('invoices')).toContain('export const scheineAufRechnung = () => A([]);');
    expect(modul('invoices')).toContain('export const sucheRechnungen = () => A([]);');
    expect(modul('invoices')).not.toContain('export const scheineAufRechnung = NOOP;');
  });

  it('bleibt gleich: Schreibendes ist NOOP, Lesendes nach Namen, Abos über SUB', () => {
    expect(modul('customers')).toContain('export const createCustomer = NOOP;');
    expect(modul('customers')).toContain('export const listCustomers = () => A(D.kunden);');
    expect(modul('invoices')).toMatch(/export const subscribe\w+ = SUB\(/);
  });

  it('die laufende Vorschau bleibt unberührt: geschrieben wird nur ins Prüfziel', () => {
    expect(ziel).not.toContain('tools/vorschau');
    expect(modul('customers')).toContain("import * as D from '../daten';");
  });
});
