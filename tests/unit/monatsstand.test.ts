import { describe, it, expect } from 'vitest';
import { calcOverallSaldo, calcMonthStats, localDateStr } from '@/lib/time';
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
   * Die Gegenprobe, die den Fehler festhaelt: dieselbe Lage mit
   * `calcMonthStats` gerechnet ergibt das Soll des GANZEN Monats. Die
   * Funktion ist nicht kaputt — sie beantwortet eine andere Frage. Genau
   * deshalb steht sie hier als Warnung.
   */
  it('calcMonthStats rechnet den ganzen Monat — deshalb nicht fuer den laufenden', () => {
    const heute = new Date();
    const user = { ...monteur, appStartDate: monatsStart() };
    const stats = calcMonthStats(user, [], [], heute.getFullYear(), heute.getMonth());
    // Es setzt jeden Werktag des Monats an, nicht nur die vergangenen.
    expect(stats.requiredDays).toBeGreaterThan(werktageBisGestern());
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
