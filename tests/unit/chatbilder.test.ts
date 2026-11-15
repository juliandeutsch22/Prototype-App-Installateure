import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vormerkung } from '@/lib/sync/ausgangsfach';

/**
 * L4 (Plan 15.11.2026): Bilder im Chat gehen verkleinert hinaus, mit einem
 * kleinen Vorschaubild für den Verlauf; das Bild selbst öffnet ein Tipp.
 *
 * GEGENPROBE (Erwartung): vor L4 ging ein Foto unverändert hinaus — „wird
 * verkleinert“ und „Vorschaubild geht mit“ sind dann rot; „PDF bleibt“ und
 * „ohne Vorschau wie bisher“ sind in beiden Fassungen grün.
 */
const vorgaenge: Array<{ art: string; daten: Record<string, unknown> }> = [];
let vorschauScheitert = false;
vi.mock('@/lib/db/pg/ohneEmpfang', () => ({
  vorgangOhneEmpfang: vi.fn(async (a: { art: string; daten: Record<string, unknown> }) => {
    if (vorschauScheitert && a.daten.vorschauVon) throw new Error('abgelehnt');
    vorgaenge.push(a);
    return 'confirmed';
  }),
}));

const { bildVorbereiten, jpegName, VORSCHAU_KANTE } = await import('@/features/nachrichten/bildVorbereiten');
const { nachrichtSenden, vorgemerkteNachrichten, NACHRICHT_TABELLE } = await import('@/lib/db/pg/nachrichten');

const foto = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });
/** Verkleinert „nach Kante“: je kleiner die Kante, desto kleiner die Datei. */
const verkleinern = vi.fn(async (datei: Blob, kante: number) => foto(Math.min(datei.size, kante * 100), 'image/jpeg'));

beforeEach(() => {
  vorgaenge.length = 0;
  vorschauScheitert = false;
  verkleinern.mockClear();
});

