import { describe, it, expect } from 'vitest';
import { calcMonthStats, pflichtTage } from '@/lib/time';
import { eintrittsHinweis } from '@/features/time/eintrittsHinweis';
import { austrittFehler, alsEntwurf, alsProfil, entwurfFehler, leererEntwurf } from '@/features/users/benutzerEntwurf';
import { ohneSollAussage, personenImMonat } from '@/features/accounting/personenImMonat';
import { buildMonthCsv, buildUserCsv, type UserWithEntries } from '@/features/accounting/export';
import type { AppUser, TimeEntry } from '@/types';

/*
  DAS AUSTRITTSDATUM (E87): das Soll endet am letzten Arbeitstag, und damit
  stehen Soll und Saldo eines Ausgeschiedenen wieder da. Ohne Austritt bleibt
  es, wie es war — dafür stehen die Gegenproben.
*/
const person = (over: Partial<AppUser> = {}): AppUser =>
  ({
    id: 'u1', companyId: 'c', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25,
    workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01', initialOvertime: 0, ...over,
  }) as AppUser;

describe('pflichtTage endet am Austritt', () => {
  // Juni 2025: 21 Werktage (der 9. ist Pfingstmontag, der 19. Fronleichnam).
  const juni = (u: AppUser) => pflichtTage(u, new Date(2025, 5, 1), new Date(2025, 5, 30));

  it('mit Austritt am 13.06. zählen nur die Tage bis dahin', () => {
    const tage = juni(person({ austritt: '2025-06-13' }));
    expect(tage[tage.length - 1]).toBe('2025-06-13');
    expect(tage.every((t) => t <= '2025-06-13')).toBe(true);
  });

  it('Gegenprobe: ohne Austritt der ganze Monat', () => {
    expect(juni(person()).slice(-1)[0]).toBe('2025-06-30');
  });

  it('ein Austritt nach dem Monat ändert nichts am Monat', () => {
    expect(juni(person({ austritt: '2025-09-30' }))).toEqual(juni(person()));
  });

  it('das Monatssoll des Austrittsmonats: 8 h je Werktag bis zum Austritt', () => {
    const u = person({ austritt: '2025-06-13' });
    const s = calcMonthStats(u, [], [], 2025, 5, true);
    expect(s.sollMin).toBe(pflichtTage(u, new Date(2025, 5, 1), new Date(2025, 5, 30)).length * 8 * 60);
    expect(s.sollMin).toBeLessThan(calcMonthStats(person(), [], [], 2025, 5, true).sollMin);
  });
});

describe('die Maske sperrt nach dem Austritt', () => {
  it('am Tag danach gesperrt, am Austrittstag nicht', () => {
    const u = { eintritt: '2025-01-01', appStartDate: '2025-01-01', austritt: '2025-06-13' };
    expect(eintrittsHinweis(u, '2025-06-16')).toEqual({ sperrt: true, text: 'Nach dem Austritt am 13.06.2025 lässt sich nicht buchen.' });
    expect(eintrittsHinweis(u, '2025-06-13')).toBeNull();
  });
});

describe('der Austritt liegt nie davor', () => {
  it('vor Eintritt oder Saldo-Start: ein Fehler mit Grund', () => {
    expect(austrittFehler('2024-12-31', '2025-01-01', '2025-01-01')).toMatch(/vor dem Eintritt oder dem Saldo-Start/);
    expect(austrittFehler('2025-02-01', '2025-01-01', '2025-03-01')).toMatch(/Saldo-Start/);
    expect(entwurfFehler({ ...leererEntwurf(), eintritt: '2025-01-01', appStartDate: '2025-01-01', austritt: '2024-06-01' }))
      .toMatch(/Austritt/);
  });

  it('Gegenprobe: leer, am Eintritt selbst oder danach — in Ordnung', () => {
    expect(austrittFehler('', '2025-01-01', '2025-01-01')).toBeNull();
    expect(austrittFehler('2025-01-01', '2025-01-01', '2025-01-01')).toBeNull();
    expect(austrittFehler('2025-06-13', '2025-01-01', '2025-01-01')).toBeNull();
  });

  it('der Entwurf trägt ihn hin und zurück; leer wird null', () => {
    expect(alsProfil(alsEntwurf(person({ austritt: '2025-06-13' }))).austritt).toBe('2025-06-13');
    expect(alsProfil(alsEntwurf(person())).austritt).toBeNull();
  });
});

