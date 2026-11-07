import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { katalogSeite, sucheKatalog } from '@/lib/db/pg/materials';
import { artikelSuchen } from '@/lib/db/pg/einkauf';
import { oderMitNummern } from '@/lib/db/pg/nummernSuche';
import { gefundenUeberText } from '@/lib/katalogTreffer';

/**
 * DIE KATALOGSUCHE FINDET AUCH ÜBER DIE NUMMER EINES GROSSHÄNDLERS UND DIE
 * EAN (M03a). Geprüft an den drei Suchen auf dem Server, auf denen alle
 * Trefferlisten stehen (Material anfordern und Katalog: `katalogSeite`;
 * Schein, Rüstliste, Angebot, Retoure: `sucheKatalog`; Einkaufsliste:
 * `artikelSuchen`): die über Nummern gefundenen Artikel kommen in DIESELBE
 * Abfrage (`id.in.(…)`), sodass Sortierung, Grenze und Zahl bleiben; der
 * Treffer trägt, worüber er kam. GEGENPROBE: ohne die Änderung fragt keine
 * Suche nach Nummern, und kein Treffer trägt `gefundenUeber`.
 */

const M2 = '00000000-0000-4000-8000-000000000002';
let rpcAufrufe: Array<[string, Record<string, unknown>]> = [];
let oderAufrufe: string[] = [];
let rpcAntwort: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const zeilen = [{ id: 'm1', company_id: 'perl', name: 'Kugelhahn' }, { id: M2, company_id: 'perl', name: 'Eckventil' }];

/** Ein Abfragebauer, der jede Kette annimmt, die `or`-Bedingung mitschreibt und am Ende die Zeilen liefert. */
function bauer(): unknown {
  const b: unknown = new Proxy(() => undefined, {
    get: (_t, name) => {
      if (name === 'then') {
        return (fertig: (w: unknown) => void) => fertig({ data: zeilen, error: null, count: zeilen.length });
      }
      return (...args: unknown[]) => {
        if (name === 'or') oderAufrufe.push(String(args[0]));
        return b;
      };
    },
  });
  return b;
}

beforeEach(() => {
  rpcAufrufe = [];
  oderAufrufe = [];
  rpcAntwort = { data: [{ material_id: M2, nummer: 'B-7788', art: 'lieferant', lieferant: 'Beta' }], error: null };
  clientEinreichen({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcAufrufe.push([name, args]);
      return rpcAntwort;
    },
    from: () => bauer(),
  } as unknown as SupabaseClient);
});
afterEach(() => clientEinreichen(null));

describe('Die Suchen nehmen die über Nummern gefundenen Artikel in dieselbe Abfrage', () => {
  it('sucheKatalog (Schein, Rüstliste, Angebot, Retoure)', async () => {
    const treffer = await sucheKatalog('perl', 'B-7788', 20);
    expect(rpcAufrufe).toEqual([['katalog_nummern_suche', { p_begriff: 'B-7788', p_anzahl: 20 }]]);
    expect(oderAufrufe[0]).toMatch(new RegExp(`,id\\.in\\.\\(${M2}\\)$`));
    expect(treffer.find((t) => t.id === M2)?.gefundenUeber).toEqual({ nummer: 'B-7788', art: 'lieferant', lieferant: 'Beta' });
    expect(treffer.find((t) => t.id === 'm1')?.gefundenUeber).toBeUndefined();
  });

  it('katalogSeite (Material anfordern, Katalog) — die Zahl kommt aus derselben Abfrage', async () => {
    const seite = await katalogSeite('perl', 'B-7788', 20);
    expect(oderAufrufe[0]).toContain(`id.in.(${M2})`);
    expect(seite.gesamt).toBe(2);
    expect(seite.zeilen[1].gefundenUeber?.nummer).toBe('B-7788');
  });

  it('artikelSuchen (Einkaufsliste)', async () => {
    const treffer = await artikelSuchen('perl', '4006381333931');
    expect(rpcAufrufe[0][1]).toEqual({ p_begriff: '4006381333931', p_anzahl: 20 });
    expect(oderAufrufe[0]).toContain(`id.in.(${M2})`);
    expect(treffer).toHaveLength(2);
  });
});

describe('Grenzen der Nummernsuche', () => {
  it('unter drei Zeichen kein Aufruf — die Suche läuft wie bisher', async () => {
    await sucheKatalog('perl', 'Ku', 20);
    expect(rpcAufrufe).toEqual([]);
    expect(oderAufrufe[0]).not.toContain('id.in');
  });

  it('scheitert die Nummernsuche, sucht die App wie bisher', async () => {
    rpcAntwort = { data: null, error: { message: 'Funktion fehlt' } };
    const treffer = await sucheKatalog('perl', 'B-7788', 20);
    expect(oderAufrufe[0]).not.toContain('id.in');
    expect(treffer).toHaveLength(2);
  });

  it('ohne Treffer bleibt die Bedingung unverändert', () => {
    expect(oderMitNummern('name.ilike."%x%"', new Map())).toBe('name.ilike."%x%"');
    expect(oderMitNummern(null, new Map([['a', 1]]))).toBeNull();
  });
});

describe('Die Trefferzeile nennt, worüber', () => {
  it('Nummer mit Großhändler, oder EAN', () => {
    expect(gefundenUeberText({ gefundenUeber: { nummer: 'B-7', art: 'lieferant', lieferant: 'Beta' } })).toBe('Nr. B-7 bei Beta');
    expect(gefundenUeberText({ gefundenUeber: { nummer: '4006381333931', art: 'ean', lieferant: 'Beta' } })).toBe('EAN 4006381333931');
    expect(gefundenUeberText({})).toBeUndefined();
  });
});
