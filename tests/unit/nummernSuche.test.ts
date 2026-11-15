import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { katalogSeite, sucheKatalog } from '@/lib/db/pg/materials';
import { artikelSuchen } from '@/lib/db/pg/einkauf';
import { gefundenUeberText } from '@/lib/katalogTreffer';

/**
 * DIE KATALOGSUCHE FINDET AUCH ÜBER DIE NUMMER EINES GROSSHÄNDLERS UND DIE
 * EAN (M03a). Geprüft an den drei Suchen auf dem Server, auf denen alle
 * Trefferlisten stehen (Material anfordern und Katalog: `katalogSeite`;
 * Schein, Rüstliste, Angebot, Retoure: `sucheKatalog`; Einkaufsliste:
 * `artikelSuchen`): die über Nummern gefundenen Artikel kommen in DIESELBE
 * Abfrage (seit L3 `katalog_suchen` mit `p_ids`), sodass Sortierung, Grenze
 * und Zahl bleiben; der Treffer trägt, worüber er kam. GEGENPROBE: ohne die
 * Änderung fragt keine Suche nach Nummern, und kein Treffer trägt
 * `gefundenUeber`.
 */

const M2 = '00000000-0000-4000-8000-000000000002';
let rpcAufrufe: Array<[string, Record<string, unknown>]> = [];
let rpcAntwort: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const zeilen = [{ id: 'm1', company_id: 'perl', name: 'Kugelhahn' }, { id: M2, company_id: 'perl', name: 'Eckventil' }];
/** Was die Suche selbst bekam — ohne den Aufruf der Nummernsuche davor. */
const suche = () => rpcAufrufe.filter(([name]) => name === 'katalog_suchen').map(([, args]) => args);

beforeEach(() => {
  rpcAufrufe = [];
  rpcAntwort = { data: [{ material_id: M2, nummer: 'B-7788', art: 'lieferant', lieferant: 'Beta' }], error: null };
  clientEinreichen({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcAufrufe.push([name, args]);
      if (name === 'katalog_suchen') return { data: { zeilen, gesamt: args.p_zaehlen ? zeilen.length : null }, error: null };
      return rpcAntwort;
    },
  } as unknown as SupabaseClient);
});
afterEach(() => clientEinreichen(null));

describe('Die Suchen nehmen die über Nummern gefundenen Artikel in dieselbe Abfrage', () => {
  it('sucheKatalog (Schein, Rüstliste, Angebot, Retoure)', async () => {
    const treffer = await sucheKatalog('perl', 'B-7788', 20);
    expect(rpcAufrufe[0]).toEqual(['katalog_nummern_suche', { p_begriff: 'B-7788', p_anzahl: 20 }]);
    expect(suche()).toEqual([{ p_begriff: 'B-7788', p_anzahl: 20, p_ids: [M2], p_filter: 'alle', p_kategorie: true, p_zaehlen: false }]);
    expect(treffer.find((t) => t.id === M2)?.gefundenUeber).toEqual({ nummer: 'B-7788', art: 'lieferant', lieferant: 'Beta' });
    expect(treffer.find((t) => t.id === 'm1')?.gefundenUeber).toBeUndefined();
  });

  it('katalogSeite (Material anfordern, Katalog) — die Zahl kommt aus derselben Abfrage', async () => {
    const seite = await katalogSeite('perl', 'B-7788', 20, { nurAnforderbar: true });
    expect(suche()).toEqual([{ p_begriff: 'B-7788', p_anzahl: 20, p_ids: [M2], p_filter: 'anforderbar', p_kategorie: true, p_zaehlen: true }]);
    expect(seite.gesamt).toBe(2);
    expect(seite.zeilen[1].gefundenUeber?.nummer).toBe('B-7788');
  });

  it('artikelSuchen (Einkaufsliste) — ohne Ausgelaufene, ohne Kategorie, wie bisher', async () => {
    const treffer = await artikelSuchen('perl', '4006381333931');
    expect(rpcAufrufe[0][1]).toEqual({ p_begriff: '4006381333931', p_anzahl: 20 });
    expect(suche()).toEqual([{ p_begriff: '4006381333931', p_anzahl: 20, p_ids: [M2], p_filter: 'aktiv', p_kategorie: false, p_zaehlen: false }]);
    expect(treffer).toHaveLength(2);
  });
});

describe('Grenzen der Nummernsuche', () => {
  it('unter drei Zeichen kein Aufruf — die Suche läuft wie bisher', async () => {
    await sucheKatalog('perl', 'Ku', 20);
    expect(rpcAufrufe.map(([name]) => name)).toEqual(['katalog_suchen']);
    expect(suche()[0].p_ids).toEqual([]);
  });

  it('scheitert die Nummernsuche, sucht die App wie bisher', async () => {
    rpcAntwort = { data: null, error: { message: 'Funktion fehlt' } };
    const treffer = await sucheKatalog('perl', 'B-7788', 20);
    expect(suche()[0].p_ids).toEqual([]);
    expect(treffer).toHaveLength(2);
  });
});

describe('Die Trefferzeile nennt, worüber', () => {
  it('Nummer mit Großhändler, oder EAN', () => {
    expect(gefundenUeberText({ gefundenUeber: { nummer: 'B-7', art: 'lieferant', lieferant: 'Beta' } })).toBe('Nr. B-7 bei Beta');
    expect(gefundenUeberText({ gefundenUeber: { nummer: '4006381333931', art: 'ean', lieferant: 'Beta' } })).toBe('EAN 4006381333931');
    expect(gefundenUeberText({})).toBeUndefined();
  });
});
