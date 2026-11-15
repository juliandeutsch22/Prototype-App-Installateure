/**
 * Grenzfälle der Geldrundung (Durchsicht 15.11.2026, G7) — für die Prüfung
 * der App-Funktion (`tests/unit/geldRunden.test.ts`) und dieselben Fälle
 * gegen Postgres (`tests/supabase/geldRunden.test.ts`).
 *
 * ALS TEXT, nicht als Zahl: die Datenbank bekommt den exakten Dezimalwert
 * („2.675“), die App die Gleitkommazahl, die JavaScript daraus liest
 * (2,67499999…). Genau zwischen diesen beiden lag der Fehler.
 *
 * Die Erwartungen sind die Ergebnisse von `round(x::numeric, 2)` am lokalen
 * Stapel (15.11.2026).
 */
export const GELD_GRENZFAELLE: {
  werte: [wert: string, erwartet: string][];
  produkte: [a: string, b: string, erwartet: string][];
} = {
  werte: [
    ['0.005', '0.01'],
    ['1.005', '1.01'],
    ['2.675', '2.68'],
    ['1.015', '1.02'],
    ['8.345', '8.35'],
    ['0.285', '0.29'],
    ['1.255', '1.26'],
    ['307.275', '307.28'],
    // Negativ: weg von null, wie Postgres — `Math.round` rundete zur Null hin.
    ['-0.005', '-0.01'],
    ['-1.005', '-1.01'],
    ['-2.675', '-2.68'],
    ['-307.275', '-307.28'],
    // Groß.
    ['1234567.895', '1234567.90'],
    ['12345678.905', '12345678.91'],
    ['99999999.995', '100000000.00'],
    ['9999999999.995', '10000000000.00'],
    // Knapp daneben bleibt daneben.
    ['2.674', '2.67'],
    ['2.6749', '2.67'],
    ['0.004', '0.00'],
    ['-0.004', '0.00'],
    ['307.27', '307.27'],
  ],
  produkte: [
    // Stunden × Satz (Durchsicht: 4,25 h × 72,30 € ergab 307,27).
    ['4.25', '72.30', '307.28'],
    ['0.75', '89.30', '66.98'],
    // Rabatt 3 % auf 167,50 €; USt 10 % auf 40,15 €; Skonto 2 % auf 106,75 €.
    ['167.50', '0.03', '5.03'],
    ['40.15', '0.10', '4.02'],
    ['106.75', '0.02', '2.14'],
    ['-4.25', '72.30', '-307.28'],
  ],
};
