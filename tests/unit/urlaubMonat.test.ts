import { describe, it, expect } from 'vitest';
import { amTag, artText, gleichzeitigMit, monatsGrenzen, personenJeTag, zeitspanne } from '@/features/vacations/urlaubMonat';

/** Wer wann frei hat — die Rechnung hinter der Monatskarte und „Gleichzeitig im Urlaub“ (17 H). */
const u = (userId: string, von: string, bis: string, extra: Record<string, unknown> = {}) =>
  ({ userId, userName: userId.toUpperCase(), von, bis, ...extra });

describe('monatsGrenzen', () => {
  it('kennt Schaltjahr und Monatsende', () => {
    expect(monatsGrenzen(2028, 1)).toEqual({ von: '2028-02-01', bis: '2028-02-29' });
    expect(monatsGrenzen(2026, 9)).toEqual({ von: '2026-10-01', bis: '2026-10-31' });
  });
});

describe('personenJeTag', () => {
  it('zählt Personen, nicht Anträge — und nur im Zeitraum', () => {
    const je = personenJeTag([
      u('a', '2026-09-28', '2026-10-02'),
      u('a', '2026-10-02', '2026-10-02', { art: 'Zeitausgleich' }),
      u('b', '2026-10-02', '2026-10-03'),
    ], '2026-10-01', '2026-10-31');
    expect([...je].sort()).toEqual([['2026-10-01', 1], ['2026-10-02', 2], ['2026-10-03', 1]]);
  });

  it('über die Zeitumstellung hinweg jeden Tag genau einmal', () => {
    // 25.10.2026: die Uhr geht eine Stunde zurück — der Tag hat 25 Stunden.
    const je = personenJeTag([u('a', '2026-10-24', '2026-10-27')], '2026-10-01', '2026-10-31');
    expect([...je.keys()]).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  });
});

describe('amTag und artText', () => {
  it('wer an einem Tag frei hat, nach Namen', () => {
    expect(amTag([u('zoe', '2026-10-01', '2026-10-05'), u('anna', '2026-10-05', '2026-10-05'), u('max', '2026-10-06', '2026-10-06')], '2026-10-05')
      .map((v) => v.userId)).toEqual(['anna', 'zoe']);
  });

  it('nennt Urlaub, Betriebsurlaub und Zeitausgleich mit Stunden', () => {
    expect(artText(u('a', 'x', 'x'))).toBe('Urlaub');
    expect(artText(u('a', 'x', 'x', { betriebsurlaubId: 'b1' }))).toBe('Betriebsurlaub');
    expect(artText(u('a', 'x', 'x', { art: 'Zeitausgleich', zaVon: '13:00', zaBis: '17:00' }))).toBe('Zeitausgleich 13:00–17:00');
    expect(artText(u('a', 'x', 'x', { art: 'Zeitausgleich' }))).toBe('Zeitausgleich');
  });
});

describe('gleichzeitigMit', () => {
  const antrag = u('max', '2026-11-16', '2026-11-20');

  it('jede andere Person einmal, ZA nur, wenn sie sonst keinen Urlaub hat', () => {
    expect(gleichzeitigMit(antrag, [
      u('bruno', '2026-11-19', '2026-11-19', { art: 'Zeitausgleich' }),
      u('anna', '2026-11-20', '2026-11-25'),
      u('anna', '2026-11-16', '2026-11-16', { art: 'Zeitausgleich' }),
      u('clara', '2026-11-21', '2026-11-22'),
      u('max', '2026-11-18', '2026-11-18'),
    ])).toEqual(['ANNA', 'BRUNO (ZA)']);
  });

  it('ein Betriebsurlaub ist kein Zeitausgleich', () => {
    expect(gleichzeitigMit(antrag, [u('dora', '2026-11-16', '2026-11-16', { art: 'Zeitausgleich', betriebsurlaubId: 'b' })]))
      .toEqual(['DORA']);
  });
});

describe('zeitspanne', () => {
  it('vom frühesten Beginn bis zum spätesten Ende — ohne Antrag nichts', () => {
    expect(zeitspanne([u('a', '2026-11-16', '2026-11-20'), u('b', '2026-10-01', '2026-10-02'), u('c', '2026-12-01', '2027-01-08')]))
      .toEqual({ von: '2026-10-01', bis: '2027-01-08' });
    expect(zeitspanne([])).toBeNull();
  });
});
