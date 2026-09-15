/**
 * Der Zustand der nächtlichen Läufe.
 *
 * WOFÜR. Zwei Läufe arbeiten unbeaufsichtigt: die Ausleitung um 02:30 und die
 * Monatsbilanzen um 03:15. Scheiterten sie, stand das im Google-Protokoll und
 * sonst nirgends. Das ist der einzige Mangel dieser App, bei dem der Schaden
 * mit der Zeit WÄCHST statt aufzufallen:
 *
 *   – Die Sicherung kann wochenlang ausfallen. Bemerkt wird es an dem Tag, an
 *     dem man sie braucht — und dann ist es zu spät.
 *   – Ein ausgefallener Bilanzlauf ist leiser und teurer: der Saldo steht
 *     still daneben und landet auf einem Lohnzettel.
 *
 * DIESE DATEI LIEGT IN `shared/`, weil beide Seiten sie brauchen: die
 * Functions schreiben den Zustand, die App liest und beurteilt ihn. Zwei
 * Fassungen derselben Frist wären genau der Fehler, den `shared/` verhindert.
 */

/** Die nächtlichen Läufe — die, für die `beurteile` und `FRIST_STUNDEN` gelten. */
export type NachtLaufArt = 'ausleitung' | 'bilanzen';

/**
 * Alles, was in der Übersicht steht.
 *
 * `push` steht daneben, NICHT dazwischen: es ist kein Lauf mit einer Frist,
 * sondern ein Versand, der stattfindet, wenn es etwas zu melden gibt. Die
 * Unterscheidung steckt deshalb schon im Typ — wer `push` an `beurteile`
 * reicht, bekommt es vom Übersetzer gesagt und nicht vom Betrieb.
 */
export type LaufArt = NachtLaufArt | 'push';

export interface Lauf<A extends LaufArt = LaufArt> {
  companyId: string;
  art: A;
  /** Zeitpunkt des letzten ERFOLGREICHEN Laufs, in Millisekunden. */
  zuletztErfolg?: number;
  /** Zeitpunkt des letzten VERSUCHS — auch eines gescheiterten. */
  zuletztVersuch?: number;
  /** Ging der letzte Versuch durch? */
  erfolg?: boolean;
  /** Was schiefging, wenn etwas schiefging. */
  meldung?: string;
  /** Eine Zahl, die den Lauf greifbar macht: Zeilen, gerechnete Bilanzen. */
  kennzahl?: number;
  /** Wofür die Zahl steht — „Zeilen", „Bilanzen". */
  kennzahlEinheit?: string;
  /**
   * Liegt die Sicherung AUSSERHALB des Projekts, in dem die Daten liegen?
   *
   * Nur die Ausleitung setzt das. Ohne gesetzten Zielspeicher schreibt sie in
   * den Standard-Bucket desselben Google-Projekts — gegen einen Fehlgriff
   * hilft das, gegen „der Zugang zum Projekt ist weg" nicht.
   *
   * DAS WEISS NUR DER SERVER, und bis hierher stand es allein in
   * `docs/DEPLOYMENT.md`. Eine Sicherung, deren halbe Wirkung man nur durch
   * Lesen einer Datei erfährt, ist eine Sicherung, die man für ganz hält.
   *
   * `undefined` heisst „von einem Lauf geschrieben, der das noch nicht
   * mitgeteilt hat" — dann wird nichts behauptet.
   */
  zielExtern?: boolean;
}

/**
 * Wie lange ein Lauf ausbleiben darf, bevor er als überfällig gilt.
 *
 * ZWEI TAGE, NICHT EINER. Beide Läufe laufen nächtlich; ein einzelner
 * Fehlschlag heilt sich am nächsten Morgen von selbst, und eine Meldung dafür
 * wäre Lärm, den man abstellt. Erst wenn ZWEI Nächte vergangen sind, ist
 * etwas kaputt, das jemand ansehen muss.
 *
 * Grosszügig gerechnet: 50 Stunden statt 48. Der Lauf um 02:30 und der Blick
 * darauf um 08:00 liegen nicht auf derselben Uhr, und eine Meldung, die um
 * zwei Stunden zu früh kommt, verliert ihre Bedeutung schneller als eine, die
 * zu spät kommt.
 */
export const FRIST_STUNDEN = 50;

export type Urteil = 'gut' | 'ueberfaellig' | 'unbekannt';

