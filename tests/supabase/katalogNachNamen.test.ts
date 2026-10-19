/**
 * Preise auf Rechnung und Nachkalkulation: die Katalogartikel zu den Namen
 * auf den Scheinen (19.10.2026) — in der Datenbank geprüft.
 *
 * Vorher holten beide Ansichten den Katalog bis zur Grenze von tausend
 * Artikeln und schlugen darin nach. Nach einem DATANORM-Import fand ein
 * Artikel dahinter seinen Preis nicht. Jetzt fragt die Ansicht genau nach den
 * Namen, über den ganzen Katalog; das Muster darf dabei weiter sein als der
 * genaue Vergleich in der Ansicht, aber nichts auslassen, was dort passt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { katalogNachIds, katalogNachNamen, listMaterials } from '@/lib/db/pg/materials';

const BETRIEB = 'katalog-namen';
const IMPORT = 1200;
let monteur: Konto;
const besondere = [
  'Pressfitting 22, verzinkt',
  'Dichtung 50% Rabatt',
  'Muffe_DN20',
  'Kugelhahn  1/2 Zoll',
  'Eckventil (Messing)',
  'Überwurfmutter 3/4',
];

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mont-kn');
  const zeilen = Array.from({ length: IMPORT }, (_, i) => ({
    company_id: BETRIEB,
    name: `Artikel ${String(i).padStart(4, '0')}`,
    article_number: `IMP-${i}`,
    verkaufspreis: i + 1,
  }));
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await admin.from('materials').insert(zeilen.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  const { error } = await admin.from('materials').insert(besondere.map((name) => ({ company_id: BETRIEB, name, verkaufspreis: 9 })));
  if (error) throw new Error(error.message);
  clientEinreichen(monteur.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Katalogartikel nach Namen', () => {
  it('findet jeden genannten Artikel, auch hinter den ersten tausend Zeilen', async () => {
    const namen = ['Artikel 0003', 'Artikel 1150', 'Artikel 1199'];
    const treffer = await katalogNachNamen(BETRIEB, namen);
    expect(treffer.map((m) => m.name).sort()).toEqual(namen);
    expect(treffer.find((m) => m.name === 'Artikel 1150')?.verkaufspreis).toBe(1151);
  });

  it('Gegenprobe: der alte Weg holt nur tausend der Artikel — welche, ist Zufall', async () => {
    expect(await listMaterials(BETRIEB)).toHaveLength(1000);
  });

  it('verträgt Komma, Prozent, Unterstrich und Klammern im Namen — ohne sie als Joker zu lesen', async () => {
    const treffer = await katalogNachNamen(BETRIEB, besondere.filter((n) => !n.includes('  ')));
    expect(treffer.map((m) => m.name).sort()).toEqual(besondere.filter((n) => !n.includes('  ')).sort());
    // „Muffe_DN20“ ist kein Muster für „MuffeXDN20“, „50%“ keines für „50 Stück“.
    expect(await katalogNachNamen(BETRIEB, ['Muffe_DN2'])).toEqual([]);
  });

  it('ohne Rücksicht auf Gross- und Kleinschreibung und doppelte Leerzeichen — wie der Vergleich in der Ansicht', async () => {
    const treffer = await katalogNachNamen(BETRIEB, ['  kugelhahn 1/2 zoll ', 'ARTIKEL 0007', 'ÜBERWURFMUTTER 3/4']);
    expect(treffer.map((m) => m.name).sort()).toEqual(['Artikel 0007', 'Kugelhahn  1/2 Zoll', 'Überwurfmutter 3/4']);
  });

  it('fragt in Stücken: auch sechzig Namen auf einmal', async () => {
    const namen = Array.from({ length: 60 }, (_, i) => `Artikel ${String(i * 20).padStart(4, '0')}`);
    const treffer = await katalogNachNamen(BETRIEB, namen);
    expect(treffer).toHaveLength(60);
  });

  it('ohne Namen keine Abfrage und kein ganzer Katalog', async () => {
    expect(await katalogNachNamen(BETRIEB, ['', '   '])).toEqual([]);
  });

  it('nach Kennungen: genau die genannten Artikel', async () => {
    const [eins] = await katalogNachNamen(BETRIEB, ['Artikel 1100']);
    expect((await katalogNachIds(BETRIEB, [eins.id, eins.id, ''])).map((m) => m.name)).toEqual(['Artikel 1100']);
    expect(await katalogNachIds(BETRIEB, [])).toEqual([]);
  });
});
