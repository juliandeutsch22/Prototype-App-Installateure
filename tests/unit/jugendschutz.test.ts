import { describe, it, expect } from 'vitest';
import {
  andereVerteilung, buerobuchungGesperrt, grenzfaelle, grenzfaelleDerBuchung, grenzText, umfeldDerBuchung,
  unterrichtAusEingabe, type GrenzEintrag,
} from '@/features/accounting/arbeitszeitGrenzen';
import {
  alsEntwurf, jugendschutzHinweise, lehrbeginnVorEintritt,
} from '@/features/users/benutzerEntwurf';
import { jugendschutzEigen } from '@/features/dashboard/start/regeln';
import { startseite } from '@/features/dashboard/start/aufbau';
import type { AppUser } from '@/types';

/**
 * Jugendschutz in der Zeiterfassung (Testbericht Runde 3, M1 bis M3, G18).
 * Jede Prüfung mit Gegenprobe; wo etwas gleich bleiben muss, steht es eigens.
 */

const tag = (date: string, startTime: string, endTime: string, breakDuration = 0): GrenzEintrag =>
  ({ date, status: 'Anwesend', startTime, endTime, breakDuration });
const schule = (date: string, unterrichtMin?: number): GrenzEintrag =>
  ({ date, status: 'Berufsschule', unterrichtMin });

const JUGENDLICH = { geburtsdatum: '2010-03-15' };
const OKTOBER = { von: '2026-10-01', bis: '2026-10-31' };

describe('M1 — Berufsschultag mit Unterrichtszeit', () => {
  const tagessoll85 = { ...JUGENDLICH, schultagMin: () => 510 };

  it('zählt die Unterrichtszeit statt des Tagessolls', () => {
    expect(grenzfaelle([schule('2026-10-08', 420)], OKTOBER, tagessoll85)).toEqual([]);
  });

  it('bleibt gleich: ohne Unterrichtszeit zählt das Tagessoll — 8:30 Std. sind ein Fall', () => {
    expect(grenzfaelle([schule('2026-10-08')], OKTOBER, tagessoll85)).toEqual([
      { art: 'tag', bezug: '2026-10-08', jugendlich: true, ist: 510, grenze: 480 },
    ]);
  });

  it('die Unterrichtszeit zählt auch in die Woche', () => {
    const woche = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09'].map((d) => tag(d, '07:00', '15:30', 30));
    const mitSchule = [...woche, schule('2026-10-08', 9 * 60)];
    expect(grenzfaelle(mitSchule, OKTOBER, tagessoll85).filter((f) => f.art === 'woche'))
      .toEqual([{ art: 'woche', bezug: '2026-10-05', jugendlich: true, ist: 41 * 60, grenze: 40 * 60 }]);
    const kurz = [...woche, schule('2026-10-08', 8 * 60)];
    expect(grenzfaelle(kurz, OKTOBER, tagessoll85).filter((f) => f.art === 'woche')).toEqual([]);
  });
});

describe('M1 — andere Verteilung der Wochenarbeitszeit (§ 11 Abs 2 KJBG)', () => {
  it('erkennt kürzere und längere Tage mit höchstens 40 Std.', () => {
    expect(andereVerteilung({ workDays: [1, 2, 3, 4, 5], tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8.5, 5: 6 } })).toBe(true);
  });

  it('Gegenprobe: gleichmässig, ohne eigenes Tagessoll oder über 40 Std. ist es keine', () => {
    expect(andereVerteilung({ workDays: [1, 2, 3, 4, 5], tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 } })).toBe(false);
    expect(andereVerteilung({ workDays: [1, 2, 3, 4, 5] })).toBe(false);
    expect(andereVerteilung({ workDays: [1, 2, 3, 4, 5], tagessoll: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 6 } })).toBe(false);
    expect(andereVerteilung(null)).toBe(false);
  });

  it('dann gilt am Tag 9 Std. — darüber ein Fall nach § 11 Abs 2', () => {
    const p = { ...JUGENDLICH, andereVerteilung: true };
    expect(grenzfaelle([tag('2026-10-08', '07:00', '16:00', 30)], OKTOBER, p)).toEqual([]);
    const f = grenzfaelle([tag('2026-10-08', '07:00', '17:00', 30)], OKTOBER, p);
    expect(f).toEqual([{ art: 'tag', bezug: '2026-10-08', jugendlich: true, ist: 570, grenze: 540 }]);
    expect(grenzText(f[0]).gesetz).toBe('§ 11 Abs 2 KJBG');
  });

  it('Gegenprobe: ohne andere Verteilung sind 8:30 Std. ein Fall nach § 11', () => {
    const f = grenzfaelle([tag('2026-10-08', '07:00', '16:00', 30)], OKTOBER, JUGENDLICH);
    expect(f).toEqual([{ art: 'tag', bezug: '2026-10-08', jugendlich: true, ist: 510, grenze: 480 }]);
    expect(grenzText(f[0]).gesetz).toBe('§ 11 KJBG');
  });
});

