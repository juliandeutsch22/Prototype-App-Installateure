import type jsPDF from 'jspdf';
import type autoTableFn from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import type { Company } from '@/types';
import { firmenZeilen, logoZeichnen } from './pdfBriefkopf';
import { betrag } from '@/lib/geld';

/**
 * Das Layout der Belege, die an den Kunden gehen — Rechnung,
 * Leistungsnachweis, Mahnung, Angebot.
 *
 * GEMELDET: „die Rechnungen sehen nicht professionell aus, die Vollfarb-Boxen
 * wirken billig". Die türkisfarbenen Summenfelder hatte niemand gewählt — sie
 * sind die Voreinstellung von `jspdf-autotable` für den Tabellenfuss, und
 * darüber lag ein dunkelblauer Kopfbalken mit Gitter um jede Zelle. So sieht
 * ein Tabellenkalkulations-Ausdruck aus, kein Geschäftsbrief.
 *
 * Jetzt: schwarze Schrift auf Weiss, feine graue Linien nur zwischen den
 * Zeilen, eine kräftigere unter dem Tabellenkopf und über der Endsumme. Keine
 * Flächenfarbe. Der Empfänger steht dort, wo ein Fensterkuvert ihn zeigt, die
 * Bankverbindung in der Fusszeile jeder Seite.
 *
 * EINE DATEI FÜR ALLE BELEGE, damit Rechnung und Mahnung zur selben Rechnung
 * nicht aussehen, als kämen sie aus zwei Betrieben.
 */

/** Seitenrand links und rechts (mm). */
export const RAND = 20;
export const RECHTS = 210 - RAND;

/** Ab hier gehört die Seite der Fusszeile. */
export const FUSS_OBEN = 274;

/*
  DIE FARBEN DER OBERFLÄCHE, NICHT DIE VON BOOTSTRAP. Hier standen #212529,
  #6c757d und #ced4da — die Grautöne einer fremden Bibliothek; kein Beleg
  trug die Markenfarbe (Prüflauf 24.09.2026, C3). Jetzt dieselben Werte wie
  `--text`, `--text-muted` und `--border` in `index.css`. Auf Papier bleiben
  sie ein ruhiges Fast-Schwarz und Grau — ein Geschäftsbrief bekommt dadurch
  keine Farbflächen, nur denselben Ton wie die App.
*/
export type Rgb = [number, number, number];
export const TINTE: Rgb = [10, 32, 48];
export const GRAU: Rgb = [56, 80, 95];
export const LINIE: Rgb = [207, 227, 233];
/** `--danger` — für „STORNIERT" auf einem Beleg. */
export const ROT: Rgb = [173, 26, 26];
/** `--brand-fixed`, die Produktfarbe Petrol — für interne Auswertungen. */
export const PETROL: Rgb = [15, 69, 82];
/** `--surface-2` — Zebrastreifen interner Tabellen. */
export const FLAECHE: Rgb = [241, 248, 250];

/** Wo die Positionstabelle frühestens beginnt — unter Titel und Kopfdaten. */
export const TABELLE_AB = 100;

/**
 * Der Briefkopf: Firmenname links, Anschrift und Kontakt darunter, das Logo
 * rechts, eine feine Linie als Abschluss.
 */
export function briefkopf(doc: jsPDF, company: Company): void {
  logoZeichnen(doc, company, RECHTS, 14);
  doc.setTextColor(...TINTE);
  doc.setFontSize(15).setFont('helvetica', 'bold');
  doc.text(company.name || 'Firma', RAND, 22);
  doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(...GRAU);
  firmenZeilen(company).forEach((z, i) => doc.text(z, RAND, 27.5 + i * 4.2));
  doc.setDrawColor(...LINIE).setLineWidth(0.2).line(RAND, 37, RECHTS, 37);
  doc.setTextColor(...TINTE);
}

