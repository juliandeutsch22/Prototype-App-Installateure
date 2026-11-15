import type { InvoiceRates, RechnungsArt } from '@/types';
import { cent, euro } from '@/lib/betrag';
import { INVOICE_DEFAULTS } from './assemble';
import { skontoBedingung, zugesagterSkonto } from './skonto';

/**
 * Die Konditionen einer Rechnung, die gerade entsteht (Durchsicht
 * 15.11.2026, G1).
 *
 * „KONDITIONEN FÜR DIESE RECHNUNG ANPASSEN“ HIELT NICHT, WAS ES SAGTE. Die
 * angepassten Sätze blieben stehen, bis jemand die Seite neu lud — die
 * Sammelabrechnung am Monatsende rechnete Kunde B mit dem Stundensatz,
 * dem Zahlungsziel und dem Skonto, die für Kunde A vereinbart waren. Weil
 * Zahlungsziel und Skonto in der Vorschau nirgends standen, sah es niemand,
 * und der Beleg ist danach eingefroren.
 *
 * Darum hier zwei Dinge: der Startwert jeder neuen Rechnung (die Sätze des
 * Betriebs) und das, was die Vorschau unter den Summen nennt — aus derselben
 * Rechnung, mit der das Anlegen Zahlungsziel und Skonto schreibt. Was dort
 * steht, kommt so auf den Beleg.
 */

/** Was die Vorschau je Rechnung anpassen lässt — genau die Felder unter „Konditionen“. */
export type Konditionen = Pick<
  InvoiceRates,
  'fach' | 'helper' | 'nightSurcharge' | 'emergencySurcharge' | 'vatRate' | 'dueDays' | 'skontoProzent' | 'skontoTage'
>;

/** Die Sätze des Betriebs — Startwert jeder neuen Rechnung. Ohne Einstellung die Vorgaben ab Werk. */
export function betriebsKonditionen(rates: Partial<InvoiceRates> | null | undefined): InvoiceRates {
  return { ...INVOICE_DEFAULTS, ...(rates ?? {}) };
}

