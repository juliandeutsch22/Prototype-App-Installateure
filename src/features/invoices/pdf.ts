import jsPDF from 'jspdf';
import {
  briefkopf,
  empfaenger,
  fusszeilen,
  GRAU,
  kopfdaten,
  platzFuer,
  positionsTabelle,
  RAND,
  RECHTS,
  TABELLE_AB,
  TABELLENSTIL,
  TINTE,
  titel,
} from '@/lib/belegLayout';
import autoTable from 'jspdf-autotable';
import { summenZeilen } from './summenZeilen';
import { RC_HINWEIS } from './reverseCharge';

// Hier weiterhin erreichbar — die Prüfungen und das Angebot lesen sie so.
export { summenZeilen };

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
  /**
   * Der Ort der Leistung, wenn er nicht die Anschrift des Empfängers ist —
   * eine eigene Zeile unter der Überschrift, wie beim Angebot.
   */
  leistungsort?: string;
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
  let zusatzY = 97;
  if (!(leistungVon && leistungBis) && art === 'anzahlung') {
    /*
      BEI EINER ANZAHLUNG GIBT ES NOCH KEINEN ZEITRAUM — und einen zu
      erfinden wäre gegenüber dem Finanzamt falsch. Stattdessen steht da,
      worauf die Zahlung geht; sonst liest sich der Beleg wie eine Rechnung
      über eine Leistung, die niemand erbracht hat.
    */
    doc.setFontSize(9).setTextColor(...GRAU);
    doc.text('Anzahlung auf eine noch zu erbringende Leistung', RAND, zusatzY);
    doc.setTextColor(...TINTE);
    zusatzY += 5;
  }
  /*
    DER ORT DER LEISTUNG ALS EIGENE ZEILE (Prüflauf 25.09.2026, P2-02). Die
    Rechnung geht an die Anschrift des Kunden; gearbeitet wurde oft woanders
    — die Wohnung der Mutter, eines von zwanzig Häusern der Hausverwaltung.
    Ohne Leistungsort (Altbestand, oder er ist die Anschrift des Kunden)
    bleibt der Beleg, wie er war.
  */
  const ort = opts.leistungsort?.trim();
  if (ort && ort !== project.address?.trim()) {
    doc.setFontSize(9).setTextColor(...GRAU);
    doc.text(
      doc.splitTextToSize(`Ort der Leistung: ${ort}`, RECHTS - RAND)[0] as string,
      RAND,
      zusatzY,
    );
    doc.setTextColor(...TINTE);
    zusatzY += 5;
  }

  // Positionstabelle
  positionsTabelle(doc, autoTable, {
    positions: assembled.positions,
    fuss: summenZeilen({ assembled, vatRate, rc, abzuege, forderung }),
    startY: Math.max(TABELLE_AB + 3, zusatzY + 1),
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
