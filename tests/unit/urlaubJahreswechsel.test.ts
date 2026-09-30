import { describe, it, expect } from 'vitest';
import { antragNachUrlaubsjahr, urlaubsStand, type UrlaubsPosten } from '@/lib/time';
import { tagesAnteil, urlaubsTage } from '@shared/feiertage';

/**
 * Testbericht 30.09.2026, H3 — Betriebsurlaub über den Jahreswechsel.
 *
 * Der Betriebsurlaub vom 24.12.2026 bis 10.01.2027 hat 8 Urlaubstage
 * (24. und 31.12. je ein halber), davon 4 im Jahr 2027. Die Urlaubsseite zog
 * alle 8 im Jahr 2026 ab — ein Antrag zählte als Ganzes zum Jahr seines
 * Beginns. Lohn-CSV und Mitarbeiterübersicht zählen die gebuchten Tage und
 * zogen richtig 4 ab. Zwei Zahlen für dieselbe Frage.
 *
 * Jetzt verteilt `antragNachUrlaubsjahr` den Antrag auf die Urlaubsjahre,
 * bevor `urlaubsStand` ihn zählt — und beide Wege kommen auf dieselbe Zahl.
 */

const MO_FR = [1, 2, 3, 4, 5];
const BETRIEBSURLAUB = { von: '2026-12-24', bis: '2027-01-10', tage: 8 };

/** So zählen Lohn-CSV und Mitarbeiterübersicht: je gebuchtem Tag. */
function wieGebucht(von: string, bis: string): UrlaubsPosten[] {
  return urlaubsTage(MO_FR, von, bis).map((t) => ({ von: t, tage: tagesAnteil(t, true) }));
}

describe('Ein Antrag über den Jahreswechsel', () => {
  it('wird auf die beiden Urlaubsjahre verteilt', () => {
    expect(antragNachUrlaubsjahr(BETRIEBSURLAUB, MO_FR, true)).toEqual([
      { von: '2026-12-24', tage: 4 },
      { von: '2027-01-04', tage: 4 },
    ]);
  });

  it('Max Testermann: 1 Tag im Sommer plus Betriebsurlaub — 5 genommen, 20 übrig (nicht 9 und 16)', () => {
    const max = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2026-01-01' };
    const antraege = [{ von: '2026-07-03', bis: '2026-07-03', tage: 1 }, BETRIEBSURLAUB];
    const posten = antraege.flatMap((a) => antragNachUrlaubsjahr(a, MO_FR, true));

    const stand2026 = urlaubsStand(max, 2026, posten);
    expect(stand2026.genommen).toBe(5);
    expect(stand2026.rest).toBe(20);
    expect(urlaubsStand(max, 2027, posten).genommen).toBe(4);
  });

  it('Urlaubsseite und Zeiterfassung sagen dieselbe Zahl', () => {
    const max = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2026-01-01' };
    const ausAntrag = antragNachUrlaubsjahr(BETRIEBSURLAUB, MO_FR, true);
    const ausBuchung = wieGebucht(BETRIEBSURLAUB.von, BETRIEBSURLAUB.bis);
    for (const jahr of [2026, 2027]) {
      expect(urlaubsStand(max, jahr, ausAntrag)).toEqual(urlaubsStand(max, jahr, ausBuchung));
    }
  });

  it('Neueintritt im November: der Rest wird nicht negativ', () => {
    // Eintritt 02.11.2026, aliquot 4,33 Tage mitgebracht.
    const neu = { yearlyVacationDays: 25, initialVacationDays: 4.33, appStartDate: '2026-11-02' };
    const posten = antragNachUrlaubsjahr(BETRIEBSURLAUB, MO_FR, true);
    const stand = urlaubsStand(neu, 2026, posten);
    expect(stand.genommen).toBe(4);
    expect(stand.rest).toBeCloseTo(0.33, 2);
    expect(urlaubsStand(neu, 2026, posten)).toEqual(
      urlaubsStand(neu, 2026, wieGebucht(BETRIEBSURLAUB.von, BETRIEBSURLAUB.bis)),
    );
  });
});

describe('Was sich nicht ändert', () => {
  it('ein Antrag innerhalb eines Jahres bleibt ein Posten mit seiner Tageszahl', () => {
    expect(antragNachUrlaubsjahr({ von: '2026-08-03', bis: '2026-08-07', tage: 5 }, MO_FR, true))
      .toEqual([{ von: '2026-08-03', tage: 5 }]);
  });

  it('die festgehaltene Tageszahl bleibt die Summe — auch wenn die Arbeitstage sich später ändern', () => {
    // Genehmigt mit 8 Tagen; heute arbeitet die Person nur noch Mo–Do.
    const teile = antragNachUrlaubsjahr(BETRIEBSURLAUB, [1, 2, 3, 4], true);
    expect(teile.reduce((s, p) => s + p.tage, 0)).toBe(8);
  });

  it('beim Urlaubsjahr ab Juli liegt der Schnitt am 1. Juli', () => {
    const teile = antragNachUrlaubsjahr({ von: '2026-06-29', bis: '2026-07-03', tage: 5 }, MO_FR, true, '07-01');
    expect(teile).toEqual([
      { von: '2026-06-29', tage: 2 },
      { von: '2026-07-01', tage: 3 },
    ]);
  });
});
