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
): string {
  const was = `„${o.materialName}" ×${o.quantity}`;
  if (o.beschaffung === 'einkauf' && !o.geliefertAm) {
    return (
      `${was} ist beim Grosshändler bestellt, aber noch nicht als geliefert gebucht. ` +
      'Abschliessen heisst: die Ware ist da und abgeholt — sie verschwindet aus der ' +
      'Einkaufsliste, der Lagerbestand bleibt gleich. Ist sie noch unterwegs, bitte abwarten.'
    );
  }
  return `${was} wird als erledigt gebucht und vom Lagerbestand abgezogen.`;
}
