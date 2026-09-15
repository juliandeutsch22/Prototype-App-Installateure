import { describe, it, expect } from 'vitest';
import { urlaubsStand, calcMonthStats } from '@/lib/time';
import type { TimeEntry } from '@/types';

/**
 * DER RESTURLAUB IM ERSTEN JAHR.
 *
 * DER GEMELDETE FALL. Ein Betrieb steigt mitten im Jahr um. Was seine Leute
 * bis dahin an Urlaub genommen haben, steht in keiner Buchung der App — die
 * gibt es erst ab dem Startdatum. Gerechnet wurde trotzdem „Jahresanspruch
 * minus Urlaubstage in der App", und das Ergebnis war um genau die
 * mitgebrachten Tage zu hoch. Dieselbe Zahl sah der Mitarbeiter, der
 * Genehmigende und die Lohn-CSV.
 *
 * Die Prüfungen hier sind nach dem gebaut, was im Betrieb passiert, nicht
 * nach den Zweigen im Code.
 */

/** Petra: 25 Tage im Jahr, Umstieg am 15. September mit 7 Tagen Rest. */
const petra = {
  yearlyVacationDays: 25,
  initialVacationDays: 7,
  appStartDate: '2026-09-15',
};

describe('Im Jahr des Umstiegs', () => {
  it('zählt den mitgebrachten Bestand, nicht den Jahresanspruch', () => {
    // Genau der gemeldete Fall: 25 wären falsch, 7 sind richtig.
    const stand = urlaubsStand(petra, 2026, []);
    expect(stand.anspruch).toBe(7);
    expect(stand.rest).toBe(7);
    expect(stand.ausAnfangsbestand).toBe(true);
  });

  it('zieht ab, was nach dem Umstieg genommen wurde', () => {
    const stand = urlaubsStand(petra, 2026, [{ von: '2026-10-05', tage: 4 }]);
    expect(stand.genommen).toBe(4);
    expect(stand.rest).toBe(3);
  });

  it('zieht NICHT ab, was vor dem Umstieg liegt — das steckt schon im Bestand', () => {
    /*
      Die Buchhaltung darf fremde Zeiteinträge nachtragen, auch rückwirkend.
      Landet dabei ein Urlaubstag von vor dem Startdatum in der App, wäre er
      zweimal weg: einmal im mitgebrachten Bestand, einmal als Eintrag.
    */
    const stand = urlaubsStand(petra, 2026, [
      { von: '2026-03-02', tage: 5 },
      { von: '2026-10-05', tage: 4 },
    ]);
    expect(stand.genommen).toBe(4);
    expect(stand.rest).toBe(3);
  });

  it('zählt den Starttag selbst mit', () => {
    // Die Grenze gehört zum neuen Zeitraum: „Bestand AM Startdatum" heisst,
    // dass an diesem Tag noch nichts abgezogen ist.
    const stand = urlaubsStand(petra, 2026, [{ von: '2026-09-15', tage: 1 }]);
    expect(stand.genommen).toBe(1);
    expect(stand.rest).toBe(6);
  });

  it('lässt den Rest ins Minus laufen, statt bei null zu halten', () => {
    /*
      Wer mehr genommen hat, als ihm blieb, hat ein Minus — und das gehört
      hingeschrieben. Auf null zu kappen versteckte genau den Fall, wegen
      dessen jemand hinsieht.
    */
    expect(urlaubsStand(petra, 2026, [{ von: '2026-10-05', tage: 9 }]).rest).toBe(-2);
  });
});

describe('In jedem anderen Jahr', () => {
  it('gilt wieder der volle Jahresanspruch', () => {
    const stand = urlaubsStand(petra, 2027, []);
    expect(stand.anspruch).toBe(25);
    expect(stand.ausAnfangsbestand).toBe(false);
  });

  it('zählt dann auch wieder alle Tage des Jahres', () => {
    // Die Sperre „erst ab dem Startdatum" gehört zum Umstiegsjahr und darf
    // nicht im Folgejahr weiterwirken — dort liegt JEDER Tag danach.
    const stand = urlaubsStand(petra, 2027, [{ von: '2027-01-08', tage: 3 }]);
    expect(stand.genommen).toBe(3);
    expect(stand.rest).toBe(22);
  });

  it('auch im Jahr VOR dem Umstieg', () => {
    const stand = urlaubsStand(petra, 2025, [{ von: '2025-07-01', tage: 2 }]);
    expect(stand.anspruch).toBe(25);
    expect(stand.rest).toBe(23);
  });
});

