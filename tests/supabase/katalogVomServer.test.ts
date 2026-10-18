/**
 * Lager und Material anfordern holen den Katalog vom Server (Mengengerüst,
 * 18.10.2026) — in der Datenbank geprüft.
 *
 * Vorher holten beide Seiten bis zu tausend Artikel des ganzen Katalogs und
 * filterten oder suchten im Browser. Nach einem DATANORM-Import fehlten dem
 * Lager dadurch die Lagerartikel hinter den ersten tausend Zeilen, und der
 * Monteur fand beim Anfordern nur, was zufällig darunter lag.
 *
 * Gegenprobe gegen den alten Weg: `listMaterials` (die Grenze von tausend)
 * holt nur tausend der 1.202 Artikel — welche, entscheidet die Reihenfolge
 * der Kennungen, also der Zufall. Ein Lagerartikel oder ein gesuchter
 * Artikel konnte darunter sein oder nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import {
  katalogAnzahl,
  katalogBeobachten,
  katalogSeite,
  listMaterials,
  subscribeLagerartikel,
} from '@/lib/db/pg/materials';
import type { Material } from '@/types';

const BETRIEB = 'katalog-server';
const IMPORT = 1200;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mont-ks');
  // Ein eingespielter Katalog: zwölfhundert Artikel, keiner im Lager — dahinter zwei Lagerartikel.
  const zeilen = Array.from({ length: IMPORT }, (_, i) => ({
    company_id: BETRIEB,
    name: `Artikel ${String(i).padStart(4, '0')}`,
    article_number: `IMP-${i}`,
    category: 'Import',
  }));
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await admin.from('materials').insert(zeilen.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  const { error } = await admin.from('materials').insert([
    { company_id: BETRIEB, name: 'Zylinder Kupferrohr 15', article_number: 'KR15', category: 'Rohre', stock: 40, lagerartikel: true },
    { company_id: BETRIEB, name: 'Zylinder Pressfitting 22, verzinkt', article_number: 'PF22', category: 'Fittings', stock: 0, lagerartikel: true },
  ]);
  if (error) throw new Error(error.message);
  clientEinreichen(monteur.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Lager: nur die Lagerartikel', () => {
  it('liefert beide Lagerartikel, auch hinter zwölfhundert Katalogzeilen', async () => {
    const zeilen = await new Promise<WithId<Material>[]>((fertig, fehler) => {
      const stopp = subscribeLagerartikel(BETRIEB, (z) => { stopp(); fertig(z); }, fehler);
    });
    expect(zeilen.map((m) => m.name).sort()).toEqual(['Zylinder Kupferrohr 15', 'Zylinder Pressfitting 22, verzinkt']);
  });

  it('Gegenprobe: der alte Weg (Katalog bis zur Grenze) ist abgeschnitten — welche fehlen, ist Zufall', async () => {
    const alt = await listMaterials(BETRIEB);
    expect(alt).toHaveLength(1000);
    expect(await katalogAnzahl(BETRIEB)).toBe(alt.length + 202);
  });

  it('zählt den ganzen Katalog, ohne ihn zu holen', async () => {
    expect(await katalogAnzahl(BETRIEB)).toBe(IMPORT + 2);
  });
});

describe('Material anfordern: der Katalog seitenweise', () => {
  it('die ersten zwanzig nach Namen, mit der Zahl aller Artikel', async () => {
    const { zeilen, gesamt } = await katalogSeite(BETRIEB, '', 20);
    expect(zeilen).toHaveLength(20);
    expect(zeilen[0].name).toBe('Artikel 0000');
    expect(zeilen[19].name).toBe('Artikel 0019');
    expect(gesamt).toBe(IMPORT + 2);
  });

  it('eine längere Seite beginnt wieder vorn — ohne Lücke und ohne Doppel', async () => {
    const kurz = await katalogSeite(BETRIEB, '', 20);
    const lang = await katalogSeite(BETRIEB, '', 40);
    expect(lang.zeilen.slice(0, 20).map((m) => m.id)).toEqual(kurz.zeilen.map((m) => m.id));
    expect(new Set(lang.zeilen.map((m) => m.id)).size).toBe(40);
  });

  it('sucht im ganzen Katalog — Bezeichnung, Artikelnummer, Kategorie', async () => {
    expect((await katalogSeite(BETRIEB, 'pressfitting', 20)).zeilen.map((m) => m.name)).toEqual(['Zylinder Pressfitting 22, verzinkt']);
    expect((await katalogSeite(BETRIEB, 'KR15', 20)).zeilen.map((m) => m.name)).toEqual(['Zylinder Kupferrohr 15']);
    const fittings = await katalogSeite(BETRIEB, 'Fittings', 20);
    expect(fittings.gesamt).toBe(1);
  });

  it('ein Komma oder Joker im Begriff ist Text, kein Teil der Abfrage', async () => {
    expect((await katalogSeite(BETRIEB, '22, verzinkt', 20)).zeilen.map((m) => m.name)).toEqual(['Zylinder Pressfitting 22, verzinkt']);
    expect((await katalogSeite(BETRIEB, '%', 20)).gesamt).toBe(0);
  });


  it('meldet eine Änderung im Katalog — die Seite holt dann neu', async () => {
    let meldungen = 0;
    const stopp = katalogBeobachten(BETRIEB, () => { meldungen += 1; });
    try {
      // Erst die Meldung „Kanal steht“, dann die Änderung.
      await expect.poll(() => meldungen, { timeout: 15_000 }).toBeGreaterThan(0);
      const vorher = meldungen;
      const { error } = await admin.from('materials').insert({ company_id: BETRIEB, name: 'Eckventil neu' });
      expect(error).toBeNull();
      await expect.poll(() => meldungen, { timeout: 15_000 }).toBeGreaterThan(vorher);
    } finally {
      stopp();
    }
  }, 40_000);
});
