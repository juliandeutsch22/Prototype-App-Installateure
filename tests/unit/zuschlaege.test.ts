import { describe, it, expect } from 'vitest';
import { zuschlagszeit, hatZuschlaege, kennzeichen } from '@/features/accounting/zuschlaege';
import { buildMonthCsv, buildUserCsv } from '@/features/accounting/export';
import { calcMonthStats } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Verrechnet, aber nicht ausgewiesen.
 *
 * Die Rechnung bildet aus `isNightWork` und `isEmergency` eigene Positionen
 * mit Aufschlag — der Kunde zahlt den Zuschlag also. Die Lohnausleitung
 * kannte die beiden Felder überhaupt nicht: weder Monats-CSV noch
 * Mitarbeiter-CSV noch Stundennachweis führten eine Spalte dafür.
 *
 * Der Zuschlag ist ein Anspruch des Arbeitnehmers nach Kollektivvertrag. Eine
 * Ausleitung, die ihn verschweigt, sieht dabei vollständig aus — die
 * Gesamtstunden stimmen ja.
 */

const user = (over: Partial<AppUser> = {}): AppUser =>
  ({
    id: 'u1', companyId: 'c', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25,
    workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01', initialOvertime: 0, ...over,
  }) as AppUser;

const entry = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1',
    userName: 'Max Mustermann', startTime: '07:00', endTime: '11:00', breakDuration: 0,
    ...over,
  }) as TimeEntry;

describe('Zuschlagsstunden', () => {
  it('zählt Nacht und Notdienst getrennt', () => {
    const z = zuschlagszeit([
      entry({ isNightWork: true }),
      entry({ isEmergency: true }),
      entry(),
    ]);
    expect(z.nachtMin).toBe(240);
    expect(z.notdienstMin).toBe(240);
    expect(z.beidesMin).toBe(0);
  });

  /*
    DER ROHRBRUCH UM ZWEI UHR FRÜH IST BEIDES. Ohne die dritte Zahl addierte
    die Lohnverrechnung Nacht und Notdienst und zählte diese Stunden doppelt
    — und sähe es der Datei nicht an.
  */
  it('weist die Stunden aus, die beide Kennzeichen tragen', () => {
    const z = zuschlagszeit([entry({ isNightWork: true, isEmergency: true })]);
    expect(z.nachtMin).toBe(240);
    expect(z.notdienstMin).toBe(240);
    expect(z.beidesMin).toBe(240);
  });

  /*
    Ein Krankenstand trägt kein Kennzeichen, und eine Zeile ohne Stunden hat
    nichts beizutragen. Stünden sie mit drin, wäre die Zuschlagssumme höher
    als die Ist-Zeit — eine Zahl, die niemand erklären kann.
  */
  it('lässt Abwesenheiten und leere Zeilen draussen', () => {
    const z = zuschlagszeit([
      entry({ status: 'Krank', isNightWork: true }),
      entry({ status: 'Urlaub', isEmergency: true }),
      entry({ startTime: '08:00', endTime: '08:00', isNightWork: true }),
    ]);
    expect(z).toEqual({ nachtMin: 0, notdienstMin: 0, beidesMin: 0 });
  });

  it('sagt, ob überhaupt etwas auszuweisen ist', () => {
    expect(hatZuschlaege({ nachtMin: 0, notdienstMin: 0, beidesMin: 0 })).toBe(false);
    expect(hatZuschlaege({ nachtMin: 60, notdienstMin: 0, beidesMin: 0 })).toBe(true);
    expect(hatZuschlaege({ nachtMin: 0, notdienstMin: 60, beidesMin: 0 })).toBe(true);
  });

  it('schreibt „Ja" statt eines Kreuzes', () => {
    // Ausgedruckt auf einem Schreibtisch ist ein „x" ein Fleck.
    expect(kennzeichen(true)).toBe('Ja');
    expect(kennzeichen(false)).toBe('');
    expect(kennzeichen(undefined)).toBe('');
  });
});

describe('Zuschläge in den Ausleitungen', () => {
  const eintraege = [
    entry({ isNightWork: true }),
    entry({ id: 'e2', date: '2025-06-03', isNightWork: true, isEmergency: true }),
  ];
  const zeile = () => ({
    user: user(),
    monthEntries: eintraege,
    stats: calcMonthStats(user(), eintraege, eintraege, 2025, 5),
  });

  it('führt die Kennzeichen in der Monats-CSV mit', () => {
    const csv = buildMonthCsv([zeile()], 2025, 5);
    const zeilen = csv.split('\n');
    expect(zeilen[0]).toContain('Nacht;Notdienst');
    // Erster Eintrag: nur Nacht — das Notdienstfeld bleibt leer.
    expect(zeilen[1].endsWith(';Ja;')).toBe(true);
    expect(zeilen[2]).toContain(';Ja;Ja');
  });

  it('summiert sie je Mitarbeiter, samt Überschneidung', () => {
    const csv = buildMonthCsv([zeile()], 2025, 5);
    expect(csv).toContain('Nacht(Std);Notdienst(Std);davon beides(Std)');
    // 8 h Nacht (beide Einträge), 4 h Notdienst, davon 4 h beides.
    expect(csv).toContain('8,00;4,00;4,00');
  });

  /*
    IN DER MITARBEITER-CSV STEHT DER BLOCK IMMER, auch mit null Stunden. Die
    Datei wird maschinell gelesen: eine fehlende Spalte bedeutet dort etwas
    anderes als eine leere, nämlich „diese Auswertung kennt das Thema nicht"
    — und genau das war vorher der Fall.
  */
  it('weist sie in der Mitarbeiter-CSV auch dann aus, wenn keine anfielen', () => {
    const ohne = [entry()];
    const csv = buildUserCsv(user(), ohne, calcMonthStats(user(), ohne, ohne, 2025, 5), 2025, 5);
    expect(csv).toContain('Nachtstunden;0,00 h');
    expect(csv).toContain('Notdienststunden;0,00 h');
    expect(csv).toContain('davon beides;0,00 h');
  });

  it('setzt in der Mitarbeiter-CSV die Kennzeichen je Zeile', () => {
    const csv = buildUserCsv(
      user(),
      eintraege,
      calcMonthStats(user(), eintraege, eintraege, 2025, 5),
      2025,
      5,
    );
    expect(csv).toContain('Arbeitszeit(Std);Nacht;Notdienst;Kommentar');
    expect(csv).toContain('Nachtstunden;8,00 h');
    expect(csv).toContain('Notdienststunden;4,00 h');
  });
});
