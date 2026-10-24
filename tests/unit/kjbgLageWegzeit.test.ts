import { describe, it, expect } from 'vitest';
import {
  andereVerteilung, grenzfaelle, grenzfaelleDerBuchung, grenzText, wegzeitAusEingabe, unterrichtAusEingabe,
  type GrenzEintrag,
} from '@/features/accounting/arbeitszeitGrenzen';

/**
 * A9 der Durchsicht vom 24.10.2026 — zwei Prüfungen nach § 11 KJBG, die die
 * App nicht kannte: die Lage der kürzeren Tage (Abs 2, außer der
 * Kollektivvertrag lässt eine andere Verteilung zu, Abs 3) und die Wegzeit
 * zwischen Schule und Betrieb am Berufsschultag (Abs 7).
 */

const tag = (date: string, startTime: string, endTime: string, breakDuration = 0): GrenzEintrag =>
  ({ date, status: 'Anwesend', startTime, endTime, breakDuration });
const schule = (date: string, unterrichtMin?: number, wegzeitMin?: number): GrenzEintrag =>
  ({ date, status: 'Berufsschule', unterrichtMin, wegzeitMin });

const JUGENDLICH = { geburtsdatum: '2010-03-15' };
const OKTOBER = { von: '2026-10-01', bis: '2026-10-31' };
const MO_FR = [1, 2, 3, 4, 5];

describe('Lage der kürzeren Tage (§ 11 Abs 2 KJBG)', () => {
  it('kürzere Tage am Anfang oder Ende der Arbeitswoche: 9 Std. gelten', () => {
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 6 } })).toBe(true);
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 6, 2: 8.5, 3: 8.5, 4: 8.5, 5: 8.5 } })).toBe(true);
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 7, 2: 9, 3: 9, 4: 9, 5: 6 } })).toBe(true);
    // Der freie Freitag hängt am Wochenende.
    expect(andereVerteilung({ workDays: [1, 2, 3, 4], tagessoll: { 1: 9, 2: 9, 3: 9, 4: 8.5 } })).toBe(true);
  });

  it('Gegenprobe: ein kürzerer oder freier Tag mitten in der Woche macht das Wochenende nicht länger', () => {
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 8.5, 2: 8.5, 3: 6, 4: 8.5, 5: 8.5 } })).toBe(false);
    expect(andereVerteilung({ workDays: [1, 2, 4, 5], tagessoll: { 1: 9, 2: 9, 4: 8.5, 5: 9 } })).toBe(false);
  });

  it('lässt der Kollektivvertrag die Verteilung zu, zählt die Lage nicht', () => {
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 8.5, 2: 8.5, 3: 6, 4: 8.5, 5: 8.5 } }, true)).toBe(true);
    expect(andereVerteilung({ workDays: [1, 2, 4, 5], tagessoll: { 1: 9, 2: 9, 4: 8.5, 5: 9 } }, true)).toBe(true);
  });

  it('bleibt gleich: auch mit Kollektivvertrag keine andere Verteilung bei gleichen Tagen oder über 40 Std.', () => {
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 } }, true)).toBe(false);
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 6 } }, true)).toBe(false);
    expect(andereVerteilung({ workDays: MO_FR }, true)).toBe(false);
  });

  it('bleibt gleich: Tage mit genau 8 Std. sind keine kürzeren — der kurze Freitag reicht', () => {
    expect(andereVerteilung({ workDays: MO_FR, tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8.5, 5: 6 } })).toBe(true);
  });
});

