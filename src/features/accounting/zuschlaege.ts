import type { TimeEntry } from '@/types';
import { calcWorkMin } from '@/lib/time';

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
}

export const LEERE_ZUSCHLAEGE: Zuschlagszeit = { nachtMin: 0, notdienstMin: 0, beidesMin: 0 };

/**
 * Zuschlagsstunden eines Zeitraums.
 *
 * Nur `Anwesend` und nur positive Arbeitszeit: ein Krankenstand trägt kein
 * Kennzeichen, und eine Zeile ohne Stunden hat nichts beizutragen.
 * `calcWorkMin` ist dieselbe Funktion wie überall sonst — eine eigene Formel
 * hier ergäbe dieselbe Zahl, bis sie es eines Tages nicht mehr täte, und
 * bemerkt würde es an einem Lohnzettel.
 */
export function zuschlagszeit(eintraege: TimeEntry[]): Zuschlagszeit {
  let nachtMin = 0;
  let notdienstMin = 0;
  let beidesMin = 0;

  for (const e of eintraege) {
    if (e.status !== 'Anwesend') continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    if (e.isNightWork) nachtMin += min;
    if (e.isEmergency) notdienstMin += min;
    if (e.isNightWork && e.isEmergency) beidesMin += min;
  }

  return { nachtMin, notdienstMin, beidesMin };
}

/** Ob überhaupt etwas auszuweisen ist — sonst bleibt der Block weg. */
export function hatZuschlaege(z: Zuschlagszeit): boolean {
  return z.nachtMin > 0 || z.notdienstMin > 0;
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