describe('wer in der Übersicht steht', () => {
  const aus = person({ uid: 'a', name: 'Anna', active: false, austritt: '2025-06-13' });
  const ohne = person({ uid: 'o', name: 'Otto', active: false });
  const aktiv = person({ uid: 'k', name: 'Karl' });

  it('wer im Monat austritt, steht da — auch ohne Buchung', () => {
    expect(personenImMonat([aus, ohne, aktiv], new Set(), '2025-06').map((u) => u.uid)).toEqual(['a', 'k']);
  });

  it('Gegenprobe: im Monat danach nicht mehr, und ohne Austritt nur mit Buchung', () => {
    expect(personenImMonat([aus, ohne, aktiv], new Set(), '2025-07').map((u) => u.uid)).toEqual(['k']);
    expect(personenImMonat([aus, ohne, aktiv], new Set(['o']), '2025-07').map((u) => u.uid)).toEqual(['k', 'o']);
  });

  it('Soll und Saldo sind nur ohne Austrittsdatum keine Aussage', () => {
    expect(ohneSollAussage(aus)).toBe(false);
    expect(ohneSollAussage(ohne)).toBe(true);
    expect(ohneSollAussage(aktiv)).toBe(false);
  });
});

describe('die Monats-CSV', () => {
  const eintrag = { id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1', userName: 'Max Mustermann', startTime: '07:00', endTime: '16:30', breakDuration: 30 } as TimeEntry;
  const zeile = (u: AppUser): UserWithEntries => ({
    user: u, monthEntries: [eintrag], stats: calcMonthStats(u, [eintrag], [eintrag], 2025, 5, true), deaktiviert: u.active === false,
  });
  const zusammenfassung = (csv: string) => {
    const zeilen = csv.split('\n');
    return zeilen.slice(zeilen.findIndex((z) => z.startsWith('Mitarbeiter-Zusammenfassung')) + 1);
  };

  it('ausgeschieden mit Austritt: Soll und Saldo bis dahin, Resturlaub leer, „Austritt 13.06.2025“', () => {
    const [kopf, z] = zusammenfassung(buildMonthCsv([zeile(person({ active: false, austritt: '2025-06-13' }))], 2025, 5, true));
    const spalten = kopf.split(';');
    const werte = z.split(';');
    expect(werte[spalten.indexOf('Soll(Std)')]).not.toBe('');
    expect(werte[spalten.indexOf('Saldo(Std)')]).not.toBe('');
    expect(werte[spalten.indexOf('Resturlaub')]).toBe('');
    expect(werte[spalten.indexOf('Konto')]).toBe('Austritt 13.06.2025');
  });

  it('Gegenprobe: deaktiviert ohne Austritt — Soll und Saldo leer, „deaktiviert“', () => {
    const [kopf, z] = zusammenfassung(buildMonthCsv([zeile(person({ active: false }))], 2025, 5, true));
    const spalten = kopf.split(';');
    const werte = z.split(';');
    expect(werte[spalten.indexOf('Soll(Std)')]).toBe('');
    expect(werte[spalten.indexOf('Saldo(Std)')]).toBe('');
    expect(werte[spalten.indexOf('Konto')]).toBe('deaktiviert');
  });

  it('gleich geblieben: nur Aktive ohne Austritt — keine Spalte „Konto“', () => {
    const [kopf] = zusammenfassung(buildMonthCsv([zeile(person())], 2025, 5, true));
    expect(kopf.split(';')).not.toContain('Konto');
  });

  it('die CSV einer Person nennt den Austritt und rechnet Soll und Saldo', () => {
    const u = person({ active: false, austritt: '2025-06-13' });
    const csv = buildUserCsv(u, [eintrag], calcMonthStats(u, [eintrag], [eintrag], 2025, 5, true), 2025, 5, true, {}, [], undefined, true);
    expect(csv).toContain('Zeiterfassung: Max Mustermann (ausgetreten am 13.06.2025)');
    expect(csv).toMatch(/Soll;\d/);
    expect(csv).toMatch(/Resturlaub;—/);
  });
});
