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

  it('haelt Tage auseinander', () => {
    const t = tageMitEchterDoppelung([
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
      { date: '2026-09-02', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    expect(t.size).toBe(0);
  });
});
