import { describe, it, expect } from 'vitest';
import { calcTotals, cent, positionNetto } from '@/features/invoices/totals';
import { aufStellen, cent as centAusBetrag, euro, euroBetrag } from '@/lib/betrag';
import { zugesagterSkonto } from '@/features/invoices/skonto';
import { zahlstand } from '@/features/invoices/zahlstand';
import { ruecklassBetrag } from '@/features/invoices/ruecklass';
import { verkaufspreisVorschlag } from '@/lib/aufschlag';
import { verzugszinsen } from '@/features/invoices/mahnung';
import { GELD_GRENZFAELLE } from '../fixtures/geldGrenzfaelle';

/**
 * EINE RUNDUNG FÜR GELD (Durchsicht 15.11.2026, G7).
 *
 * Vorher rundete `cent()` mit `Math.round((n + EPSILON) * 100) / 100` auf der
 * Gleitkommazahl: 4,25 h × 72,30 € liegt als 307,27499999… im Speicher und
 * wurde zu 307,27 — kaufmännisch und in der Datenbank 307,28. Fünf Dateien
 * hatten dazu je eine eigene Rundung ohne `EPSILON`; beim Skonto rechnete die
 * App 2,13 €, die Datenbank (`round(numeric, 2)`) 2,14 €.
 *
 * Gegenprobe: mit der alten Rundung sind die Halbcent-Fälle, die negativen
 * Fälle (`Math.round` rundet −2,675 auf −2,67) und die Fachfälle unten rot.
 * Die Erwartungen stammen aus Postgres (`round(x::numeric, 2)`), gelesen am
 * lokalen Stapel; dieselben Fälle schickt `tests/supabase/geldRunden.test.ts`
 * durch die Datenbank.
 */
describe('cent — kaufmännisch auf dem Dezimalwert, wie Postgres round(numeric, 2)', () => {
  it.each(GELD_GRENZFAELLE.werte)('%s → %s', (wert, erwartet) => {
    expect(cent(Number(wert))).toBe(Number(erwartet));
  });

  it.each(GELD_GRENZFAELLE.produkte)('%s × %s → %s', (a, b, erwartet) => {
    expect(cent(Number(a) * Number(b))).toBe(Number(erwartet));
  });

  it('gibt nie „−0“ zurück — in einer Summe oder einem Export stünde sonst „-0,00“', () => {
    expect(Object.is(cent(-0.004), 0)).toBe(true);
    expect(Object.is(cent(-0), 0)).toBe(true);
  });

  it('lässt Beträge, die schon auf den Cent stehen, unverändert (bleibt gleich)', () => {
    for (const n of [0, 0.01, 0.1, 0.3, 1, 19.99, 307.27, 1200, -45.5, 99999.99, 1234567.89]) {
      expect(cent(n)).toBe(n);
    }
    expect(cent(0.1 + 0.2)).toBe(0.3);
  });

  it('ist überall dieselbe Funktion — die Rechnung nimmt die aus `@/lib/betrag`', () => {
    expect(cent).toBe(centAusBetrag);
  });

  it('aufStellen rundet auf andere Stellenzahlen nach derselben Regel', () => {
    expect(aufStellen(1.00005, 4)).toBe(1.0001);
    expect(aufStellen(-0.125, 2)).toBe(-0.13);
    expect(aufStellen(2.5, 0)).toBe(3);
    expect(aufStellen(-2.5, 0)).toBe(-3);
    expect(aufStellen(8.58, 2)).toBe(8.58);
  });

  it('lässt Unendliches und „keine Zahl“ durch, statt etwas zu erfinden', () => {
    expect(cent(Number.NaN)).toBeNaN();
    expect(cent(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it('ein fehlender Wert wird NaN, null wird 0 — wie bei der alten Rundung (bleibt gleich)', () => {
    // Gemessen: die E-Rechnung reicht für ältere Rechnungen `undefined` durch; danach folgt `.toFixed()`.
    expect(cent(undefined as unknown as number)).toBeNaN();
    expect(cent(null as unknown as number)).toBe(0);
  });
});

describe('Die Fachstellen rechnen mit derselben Rundung', () => {
  it('Zeile: 4,25 h × 72,30 € = 307,28 € (vorher 307,27)', () => {
    expect(positionNetto(4.25, 72.3)).toBe(307.28);
    expect(positionNetto(0.75, 89.3)).toBe(66.98);
  });

  it('Rabatt und USt an der Halbcent-Grenze', () => {
    // 3 % auf 167,50 € = 5,025 → 5,03; 10 % USt auf 40,15 € = 4,015 → 4,02.
    expect(calcTotals([{ netto: 167.5 }], 0.2, { mode: 'percent', value: 3 }).discountAmount).toBe(5.03);
    expect(calcTotals([{ netto: 40.15 }], 0.1).totalVat).toBe(4.02);
  });

  it('Skonto wie die Datenbank (`app.skonto_passt`): 2 % auf 106,75 € = 2,14 €', () => {
    expect(zugesagterSkonto({ totalBrutto: 106.75, skontoProzent: 2, ruecklassBetrag: null })).toBe(2.14);
  });

  it('Rücklass wie die Datenbank (`rechnung_anlegen`): 7,5 % auf 8,20 € = 0,62 € (vorher 0,61)', () => {
    expect(ruecklassBetrag({ grundlageBrutto: 8.2, prozent: 7.5, forderungBrutto: 8.2 })).toBe(0.62);
    // Bleibt gleich, wo kein Halbcent im Spiel ist.
    expect(ruecklassBetrag({ grundlageBrutto: 1234.5, prozent: 5, forderungBrutto: 1234.5 })).toBe(61.73);
  });

  it('Verkaufspreis wie die Datenbank (`verkaufspreise_vorschlagen`): 10,02 € + 25 % = 12,53 € (vorher 12,52)', () => {
    expect(verkaufspreisVorschlag(10.02, { standard: 25 })).toBe(12.53);
  });

  it('Verzugszinsen: 9,2 % für 73 Tage auf 493,75 € = 9,085 → 9,09 € (vorher 9,08)', () => {
    const z = verzugszinsen({
      stufe: 2, rest: 493.75, faellig: '2025-12-31', bis: '2026-03-14', unternehmer: true,
      basiszinssaetze: [{ ab: '2026-01-01', satz: 0 }],
    });
    expect(z).toMatchObject({ art: 'berechnet', satz: 9.2, tage: 73, betrag: 9.09 });
  });

  it('Zahlstand rechnet den Rest auf den Cent (bleibt gleich: Differenzen von Centbeträgen treffen nie einen Halbcent)', () => {
    expect(zahlstand({ totalBrutto: 106.75, bezahltBetrag: 104.61, paymentStatus: 'Teilbezahlt' }).rest).toBe(2.14);
  });

  it('die Anzeige stand schon richtig — „€ 2,68“, nicht „€ 2,67“ (bleibt gleich)', () => {
    expect(euroBetrag(2.675)).toBe('2,68');
    expect(euro(307.275)).toBe('€ 307,28');
  });
});
