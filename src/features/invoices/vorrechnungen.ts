import type { Invoice, Vorrechnung } from '@/types';
import { cent } from './totals';
import { norm } from './assemble';
import { datumAT } from '@/lib/datum';

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
 * Der Leistungszeitraum aus Anzahlungs- und Teilrechnungen derselben
 * Baustelle (Nachtest 01.10.2026, N3): früheste „Leistung geplant von“ bis
 * späteste „bis“. Vorbelegung für die Schlussrechnung, wenn die Scheine
 * keinen Zeitraum hergeben — überschreibbar wie jede Vorbelegung.
 */
export function leistungAusVorrechnungen(
  rechnungen: Pick<Invoice, 'art' | 'paymentStatus' | 'leistungVon' | 'leistungBis'>[],
): { von: string; bis: string } | null {
  const mit = rechnungen.filter(
    (r) => (r.art === 'anzahlung' || r.art === 'teil') && r.paymentStatus !== 'Storniert'
      && r.leistungVon && r.leistungBis,
  );
  if (mit.length === 0) return null;
  const bis = mit.map((r) => r.leistungBis!).sort();
  return { von: mit.map((r) => r.leistungVon!).sort()[0], bis: bis[bis.length - 1] };
}

/**
 * Muss diese Rechnung von einer SCHLUSSRECHNUNG abgezogen werden?
 *
 * Anzahlungs- und Teilrechnungen ja (Testbericht 30.09.2026, K2): ihre
 * Umsatzsteuer ist schon ausgewiesen; fehlt der Abzug, steht sie zweimal auf
 * Belegen desselben Betriebs (§ 11 Abs 12 UStG). Im Pilotbetrieb ging so eine
 * Schlussrechnung über den vollen Betrag hinaus, weil das Häkchen nicht
 * gesetzt war. Die Datenbank (`app.vorrechnungen_pruefen`) verlangt dasselbe.
 *
 * Eine Einzelrechnung ohne verbrauchte Belege bleibt ein freiwilliger Abzug —
 * ob sie Teil derselben Leistung war, weiss nur der Betrieb.
 */