describe('Wegzeit Schule–Betrieb am Berufsschultag (§ 11 Abs 7 KJBG)', () => {
  it('Unterricht, Weg und Arbeit zusammen über 8 Std. sind ein Fall', () => {
    const f = grenzfaelle([schule('2026-10-08', 6 * 60, 60), tag('2026-10-08', '14:00', '15:30')], OKTOBER, JUGENDLICH);
    expect(f).toEqual([{ art: 'tag', bezug: '2026-10-08', jugendlich: true, ist: 510, grenze: 480, wegMin: 60 }]);
    expect(grenzText(f[0])).toEqual({
      titel: '8:30 Std. am 08.10. samt 1:00 Std. Weg Schule–Betrieb — höchstens 8 Std.',
      gesetz: '§ 11 Abs 7 KJBG',
    });
  });

  it('Gegenprobe: ohne Weg sind dieselben 7:30 Std. kein Fall', () => {
    expect(grenzfaelle([schule('2026-10-08', 6 * 60), tag('2026-10-08', '14:00', '15:30')], OKTOBER, JUGENDLICH)).toEqual([]);
  });

  it('bis zur Grenze samt Weg ist es keiner; bei anderer Verteilung gelten 9 Std.', () => {
    expect(grenzfaelle([schule('2026-10-08', 6 * 60, 30), tag('2026-10-08', '14:00', '15:30')], OKTOBER, JUGENDLICH)).toEqual([]);
    const verteilt = { ...JUGENDLICH, andereVerteilung: true };
    expect(grenzfaelle([schule('2026-10-08', 6 * 60, 60), tag('2026-10-08', '14:00', '15:30')], OKTOBER, verteilt)).toEqual([]);
  });

  it('bleibt gleich: ohne Arbeit danach zählt der Weg nicht, und in die Woche zählt er nie', () => {
    expect(grenzfaelle([schule('2026-10-08', 7 * 60, 120)], OKTOBER, JUGENDLICH)).toEqual([]);
    const woche = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09'].map((d) => tag(d, '07:00', '15:30', 30));
    // 4 × 8 Std. + 8 Std. Unterricht = 40 Std.; der Weg macht die Woche nicht voll.
    expect(grenzfaelle([...woche, schule('2026-10-08', 8 * 60, 60)], OKTOBER, JUGENDLICH)).toEqual([]);
  });

  it('bleibt gleich: nach 8 Std. Unterricht ist jede Arbeit ein Fall nach Abs 7, mit oder ohne Weg', () => {
    const f = grenzfaelle([schule('2026-10-08', 8 * 60, 30), tag('2026-10-08', '17:00', '17:30')], OKTOBER, JUGENDLICH);
    expect(f).toEqual([{ art: 'tag', bezug: '2026-10-08', jugendlich: true, ist: 510, grenze: 480, schuleMin: 480 }]);
  });

  it('die Rückfrage vor dem Buchen kennt den Weg ebenso', () => {
    const f = grenzfaelleDerBuchung([schule('2026-10-08', 6 * 60, 60), tag('2026-10-08', '14:00', '15:30')], '2026-10-08', JUGENDLICH);
    expect(f.map((x) => grenzText(x).gesetz)).toEqual(['§ 11 Abs 7 KJBG']);
  });

  it('bei Erwachsenen bleibt der Weg draussen', () => {
    expect(grenzfaelle([schule('2026-10-08', 6 * 60, 120), tag('2026-10-08', '14:00', '17:00')], OKTOBER, { geburtsdatum: '1990-05-01' })).toEqual([]);
  });
});

describe('Wegzeit aus dem Feld', () => {
  it('liest Komma, Punkt und Uhrzeit; leer heisst keine Angabe', () => {
    expect(wegzeitAusEingabe('0,5')).toEqual({ min: 30, fehler: null });
    expect(wegzeitAusEingabe('0.75')).toEqual({ min: 45, fehler: null });
    expect(wegzeitAusEingabe('1:15')).toEqual({ min: 75, fehler: null });
    expect(wegzeitAusEingabe('')).toEqual({ min: null, fehler: null });
  });

  it('Gegenprobe: keine Zahl, null oder über 4 Std. wird nicht angenommen', () => {
    expect(wegzeitAusEingabe('weit').fehler).toMatch(/keine Stundenzahl/);
    expect(wegzeitAusEingabe('0').fehler).toMatch(/zwischen 0 und 4/);
    expect(wegzeitAusEingabe('4,5').fehler).toMatch(/zwischen 0 und 4/);
  });

  it('bleibt gleich: die Unterrichtszeit liest wie bisher, bis 12 Std.', () => {
    expect(unterrichtAusEingabe('11')).toEqual({ min: 660, fehler: null });
    expect(unterrichtAusEingabe('acht').fehler).toBe('„acht“ ist keine Stundenzahl — etwa „7,5“ oder „7:30“.');
    expect(unterrichtAusEingabe('13').fehler).toBe('Die Unterrichtszeit liegt zwischen 0 und 12 Stunden.');
  });
});
