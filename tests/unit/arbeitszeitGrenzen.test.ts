import { describe, it, expect } from 'vitest';
import {
  durchrechnungsWochen, grenzfaelle, grenzText, istJugendlich, kalenderwoche, montagVon, type GrenzEintrag,
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
    const f = grenzfaelle([tag('2026-10-06', '14:00', '23:00', 30), tag('2026-10-07', '07:00', '15:00', 30)], OKTOBER, ERWACHSEN);
    expect(f).toEqual([{ art: 'ruhezeit', bezug: '2026-10-07', jugendlich: false, ist: 480, grenze: 660 }]);
    // Notdienst bis 02:00, Beginn um 13:00 — genau 11 Std.: kein Fall.
    expect(grenzfaelle([tag('2026-10-06', '18:00', '02:00', 30), tag('2026-10-07', '13:00', '17:00')], OKTOBER, ERWACHSEN)).toEqual([]);
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

describe('Ruhepausen (seit 10.10.2026)', () => {
  const pausen = (e: GrenzEintrag[], person = ERWACHSEN, optionen = {}) =>
    grenzfaelle(e, OKTOBER, person, optionen).filter((f) => f.art === 'pause');

  it('mehr als 6 Std. ohne Pause ist ein Fall (§ 11 AZG)', () => {
    expect(pausen([tag('2026-10-06', '07:00', '13:01')])).toEqual([
      { art: 'pause', bezug: '2026-10-06', jugendlich: false, ist: 0, grenze: 30 },
    ]);
    expect(grenzText(pausen([tag('2026-10-06', '07:00', '15:00', 15)])[0])).toEqual({
      titel: 'Pause am 06.10.: 15 Min. — mindestens 30 Min. ab 6 Std. Arbeit', gesetz: '§ 11 AZG',
    });
  });

  it('Gegenprobe: genau 6 Std. ohne Pause, oder 30 Min. eingetragen, ist kein Fall', () => {
    expect(pausen([tag('2026-10-06', '07:00', '13:00')])).toEqual([]);
    expect(pausen([tag('2026-10-06', '07:00', '15:30', 30)])).toEqual([]);
  });

  it('eine Lücke zwischen zwei Buchungen zählt als Pause — ab 10 Min.', () => {
    expect(pausen([tag('2026-10-06', '07:00', '12:00'), tag('2026-10-06', '12:30', '16:00')])).toEqual([]);
    // Drei Teile zu 10 Min. reichen (§ 11 Abs 2 AZG).
    expect(pausen([
      tag('2026-10-06', '07:00', '09:00'), tag('2026-10-06', '09:10', '11:00'),
      tag('2026-10-06', '11:10', '13:00'), tag('2026-10-06', '13:10', '16:00'),
    ])).toEqual([]);
    // Zweimal 9 Min. Lücke sind keine Pause: der Fall bleibt.
    expect(pausen([
      tag('2026-10-06', '07:00', '11:00'), tag('2026-10-06', '11:09', '13:00'), tag('2026-10-06', '13:09', '16:00'),
    ]).map((f) => f.ist)).toEqual([0]);
  });

  it('Jugendliche: schon ab mehr als 4,5 Std. (§ 15 KJBG)', () => {
    const f = pausen([tag('2026-10-06', '07:00', '12:00')], JUGENDLICH);
    expect(f).toEqual([{ art: 'pause', bezug: '2026-10-06', jugendlich: true, ist: 0, grenze: 30 }]);
    expect(grenzText(f[0]).gesetz).toBe('§ 15 KJBG');
    expect(pausen([tag('2026-10-06', '07:00', '11:30')], JUGENDLICH)).toEqual([]);
    expect(pausen([tag('2026-10-06', '07:00', '12:00')], ERWACHSEN)).toEqual([]);
  });

  it('der laufende Tag wird nicht geprüft — die Mittagspause kann noch kommen', () => {
    const vormittag = [tag('2026-10-06', '06:00', '12:30')];
    expect(pausen(vormittag, ERWACHSEN, { stichtag: '2026-10-06' })).toEqual([]);
    expect(pausen(vormittag, ERWACHSEN, { stichtag: '2026-10-07' })).toHaveLength(1);
  });

  it('ein Tag mit einer Buchung ohne Uhrzeit wird nicht geprüft', () => {
    const ohneUhrzeit: GrenzEintrag = { date: '2026-10-06', status: 'Anwesend', hours: 2 };
    expect(pausen([tag('2026-10-06', '07:00', '14:00'), ohneUhrzeit])).toEqual([]);
  });
});

describe('Durchschnitt von 48 Std. über 17 Wochen (seit 10.10.2026)', () => {
  /** `n` Wochen bis einschließlich der Woche ab `letzterMontag`, Mo–Fr je `std` Stunden (mit Pause). */
  const wochen = (letzterMontag: string, n: number, std: number): GrenzEintrag[] => {
    const raus: GrenzEintrag[] = [];
    for (let w = 0; w < n; w += 1) {
      for (let i = 0; i < 5; i += 1) {
        const d = new Date(`${letzterMontag}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 7 * w + i);
        const ende = 6 * 60 + std * 60 + 30;
        raus.push(tag(d.toISOString().slice(0, 10), '06:00', `${String(Math.floor(ende / 60)).padStart(2, '0')}:${String(ende % 60).padStart(2, '0')}`, 30));
      }
    }
    return raus;
  };
  const schnitt = (e: GrenzEintrag[], person: object = ERWACHSEN, durchrechnungWochen?: number) =>
    grenzfaelle(e, { von: '2026-10-05', bis: '2026-10-11' }, person, { durchrechnungWochen })
      .filter((f) => f.art === 'durchschnitt');

  it('17 Wochen zu 50 Std. sind ein Fall (§ 9 Abs 4 AZG)', () => {
    const f = schnitt(wochen('2026-10-05', 17, 10));
    expect(f).toEqual([{ art: 'durchschnitt', bezug: '2026-10-05', jugendlich: false, ist: 50 * 60, grenze: 48 * 60, wochen: 17 }]);
    expect(grenzText(f[0])).toEqual({
      titel: 'Schnitt der 17 Wochen bis KW 41: 50:00 Std. — höchstens 48 Std.', gesetz: '§ 9 Abs 4 AZG',
    });
  });

  it('Gegenprobe: 17 Wochen zu 48 Std. sind keiner — und ohne Vorlauf zählen die fehlenden Wochen mit null', () => {
    expect(schnitt(wochen('2026-10-05', 17, 9.6))).toEqual([]);
    // Nur vier Wochen zu 50 Std. gebucht: 200 / 17 — kein Fall.
    expect(schnitt(wochen('2026-10-05', 4, 10))).toEqual([]);
  });

  it('Urlaub zählt neutral: er verkürzt den Zeitraum, statt den Schnitt zu drücken', () => {
    // 16 Wochen zu 50 Std., eine Woche Urlaub: 800 / 16 = 50.
    const gearbeitet = wochen('2026-10-05', 17, 10).filter((e) => e.date < '2026-09-21' || e.date > '2026-09-25');
    const urlaub: GrenzEintrag[] = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
      .map((date) => ({ date, status: 'Urlaub' }));
    expect(schnitt([...gearbeitet, ...urlaub]).map((f) => f.ist)).toEqual([50 * 60]);
    // Gegenprobe: dieselbe Woche ohne Eintrag (etwa Zeitausgleich) zählt mit null: 800 / 17.
    expect(schnitt(gearbeitet)).toEqual([]);
  });

  it('nicht für Jugendliche — für sie gelten 40 Std. in jeder Woche', () => {
    expect(schnitt(wochen('2026-10-05', 17, 10), JUGENDLICH)).toEqual([]);
  });

  // Seit 10.10.2026: der Zeitraum je Betrieb, laut Kollektivvertrag bis 52 Wochen.
  it('mit 26 Wochen des Betriebs: dieselben 17 Wochen zu 50 Std. sind 850 / 26 — kein Fall', () => {
    expect(schnitt(wochen('2026-10-05', 17, 10), ERWACHSEN, 26)).toEqual([]);
    const f = schnitt(wochen('2026-10-05', 26, 10), ERWACHSEN, 26);
    expect(f).toEqual([{ art: 'durchschnitt', bezug: '2026-10-05', jugendlich: false, ist: 50 * 60, grenze: 48 * 60, wochen: 26 }]);
    expect(grenzText(f[0]).titel).toBe('Schnitt der 26 Wochen bis KW 41: 50:00 Std. — höchstens 48 Std.');
  });

  it('der Zeitraum bleibt zwischen 17 und 52 Wochen; sonst gilt das Gesetz', () => {
    expect([undefined, null, 17, 26, 52, 16, 53, 20.5, Number.NaN].map((w) => durchrechnungsWochen(w as number)))
      .toEqual([17, 17, 17, 26, 52, 17, 17, 17, 17]);
  });
});

describe('wo die neuen Fälle hängen', () => {
  it('die Pause an ihrem Tag (Streifen, „Buchung korrigieren“), der Schnitt an der Woche', async () => {
    const { istTagesfall } = await import('@/features/accounting/tagesauswertung');
    expect(istTagesfall({ art: 'pause' })).toBe(true);
    expect(istTagesfall({ art: 'durchschnitt' })).toBe(false);
    // Unverändert:
    expect(['tag', 'nacht', 'ruhezeit'].every((art) => istTagesfall({ art: art as 'tag' }))).toBe(true);
    expect(['woche', 'wochenruhe', 'wochenfrei'].some((art) => istTagesfall({ art: art as 'woche' }))).toBe(false);
  });
});
