import { calcWorkMin } from '@shared/arbeitszeit';

/**
 * Was die Buchungsmaske aus „Von", „Bis" und „Pause" tatsächlich rechnet.
 *
 * WARUM ES DAS BRAUCHT. Die Maske nahm bisher drei Werte entgegen und sagte
 * nicht, was daraus wird. Zwei Fälle laufen dabei still in die falsche
 * Richtung, und beide landen über die Monatsbilanz auf einem Lohnzettel:
 *
 *   – EIN TIPPFEHLER IN DER ENDZEIT. `calcWorkMin` liest eine Endzeit vor der
 *     Startzeit als Einsatz über Mitternacht — richtig für Bereitschaft und
 *     Notdienst, und genau deshalb nicht abzuschaffen. Aus „16:00", bei dem
 *     die Eins verrutscht, wird damit „06:00" und aus neun Stunden
 *     dreiundzwanzig. Niemand widerspricht.
 *   – EINE PAUSE, DIE LÄNGER IST ALS DER ERFASSTE ZEITRAUM. Das Ergebnis wird
 *     auf null gekappt: der Tag ist gebucht, gearbeitet wurde laut App nichts.
 *
 * Der Ausweg ist nicht, das Rechnen zu ändern oder die Eingabe zu sperren —
 * beides nähme dem Notdienst seine gültige Buchung. Der Ausweg ist, die
 * gerechnete Zahl HINZUSCHREIBEN, bevor gespeichert wird. Ein Tippfehler, der
 * als „23:00 Std" dasteht, fällt beim Lesen auf; einer, der nirgends steht,
 * fällt in der Lohnverrechnung auf oder gar nicht.
 *
 * Diese Datei entscheidet nur, WAS dasteht. Gerechnet wird weiter mit
 * `calcWorkMin` aus `shared/` — eine zweite Formel für dieselbe Zahl wäre
 * genau der Fehler, den `shared/` verhindert.
 */

/**
 * Ab wann eine Tagesarbeitszeit nicht mehr plausibel ist.
 *
 * ZWÖLF STUNDEN, weil § 9 AZG die tägliche Höchstarbeitszeit dort zieht.
 * Darüber ist eine Buchung nicht automatisch falsch — es gibt Ausnahmen —,
 * aber sie ist immer eine, die jemand angesehen haben sollte.
 */
export const LANGER_TAG_MIN = 12 * 60;

export type ZeitBefund = 'ok' | 'keineZeit' | 'langerTag';

export interface Zeitbild {
  /** Was gebucht würde, in Minuten. */
  minuten: number;
  /** Wurde über Mitternacht gerechnet? */
  ueberMitternacht: boolean;
  befund: ZeitBefund;
}

/**
 * Das Bild zu einer Eingabe — oder `null`, wenn noch nichts zu zeigen ist.
 *
 * `null` bei unvollständiger Eingabe ist Absicht: wer gerade erst die Startzeit
 * gesetzt hat, braucht keine Meldung über eine Arbeitszeit von null.
 */
export function zeitbild(
  startTime: string,
  endTime: string,
  pauseMin: string | number,
): Zeitbild | null {
  if (!startTime || !endTime) return null;

  const pause = Number(pauseMin) || 0;
  const minuten = calcWorkMin({ status: 'Anwesend', startTime, endTime, breakDuration: pause });

  /*
    Die Mitternachtsgrenze wird hier NICHT nachgerechnet, sondern am selben
    Vergleich abgelesen, den `calcWorkMin` zieht: sonst gäbe es zwei Stellen,
    an denen entschieden wird, was „über Mitternacht" heisst.
  */
  const ueberMitternacht = endTime < startTime;

  /*
    KEINE ZEIT ist der schwerere Befund und steht deshalb zuerst. Eine Pause,
    die den ganzen Zeitraum auffrisst, ist auch dann eine Fehleingabe, wenn
    der Zeitraum über Mitternacht ginge.
  */
  const befund: ZeitBefund =
    minuten === 0 ? 'keineZeit' : minuten > LANGER_TAG_MIN ? 'langerTag' : 'ok';

  return { minuten, ueberMitternacht, befund };
}

/**
 * Der erklärende Satz zum Befund — oder `null`, wenn es nichts zu erklären
 * gibt.
 *
 * Bei „ok" ohne Mitternacht steht bewusst kein Satz: die Zahl allein ist die
 * Auskunft, und ein Satz, der bei jeder normalen Buchung erscheint, wird nach
 * einer Woche nicht mehr gelesen.
 */
export function zeitSatz(bild: Zeitbild): string | null {
  if (bild.befund === 'keineZeit') {
    return 'Die Pause ist so lang wie der erfasste Zeitraum oder länger — gebucht würde keine Arbeitszeit.';
  }
  if (bild.befund === 'langerTag' && bild.ueberMitternacht) {
    return 'Die Endzeit liegt vor der Startzeit, gerechnet wird über Mitternacht. Bitte prüfen, ob das so gemeint ist.';
  }
  if (bild.befund === 'langerTag') {
    return 'Mehr als zwölf Stunden an einem Tag. Bitte prüfen, ob die Zeiten stimmen.';
  }
  if (bild.ueberMitternacht) {
    return 'Die Endzeit liegt vor der Startzeit — gerechnet wird über Mitternacht.';
  }
  return null;
}

/**
 * Wie viele Minuten der Spanne in die Nacht fallen, zwischen 22 und 6 Uhr.
 *
 * NUR FÜR EINEN HINWEIS, NICHT FÜR DEN ZUSCHLAG. Ob ein Einsatz als
 * Nachtarbeit verrechnet wird, entscheidet die Vereinbarung mit dem Kunden
 * und der Kollektivvertrag — der Haken bleibt eine bewusste Angabe. Aus dem
 * Launch-Check (25.09.2026, M2): bei 20:00–02:00 schlug die Maske nichts
 * vor, der Zuschlag fehlte danach in der Rechnungsvorschau, und niemand
 * hatte ihn absichtlich weggelassen.
 */
export function nachtMinuten(startTime: string, endTime: string): number {
  const m = (t: string) => {
    const x = /^(\d{1,2}):(\d{2})/.exec(t);
    return x ? Number(x[1]) * 60 + Number(x[2]) : null;
  };
  const von = m(startTime);
  const bis0 = m(endTime);
  if (von === null || bis0 === null || von === bis0) return 0;
  const bis = bis0 > von ? bis0 : bis0 + 24 * 60;
  // Die Nächte, in die eine Spanne von höchstens 24 Stunden fallen kann.
  const naechte: Array<[number, number]> = [[0, 6 * 60], [22 * 60, 30 * 60], [46 * 60, 54 * 60]];
  return naechte.reduce((summe, [a, b]) => summe + Math.max(0, Math.min(bis, b) - Math.max(von, a)), 0);
}
