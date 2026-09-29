import type { TimeEntry } from '@/types';
import { calcWorkMin, tagesAnteil } from '@/lib/time';

/**
 * Nacht- und Notdienststunden für die Lohnverrechnung.
 *
 * WARUM DAS FEHLTE UND WARUM ES EIN FEHLER WAR. Die Rechnung stellt aus
 * genau diesen beiden Kennzeichen eigene Positionen mit Aufschlag zusammen
 * (`features/invoices/assemble.ts`) — der Kunde zahlt den Zuschlag also.
 * Die Lohnausleitung dagegen kannte `isNightWork` und `isEmergency`
 * überhaupt nicht: weder die Monats-CSV noch der Stundennachweis noch die
 * Monatsbilanz führten eine Spalte dafür.
 *
 * Das Ergebnis war eine Schieflage, die niemandem auffallen konnte, weil die
 * Daten ja vollständig erfasst sind: **verrechnet, aber nicht ausgewiesen.**
 * Der Nacht- und der Notdienstzuschlag sind ein Anspruch des Arbeitnehmers
 * nach Kollektivvertrag; er kann nur abgerechnet werden, wenn die Stunden in
 * der Lohnverrechnung als solche ankommen. Eine Ausleitung, die sie
 * verschweigt, sieht dabei vollständig aus — die Gesamtstunden stimmen ja.
 *
 * WAS HIER BEWUSST NICHT PASSIERT: gerechnet wird kein Geld. Die Höhe des
 * Zuschlags steht im Kollektivvertrag und hängt an Einstufung, Uhrzeit und
 * Anlass; sie hier zu schätzen hiesse, eine Zahl zu erfinden, die dann in
 * einem Lohnzettel landet. Ausgewiesen werden die STUNDEN — die Bewertung
 * macht die Lohnverrechnung, die den Vertrag kennt.
 */

export interface Zuschlagszeit {
  /** Arbeitsminuten an Einsätzen mit Kennzeichen „Nacht". */
  nachtMin: number;
  /** Arbeitsminuten an Einsätzen mit Kennzeichen „Notdienst". */
  notdienstMin: number;
  /**
   * Minuten, die BEIDE Kennzeichen tragen — in beiden Zahlen oben enthalten.
   *
   * DIESE ZAHL IST DER GRUND, WARUM DIE AUSLEITUNG SIE MITFÜHRT. Nacht und
   * Notdienst schliessen einander nicht aus: der Rohrbruch um zwei Uhr früh
   * ist beides. Wer Nacht und Notdienst addiert, zählt diese Stunden doppelt
   * — und niemand sähe es der Datei an. Sie steht deshalb als eigene Spalte
   * daneben, statt sich auf eine Fussnote zu verlassen.
   */
  beidesMin: number;
  /**
   * Arbeitsminuten nach 12 Uhr am 24. und 31. Dezember — nur, wenn der
   * Betrieb diese Tage als halbe rechnet (Kollektivvertrag Metallgewerbe:
   * danach geleistete Überstunden mit 100 % Zuschlag). Kann sich mit Nacht
   * und Notdienst überschneiden; welcher Zuschlag dann gilt, entscheidet
   * die Lohnverrechnung nach dem Vertrag.
   */
  dezemberMin: number;
  /**
   * Minuten mit IRGENDEINEM Zuschlag, jede nur einmal gezählt — für die
   * Kachel in der Zeiterfassung, die eine Zahl zeigt und nicht drei.
   */
  gesamtMin: number;
}

export const LEERE_ZUSCHLAEGE: Zuschlagszeit = {
  nachtMin: 0, notdienstMin: 0, beidesMin: 0, dezemberMin: 0, gesamtMin: 0,
};

/** Die Normalarbeitszeit am 24. und 31. Dezember endet um 12 Uhr. */
const MITTAG_MIN = 12 * 60;

/**
 * Wie viele Arbeitsminuten eines Eintrags am 24./31.12. nach 12 Uhr liegen.
 *
 * DIE PAUSE GEHT ZUERST VOM NACHMITTAG AB. Wo sie lag, steht in keinem
 * Eintrag; nach sechs Stunden ist sie aber fällig (§ 11 AZG), und wer über
 * Mittag hinaus arbeitet, macht sie in aller Regel dort. Der Vormittag bleibt
 * damit, was er nach dem Vertrag ist: Normalarbeitszeit.
 *
 * Ein Eintrag über Mitternacht zählt nur bis 24 Uhr — danach ist der 25. bzw.
 * der 1., ein Feiertag, und der hat seine eigene Regel. Ohne Von/Bis ist
 * nicht bekannt, wann gearbeitet wurde: dann null, und die Zeile steht mit
 * ihren Stunden in den Detailzeilen.
 */
export function dezemberNachmittagMin(e: TimeEntry, halbeTage: boolean): number {
  if (e.status !== 'Anwesend' || tagesAnteil(e.date, halbeTage) === 1) return 0;
  if (!e.startTime || !e.endTime) return 0;
  const [h1, m1] = e.startTime.split(':').map(Number);
  const [h2, m2] = e.endTime.split(':').map(Number);
  const beginn = h1 * 60 + m1;
  let ende = h2 * 60 + m2;
  if (ende <= beginn) ende += 24 * 60;
  const nachmittag = Math.max(0, Math.min(ende, 24 * 60) - Math.max(beginn, MITTAG_MIN));
  const pause = Number(e.breakDuration ?? 0) || 0;
  return Math.max(0, Math.min(nachmittag - pause, calcWorkMin(e)));
}

/**
 * Zuschlagsstunden eines Zeitraums.
 *
 * Nur `Anwesend` und nur positive Arbeitszeit: ein Krankenstand trägt kein
 * Kennzeichen, und eine Zeile ohne Stunden hat nichts beizutragen.
 * `calcWorkMin` ist dieselbe Funktion wie überall sonst — eine eigene Formel
 * hier ergäbe dieselbe Zahl, bis sie es eines Tages nicht mehr täte, und
 * bemerkt würde es an einem Lohnzettel.
 */
export function zuschlagszeit(eintraege: TimeEntry[], halbeTage: boolean): Zuschlagszeit {
  let nachtMin = 0;
  let notdienstMin = 0;
  let beidesMin = 0;
  let dezemberMin = 0;
  let gesamtMin = 0;

  for (const e of eintraege) {
    if (e.status !== 'Anwesend') continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    if (e.isNightWork) nachtMin += min;
    if (e.isEmergency) notdienstMin += min;
    if (e.isNightWork && e.isEmergency) beidesMin += min;
    const dezember = dezemberNachmittagMin(e, halbeTage);
    dezemberMin += dezember;
    // Ein gekennzeichneter Eintrag trägt seinen Zuschlag ganz; der
    // Dezember-Nachmittag steckt dann schon darin.
    gesamtMin += e.isNightWork || e.isEmergency ? min : dezember;
  }

  return { nachtMin, notdienstMin, beidesMin, dezemberMin, gesamtMin };
}

/** Ob überhaupt etwas auszuweisen ist — sonst bleibt der Block weg. */
export function hatZuschlaege(z: Zuschlagszeit): boolean {
  return z.nachtMin > 0 || z.notdienstMin > 0 || z.dezemberMin > 0;
}

/**
 * Kennzeichen einer Zeile als Text für die Detailzeilen.
 *
 * „Ja"/leer statt „x", damit die Spalte auch dann lesbar ist, wenn die Datei
 * ausgedruckt auf einem Schreibtisch liegt.
 */
export function kennzeichen(gesetzt: boolean | undefined): string {
  return gesetzt ? 'Ja' : '';
}
