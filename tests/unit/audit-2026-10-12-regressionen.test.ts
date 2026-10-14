import { describe, expect, it } from 'vitest';
import { materialkosten } from '@/features/costing/materialkosten';
import { beiVormerkungFehlgeschlagen, nachsenden, schreiben, type Lager, type Vormerkung } from '@/lib/sync/ausgangsfach';
import type { Material, WorkSheet } from '@/types';

/**
 * AUDIT (12.10.2026): reine Charakterisierungs-/Regressionstests.
 *
 * it.fails kennzeichnet einen bereits aus der Quelltextprüfung bekannten,
 * bislang nicht behobenen Fall. Der Test gilt nur als erfolgreich, WENN die
 * formulierte Sicherheitsanforderung weiterhin scheitert.
 *
 * WICHTIG: Bei einer Korrektur it.fails -> it ändern, sobald die gewünschte
 * Eigenschaft tatsächlich erfüllt ist. Keine Produktionslogik wird geändert.
 */

function imKopf(): Lager & { inhalt(): Vormerkung[] } {
  let folge = 0;
  let eintraege: Vormerkung[] = [];
  return {
    inhalt: () => [...eintraege],
    alle: async () => [...eintraege],
    ablegen: async (v) => {
      const n = ++folge;
      eintraege.push({ ...v, folge: n });
      return n;
    },
    entfernen: async (n) => { eintraege = eintraege.filter((v) => v.folge !== n); },
    ersetzen: async (v) => { eintraege = eintraege.map((x) => x.folge === v.folge ? v : x); },
  };
}

describe('Audit: Offline-Daten erhalten', () => {
  it('merkt offline an und sendet mit identischer Kennung nach', async () => {
    const lager = imKopf();
    const a = { tabelle: 'time_entries', art: 'anlegen' as const, zeile: 'audit-1', daten: { date: '2026-10-12' } };
    expect(await schreiben(a, lager, async () => ({ art: 'ok' }), () => true)).toBe('queued');
    const ids: string[] = [];
    const bericht = await nachsenden(lager, async (v) => {
      ids.push(v.zeile);
      return { art: 'ok' };
    });
    expect(ids).toEqual(['audit-1']);
    expect(bericht.gesendet).toBe(1);
    expect(lager.inhalt()).toHaveLength(0);
  });

  it.fails('bewahrt eine zuvor bestätigte Offline-Vormerkung auch nach endgültiger Serverablehnung auf', async () => {
    const lager = imKopf();
    const a = { tabelle: 'time_entries', art: 'anlegen' as const, zeile: 'audit-2', daten: { date: '2026-10-12', hours: 8 } };
    beiVormerkungFehlgeschlagen(null);
    try {
      expect(await schreiben(a, lager, async () => ({ art: 'ok' }), () => true)).toBe('queued');
      await nachsenden(lager, async () => ({ art: 'abgelehnt', grund: 'Serverregel' }));
      // Sollzustand: Originaldaten bleiben bis zur manuellen Klärung abrufbar.
      expect(lager.inhalt().some((v) => v.zeile === 'audit-2' && v.daten.hours === 8)).toBe(true);
    } finally {
      beiVormerkungFehlgeschlagen(null);
    }
  });
});

const schein = {
  id: 'schein-1', companyId: 'audit', projectNumber: '2026-001',
  status: 'Unterschrieben', material: [{ name: 'Eckventil', menge: 2 }],
} as unknown as WorkSheet & { id: string };

const artikel = (id: string, einkaufspreis: number): Material => ({
  id, companyId: 'audit', name: 'Eckventil', stock: 0, einkaufspreis,
}) as Material;

describe('Audit: Material-Zuordnung und historische Preise', () => {
  it('rechnet einen einzelnen eindeutig benannten Artikel korrekt', () => {
    expect(materialkosten([schein], [artikel('a', 3)]).kosten).toBe(6);
  });

  it.fails('liefert bei identisch benannten Artikeln unabhängig von der Katalog-Reihenfolge denselben Kostenwert', () => {
    const a = artikel('a', 3);
    const b = artikel('b', 12);
    const ab = materialkosten([schein], [a, b]);
    const ba = materialkosten([schein], [b, a]);
    expect(ab.kosten).toBe(ba.kosten);
  });

  it.todo('Verbaute Artikel mit stabiler Artikelkennung und historischem Einkaufspreis bewerten (Datenmodelländerung erforderlich)');
});
