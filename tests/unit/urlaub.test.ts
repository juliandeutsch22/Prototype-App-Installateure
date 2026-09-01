import { describe, it, expect } from 'vitest';
import { urlaubsTage, werktageImZeitraum } from '@/lib/time';

/**
 * Urlaub wird in ARBEITSTAGEN verbraucht, nicht in Kalendertagen.
 *
 * Die Rechnung teilt sich die Grundlage mit `pflichtTage`, und das ist kein
 * Zufall, sondern der Punkt: liefen beide auseinander, bekäme jemand für eine
 * Woche mit Feiertag fünf Tage abgezogen und hätte trotzdem einen Tag als
 * „nicht gebucht" offen. Zwei Rechnungen, dieselbe Frage — also eine Antwort.
 */

const vollzeit = { workDays: [1, 2, 3, 4, 5] };

describe('Urlaubstage', () => {
  it('zaehlt eine ganze Woche als fuenf Tage', () => {
    // Mo 08.06.2026 bis Fr 12.06.2026.
    expect(urlaubsTage(vollzeit, '2026-06-08', '2026-06-12')).toHaveLength(5);
  });

  it('laesst das Wochenende drin liegen', () => {
    // Fr 12.06. bis Mo 15.06. — dazwischen Samstag und Sonntag.
    const tage = urlaubsTage(vollzeit, '2026-06-12', '2026-06-15');
    expect(tage).toEqual(['2026-06-12', '2026-06-15']);
  });

  it('zieht oesterreichische Feiertage ab', () => {
    /**
     * Der 26. Oktober ist Nationalfeiertag. Die Woche vom 26. bis 30.10.2026
     * hat deshalb vier Urlaubstage, nicht fünf. Wer hier fünf abzieht, nimmt
     * einem Mitarbeiter jedes Jahr mehrere Tage weg.
     */
    const tage = urlaubsTage(vollzeit, '2026-10-26', '2026-10-30');
    expect(tage).toHaveLength(4);
    expect(tage).not.toContain('2026-10-26');
  });

  it('richtet sich nach den Arbeitstagen des Mitarbeiters', () => {
    // Teilzeit: Montag, Mittwoch, Freitag.
    const teilzeit = { workDays: [1, 3, 5] };
    expect(urlaubsTage(teilzeit, '2026-06-08', '2026-06-12')).toEqual([
      '2026-06-08',
      '2026-06-10',
      '2026-06-12',
    ]);
  });

  it('nimmt einen einzelnen Tag als einen Tag', () => {
    expect(urlaubsTage(vollzeit, '2026-06-10', '2026-06-10')).toHaveLength(1);
  });

  it('gibt nichts zurueck, wenn das Ende vor dem Beginn liegt', () => {
    // Ein verdrehter Zeitraum ist ein Tippfehler, kein Urlaub ueber die
    // Jahreswende rueckwaerts.
    expect(urlaubsTage(vollzeit, '2026-06-12', '2026-06-08')).toEqual([]);
  });

  it('gibt nichts zurueck, wenn im Zeitraum kein Arbeitstag liegt', () => {
    // Sa 13.06. bis So 14.06.2026.
    expect(urlaubsTage(vollzeit, '2026-06-13', '2026-06-14')).toEqual([]);
  });

  it('faellt ohne hinterlegte Arbeitstage auf Montag bis Freitag zurueck', () => {
    expect(urlaubsTage({}, '2026-06-08', '2026-06-12')).toHaveLength(5);
  });

  it('rechnet ueber den Monatswechsel hinweg', () => {
    // Mo 29.06. bis Fr 03.07.2026 — fünf Arbeitstage in zwei Monaten.
    expect(urlaubsTage(vollzeit, '2026-06-29', '2026-07-03')).toHaveLength(5);
  });

  it('teilt die Grundlage mit der Pflichttage-Rechnung', () => {
    /**
     * Beide gehen durch dieselbe Funktion. Dieser Test hält fest, dass sie
     * es tun — wird sie irgendwann kopiert statt geteilt, fällt es hier auf.
     */
    const direkt = werktageImZeitraum(
      [1, 2, 3, 4, 5],
      new Date('2026-10-26T00:00:00'),
      new Date('2026-10-30T00:00:00'),
    );
    expect(urlaubsTage(vollzeit, '2026-10-26', '2026-10-30')).toEqual(direkt);
  });
});