export interface LaufUrteil {
  stand: Urteil;
  /** Ein Satz für die Oberfläche. */
  text: string;
  /** Stunden seit dem letzten Erfolg, gerundet. Null, wenn es keinen gibt. */
  stundenHer: number | null;
}

const NAME: Record<NachtLaufArt, string> = {
  ausleitung: 'Die Sicherung',
  bilanzen: 'Der Bilanzlauf',
};

/**
 * Beurteilt einen Lauf.
 *
 * „UNBEKANNT" IST NICHT „GUT". Ein Betrieb, in dem der Lauf noch nie
 * durchgelaufen ist, sieht in den Daten genauso aus wie einer, dessen
 * Aufzeichnung fehlt — und beides heisst: es gibt keine Sicherung, von der
 * jemand weiss. Das als Erfolg zu zeigen wäre die gefährlichste Auskunft von
 * allen.
 */
export function beurteile(lauf: Lauf<NachtLaufArt> | undefined, jetzt: number): LaufUrteil {
  const name = lauf ? NAME[lauf.art] : 'Der Lauf';
  if (!lauf?.zuletztErfolg) {
    return {
      stand: 'unbekannt',
      text: `${name} ist noch nie durchgelaufen — oder es ist nichts darüber festgehalten.`,
      stundenHer: null,
    };
  }
  const stundenHer = Math.floor((jetzt - lauf.zuletztErfolg) / 3_600_000);
  if (stundenHer >= FRIST_STUNDEN) {
    return {
      stand: 'ueberfaellig',
      text: `${name} lief zuletzt vor ${tageOderStunden(stundenHer)} durch.`,
      stundenHer,
    };
  }
  return {
    stand: 'gut',
    text: `${name} lief zuletzt vor ${tageOderStunden(stundenHer)} durch.`,
    stundenHer,
  };
}

/** „vor 3 Stunden" liest sich, „vor 74 Stunden" nicht. */
function tageOderStunden(stunden: number): string {
  if (stunden < 1) return 'weniger als einer Stunde';
  if (stunden < 48) return `${stunden} ${stunden === 1 ? 'Stunde' : 'Stunden'}`;
  const tage = Math.floor(stunden / 24);
  return `${tage} Tagen`;
}

/** Die Dokument-Kennung eines Laufs. Eine Stelle, damit beide Seiten dieselbe bilden. */
export function laufId(companyId: string, art: LaufArt): string {
  return `${companyId}_${art}`;
}

/**
 * Der Zustand des Push-Versands — nach EIGENER Regel.
 *
 * WARUM NICHT `beurteile`. Die Nachtläufe müssen laufen; bleiben sie aus, ist
 * genau das der Fehler. Push läuft, WENN etwas passiert: bestellt drei Tage
 * niemand Material, geht zu Recht keine Meldung hinaus. Dieselbe Frist
 * darübergelegt, ergäbe das einen Fehlalarm am ruhigen Wochenende — und eine
 * Warnung, die grundlos erscheint, wird nach zwei Wochen nicht mehr gelesen.
 * Auch dann nicht, wenn sie einmal recht hat.
 *
 * Gemessen wird deshalb ein ANTEIL, keine Frist: von den Meldungen, die
 * angestossen wurden, wie viele sind nicht durchgekommen. `kennzahl` trägt
 * diese Zahl, geschrieben von `app.push_nachsehen()`.
 */
export function pushBeurteilen(lauf: Lauf<'push'> | undefined): LaufUrteil {
  if (!lauf?.zuletztVersuch) {
    return {
      stand: 'unbekannt',
      // NICHT „funktioniert nicht": es ist schlicht nichts angefallen. Ein
      // Betrieb, der noch keine Meldung ausgelöst hat, hat kein Problem.
      text: 'Seit der Einrichtung wurde noch keine Push-Meldung angestossen.',
      stundenHer: null,
    };
  }
  const offen = lauf.kennzahl ?? 0;
  if (lauf.erfolg === false || offen > 0) {
    return {
      stand: 'ueberfaellig',
      text: offen > 0
        ? `${offen} ${offen === 1 ? 'Push-Meldung kam' : 'Push-Meldungen kamen'} zuletzt nicht durch.`
          + (lauf.meldung ? ` ${lauf.meldung}` : '')
        : (lauf.meldung ?? 'Der Push-Versand meldete einen Fehler.'),
      stundenHer: null,
    };
  }
  return {
    stand: 'gut',
    text: 'Die zuletzt angestossenen Push-Meldungen sind alle durchgegangen.',
    stundenHer: null,
  };
}
