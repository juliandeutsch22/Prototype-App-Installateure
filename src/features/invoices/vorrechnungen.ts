import type { Invoice, Vorrechnung } from '@/types';
import { cent } from './totals';
import { norm } from './assemble';

/**
 * Anzahlung abziehen — die Rechenseite der Schlussrechnung.
 *
 * DIE STEUERFALLE ZUERST: § 11 Abs 12 UStG — wer eine Steuer ausweist,
 * schuldet sie. Stellt der Betrieb eine Anzahlungsrechnung über 3.000 € mit
 * 500 € USt und danach eine Schlussrechnung über die volle Leistung mit der
 * vollen Steuer, hat er dieselbe Steuer zweimal ausgewiesen und schuldet sie
 * zweimal, bis er berichtigt. Die Schlussrechnung MUSS die bereits
 * verrechneten Teilentgelte samt Steuer abziehen und einzeln ausweisen.
 *
 * WAS ABGEZOGEN WIRD UND WAS NICHT — das ist die Unterscheidung, an der eine
 * Schlussrechnung sonst doppelt kürzt:
 *
 *   Eine ANZAHLUNG verbraucht keine Belege. Sie ist Geld auf eine Leistung,
 *   die noch kommt. Die Leistung selbst steht später ganz in der
 *   Schlussrechnung — die Anzahlung muss deshalb abgezogen werden.
 *
 *   Eine TEILRECHNUNG über einen abgeschlossenen Bauabschnitt hat dessen
 *   Zeiteinträge und Scheine verbraucht: sie sind als verrechnet markiert und
 *   tauchen in der Schlussrechnung gar nicht mehr auf. Ihre Summe ist schon
 *   heraussen. Zöge man sie zusätzlich ab, fehlte sie zweimal, und der
 *   Betrieb schenkte dem Kunden seine eigene Leistung.
 *
 * Das Unterscheidungsmerkmal ist deshalb nicht die ART, sondern ob die
 * Rechnung BELEGE VERBRAUCHT HAT. `app.vorrechnungen_pruefen` prüft dieselbe
 * Bedingung noch einmal in der Datenbank.
 */

/** Summe der Abzüge, getrennt nach Netto, Steuer und Brutto. */
export interface Abzugssumme {
  netto: number;
  vat: number;
  brutto: number;
}

/**
 * Welche Rechnungen dieser Baustelle sich noch abziehen lassen.
 *
 * `alle` ist der Bestand, gegen den geprüft wird — er muss die Baustelle
 * vollständig enthalten, sonst übersieht die Prüfung auf einen schon
 * erfolgten Abzug einen Fall. Die Datenbank weist ihn dann ab; hier steht er
 * nur nicht zur Auswahl.
 */
export function abziehbar<T extends Invoice>(alle: T[], projectNumber: string): T[] {
  const pn = norm(projectNumber);
  const schonAbgezogen = new Set(
    alle
      .filter((i) => i.paymentStatus !== 'Storniert')
      .flatMap((i) => i.vorrechnungen?.map((v) => v.invoiceId) ?? []),
  );
  return alle.filter(
    (i) =>
      norm(i.projectNumber) === pn &&
      i.paymentStatus !== 'Storniert' &&
      !schonAbgezogen.has(i.id) &&
      (i.linkedEntries?.length ?? 0) === 0 &&
      (i.linkedOrders?.length ?? 0) === 0 &&
      (i.linkedWorkSheets?.length ?? 0) === 0,
  );
}

/**
 * Welche der abziehbaren Rechnungen zur Steuerbehandlung DIESER Rechnung
 * passen — und welche nicht.
 *
 * GEFUNDEN IM PRÜFLAUF (25.09.2026, P2-08): eine Schlussrechnung mit
 * Übergang der Steuerschuld zog eine Anzahlung MIT Umsatzsteuer samt Steuer
 * ab. Die Restforderung war um genau diese Steuer zu niedrig, und die auf der
 * Anzahlung ausgewiesene Steuer blieb stehen (§ 11 Abs 12 UStG). Umgekehrt
 * ebenso. Solche Rechnungen werden deshalb nicht zum Abzug angeboten, sondern
 * benannt — der Fall gehört berichtigt, nicht verrechnet. Die Datenbank
 * (`app.vorrechnungen_pruefen`) weist ihn ebenso ab.
 *
 * Getrennt von `abziehbar`, weil sich der Haken „Bauleistung" erst in der
 * Vorschau setzen lässt, nachdem die Rechnungen der Baustelle geladen sind.
 */
