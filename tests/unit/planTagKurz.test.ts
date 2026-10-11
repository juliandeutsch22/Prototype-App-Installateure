/**
 * `tagKurz` der Planung (11.10.2026): die Formatierer einmal, jeder Tag einmal.
 *
 * Die Monatsansicht fragt je Zelle zweimal; mit einem neuen Formatierer je
 * Aufruf kostete das im Profil 3,7 s, bevor die Seite sich zeigte.
 * Gegenprobe: gegen den Stand davor rot (er rief `toLocaleDateString`).
 * Gleich bleibt: derselbe Text wie vorher, an jedem Tag des Jahres.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tagKurz } from '@/features/assignments/planTypen';
import { tagLang } from '@/features/assignments/wochenTermine';

afterEach(() => { vi.restoreAllMocks(); });

const tageDesJahres = (jahr: number) =>
  Array.from({ length: 366 }, (_, i) => new Date(jahr, 0, 1 + i))
    .filter((d) => d.getFullYear() === jahr)
    .map((d) => `${jahr}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

describe('tagKurz der Planung', () => {
  it('schreibt jeden Tag wie vorher', () => {
    for (const iso of tageDesJahres(2026)) {
      const d = new Date(`${iso}T00:00:00`);
      expect(tagKurz(iso)).toEqual({
        wochentag: d.toLocaleDateString('de-AT', { weekday: 'short' }),
        datum: d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }),
      });
    }
  });

  it('baut dafür keinen Formatierer je Aufruf', () => {
    const teuer = vi.spyOn(Date.prototype, 'toLocaleDateString');
    // Ein Jahr, das noch niemand gefragt hat — und jeder Tag zweimal, wie in der Monatsansicht.
    for (const iso of [...tageDesJahres(2031), ...tageDesJahres(2031)]) tagKurz(iso);
    expect(teuer).not.toHaveBeenCalled();
  });
});

describe('tagLang der Planung (Vorlesetext im Raster)', () => {
  it('schreibt jeden Tag wie vorher', () => {
    for (const iso of tageDesJahres(2026)) {
      const d = new Date(`${iso}T00:00:00`);
      expect(tagLang(iso)).toBe(
        `${d.toLocaleDateString('de-AT', { weekday: 'long' })} ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`,
      );
    }
  });

  it('baut dafür keinen Formatierer je Aufruf', () => {
    const teuer = vi.spyOn(Date.prototype, 'toLocaleDateString');
    for (const iso of [...tageDesJahres(2032), ...tageDesJahres(2032)]) tagLang(iso);
    expect(teuer).not.toHaveBeenCalled();
  });
});
