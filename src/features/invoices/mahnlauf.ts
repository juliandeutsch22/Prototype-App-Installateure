import type { Invoice } from '@/types';
import { darfMahnen, naechsteStufe, spesenFuer, type Mahnstufe } from './mahnung';
import { offenerRest } from './zahlstand';

/**
 * Der Mahnlauf — nicht Rechnung für Rechnung, sondern in einem Durchgang.
 *
 * WAS ES VORHER GAB: das Mahnen als Menüpunkt an der einzelnen Rechnung. Die
 * Stufen stimmten, die Belege stimmten — nur kam niemand dorthin. Wer wissen
 * wollte, was zu mahnen ist, filterte die Liste auf „Überfällig", ging sie
 * von oben nach unten durch, öffnete an jeder Zeile das Menü und prüfte im
 * Kopf, ob die dritte Mahnung schon draussen war.
 *
 * Das ist der Grund, warum Mahnwesen in kleinen Betrieben liegen bleibt: nicht
 * weil das Schreiben schwer wäre, sondern weil das ZUSAMMENSTELLEN Arbeit ist
 * und sich immer verschieben lässt.
 *
 * WAS DIESER LAUF NICHT TUT, und das gehört an den Anfang: er verschickt
 * nichts von selbst. Jede Mahnung bleibt ein bewusster Griff, weil hinter
 * jeder ein Kunde steht, den der Chef vielleicht gerade am Telefon hatte. Der
 * Lauf nimmt das Suchen ab, nicht die Entscheidung.
 */

export interface MahnZeile {
  rechnung: Invoice & { id: string };
  /** Die Stufe, die als Nächstes fällig wäre. */
  stufe: Mahnstufe;
  /** Wie viele Tage die Zahlungsfrist überschritten ist. */
  tageUeberfaellig: number;
  /**
   * Was auf diese Rechnung noch aussteht — NICHT der Rechnungsbetrag.
   *
   * Auf eine Rechnung über 1.000 €, auf die 400 gekommen sind, gehören 600 in
   * die Mahnung. Der Bruttobetrag stünde dort als Forderung, die es nicht
   * mehr gibt, und eine zu hohe Mahnung ist nicht bloss peinlich: der Kunde
   * bestreitet sie zu Recht, und der Betrieb steht mit einer offenen
   * Forderung da, die er selbst falsch beziffert hat.
   */
  offen: number;
  /** Was der Betrieb für diese Stufe verrechnet — 0, wenn nichts hinterlegt. */
  spesen: number;
}

export interface Mahnlauf {
  /** Was gemahnt werden kann, dringlichstes zuerst. */
  zeilen: MahnZeile[];
  /**
   * Überfällige Rechnungen, bei denen die dritte Mahnung heraus ist.
   *
   * SIE STEHEN GETRENNT DA UND WERDEN NICHT VERSCHWIEGEN. Genau bei ihnen
   * hört die App auf und ein Mensch muss entscheiden — Anwalt, Inkasso oder
   * abschreiben. Fielen sie stillschweigend aus dem Lauf, wären ausgerechnet
   * die ältesten Forderungen die unsichtbarsten.
   */
  ausgereizt: Array<Invoice & { id: string }>;
  /** Summe dessen, was dieser Lauf einfordert — Restbeträge, nicht Brutto. */
  summeOffen: number;
  /** Summe der Spesen, die dieser Lauf verrechnen würde. */
  summeSpesen: number;
}

/** Tage zwischen zwei ISO-Tagen, in UTC gerechnet — ohne Sommerzeitfallen. */
function tageZwischen(vonIso: string, bisIso: string): number {
  const von = Date.parse(`${vonIso}T00:00:00Z`);
  const bis = Date.parse(`${bisIso}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
  return Math.round((bis - von) / 86_400_000);
}

/**
 * Was heute zu mahnen ist.
 *
 * DIE REIHENFOLGE IST DIE AUSSAGE, und sie ist nicht die der Rechnungsliste.
 * Oben steht, was am weitesten fortgeschritten ist: eine Forderung vor der
 * letzten Mahnung ist dringender als eine, die gerade erst die Frist
 * überschritten hat. Bei gleicher Stufe entscheidet das Alter, dann der
 * OFFENE Betrag — 12.000 € gehen vor 80 €, wenn beide gleich lange offen
 * sind. „Offen" heisst hier der Rest nach Teilzahlungen, nicht der
 * Rechnungsbetrag.
 *
 * Gerechnet wird gegen `heute` als Übergabewert, nicht gegen die Uhr des
 * Rechners: sonst hinge das Ergebnis daran, wann jemand die Seite geöffnet
 * hat, und wäre nicht prüfbar.
 */
export function mahnlauf(
  invoices: Array<Invoice & { id: string }>,
  heute: string,
  spesenSaetze: number[] | undefined,
): Mahnlauf {
  const zeilen: MahnZeile[] = [];
  const ausgereizt: Array<Invoice & { id: string }> = [];

  for (const inv of invoices) {
    const stufe = naechsteStufe(inv);
    if (stufe === null) {
      /*
        Ausgereizt heisst NICHT „erledigt". Bezahlt oder storniert gehört hier
        nicht her — sonst stünde eine beglichene Rechnung dauerhaft unter
        „braucht eine Entscheidung", und die Liste wäre nach einem Jahr
        unbrauchbar.
      */
      if (
        inv.paymentStatus !== 'Storniert'
        && inv.paymentStatus !== 'Bezahlt'
        && inv.paymentStatus !== 'Überzahlt'
        && offenerRest(inv) > 0
      ) {
        ausgereizt.push(inv);
      }
      continue;
    }
    if (!darfMahnen(inv, heute).moeglich) continue;
    zeilen.push({
      rechnung: inv,
      stufe,
      tageUeberfaellig: inv.dueDate ? tageZwischen(inv.dueDate, heute) : 0,
      offen: offenerRest(inv),
      spesen: spesenFuer(stufe, spesenSaetze),
    });
  }

  zeilen.sort(
    (a, b) =>
      b.stufe - a.stufe ||
      b.tageUeberfaellig - a.tageUeberfaellig ||
      b.offen - a.offen,
  );

  return {
    zeilen,
    ausgereizt,
    summeOffen: runde(zeilen.reduce((s, z) => s + z.offen, 0)),
    summeSpesen: runde(zeilen.reduce((s, z) => s + z.spesen, 0)),
  };
}

const runde = (n: number) => Math.round(n * 100) / 100;
