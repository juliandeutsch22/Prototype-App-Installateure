import { describe, it, expect } from 'vitest';
import { buchungKonflikt, tageMitEchterDoppelung } from '@/lib/tagesbuchungen';

/**
 * Die Regel, die entscheidet, ob an einem Tag noch eine Zeit dazu darf.
 *
 * SIE ERSETZT EINE SPERRE, DIE ZU WEIT GING: bis hierher war je Mitarbeiter
 * und Tag genau EIN Eintrag erlaubt, ohne Ansehen der Baustelle. Ein Monteur,
 * der drei kleine Baustellen abklappert, konnte davon eine buchen — die
 * uebrigen bekamen keine Stunden, keinen Budgetverbrauch, keine
 * Rechnungsposition.
 *
 * WAS DIE ALTE SPERRE RICHTIG MACHTE, bleibt: zwei Buchungen fuer denselben
 * Einsatz zaehlen doppelt in den Saldo und wandern auf den Lohnzettel.
 */

const A = (projectNumber?: string) => ({ status: 'Anwesend' as const, projectNumber });
const KRANK = { status: 'Krank' as const };
const URLAUB = { status: 'Urlaub' as const };

describe('Noch eine Buchung an diesem Tag?', () => {
  it('laesst die ERSTE Buchung immer durch', () => {
    expect(buchungKonflikt(A('2026-042'), [])).toBeNull();
    expect(buchungKonflikt(KRANK, [])).toBeNull();
    expect(buchungKonflikt(A(), [])).toBeNull();
  });

  it('laesst eine ZWEITE Baustelle am selben Tag zu', () => {
    // Der eigentliche Zweck der Aenderung.
    expect(buchungKonflikt(A('2026-043'), [A('2026-042')])).toBeNull();
  });

  it('laesst auch eine DRITTE und VIERTE zu', () => {
    // „ein monteur kann theoretisch auch drei oder mehr kleine baustellen an
    // einem tag abklappern" — es gibt keine Obergrenze.
    const vorhandene = [A('2026-042'), A('2026-043'), A('2026-044')];
    expect(buchungKonflikt(A('2026-045'), vorhandene)).toBeNull();
  });

  it('blockt DIESELBE Baustelle ein zweites Mal', () => {
    // Das ist der Fall, der den Saldo verfaelscht.
    const grund = buchungKonflikt(A('2026-042'), [A('2026-042')]);
    expect(grund).toMatch(/bereits gebucht/i);
  });

  it('erkennt dieselbe Baustelle trotz PR-Praefix', () => {
    // `2025-001` und `PR-2025-001` sind historisch dasselbe Projekt.
    expect(buchungKonflikt(A('PR-2026-042'), [A('2026-042')])).not.toBeNull();
  });

  it('blockt eine zweite Buchung OHNE Baustelle', () => {
    /**
     * Zwei Eintraege ohne Baustelle sind nicht auseinanderzuhalten — weder
     * fuer den Monteur noch fuer die Buchhaltung. Es ist der Fall, in dem
     * eine Doppelbuchung am ehesten unbemerkt bliebe.
     */
    const grund = buchungKonflikt(A(), [A('2026-042')]);
    expect(grund).toMatch(/braucht eine Baustelle/i);
  });
});

