import type { Invoice } from '@/types';

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
  inv: Pick<Invoice, 'paymentStatus' | 'dueDate' | 'mahnstufe' | 'gemahntAm'>,
  heute: string,
): MahnPruefung {
  if (inv.paymentStatus === 'Bezahlt') {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  if (inv.paymentStatus === 'Storniert') {
    return { moeglich: false, grund: 'Die Rechnung ist storniert.' };
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
  return { moeglich: true };
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
