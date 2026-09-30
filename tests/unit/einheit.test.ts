import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EINHEITEN, EINHEITEN_MIT_KOMMA, mengeFehler, mengeMitKomma } from '@/lib/einheit';

// Testbericht 30.09.2026, M27 — Mengen je Einheit.
describe('mengeFehler', () => {
  it('Meter, Kilo und Liter nehmen Nachkommastellen', () => {
    expect(mengeFehler(2.5, 'm')).toBeNull();
    expect(mengeFehler(0.75, 'kg')).toBeNull();
    expect(mengeFehler(12.125, 'lfm')).toBeNull();
    expect(mengeFehler(1.5, 'm³')).toBeNull();
  });

  it('Stück, Packung und Set zählen ganz — „2,5 Stück“ fällt auf', () => {
    expect(mengeFehler(2.5, 'Stk')).toMatch(/ganze Stück/);
    expect(mengeFehler(1.5, 'Pkg')).toMatch(/„Pkg“/);
    expect(mengeFehler(3, 'Set')).toBeNull();
  });

  it('Gegenprobe: unbekannte oder fehlende Einheit zählt ganz, null und weniger nie', () => {
    expect(mengeFehler(1.5, '')).toMatch(/„Stk“/);
    expect(mengeFehler(1.5, 'Karton')).toMatch(/ganze Stück/);
    expect(mengeFehler(0, 'm')).toMatch(/größer als null/);
    expect(mengeFehler(-1, 'Stk')).toMatch(/größer als null/);
    expect(mengeFehler(Number.NaN, 'Stk')).toMatch(/eintragen/);
    expect(mengeFehler(1.2345, 'm')).toMatch(/drei Nachkommastellen/);
  });

  it('Schreibweisen: groß, klein, mit Leerzeichen', () => {
    expect(mengeMitKomma(' M ')).toBe(true);
    expect(mengeMitKomma('KG')).toBe(true);
    expect(mengeMitKomma('Stk')).toBe(false);
  });

  it('die Vorschlagsliste kennt m³', () => {
    expect(EINHEITEN).toContain('m³');
  });
});

describe('dieselbe Liste in der Datenbank', () => {
  it('app.menge_mit_komma nennt genau diese Einheiten', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260930370000_mengen_je_einheit.sql'),
      'utf8',
    );
    const block = /lower\(btrim\(coalesce\(p_einheit, ''\)\)\) in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const inSql = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...EINHEITEN_MIT_KOMMA].sort());
  });
});
