/**
 * Die Fälle der Regel der freien Zeitfelder (M06b) — EINE Liste für beide
 * Seiten: `tests/unit/zeitfelder.test.ts` prüft die App gegen die erwartete
 * Meldung, `tests/supabase/zeitfelderRegel.test.ts` die Datenbank gegen
 * dieselbe Meldung. Weicht eine Seite ab, fällt sie dort auf.
 */
import type { ZeitfeldRegel } from '@/lib/zeitfelder';

const O1 = '11111111-1111-4111-8111-111111111111';
const O2 = '22222222-2222-4222-8222-222222222222';
const O3 = '33333333-3333-4333-8333-333333333333';
export const OPTION = { WIEN: O1, GRAZ: O2, ALT: O3 };

const feld = (typ: ZeitfeldRegel['typ'], regeln: ZeitfeldRegel['regeln'] = {}): ZeitfeldRegel => ({
  typ, regeln, staende: ['Anwesend'], rollen: ['Mitarbeiter'], pflicht: 'nie',
});

export const KOSTENSTELLE = feld('auswahl', {
  optionen: [
    { id: O1, text: 'Wien', aktiv: true },
    { id: O2, text: 'Graz', aktiv: true },
    { id: O3, text: 'Linz', aktiv: false },
  ],
});

/** [Beschreibung, Feld, Wert, alter Wert, erwartete Meldung oder null] */
export const WERTFAELLE: [string, ZeitfeldRegel, unknown, unknown, string | null][] = [
  ['Text gültig', feld('text'), 'HV-2026-17', null, null],
  ['Text zu lang (Vorgabe 200)', feld('text'), 'x'.repeat(201), null, 'Höchstens 200 Zeichen'],
  ['Text mit eigener Länge', feld('text', { laenge: 5 }), 'abcdef', null, 'Höchstens 5 Zeichen'],
  ['Text: Umlaute zählen als ein Zeichen', feld('text', { laenge: 3 }), 'ÄÖÜ', null, null],
  ['Text statt Zahl', feld('text'), 12, null, 'Bitte einen Text eingeben'],
  ['Zahl gültig', feld('zahl', { min: 0, max: 1000, stellen: 1, einheit: 'km' }), 12.5, null, null],
  ['Zahl unter dem Minimum', feld('zahl', { min: 0 }), -1, null, 'Mindestens 0'],
  ['Zahl über dem Maximum', feld('zahl', { max: 1000.5, stellen: 1 }), 1000.6, null, 'Höchstens 1000,5'],
  ['Zahl ganz verlangt', feld('zahl'), 1.5, null, 'Bitte eine ganze Zahl eingeben'],
  ['Zahl mit zu vielen Stellen', feld('zahl', { stellen: 2 }), 1.125, null, 'Höchstens 2 Nachkommastellen'],
  ['Zahl als Text', feld('zahl'), '12', null, 'Bitte eine Zahl eingeben'],
  ['Ja/Nein gültig (nein)', feld('janein'), false, null, null],
  ['Ja/Nein als Text', feld('janein'), 'ja', null, 'Bitte Ja oder Nein wählen'],
  ['Auswahl gültig', KOSTENSTELLE, O1, null, null],
  ['Auswahl unbekannt', KOSTENSTELLE, '44444444-4444-4444-8444-444444444444', null, 'Diese Option gibt es nicht'],
  ['Auswahl deaktiviert, neu gewählt', KOSTENSTELLE, O3, null, 'Diese Option ist nicht mehr wählbar'],
  ['Auswahl deaktiviert, alter Wert bleibt', KOSTENSTELLE, O3, O3, null],
  ['Auswahl als Zahl', KOSTENSTELLE, 1, null, 'Bitte eine Option wählen'],
  ['Datum gültig', feld('datum'), '2026-11-08', null, null],
  ['Datum falsch geschrieben', feld('datum'), '08.11.2026', null, 'Bitte ein Datum eingeben'],
  ['Datum gibt es nicht', feld('datum'), '2026-02-30', null, 'Dieses Datum gibt es nicht'],
  ['Datum zu früh', feld('datum'), '1899-12-31', null, 'Bitte ein Datum zwischen 1900 und 2100'],
];

