/**
 * Die Regel der freien Zeitfelder (M06b, N01) in der App — alle Typen, die
 * Regeln einer Definition, die Geltung, die Prüfung einer Eingabe und was
 * offen ist. Dieselben Fälle prüft `tests/supabase/zeitfelderRegel.test.ts`
 * gegen die Datenbank (`tests/faelle/zeitfelder.ts`).
 *
 * Gegenprobe: ohne `src/lib/zeitfelder.ts` gibt es nichts zu importieren;
 * jede vertauschte Meldung oder Grenze lässt den betroffenen Fall rot werden.
 */
import { describe, expect, it } from 'vitest';
import {
  angabenText, eingabeFehler, exportSpalten, feldGilt, felderDerFassung, offeneAngaben, regelnFehler, spaltenKopf,
  spaltenWert, wertAlsEingabe, wertAusEingabe, wertFehler, wertNorm, wertText, type ZeitfeldAnzeige, type ZeitfeldSatz,
} from '@/lib/zeitfelder';
import { GELTUNGSFAELLE, KOSTENSTELLE, OPTION, REGELFAELLE, WERTFAELLE } from '../faelle/zeitfelder';

describe('Werte gegen ihr Feld', () => {
  it.each(WERTFAELLE)('%s', (_, feld, wert, alt, erwartet) => {
    expect(wertFehler(feld, wert, alt ?? undefined)).toBe(erwartet);
  });

  it('leer ist kein Fehler — Pflicht ist eine eigene Frage', () => {
    expect(wertFehler({ typ: 'text', regeln: {} }, null)).toBeNull();
    expect(wertNorm('   ')).toBeNull();
    expect(wertNorm('  Wien ')).toBe('Wien');
    expect(wertNorm(0)).toBe(0);
    expect(wertNorm(false)).toBe(false);
  });
});

describe('Regeln einer Definition', () => {
  it.each(REGELFAELLE)('%s', (_, typ, regeln, erwartet) => {
    expect(regelnFehler(typ, regeln)).toBe(erwartet);
  });
});

describe('Geltung nach Stand, Rolle und Herkunft', () => {
  it.each(GELTUNGSFAELLE)('%s', (_, staende, rollen, stand, rolle, antrag, gilt) => {
    expect(feldGilt({ staende, rollen }, stand, rolle, antrag)).toBe(gilt);
  });
});

const K = '00000000-0000-4000-8000-00000000000a';
const KM = '00000000-0000-4000-8000-00000000000b';
const HV = '00000000-0000-4000-8000-00000000000c';
const satz: ZeitfeldSatz = {
  nummer: 3,
  felder: {
    [K]: { ...KOSTENSTELLE, pflicht: 'beim_buchen' },
    [KM]: { typ: 'zahl', regeln: { min: 0, einheit: 'km' }, staende: ['Anwesend'], rollen: ['Mitarbeiter'], pflicht: 'nie' },
    [HV]: { typ: 'text', regeln: {}, staende: ['Anwesend'], rollen: ['Mitarbeiter'], pflicht: 'nur_buero' },
  },
};
const definitionen: ZeitfeldAnzeige[] = [
  { id: HV, name: 'Auftragsnummer HV', typ: 'text', regeln: {}, reihenfolge: 3, aktiv: true },
  { id: K, name: 'Kostenstelle', typ: 'auswahl', regeln: KOSTENSTELLE.regeln, reihenfolge: 1, aktiv: true },
  { id: KM, name: 'Kilometer', typ: 'zahl', regeln: { min: 0, einheit: 'km' }, reihenfolge: 2, aktiv: true },
];
const namen = new Map(felderDerFassung(satz, definitionen).map((f) => [f.id, f.name]));
const basis = { satz, namen, status: 'Anwesend', rolle: 'Mitarbeiter', ausEinemAntrag: false };

describe('Prüfung einer Eingabe wie im Auslöser', () => {
  it('die Felder einer Fassung stehen in der Reihenfolge des Betriebs, mit Namen', () => {
    expect(felderDerFassung(satz, definitionen).map((f) => f.name)).toEqual(['Kostenstelle', 'Kilometer', 'Auftragsnummer HV']);
    expect(felderDerFassung(null, definitionen)).toEqual([]);
  });

  it('beim Anlegen: Pflicht beim Buchen fehlt — „nur Büro“ darf leer bleiben', () => {
    expect(eingabeFehler({ ...basis, werte: { [KM]: 12 }, neu: true })).toEqual(['Bitte ausfüllen: Kostenstelle']);
    expect(eingabeFehler({ ...basis, werte: { [K]: OPTION.WIEN }, neu: true })).toEqual([]);
  });

  it('gilt die Pflicht nicht (andere Rolle, Antrag), fehlt auch nichts', () => {
    expect(eingabeFehler({ ...basis, rolle: 'Buchhaltung', werte: {}, neu: true })).toEqual([]);
    expect(eingabeFehler({ ...basis, ausEinemAntrag: true, werte: {}, neu: true })).toEqual([]);
  });

  it('ein falscher Wert nennt das Feld', () => {
    expect(eingabeFehler({ ...basis, werte: { [K]: OPTION.WIEN, [KM]: -3 }, neu: true })).toEqual(['Kilometer: Mindestens 0']);
  });

  it('ein Feld, das nicht gilt, nimmt keinen Wert', () => {
    expect(eingabeFehler({ ...basis, status: 'Zeitausgleich', werte: { [KM]: 3 }, neu: true }))
      .toEqual(['„Kilometer“ gilt nicht für diese Buchung']);
  });

  it('beim Ändern: eine Pflichtangabe bleibt, eine deaktivierte Option bleibt stehen', () => {
    const alt = { [K]: OPTION.ALT };
    expect(eingabeFehler({ ...basis, buchungsSatz: satz, alteWerte: alt, werte: { [K]: OPTION.ALT }, neu: false })).toEqual([]);
    expect(eingabeFehler({ ...basis, buchungsSatz: satz, alteWerte: alt, werte: { [K]: '' }, neu: false }))
      .toEqual(['Pflichtangabe bleibt: Kostenstelle']);
    // Ohne Fassung der Buchung (vor den Feldern gebucht) ist nichts Pflicht.
    expect(eingabeFehler({ ...basis, buchungsSatz: null, alteWerte: alt, werte: { [K]: '' }, neu: false })).toEqual([]);
  });
});

