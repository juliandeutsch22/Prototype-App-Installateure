import type { Invoice } from '@/types';
import { offenerRest } from './zahlstand';

/**
 * Mahnwesen — was mit einer Rechnung geschieht, die nicht bezahlt wird.
 *
 * WAS ES VORHER GAB: den Status „Überfällig". Er wurde beim Öffnen der
 * Ansicht automatisch gesetzt und dann angezeigt. Mehr nicht — kein
 * Mahndatum, keine Stufe, kein Schreiben an den Kunden. Der Betrieb sah, dass
 * Geld aussteht, und musste das Mahnen selbst im Kopf führen.
 *
 * DREI STUFEN, weil im Handwerk drei üblich sind und weil sie verschiedene
 * Dinge sagen:
 *
 *   1  ZAHLUNGSERINNERUNG — geht davon aus, dass es übersehen wurde. Das ist
 *      in den meisten Fällen die Wahrheit, und ein scharfer Ton bei der
 *      ersten Nachfrage kostet Kunden, die einfach nur im Urlaub waren.
 *   2  MAHNUNG — benennt den Verzug.
 *   3  LETZTE MAHNUNG — kündigt an, dass es aus der Hand gegeben wird.
 *
 * WAS HIER BEWUSST NICHT GERECHNET WIRD: VERZUGSZINSEN.
 *
 * Sie stehen im Gesetz — 4 % für Verbraucher (§ 1000 ABGB), zwischen
 * Unternehmern 9,2 Prozentpunkte über dem BASISZINSSATZ (§ 456 UGB). Der
 * Basiszinssatz ändert sich halbjährlich. Ihn hier einzutragen hiesse, eine
 * Zahl zu hinterlegen, die still veraltet und danach auf jeder Mahnung falsch
 * steht — und eine falsch berechnete Zinsforderung ist schlechter als keine.
 *
 * Die Mahnspesen dagegen legt der Betrieb selbst fest; sie stehen in den
 * Einstellungen und sind je Stufe eine schlichte Zahl.
 */

export const MAHNSTUFEN = [1, 2, 3] as const;
export type Mahnstufe = (typeof MAHNSTUFEN)[number];

export interface StufenText {
  /** Die Überschrift auf dem Beleg. */
  titel: string;
  /** Der Absatz darüber, wie der Betrieb die Sache sieht. */
  anrede: string;
  /** Der Satz, der die neue Frist nennt. */
  frist: (bis: string) => string;
}

export const TEXTE: Record<Mahnstufe, StufenText> = {
  1: {
    titel: 'Zahlungserinnerung',
    anrede:
      'vermutlich ist unsere Rechnung untergegangen — das kommt vor. Wir dürfen Sie an den ' +
      'offenen Betrag erinnern.',
    frist: (bis) => `Wir bitten um Überweisung bis ${bis}.`,
  },
  2: {
    titel: 'Mahnung',
    anrede:
      'unsere Rechnung ist trotz Erinnerung offen. Wir müssen Sie daher mahnen und ersuchen ' +
      'um Begleichung.',
    frist: (bis) => `Wir setzen eine Frist bis ${bis}.`,
  },
  3: {
    titel: 'Letzte Mahnung',
    anrede:
      'unsere Rechnung ist trotz zweimaliger Aufforderung weiterhin offen. Dies ist unsere ' +
      'letzte Mahnung.',
    frist: (bis) =>
      `Wir setzen eine letzte Frist bis ${bis}. Danach geben wir die Forderung aus der Hand.`,
  },
};

/**
 * Welche Stufe kommt als Nächstes?
 *
 * `null` heisst: es geht nicht weiter. Nach der dritten ist Schluss — was
 * dann folgt, entscheidet nicht diese App, sondern ein Mensch mit einem
 * Anwalt oder einem Inkassobüro. Eine vierte Mahnung wäre ein Schreiben, das
 * seine eigene Ankündigung widerruft.
 */
export function naechsteStufe(inv: Pick<Invoice, 'mahnstufe'>): Mahnstufe | null {
  const jetzt = inv.mahnstufe ?? 0;
  return jetzt >= 3 ? null : ((jetzt + 1) as Mahnstufe);
}

export interface MahnPruefung {
  /** Darf gemahnt werden? */
  moeglich: boolean;
  /** Warum nicht — für die Oberfläche. */
  grund?: string;
}

/**
 * Darf diese Rechnung gemahnt werden?
 *
 * DIE FÄLLIGKEIT ENTSCHEIDET, nicht der Status. „Überfällig" wird beim Öffnen
 * der Liste gesetzt; wer die Liste heute noch nicht geöffnet hat, hätte sonst
 * eine fällige Rechnung, die sich nicht mahnen lässt. Der Status ist eine
 * Anzeige, das Datum ist die Tatsache.
 */