describe('M1 — keine Verstöße in der Zukunft', () => {
  // Mit Pause: hier geht es um den Tag, nicht um die Ruhepause.
  const lang = [tag('2026-10-06', '07:00', '17:00', 30), tag('2026-10-22', '07:00', '17:00', 30)];

  it('mit Stichtag zählt nur, was bis dahin gebucht ist', () => {
    expect(grenzfaelle(lang, OKTOBER, JUGENDLICH, { stichtag: '2026-10-20' }).map((f) => f.bezug)).toEqual(['2026-10-06']);
  });

  it('Gegenprobe: ohne Stichtag (Rückfrage vor dem Buchen) zählt auch der künftige Tag', () => {
    expect(grenzfaelle(lang, OKTOBER, JUGENDLICH).map((f) => f.bezug)).toEqual(['2026-10-06', '2026-10-22']);
  });

  it('ein Monat ganz in der Zukunft hat keinen Fall; ein künftiger Tag macht die laufende Woche nicht voll', () => {
    expect(grenzfaelle(lang, { von: '2026-11-01', bis: '2026-11-30' }, JUGENDLICH, { stichtag: '2026-10-20' })).toEqual([]);
    const woche = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
      .map((d) => tag(d, '07:00', '14:30', 30));
    expect(grenzfaelle(woche, OKTOBER, JUGENDLICH, { stichtag: '2026-10-20' })).toEqual([]);
    expect(grenzfaelle(woche, OKTOBER, JUGENDLICH).some((f) => f.art === 'woche')).toBe(true);
  });
});

describe('M2 — die Fälle einer Buchung vor dem Speichern', () => {
  it('die Ruhepause fragt nicht vor dem Speichern — wer vormittags bucht, hat Mittag noch vor sich', () => {
    const vormittag = [tag('2026-10-06', '07:00', '12:00')];
    expect(grenzfaelleDerBuchung(vormittag, '2026-10-06', JUGENDLICH)).toEqual([]);
    // Gegenprobe: die Mitarbeiterübersicht zeigt den Tag, wenn er so vorbei ist.
    expect(grenzfaelle(vormittag, OKTOBER, JUGENDLICH, { stichtag: '2026-10-07' }).map((f) => f.art)).toEqual(['pause']);
  });

  it('10:45 Std. ab 5 Uhr: Tagesgrenze und Nachtruhe', () => {
    const f = grenzfaelleDerBuchung([tag('2026-10-06', '05:00', '16:15', 30)], '2026-10-06', JUGENDLICH);
    expect(f.map((x) => x.art)).toEqual(['tag', 'nacht']);
  });

  it('die Ruhezeit vor dem Tag und danach', () => {
    const vortag = tag('2026-10-05', '12:00', '19:30');
    const folgetag = tag('2026-10-07', '06:30', '12:00');
    const f = grenzfaelleDerBuchung([vortag, tag('2026-10-06', '06:30', '14:00'), folgetag], '2026-10-06', JUGENDLICH);
    expect(f.filter((x) => x.art === 'ruhezeit').map((x) => x.bezug)).toEqual(['2026-10-06']);
    const spaet = tag('2026-10-06', '10:00', '19:00', 60);
    const g = grenzfaelleDerBuchung([spaet, folgetag], '2026-10-06', JUGENDLICH);
    expect(g.filter((x) => x.art === 'ruhezeit').map((x) => x.bezug)).toEqual(['2026-10-07']);
  });

  it('Gegenprobe: ein Verstoss an einem anderen Tag gehört nicht zu dieser Buchung', () => {
    const f = grenzfaelleDerBuchung(
      [tag('2026-10-02', '05:00', '17:00'), tag('2026-10-06', '07:00', '15:00')], '2026-10-06', JUGENDLICH,
    );
    expect(f).toEqual([]);
  });

  it('die Woche, in der gebucht wird, mit dem Umfeld vom Montag davor bis zum Montag danach', () => {
    expect(umfeldDerBuchung('2026-10-08')).toEqual({ von: '2026-09-28', bis: '2026-10-12' });
    const woche = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
      .map((d) => tag(d, '07:00', '15:30', 30));
    const neu = tag('2026-10-10', '08:00', '10:00');
    const f = grenzfaelleDerBuchung([...woche, neu], '2026-10-10', JUGENDLICH);
    expect(f.map((x) => x.art)).toContain('woche');
  });
});

