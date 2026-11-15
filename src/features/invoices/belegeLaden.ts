import type { Company, Invoice, Mahnung } from '@/types';
import { belegFirma } from '@/lib/db/aussteller';
import { grundAus } from '@/lib/fehlerGrund';
import { druckAngaben } from './nachdruck';

/*
  GESPEICHERTE BELEGE ERNEUT ALS PDF — von der Rechnungsseite und aus der
  Kundenakte (Auftrag 03.11.2026: die Rechnung öffnet sich in der Akte).
  Eine Stelle für beide, damit die Akte nie einen anderen Beleg erzeugt als
  die Rechnungsseite. Nichts davon schreibt: gedruckt wird, was ausgestellt
  ist, mit den Firmendaten von damals. Fehler kommen als Meldung zurück,
  die so dasteht, wie der Benutzer sie lesen soll.
*/

/** Was jeder Nachdruck braucht: Positionen und die Firmendaten von damals. */
async function rechnungDruck(company: Company, inv: Invoice) {
  if (!inv.positions?.length) throw new Error('Für diese Rechnung sind keine Positionen gespeichert.');
  let firma: Company;
  try {
    firma = await belegFirma(company, inv.ausstellerStand);
  } catch (err) {
    throw new Error(grundAus(err, 'Die Firmendaten dieser Rechnung konnten nicht geladen werden.'));
  }
  return druckAngaben(firma, inv);
}

/** Die Rechnung erneut als PDF. */
export async function rechnungPdfLaden(company: Company, inv: Invoice): Promise<void> {
  const [{ downloadInvoicePdf }, angaben] = await Promise.all([import('./pdf'), rechnungDruck(company, inv)]);
  downloadInvoicePdf(angaben);
}

/**
 * Dieselbe Rechnung als Datei für den Mailversand (F16) — derselbe Nachdruck
 * wie „PDF laden“, nur nicht heruntergeladen: was der Kunde per Mail bekommt,
 * ist genau das, was das Büro sich lädt.
 */
export async function rechnungPdfBlob(company: Company, inv: Invoice): Promise<Blob> {
  const [{ generateInvoicePdf }, angaben] = await Promise.all([import('./pdf'), rechnungDruck(company, inv)]);
  return generateInvoicePdf(angaben).output('blob');
}

/** Eine gespeicherte Mahnung erneut als PDF — genau das Schreiben von damals. */
export async function mahnungPdfLaden(company: Company, m: Mahnung): Promise<void> {
  const { istMahnungInhalt, mahnungPdfAusInhalt, mahnungDateiname } = await import('./mahnungPdf');
  if (!istMahnungInhalt(m.inhalt)) throw new Error('Der gespeicherte Inhalt dieser Mahnung ist nicht lesbar.');
  try {
    // Mit den Firmendaten von damals — Bank und Anschrift könnten sich geändert haben.
    const blob = await mahnungPdfAusInhalt(await belegFirma(company, m.ausstellerStand), m.inhalt);
    const { shareOrDownloadPdf } = await import('@/features/worksheets/worksheetPdf');
    await shareOrDownloadPdf(blob, mahnungDateiname({ invoiceNumber: m.inhalt.rechnung.nummer }, m.inhalt.stufe));
  } catch (err) {
    throw new Error(grundAus(err, 'Die Mahnung konnte nicht geladen werden.'));
  }
}

/**
 * Die AUSGESTELLTE Stornorechnung erneut als PDF. Ausstellen (eine Nummer aus
 * dem Rechnungskreis vergeben) bleibt bei der Rechnungsseite.
 */
export async function stornorechnungPdfLaden(company: Company, inv: Invoice): Promise<void> {
  const nummer = inv.stornoNummer;
  if (!nummer) throw new Error('Zu dieser Rechnung ist keine Stornorechnung ausgestellt.');
  const { buildStornoPdf, stornoDateiname } = await import('./stornoPdf');
  const firma = await belegFirma(company, inv.stornoAusstellerStand);
  const blob = await buildStornoPdf({ company: firma, invoice: inv, nummer });
  const { shareOrDownloadPdf } = await import('@/features/worksheets/worksheetPdf');
  await shareOrDownloadPdf(blob, stornoDateiname(nummer));
}
