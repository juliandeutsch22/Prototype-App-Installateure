import { describe, it, expect } from 'vitest';
import { calcMonthStats, urlaubsStand, vorzeichenTage, type UrlaubsPosten } from '@/lib/time';
import { resturlaubAus } from '@/features/dashboard/start/eigeneKonten';
import type { AppUser, Vacation } from '@/types';

/**
 * Anpassungen des Urlaubsanspruchs (Plan 10.3, Entscheidung 6 vom 03.10.2026).
 *
 * Eine Anpassung ändert den Jahrgang ihres Urlaubsjahres — Übertrag und
 * Verjährung rechnen mit dem Gekürzten. Ohne Anpassungen muss jede Zahl
 * genau so herauskommen wie vorher.
 */

const ANNA = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2025-01-01' };
const POSTEN: UrlaubsPosten[] = [
  { von: '2025-07-01', tage: 10 },
  { von: '2026-03-02', tage: 5 },
];

describe('Anspruch mit Anpassung', () => {
  it('ohne Anpassungen dasselbe wie ohne den Parameter — für jedes Jahr und jede Regel', () => {
    for (const jahr of [2025, 2026, 2027, 2028]) {
      for (const regel of [
        { art: 'verjaehrung' as const },
        { art: 'stichtag' as const, stichtag: '03-31' },
        { art: 'verjaehrung' as const, jahresbeginn: '07-01' },
      ]) {
        const vorher = urlaubsStand(ANNA, jahr, POSTEN, regel);
        expect(urlaubsStand(ANNA, jahr, POSTEN, regel, [])).toEqual(vorher);
        expect(vorher.angepasst).toBe(0);
      }
    }
  });

  it('25 Tage, drei Monate unbezahlt: 6,25 weniger im betroffenen Jahr', () => {
    const stand = urlaubsStand(ANNA, 2026, POSTEN, undefined, [{ urlaubsjahr: 2026, tage: -6.25 }]);
    const ohne = urlaubsStand(ANNA, 2026, POSTEN);
    expect(stand.anspruch).toBeCloseTo(ohne.anspruch - 6.25, 2);
    expect(stand.rest).toBeCloseTo(ohne.rest - 6.25, 2);
    expect(stand.angepasst).toBe(-6.25);
  });

  it('der gekürzte Jahrgang trägt weniger ins Folgejahr', () => {
    const anp = [{ urlaubsjahr: 2025, tage: -6.25 }];
    const ohne = urlaubsStand(ANNA, 2026, POSTEN);
    const mit = urlaubsStand(ANNA, 2026, POSTEN, undefined, anp);
    expect(mit.uebertrag).toBeCloseTo(ohne.uebertrag - 6.25, 2);
    // Im Folgejahr selbst ist nichts angepasst.
    expect(mit.angepasst).toBe(0);
  });

  it('eine Anpassung eines späteren Jahres ändert das frühere nicht', () => {
    const ohne = urlaubsStand(ANNA, 2025, POSTEN);
    expect(urlaubsStand(ANNA, 2025, POSTEN, undefined, [{ urlaubsjahr: 2026, tage: -5 }])).toEqual(ohne);
  });

  it('gilt auch im Startjahr mit mitgebrachtem Bestand', () => {
    const neu = { yearlyVacationDays: 25, initialVacationDays: 12, appStartDate: '2026-04-01' };
    const stand = urlaubsStand(neu, 2026, [], undefined, [{ urlaubsjahr: 2026, tage: -2 }]);
    expect(stand.anspruch).toBe(10);
    expect(stand.ausAnfangsbestand).toBe(true);
  });

  it('ohne Startdatum: Jahresanspruch plus Anpassung', () => {
    const ohneStart = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: null };
    const stand = urlaubsStand(ohneStart, 2026, [], undefined, [{ urlaubsjahr: 2026, tage: 3 }]);
    expect(stand.anspruch).toBe(28);
    expect(stand.rest).toBe(28);
  });

  it('mehrere Anpassungen eines Jahres zählen zusammen', () => {
    const stand = urlaubsStand(ANNA, 2026, [], undefined, [
      { urlaubsjahr: 2026, tage: -6.25 },
      { urlaubsjahr: 2026, tage: -2.08 },
    ]);
    expect(stand.angepasst).toBe(-8.33);
  });
});

describe('Die Aufrufer reichen die Anpassungen weiter', () => {
  const profil = {
    uid: 'u1', name: 'Anna', role: 'Mitarbeiter', companyId: 'c', email: 'a@b.at',
    yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2025-01-01', workDays: [1, 2, 3, 4, 5],
  } as unknown as AppUser;

  it('Resturlaub auf der Startseite', () => {
    const ohne = resturlaubAus([] as Vacation[], profil, null);
    const mit = resturlaubAus([] as Vacation[], profil, null, [
      { id: 'a', companyId: 'c', userId: 'u1', urlaubsjahr: new Date().getFullYear(), tage: -4, grund: 'Karenz' },
    ]);
    expect(mit.rest).toBe(ohne.rest - 4);
  });

  it('Monatsauswertung (Mitarbeiterübersicht, Lohn-CSV)', () => {
    const ohne = calcMonthStats(profil, [], [], 2026, 5, true, {});
    const mit = calcMonthStats(profil, [], [], 2026, 5, true, { anpassungen: [{ urlaubsjahr: 2026, tage: -6.25 }] });
    expect(mit.urlaubRest).toBeCloseTo(ohne.urlaubRest - 6.25, 2);
    expect(mit.urlaubAngepasst).toBe(-6.25);
    expect(ohne.urlaubAngepasst).toBe(0);
  });
});

describe('Anzeige mit Vorzeichen', () => {
  it('schreibt Minus als echtes Minuszeichen und den Singular bei einem Tag', () => {
    expect(vorzeichenTage(-6.25)).toBe('−6,25 Tage');
    expect(vorzeichenTage(2)).toBe('+2 Tage');
    expect(vorzeichenTage(-1)).toBe('−1 Tag');
  });
});
