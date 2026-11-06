/**
 * DER PAPIERKORB AUF DER STARTSEITE DER SPITZE UND SEINE FRIST (M01d).
 *
 * - Die Frist rechnet in ganzen 24-Stunden-Tagen; Scheine ohne Zeitpunkt
 *   (vor dem 06.11.2026 verworfen) zählen ab der Einführung.
 * - Die Startseite lädt die Zahl nur mit Frist und nur für die Arten, deren
 *   Modul an ist — gezählt auf dem Server bis zum Stichtag.
 * - Der Hinweis steht nur bei der Spitze und nur, wenn etwas über der Frist
 *   liegt; er führt in den Papierkorb.
 *
 * Gegenprobe: ohne `papierkorbUeberFrist` in `laden.ts` und das Thema in
 * `aufbau.ts` fehlt die Zeile — rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Company } from '@/types';
import { fristStichtag, ohneZeitpunktUeberFrist, PAPIERKORB_SEIT, tageImPapierkorb, ueberFrist } from '@/lib/papierkorb';
import { startseite, type Umfeld } from '@/features/dashboard/start/aufbau';
import { ZIEL } from '@/features/dashboard/start/ziele';
import { verworfenText } from '@/features/papierkorb/papierkorbText';

const zaehleVerworfeneAngebote = vi.fn<(c: string, bis?: string) => Promise<number>>(async () => 2);
const zaehleVerworfeneScheine = vi.fn<(c: string, bis?: string) => Promise<number>>(async () => 1);
vi.mock('@/lib/db/quotes', () => ({ zaehleVerworfeneAngebote: (c: string, b?: string) => zaehleVerworfeneAngebote(c, b) }));
vi.mock('@/lib/db/workSheets', async () => ({
  ...await vi.importActual<typeof import('@/lib/db/workSheets')>('@/lib/db/workSheets'),
  zaehleVerworfeneScheine: (c: string, b?: string) => zaehleVerworfeneScheine(c, b),
}));

const { einstellungen } = await import('@/features/dashboard/start/laden');

const TAG = 86_400_000;
const JETZT = Date.parse('2026-12-20T10:00:00+01:00');

beforeEach(() => {
  zaehleVerworfeneAngebote.mockClear();
  zaehleVerworfeneScheine.mockClear();
});

describe('Die Frist', () => {
  it('länger als X Tage heißt: X mal 24 Stunden vor jetzt und früher', () => {
    expect(fristStichtag(30, JETZT)).toBe(JETZT - 30 * TAG);
    expect(ueberFrist(JETZT - 30 * TAG, 30, JETZT)).toBe(true);
    expect(ueberFrist(JETZT - 30 * TAG + 1, 30, JETZT)).toBe(false);
  });

  it('ohne Frist ist nichts darüber', () => {
    expect(fristStichtag(null, JETZT)).toBeNull();
    expect(fristStichtag(0, JETZT)).toBeNull();
    expect(ueberFrist(0, null, JETZT)).toBe(false);
  });

  it('ohne Zeitpunkt zählt ab der Einführung am 06.11.2026 — nicht geraten', () => {
    expect(new Date(PAPIERKORB_SEIT).toISOString()).toBe('2026-11-05T23:00:00.000Z');
    expect(tageImPapierkorb(null, JETZT)).toBe(tageImPapierkorb(PAPIERKORB_SEIT, JETZT));
    expect(ueberFrist(null, 30, JETZT)).toBe(true);
    expect(ueberFrist(null, 60, JETZT)).toBe(false);
    expect(ohneZeitpunktUeberFrist(PAPIERKORB_SEIT)).toBe(true);
    expect(ohneZeitpunktUeberFrist(PAPIERKORB_SEIT - 1)).toBe(false);
    expect(verworfenText({ verworfenAm: null, verworfenVonName: 'Max' }, JETZT))
      .toBe('verworfen von Max vor dem 06.11.2026 · Zeitpunkt unbekannt');
  });

  it('„seit N Tagen“ mit Datum und Name', () => {
    expect(verworfenText({ verworfenAm: JETZT - 5 * TAG, verworfenVonName: 'Carla Chefin' }, JETZT))
      .toBe('verworfen von Carla Chefin am 15.12.2026 · seit 5 Tagen');
    expect(verworfenText({ verworfenAm: JETZT - 1000 }, JETZT)).toBe('verworfen am 20.12.2026 · seit heute');
  });
});

describe('Die Startseite lädt die Zahl', () => {
  const kontext = (frist: number | null) => ({
    user: { uid: 'u', companyId: 'perl', role: 'Geschäftsführung' as const },
    company: { id: 'perl', name: 'Perl', papierkorbFristTage: frist } as unknown as Company,
    heute: '2026-12-20',
  });
  const nichts = { rechnungen: false, konten: false, personen: false };

  it('mit Frist: Angebote und Scheine bis zum Stichtag, zusammengezählt', async () => {
    const d = await einstellungen(kontext(30), { ...nichts, papierkorb: { angebote: true, scheine: true } });
    expect(d.papierkorbUeberFrist).toEqual({ anzahl: 3, tage: 30 });
    const bis = zaehleVerworfeneAngebote.mock.calls[0][1]!;
    expect(Date.now() - Date.parse(bis)).toBeGreaterThanOrEqual(30 * TAG);
    expect(Date.now() - Date.parse(bis)).toBeLessThan(30 * TAG + 60_000);
    expect(zaehleVerworfeneScheine.mock.calls[0][1]).toBe(bis);
  });

  it('nur die Arten, deren Modul an ist', async () => {
    const d = await einstellungen(kontext(30), { ...nichts, papierkorb: { angebote: false, scheine: true } });
    expect(zaehleVerworfeneAngebote).not.toHaveBeenCalled();
    expect(d.papierkorbUeberFrist).toEqual({ anzahl: 1, tage: 30 });
  });

  it('Gegenprobe: ohne Frist oder ohne Papierkorb im Auftrag fragt sie gar nicht', async () => {
    expect((await einstellungen(kontext(null), { ...nichts, papierkorb: { angebote: true, scheine: true } })).papierkorbUeberFrist)
      .toBeUndefined();
    expect((await einstellungen(kontext(30), nichts)).papierkorbUeberFrist).toBeUndefined();
    expect(zaehleVerworfeneAngebote).not.toHaveBeenCalled();
    expect(zaehleVerworfeneScheine).not.toHaveBeenCalled();
  });
});

describe('Der Hinweis auf der Startseite', () => {
  const umfeld = (teil: Partial<Umfeld> = {}): Umfeld => ({
    rolle: 'leitung', heute: '2026-12-20', jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, ...teil,
  });
  const zeilen = (s: ReturnType<typeof startseite>) =>
    s.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])]);

  it('bei der Spitze: „N Entwürfe liegen länger als X Tage im Papierkorb“, mit Weg dorthin', () => {
    const s = startseite({ papierkorbUeberFrist: { anzahl: 3, tage: 30 } }, umfeld());
    expect(zeilen(s).find((z) => z.key === 'papierkorb')).toMatchObject({
      titel: '3 Entwürfe liegen länger als 30 Tage im Papierkorb',
      detail: 'Einstellungen · Papierkorb',
      to: ZIEL.einstellungen('papierkorb'),
    });
    expect(ZIEL.einstellungen('papierkorb')).toBe('/settings/papierkorb');
    expect(zeilen(startseite({ papierkorbUeberFrist: { anzahl: 1, tage: 7 } }, umfeld())).find((z) => z.key === 'papierkorb')?.titel)
      .toBe('1 Entwurf liegt länger als 7 Tage im Papierkorb');
  });

  it('Gegenprobe: nichts darüber, keine Frist, oder nicht die Spitze — kein Hinweis', () => {
    for (const d of [{ papierkorbUeberFrist: { anzahl: 0, tage: 30 } }, { papierkorbUeberFrist: null }, {}]) {
      expect(zeilen(startseite(d, umfeld())).some((z) => z.key === 'papierkorb')).toBe(false);
    }
    for (const rolle of ['projektleitung', 'buchhaltung', 'verwaltung', 'monteur'] as const) {
      const s = startseite({ papierkorbUeberFrist: { anzahl: 3, tage: 30 } }, umfeld({ rolle }));
      expect(zeilen(s).some((z) => z.key === 'papierkorb'), rolle).toBe(false);
    }
  });
});