export function nachSteuer<T extends Pick<Invoice, 'reverseCharge'>>(
  kandidaten: T[],
  reverseCharge: boolean,
): { passend: T[]; andere: T[] } {
  const passend: T[] = [];
  const andere: T[] = [];
  for (const r of kandidaten) (!!r.reverseCharge === reverseCharge ? passend : andere).push(r);
  return { passend, andere };
}

/**
 * Die Rechnung als Abzug, wie er auf dem Beleg steht.
 *
 * KOPIE, KEIN VERWEIS: der Abzug muss auch dann noch so dastehen, wie der
 * Kunde ihn bekommen hat, wenn die abgezogene Rechnung später storniert wird.
 */
export function alsVorrechnung(inv: Invoice): Vorrechnung {
  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    netto: inv.totalNetto,
    vat: inv.totalVat,
    brutto: inv.totalBrutto,
  };
}

/** Was die abgezogenen Rechnungen zusammen ausmachen. */
export function abzugssumme(abzuege: Vorrechnung[]): Abzugssumme {
  return abzuege.reduce<Abzugssumme>(
    (s, a) => ({
      netto: cent(s.netto + a.netto),
      vat: cent(s.vat + a.vat),
      brutto: cent(s.brutto + a.brutto),
    }),
    { netto: 0, vat: 0, brutto: 0 },
  );
}

/** Die Zahlen einer Rechnung, die abzieht. */
export interface MitAbzug {
  /** Die volle Leistung, vor Abzug — gehört auf den Beleg. */
  gesamtNetto: number;
  gesamtVat: number;
  gesamtBrutto: number;
  /** Was diese Rechnung fordert. Daran hängen offene Posten und Mahnlauf. */
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  abzug: Abzugssumme;
  /**
   * Gesetzt, wenn die Abzüge die Gesamtleistung übersteigen.
   *
   * Das wäre eine Gutschrift, und die kann diese App noch nicht: Zahlungsstand,
   * offene Posten und Mahnlauf rechnen alle mit einer Forderung, die man
   * begleichen kann. Der Fall wird deshalb BENANNT und nicht auf null gekappt
   * — gekappt verschwände der Betrag, den der Betrieb zurückschuldet.
   */
  gutschrift: boolean;
}

/**
 * Aus der vollen Leistung und den Abzügen wird die Forderung dieser Rechnung.
 *
 * Ohne Abzug bleibt alles, wie es war: die Gesamtleistung ist dann dieselbe
 * Zahl wie die Forderung und hat auf dem Beleg nichts verloren. Deshalb gibt
 * diese Funktion sie in dem Fall nicht aus, und die Datenbank weist eine
 * Gesamtleistung ohne Abzug ab.
 */
export function mitAbzug(
  gesamt: Pick<Invoice, 'totalNetto' | 'totalVat' | 'totalBrutto'>,
  abzuege: Vorrechnung[],
): MitAbzug {
  const abzug = abzugssumme(abzuege);
  return {
    gesamtNetto: cent(gesamt.totalNetto),
    gesamtVat: cent(gesamt.totalVat),
    gesamtBrutto: cent(gesamt.totalBrutto),
    totalNetto: cent(gesamt.totalNetto - abzug.netto),
    totalVat: cent(gesamt.totalVat - abzug.vat),
    totalBrutto: cent(gesamt.totalBrutto - abzug.brutto),
    abzug,
    gutschrift: cent(gesamt.totalBrutto - abzug.brutto) < 0,
  };
}
