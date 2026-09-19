import jsPDF from 'jspdf';
import { firmenZeilen, logoZeichnen } from '@/lib/pdfBriefkopf';
import autoTable from 'jspdf-autotable';
import { discountLabel } from './totals';
import { RC_HINWEIS } from './reverseCharge';

/**
 * '2026-09-14' -> '14.09.2026'.
 *
 * Auf einem Dokument, das der Kunde in die Hand bekommt, hat das
 * ISO-Datum nichts verloren — es liest sich wie ein Systemauszug.
 */
function fmtDatum(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
import type { Company, Project, RechnungsArt, Vorrechnung } from '@/types';
import { INVOICE_DEFAULTS, type AssembledInvoice } from './assemble';
import { mitAbzug } from './vorrechnungen';
import { calcWorkMin } from '@/lib/time';

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Minuten als Dezimalstunden mit Komma ("7,50"). */
const fmtHours = (min: number) => (min / 60).toFixed(2).replace('.', ',');

/** 'YYYY-MM-DD' -> '27.08.2026'. */
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * DIE ÜBERSCHRIFT SAGT, WAS DER BELEG IST.
 *
 * „Rechnung" über einer Anzahlung ist nicht bloss ungenau: der Kunde muss
 * erkennen können, dass die Leistung noch aussteht — und bei der
 * Schlussrechnung, dass hier abgerechnet und nicht ein zweites Mal gefordert
 * wird.
 */
export const UEBERSCHRIFT: Record<RechnungsArt, string> = {
  einzel: 'Rechnung',
  anzahlung: 'Anzahlungsrechnung',
  teil: 'Teilrechnung',
  schluss: 'Schlussrechnung',
};

/**
 * Die Summenzeilen unter der Positionstabelle.
 *
 * EIGENE FUNKTION, WEIL HIER DIE STEUER ENTSCHEIDET. Was unter der Tabelle
 * steht, ist der Teil des Belegs, den das Finanzamt liest; `jspdf-autotable`
 * lässt sich im Testlauf nicht zeichnen, diese Zeilen aber schon.
 */
export function summenZeilen(opts: {
  assembled: AssembledInvoice;
  vatRate: number;
  /** Bauleistung mit Übergang der Steuerschuld. */
  rc: boolean;
  abzuege: Vorrechnung[];
  /** Was nach Abzug übrig bleibt. */
  forderung: number;
}): string[][] {
  const { assembled, vatRate, rc, abzuege, forderung } = opts;
  return [
    // Ein Rabatt gehoert auf die Rechnung, nicht in einen stillschweigend
    // gekuerzten Nettobetrag: der Kunde muss sehen, was ihm nachgelassen
    // wurde, und das Finanzamt, worauf die Steuer bemessen ist.
    ...(assembled.discountAmount > 0 && assembled.discount
      ? [
          ['', '', '', 'Zwischensumme', fmtEUR(assembled.subtotalNetto)],
          ['', '', '', discountLabel(assembled.discount), `- ${fmtEUR(assembled.discountAmount)}`],
        ]
      : []),
    ['', '', '', 'Netto', fmtEUR(assembled.totalNetto)],
    /*
      BEI REVERSE CHARGE STEHT KEINE STEUER DA — auch keine „USt. 0 %".

      Eine ausgewiesene Steuer schuldet der Betrieb kraft Rechnungslegung,
      bis er berichtigt (§ 11 Abs 12 UStG). „0 %" ist ein Steuersatz und
      etwas anderes als ein Übergang der Steuerschuld; die Zeile bekommt
      deshalb den Grund statt einer Zahl.
    */
    ...(rc
      ? [['', '', '', 'Umsatzsteuer', 'Übergang der Steuerschuld']]
      : [['', '', '', `USt. ${Math.round(vatRate * 100)}%`, fmtEUR(assembled.totalVat)]]),
    [
      '',
      '',
      '',
      // Wo abgezogen wird, ist diese Zeile nicht der Rechnungsbetrag,
      // sondern die volle Leistung — die Beschriftung muss das sagen.
      abzuege.length > 0 ? 'Gesamtleistung brutto' : rc ? 'Rechnungsbetrag' : 'Brutto',
      fmtEUR(assembled.totalBrutto),
    ],
    /*
      JEDE ABGEZOGENE VORRECHNUNG EINZELN, MIT IHRER STEUER.

      § 11 Abs 12 UStG: wer eine Steuer ausweist, schuldet sie. Die Steuer der
      Anzahlung ist bereits auf deren Beleg ausgewiesen und abgeführt; sie hier
      nicht wieder herauszurechnen hiesse, sie zweimal zu schulden, bis der
      Betrieb berichtigt. Der Kunde wiederum darf die Vorsteuer nur einmal
      ziehen und braucht dafür genau diese Zeile.
    */
    ...abzuege.map((v) => [
      `abzüglich ${v.invoiceNumber} vom ${fmtDatum(v.invoiceDate)}`,
      '',
      '',
      rc ? 'netto' : `netto ${fmtEUR(v.netto)} + USt ${fmtEUR(v.vat)}`,
      `- ${fmtEUR(v.brutto)}`,
    ]),
    ...(abzuege.length > 0 ? [['', '', '', 'Restforderung brutto', fmtEUR(forderung)]] : []),
  ];
}

/**
 * Erzeugt das Rechnungs-PDF (jsPDF + autotable, docs §4.5). Kopf-/Bankdaten
 * stammen aus dem companies-Dokument (ersetzen die hartkodierten Perl-Werte).
 */
export function generateInvoicePdf(opts: {
  company: Company;
  project: Pick<Project, 'customerName' | 'address' | 'projectNumber'>;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  assembled: AssembledInvoice;
  appendDetail?: boolean;
  vatRate?: number;
  /** Bauleistung mit Übergang der Steuerschuld (§ 19 Abs 1a UStG). */
  reverseCharge?: boolean;
  /** UID des Leistungsempfängers — bei Reverse Charge Pflicht. */
  customerVatId?: string;
  /** Einzel-, Anzahlungs-, Teil- oder Schlussrechnung. Ohne Angabe: einzel. */
  art?: RechnungsArt;
  /**
   * Die abgezogenen Vorrechnungen.
   *
   * `assembled` trägt weiterhin die GESAMTE Leistung — die Forderung dieses
   * Belegs rechnet dieses PDF daraus selbst aus. Der Aufrufer kann die beiden
   * Zahlen damit nicht auseinanderlaufen lassen.
   */
  vorrechnungen?: Vorrechnung[];
}) {
  const { company, project, invoiceNumber, invoiceDate, dueDate, assembled } = opts;
  const vatRate = opts.vatRate ?? INVOICE_DEFAULTS.vatRate;
  const leistungVon = assembled.leistung?.von;
  const leistungBis = assembled.leistung?.bis;
  const rc = !!opts.reverseCharge;
  const art = opts.art ?? 'einzel';
  const abzuege = opts.vorrechnungen ?? [];
  /*
    DIE SUMMEN DES BELEGS ENTSTEHEN HIER, aus der vollen Leistung und den
    Abzügen. `assembled` bleibt die volle Leistung; was gefordert wird, ist
    der Rest. Beides aus einer Hand, damit auf dem Beleg nicht zwei Zahlen
    stehen, die sich widersprechen.
  */
  const summen = mitAbzug(
    { totalNetto: assembled.totalNetto, totalVat: assembled.totalVat, totalBrutto: assembled.totalBrutto },
    abzuege,
  );
  const forderung = summen.totalBrutto;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;

  // Briefkopf
  /*
    Das Logo oben RECHTS: dort ist der Kopf frei — der Empfängerblock
    beginnt erst bei y = 50. Der Text darunter bleibt damit unverändert
    stehen, und ohne Logo sieht die Rechnung aus wie bisher.
  */
  logoZeichnen(doc, company, 210 - margin, 18);
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text(company.name || 'Firma', margin, 22);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  firmenZeilen(company).forEach((z, i) => doc.text(z, margin, 28 + i * 5));
  doc.setDrawColor(0, 51, 102).line(margin, 37, 210 - margin, 37);

  // Empfänger + Rechnungsdaten
  doc.setFontSize(11).setFont('helvetica', 'bold').text(UEBERSCHRIFT[art], margin, 50);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(project.customerName || '–', margin, 58);
  if (project.address) doc.text(project.address, margin, 63);
  /*
    DIE UID DES EMPFÄNGERS gehört zum Empfängerblock, nicht in die Fusszeile.

    Bei Reverse Charge ist sie Pflicht — ohne sie ist der Übergang der
    Steuerschuld nicht belegt, und der Empfänger kann seine eigene
    Steuerschuld damit nicht zuordnen. Sie steht deshalb dort, wo er selbst
    steht.
  */
  if (opts.customerVatId?.trim()) {
    doc.text(`UID: ${opts.customerVatId.trim()}`, margin, project.address ? 68 : 63);
  }

  const rightX = 210 - margin;
  doc.text(`Rechnungsnummer: ${invoiceNumber}`, rightX, 50, { align: 'right' });
  doc.text(`Rechnungsdatum: ${fmtDatum(invoiceDate)}`, rightX, 55, { align: 'right' });
  doc.text(`Zahlungsziel: ${fmtDatum(dueDate)}`, rightX, 60, { align: 'right' });
  doc.text(`Baustelle: ${project.projectNumber}`, rightX, 65, { align: 'right' });

  /*
    DER LEISTUNGSZEITRAUM — Pflichtangabe nach § 11 Abs 1 Z 4 UStG.

    Er fehlte auf jeder bisher geschriebenen Rechnung. Ohne ihn ist der Beleg
    formal unvollständig, und beim Kunden wackelt der Vorsteuerabzug: er kann
    nicht belegen, in welchen Zeitraum die Leistung fällt.

    EIN TAG HEISST „LEISTUNGSDATUM", nicht „Zeitraum vom 4. bis 4." — das ist
    keine Kosmetik, sondern genau die Unterscheidung, die das Gesetz trifft
    („der Tag ... oder der Zeitraum").

    Die Zeile steht UNTER dem bisherigen Block und verschiebt nichts: die
    Positionstabelle beginnt weiterhin bei y = 72, dazwischen war Platz.
  */
  if (leistungVon && leistungBis) {
    const text =
      leistungVon === leistungBis
        ? `Leistungsdatum: ${fmtDatum(leistungVon)}`
        : `Leistungszeitraum: ${fmtDatum(leistungVon)} – ${fmtDatum(leistungBis)}`;
    doc.text(text, rightX, 70, { align: 'right' });
  } else if (art === 'anzahlung') {
    /*
      BEI EINER ANZAHLUNG GIBT ES NOCH KEINEN ZEITRAUM — und einen zu
      erfinden wäre gegenüber dem Finanzamt falsch. Stattdessen steht da,
      worauf die Zahlung geht; sonst liest sich der Beleg wie eine Rechnung
      über eine Leistung, die niemand erbracht hat.
    */
    doc.text('Anzahlung auf eine noch zu erbringende Leistung', rightX, 70, { align: 'right' });
  }

  // Positionstabelle
  autoTable(doc, {
    startY: 72,
    head: [['Position', 'Menge', 'Einheit', 'EP €', 'Netto €']],
    body: assembled.positions.map((p) => [
      p.label,
      String(p.qty),
      p.unit,
      fmtEUR(p.unitPrice),
      fmtEUR(p.netto),
    ]),
    foot: summenZeilen({ assembled, vatRate, rc, abzuege, forderung }),

    headStyles: { fillColor: [0, 51, 102] },
    footStyles: { fontStyle: 'bold' },
    theme: 'grid',
  });

  // Zahlungshinweis + Bankdaten
  // @ts-expect-error lastAutoTable wird von autotable ergänzt
  let y = (doc.lastAutoTable?.finalY ?? 120) + 12;
  doc.setFontSize(9);
  // Betrag und Frist gehören in den Überweisungssatz — sonst muss der Kunde
  // sie sich aus der Tabelle zusammensuchen.
  doc.text(
    // DER REST, nicht die Gesamtleistung: was schon bezahlt ist, wird nicht
    // noch einmal eingefordert.
    `Bitte überweisen Sie ${fmtEUR(forderung)} € bis ${fmtDatum(dueDate)}` +
      (company.iban ? ` auf IBAN ${company.iban}${company.bic ? ` / BIC ${company.bic}` : ''}` : '') +
      '.',
    margin,
    y,
  );
  doc.text(`Verwendungszweck: ${invoiceNumber} / ${project.projectNumber}`, margin, (y += 5));

  /*
    DER PFLICHTSATZ — § 11 Abs 1a UStG verlangt ihn im Wortlaut.

    Er steht unter dem Zahlungshinweis und nicht in der Fusszeile: die
    Fusszeile ist Kleingedrucktes, das man überliest. Dies hier ist der Grund,
    warum auf der Rechnung keine Steuer steht, und der gehört dorthin, wo der
    Kunde nach dem Betrag sucht.
  */
  if (rc) {
    doc.setFont('helvetica', 'bold');
    doc.text(RC_HINWEIS, margin, (y += 8), { maxWidth: 210 - 2 * margin });
    doc.setFont('helvetica', 'normal');
  }

  // Fußzeile mit den Pflichtangaben, unten auf der Rechnungsseite.
  const footer = [company.vatId && `UID: ${company.vatId}`, company.companyRegister]
    .filter(Boolean)
    .join(' · ');
  if (footer) {
    doc.setFontSize(8).setTextColor(120);
    doc.text(footer, margin, 285);
    doc.setTextColor(0, 0, 0);
  }

  // Optionaler Leistungsnachweis (Seite 2)
  if (opts.appendDetail && assembled.entries.length) {
    doc.addPage();
    doc.setFontSize(12).setFont('helvetica', 'bold').text('Leistungsnachweis', margin, 22);
    const detail = [...assembled.entries].sort((a, b) => a.date.localeCompare(b.date));
    const totalMin = detail.reduce((s, e) => s + calcWorkMin(e), 0);
    autoTable(doc, {
      startY: 28,
      // Ohne die Stundenspalte ist ein Leistungsnachweis als Beleg wertlos —
      // der Kunde kann die Rechnungssumme sonst nicht nachvollziehen.
      head: [['Datum', 'Mitarbeiter', 'Typ', 'Tätigkeit / Notiz', 'Std.']],
      body: detail.map((e) => [
        fmtDate(e.date),
        e.userName ?? '',
        e.isHelper ? 'Helfer' : 'Fachkraft',
        (e.comment ?? '').slice(0, 60),
        fmtHours(calcWorkMin(e)),
      ]),
      foot: [['', '', '', 'Summe', fmtHours(totalMin)]],
      headStyles: { fillColor: [0, 51, 102] },
      footStyles: { fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right', cellWidth: 18 } },
      theme: 'grid',
    });
  }

  // Das Dokument wird zurückgegeben statt sofort gespeichert: nur so lässt
  // sich dieselbe Rechnung später erneut erzeugen und verschicken.
  return doc;
}

/** Erzeugt das PDF und startet den Download. */
export function downloadInvoicePdf(opts: Parameters<typeof generateInvoicePdf>[0]) {
  generateInvoicePdf(opts).save(`${opts.invoiceNumber}.pdf`);
}