/** `n` Tage auf einen ISO-Tag, in UTC gerechnet — ohne Sommerzeitfallen. */
function tagePlus(isoTag: string, n: number): string {
  return new Date(Date.parse(`${isoTag}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Ein Skonto zählt nur mit Satz UND Frist — so wie ihn `skontoBedingung` überhaupt zusagt. */
function skontoVon(k: Pick<Konditionen, 'skontoProzent' | 'skontoTage'>): { prozent: number; tage: number } | null {
  const prozent = k.skontoProzent ?? 0;
  const tage = Math.floor(k.skontoTage ?? 0);
  return prozent > 0 && prozent < 100 && tage > 0 ? { prozent, tage } : null;
}

const zahl = (n: number) => n.toLocaleString('de-AT', { maximumFractionDigits: 2 });
const prozent = (anteil: number) => `${zahl(cent(anteil * 100))} %`;
const tageText = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
const skontoText = (s: { prozent: number; tage: number } | null) =>
  s ? `${zahl(s.prozent)} % in ${s.tage} ${s.tage === 1 ? 'Tag' : 'Tagen'}` : 'keines';

/** Kleiner als ein Hundertstelprozent ist kein Unterschied, sondern Gleitkomma. */
const gleich = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Worin diese Rechnung vom Betrieb abweicht — je Feld ein Satz, in der
 * Reihenfolge des Formulars. Leer, wenn nichts abweicht.
 *
 * DER SKONTO IST EIN FELD, nicht zwei: 3 % ohne Frist sagt nichts zu, und
 * ein Unterschied nur in der wirkungslosen Hälfte ist keiner.
 */
export function konditionenAbweichungen(diese: Konditionen, betrieb: Konditionen): string[] {
  const raus: string[] = [];
  const satz = (name: string, a: number, b: number) => {
    if (!gleich(a, b)) raus.push(`${name} ${euro(a)}/h (Betrieb ${euro(b)}/h)`);
  };
  const zuschlag = (name: string, a: number, b: number) => {
    if (!gleich(a, b)) raus.push(`${name} ${prozent(a)} (Betrieb ${prozent(b)})`);
  };
  satz('Facharbeiter', diese.fach, betrieb.fach);
  satz('Helfer', diese.helper, betrieb.helper);
  zuschlag('Nachtzuschlag', diese.nightSurcharge, betrieb.nightSurcharge);
  zuschlag('Notdienstzuschlag', diese.emergencySurcharge, betrieb.emergencySurcharge);
  if (diese.dueDays !== betrieb.dueDays) {
    raus.push(`Zahlungsziel ${tageText(diese.dueDays)} (Betrieb ${tageText(betrieb.dueDays)})`);
  }
  const sDiese = skontoVon(diese);
  const sBetrieb = skontoVon(betrieb);
  if (!(sDiese === sBetrieb || (sDiese && sBetrieb && gleich(sDiese.prozent, sBetrieb.prozent) && sDiese.tage === sBetrieb.tage))) {
    raus.push(`Skonto ${skontoText(sDiese)} (Betrieb ${skontoText(sBetrieb)})`);
  }
  if (!gleich(diese.vatRate, betrieb.vatRate)) {
    raus.push(`USt ${prozent(diese.vatRate)} (Betrieb ${prozent(betrieb.vatRate)})`);
  }
  return raus;
}

export interface Zahlungsbedingungen {
  /** ISO-Tag: Rechnungsdatum plus Zahlungsziel. */
  zahlungsziel: string;
  /**
   * Der zugesagte Skonto mit Betrag — oder `null`. Satz und Frist gehen so
   * an die Rechnung, der Betrag aufs PDF.
   */
  skonto: { skontoProzent: number; skontoBis: string; betrag: number } | null;
  /** Ein Skonto ist eingestellt, gilt aber für diese Art nicht (Anzahlung, Teilrechnung). */
  skontoNichtFuerArt: boolean;
  /** Was jetzt zu zahlen ist: die Forderung ohne einen Rücklass. */
  zahlbetrag: number;
  /** Der Zahlbetrag nach Abzug des Skontos — nur mit Skonto. */
  zahlbetragMitSkonto: number | null;
}

/**
 * Zahlungsziel, Skonto und Zahlbetrag dieser Rechnung — EINE Rechnung für
 * Vorschau und Anlegen. Rechnete das Anlegen für sich, könnte die Vorschau
 * etwas anderes nennen, als dann auf dem Beleg steht.
 *
 * Der Skonto gilt auf den Zahlbetrag, also ohne den Rücklass (seit
 * 10.10.2026); die Datenbank prüft dieselbe Formel (`app.skonto_passt`).
 */
export function zahlungsbedingungen(o: {
  konditionen: Pick<Konditionen, 'dueDays' | 'skontoProzent' | 'skontoTage'>;
  rechnungsdatum: string;
  art: RechnungsArt;
  forderungBrutto: number;
  ruecklassBetrag?: number | null;
}): Zahlungsbedingungen {
  const zahlungsziel = tagePlus(o.rechnungsdatum, o.konditionen.dueDays);
  const bedingung = skontoBedingung({
    prozent: o.konditionen.skontoProzent,
    tage: o.konditionen.skontoTage,
    rechnungsdatum: o.rechnungsdatum,
    zahlungsziel,
    art: o.art,
  });
  const ruecklass = o.ruecklassBetrag ?? 0;
  const zahlbetrag = cent(o.forderungBrutto - ruecklass);
  const skonto = bedingung
    ? {
        ...bedingung,
        betrag: zugesagterSkonto({
          totalBrutto: o.forderungBrutto,
          ruecklassBetrag: ruecklass,
          skontoProzent: bedingung.skontoProzent,
        }),
      }
    : null;
  return {
    zahlungsziel,
    skonto,
    skontoNichtFuerArt: !bedingung && !!skontoVon(o.konditionen),
    zahlbetrag,
    zahlbetragMitSkonto: skonto ? cent(zahlbetrag - skonto.betrag) : null,
  };
}
