import { describe, it, expect } from 'vitest';
import { alsPosition, materialOhneSchein, type Ausgabe } from '@/features/invoices/ausgegebenesMaterial';
import type { Material } from '@/types';

/**
 * Ausgegebenes Material ohne Schein (23.10.2026): ausgegeben minus zurück
 * minus auf den Scheinen dieser Rechnung — je Artikel, angeglichen am Namen.
 */
const aus = (name: string, menge: number, teil: Partial<Ausgabe> = {}): Ausgabe => ({
  art: menge < 0 ? 'retoure' : 'anforderung', belegId: `${name}-${menge}`, datum: '2026-09-10',
  materialId: null, name, einheit: 'm', menge, ...teil,
});
const KATALOG = [
  { id: 'k1', companyId: 'c', name: 'Kupferrohr 15', stock: 0, unit: 'm', verkaufspreis: 12.5 },
  { id: 'k2', companyId: 'c', name: 'Pressfitting', stock: 0, unit: 'Stk', verkaufspreis: 0 },
] as Material[];

describe('materialOhneSchein', () => {
  it('rechnet ausgegeben minus zurück minus auf Scheinen, je Artikel', () => {
    const v = materialOhneSchein(
      [
        aus('Kupferrohr 15', 10, { materialId: 'k1' }),
        aus('kupferrohr  15', 4, { art: 'ruestliste' }),
        aus('Kupferrohr 15', -2),
      ],
      [{ material: [{ name: 'Kupferrohr 15', menge: 5, einheit: 'm' }] }],
      KATALOG,
    );
    expect(v).toEqual([{
      schluessel: 'kupferrohr 15', name: 'Kupferrohr 15', einheit: 'm', materialId: 'k1',
      ausgegeben: 14, zurueck: 2, aufScheinen: 5, offen: 7, preis: 12.5,
    }]);
  });

  it('schlägt nichts vor, was die Scheine schon tragen oder ganz zurückkam', () => {
    expect(materialOhneSchein(
      [aus('Kupferrohr 15', 3), aus('Pressfitting', 2, { einheit: 'Stk' }), aus('Pressfitting', -2, { einheit: 'Stk' })],
      [{ material: [{ name: 'Kupferrohr 15', menge: 3 }] }],
      KATALOG,
    )).toEqual([]);
  });

  it('ohne gepflegten Preis steht 0 — und die Einheit kommt notfalls aus dem Katalog', () => {
    const [v] = materialOhneSchein([aus('Pressfitting', 6, { einheit: null })], [], KATALOG);
    expect(v).toMatchObject({ preis: 0, einheit: 'Stk', offen: 6 });
  });

  it('sortiert alphabetisch und macht daraus eine Position mit Katalogbezug', () => {
    const v = materialOhneSchein([aus('Pressfitting', 2, { einheit: 'Stk' }), aus('Kupferrohr 15', 1.5, { materialId: 'k1' })], [], KATALOG);
    expect(v.map((x) => x.name)).toEqual(['Kupferrohr 15', 'Pressfitting']);
    expect(alsPosition(v[0])).toEqual({ label: 'Kupferrohr 15', qty: 1.5, unit: 'm', unitPrice: 12.5, netto: 18.75, materialId: 'k1' });
    expect(alsPosition(v[1])).not.toHaveProperty('materialId');
  });

  describe('Abgleich über die Katalogkennung (24.10.2026)', () => {
    it('zieht eine Scheinzeile über die Kennung ab, auch wenn der Name abweicht', () => {
      // Der Katalog wurde zwischen Anforderung und Schein umbenannt.
      expect(materialOhneSchein(
        [aus('Kupferrohr 15 mm', 6, { materialId: 'k1' })],
        [{ material: [{ name: 'Kupferrohr 15', menge: 6, einheit: 'm', materialId: 'k1' }] }],
        KATALOG,
      )).toEqual([]);
    });

    it('fasst Ausgaben desselben Artikels unter verschiedenen Namen zusammen', () => {
      const v = materialOhneSchein(
        [aus('Kupferrohr 15 mm', 6, { materialId: 'k1' }), aus('Kupferrohr 15', 4, { materialId: 'k1', art: 'ruestliste' })],
        [{ material: [{ name: 'Kupferrohr 15', menge: 3, materialId: 'k1' }] }],
        KATALOG,
      );
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ materialId: 'k1', ausgegeben: 10, aufScheinen: 3, offen: 7 });
    });

    it('die Kennung schlägt den Namen: gleicher Name, anderer Artikel zieht nichts ab', () => {
      const v = materialOhneSchein(
        [aus('Kupferrohr 15', 5, { materialId: 'k1' }), aus('Kupferrohr 18', 2, { materialId: 'k9' })],
        [{ material: [{ name: 'Kupferrohr 15', menge: 2, materialId: 'k9' }] }],
        KATALOG,
      );
      expect(v.map((x) => [x.name, x.offen])).toEqual([['Kupferrohr 15', 5]]);
    });

    it('bleibt gleich: ohne Kennung auf einer Seite gilt der Name wie bisher', () => {
      // Alte Scheinzeile ohne Kennung gegen Ausgabe mit Kennung — und umgekehrt.
      expect(materialOhneSchein(
        [aus('Kupferrohr 15', 4, { materialId: 'k1' }), aus('Pressfitting', 2, { einheit: 'Stk' })],
        [{ material: [{ name: 'kupferrohr 15', menge: 4 }, { name: 'Pressfitting', menge: 2, materialId: 'k2' }] }],
        KATALOG,
      )).toEqual([]);
      // Eine Kennung, die unter den Ausgaben nicht vorkommt, fällt auf den Namen zurück.
      expect(materialOhneSchein(
        [aus('Pressfitting', 3, { einheit: 'Stk' })],
        [{ material: [{ name: 'Pressfitting', menge: 1, materialId: 'k2' }] }],
        KATALOG,
      )).toMatchObject([{ name: 'Pressfitting', offen: 2 }]);
    });
  });
});
