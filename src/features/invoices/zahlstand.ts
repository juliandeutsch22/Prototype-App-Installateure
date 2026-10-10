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

type MitRuecklass = Rechnung & Pick<Invoice, 'dueDate' | 'ruecklassBetrag' | 'ruecklassBis' | 'ruecklassGarantieAm'>;

/**
 * Wann der Rücklass fällig ist: am vereinbarten Tag — oder am Tag der Ablöse
 * durch Bankgarantie, wenn der früher liegt (seit 10.10.2026). Dieselbe
 * Regel steht in der Datenbank (`app.mahnbar_ab`).
 */
export function ruecklassFaelligAm(inv: Pick<Invoice, 'ruecklassBis' | 'ruecklassGarantieAm'>): string | undefined {
  const bis = inv.ruecklassBis ?? undefined;
  const am = inv.ruecklassGarantieAm ?? undefined;
  if (am && (!bis || am < bis)) return am;
  return bis;
}

/**
 * Der noch offene Teil eines Rücklasses (seit 05.10.2026).
 *
 * ZAHLUNGEN TILGEN ZUERST DEN ÜBRIGEN BETRAG. Der Kunde zahlt, was die
 * Rechnung als Zahlbetrag nennt, und behält den Rücklass ein; was danach
 * offen ist, bis zu dessen Höhe, ist der Rücklass.
 */
export function offenerRuecklass(inv: Rechnung & Pick<Invoice, 'ruecklassBetrag'>): number {
  const r = runde(inv.ruecklassBetrag ?? 0);
  if (!(r > 0)) return 0;
  return runde(Math.min(zahlstand(inv).rest, r));
}

/**
 * Was heute zu mahnen ist — und ab wann es fällig war.
 *
 * OHNE RÜCKLASS: der Rest ab dem Zahlungsziel, wie bisher. MIT RÜCKLASS
 * zählt sein offener Teil erst, wenn er fällig ist; davor mahnt der Lauf
 * nur den übrigen Betrag. Ist der Rücklass dabei, gilt die spätere der
 * beiden Fälligkeiten: die Verzugszinsen rechnen dann ab ihr — zu wenig zu
 * fordern ist zulässig, zu viel nicht. Dieselbe Regel steht in der Datenbank
 * (`app.mahnbar_ab`) für die Zahl am Menüpunkt.
 */
export function mahnbar(inv: MitRuecklass, heute: string): { rest: number; faellig?: string } {
  const { rest } = zahlstand(inv);
  const r = offenerRuecklass(inv);
  if (r <= 0) return { rest, faellig: inv.dueDate };
  const haupt = runde(rest - r);
  const faelligAm = ruecklassFaelligAm(inv);
  const ruecklassFaellig = !!faelligAm && faelligAm < heute;
  if (!ruecklassFaellig) return { rest: haupt, faellig: inv.dueDate };
  if (haupt <= 0) return { rest, faellig: faelligAm };
  const spaeter = (inv.dueDate ?? '') > (faelligAm ?? '') ? inv.dueDate : faelligAm;
  return { rest, faellig: spaeter };
}

/**
 * Ist diese Rechnung überfällig — unabhängig davon, ob schon etwas kam?
 *
 * GEMELDET: „sobald eine Teilzahlung abgeschlossen wurde, lässt sich die
 * Rechnung nicht mehr mahnen". Mahnen liess sie sich — aber man sah nicht
 * mehr, dass man sollte. Der Stand ergibt sich aus den Zahlungseingängen,
 * und nach der ersten Teilzahlung heisst er „Teilbezahlt", nie wieder
 * „Überfällig". Abzeichen, Filter, die Summe „Überfällig" und die Startseite
 * fragten nur den Stand — und führten den Rest einer längst fälligen
 * Rechnung als „offen", also als etwas, das noch Zeit hat.
 *
 * DIE FRAGE IST: gibt es einen Rest, und ist das Zahlungsziel vorbei? Das
 * gilt auch für „Offen": die Liste stellt den Stand beim Öffnen um, die
 * Startseite sieht ihn womöglich vorher.
 */
export function istUeberfaellig(
  inv: Pick<Invoice, 'paymentStatus' | 'dueDate' | 'totalBrutto' | 'bezahltBetrag' | 'ruecklassBetrag' | 'ruecklassBis' | 'ruecklassGarantieAm'>,
  heute: string,
): boolean {
  // Ein noch nicht fälliger Rücklass ist kein Verzug (seit 05.10.2026).
  const m = mahnbar(inv, heute);
  if (inv.paymentStatus === 'Überfällig') return m.rest > 0;
  if (inv.paymentStatus !== 'Offen' && inv.paymentStatus !== 'Teilbezahlt') return false;
  return !!m.faellig && m.faellig < heute && m.rest > 0;
}
