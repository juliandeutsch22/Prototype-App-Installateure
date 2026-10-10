import type { Company, Customer, Invoice, Quote, WorkSheet } from '@/types';
import type { GemahnteRechnung } from '@/lib/db/invoices';
import { csvZelle } from '@/lib/csvZelle';
import { buildInvoiceCsv, invoiceCsvFilename } from './buchhaltungExport';
import { druckAngaben } from './nachdruck';
import { stornoDateiname } from './stornoPdf';
import { stornoBelegTag } from './stornoBelegTag';
import { zipErstellen, type ZipDatei } from '@/lib/zip';
import { datumAT } from '@/lib/datum';
import { todayStr } from '@/lib/time';

/**
 * Das Belegarchiv: alle Rechnungen und Stornorechnungen eines Zeitraums als
 * PDF, dazu das Rechnungsausgangsbuch als CSV — in einer ZIP-Datei
 * (Stand-Datei 11.1, Punkt 6). Seit 10.10.2026 auch die Angebote und die
 * unterschriebenen Handwerksscheine als PDF und die Mahnungen als Liste.
 *
 * MAHNUNGEN ALS LISTE, NICHT ALS PDF. Gespeichert ist je Rechnung nur die
 * LETZTE Mahnung: Stufe, Tag, Frist und die ausgewiesenen Spesen. Ein PDF
 * daraus neu zu drucken, nähme Verzugszinsen und Mahnkosten von heute — ein
 * Schreiben, das so nie hinausging. Die Liste hält fest, was gespeichert
 * ist; frühere Stufen kennt die App nicht.
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
  angebote: number;
  scheine: number;
  mahnungen: number;
  /** Was im Archiv fehlt oder auffällt — auch in „Hinweise.txt“. */
  hinweise: string[];
}

