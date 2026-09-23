import type { Vorrechnung } from '@/types';
import type { AssembledInvoice } from './assemble';
import { discountLabel } from './totals';

/*
  EIGENE DATEI, OHNE jsPDF. Das Angebot braucht dieselben Summenzeilen wie die
  Rechnung; stünden sie in `pdf.ts`, zöge jede Ansicht, die sie liest, die
  mehrere hundert Kilobyte grosse PDF-Bibliothek mit.
*/

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDatum(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Die Summenzeilen unter der Positionstabelle.
 *
 * EIGENE FUNKTION, WEIL HIER DIE STEUER ENTSCHEIDET. Was unter der Tabelle
 * steht, ist der Teil des Belegs, den das Finanzamt liest; `jspdf-autotable`
 * lässt sich im Testlauf nicht zeichnen, diese Zeilen aber schon.
 */
export function summenZeilen(opts: {
  /** Nur die Summen — auch ein Angebot bringt sie mit. */
  assembled: Pick<
    AssembledInvoice,
    'discount' | 'discountAmount' | 'subtotalNetto' | 'totalNetto' | 'totalVat' | 'totalBrutto'
  >;
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

