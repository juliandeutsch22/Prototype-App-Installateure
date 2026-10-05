import { describe, it, expect } from 'vitest';
import {
  grenzfaelle, grenzText, istJugendlich, kalenderwoche, montagVon, type GrenzEintrag,
} from '@/features/accounting/arbeitszeitGrenzen';

/**
 * Die gesetzlichen Grenzen der Arbeitszeit (Stand-Datei 11.1, Punkt 4).
 * Jede Grenze mit Gegenprobe: knapp darunter kein Fall.
 */

const tag = (date: string, startTime: string, endTime: string, breakDuration = 0): GrenzEintrag =>
  ({ date, status: 'Anwesend', startTime, endTime, breakDuration });

/** Eine normale Woche: Mo–Fr 07:00–15:30, 30 Min. Pause = 8 Std. */
const normaleWoche = (montag: string): GrenzEintrag[] =>
  [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(`${montag}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return tag(d.toISOString().slice(0, 10), '07:00', '15:30', 30);
  });

const OKTOBER = { von: '2026-10-01', bis: '2026-10-31' };
const ERWACHSEN = { geburtsdatum: '1990-05-01' };
const JUGENDLICH = { geburtsdatum: '2010-03-15' };

describe('Hilfen', () => {
  it('Montag und Kalenderwoche', () => {
    expect(montagVon('2026-10-07')).toBe('2026-10-05');
    expect(montagVon('2026-10-11')).toBe('2026-10-05');
    expect(montagVon('2026-10-05')).toBe('2026-10-05');
    expect(kalenderwoche('2026-10-05')).toBe(41);
    expect(kalenderwoche('2025-12-29')).toBe(1);
  });

  it('jugendlich bis zum Tag vor dem 18. Geburtstag', () => {
    expect(istJugendlich('2008-10-07', '2026-10-06')).toBe(true);
    expect(istJugendlich('2008-10-07', '2026-10-07')).toBe(false);
    expect(istJugendlich(null, '2026-10-06')).toBe(false);
  });
});

describe('Erwachsene', () => {
  it('Gegenprobe: eine normale Woche ergibt keinen Fall', () => {
    expect(grenzfaelle(normaleWoche('2026-10-05'), OKTOBER, ERWACHSEN)).toEqual([]);
  });

  it('mehr als 12 Std. am Tag — 12 Std. genau ist erlaubt', () => {
    const f = grenzfaelle([tag('2026-10-06', '06:00', '19:00', 30)], OKTOBER, ERWACHSEN);
    expect(f).toEqual([{ art: 'tag', bezug: '2026-10-06', jugendlich: false, ist: 750, grenze: 720 }]);
    expect(grenzfaelle([tag('2026-10-06', '06:00', '18:30', 30)], OKTOBER, ERWACHSEN)).toEqual([]);
  });

  it('mehr als 60 Std. in der Woche', () => {
    const lang = [5, 6, 7, 8, 9].map((t) => tag(`2026-10-0${t}`, '06:00', '18:30', 30)); // 5 × 12 = 60
    expect(grenzfaelle(lang, OKTOBER, ERWACHSEN).filter((f) => f.art === 'woche')).toEqual([]);
    const mehr = [...lang, tag('2026-10-10', '08:00', '09:00')];
    expect(grenzfaelle(mehr, OKTOBER, ERWACHSEN).filter((f) => f.art === 'woche')).toEqual([
      { art: 'woche', bezug: '2026-10-05', jugendlich: false, ist: 3660, grenze: 3600 },
    ]);
  });

  it('weniger als 11 Std. Ruhezeit — gerechnet auch über Mitternacht', () => {
    const f = grenzfaelle([tag('2026-10-06', '14:00', '23:00'), tag('2026-10-07', '07:00', '15:00')], OKTOBER, ERWACHSEN);
    expect(f).toEqual([{ art: 'ruhezeit', bezug: '2026-10-07', jugendlich: false, ist: 480, grenze: 660 }]);
    // Notdienst bis 02:00, Beginn um 13:00 — genau 11 Std.: kein Fall.
    expect(grenzfaelle([tag('2026-10-06', '18:00', '02:00'), tag('2026-10-07', '13:00', '17:00')], OKTOBER, ERWACHSEN)).toEqual([]);
  });

  it('keine 36 Std. Ruhe in der Kalenderwoche', () => {
    // Mo–So jeden Tag 08:00–16:00: längste Lücke 16 Std.
    const jedenTag = Array.from({ length: 7 }, (_, i) => tag(`2026-10-${String(5 + i).padStart(2, '0')}`, '08:00', '16:00'));
    const f = grenzfaelle(jedenTag, OKTOBER, ERWACHSEN).filter((x) => x.art === 'wochenruhe');
    expect(f).toEqual([{ art: 'wochenruhe', bezug: '2026-10-05', jugendlich: false, ist: 16 * 60, grenze: 36 * 60 }]);
    // Gegenprobe: Samstag 08:00–12:00 und Sonntag frei — ab Samstag 12:00 bis Montag 0:00 sind 36 Std.
    const mitWochenende = [...normaleWoche('2026-10-05'), tag('2026-10-10', '08:00', '12:00')];
    expect(grenzfaelle(mitWochenende, OKTOBER, ERWACHSEN).filter((x) => x.art === 'wochenruhe')).toEqual([]);
  });

  it('meldet nur, was im Zeitraum liegt', () => {
    expect(grenzfaelle([tag('2026-09-29', '05:00', '20:00')], OKTOBER, ERWACHSEN)).toEqual([]);
  });

  it('Urlaub, Krank und Zeitausgleich zählen nicht als Arbeit', () => {
    const e: GrenzEintrag[] = [
      { date: '2026-10-06', status: 'Urlaub' },
      { date: '2026-10-07', status: 'Krank' },
    ];
    expect(grenzfaelle(e, OKTOBER, ERWACHSEN)).toEqual([]);
  });
});

describe('Jugendliche (KJBG)', () => {
  it('Gegenprobe: eine normale Woche mit freiem Wochenende ergibt keinen Fall', () => {
    expect(grenzfaelle(normaleWoche('2026-10-05'), OKTOBER, JUGENDLICH)).toEqual([]);
  });

  it('mehr als 8 Std. am Tag und mehr als 40 in der Woche', () => {
    const f = grenzfaelle([...normaleWoche('2026-10-05'), tag('2026-10-09', '15:30', '16:30')], OKTOBER, JUGENDLICH);
    // Nach Bezug: die Woche (ihr Montag) vor dem Freitag.
    expect(f.map((x) => [x.art, x.bezug, x.ist, x.grenze])).toEqual([
      ['woche', '2026-10-05', 2460, 2400],
      ['tag', '2026-10-09', 540, 480],
    ]);
  });

  it('die Berufsschule zählt zur Wochenarbeitszeit', () => {
    const woche = normaleWoche('2026-10-05');
    woche[2] = { date: '2026-10-07', status: 'Berufsschule' };
    // 4 × 8 Std. + Schultag mit 9 Std. Soll = 41 Std.
    const f = grenzfaelle(woche, OKTOBER, { ...JUGENDLICH, schultagMin: () => 540 });
    expect(f.filter((x) => x.art === 'woche').map((x) => x.ist)).toEqual([2460]);
    // Bei Erwachsenen bleibt die Berufsschule draussen.
    expect(grenzfaelle(woche, OKTOBER, { ...ERWACHSEN, schultagMin: () => 540 })).toEqual([]);
  });

  it('weniger als 12 Std. Ruhezeit', () => {
    const f = grenzfaelle([tag('2026-10-06', '08:00', '16:00'), tag('2026-10-07', '03:30', '07:00')], OKTOBER, JUGENDLICH);
    expect(f.find((x) => x.art === 'ruhezeit')).toEqual({ art: 'ruhezeit', bezug: '2026-10-07', jugendlich: true, ist: 690, grenze: 720 });
  });

  it('Arbeit zwischen 20 und 6 Uhr', () => {
    const f = grenzfaelle([tag('2026-10-06', '05:00', '13:00'), tag('2026-10-08', '12:00', '21:30')], OKTOBER, JUGENDLICH);
    expect(f.filter((x) => x.art === 'nacht').map((x) => [x.bezug, x.ist])).toEqual([
      ['2026-10-06', 60],
      ['2026-10-08', 90],
    ]);
  });

  it('keine zwei freien Tage am Stück mit dem Sonntag', () => {
    const samstag = [...normaleWoche('2026-10-05'), tag('2026-10-10', '08:00', '12:00')];
    // Samstag gearbeitet, aber Sonntag und Montag danach frei: erlaubt.
    expect(grenzfaelle(samstag, OKTOBER, JUGENDLICH).filter((x) => x.art === 'wochenfrei')).toEqual([]);
    // Samstag gearbeitet und Montag danach auch — nur der Sonntag ist frei.
    const ohne = [...samstag, ...normaleWoche('2026-10-12')];
    expect(grenzfaelle(ohne, OKTOBER, JUGENDLICH).filter((x) => x.art === 'wochenfrei').map((x) => x.bezug))
      .toEqual(['2026-10-05']);
  });

  it('mit dem 18. Geburtstag gelten die Grenzen für Erwachsene', () => {
    const neun = [tag('2026-10-06', '07:00', '16:30', 30), tag('2026-10-08', '07:00', '16:30', 30)];
    const f = grenzfaelle(neun, OKTOBER, { geburtsdatum: '2008-10-07' });
    expect(f.map((x) => [x.art, x.bezug])).toEqual([['tag', '2026-10-06']]);
  });
});

describe('Text', () => {
  it('nennt Wert, Grenze und Gesetz', () => {
    expect(grenzText({ art: 'tag', bezug: '2026-10-06', jugendlich: false, ist: 750, grenze: 720 }))
      .toEqual({ titel: '12:30 Std. am 06.10. — höchstens 12 Std.', gesetz: '§ 9 AZG' });
    expect(grenzText({ art: 'woche', bezug: '2026-10-05', jugendlich: true, ist: 2460, grenze: 2400 }))
      .toEqual({ titel: '41:00 Std. in KW 41 — höchstens 40 Std.', gesetz: '§ 11 KJBG' });
  });
});