describe('Was offen ist — nach der Fassung der Buchung', () => {
  const buchung = { status: 'Anwesend' as const };
  it('Nachpflege für Pflicht beim Buchen, fehlt für „ergänzt das Büro“', () => {
    expect(offeneAngaben(satz, definitionen, buchung, 'Mitarbeiter', {})).toEqual({
      fehlt: ['Auftragsnummer HV'], nachpflege: ['Kostenstelle'],
    });
    expect(offeneAngaben(satz, definitionen, buchung, 'Mitarbeiter', { [K]: OPTION.WIEN, [HV]: 'HV-1' }))
      .toEqual({ fehlt: [], nachpflege: [] });
  });

  it('ohne Fassung (vor den Feldern), für Anträge und beendete Felder ist nichts offen', () => {
    expect(offeneAngaben(null, definitionen, buchung, 'Mitarbeiter', {})).toEqual({ fehlt: [], nachpflege: [] });
    expect(offeneAngaben(satz, definitionen, { ...buchung, vacationId: 'v' }, 'Mitarbeiter', {})).toEqual({ fehlt: [], nachpflege: [] });
    const beendet = definitionen.map((d) => ({ ...d, aktiv: false }));
    expect(offeneAngaben(satz, beendet, buchung, 'Mitarbeiter', {})).toEqual({ fehlt: [], nachpflege: [] });
  });
});

describe('Anzeige und Export', () => {
  it('jeder Typ als Text', () => {
    expect(wertText(definitionen[1], OPTION.WIEN)).toBe('Wien');
    expect(wertText(definitionen[1], OPTION.ALT)).toBe('Linz');
    expect(wertText(definitionen[2], 12.5)).toBe('12,5 km');
    expect(wertText({ typ: 'janein', regeln: {} }, true)).toBe('Ja');
    expect(wertText({ typ: 'janein', regeln: {} }, false)).toBe('Nein');
    expect(wertText({ typ: 'datum', regeln: {} }, '2026-11-08')).toBe('08.11.2026');
    expect(angabenText(definitionen, { [HV]: 'HV-1', [K]: OPTION.GRAZ })).toEqual(['Kostenstelle: Graz', 'Auftragsnummer HV: HV-1']);
  });

  it('Eingabe hin und zurück', () => {
    expect(wertAusEingabe('zahl', '12,5')).toEqual({ wert: 12.5, fehler: null });
    expect(wertAusEingabe('zahl', 'zwölf')).toEqual({ wert: null, fehler: 'Bitte eine Zahl eingeben' });
    expect(wertAusEingabe('janein', 'nein')).toEqual({ wert: false, fehler: null });
    expect(wertAusEingabe('text', '  ')).toEqual({ wert: null, fehler: null });
    expect(wertAlsEingabe('zahl', 12.5)).toBe('12,5');
    expect(wertAlsEingabe('janein', false)).toBe('nein');
  });

  it('Spalten: in Gebrauch oder mit Wert, in der Reihenfolge; Zahl mit Einheit im Kopf', () => {
    const werte = new Map([['e1', { [KM]: 7 }]]);
    const mitBeendetem = [...definitionen, { id: 'alt', name: 'Alt', typ: 'text' as const, regeln: {}, reihenfolge: 9, aktiv: false }];
    expect(exportSpalten(mitBeendetem, werte, ['e1']).map(spaltenKopf)).toEqual(['Kostenstelle', 'Kilometer (km)', 'Auftragsnummer HV']);
    const mitAltWert = new Map([['e1', { alt: 'x' }]]);
    expect(exportSpalten(mitBeendetem, mitAltWert, ['e1']).map((d) => d.name)).toContain('Alt');
    expect(spaltenWert(definitionen[2], 7.5)).toBe('7,5');
    expect(exportSpalten([], werte, ['e1'])).toEqual([]);
  });
});
