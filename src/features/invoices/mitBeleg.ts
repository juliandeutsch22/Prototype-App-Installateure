import type { Invoice, RechnungsKopf } from '@/types';

/**
 * DER KOPF VON JETZT MIT DEM BELEG VOM ÖFFNEN (L6, Durchsicht 15.11.2026).
 *
 * Die Listen der Rechnungsverwaltung tragen nur Köpfe; Positionen, Abdeckung
 * und der festgehaltene Leistungsnachweis kommen beim Öffnen
 * (`listInvoicesByIds`). Sie ändern sich nach dem Ausstellen nicht. Der Kopf
 * dagegen schon — Zahlung, Mahnung, Storno, Reaktivierung —, und dafür gilt
 * der Stand der Liste. Übernommen werden deshalb NUR die Teile des Belegs:
 * ein Kopffeld, das seit dem Öffnen leer wurde (die Reaktivierung leert
 * `cancelledAt`), fehlt im Kopf der Liste ganz und darf nicht aus dem
 * älteren Beleg zurückkommen.
 */
export function mitBeleg<T extends RechnungsKopf>(kopf: T, voll: Invoice): T & Invoice {
  return {
    ...kopf,
    positions: voll.positions,
    linkedEntries: voll.linkedEntries,
    linkedOrders: voll.linkedOrders,
    linkedWorkSheets: voll.linkedWorkSheets,
    linkedWartungen: voll.linkedWartungen,
    linkedRuestPositionen: voll.linkedRuestPositionen,
    leistungsnachweis: voll.leistungsnachweis,
  } as T & Invoice;
}
