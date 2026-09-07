import { describe, it, expect } from 'vitest';
import { materialkosten } from '@/features/costing/materialkosten';
import { rechneBaustelle, margenTon } from '@/features/costing/nachkalkulation';
import type { Material, WorkSheet } from '@/types';

/**
 * Was das verbaute Material den Betrieb gekostet hat.
 *
 * WARUM DAS FEHLTE UND WARUM ES ZÄHLT. Die Nachkalkulation rechnete Erlös
 * minus Personalkosten. Bei einem Installateur ist Material schnell die
 * Hälfte der Rechnungssumme — der ausgewiesene Deckungsbeitrag war damit
 * systematisch zu hoch, und zwar in der teuersten Richtung: eine Baustelle
 * sah tragfähig aus, die es nicht war.
 */

const schein = (
  id: string,
  material: Array<{ name: string; menge: number; einheit?: string }>,
  status: WorkSheet['status'] = 'Unterschrieben',
): WorkSheet & { id: string } =>
  ({
    id,
    companyId: 'perl',
    projectNumber: '2026-001',
    status,
    material,
  }) as unknown as WorkSheet & { id: string };

const artikel = (name: string, einkaufspreis?: number, verkaufspreis?: number): Material =>
  ({ id: name, companyId: 'perl', name, stock: 0, einkaufspreis, verkaufspreis }) as Material;

describe('Die Kosten', () => {
  it('rechnen Menge mal Einkaufspreis', () => {
    const k = materialkosten(
      [schein('s1', [{ name: 'Eckventil', menge: 4 }])],
      [artikel('Eckventil', 3.5)],
    );
    expect(k.kosten).toBe(14);
    expect(k.ohnePreis).toEqual([]);
  });

  /*
    DIE VERWECHSLUNG, DIE ALLES WERTLOS MACHT. Steht im Katalog beides, muss
    der EINKAUFSpreis in die Kosten gehen. Nähme die Rechnung den Verkaufs-
    preis, wäre der Deckungsbeitrag jedes Materials exakt null — eine Zahl,
    die plausibel aussieht und nichts bedeutet.
  */
  it('nehmen den Einkaufs-, nicht den Verkaufspreis', () => {
    const k = materialkosten(
      [schein('s1', [{ name: 'Eckventil', menge: 10 }])],
      [artikel('Eckventil', 3.5, 9.9)],
    );
    expect(k.kosten).toBe(35);
  });

  it('nennen den Artikel, wenn nur der Verkaufspreis gepflegt ist', () => {
    // Der Regelfall im Bestand: die Verwaltung pflegt Verkaufspreise, den
    // Einkaufspreis hat noch niemand eingetragen. Das ist eine Lücke, keine
    // Kostenangabe von null.
    const k = materialkosten(
      [schein('s1', [{ name: 'Eckventil', menge: 10 }])],
      [artikel('Eckventil', undefined, 9.9)],
    );
    expect(k.kosten).toBe(0);
    expect(k.ohnePreis).toEqual(['Eckventil']);
  });

  it('fassen denselben Artikel über mehrere Scheine zusammen', () => {
    // Drei Anfahrten, zweimal dasselbe Ventil: sechs Stück, nicht zwei Zeilen.
    const k = materialkosten(
      [
        schein('s1', [{ name: 'Eckventil', menge: 4 }]),
        schein('s2', [{ name: 'eckventil ', menge: 2 }]),
      ],
      [artikel('Eckventil', 3.5)],
    );
    expect(k.kosten).toBe(21);
    expect(k.scheine).toBe(2);
  });

  /*
    NUR UNTERSCHRIEBENE SCHEINE. Ein Entwurf ist noch keine Leistung — er
    lässt sich ändern und verwerfen. Zählte er mit, sprängen die Kosten einer
    Baustelle hin und her, während jemand einen Schein bearbeitet.
  */
  it('lassen Entwürfe und Stornos aus', () => {
    const k = materialkosten(
      [
        schein('s1', [{ name: 'Eckventil', menge: 4 }], 'Entwurf'),
        schein('s2', [{ name: 'Eckventil', menge: 4 }], 'Storniert'),
      ],
      [artikel('Eckventil', 3.5)],
    );
    expect(k.kosten).toBe(0);
    expect(k.scheine).toBe(0);
  });

  /*
    DER KERN. Ein fehlender Einkaufspreis ist kein Preis von null. Würde der
    Artikel mit 0,00 € angesetzt, stiege der Deckungsbeitrag um genau seinen
    Einkaufswert — und nichts wiese darauf hin.
  */
  it('schätzen nichts, wenn der Preis fehlt — sie nennen den Artikel', () => {
    const k = materialkosten(
      [schein('s1', [{ name: 'Eckventil', menge: 4 }, { name: 'Spezialdichtung', menge: 2 }])],
      [artikel('Eckventil', 3.5), artikel('Spezialdichtung')],
    );
    expect(k.kosten).toBe(14);
    expect(k.ohnePreis).toEqual(['Spezialdichtung']);
  });

  it('behandeln 0 im Katalog wie „nicht gepflegt"', () => {
    // Genau das speichert ein leer gelassenes Formularfeld.
    const k = materialkosten(
      [schein('s1', [{ name: 'Eckventil', menge: 4 }])],
      [artikel('Eckventil', 0)],
    );
    expect(k.kosten).toBe(0);
    expect(k.ohnePreis).toEqual(['Eckventil']);
  });

  it('melden einen Artikel, den der Katalog gar nicht kennt', () => {
    // Auf dem Schein steht, was verbaut wurde — nicht, was im Katalog steht.
    const k = materialkosten([schein('s1', [{ name: 'Fremdteil', menge: 1 }])], []);
    expect(k.ohnePreis).toEqual(['Fremdteil']);
  });

  it('zählen dieselbe Lücke nur einmal, nach Namen sortiert', () => {
    const k = materialkosten(
      [
        schein('s1', [{ name: 'Zink', menge: 1 }, { name: 'Aluminium', menge: 1 }]),
        schein('s2', [{ name: 'Zink', menge: 1 }]),
      ],
      [],
    );
    expect(k.ohnePreis).toEqual(['Aluminium', 'Zink']);
  });

  it('lassen Zeilen ohne Menge oder Namen aus', () => {
    const k = materialkosten(
      [schein('s1', [{ name: '', menge: 5 }, { name: 'Eckventil', menge: 0 }])],
      [artikel('Eckventil', 3.5)],
    );
    expect(k.kosten).toBe(0);
    expect(k.ohnePreis).toEqual([]);
  });
});

