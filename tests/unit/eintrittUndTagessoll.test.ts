/**
 * Testbericht 30.09.2026, Paket 2b — Eintritt, Saldo-Start, Tagessoll.
 *
 *   M4  Beim Umstieg ist der Resturlaub Pflicht (Komponententest der Anlage).
 *   M5  Ein eigenes Tagessoll je Wochentag, etwa ein kurzer Freitag.
 *   M6  Eintritt und Saldo-Start sind zwei Daten, gleich benannt in Anlage und Akte.
 *   M7  Vor dem Eintritt sperrt die Datenbank; zwischen Eintritt und
 *       Saldo-Start warnt die Maske.
 */
import { describe, it, expect } from 'vitest';
import {
  calcMonthStats, calcOverallSaldo, hatTagessoll, localDateStr, tagessollStunden,
} from '@/lib/time';
import { isAustrianHoliday } from '@shared/feiertage';
import {
  alsEntwurf, alsProfil, entwurfFehler, gleich, tagessollAusEntwurf, tagessollNachTagen,
  urlaubsfeldName,
} from '@/features/users/benutzerEntwurf';
import { eintrittsHinweis } from '@/features/time/eintrittsHinweis';
import type { AppUser, TimeEntry } from '@/types';

const person = (over: Partial<AppUser> = {}): AppUser =>
  ({
    id: 'u1', companyId: 'c', uid: 'u1', name: 'Test', email: 't@x.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 39,
    yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01',
    initialOvertime: 0, ...over,
  }) as AppUser;

// Mo–Do 8,5 Stunden, Freitag 5 — zusammen 39.
const KURZER_FREITAG = { '1': 8.5, '2': 8.5, '3': 8.5, '4': 8.5, '5': 5 };

describe('M5 — Tagessoll je Wochentag', () => {
  it('ohne eigenes Soll bleibt es Wochenstunden durch Arbeitstage', () => {
    const p = person();
    expect(hatTagessoll(p)).toBe(false);
    expect(tagessollStunden(p, '2025-06-20')).toBeCloseTo(7.8); // Freitag
    expect(tagessollStunden(p, '2025-06-16')).toBeCloseTo(7.8); // Montag
  });

  it('mit eigenem Soll gilt das des Wochentags', () => {
    const p = person({ tagessoll: KURZER_FREITAG });
    expect(hatTagessoll(p)).toBe(true);
    expect(tagessollStunden(p, '2025-06-20')).toBe(5); // Freitag
    expect(tagessollStunden(p, '2025-06-16')).toBe(8.5); // Montag
  });

  it('das Monatssoll folgt dem kurzen Freitag', () => {
    /*
      16.06. bis 30.06.2025: zehn Solltage (Fronleichnam am 19.06. fällt
      weg), davon zwei Freitage (20.06., 27.06.) und acht Tage Mo–Do.
      Gleichmässig wären es 10 × 7,8 = 78 Stunden — hier zufällig dasselbe.
      Der Unterschied zeigt sich, sobald ein Freitag fehlt: Krank am 20.06.
    */
    const p = person({ appStartDate: '2025-06-16', tagessoll: KURZER_FREITAG });
    const leer = calcMonthStats(p, [], [], 2025, 5, true);
    expect(leer.sollMin).toBe((8 * 8.5 + 2 * 5) * 60);

    const krankAmFreitag: TimeEntry[] = [
      { id: 'k', companyId: 'c', userId: 'u1', date: '2025-06-20', status: 'Krank' } as TimeEntry,
    ];
    const s = calcMonthStats(p, krankAmFreitag, krankAmFreitag, 2025, 5, true);
    // Der Freitag nimmt fünf Stunden vom Soll, nicht 7,8.
    expect(s.sollMin).toBe((8 * 8.5 + 1 * 5) * 60);
  });

  it('wer an jedem Tag sein Soll arbeitet, hat einen Saldo von null', () => {
    /*
      Die Gegenprobe zur alten Rechnung: dort galten auch am Freitag 7,8
      Stunden, und fünf gearbeitete Stunden liessen 2,8 im Minus.
    */
    const p = person({ tagessoll: KURZER_FREITAG });
    const start = new Date();
    start.setDate(start.getDate() - 14);
    p.appStartDate = localDateStr(start);
    const eintraege: TimeEntry[] = [];
    for (let i = 14; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const tag = d.getDay();
      if (tag === 0 || tag === 6 || isAustrianHoliday(d)) continue;
      eintraege.push({
        id: `e${i}`, companyId: 'c', userId: 'u1', date: localDateStr(d), status: 'Anwesend',
        startTime: '07:00',
        endTime: tag === 5 ? '12:00' : '16:00',
        breakDuration: tag === 5 ? 0 : 30,
      } as TimeEntry);
    }
    const r = calcOverallSaldo(p, eintraege, true);
    expect(r.saldoH).toBe(0);
    expect(r.daysWithoutEntry).toBe(0);
  });
});