describe('Krank und Urlaub bleiben einzeln', () => {
  /**
   * DER GRUND STEHT IN DER RECHNUNG, nicht im Gefuehl: `calcOverallSaldo`,
   * `calcMonthStats` und `bilanzAusEintraegen` zaehlen Krank- und
   * Urlaubseintraege als GANZE TAGE, je Eintrag einen. Ein zweiter
   * Urlaubseintrag am selben Tag waere ein zweiter Urlaubstag — im Saldo, im
   * Monatsbericht und im Resturlaub.
   */
  it('kein zweiter Urlaub am selben Tag', () => {
    expect(buchungKonflikt(URLAUB, [URLAUB])).toMatch(/ganzen Tag/i);
  });

  it('keine Arbeitszeit an einem Krankentag', () => {
    expect(buchungKonflikt(A('2026-042'), [KRANK])).toMatch(/Krank/);
  });

  it('kein Urlaub an einem Tag mit gebuchten Zeiten', () => {
    expect(buchungKonflikt(URLAUB, [A('2026-042')])).toMatch(/ganzen Tag/i);
  });

  it('nennt in jedem Fall, WAS zu tun ist', () => {
    // Vier Faelle, vier Handlungen — ein gemeinsames „geht nicht" liesse den
    // Monteur raten.
    const gruende = [
      buchungKonflikt(A('2026-042'), [A('2026-042')]),
      buchungKonflikt(A(), [A('2026-042')]),
      buchungKonflikt(URLAUB, [A('2026-042')]),
      buchungKonflikt(A('2026-042'), [URLAUB]),
    ];
    for (const g of gruende) expect(g).toMatch(/bearbeiten|Baustelle|gelöscht/i);
  });
});

describe('Welche Tage sind WIRKLICH doppelt', () => {
  /**
   * Die Zeituebersicht warnte bei JEDEM Tag mit mehr als einem Eintrag. Ab
   * jetzt waere das die Mehrzahl der normalen Tage — eine Warnung, die
   * taeglich grundlos erscheint, wird nach einer Woche nicht mehr gelesen,
   * auch dann nicht, wenn sie einmal recht hat.
   */
  it('schweigt bei zwei verschiedenen Baustellen', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-043' },
    ]);
    expect(t.size).toBe(0);
  });

  it('meldet dieselbe Baustelle zweimal', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    expect([...t]).toEqual(['2026-09-01']);
  });

  it('meldet zwei Eintraege ohne Baustelle', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Anwesend' },
      { date: '2026-09-01', status: 'Anwesend' },
    ]);
    expect([...t]).toEqual(['2026-09-01']);
  });

  it('meldet zwei Urlaubstage am selben Tag', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Urlaub' },
      { date: '2026-09-01', status: 'Urlaub' },
    ]);
    expect([...t]).toEqual(['2026-09-01']);
  });

  it('meldet Arbeit an einem Krankentag — der Tag zählte sonst doppelt', () => {
    // Prüflauf 25.09.2026, P1-17: bisher nur zwei ganztägige.
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Krank' },
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042', startTime: '07:00', endTime: '12:00' },
      { date: '2026-09-02', status: 'Zeitausgleich' },
      { date: '2026-09-02', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    expect([...t].sort()).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('haelt Tage auseinander', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
      { date: '2026-09-02', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    expect(t.size).toBe(0);
  });
});

/**
 * ZEITAUSGLEICH: ganztags wie Urlaub, stundenweise ein Teil des Tages.
 *
 * Gefragt war „ZA von 13 bis 17 Uhr" — vormittags wird gearbeitet. Beides
 * muss am selben Tag stehen können, ohne dass sich die Zeiten widersprechen.
 */
describe('buchungKonflikt — Zeitausgleich', () => {
  const zaNachmittag = { status: 'Zeitausgleich' as const, startTime: '13:00', endTime: '17:00' };
  const vormittag = { status: 'Anwesend' as const, startTime: '07:00', endTime: '12:00' };

  it('ganztags sperrt den Tag wie Urlaub', () => {
    expect(buchungKonflikt(vormittag, [{ status: 'Zeitausgleich' }])).toMatch(/ganzen Tag/);
    expect(buchungKonflikt({ status: 'Zeitausgleich' }, [vormittag])).toMatch(/ganzen Tag/);
  });

  it('stundenweise darf neben gearbeiteter Zeit stehen — auch ohne Baustelle', () => {
    expect(buchungKonflikt(zaNachmittag, [vormittag])).toBeNull();
    expect(buchungKonflikt(vormittag, [zaNachmittag])).toBeNull();
  });

  it('aber nicht über ihr', () => {
    const ganzerTag = { status: 'Anwesend' as const, startTime: '07:00', endTime: '16:00' };
    expect(buchungKonflikt(zaNachmittag, [ganzerTag])).toMatch(/überschneiden/);
    expect(buchungKonflikt(ganzerTag, [zaNachmittag])).toMatch(/überschneiden/);
  });

  it('einer je Tag', () => {
    expect(buchungKonflikt({ ...zaNachmittag, startTime: '08:00', endTime: '10:00' }, [zaNachmittag]))
      .toMatch(/bereits Zeitausgleich/);
  });

  it('nicht neben Krank oder Urlaub', () => {
    expect(buchungKonflikt(zaNachmittag, [{ status: 'Urlaub' }])).toMatch(/Urlaub/);
  });

  it('die Baustellenregel gilt weiter unter der gearbeiteten Zeit', () => {
    const baustelle = { ...vormittag, projectNumber: '2026-042' };
    expect(buchungKonflikt({ status: 'Anwesend' }, [zaNachmittag, baustelle])).toMatch(/braucht eine Baustelle/);
  });

  it('zwei stundenweise ZA am selben Tag sind eine Doppelung', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', ...zaNachmittag },
      { date: '2026-09-01', ...zaNachmittag },
      { date: '2026-09-02', ...zaNachmittag },
      { date: '2026-09-02', ...vormittag },
    ]);
    expect([...t]).toEqual(['2026-09-01']);
  });
});

