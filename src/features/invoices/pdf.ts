import jsPDF from 'jspdf';
import {
  briefkopf,
  empfaenger,
  fmtMenge,
  fusszeilen,
  GRAU,
  kopfdaten,
  platzFuer,
  RAND,
  RECHTS,
  TABELLE_AB,
  TABELLENSTIL,
  TINTE,
  titel,
} from '@/lib/belegLayout';
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

  briefkopf(doc, company);
  empfaenger(doc, company, {
    name: project.customerName,
    adresse: project.address,
    /*
      DIE UID DES EMPFÄNGERS gehört zum Empfängerblock, nicht in die Fusszeile.
      Bei Reverse Charge ist sie Pflicht — ohne sie ist der Übergang der
      Steuerschuld nicht belegt.
    */
    uid: opts.customerVatId,
  });

  /*
    DER LEISTUNGSZEITRAUM — Pflichtangabe nach § 11 Abs 1 Z 4 UStG. Ohne ihn
    wackelt beim Kunden der Vorsteuerabzug.

    EIN TAG HEISST „LEISTUNGSDATUM", nicht „Zeitraum vom 4. bis 4." — das ist
    genau die Unterscheidung, die das Gesetz trifft („der Tag ... oder der
    Zeitraum"). Fehlt er, steht die Zeile nicht da: eine erfundene Angabe wäre
    gegenüber dem Finanzamt falsch.
  */
  const kopf: [string, string][] = [
    ['Rechnungsnummer', invoiceNumber],
    ['Rechnungsdatum', fmtDatum(invoiceDate)],
    ['Zahlungsziel', fmtDatum(dueDate)],
    ['Baustelle', project.projectNumber],
  ];
  if (leistungVon && leistungBis) {
    kopf.push(
      leistungVon === leistungBis
        ? ['Leistungsdatum', fmtDatum(leistungVon)]
        : ['Leistungszeitraum', `${fmtDatum(leistungVon)} – ${fmtDatum(leistungBis)}`],
    );
  }
  kopfdaten(doc, kopf);

  titel(doc, UEBERSCHRIFT[art]);
  if (!(leistungVon && leistungBis) && art === 'anzahlung') {
    /*
      BEI EINER ANZAHLUNG GIBT ES NOCH KEINEN ZEITRAUM — und einen zu
      erfinden wäre gegenüber dem Finanzamt falsch. Stattdessen steht da,
      worauf die Zahlung geht; sonst liest sich der Beleg wie eine Rechnung
      über eine Leistung, die niemand erbracht hat.
    */
    doc.setFontSize(9).setTextColor(...GRAU);
    doc.text('Anzahlung auf eine noch zu erbringende Leistung', RAND, 97);
    doc.setTextColor(...TINTE);
  }

  // Positionstabelle
  const fuss = summenZeilen({ assembled, vatRate, rc, abzuege, forderung });
  /** Die Zeile, die der Kunde zahlt — sie trägt den Strich darüber und Fettschrift. */
  const endsumme = fuss.length - 1;
  autoTable(doc, {
    ...TABELLENSTIL,
    startY: TABELLE_AB + 3,
    head: [['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis €', 'Netto €']],
    body: assembled.positions.map((p) => [
      p.label,
      fmtMenge(p.qty),
      p.unit,
      fmtEUR(p.unitPrice),
      fmtEUR(p.netto),
    ]),
    foot: fuss,
    columnStyles: {
      1: { halign: 'right', cellWidth: 17 },
      2: { cellWidth: 17 },
      3: { halign: 'right', cellWidth: 27 },
      4: { halign: 'right', cellWidth: 27 },
    },
    didParseCell: (d) => {
      // Die Kopfzeile folgt der Ausrichtung ihrer Spalte, sonst stehen die
      // Beträge rechts und ihre Überschrift links darüber.
      if (d.section === 'head' && d.column.index !== 0 && d.column.index !== 2) {
        d.cell.styles.halign = 'right';
      }
      if (d.section !== 'foot') return;
      if (d.column.index >= 3) d.cell.styles.halign = 'right';
      /*
        Die Beschriftung einer Summenzeile („netto 1 000,00 + USt 200,00")
        darf über die leeren Spalten links von ihr hinausreichen, statt in
        ihrer schmalen Spalte umzubrechen.
      */
      if (d.column.index === 3) d.cell.styles.overflow = 'visible';
      if (d.row.index === 0) d.cell.styles.lineWidth = { top: 0.35 };
      if (d.row.index === endsumme) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 10;
        if (d.column.index >= 3) d.cell.styles.lineWidth = { top: 0.35 };
      }
    },
  });

  // Zahlungshinweis + Bankdaten
  // @ts-expect-error lastAutoTable wird von autotable ergänzt
  let y = (doc.lastAutoTable?.finalY ?? 120) + 12;
  const breite = RECHTS - RAND;
  doc.setFontSize(9.5).setFont('helvetica', 'normal').setTextColor(...TINTE);
  const zahlung = doc.splitTextToSize(
    // Betrag und Frist gehören in den Überweisungssatz — sonst muss der Kunde
    // sie sich aus der Tabelle zusammensuchen. DER REST, nicht die
    // Gesamtleistung: was schon bezahlt ist, wird nicht noch einmal gefordert.
    `Bitte überweisen Sie ${fmtEUR(forderung)} € bis ${fmtDatum(dueDate)}` +
      (company.iban ? ` auf IBAN ${company.iban}${company.bic ? ` / BIC ${company.bic}` : ''}` : '') +
      '.',
    breite,
  ) as string[];
  y = platzFuer(doc, y, zahlung.length * 5 + 5);
  doc.text(zahlung, RAND, y);
  y += zahlung.length * 5;
  doc.text(`Verwendungszweck: ${invoiceNumber} / ${project.projectNumber}`, RAND, y);

  /*
    DER PFLICHTSATZ — § 11 Abs 1a UStG verlangt ihn im Wortlaut.

    Er steht unter dem Zahlungshinweis und nicht in der Fusszeile: die
    Fusszeile ist Kleingedrucktes, das man überliest. Dies hier ist der Grund,
    warum auf der Rechnung keine Steuer steht, und der gehört dorthin, wo der
    Kunde nach dem Betrag sucht.
  */
  if (rc) {
    const hinweis = doc.splitTextToSize(RC_HINWEIS, breite) as string[];
    y = platzFuer(doc, y + 8, hinweis.length * 5);
    doc.setFont('helvetica', 'bold').text(hinweis, RAND, y);
    doc.setFont('helvetica', 'normal');
    y += (hinweis.length - 1) * 5;
  }

  y = platzFuer(doc, y + 10, 5);
  doc.text('Vielen Dank für Ihren Auftrag.', RAND, y);

  // Optionaler Leistungsnachweis (eigene Seite)
  if (opts.appendDetail && assembled.entries.length) {
    doc.addPage();
    titel(doc, 'Leistungsnachweis', 25);
    doc.setFontSize(9).setTextColor(...GRAU);
    doc.text(
      [`zu ${UEBERSCHRIFT[art]} ${invoiceNumber}`, `Baustelle ${project.projectNumber}`, project.customerName]
        .filter(Boolean)
        .join(' · '),
      RAND,
      31,
    );
    doc.setTextColor(...TINTE);
    const detail = [...assembled.entries].sort((a, b) => a.date.localeCompare(b.date));
    const totalMin = detail.reduce((s, e) => s + calcWorkMin(e), 0);
    autoTable(doc, {
      ...TABELLENSTIL,
      startY: 38,
      // Ohne die Stundenspalte ist ein Leistungsnachweis als Beleg wertlos —
      // der Kunde kann die Rechnungssumme sonst nicht nachvollziehen.
      head: [['Datum', 'Mitarbeiter', 'Typ', 'Tätigkeit / Notiz', 'Std.']],
      body: detail.map((e) => [
        fmtDate(e.date),
        e.userName ?? '',
        e.isHelper ? 'Helfer' : 'Fachkraft',
        // Ganz, nicht auf 60 Zeichen gekappt: die Tabelle bricht jetzt um,
        // und ein abgeschnittener Satz belegt nichts.
        e.comment ?? '',
        fmtHours(calcWorkMin(e)),
      ]),
      foot: [['', '', '', 'Summe', fmtHours(totalMin)]],
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 38 },
        2: { cellWidth: 19 },
        4: { halign: 'right', cellWidth: 16 },
      },
      didParseCell: (d) => {
        if (d.column.index === 4) d.cell.styles.halign = 'right';
        if (d.section === 'foot') {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.lineWidth = { top: 0.35 };
          if (d.column.index === 3) d.cell.styles.halign = 'right';
        }
      },
    });
  }

  // Fusszeile mit Bank und Pflichtangaben (UID, Firmenbuch) auf jeder Seite.
  fusszeilen(doc, company);

  // Das Dokument wird zurückgegeben statt sofort gespeichert: nur so lässt
  // sich dieselbe Rechnung später erneut erzeugen und verschicken.
  return doc;
}

/** Erzeugt das PDF und startet den Download. */
export function downloadInvoicePdf(opts: Parameters<typeof generateInvoicePdf>[0]) {
  generateInvoicePdf(opts).save(`${opts.invoiceNumber}.pdf`);
}
