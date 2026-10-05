import type { Company, Customer, Invoice } from '@/types';
import { buildInvoiceCsv, invoiceCsvFilename } from './buchhaltungExport';
import { druckAngaben } from './nachdruck';
import { stornoDateiname, stornoTag } from './stornoPdf';
import { zipErstellen, type ZipDatei } from '@/lib/zip';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';

/**
 * Das Belegarchiv: alle Rechnungen und Stornorechnungen eines Zeitraums als
 * PDF, dazu das Rechnungsausgangsbuch als CSV — in einer ZIP-Datei
 * (Stand-Datei 11.1, Punkt 6).
 *
 * WOZU. Rechnungen sind sieben Jahre aufzubewahren (§ 132 BAO), auch wenn
 * der Betrieb Senklot nicht mehr nutzt. Statt eines Kontos „nur lesen“ nach
 * der Kündigung nimmt er die Belege so mit, wie der Kunde sie bekam — lesbar
 * ohne Senklot.
 *
 * ES ENTSTEHT NICHTS NEUES. Jedes PDF wird aus dem gespeicherten Dokument
 * gedruckt (`druckAngaben`, dieselbe Stelle wie „PDF erneut laden“). Eine
 * stornierte Rechnung ohne ausgestellte Stornorechnung bekommt hier keine:
 * deren Nummer vergibt nur das Ausstellen, nicht ein Export. Was fehlt, steht
 * in „Hinweise.txt“, nicht verschwiegen.
 */

export interface ArchivErgebnis {
  blob: Blob;
  rechnungen: number;
  stornos: number;
  /** Was im Archiv fehlt oder auffällt — auch in „Hinweise.txt“. */
  hinweise: string[];
}

/** Keine Zeichen, die ein Dateisystem als Ordner oder Laufwerk liest. */
function dateiname(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ohne-Nummer';
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** Die Bytes eines Blobs — über `FileReader`, den jeder Browser kennt, auch ältere Safari. */
function bytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(new Uint8Array(leser.result as ArrayBuffer));
    leser.onerror = () => fehler(leser.error);
    leser.readAsArrayBuffer(blob);
  });
}

export async function belegArchiv(o: {
  company: Company;
  rechnungen: Invoice[];
  kunden: Customer[];
  von: string;
  bis: string;
  /** Für die Anzeige „120 von 800“ — die Erzeugung dauert bei vielen Belegen. */
  fortschritt?: (fertig: number, gesamt: number) => void;
}): Promise<ArchivErgebnis> {
  const { company, von, bis } = o;
  const [{ generateInvoicePdf }, { buildStornoPdf }] = await Promise.all([
    import('./pdf'),
    import('./stornoPdf'),
  ]);

  const imZeitraum = o.rechnungen
    .filter((i) => i.invoiceDate >= von && i.invoiceDate <= bis)
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));
  /*
    DIE STORNORECHNUNG GEHÖRT IN DEN ZEITRAUM IHRES STORNOS — wie die
    Gegenzeile im Journal und wie `listInvoicesInRange` sie findet. Nach dem
    Tag ihrer Ausstellung sortiert, fiele eine spät ausgestellte in keinen
    Zeitraum, der sie auch lädt.
  */
  const stornoTagVon = (i: Invoice) => {
    const t = i.cancelledAt ?? i.stornoAm;
    return t != null ? stornoTag(t) : null;
  };
  const storniert = o.rechnungen
    .filter((i) => i.paymentStatus === 'Storniert')
    .filter((i) => {
      const t = stornoTagVon(i);
      return t != null && t >= von && t <= bis;
    })
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));

  const dateien: ZipDatei[] = [];
  const hinweise: string[] = [];
  const gesamt = imZeitraum.length + storniert.length;
  let fertig = 0;
  const weiter = async () => {
    fertig += 1;
    o.fortschritt?.(fertig, gesamt);
    // Die Seite bleibt bedienbar und die Anzeige läuft mit.
    if (fertig % 5 === 0) await pause();
  };

  let rechnungen = 0;
  for (const inv of imZeitraum) {
    if (inv.positions?.length) {
      const doc = generateInvoicePdf(druckAngaben(company, inv));
      dateien.push({
        name: `Rechnungen/${dateiname(inv.invoiceNumber)}.pdf`,
        inhalt: new Uint8Array(doc.output('arraybuffer')),
      });
      rechnungen += 1;
    } else {
      hinweise.push(`${inv.invoiceNumber}: keine Positionen gespeichert, daher kein PDF. Die Zeile steht im Rechnungsausgangsbuch.`);
    }
    await weiter();
  }

  let stornos = 0;
  for (const inv of storniert) {
    if (inv.stornoNummer) {
      const blob = await buildStornoPdf({ company, invoice: inv, nummer: inv.stornoNummer });
      dateien.push({
        name: `Stornorechnungen/${dateiname(stornoDateiname(inv.stornoNummer))}`,
        inhalt: await bytes(blob),
      });
      stornos += 1;
    } else {
      hinweise.push(`${inv.invoiceNumber}: storniert, aber keine Stornorechnung ausgestellt. Der Storno steht im Rechnungsausgangsbuch.`);
    }
    await weiter();
  }

  const journal = buildInvoiceCsv(o.rechnungen, o.kunden, von, bis);
  if (journal.luecken.length) {
    hinweise.unshift(`Fehlende Nummern im Nummernkreis: ${journal.luecken.join(', ')}.`);
  }
  // Mit BOM wie beim Herunterladen im Bereich Rechnungen — sonst zeigt Excel Umlaute falsch.
  dateien.push({
    name: invoiceCsvFilename(von, bis),
    inhalt: new TextEncoder().encode(`\uFEFF${journal.csv}`),
  });

  const text = [
    `Belegarchiv ${company.name}`,
    `Zeitraum: ${datumAT(von)} bis ${datumAT(bis)}`,
    `Erstellt: ${datumAT(todayStr())}`,
    '',
    `Rechnungen als PDF: ${rechnungen}`,
    `Stornorechnungen als PDF: ${stornos}`,
    `Rechnungsausgangsbuch: ${invoiceCsvFilename(von, bis)}`,
    '',
    'Mahnungen, Angebote, Arbeitsscheine und alle übrigen Daten enthält die Datei',
    'aus „Alle Daten herunterladen“ (Datensicherung).',
    '',
    hinweise.length ? 'Hinweise:' : 'Hinweise: keine.',
    ...hinweise.map((h) => `- ${h}`),
    '',
  ].join('\r\n');
  dateien.push({ name: 'Hinweise.txt', inhalt: new TextEncoder().encode(`\uFEFF${text}`) });

  return { blob: zipErstellen(dateien), rechnungen, stornos, hinweise };
}