/**
 * LAUNCH-CHECK 25.09.2026, K1 und M3.
 *
 * K1: 20:00–02:00 auf einer Baustelle, dann 21:00–23:00 auf einer anderen —
 * beides ging durch, die Woche zählte 16 statt 14 Stunden.
 * M3: der geteilte Dienst auf DERSELBEN Baustelle (vormittags gearbeitet,
 * abends Notdienst) war nicht buchbar.
 */
describe('Launch-Check: Zeiten zur selben Stunde', () => {
  const zeit = (projectNumber: string, startTime: string, endTime: string) =>
    ({ status: 'Anwesend' as const, projectNumber, startTime, endTime });

  it('blockt zwei Baustellen zur selben Stunde — auch über Mitternacht', () => {
    const nacht = zeit('PR-2026-0002', '20:00', '02:00');
    const grund = buchungKonflikt(zeit('PR-2026-0003', '21:00', '23:00'), [nacht]);
    expect(grund).toMatch(/überschneidet sich mit 20:00–02:00 \(PR-2026-0002\)/);
    // Und in der Gegenrichtung.
    expect(buchungKonflikt(nacht, [zeit('PR-2026-0003', '21:00', '23:00')])).toMatch(/überschneidet/);
  });

  it('lässt aneinanderstossende Zeiten durch', () => {
    expect(buchungKonflikt(zeit('A', '12:00', '16:00'), [zeit('B', '07:00', '12:00')])).toBeNull();
    // Die Nachtschicht endet um 02:00 des Folgetags — der Vormittag ist frei.
    expect(buchungKonflikt(zeit('A', '07:00', '12:00'), [zeit('B', '20:00', '02:00')])).toBeNull();
  });

  it('lässt den geteilten Dienst auf derselben Baustelle zu', () => {
    const vormittag = zeit('PR-2026-0002', '07:00', '12:00');
    expect(buchungKonflikt(zeit('PR-2026-0002', '19:00', '22:00'), [vormittag])).toBeNull();
    const t = tageMitEchterDoppelung([
      { date: '2026-09-24', ...vormittag },
      { date: '2026-09-24', ...zeit('PR-2026-0002', '19:00', '22:00') },
    ]);
    expect(t.size).toBe(0);
  });

  it('dieselbe Baustelle ohne Uhrzeit bleibt einmal je Tag', () => {
    expect(buchungKonflikt(zeit('PR-2026-0002', '19:00', '22:00'), [A('PR-2026-0002')]))
      .toMatch(/bereits gebucht/);
  });

  it('meldet eine bestehende Überschneidung in der Liste', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-24', ...zeit('PR-2026-0002', '20:00', '02:00') },
      { date: '2026-09-24', ...zeit('PR-2026-0003', '21:00', '23:00') },
    ]);
    expect([...t]).toEqual(['2026-09-24']);
  });
});