/** Keine Zeichen, die ein Dateisystem als Ordner oder Laufwerk liest. */
function dateiname(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ohne-Nummer';
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** So viele ganze Scheine (mit Unterschriftsbildern) werden auf einmal geholt. */
export const SCHEIN_BLOCK = 25;

export const MAHNUNGEN_CSV = 'Mahnungen.csv';

const STUFE = ['', 'Zahlungserinnerung', 'Mahnung', 'Letzte Mahnung'];

/** Die gespeicherte letzte Mahnung je Rechnung — eine Zeile je Rechnung. */
export function mahnungenCsv(gemahnt: GemahnteRechnung[]): string {
  const betrag = (n: number | undefined) => (n == null ? '' : n.toFixed(2).replace('.', ','));
  const kopf = ['Rechnung', 'Kunde', 'Baustelle', 'Rechnungsbetrag brutto', 'Letzte Stufe', 'Gemahnt am', 'Neue Frist', 'Ausgewiesene Spesen', 'Zahlstand'];
  const zeilen = gemahnt.map((g) => [
    g.invoiceNumber,
    g.customerName,
    g.projectNumber ?? '',
    betrag(g.totalBrutto),
    STUFE[g.mahnstufe ?? 0] ?? String(g.mahnstufe),
    g.gemahntAm ? datumAT(g.gemahntAm) : '',
    g.mahnfrist ? datumAT(g.mahnfrist) : '',
    betrag(g.mahnspesen),
    g.paymentStatus,
  ]);
  return [kopf, ...zeilen].map((z) => z.map(csvZelle).join(';')).join('\r\n');
}

/**
 * Der Tag des ersten Belegs — für „Alle Belege“ (Runde 3, G11). Vorher stand
 * dort der 01.01.2000, in den Hinweisen und im Dateinamen; ein Betrieb, der
 * 2026 begonnen hat, las von Belegen aus 26 Jahren. Ohne Beleg: `bis`.
 */
export function ersterBelegTag(rechnungen: Invoice[], bis: string, weitere: string[] = []): string {
  let erster = bis;
  // Angebote und Scheine (seit 10.10.2026) — ein Angebot kann vor der ersten Rechnung liegen.
  for (const t of weitere) if (t && t < erster) erster = t;
  for (const r of rechnungen) {
    if (r.invoiceDate && r.invoiceDate < erster) erster = r.invoiceDate;
    const s = r.paymentStatus === 'Storniert' ? stornoBelegTag(r) : null;
    if (s && s < erster) erster = s;
  }
  return erster;
}

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
  /** Die Angebote des Zeitraums (nach Angebotsdatum); Entwürfe gehen nicht ins Archiv. */
  angebote?: Quote[];
  /** Unterschriebene und stornierte Scheine des Zeitraums — ohne Bilder genügt. */
  scheine?: Pick<WorkSheet, 'id' | 'datum' | 'projectNumber' | 'status'>[];
  /** Holt ganze Scheine samt Unterschriftsbildern, in kleinen Blöcken. */
  scheineVoll?: (ids: string[]) => Promise<WorkSheet[]>;
  /** Rechnungen mit ihrer letzten Mahnung im Zeitraum. */
  gemahnt?: GemahnteRechnung[];
  /** Für die Anzeige „120 von 800“ — die Erzeugung dauert bei vielen Belegen. */
  fortschritt?: (fertig: number, gesamt: number) => void;
}): Promise<ArchivErgebnis> {
  const { company, von, bis } = o;
  const [{ generateInvoicePdf }, { buildStornoPdf }, { buildAngebotPdf, angebotDateiname }, { buildWorkSheetPdf }] = await Promise.all([
    import('./pdf'),
    import('./stornoPdf'),
    import('@/features/quotes/angebotPdf'),
    import('@/features/worksheets/worksheetPdf'),
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
  // Runde 3, M7: dasselbe Belegdatum wie Liste, PDF, Ausgangsbuch und BMD-Stapel.
  const stornoTagVon = (i: Invoice) => stornoBelegTag(i);
  const storniert = o.rechnungen
    .filter((i) => i.paymentStatus === 'Storniert')
    .filter((i) => {
      const t = stornoTagVon(i);
      return t != null && t >= von && t <= bis;
    })
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));

  const angebote = (o.angebote ?? [])
    .filter((q) => q.quoteDate >= von && q.quoteDate <= bis)
    .sort((a, b) => a.quoteNumber.localeCompare(b.quoteNumber, 'de'));
  const entwuerfe = angebote.filter((q) => q.status === 'Entwurf').length;
  const versandt = angebote.filter((q) => q.status !== 'Entwurf');
  const scheine = (o.scheine ?? [])
    .filter((w) => (w.status === 'Unterschrieben' || w.status === 'Storniert') && w.datum >= von && w.datum <= bis)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.id.localeCompare(b.id));

  const dateien: ZipDatei[] = [];
  const hinweise: string[] = [];
  const gesamt = imZeitraum.length + storniert.length + versandt.length + (o.scheineVoll ? scheine.length : 0);
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

  const kundeVon = new Map(o.kunden.map((k) => [k.id, k]));
  let angeboteZahl = 0;
  for (const q of versandt) {
    const doc = await buildAngebotPdf({ company, quote: q, kunde: q.customerId ? kundeVon.get(q.customerId) ?? null : null });
    dateien.push({
      name: `Angebote/${dateiname(angebotDateiname(q).replace(/\.pdf$/, ''))}.pdf`,
      inhalt: new Uint8Array(doc.output('arraybuffer')),
    });
    angeboteZahl += 1;
    await weiter();
  }
  if (entwuerfe > 0) {
    hinweise.push(`${entwuerfe} ${entwuerfe === 1 ? 'Angebot ist ein Entwurf' : 'Angebote sind Entwürfe'} und nie hinausgegangen — nicht im Archiv.`);
  }

  /*
    DIE SCHEINE BLOCKWEISE. Erst die Liste ohne Bilder, dann je 25 ganze
    Scheine: ein Archiv über Jahre hielte sonst Tausende Unterschriftsbilder
    gleichzeitig im Speicher, bevor das erste PDF entsteht.
  */
  let scheineZahl = 0;
  if (o.scheineVoll) {
    for (let i = 0; i < scheine.length; i += SCHEIN_BLOCK) {
      const block = scheine.slice(i, i + SCHEIN_BLOCK);
      const voll = new Map((await o.scheineVoll(block.map((w) => w.id))).map((w) => [w.id, w]));
      for (const kopf of block) {
        const w = voll.get(kopf.id);
        if (!w) {
          hinweise.push(`Schein vom ${datumAT(kopf.datum)} (Baustelle ${kopf.projectNumber}): nicht mehr lesbar, daher kein PDF.`);
        } else {
          const blob = await buildWorkSheetPdf(w, {
            name: company.name, addressLine: company.addressLine, contactLine: company.contactLine, logoUrl: company.logoUrl,
          });
          dateien.push({
            name: `Handwerksscheine/${dateiname(`${w.projectNumber}_${w.datum}_${w.id.slice(0, 8)}`)}.pdf`,
            inhalt: await bytes(blob),
          });
          scheineZahl += 1;
        }
        await weiter();
      }
    }
  }

  const gemahnt = (o.gemahnt ?? [])
    .filter((g) => (g.mahnstufe ?? 0) > 0 && g.gemahntAm && g.gemahntAm >= von && g.gemahntAm <= bis)
    .sort((a, b) => (a.gemahntAm ?? '').localeCompare(b.gemahntAm ?? '') || a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));
  if (gemahnt.length > 0) {
    dateien.push({ name: MAHNUNGEN_CSV, inhalt: new TextEncoder().encode(`\uFEFF${mahnungenCsv(gemahnt)}`) });
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
    `Angebote als PDF: ${angeboteZahl}`,
    `Handwerksscheine als PDF (unterschrieben oder storniert): ${scheineZahl}`,
    `Mahnungen: ${gemahnt.length ? `${gemahnt.length} in ${MAHNUNGEN_CSV}` : 'keine'}`,
    '',
    'Von einer Mahnung speichert Senklot die letzte Stufe mit Tag, Frist und',
    'Spesen — so steht sie in der Liste. Das Schreiben selbst und frühere Stufen',
    'sind nicht gespeichert.',
    'Alle übrigen Daten enthält die Datei aus „Alle Daten herunterladen“',
    '(Datensicherung).',
    '',
    hinweise.length ? 'Hinweise:' : 'Hinweise: keine.',
    ...hinweise.map((h) => `- ${h}`),
    '',
  ].join('\r\n');
  dateien.push({ name: 'Hinweise.txt', inhalt: new TextEncoder().encode(`\uFEFF${text}`) });

  return {
    blob: zipErstellen(dateien), rechnungen, stornos,
    angebote: angeboteZahl, scheine: scheineZahl, mahnungen: gemahnt.length, hinweise,
  };
}