describe('M2 — vom Büro gebucht, über der Grenze: nur das Büro', () => {
  const buero = (e: GrenzEintrag) => ({ ...e, userId: 'lena', angelegtVon: 'buero' });

  it('Tag über 8 Std. oder Nachtruhe: gesperrt', () => {
    const lang = buero(tag('2026-10-06', '07:00', '17:00', 30));
    expect(buerobuchungGesperrt(lang, [lang], '2010-03-15')).toBe('tag');
    const frueh = buero(tag('2026-10-06', '05:00', '09:00'));
    expect(buerobuchungGesperrt(frueh, [frueh], '2010-03-15')).toBe('nacht');
  });

  it('die Summe des Tages zählt — auch mit einer eigenen Buchung daneben', () => {
    const vormittag = buero(tag('2026-10-06', '07:00', '12:00'));
    const nachmittag = { ...tag('2026-10-06', '12:30', '17:00'), userId: 'lena', angelegtVon: 'lena' };
    expect(buerobuchungGesperrt(vormittag, [vormittag, nachmittag], '2010-03-15')).toBe('tag');
    // Die eigene Buchung bleibt frei.
    expect(buerobuchungGesperrt(nachmittag, [vormittag, nachmittag], '2010-03-15')).toBeNull();
  });

  it('Gegenprobe: selbst gebucht, erwachsen, ohne Geburtsdatum, unbekannter Anleger, innerhalb der Grenze — frei', () => {
    const lang = tag('2026-10-06', '07:00', '17:00', 30);
    expect(buerobuchungGesperrt({ ...lang, userId: 'lena', angelegtVon: 'lena' }, [lang], '2010-03-15')).toBeNull();
    expect(buerobuchungGesperrt(buero(lang), [lang], '1990-01-01')).toBeNull();
    expect(buerobuchungGesperrt(buero(lang), [lang], null)).toBeNull();
    expect(buerobuchungGesperrt({ ...lang, userId: 'lena', angelegtVon: null }, [lang], '2010-03-15')).toBeNull();
    const kurz = buero(tag('2026-10-06', '07:00', '15:00'));
    expect(buerobuchungGesperrt(kurz, [kurz], '2010-03-15')).toBeNull();
  });

  it('am 18. Geburtstag nicht mehr', () => {
    const lang = buero(tag('2028-03-15', '07:00', '17:00'));
    expect(buerobuchungGesperrt(lang, [lang], '2010-03-15')).toBeNull();
    const vorher = buero(tag('2028-03-14', '07:00', '17:00'));
    expect(buerobuchungGesperrt(vorher, [vorher], '2010-03-15')).toBe('tag');
  });
});

describe('M1 — Unterrichtszeit aus dem Feld', () => {
  it('liest Komma, Punkt und Uhrzeit; leer heisst Tagessoll', () => {
    expect(unterrichtAusEingabe('7,5')).toEqual({ min: 450, fehler: null });
    expect(unterrichtAusEingabe('7.5')).toEqual({ min: 450, fehler: null });
    expect(unterrichtAusEingabe('7:30')).toEqual({ min: 450, fehler: null });
    expect(unterrichtAusEingabe(' 8 ')).toEqual({ min: 480, fehler: null });
    expect(unterrichtAusEingabe('')).toEqual({ min: null, fehler: null });
  });

  it('Gegenprobe: keine Zahl, null oder über 12 Std. wird nicht angenommen', () => {
    expect(unterrichtAusEingabe('acht').fehler).toMatch(/keine Stundenzahl/);
    expect(unterrichtAusEingabe('0').fehler).toMatch(/zwischen 0 und 12/);
    expect(unterrichtAusEingabe('13').fehler).toMatch(/zwischen 0 und 12/);
  });
});