/**
 * Und was daraus in der Nachkalkulation wird — die Naht zwischen beiden.
 */
describe('In der Nachkalkulation', () => {
  const KOSTEN = { fach: 40, helper: 25 };
  const RECHNUNG = [
    { projectNumber: '2026-001', totalNetto: 2000, paymentStatus: 'Offen' },
  ] as never;

  it('zieht das Material vom Deckungsbeitrag ab', () => {
    const material = materialkosten(
      [schein('s1', [{ name: 'Eckventil', menge: 100 }])],
      [artikel('Eckventil', 3.5)],
    );
    const ohne = rechneBaustelle('2026-001', 'Huber', [], RECHNUNG, undefined, KOSTEN);
    const mit = rechneBaustelle('2026-001', 'Huber', [], RECHNUNG, undefined, KOSTEN, material);

    expect(ohne.deckungsbeitrag).toBe(2000);
    expect(mit.deckungsbeitrag).toBe(1650);
    expect(mit.materialkosten).toBe(350);
  });

  it('reicht die Lücken bis in die Ansicht durch', () => {
    const material = materialkosten([schein('s1', [{ name: 'Fremdteil', menge: 1 }])], []);
    const k = rechneBaustelle('2026-001', 'Huber', [], RECHNUNG, undefined, KOSTEN, material);
    expect(k.materialLuecken).toEqual(['Fremdteil']);
  });

  /*
    KEIN GRÜN AUF EINER HALBEN RECHNUNG. Eine Baustelle mit fetter Marge, auf
    der Material ohne Preis mitgelaufen ist, sieht tragfähig aus und ist es
    vielleicht nicht — um genau den Betrag, den niemand kennt. Die Ampel sagt
    das, statt es der Lückenliste zu überlassen, die jemand übersehen kann.
  */
  it('nimmt der Ampel das Grün, solange Preise fehlen', () => {
    const ohneLuecke = rechneBaustelle('2026-001', 'Huber', [], RECHNUNG, undefined, KOSTEN);
    expect(margenTon(ohneLuecke)).toBe('success');

    const material = materialkosten([schein('s1', [{ name: 'Fremdteil', menge: 1 }])], []);
    const mitLuecke = rechneBaustelle(
      '2026-001', 'Huber', [], RECHNUNG, undefined, KOSTEN, material,
    );
    expect(mitLuecke.margeProzent).toBeGreaterThan(20);
    expect(margenTon(mitLuecke)).toBe('warning');
  });

  it('rechnet ohne Materialangabe genau wie vorher', () => {
    // Jeder Aufrufer, der noch kein Material kennt, bekommt dieselbe Zahl —
    // und eine Null, die als Null gemeint ist.
    const k = rechneBaustelle('2026-001', 'Huber', [], RECHNUNG, undefined, KOSTEN);
    expect(k.materialkosten).toBe(0);
    expect(k.materialLuecken).toEqual([]);
    expect(k.deckungsbeitrag).toBe(2000);
  });
});
