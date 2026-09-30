import { describe, it, expect } from 'vitest';
import { calcOverallSaldo, calcMonthStats, localDateStr, pflichtTage } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Gesamtsaldo und Monatsauswertung rechnen dieselbe Zeit auf zwei Wegen
 * (offene Punkte C5).
 *
 * `calcOverallSaldo` schreibt einen Krank- oder Urlaubstag als vollen
 * Solltag ins IST; `calcMonthStats` zieht ihn vom SOLL ab — so, wie es die
 * Lohnverrechnung lesen will. Über alle Monate seit dem Eintritt summiert
 * müssen beide auf die Minute dasselbe ergeben; sonst zeigen Zeitkonto und
 * Mitarbeiterübersicht für dieselbe Person zwei verschiedene Salden.
 *
 * GÜLTIGE DATEN, WIE SIE DIE DATENBANK SCHREIBT: Krank und Urlaub liegen nur
 * auf Pflichttagen (Krankmeldung und Urlaubsantrag legen sie so an). Ein
 * Krankentag an einem Sonntag oder Feiertag würde nur im Gesamtsaldo
 * gutgeschrieben — genau das ist der Unterschied, den C5 benennt; solange
 * nur die Datenbankfunktionen solche Einträge anlegen, entsteht er nicht.
 * Gearbeitet werden darf dagegen auch am Wochenende und am Feiertag.
 */

function wuerfel(saat: number) {
  let x = saat;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function baueFall(saat: number) {
  const r = wuerfel(saat);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const eintritt = new Date(heute);
  eintritt.setDate(eintritt.getDate() - (20 + Math.floor(r() * 300)));

  const arbeitstage = r() < 0.3 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const user: AppUser = {
    id: 'u1',
    companyId: 'perl',
    uid: 'u1',
    name: 'Prüffall',
    email: 'p@perl.at',
    role: 'Mitarbeiter',
    active: true,
    weeklyTargetHours: arbeitstage.length === 4 ? 32 : r() < 0.2 ? 20 : 40,
    yearlyVacationDays: 25,
    workDays: arbeitstage,
    appStartDate: localDateStr(eintritt),
    initialOvertime: 0,
  };

  const pflicht = new Set(pflichtTage(user, eintritt, heute));
  const eintraege: TimeEntry[] = [];
  for (const d = new Date(eintritt); d < heute; d.setDate(d.getDate() + 1)) {
    const datum = localDateStr(d);
    const w = r();
    if (pflicht.has(datum)) {
      if (w < 0.12) continue; // Lücke
      // Berufsschule (4.1) erfüllt das Soll wie Krank und Urlaub — auf beiden Wegen.
      const status = w < 0.18 ? 'Krank' : w < 0.25 ? 'Urlaub' : w < 0.29 ? 'Zeitausgleich' : w < 0.33 ? 'Berufsschule' : 'Anwesend';
      eintraege.push(eintrag(datum, status, r));
    } else if (w < 0.1) {
      // Ein Notdienst am freien Tag oder am Feiertag.
      eintraege.push(eintrag(datum, 'Anwesend', r));
    }
  }
  return { user, eintraege, eintritt, heute };
}

function eintrag(datum: string, status: TimeEntry['status'], r: () => number): TimeEntry {
  const anwesend = status === 'Anwesend';
  const nacht = anwesend && r() < 0.08;
  return {
    companyId: 'perl',
    userId: 'u1',
    userName: 'Prüffall',
    date: datum,
    status,
    startTime: anwesend ? (nacht ? '22:00' : '07:00') : undefined,
    endTime: anwesend ? (nacht ? '06:00' : r() < 0.5 ? '16:00' : '17:30') : undefined,
    breakDuration: anwesend ? (r() < 0.5 ? 30 : 45) : undefined,
  } as TimeEntry;
}

/** Summe der Monatssalden vom Eintrittsmonat bis zum laufenden Monat, in Minuten. */
function summeDerMonate(user: AppUser, eintraege: TimeEntry[], eintritt: Date, heute: Date): number {
  let summe = 0;
  for (let j = eintritt.getFullYear(), m = eintritt.getMonth(); ; ) {
    const praefix = `${j}-${String(m + 1).padStart(2, '0')}`;
    const imMonat = eintraege.filter((e) => e.date.startsWith(praefix));
    summe += calcMonthStats(user, imMonat, [], j, m, true).saldoMin;
    if (j === heute.getFullYear() && m === heute.getMonth()) break;
    m += 1;
    if (m === 12) { m = 0; j += 1; }
  }
  return summe;
}

describe('Gesamtsaldo und Monatsauswertung ergeben dieselbe Zeit (C5)', () => {
  it.each([2, 3, 7, 11, 19, 42, 77, 101, 256, 999])('stimmt für Zufallsfall %i überein', (saat) => {
    const { user, eintraege, eintritt, heute } = baueFall(saat);
    const gesamt = calcOverallSaldo(user, eintraege, true);
    const monate = summeDerMonate(user, eintraege, eintritt, heute);
    // `saldoH` ist auf zwei Stellen gerundet — eine Minute Toleranz.
    expect(Math.abs(gesamt.saldoH * 60 - monate)).toBeLessThanOrEqual(1);
  });
});
