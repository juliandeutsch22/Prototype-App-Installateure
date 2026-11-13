import type { MaterialOrder } from '@/types';

/**
 * Was „Abschliessen" mit einer Anforderung tatsächlich tut — in einem Satz.
 *
 * DER FALL, DER VORHER FALSCH BESCHRIEBEN WAR: bestellt beim Grosshändler,
 * aber noch nicht als geliefert gebucht. Die Datenbank bucht dann Eingang und
 * Abgang zugleich (`anforderung_abschliessen`) — der Bestand bleibt gleich,
 * und die Zeile verschwindet aus der Einkaufsliste. Der Dialog sagte
 * „vom Lagerbestand abgezogen", und niemand erfuhr, dass die Lieferung damit
 * nicht mehr verfolgt wird (Prüflauf 24.09.2026, F15/L5).
 */
export function abschlussText(
  o: Pick<MaterialOrder, 'materialName' | 'quantity' | 'beschaffung' | 'geliefertAm'>,
  herkunft?: 'lager' | 'haendler',
): string {
  const was = `„${o.materialName}“ ×${o.quantity}`;
  if (herkunft === 'haendler') {
    return `${was} wird als erledigt gebucht. Vom Lagerbestand wird nichts abgezogen — die Ware kam nicht aus dem Lager.`;
  }
  if (o.beschaffung === 'einkauf' && !o.geliefertAm) {
    return (
      `${was} ist beim Großhändler bestellt, aber noch nicht als geliefert gebucht. ` +
      'Abschließen heißt: die Ware ist da und abgeholt — sie verschwindet aus der ' +
      'Einkaufsliste, der Lagerbestand bleibt gleich. Ist sie noch unterwegs, bitte abwarten.'
    );
  }
  return `${was} wird als erledigt gebucht und vom Lagerbestand abgezogen.`;
}

/**
 * FRAGEN, WOHER DIE WARE KAM (C7, E89) — solange das Büro nichts
 * bereitgestellt hat und nichts beim Großhändler bestellt ist. Dann kann der
 * Monteur ins Regal gegriffen haben (abbuchen) oder beim Händler um die Ecke
 * gekauft haben (nicht abbuchen). Liegt die Ware abholbereit oder ist sie
 * bestellt, ist die Herkunft klar; `anforderung_abschliessen` lehnt „vom
 * Händler“ dann auch ab.
 */
export function herkunftFragen(
  o: Pick<MaterialOrder, 'status' | 'processed' | 'transactionType' | 'beschaffung' | 'bestelltAm' | 'geliefertAm'>,
): boolean {
  return (
    o.transactionType !== 'return' &&
    !o.processed &&
    (o.status === 'Offen' || o.status === 'In Bearbeitung') &&
    !(o.beschaffung === 'einkauf' && (!!o.bestelltAm || !!o.geliefertAm))
  );
}