/**
 * Eine Anschrift aus EINEM Feld in Zeilen, wie sie auf ein Kuvert gehören.
 *
 * Die App führt die Anschrift als eine Zeile („Gartengasse 12, 2700 Wiener
 * Neustadt"). Im Adressfeld eines Briefs steht der Ort darunter. Getrennt wird
 * nur vor einer Postleitzahl — ein Komma ohne folgende PLZ („Stiege 2, Top
 * 5") bleibt, wo es ist, statt die Anschrift zu zerreissen.
 */
export function adresszeilen(adresse?: string): string[] {
  const a = adresse?.trim();
  if (!a) return [];
  return a.split(/,\s*(?=(?:[A-Z]{1,2}-)?\d{4,5}\s)/).map((z) => z.trim()).filter(Boolean);
}

/**
 * Absenderzeile und Empfänger — im Bereich eines Fensterkuverts.
 *
 * Die kleine Absenderzeile über der Anschrift ist kein Schmuck: sie ist das,
 * was die Post bei Unzustellbarkeit liest, und sie steht im Fenster.
 */
export function empfaenger(
  doc: jsPDF,
  company: Company,
  e: { name?: string; adresse?: string; uid?: string },
): void {
  const absender = [company.name, company.addressLine].filter((z) => z && z.trim()).join(' · ');
  let y = 50;
  if (absender) {
    doc.setFontSize(7).setFont('helvetica', 'normal').setTextColor(...GRAU);
    const zeile = doc.splitTextToSize(absender, 85)[0] as string;
    doc.text(zeile, RAND, y);
    doc.setDrawColor(...LINIE).setLineWidth(0.1);
    doc.line(RAND, y + 1, RAND + doc.getTextWidth(zeile), y + 1);
  }
  y += 7;
  doc.setFontSize(10).setTextColor(...TINTE);
  const zeilen = [e.name?.trim() || '–', ...adresszeilen(e.adresse)];
  for (const z of zeilen) {
    doc.text(z, RAND, y);
    y += 5;
  }
  /*
    Die UID des Empfängers gehört zum Empfänger, nicht in die Fusszeile —
    bei Reverse Charge ist sie Pflicht, ab 10.000 € an einen Unternehmer auch.
  */
  if (e.uid?.trim()) doc.text(`UID: ${e.uid.trim()}`, RAND, y);
}

/**
 * Die Kopfdaten rechts neben dem Empfänger: Bezeichnung grau, Wert schwarz.
 *
 * Als Tabelle aus zwei Spalten statt als „Rechnungsnummer: …"-Sätze, die
 * rechtsbündig untereinander standen und dadurch mit jeder Zeile an einer
 * anderen Stelle begannen.
 */
export function kopfdaten(doc: jsPDF, zeilen: [string, string][], y = 57): void {
  const links = 124;
  doc.setFontSize(9);
  for (const [bezeichnung, wert] of zeilen) {
    doc.setFont('helvetica', 'normal').setTextColor(...GRAU).text(bezeichnung, links, y);
    doc.setTextColor(...TINTE).text(wert, RECHTS, y, { align: 'right' });
    y += 5;
  }
}

