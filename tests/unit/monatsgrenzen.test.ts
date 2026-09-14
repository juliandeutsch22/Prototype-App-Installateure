/**
 * Das Ende eines Monats — gerechnet, nicht hingeschrieben.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG BEKOMMT, obwohl es eine Zeile ist: es hat
 * nach dem Umschalten auf Postgres die Einsatzplanung lahmgelegt, und zwar
 * in jedem Monat mit weniger als 31 Tagen.
 *
 * Firestore verglich einen Datumsbereich als ZEICHENKETTE. '2026-09-31' ist
 * kein Tag, liegt aber hinter '2026-09-30' — ein hart hingeschriebener 31.
 * schloss dort schlicht nichts zusätzlich ein und fiel nie auf. Postgres
 * liest denselben Wert als DATUM und bricht ab:
 *
 *   date/time field value out of range: "2026-09-31"
 *
 * Das ist der Unterschied zwischen einer Datenbank, die Zeichenketten
 * vergleicht, und einer, die Datumsangaben versteht. Die Rechnung steht
 * seither an einer Stelle; diese Prüfung hält sie dort fest.
 */
import { describe, it, expect } from 'vitest';
import { monatsEnde, tageImMonat } from '@shared/feiertage';

describe('tageImMonat', () => {
  it('kennt die kurzen Monate', () => {
    expect(tageImMonat(2026, 9)).toBe(30);  // September
    expect(tageImMonat(2026, 4)).toBe(30);  // April
    expect(tageImMonat(2026, 6)).toBe(30);  // Juni
    expect(tageImMonat(2026, 11)).toBe(30); // November
  });

  it('und die langen', () => {
    for (const m of [1, 3, 5, 7, 8, 10, 12]) expect(tageImMonat(2026, m)).toBe(31);
  });

  it('rechnet den Februar über das Schaltjahr', () => {
    expect(tageImMonat(2026, 2)).toBe(28);
    expect(tageImMonat(2024, 2)).toBe(29);
    // Die Ausnahme von der Ausnahme: 2100 ist durch 100 teilbar und kein
    // Schaltjahr, 2000 war durch 400 teilbar und eines.
    expect(tageImMonat(2100, 2)).toBe(28);
    expect(tageImMonat(2000, 2)).toBe(29);
  });
});

describe('monatsEnde', () => {
  it('liefert den letzten Tag als ISO-Tag', () => {
    expect(monatsEnde(2026, 9)).toBe('2026-09-30');
    expect(monatsEnde(2026, 1)).toBe('2026-01-31');
    expect(monatsEnde(2026, 2)).toBe('2026-02-28');
    expect(monatsEnde(2024, 2)).toBe('2024-02-29');
  });

  it('kommt über den Jahreswechsel', () => {
    expect(monatsEnde(2026, 12)).toBe('2026-12-31');
  });

  /*
    DER FALL, DER DEN FEHLER AUSGELÖST HAT, ausdrücklich benannt: das Ende
    des Septembers ist der 30., nicht der 31. Ein Datum, das es nicht gibt,
    darf hier nie herauskommen — Postgres nimmt es nicht an.
  */
  it('erfindet keinen Tag, den es nicht gibt', () => {
    for (let jahr = 2024; jahr <= 2028; jahr += 1) {
      for (let monat = 1; monat <= 12; monat += 1) {
        const ende = monatsEnde(jahr, monat);
        expect(ende).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Zurückgelesen muss derselbe Tag herauskommen; ein erfundener
        // rutscht beim Parsen in den Folgemonat.
        const zurueck = new Date(`${ende}T00:00:00Z`);
        expect(zurueck.getUTCFullYear()).toBe(jahr);
        expect(zurueck.getUTCMonth() + 1).toBe(monat);
      }
    }
  });
});