export function pflichtAbzug(r: Pick<Invoice, 'art'>): boolean {
  return r.art === 'anzahlung' || r.art === 'teil';
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

type Kopf = Pick<Invoice, 'id' | 'art' | 'paymentStatus' | 'projectNumber' | 'invoiceNumber' | 'invoiceDate' | 'vorrechnungen'>;

/**
 * Die gültige Schlussrechnung der Baustelle — oder keine (Testbericht Runde 6,
 * M7). Eine zweite gibt es nicht; die Datenbank weist sie ab
 * (`app.eine_schlussrechnung`).
 */
export function gueltigeSchlussrechnung<T extends Omit<Kopf, 'id' | 'invoiceDate' | 'vorrechnungen'>>(
  rechnungen: T[],
  projectNumber: string,
): T | null {
  const pn = norm(projectNumber);
  return rechnungen.find(
    (r) => r.art === 'schluss' && r.paymentStatus !== 'Storniert' && norm(r.projectNumber) === pn,
  ) ?? null;
}

/**
 * Was ein Storno dieser Anzahlungs- oder Teilrechnung an einer späteren
 * Schlussrechnung berührt (Testbericht Runde 6, M7) — `null`, wenn nichts.
 *
 *   abgezogen   die Schlussrechnung zieht sie ab. Die Datenbank lässt den
 *               Storno dann gar nicht zu, solange der Abzug gilt: erst die
 *               Schlussrechnung stornieren.
 *   danach      die Schlussrechnung rechnet erst ab, was nach ihr kam (eine
 *               Teilrechnung, die Stunden und Scheine mitnahm). Nach dem
 *               Storno sind diese wieder offen — auf eine eigene Rechnung,
 *               denn eine zweite Schlussrechnung gibt es nicht.
 */
export function schlussNachStorno<T extends Kopf>(
  inv: Kopf,
  rechnungen: T[],
): { schluss: T; abgezogen: boolean } | null {
  if (inv.art !== 'anzahlung' && inv.art !== 'teil') return null;
  const pn = norm(inv.projectNumber);
  const gueltig = rechnungen.filter(
    (r) => r.id !== inv.id && r.art === 'schluss' && r.paymentStatus !== 'Storniert' && norm(r.projectNumber) === pn,
  );
  const ziehtAb = gueltig.find((r) => (r.vorrechnungen ?? []).some((v) => v.invoiceId === inv.id));
  if (ziehtAb) return { schluss: ziehtAb, abgezogen: true };
  // Eine Anzahlung, die die Schlussrechnung nicht abzieht, berührt sie nicht.
  const danach = inv.art === 'teil'
    ? gueltig.find((r) => (r.invoiceDate ?? '') >= (inv.invoiceDate ?? ''))
    : undefined;
  return danach ? { schluss: danach, abgezogen: false } : null;
}

/**
 * Was der Storno freigibt — je Rechnungsart (Testbericht Runde 6, G27). Bei
 * der Anzahlung stand „die verknüpften Zeiteinträge werden wieder
 * freigegeben“; eine Anzahlung hat keine.
 */
export function stornoText(
  inv: Pick<Invoice, 'invoiceNumber' | 'art' | 'vorrechnungen'> & Partial<Pick<Invoice, 'linkedEntries' | 'linkedWorkSheets'>>,
): string {
  if (inv.art === 'anzahlung') {
    return `${inv.invoiceNumber} wird storniert. Eine Anzahlung verrechnet keine Stunden und kein Material — freigegeben wird deshalb nichts.`;
  }
  const abzug = (inv.vorrechnungen?.length ?? 0) > 0
    ? ' Die abgezogenen Rechnungen lassen sich danach wieder abziehen.'
    : '';
  /*
    NUR WAS ES GIBT (Testbericht Runde 7, R7-G2): bei einer Pauschal-
    Teilrechnung ohne Zeiteinträge stand trotzdem, dass „die verknüpften
    Zeiteinträge und Scheine“ frei werden. Kennt die Zeile ihre Verknüpfungen
    nicht (ein Kopf aus der Liste der offenen), bleibt der allgemeine Satz.
  */
  if (inv.linkedEntries === undefined && inv.linkedWorkSheets === undefined) {
    return `${inv.invoiceNumber} wird storniert; was sie verrechnet hat, wird wieder freigegeben.${abzug}`;
  }
  const teile = [
    (inv.linkedEntries?.length ?? 0) > 0 ? 'Zeiteinträge' : null,
    (inv.linkedWorkSheets?.length ?? 0) > 0 ? 'Scheine' : null,
  ].filter(Boolean);
  if (teile.length === 0) {
    return `${inv.invoiceNumber} wird storniert. Sie verknüpft keine Zeiteinträge und keine Scheine — freigegeben wird deshalb nichts.${abzug}`;
  }
  return `${inv.invoiceNumber} wird storniert; die verknüpften ${teile.join(' und ')} werden wieder freigegeben.${abzug}`;
}

/**
 * Die Teilrechnungen, die die Schlussrechnung NICHT abzieht, als Textzeile
 * (Testbericht Runde 6, Hinweis 8) — `null`, wenn es keine gibt.
 *
 * Eine Teilrechnung mit „Leistung bis“ hat ihre Stunden und Scheine
 * verbraucht; die Schlussrechnung führt nur an, was danach kam, und nannte
 * die Teilrechnung nirgends. Wer die Schlussrechnung liest, sah eine
 * Teilleistung und hielt sie für die ganze. Die Zeile NENNT nur — abgezogen
 * wird nichts (die Teilrechnung steht ja nicht in der Leistung); sie steht
 * als Textzeile ohne Preis vorn in der Vorschau und lässt sich ändern oder
 * entfernen wie jede andere. Ob die Schlussrechnung Teilrechnungen nennen
 * oder samt Steuer abziehen muss, klärt die Steuerberatung; die Rechnung
 * selbst rechnet unverändert.
 */
export function teilrechnungenText(
  rechnungen: Array<Pick<Invoice, 'art' | 'paymentStatus' | 'projectNumber' | 'invoiceNumber' | 'invoiceDate'
    | 'leistungBis' | 'linkedEntries' | 'linkedOrders' | 'linkedWorkSheets'>>,
  projectNumber: string,
): string | null {
  const pn = norm(projectNumber);
  const teile = rechnungen
    .filter((r) => r.art === 'teil' && r.paymentStatus !== 'Storniert' && norm(r.projectNumber) === pn
      && ((r.linkedEntries?.length ?? 0) + (r.linkedOrders?.length ?? 0) + (r.linkedWorkSheets?.length ?? 0)) > 0)
    .sort((a, b) => (a.invoiceDate ?? '').localeCompare(b.invoiceDate ?? '') || a.invoiceNumber.localeCompare(b.invoiceNumber));
  if (teile.length === 0) return null;
  const genannt = teile.map((r) =>
    `${r.invoiceNumber} vom ${datumAT(r.invoiceDate)}${r.leistungBis ? ` (Leistung bis ${datumAT(r.leistungBis)})` : ''}`);
  return `Bereits mit ${teile.length === 1 ? 'Teilrechnung' : 'den Teilrechnungen'} ${genannt.join(', ')} verrechnet und hier nicht enthalten.`;
}