describe('Bild vorbereiten', () => {
  it('ein Foto wird verkleinert und bekommt ein Vorschaubild', async () => {
    const d = await bildVorbereiten({ id: 'a1', name: 'IMG_0042.jpg', inhalt: foto(4_000_000) }, verkleinern);
    expect(d.inhalt.size).toBe(160_000);
    expect(d.vorschau?.inhalt.size).toBe(VORSCHAU_KANTE * 100);
    expect(d.vorschau?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(d.vorbereitet).toBe(true);
  });

  it('HEIC und PNG heißen danach .jpg — sie sind es dann', async () => {
    expect((await bildVorbereiten({ id: 'a', name: 'IMG_1.HEIC', inhalt: foto(3_000_000, 'image/heic') }, verkleinern)).name).toBe('IMG_1.jpg');
    expect(jpegName('plan.png')).toBe('plan.jpg');
    expect(jpegName('foto.JPEG')).toBe('foto.JPEG');
    expect(jpegName('ohne')).toBe('ohne.jpg');
  });

  it('bleibt gleich: ein PDF geht, wie es ist', async () => {
    const pdf = { id: 'p', name: 'plan.pdf', inhalt: foto(2_000_000, 'application/pdf') };
    expect(await bildVorbereiten(pdf, verkleinern)).toBe(pdf);
    expect(verkleinern).not.toHaveBeenCalled();
  });

  it('ein zweiter Versuch verkleinert nicht noch einmal', async () => {
    const einmal = await bildVorbereiten({ id: 'a1', name: 'x.jpg', inhalt: foto(4_000_000) }, verkleinern);
    verkleinern.mockClear();
    expect(await bildVorbereiten(einmal, verkleinern)).toBe(einmal);
    expect(verkleinern).not.toHaveBeenCalled();
  });

  it('kann das Gerät das Bild nicht lesen, geht es unverändert und ohne Vorschau', async () => {
    const heic = { id: 'a', name: 'x.heic', inhalt: foto(3_000_000, 'image/heic') };
    const d = await bildVorbereiten(heic, async () => { throw new Error('nicht lesbar'); });
    expect(d.inhalt).toBe(heic.inhalt);
    expect(d.name).toBe('x.heic');
    expect(d.vorschau).toBeUndefined();
  });

  it('ein kleines Bild bekommt kein Vorschaubild, das nichts spart', async () => {
    const d = await bildVorbereiten({ id: 'a', name: 'k.png', inhalt: foto(20_000, 'image/png') }, async (b) => b);
    expect(d.inhalt.size).toBe(20_000);
    expect(d.vorschau).toBeUndefined();
  });
});

describe('Senden mit Vorschaubild', () => {
  const senden = (dateien: Parameters<typeof nachrichtSenden>[0]['dateien']) =>
    nachrichtSenden({ id: 'n1', kanal: 'k1', privat: true, companyId: 'b', text: '', dateien });

  it('das Vorschaubild geht hoch und wird beim Senden genannt', async () => {
    await senden([{ id: 'a1', name: 'f.jpg', inhalt: foto(100), vorschau: { id: 'v1', inhalt: foto(10) } }]);
    expect(vorgaenge.map((v) => [v.art, v.daten.pfad ?? v.daten.funktion])).toEqual([
      ['hochladen', 'nachrichten/b/k1/n1/a1'],
      ['hochladen', 'nachrichten/b/k1/n1/v1'],
      ['aufruf', 'nachricht_senden'],
    ]);
    expect(vorgaenge[1].daten.vorschauVon).toBe('a1');
    expect((vorgaenge[2].daten.parameter as { p_anhaenge: unknown }).p_anhaenge).toEqual([{ id: 'a1', name: 'f.jpg', vorschau: 'v1' }]);
  });

  it('scheitert das Vorschaubild, geht die Nachricht ohne', async () => {
    vorschauScheitert = true;
    await senden([{ id: 'a1', name: 'f.jpg', inhalt: foto(100), vorschau: { id: 'v1', inhalt: foto(10) } }]);
    expect((vorgaenge[vorgaenge.length - 1].daten.parameter as { p_anhaenge: unknown }).p_anhaenge).toEqual([{ id: 'a1', name: 'f.jpg' }]);
  });

  it('bleibt gleich: ohne Vorschau dieselben Parameter wie bisher', async () => {
    await senden([{ id: 'a1', name: 'plan.pdf', inhalt: foto(100, 'application/pdf') }]);
    expect(vorgaenge).toHaveLength(2);
    expect((vorgaenge[1].daten.parameter as { p_anhaenge: unknown }).p_anhaenge).toEqual([{ id: 'a1', name: 'plan.pdf' }]);
  });

  it('im Ausgangsfach ist das Vorschaubild kein eigener Anhang', () => {
    const v = (folge: number, x: Partial<Vormerkung>): Vormerkung => ({
      folge, zeile: 'n1', tabelle: NACHRICHT_TABELLE, art: 'aufruf', daten: {}, versuche: 0, angelegt: 1000 + folge, ...x,
    });
    const bild = new Uint8Array([1, 2, 3]).buffer;
    const liste = vorgemerkteNachrichten([
      v(1, { art: 'hochladen', daten: { pfad: 'nachrichten/b/k1/n1/a1', inhalt: bild, inhaltsart: 'image/jpeg', kanal: 'k1', name: 'f.jpg' } }),
      v(2, { art: 'hochladen', daten: { pfad: 'nachrichten/b/k1/n1/v1', inhalt: bild, inhaltsart: 'image/jpeg', kanal: 'k1', name: 'f.jpg', vorschauVon: 'a1' } }),
      v(3, { daten: { funktion: 'nachricht_senden', parameter: { p_kanal: 'k1', p_text: '' } } }),
    ], 'k1');
    expect(liste[0].dateien.map((d) => d.id)).toEqual(['a1']);
  });
});