describe('Ohne Angabe bleibt alles wie vorher', () => {
  it('ohne Anfangsbestand gilt der Jahresanspruch — auch im Startjahr', () => {
    /*
      Das ist der Zustand jeder bestehenden Zeile. Diese Änderung darf ihre
      Bedeutung nicht verschieben, sonst wäre die Reparatur an einer Stelle
      ein neuer Fehler an allen anderen.
    */
    const ohne = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2026-09-15' };
    const stand = urlaubsStand(ohne, 2026, [{ von: '2026-03-02', tage: 5 }]);
    expect(stand.anspruch).toBe(25);
    expect(stand.genommen).toBe(5);
    expect(stand.ausAnfangsbestand).toBe(false);
  });

  it('ohne Startdatum gibt es kein Umstiegsjahr', () => {
    const ohne = { yearlyVacationDays: 25, initialVacationDays: 7, appStartDate: null };
    expect(urlaubsStand(ohne, 2026, []).anspruch).toBe(25);
  });

  it('ohne Jahresanspruch greift die Vorgabe des Betriebs', () => {
    expect(
      urlaubsStand({ yearlyVacationDays: undefined, initialVacationDays: null, appStartDate: null }, 2026, [])
        .anspruch,
    ).toBe(25);
  });
});

describe('Null Tage sind eine Angabe, keine fehlende', () => {
  it('ein Bestand von 0 heisst: aufgebraucht', () => {
    /*
      DER UNTERSCHIED, AN DEM ES HÄNGT. `0` und „nichts eingetragen" sehen in
      JavaScript schnell gleich aus — mit `||` oder `??` an der falschen
      Stelle würde aus „hat nichts mehr" ein voller Jahresanspruch. Dann
      bekäme ausgerechnet der, dessen Urlaub weg ist, 25 Tage angezeigt.
    */
    const leer = { yearlyVacationDays: 25, initialVacationDays: 0, appStartDate: '2026-09-15' };
    const stand = urlaubsStand(leer, 2026, []);
    expect(stand.anspruch).toBe(0);
    expect(stand.ausAnfangsbestand).toBe(true);
  });

  it('ein negativer Bestand bleibt negativ', () => {
    // Wer im Vorgriff mehr genommen hat, als ihm zusteht, bringt ein Minus
    // mit — dieselbe Lesart wie beim Start-Saldo der Stunden.
    const minus = { yearlyVacationDays: 25, initialVacationDays: -2, appStartDate: '2026-09-15' };
    expect(urlaubsStand(minus, 2026, []).rest).toBe(-2);
  });
});

describe('Die Monatszahlen der Buchhaltung nehmen dieselbe Regel', () => {
  /*
    WARUM DAS EIGENS GEPRÜFT WIRD. Die Regel kann stimmen und trotzdem
    nirgends ankommen: `calcMonthStats` hat den Resturlaub vorher SELBST
    gerechnet. Diese Prüfung hält fest, dass sie ihn jetzt holt — sonst zeigt
    die Mitarbeiteransicht die richtige Zahl und die Lohn-CSV die alte.
  */
  const eintrag = (date: string): TimeEntry => ({
    id: date, companyId: 'x', userId: 'petra', date, status: 'Urlaub',
  });

  it('rechnet den Resturlaub im Umstiegsjahr aus dem Anfangsbestand', () => {
    const stats = calcMonthStats(
      { weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], ...petra },
      [],
      [eintrag('2026-10-05'), eintrag('2026-10-06')],
      2026,
      9,
    );
    expect(stats.urlaubRest).toBe(5);
    expect(stats.urlaubsAnspruch).toBe(7);
    expect(stats.urlaubAusAnfangsbestand).toBe(true);
  });

  it('zählt daneben weiter ALLE Urlaubstage des Jahres', () => {
    /*
      `yearlyUrlaubDays` ist eine Beobachtung („so viele stehen in der App"),
      kein Anspruch. Im Umstiegsjahr dürfen sich die beiden Zahlen
      unterscheiden — würde man sie gleichsetzen, ginge eine von beiden
      verloren.
    */
    const stats = calcMonthStats(
      { weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], ...petra },
      [],
      [eintrag('2026-03-02'), eintrag('2026-10-05')],
      2026,
      9,
    );
    expect(stats.yearlyUrlaubDays).toBe(2);
    // Gegen den Anspruch zählt nur der Tag NACH dem Umstieg.
    expect(stats.urlaubRest).toBe(6);
  });

  it('ohne Anfangsbestand bleibt es beim Jahresanspruch', () => {
    const stats = calcMonthStats(
      {
        weeklyTargetHours: 40, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5],
        appStartDate: '2026-09-15', initialVacationDays: null,
      },
      [],
      [eintrag('2026-10-05')],
      2026,
      9,
    );
    expect(stats.urlaubRest).toBe(24);
    expect(stats.urlaubAusAnfangsbestand).toBe(false);
  });
});