/** Die Überschrift des Belegs, über der Tabelle. */
export function titel(doc: jsPDF, text: string, y = 92): void {
  doc.setFontSize(15).setFont('helvetica', 'bold').setTextColor(...TINTE);
  doc.text(text, RAND, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
}

/**
 * Die Fusszeile auf JEDER Seite: Betrieb, Bank, Firmenbuch.
 *
 * Erst am Ende gezeichnet, wenn feststeht, wie viele Seiten es sind — die
 * Seitenzahl steht nur dort, wo es mehr als eine gibt.
 */
export function fusszeilen(doc: jsPDF, company: Company): void {
  const spalten: string[][] = [
    [company.name, company.addressLine],
    [
      company.bankName,
      company.iban && `IBAN ${company.iban}`,
      company.bic && `BIC ${company.bic}`,
    ],
    [company.vatId && `UID: ${company.vatId}`, company.companyRegister],
  ].map((s) => s.filter((z): z is string => !!z && z.trim() !== ''));
  const x = [RAND, 88, 146];
  const breite = [64, 54, RECHTS - 146];
  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINIE).setLineWidth(0.2).line(RAND, FUSS_OBEN + 4, RECHTS, FUSS_OBEN + 4);
    doc.setFontSize(7.5).setFont('helvetica', 'normal').setTextColor(...GRAU);
    spalten.forEach((zeilen, s) => {
      const umbrochen = zeilen.flatMap((z) => doc.splitTextToSize(z, breite[s]) as string[]).slice(0, 4);
      umbrochen.forEach((z, j) => doc.text(z, x[s], FUSS_OBEN + 9 + j * 3.4));
    });
    if (seiten > 1) doc.text(`Seite ${i} von ${seiten}`, RECHTS, 292, { align: 'right' });
  }
  doc.setTextColor(...TINTE);
}

/**
 * Wie weit unten noch geschrieben werden darf, bevor eine neue Seite nötig
 * ist — und diese dann anlegen. Gibt die Zeile zurück, auf der es weitergeht.
 */
export function platzFuer(doc: jsPDF, y: number, hoehe: number): number {
  if (y + hoehe <= FUSS_OBEN) return y;
  doc.addPage();
  return 25;
}

/**
 * Der Tabellenstil aller Belege.
 *
 * `fillColor: false` ist der entscheidende Eintrag: ohne ihn setzt
 * `jspdf-autotable` Kopf und Fuss in seine eigene Farbe.
 */
export const TABELLENSTIL: Partial<UserOptions> = {
  theme: 'plain',
  margin: { left: RAND, right: RAND, top: 25, bottom: 297 - FUSS_OBEN + 2 },
  styles: {
    font: 'helvetica',
    fontSize: 9,
    textColor: TINTE,
    cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
    lineColor: LINIE,
    lineWidth: 0,
    valign: 'top',
  },
  headStyles: {
    fillColor: false,
    textColor: TINTE,
    fontStyle: 'bold',
    lineColor: TINTE,
    lineWidth: { bottom: 0.35 },
  },
  bodyStyles: { lineWidth: { bottom: 0.1 } },
  footStyles: { fillColor: false, textColor: TINTE, fontStyle: 'normal' },
  showFoot: 'lastPage',
  rowPageBreak: 'avoid',
};

/** Deutsche Zahl ohne erzwungene Nachkommastellen: 8,5 statt „8.5". */
export function fmtMenge(n: number): string {
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(n);
}

/** Eine Zeile der Positionstabelle — Rechnung und Angebot haben dieselbe. */
export interface BelegPosition {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  netto: number;
}

/**
 * Die Positionstabelle samt Summen darunter.
 *
 * `autoTable` wird hereingereicht und nicht hier importiert: die Mahnung und
 * das Angebot laden jsPDF erst, wenn wirklich ein Beleg entsteht, und diese
 * Datei soll das nicht aushebeln.
 *
 * Die LETZTE Summenzeile ist die, die der Kunde zahlt — sie steht fett und
 * mit einem Strich darüber.
 */
export function positionsTabelle(
  doc: jsPDF,
  autoTable: typeof autoTableFn,
  o: { positions: BelegPosition[]; fuss: string[][]; startY: number },
): void {
  const endsumme = o.fuss.length - 1;
  autoTable(doc, {
    ...TABELLENSTIL,
    startY: o.startY,
    head: [['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis €', 'Netto €']],
    body: o.positions.map((p) => [
      p.label,
      fmtMenge(p.qty),
      p.unit,
      betrag(p.unitPrice),
      betrag(p.netto),
    ]),
    foot: o.fuss,
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
}

/** Wo es nach der letzten Tabelle weitergeht. */
export function nachTabelle(doc: jsPDF, abstand = 12): number {
  const letzte = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (letzte?.finalY ?? 120) + abstand;
}