describe('M5 — Tagessoll im Formular', () => {
  const entwurf = alsEntwurf(person());

  it('ist erst vollständig, wenn jeder Arbeitstag eine Zahl hat', () => {
    expect(tagessollAusEntwurf({ ...entwurf, tagessoll: { '1': '8,5', '2': '8,5' } })).toBeNull();
    expect(
      tagessollAusEntwurf({
        ...entwurf,
        tagessoll: { '1': '8,5', '2': '8,5', '3': '8,5', '4': '8,5', '5': '5' },
      }),
    ).toEqual(KURZER_FREITAG);
  });

  it('die Wochenstunden werden die Summe', () => {
    const p = alsProfil({
      ...entwurf,
      weeklyTargetHours: '40',
      tagessoll: { '1': '8,5', '2': '8,5', '3': '8,5', '4': '8,5', '5': '5' },
    });
    expect(p.weeklyTargetHours).toBe(39);
    expect(p.tagessoll).toEqual(KURZER_FREITAG);
  });

  it('ohne eigenes Soll bleibt es leer', () => {
    expect(alsProfil(entwurf).tagessoll).toBeNull();
  });

  it('ein neuer Arbeitstag bekommt ein leeres Feld, ein weggefallener verliert seins', () => {
    const mit = { ...entwurf, tagessoll: { '1': '8', '5': '5' }, workDays: [1, 5] };
    expect(tagessollNachTagen(mit, 3)).toEqual({ '1': '8', '5': '5', '3': '' });
    expect(tagessollNachTagen(mit, 5)).toEqual({ '1': '8' });
    // Ohne eigenes Soll ändert ein Arbeitstag nichts daran.
    expect(tagessollNachTagen({ ...entwurf, tagessoll: {} }, 3)).toEqual({});
  });

  it('die Reihenfolge der Schlüssel ist keine Änderung', () => {
    const a = { ...entwurf, tagessoll: { '1': '8', '5': '5' } };
    const b = { ...entwurf, tagessoll: { '5': '5', '1': '8' } };
    expect(gleich(a, b)).toBe(true);
  });
});

describe('M6 — Eintritt und Saldo-Start', () => {
  it('der Bestand ohne Eintritt übernimmt den Saldo-Start', () => {
    expect(alsEntwurf(person({ appStartDate: '2026-10-01' })).eintritt).toBe('2026-10-01');
    expect(alsEntwurf(person({ eintritt: '2015-03-01', appStartDate: '2026-10-01' })).eintritt)
      .toBe('2015-03-01');
  });

  it('der Eintritt geht mit ins Profil', () => {
    const e = alsEntwurf(person({ eintritt: '2015-03-01', appStartDate: '2026-10-01' }));
    expect(alsProfil(e).eintritt).toBe('2015-03-01');
  });

  it('ein Eintritt nach dem Saldo-Start wird nicht gespeichert', () => {
    const e = alsEntwurf(person({ appStartDate: '2026-10-01' }));
    expect(entwurfFehler({ ...e, eintritt: '2026-10-02' })).toMatch(/Eintrittsdatum liegt nach/);
    expect(entwurfFehler({ ...e, eintritt: '2026-10-01' })).toBeNull();
    expect(entwurfFehler({ ...e, eintritt: '2015-03-01' })).toBeNull();
  });

  it('das Urlaubsfeld heißt in Anlage und Akte gleich', () => {
    expect(urlaubsfeldName({ eintritt: '2026-10-01', appStartDate: '2026-10-01' }))
      .toBe('Urlaub im ersten Jahr');
    expect(urlaubsfeldName({ eintritt: '2015-03-01', appStartDate: '2026-10-01' }))
      .toBe('Resturlaub beim Umstieg');
  });
});

describe('M7 — die Maske vor dem Eintritt und vor dem Saldo-Start', () => {
  const p = { eintritt: '2026-10-01', appStartDate: '2026-10-15' };

  it('vor dem Eintritt: gesperrt', () => {
    const h = eintrittsHinweis(p, '2026-09-30');
    expect(h?.sperrt).toBe(true);
    expect(h?.text).toBe('Vor dem Eintritt am 01.10.2026 lässt sich nicht buchen.');
  });

  it('zwischen Eintritt und Saldo-Start: gewarnt, nicht gesperrt', () => {
    const h = eintrittsHinweis(p, '2026-10-05');
    expect(h?.sperrt).toBe(false);
    expect(h?.text).toMatch(/vor dem Saldo-Start am 15\.10\.2026/);
  });

  it('ab dem Saldo-Start: nichts', () => {
    expect(eintrittsHinweis(p, '2026-10-15')).toBeNull();
    expect(eintrittsHinweis(null, '2026-09-30')).toBeNull();
  });
});
