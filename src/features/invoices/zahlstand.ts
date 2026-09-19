import type { Invoice } from '@/types';

/**
 * Was von einer Rechnung noch aussteht — und was zurückgeht.
 *
 * ZWEI ZAHLEN, WEIL ES ZWEI RICHTUNGEN SIND. „Rest" ist, was der Kunde noch
 * schuldet; „Guthaben" ist, was der Betrieb zurückzahlen muss. Sie über ein
 * Vorzeichen zusammenzulegen wäre kürzer und in jeder Anzeige eine Falle:
 * −250 € liest sich als Forderung, wenn man die Konvention nicht kennt, und
 * in einer Summe über mehrere Rechnungen hebt es sich gegenseitig auf. Eine
 * Liste offener Posten, in der eine Überzahlung eine fremde Forderung
 * wegkürzt, ist schlimmer als keine.
 *
 * DIE STORNIERTE RECHNUNG IST DER FALL, DER DAS ALLES ERKLÄRT. Die Forderung
 * ist weg, das Geld nicht: wer eine bezahlte Rechnung storniert, schuldet dem
 * Kunden den Betrag. Ohne diese Unterscheidung verschwände die Rückzahlung
 * still aus dem System — der Kunde erinnert sich, der Betrieb nicht.
 */
export interface Zahlstand {
  /** Summe aller Eingänge, wie sie die Datenbank geführt hat. */
  bezahlt: number;
  /** Was der Kunde noch schuldet. Nie negativ. */
  rest: number;
  /** Was der Betrieb zurückzahlen muss. Nie negativ. */
  guthaben: number;
}

type Rechnung = Pick<Invoice, 'totalBrutto' | 'bezahltBetrag' | 'paymentStatus'>;

const runde = (n: number) => Math.round(n * 100) / 100;

export function zahlstand(inv: Rechnung): Zahlstand {
  const bezahlt = runde(inv.bezahltBetrag ?? 0);
  /*
    Eine stornierte Rechnung fordert nichts mehr. Das ist keine Anzeigefrage:
    stünde sie mit ihrem Bruttobetrag in den offenen Posten, mahnte der Lauf
    eine Forderung an, die der Betrieb selbst zurückgenommen hat.
  */
  const forderung = inv.paymentStatus === 'Storniert' ? 0 : runde(inv.totalBrutto ?? 0);
  return {
    bezahlt,
    rest: runde(Math.max(forderung - bezahlt, 0)),
    guthaben: runde(Math.max(bezahlt - forderung, 0)),
  };
}

/** Kurzform für die vielen Stellen, die nur den Rest brauchen. */
export function offenerRest(inv: Rechnung): number {
  return zahlstand(inv).rest;
}
