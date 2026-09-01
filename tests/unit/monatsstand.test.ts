import { describe, it, expect } from 'vitest';
import {
  calcOverallSaldo,
  calcMonthStats,
  localDateStr,
  isAustrianHoliday,
} from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Der LAUFENDE Monat auf der Startseite.
 *
 * Beinahe falsch ausgeliefert: die Startseite rechnete den Monatsstand
 * zuerst mit `calcMonthStats`. Das ist fuer einen ABGESCHLOSSENEN Monat
 * richtig und fuer den laufenden eine Falschaussage — es setzt das Soll des
 * ganzen Monats an, auch fuer Tage, die noch gar nicht waren. Am Monatsersten
 * stand dadurch bei jedem Mitarbeiter "-176 h", als haette er einen ganzen
 * Monat verschlafen. Im Browser genau so gesehen, bevor es live ging.
 *
 * Richtig ist `calcOverallSaldo` mit dem Monatsersten als Startdatum: es
 * zaehlt das Soll nur bis GESTERN.
 */

const monteur: AppUser = {
  id: 'u1',
  companyId: 'perl',
  uid: 'u1',
  name: 'Max Mustermann',
  email: 'max@perl.at',
  role: 'Mitarbeiter',
  active: true,
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  appStartDate: null,
  initialOvertime: 0,
};

/** Der Erste des laufenden Monats, wie ihn die Startseite bildet. */
function monatsStart(): string {
  const j = new Date();
  return localDateStr(new Date(j.getFullYear(), j.getMonth(), 1));
}

/** Werktage vom Monatsersten bis gestern — mehr darf nie belastet werden. */
function werktageBisGestern(): number {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  let n = 0;
  for (
    const d = new Date(heute.getFullYear(), heute.getMonth(), 1);
    d < heute;
    d.setDate(d.getDate() + 1)
  ) {
    if (d.getDay() >= 1 && d.getDay() <= 5) n++;
  }
  return n;
}

describe('Monatsstand auf der Startseite', () => {
  it('belastet keine Tage, die noch nicht waren', () => {
    const user = { ...monteur, appStartDate: monatsStart() };
    const { saldoH } = calcOverallSaldo(user, []);
    // Ohne Buchung ist der Saldo negativ — aber hoechstens um die Werktage,
    // die bereits vorbei sind. Am Ersten ist das null.
    const maximalesMinus = werktageBisGestern() * 8;
    expect(saldoH).toBeLessThanOrEqual(0);
    expect(Math.abs(saldoH)).toBeLessThanOrEqual(maximalesMinus + 0.01);
  });

  it('ist am Monatsersten genau null, nicht ein ganzes Monatsminus', () => {
    const heute = new Date();
    if (heute.getDate() !== 1) return; // nur am Ersten aussagekraeftig
    const user = { ...monteur, appStartDate: monatsStart() };
    expect(calcOverallSaldo(user, []).saldoH).toBe(0);
  });

  /**
   * Frueher stand hier die Gegenprobe: `calcMonthStats` rechnete den GANZEN
   * Monat und taugte deshalb nicht fuer den laufenden. Diese Warnung ist
   * ueberholt — die Funktion fragt jetzt dieselbe Quelle wie alle anderen
   * (`pflichtTage`) und hoert bei gestern auf.
   *
   * Der Test bleibt, aber mit umgekehrtem Vorzeichen: er haelt fest, dass
   * beide Wege jetzt UEBEREINSTIMMEN. Genau ihr Auseinanderlaufen war der
   * Fehler — „00:00 von 176:00" in der Monatsauswertung, waehrend die
   * Startseite fuer denselben Mitarbeiter „0 h" zeigte.
   */
  it('stimmt mit dem laufenden Monatsstand ueberein', () => {
    const heute = new Date();
    const user = { ...monteur, appStartDate: monatsStart() };
    const stats = calcMonthStats(user, [], [], heute.getFullYear(), heute.getMonth());

    // Solltage bis gestern — dieselbe Zahl wie im Saldo.
    expect(stats.requiredDays).toBe(werktageBisGestern());
    // Und damit derselbe Saldo wie ueber calcOverallSaldo.
    expect(stats.saldoMin / 60).toBeCloseTo(calcOverallSaldo(user, []).saldoH, 2);
    // Der laufende Monat ist als solcher erkennbar.
    expect(stats.istLaufend).toBe(true);
  });

  it('laesst einen ABGESCHLOSSENEN Monat unveraendert', () => {
    /**
     * Die Begrenzung auf gestern darf nur den laufenden Monat betreffen. Ein
     * vergangener Monat liegt komplett in der Vergangenheit und muss weiter
     * sein volles Soll tragen — sonst waere jede Lohnabrechnung zu niedrig.
     */
    const heute = new Date();
    const vormonat = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);
    const user = { ...monteur, appStartDate: localDateStr(vormonat) };
    const stats = calcMonthStats(
      user, [], [], vormonat.getFullYear(), vormonat.getMonth(),
    );

    // Alle Werktage des Vormonats, ohne Feiertage.
    let erwartet = 0;
    const letzter = new Date(heute.getFullYear(), heute.getMonth(), 0).getDate();
    for (let t = 1; t <= letzter; t++) {
      const d = new Date(vormonat.getFullYear(), vormonat.getMonth(), t);
      if (d.getDay() >= 1 && d.getDay() <= 5 && !isAustrianHoliday(d)) erwartet++;
    }
    expect(stats.workdaysInMonth).toBe(erwartet);
    expect(stats.istLaufend).toBe(false);
  });

  it('rechnet gebuchte Zeit gegen das Soll der vergangenen Tage', () => {
    const start = monatsStart();
    const user = { ...monteur, appStartDate: start };
    // Eine Buchung am Monatsersten, 8,5 h Arbeitszeit.
    const eintrag: TimeEntry = {
      id: 'e1',
      companyId: 'perl',
      userId: 'u1',
      userName: 'Max Mustermann',
      date: start,
      status: 'Anwesend',
      startTime: '07:00',
      endTime: '16:00',
      breakDuration: 30,
      travelTime: 0,
    } as TimeEntry;
    const ohne = calcOverallSaldo(user, []).saldoH;
    const mit = calcOverallSaldo(user, [eintrag]).saldoH;
    // Die Buchung verbessert den Stand um 8,5 h — unabhaengig davon, welcher
    // Tag heute ist. Faellt der Erste auf ein Wochenende, zaehlt sie als
    // reines Plus, sonst gegen das Tagessoll.
    expect(Math.round((mit - ohne) * 100) / 100).toBe(8.5);
  });
});
