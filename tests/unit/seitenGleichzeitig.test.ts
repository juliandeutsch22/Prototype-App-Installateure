/**
 * MEHRERE SEITEN GLEICHZEITIG (Analyse 09.10.2026, Maßnahme 5).
 *
 * `abfragen` holte Seite für Seite: ein Jahr Buchungen sind sechzehn Seiten,
 * nacheinander sechzehn Wege durchs Netz. Jetzt nennt die erste Seite die
 * Gesamtzahl, und die übrigen werden gleichzeitig angefragt.
 *
 * Gleich bleibt: dieselben Zeilen in derselben Reihenfolge, die Grenze, und
 * eine volle letzte Seite führt wie bisher weiter.
 * Gegenprobe: gegen den Stand davor ist bei der zweiten Anfrage die erste
 * noch nicht beantwortet — die Seiten laufen nacheinander (rot).
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { abfragen, SEITE } from '@/lib/db/pg/kern';

/** Ein Client über `anzahl` Zeilen; zählt, wie viele Seiten gleichzeitig offen waren. */
function client(anzahl: number, { zaehltMit = true, dazu = 0 } = {}) {
  const angefragt: [number, number, boolean][] = [];
  let offen = 0;
  let hoechstens = 0;
  const c = {
    from: () => {
      let von = 0;
      let bis = 0;
      let zaehlen = false;
      const bauer = {
        select: (_s: string, o?: { count?: string }) => { zaehlen = o?.count === 'exact'; return bauer; },
        eq: () => bauer, order: () => bauer, limit: () => bauer, in: () => bauer,
        range: (a: number, b: number) => { von = a; bis = b; return bauer; },
        then: (aufl: (w: unknown) => unknown) => {
          angefragt.push([von, bis, zaehlen]);
          offen += 1;
          hoechstens = Math.max(hoechstens, offen);
          // Nach dem Zählen kommen `dazu` Zeilen hinzu.
          const da = zaehlen ? anzahl : anzahl + dazu;
          const zeilen: { id: string; company_id: string }[] = [];
          for (let i = von; i <= bis && i < da; i += 1) zeilen.push({ id: `z${String(i).padStart(5, '0')}`, company_id: 'perl' });
          return new Promise((r) => setTimeout(r, 5)).then(() => {
            offen -= 1;
            return aufl({ data: zeilen, error: null, count: zaehltMit && zaehlen ? anzahl : null });
          });
        },
      };
      return bauer;
    },
  } as unknown as SupabaseClient;
  return { c, angefragt, gleichzeitig: () => hoechstens };
}

const ids = (z: { id: string }[]) => z.map((x) => x.id);
const erwartet = (n: number) => Array.from({ length: n }, (_, i) => `z${String(i).padStart(5, '0')}`);

describe('abfragen: Seiten gleichzeitig', () => {
  it('holt 1.300 Zeilen: erste Seite mit Zahl, dann zwei Seiten gleichzeitig — in Reihenfolge', async () => {
    const { c, angefragt, gleichzeitig } = client(1300);
    const z = await abfragen<{ id: string }>('time_entries', 'perl', {}, c);
    expect(ids(z)).toEqual(erwartet(1300));
    expect(angefragt).toEqual([[0, SEITE - 1, true], [SEITE, 2 * SEITE - 1, false], [2 * SEITE, 3 * SEITE - 1, false]]);
    expect(gleichzeitig()).toBe(2);
  });

  it('hält die Grenze ein — wie bisher', async () => {
    const { c } = client(1300);
    expect(ids(await abfragen<{ id: string }>('time_entries', 'perl', { grenze: 700 }, c))).toEqual(erwartet(700));
  });

  it('zählt nicht, wo nur eine Seite möglich ist', async () => {
    const { c, angefragt } = client(1300);
    await abfragen('time_entries', 'perl', { grenze: 20 }, c);
    expect(angefragt).toEqual([[0, 19, false]]);
  });

  it('genau eine volle Seite: fragt einmal nach — wie bisher', async () => {
    const { c } = client(SEITE);
    expect(await abfragen('time_entries', 'perl', {}, c)).toHaveLength(SEITE);
  });

  it('kam nach dem Zählen etwas dazu, holt sie es trotzdem — nacheinander wie bisher', async () => {
    const { c } = client(1000, { dazu: 30 });
    expect(ids(await abfragen<{ id: string }>('time_entries', 'perl', {}, c))).toEqual(erwartet(1030));
  });

  it('ohne Gesamtzahl wie bisher nacheinander', async () => {
    const { c, gleichzeitig } = client(1300, { zaehltMit: false });
    expect(ids(await abfragen<{ id: string }>('time_entries', 'perl', {}, c))).toEqual(erwartet(1300));
    expect(gleichzeitig()).toBe(1);
  });
});