/** [Beschreibung, Typ, Regeln, erwartete Meldung oder null] */
export const REGELFAELLE: [string, string, unknown, string | null][] = [
  ['Text ohne Regeln', 'text', {}, null],
  ['Text mit Länge', 'text', { laenge: 80 }, null],
  ['Text Länge 0', 'text', { laenge: 0 }, 'Die Länge muss zwischen 1 und 2000 Zeichen liegen'],
  ['Text Länge krumm', 'text', { laenge: 10.5 }, 'Die Länge muss zwischen 1 und 2000 Zeichen liegen'],
  ['Text mit fremder Regel', 'text', { min: 1 }, 'Unbekannte Regel „min“'],
  ['Keine Form', 'text', [], 'Die Regeln haben keine gültige Form'],
  ['Unbekannter Typ', 'farbe', {}, 'Unbekannter Typ'],
  ['Zahl vollständig', 'zahl', { min: 0, max: 10, stellen: 2, einheit: 'km' }, null],
  ['Zahl min über max', 'zahl', { min: 10, max: 1 }, 'Der Mindestwert liegt über dem Höchstwert'],
  ['Zahl min als Text', 'zahl', { min: '1' }, 'Mindest- und Höchstwert müssen Zahlen sein'],
  ['Zahl 5 Stellen', 'zahl', { stellen: 5 }, 'Nachkommastellen: 0 bis 4'],
  ['Zahl Einheit zu lang', 'zahl', { einheit: 'x'.repeat(21) }, 'Die Einheit hat höchstens 20 Zeichen'],
  ['Ja/Nein mit Regel', 'janein', { laenge: 3 }, 'Unbekannte Regel „laenge“'],
  ['Datum leer', 'datum', {}, null],
  ['Auswahl gültig', 'auswahl', KOSTENSTELLE.regeln, null],
  ['Auswahl ohne Optionen', 'auswahl', { optionen: [] }, 'Eine Auswahl braucht mindestens eine Option'],
  ['Auswahl ohne Kennung', 'auswahl', { optionen: [{ id: 'a', text: 'A', aktiv: true }] }, 'Jede Option braucht eine Kennung'],
  ['Auswahl ohne Text', 'auswahl', { optionen: [{ id: O1, text: '  ', aktiv: true }] }, 'Jede Option braucht einen Text (höchstens 80 Zeichen)'],
  ['Auswahl doppelt', 'auswahl', { optionen: [{ id: O1, text: 'A', aktiv: true }, { id: O1, text: 'B', aktiv: true }] }, 'Eine Option steht doppelt'],
  ['Auswahl gleich benannt', 'auswahl', { optionen: [{ id: O1, text: 'Wien', aktiv: true }, { id: O2, text: 'wien ', aktiv: true }] }, 'Zwei Optionen heißen gleich'],
  ['Auswahl keine wählbar', 'auswahl', { optionen: [{ id: O1, text: 'A', aktiv: false }] }, 'Mindestens eine Option muss wählbar sein'],
  ['Auswahl ohne aktiv', 'auswahl', { optionen: [{ id: O1, text: 'A' }] }, 'Jede Option ist wählbar oder nicht'],
];

/** [Beschreibung, Stände, Rollen, Stand, Rolle, aus Antrag, gilt] */
export const GELTUNGSFAELLE: [string, string[], string[], string, string, boolean, boolean][] = [
  ['Anwesend, Monteur', ['Anwesend'], ['Mitarbeiter'], 'Anwesend', 'Mitarbeiter', false, true],
  ['Zeitausgleich, nur Anwesend', ['Anwesend'], ['Mitarbeiter'], 'Zeitausgleich', 'Mitarbeiter', false, false],
  ['Krank nie', ['Anwesend', 'Zeitausgleich'], ['Mitarbeiter'], 'Krank', 'Mitarbeiter', false, false],
  ['andere Rolle', ['Anwesend'], ['Mitarbeiter'], 'Anwesend', 'Buchhaltung', false, false],
  ['aus einem Antrag', ['Anwesend', 'Zeitausgleich'], ['Mitarbeiter'], 'Zeitausgleich', 'Mitarbeiter', true, false],
];
