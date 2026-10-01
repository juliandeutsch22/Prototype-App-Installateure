import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aufschlagFuer, verkaufspreisVorschlag } from '@/lib/aufschlag';
import { imLager, istKnapp } from '@/features/orders/lagerartikel';

/**
 * Testbericht 30.09.2026, Paket 7c — Katalog und Lager getrennt (M30),
 * Materialaufschlag (M31). Die Datenbank rechnet den Aufschlag ein zweites
 * Mal (`app.aufschlag_fuer`); beide Fassungen stehen hier nebeneinander.
 */
const MIGRATION = readFileSync('supabase/migrations/20260930410000_katalog_lager_aufschlag_wartung.sql', 'utf8');

describe('Materialaufschlag', () => {
  const a = { standard: 25, warengruppen: { '1201': 40 } };

  it('Warengruppe vor Standard, ohne beides kein Aufschlag', () => {
    expect(aufschlagFuer(a, '1201')).toBe(40);
    expect(aufschlagFuer(a, ' 1201 ')).toBe(40);
    expect(aufschlagFuer(a, '9999')).toBe(25);
    expect(aufschlagFuer(a, null)).toBe(25);
    expect(aufschlagFuer({ warengruppen: { '1201': 40 } }, '9999')).toBeNull();
    expect(aufschlagFuer(undefined, '1201')).toBeNull();
  });

  it('schlägt einen Verkaufspreis auf Cent vor — nur mit Einkaufspreis und Aufschlag', () => {
    expect(verkaufspreisVorschlag(10, a, '1201')).toBe(14);
    expect(verkaufspreisVorschlag(3.333, a)).toBe(4.17);
    expect(verkaufspreisVorschlag(null, a)).toBeNull();
    expect(verkaufspreisVorschlag(0, a)).toBeNull();
    expect(verkaufspreisVorschlag(10, {})).toBeNull();
  });

  it('die Datenbank rechnet dieselbe Reihenfolge und rundet auf Cent', () => {
    expect(MIGRATION).toContain("p_rates -> 'materialaufschlag' -> 'warengruppen' ->> btrim(coalesce(p_warengruppe, ''))");
    expect(MIGRATION).toContain("(p_rates -> 'materialaufschlag' ->> 'standard')::numeric");
    expect(MIGRATION).toContain('round(e.einkaufspreis * (1 + app.aufschlag_fuer(saetze, m.warengruppe) / 100), 2)');
  });

  it('setzt nur, wo kein Verkaufspreis steht', () => {
    expect(MIGRATION).toContain('coalesce(m.verkaufspreis, 0) = 0');
  });
});

describe('Katalog und Lager', () => {
  it('geführt ist, was „im Lager führen“ trägt; ohne Angabe wie bisher', () => {
    expect(imLager({ lagerartikel: true })).toBe(true);
    expect(imLager({ lagerartikel: false })).toBe(false);
    expect(imLager({})).toBe(true);
  });

  it('knapp: unter der Mindestmenge, ohne Mindestmenge höchstens 5 frei', () => {
    expect(istKnapp(9, { mindestmenge: 10 }, 5)).toBe(true);
    expect(istKnapp(10, { mindestmenge: 10 }, 5)).toBe(false);
    expect(istKnapp(3, { mindestmenge: 2 }, 5)).toBe(false);
    expect(istKnapp(5, {}, 5)).toBe(true);
    expect(istKnapp(6, { mindestmenge: null }, 5)).toBe(false);
  });

  it('die Datenbank führt, was Bestand hat, und lässt Bestand nur im Lager zu', () => {
    expect(MIGRATION).toContain('check (lagerartikel or stock = 0)');
    expect(MIGRATION).toMatch(/if new\.stock <> 0 and \(tg_op = 'INSERT' or new\.stock is distinct from old\.stock\) then\s+new\.lagerartikel := true;/);
  });
});
