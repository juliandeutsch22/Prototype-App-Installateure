import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { personAm, todayStr } from '@/lib/time';
import { ueberstundenNachTagesgrenze } from '@/features/accounting/ueberstunden';
import { grenzArbeitszeit, grenzfaelle } from '@/features/accounting/arbeitszeitGrenzen';
import { ueberstundenRegelVon } from '@/lib/lohnregeln';
import { zeitkontoBestand, type BestandPerson } from '../fixtures/zeitkontoBestand';
import type { AppUser, ArbeitszeitAbschnitt, TimeEntry } from '@/types';

/**
 * ÜBERSTUNDEN, TEILZEIT-MEHRARBEIT UND ARBEITSZEITGRENZEN MIT DEM VERLAUF
 * (Durchsicht 15.11.2026, Z3a).
 *
 * Bis hierher nahmen sie für den ganzen Monat eine Arbeitszeit: die Mehrarbeit
 * einer Teilzeitkraft, die Mitte Juni auf Vollzeit wechselt, verschwand für
 * den ganzen Juni; die andere Verteilung eines Lehrlings (9 Std. an vier
 * Tagen) galt nach dem Wechsel auf acht Stunden je Tag weiter. Die
 * Grenzwerte des Gesetzes bleiben; nur die damals geltende Arbeitszeit wird
 * eingespeist.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
});
afterAll(() => vi.useRealTimers());

const regel = ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' });
const tag = (date: string, von: string, bis: string) =>
  ({ id: date, companyId: 'perl', userId: 'p', date, status: 'Anwesend', startTime: von, endTime: bis, breakDuration: 0 }) as TimeEntry;

describe('Teilzeit-Mehrarbeit bei einem Wechsel mitten im Monat', () => {
  // Bis 14.06. 20 Std (Mo–Fr 4 Std), ab Montag 15.06. Vollzeit 40 Std.
  const verlauf: ArbeitszeitAbschnitt[] = [
    { ab: '2026-01-01', wochenstunden: 20, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
    { ab: '2026-06-15', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
  ];
  const pia = { id: 'p', uid: 'p', weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], arbeitszeitVerlauf: verlauf } as AppUser;
  // Woche vor dem Wechsel: jeden Tag 6 Std (2 Std Mehrarbeit), danach 8 Std.
  const juni = [
    ...['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'].map((d) => tag(d, '07:00', '13:00')),
    ...['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'].map((d) => tag(d, '07:00', '15:00')),
  ];

  it('die Woche vor dem Wechsel trägt ihre Mehrarbeit, die Woche danach keine', () => {
    const ue = ueberstundenNachTagesgrenze(pia, juni, regel, true);
    expect(ue.mehrarbeitTeilzeitMin).toBe(5 * 120);
    expect(ue.fuenfzigMin).toBe(0);
  });

  it('Gegenprobe: mit der Arbeitszeit vom Monatsende allein verschwand die Mehrarbeit', () => {
    const amMonatsende = { ...personAm(pia, '2026-06-30'), arbeitszeitVerlauf: null };
    expect(ueberstundenNachTagesgrenze(amMonatsende, juni, regel, true).mehrarbeitTeilzeitMin ?? 0).toBe(0);
  });
});

describe('andere Verteilung (KJBG) bei einem Wechsel', () => {
  // Bis 14.06. 9/9/9/9/4 (andere Verteilung), ab 15.06. gleichmäßig 8 Std.
  const lena = {
    tagessoll: null, workDays: [1, 2, 3, 4, 5], weeklyTargetHours: 40,
    arbeitszeitVerlauf: [
      { ab: '2026-01-01', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 4 } },
      { ab: '2026-06-15', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
    ],
  };
  const person = { geburtsdatum: '2010-03-01', ...grenzArbeitszeit(lena, true) };
  const neun = (d: string) => tag(d, '07:00', '16:00');

  it('vorher sind neun Stunden erlaubt, danach ein Verstoß', () => {
    const vorher = grenzfaelle([neun('2026-06-09')], { von: '2026-06-08', bis: '2026-06-14' }, person);
    const nachher = grenzfaelle([neun('2026-06-16')], { von: '2026-06-15', bis: '2026-06-21' }, person);
    expect(vorher.filter((f) => f.art === 'tag')).toEqual([]);
    expect(nachher.filter((f) => f.art === 'tag').map((f) => f.grenze)).toEqual([8 * 60]);
  });

  it('bleibt gleich: ohne Verlauf dieselben Werte wie vorher', () => {
    const ohne = { tagessoll: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 4 }, workDays: [1, 2, 3, 4, 5] };
    expect(grenzArbeitszeit(ohne, true)).toEqual({ andereVerteilung: true, arbeitstageJeWoche: 5 });
  });
});

/*
  BLEIBT GLEICH über den gewachsenen Bestand: mit dem Eintrag „ab
  Saldo-Start mit den heutigen Werten“ dieselben Überstunden und dieselben
  Grenzfälle wie ohne Verlauf.
*/
describe('bleibt gleich: Überstunden und Grenzfälle ohne Änderung der Arbeitszeit', () => {
  const bestand = zeitkontoBestand(todayStr());
  const mitBasis = (p: BestandPerson): BestandPerson => ({
    ...p,
    arbeitszeitVerlauf: [{ ab: p.appStartDate ?? '2020-01-01', wochenstunden: p.weeklyTargetHours ?? null, arbeitstage: p.workDays ?? [1, 2, 3, 4, 5], tagessoll: p.tagessoll ?? null }],
  });
  const monate = ['2026-01', '2026-03', '2026-06', '2026-10'];
  const kv = ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze', ueberstundenKvMetall: true } as never);

  it('je Person und Monat', () => {
    for (const p of bestand.personen) {
      for (const m of monate) {
        const imMonat = bestand.buchungen.filter((e) => e.userId === p.uid && e.date.startsWith(m));
        for (const r of [regel, kv]) {
          expect(ueberstundenNachTagesgrenze(mitBasis(p), imMonat, r, p.halbeTage))
            .toEqual(ueberstundenNachTagesgrenze(p, imMonat, r, p.halbeTage));
        }
        const zeitraum = { von: `${m}-01`, bis: `${m}-28` };
        expect(grenzfaelle(imMonat, zeitraum, { geburtsdatum: '2009-01-01', ...grenzArbeitszeit(mitBasis(p)) }))
          .toEqual(grenzfaelle(imMonat, zeitraum, { geburtsdatum: '2009-01-01', ...grenzArbeitszeit(p) }));
      }
    }
  }, 30_000);
});
