import { calcWorkMin, type Zeitangaben } from './arbeitszeit';

/**
 * Die Monatsbilanz — reine Rechnung, ohne Firebase.
 *
 * Liegt in `shared/`, weil beide Seiten sie brauchen: die Cloud Function
 * SCHREIBT die Bilanzen, die App und ihre Tests rechnen dagegen. Zuerst stand
 * sie unter `functions/src/` und die Tests importierten von dort — das lief
 * lokal und scheiterte in der CI, weil die dorthin erzeugte Kopie von
 * `arbeitszeit.ts` bewusst nicht eingecheckt ist und in einem frischen
 * Checkout schlicht fehlt.
 *
 * WOFÜR. Der Stundensaldo läuft seit dem ersten Arbeitstag und braucht
 * deshalb als einzige Zahl im ganzen Programm wirklich JEDE Buchung. Bei rund
 * 220 Buchungen im Jahr sind das nach zehn Jahren 2.200 Dokumente, bei jedem
 * Aufruf des Zeitkontos, und jedes Jahr mehr. Eine Bilanz je Monat macht aus
 * zweiundzwanzig Dokumenten eines.
 *
 * ZWEI ENTWURFSENTSCHEIDUNGEN, die den Unterschied machen:
 *
 * 1. GESPEICHERT WIRD NUR DAS IST, NIE DER SALDO. Der Saldo hängt an
 *    Wochenstunden, Arbeitstagen, Eintrittsdatum und Feiertagen. Ändert die
 *    Geschäftsführung jemandes Wochenstunden von 40 auf 32, ändert sich
 *    rückwirkend jeder einzelne Tag — ein gespeicherter Saldo wäre ab diesem
 *    Moment falsch, und niemand würde es merken. Das Soll bleibt deshalb
 *    abgeleitet und wird bei jeder Anzeige neu gerechnet; es kostet nichts.
 *
 * 2. KRANK- UND URLAUBSTAGE WERDEN GEZÄHLT, NICHT BEWERTET. Ein Krankentag
 *    zählt als Tagessoll — aber wie viel das ist, ergibt sich aus derselben
 *    Konfiguration wie oben. Gespeichert wird die ANZAHL, multipliziert wird
 *    erst bei der Anzeige.
 *
 * Was danach übrig bleibt, ist reine Tatsache: gearbeitete Minuten, gezählte
 * Tage, gebuchte Daten.
 */

/** Ein Zeiteintrag, so weit die Bilanz ihn braucht. */
export interface EintragDoc extends Zeitangaben {
  userId: string;
  date: string; // 'YYYY-MM-DD'
}

export interface Monatsbilanz {
  /** 'YYYY-MM' */
  monat: string;
  /** Summe der gearbeiteten Minuten (nur Status „Anwesend"). */
  anwesendMin: number;
  /** ANZAHL der Krankentage — bewertet wird erst bei der Anzeige. */
  krankTage: number;
  /** ANZAHL der Urlaubstage. */
  urlaubTage: number;
  /**
   * Die Daten mit Buchung, aufsteigend.
   *
   * Nötig für die Lückenrechnung: „an welchen Werktagen fehlt eine Buchung?"
   * lässt sich aus Summen nicht beantworten. Höchstens 31 kurze
   * Zeichenketten — das ist der Preis dafür, dass die Bilanz die Einträge
   * wirklich ersetzt und nicht nur ergänzt.
   */
  tage: string[];
}

/** 'YYYY-MM' aus einem ISO-Datum. */
export function monatVon(datum: string): string {
  return datum.slice(0, 7);
}

/**
 * Rechnet die Bilanz eines Monats aus ALLEN Einträgen dieses Monats.
 *
 * Bewusst die vollständige Neuberechnung und kein Fortschreiben eines
 * bestehenden Werts: Firestore-Trigger laufen MINDESTENS einmal, nicht GENAU
 * einmal. Ein `+= delta` verzählt sich beim Wiederholungslauf — unbemerkt und
 * dauerhaft, weil nichts mehr auf den Fehler hinweist. Diese Funktion liefert
 * bei gleicher Eingabe immer dasselbe Ergebnis und darf deshalb beliebig oft
 * laufen.
 */
export function bilanzAusEintraegen(monat: string, eintraege: EintragDoc[]): Monatsbilanz {
  let anwesendMin = 0;
  let krankTage = 0;
  let urlaubTage = 0;
  const tage = new Set<string>();

  for (const e of eintraege) {
    if (monatVon(e.date) !== monat) continue;
    tage.add(e.date);
    if (e.status === 'Krank') krankTage++;
    else if (e.status === 'Urlaub') urlaubTage++;
    else anwesendMin += calcWorkMin(e);
  }

  return {
    monat,
    anwesendMin,
    krankTage,
    urlaubTage,
    tage: [...tage].sort(),
  };
}

/**
 * Welche Monate ein Schreibvorgang berührt.
 *
 * Wird ein Eintrag vom 31. März auf den 1. April verschoben, sind ZWEI
 * Monatsbilanzen falsch — die alte trägt ihn noch, die neue noch nicht. Wer
 * nur den neuen Monat neu rechnet, hinterlässt im alten eine Stunde, die es
 * nicht mehr gibt. Aufgefallen wäre das erst am Jahressaldo.
 */
export function betroffeneMonate(
  vorher: { userId: string; date: string } | null,
  nachher: { userId: string; date: string } | null,
): Array<{ userId: string; monat: string }> {
  const raus = new Map<string, { userId: string; monat: string }>();
  for (const d of [vorher, nachher]) {
    if (!d?.userId || !d?.date) continue;
    const eintrag = { userId: d.userId, monat: monatVon(d.date) };
    raus.set(`${eintrag.userId}_${eintrag.monat}`, eintrag);
  }
  return [...raus.values()];
}

/** Die Dokument-ID einer Bilanz. Mandant zuerst — wie überall sonst. */
export function bilanzId(companyId: string, userId: string, monat: string): string {
  return `${companyId}_${userId}_${monat}`;
}