describe('M2 — Hinweis in der Akte', () => {
  const person = (teil: Partial<AppUser>): AppUser => ({
    uid: 'u1', id: 'u1', companyId: 'perl', name: 'Lena', email: 'l@perl.at', role: 'Mitarbeiter',
    active: true, weeklyTargetHours: 40, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], ...teil,
  } as AppUser);
  const HEUTE = '2026-10-06';

  it('unter 18: Tagessoll über 8 Std. und Wochensoll über 40 Std. werden genannt', () => {
    const lang = alsEntwurf(person({ tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8.5, 5: 6 } }));
    expect(jugendschutzHinweise(lang, '2010-03-15', HEUTE)).toEqual([
      'Tagessoll Do 8,5 Std. — für Jugendliche höchstens 8 Std. am Tag, bei anderer Verteilung der Wochenarbeitszeit bis 9 Std. (§ 11 Abs 2 KJBG, vorbehaltlich der WKO-Klärung).',
    ]);
    const woche = alsEntwurf(person({ weeklyTargetHours: 42 }));
    expect(jugendschutzHinweise(woche, '2010-03-15', HEUTE)).toEqual([
      'Wochensoll 42 Std. — für Jugendliche höchstens 40 Std. in der Woche (§ 11 KJBG).',
      'Tagessoll 8,4 Std. (Wochenstunden durch Arbeitstage) — für Jugendliche höchstens 8 Std. am Tag (§ 11 KJBG).',
    ]);
  });

  it('Gegenprobe: ab 18, ohne Geburtsdatum oder innerhalb der Grenzen kein Hinweis', () => {
    const lang = alsEntwurf(person({ tagessoll: { 1: 8, 2: 8, 3: 8, 4: 8.5, 5: 6 } }));
    expect(jugendschutzHinweise(lang, '2008-10-06', HEUTE)).toEqual([]);
    expect(jugendschutzHinweise(lang, null, HEUTE)).toEqual([]);
    expect(jugendschutzHinweise(alsEntwurf(person({})), '2010-03-15', HEUTE)).toEqual([]);
  });
});

describe('G18 — Lehrbeginn vor dem Eintritt', () => {
  it('ist ein Hinweis beim Lehrling', () => {
    expect(lehrbeginnVorEintritt({ einstufung: 'lehrling', lehrbeginn: '2025-09-01' }, '2026-10-01')).toBe(true);
  });

  it('Gegenprobe: am oder nach dem Eintritt, ohne Lehrbeginn oder ohne Lehre nicht', () => {
    expect(lehrbeginnVorEintritt({ einstufung: 'lehrling', lehrbeginn: '2026-10-01' }, '2026-10-01')).toBe(false);
    expect(lehrbeginnVorEintritt({ einstufung: 'lehrling', lehrbeginn: '' }, '2026-10-01')).toBe(false);
    expect(lehrbeginnVorEintritt({ einstufung: 'helfer', lehrbeginn: '2025-09-01' }, '2026-10-01')).toBe(false);
    expect(lehrbeginnVorEintritt({ einstufung: 'lehrling', lehrbeginn: '2025-09-01' }, '')).toBe(false);
  });
});

describe('M2 — Startseite des Lehrlings', () => {
  const faelle = grenzfaelle([tag('2026-09-10', '05:00', '16:00'), tag('2026-10-06', '07:00', '17:00')],
    { von: '2026-09-01', bis: '2026-10-06' }, JUGENDLICH);

  it('ein leiser Abschnitt, das Jüngste zuerst, auf die Zeiterfassung', () => {
    const a = jugendschutzEigen(faelle)!;
    expect(a.titel).toBe('Grenzen für Jugendliche');
    expect(a.zeilen[0].titel).toMatch(/am 06\.10\./);
    expect(a.zeilen.every((z) => z.status?.ton === 'leise' && z.to === '/time')).toBe(true);
    const seite = startseite({ eigeneGrenzfaelle: faelle }, {
      rolle: 'monteur', heute: '2026-10-06', jetzt: 0, darf: () => true, urlaubEntscheiden: false,
    });
    expect(seite.abschnitte.map((x) => x.key)).toContain('jugendschutz');
  });

  it('Gegenprobe: ohne Fälle kein Abschnitt', () => {
    expect(jugendschutzEigen([])).toBeNull();
    const seite = startseite({ eigeneGrenzfaelle: [] }, {
      rolle: 'monteur', heute: '2026-10-06', jetzt: 0, darf: () => true, urlaubEntscheiden: false,
    });
    expect(seite.abschnitte.map((x) => x.key)).not.toContain('jugendschutz');
  });
});
