import type { Company, Invoice } from '@/types';
import type { generateInvoicePdf } from './pdf';

export type DruckAngaben = Parameters<typeof generateInvoicePdf>[0];

/**
 * Was ein erneuter Druck einer gespeicherten Rechnung braucht — alles aus dem
 * Dokument, nichts aus dem Formular.
 *
 * EINE STELLE FÜR NACHDRUCK UND BELEGARCHIV (seit 05.10.2026). Beide müssen
 * denselben Beleg ergeben wie der erste Druck; zwei Abschriften derselben
 * Liste liefen beim nächsten neuen Feld auseinander, und das Archiv enthielte
 * einen anderen Beleg als den, den der Kunde bekam.
 */
export function druckAngaben(company: Company, inv: Invoice): DruckAngaben {
  return {
    company,
    project: {
      customerName: inv.customerName,
      address: inv.address,
      projectNumber: inv.projectNumber,
    },
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    // Aus den gespeicherten Positionen — nicht neu berechnet, damit das
    // Dokument exakt dem entspricht, was der Kunde erhalten hat.
    assembled: {
      positions: inv.positions ?? [],
      subtotalNetto: inv.subtotalNetto ?? inv.totalNetto,
      discount: inv.discount ?? null,
      discountAmount: inv.discountAmount ?? 0,
      /*
        DIE VOLLE LEISTUNG, nicht die Forderung.

        Gespeichert ist beides: `total*` ist, was diese Rechnung fordert,
        `gesamt*` die Leistung davor. Das PDF bekommt die Leistung und zieht
        selbst ab — bekäme es die Forderung, zöge es ein zweites Mal ab, und
        der zweite Druck einer Schlussrechnung wäre ein anderer Beleg über
        dieselbe Nummer. Ohne Abzug sind beide gleich.
      */
      totalNetto: inv.gesamtNetto ?? inv.totalNetto,
      totalVat: inv.gesamtVat ?? inv.totalVat,
      totalBrutto: inv.gesamtBrutto ?? inv.totalBrutto,
      linkedEntries: inv.linkedEntries ?? [],
      linkedOrders: inv.linkedOrders ?? [],
      linkedWorkSheets: inv.linkedWorkSheets ?? [],
      // Aus dem DOKUMENT, nicht neu abgeleitet: der Zeitraum steht so beim
      // Kunden, auch wenn seither Buchungen dazugekommen sind.
      leistung:
        inv.leistungVon && inv.leistungBis
          ? { von: inv.leistungVon, bis: inv.leistungBis }
          : null,
      materialOhnePreis: [],
      entries: [],
    },
    appendDetail: false,
    vatRate: inv.vatRate,
    /*
      AUS DEM DOKUMENT, nicht aus dem Formular: der zweite Druck muss
      denselben Beleg ergeben wie der erste. Ohne diese zwei Zeilen verlöre
      eine Reverse-Charge-Rechnung beim erneuten Ausgeben ihren Pflichtsatz
      und die UID des Empfängers — und wäre damit ein anderer, ungültiger
      Beleg über dieselbe Nummer.
    */
    reverseCharge: inv.reverseCharge,
    customerVatId: inv.customerVatId,
    steuerbefreiung: inv.steuerbefreiung,
    // Aus dem Dokument — Altbestand hat ihn nicht und bleibt, wie er war.
    leistungsort: inv.leistungsort,
    bestellnummer: inv.bestellnummer ?? undefined,
    ruecklass: inv.ruecklassArt && inv.ruecklassProzent && inv.ruecklassBetrag != null && inv.ruecklassBis
      ? { art: inv.ruecklassArt, prozent: inv.ruecklassProzent, betrag: inv.ruecklassBetrag, bis: inv.ruecklassBis }
      : null,
    art: inv.art,
    vorrechnungen: inv.vorrechnungen,
    skonto: inv.skontoProzent && inv.skontoBis
      ? { skontoProzent: inv.skontoProzent, skontoBis: inv.skontoBis }
      : null,
  };
}
