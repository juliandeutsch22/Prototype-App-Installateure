import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Der Speicher und die Zeile, ersetzt — geprüft wird die REIHENFOLGE und das
  Aufräumen, nicht der Zeilenschutz (der steht in
  `tests/supabase/baustellenDokumente.test.ts`).
*/
const hochgeladen: string[] = [];
const entfernt: string[][] = [];
let zeileScheitert = false;
let entfernenScheitert = false;
const geloeschteZeilen: string[] = [];

vi.mock('@/lib/db/pg/kern', () => ({
  derClient: () => ({
    storage: {
      from: () => ({
        upload: async (pfad: string) => {
          hochgeladen.push(pfad);
          return { error: null };
        },
        remove: async (pfade: string[]) => {
          entfernt.push(pfade);
          return { error: entfernenScheitert ? { message: 'weg' } : null };
        },
      }),
    },
  }),
  anlegen: async () => {
    if (zeileScheitert) throw new Error('Zeile abgewiesen');
    return 'neue-id';
  },
  loeschen: async (_t: string, id: string) => {
    geloeschteZeilen.push(id);
  },
  abfragen: async () => [],
}));

const { dokumentHochladen, dokumentLoeschen, dateiTyp } = await import('@/lib/db/pg/baustellenDokumente');

const datei = (name: string, type = 'application/pdf') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

beforeEach(() => {
  hochgeladen.length = 0;
  entfernt.length = 0;
  geloeschteZeilen.length = 0;
  zeileScheitert = false;
  entfernenScheitert = false;
});

describe('Hochladen', () => {
  it('räumt die Datei wieder weg, wenn die Zeile scheitert', async () => {
    /*
      Die Datei geht zuerst hoch. Ohne dieses Aufräumen läge danach ein
      Grundriss im Speicher, auf den keine Zeile zeigt — Speicher, der kostet,
      und ein Bild aus einer fremden Wohnung, das niemand mehr findet.
    */
    zeileScheitert = true;
    await expect(dokumentHochladen('perl', 'p1', datei('Plan.pdf'), 'Chefin')).rejects.toThrow(
      'Zeile abgewiesen',
    );
    expect(hochgeladen).toHaveLength(1);
    expect(entfernt).toEqual([[hochgeladen[0]]]);
  });

  it('prüft die Datei, bevor irgendetwas hochgeht', async () => {
    await expect(dokumentHochladen('perl', 'p1', datei('plan.dwg', ''), 'Chefin')).rejects.toThrow(
      /nur PDF und Bilder/,
    );
    expect(hochgeladen).toEqual([]);
  });

  it('gibt jeder Datei eine eigene Kennung — zwei gleichnamige überschreiben einander nicht', async () => {
    await dokumentHochladen('perl', 'p1', datei('Grundriss.pdf'), 'Chefin');
    await dokumentHochladen('perl', 'p1', datei('Grundriss.pdf'), 'Chefin');
    expect(new Set(hochgeladen).size).toBe(2);
    for (const p of hochgeladen) expect(p).toMatch(/^baustellen\/perl\/p1\/[0-9a-f-]{36}\.pdf$/);
  });
});

describe('Löschen', () => {
  it('nimmt erst die Zeile, dann die Datei', async () => {
    expect(await dokumentLoeschen({ id: 'd1', pfad: 'baustellen/perl/p1/x.pdf' })).toEqual({
      dateiBlieb: false,
    });
    expect(geloeschteZeilen).toEqual(['d1']);
    expect(entfernt).toEqual([['baustellen/perl/p1/x.pdf']]);
  });

  it('sagt es, wenn die Datei liegen blieb — statt es zu verschweigen', async () => {
    entfernenScheitert = true;
    expect(await dokumentLoeschen({ id: 'd1', pfad: 'baustellen/perl/p1/x.pdf' })).toEqual({
      dateiBlieb: true,
    });
  });
});

describe('Der Dateityp', () => {
  it('kommt aus der Endung, wenn das Gerät keinen meldet', () => {
    expect(dateiTyp({ name: 'Plan.PDF', type: '' })).toBe('application/pdf');
    expect(dateiTyp({ name: 'IMG_0001.HEIC', type: '' })).toBe('image/heic');
    expect(dateiTyp({ name: 'plan.dwg', type: 'application/acad' })).toBeNull();
  });
});