export function darfMahnen(
  inv: Pick<
    Invoice,
    'paymentStatus' | 'dueDate' | 'mahnstufe' | 'gemahntAm' | 'mahnfrist'
    | 'totalBrutto' | 'bezahltBetrag'
  >,
  heute: string,
): MahnPruefung {
  if (inv.paymentStatus === 'Storniert') {
    return { moeglich: false, grund: 'Die Rechnung ist storniert.' };
  }
  /*
    BEIDE MÜSSEN „OFFEN" SAGEN — der Status UND die Zahl.

    „Teilbezahlt" ist mahnbar, der Kunde schuldet ja noch etwas; das ist der
    Grund für Stufe 10.1, denn vorher wurde eine Rechnung über 1.000 €, auf
    die 400 gekommen sind, über den vollen Betrag gemahnt.

    WARUM NICHT ALLEIN DIE ZAHL, obwohl sie die genauere wäre: Rechnungen aus
    der Zeit vor den Zahlungseingängen tragen „Bezahlt" und einen bezahlten
    Betrag von null — den Betrag hat damals niemand erfasst, weil es das Feld
    nicht gab. Wer hier nur rechnet, mahnt beim ersten Lauf den gesamten
    Altbestand. Die Migration trägt den Betrag zwar nach (siehe
    `20260919120000_zahlungseingaenge.sql`), aber eine Regel, die nur mit
    geglückter Migration richtig ist, ist keine Regel, sondern eine Annahme.
  */
  if (inv.paymentStatus === 'Bezahlt' || inv.paymentStatus === 'Überzahlt') {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  if (offenerRest(inv) <= 0) {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  if (!inv.dueDate || inv.dueDate >= heute) {
    return { moeglich: false, grund: 'Das Zahlungsziel ist noch nicht abgelaufen.' };
  }
  if (naechsteStufe(inv) === null) {
    return {
      moeglich: false,
      grund: 'Die dritte Mahnung ist verschickt. Was jetzt folgt, entscheidet der Betrieb.',
    };
  }
  const laeuft = laufendeFrist(inv);
  if (laeuft && laeuft >= heute) {
    return {
      moeglich: false,
      grund: `Die Frist aus der letzten Mahnung läuft noch bis ${laeuft}.`,
    };
  }
  return { moeglich: true };
}

/**
 * Bis wann die Frist aus der LETZTEN Mahnung läuft — oder `null`, wenn keine
 * läuft.
 *
 * DER FEHLER, DEN DAS BEHEBT. Geprüft wurde bisher nur das ursprüngliche
 * Zahlungsziel. Wer gestern eine Zahlungserinnerung mit einer Woche Frist
 * verschickt hat, bekam die Rechnung heute wieder im Mahnlauf angeboten — für
 * Stufe 2, sechs Tage vor Ablauf der Frist, die er selbst gesetzt hat. Das sah
 * nach Arbeit aus und war eine Aufforderung, dem Kunden die zugesagte Frist
 * wieder zu nehmen.
 *
 * Aufgefallen ist es erst durch das Abzeichen im Menü: eine Zahl, die jede
 * überfällige Rechnung jeden Tag mitzählt, leuchtet dauerhaft — und eine
 * Meldung, die immer an ist, ist keine.
 *
 * DER RÜCKFALL, wenn `mahnfrist` fehlt: das Mahndatum plus {@link FRIST_TAGE},
 * also die Frist, die der Beleg vorschlägt. Fehlt auch das, ist die Rechnung
 * fällig — die andere Wahl wäre „nie wieder fällig", und das versteckte eine
 * offene Forderung für immer.
 *
 * Dieselbe Regel steht in `app.mahnung_faellig` (Migration
 * `20260916140000_offene_posten.sql`), weil das Abzeichen zählen muss, was
 * diese Liste zeigt.
 */
export function laufendeFrist(
  inv: Pick<Invoice, 'mahnstufe' | 'gemahntAm' | 'mahnfrist'>,
): string | null {
  if (!inv.mahnstufe) return null;
  if (inv.mahnfrist) return inv.mahnfrist;
  if (!inv.gemahntAm) return null;
  return tagePlus(inv.gemahntAm, FRIST_TAGE);
}

/** `n` Tage auf einen ISO-Tag, in UTC gerechnet — ohne Sommerzeitfallen. */
function tagePlus(isoTag: string, n: number): string | null {
  const t = Date.parse(`${isoTag}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Die Mahnspesen einer Stufe.
 *
 * Der Betrieb legt sie fest; ohne Festlegung sind sie null. KEINE VORGABE mit
 * einer erfundenen Zahl: was ein Betrieb verrechnen darf, hängt am Aufwand
 * und am Vertrag, und ein voreingestellter Betrag sähe aus wie eine Auskunft
 * darüber.
 */
export function spesenFuer(stufe: Mahnstufe, spesen: number[] | undefined): number {
  const wert = spesen?.[stufe - 1];
  return typeof wert === 'number' && wert > 0 ? wert : 0;
}

/** Vorschlag für die neue Frist: eine Woche. Änderbar in der Oberfläche. */
export const FRIST_TAGE = 7;
