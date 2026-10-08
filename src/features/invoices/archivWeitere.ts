import type { Company, Customer, Invoice, Quote, WorkSheet } from '@/types';
import type { Mahnbeleg } from '@/lib/db/mahnbelege';
import type { ZipDatei } from '@/lib/zip';
import { bytesAusBase64, pdfBytes } from '@/lib/pdfBytes';

export interface WeitereBelege {
  angebote?: Quote[];
  scheine?: WorkSheet[];
  mahnbelege?: Mahnbeleg[];
  mahnstufen?: Pick<Mahnbeleg, 'invoiceNumber' | 'stufe'>[];
}

const dateiname = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ohne-Kennung';

export function weitereAuswahl(o: WeitereBelege & { von: string; bis: string }) {
  const imZeitraum = (tag: string) => tag >= o.von && tag <= o.bis;
  return {
    angebote: (o.angebote ?? []).filter((q) => imZeitraum(q.quoteDate)),
    scheine: (o.scheine ?? []).filter((s) => imZeitraum(s.datum) && ['Unterschrieben', 'Storniert'].includes(s.status)),
    mahnbelege: (o.mahnbelege ?? []).filter((m) => imZeitraum(m.datum)),
  };
}

export async function weitereBelegeErstellen(o: {
  company: Company; kunden: Customer[]; auswahl: ReturnType<typeof weitereAuswahl>;
  dateien: ZipDatei[]; weiter: () => Promise<void>;
}) {
  const kunden = new Map(o.kunden.map((k) => [k.id, k]));
  if (o.auswahl.angebote.length) {
    const { buildAngebotPdf, angebotDateiname } = await import('@/features/quotes/angebotPdf');
    for (const q of o.auswahl.angebote) {
      const pdf = await buildAngebotPdf({ company: o.company, quote: q, kunde: q.customerId ? kunden.get(q.customerId) : null });
      o.dateien.push({ name: `Angebote/${dateiname(angebotDateiname(q))}`, inhalt: new Uint8Array(pdf.output('arraybuffer')) });
      await o.weiter();
    }
  }
  if (o.auswahl.scheine.length) {
    const { buildWorkSheetPdf } = await import('@/features/worksheets/worksheetPdf');
    for (const s of o.auswahl.scheine) {
      o.dateien.push({ name: `Scheine/Handwerksschein_${dateiname(s.id)}.pdf`, inhalt: await pdfBytes(await buildWorkSheetPdf(s, o.company)) });
      await o.weiter();
    }
  }
  for (const m of o.auswahl.mahnbelege) {
    o.dateien.push({ name: `Mahnungen/${dateiname(m.invoiceNumber)}_Stufe-${m.stufe}_${m.datum}.pdf`, inhalt: bytesAusBase64(m.pdfBase64) });
    await o.weiter();
  }
}

/** Keine Rekonstruktion: Zahlung, Anschrift und Zinssätze können sich seitdem geändert haben. */
export function fehlendeMahnungen(o: WeitereBelege & { rechnungen: Invoice[]; von: string; bis: string }) {
  const gespeichert = new Set((o.mahnstufen ?? o.mahnbelege ?? []).map((m) => `${m.invoiceNumber}:${m.stufe}`));
  return o.rechnungen.filter((i) => i.gemahntAm && i.gemahntAm >= o.von && i.gemahntAm <= o.bis)
    .flatMap((i) => Array.from({ length: Math.min(i.mahnstufe ?? 0, 3) }, (_, n) => n + 1)
      .filter((stufe) => !gespeichert.has(`${i.invoiceNumber}:${stufe}`))
      .map((stufe) => `${i.invoiceNumber}: Originalmahnung Stufe ${stufe} wurde nicht gespeichert und kann nicht unverändert rekonstruiert werden.`));
}
