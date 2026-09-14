/**
 * Material, Anforderungen und Retouren auf Postgres.
 *
 * Der Schwerpunkt liegt auf dem Lagerabzug: er ist der einzige Vorgang in der
 * App, bei dem zwei gleichzeitige Klicks dauerhaft falsche Zahlen erzeugen
 * können.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as material from '@/lib/db/pg/materials';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

let verwaltung: Konto;
let monteur: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await betriebAnlegen('lager-a');
  verwaltung = await konto('lager-a', 'Verwaltung', 'verwaltung');
  monteur = await konto('lager-a', 'Mitarbeiter', 'monteur');
  clientEinreichen(verwaltung.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

async function bestand(id: string): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', id).single();
  return Number(data!.stock);
}

describe('Materialstamm', () => {
  it('legt an, ändert, löscht', async () => {
    const id = await material.createMaterial('lager-a', { name: 'Rohr 22mm', stock: 10 });
    await material.updateMaterial(id, { unit: 'm', category: 'Rohre' });
    const [m] = await material.listMaterials('lager-a');
    expect(m).toMatchObject({ name: 'Rohr 22mm', unit: 'm', category: 'Rohre' });

    await material.deleteMaterial(id);
    expect(await material.listMaterials('lager-a')).toEqual([]);
  });

  it('hält die Obergrenze des Katalogs ein', async () => {
    for (let i = 0; i < 5; i += 1) {
      await material.createMaterial('lager-a', { name: `Artikel ${i}`, stock: 1 });
    }
    expect(await material.listMaterials('lager-a', 3)).toHaveLength(3);
  });

  it('bucht ab und zurück', async () => {
    const id = await material.createMaterial('lager-a', { name: 'Fitting', stock: 20 });
    await material.adjustStock(id, -5);
    expect(await bestand(id)).toBe(15);
    await material.adjustStock(id, 3);
    expect(await bestand(id)).toBe(18);
  });

  it('geht nicht unter null', async () => {
    // Ein negativer Lagerstand ist keine Aussage über ein Lager, sondern ein
    // Zeichen, dass die Buchführung nicht mehr stimmt.
    const id = await material.createMaterial('lager-a', { name: 'Knapp', stock: 2 });
    await material.adjustStock(id, -10);
    expect(await bestand(id)).toBe(0);
  });

  it('stört sich nicht an Ad-hoc-Material ohne Katalogeintrag', async () => {
    await expect(material.adjustStock('', -5)).resolves.toBeUndefined();
  });
});

describe('Anforderungen', () => {
  /*
   * ANGEFORDERT WIRD ALS MONTEUR, abgeschlossen als Verwaltung.
   *
   * Die Richtlinie lässt nur eine Anforderung auf den EIGENEN Namen zu — wer
   * sie im Namen eines anderen anlegt, bekommt eine Abfuhr. Der erste Anlauf
   * dieses Tests hat sie als Verwaltung im Namen des Monteurs angelegt und ist
   * zu Recht gescheitert.
   */
  async function anforderung(name: string, menge: number, rest: Record<string, unknown> = {}) {
    clientEinreichen(monteur.client);
    try {
      return await anforderungen.createMaterialOrder('lager-a', {
        materialName: name, quantity: menge, status: 'Offen',
        transactionType: 'order', userId: monteur.uid, ...rest,
      } as Parameters<typeof anforderungen.createMaterialOrder>[1]);
    } finally {
      clientEinreichen(verwaltung.client);
    }
  }

  it('zieht beim Abschliessen vom Bestand ab', async () => {
    const artikel = await material.createMaterial('lager-a', { name: 'Dichtung 3/4', stock: 50 });
    const auftrag = await anforderung('Dichtung 3/4', 8, { materialId: artikel });

    await anforderungen.updateOrderStatus(auftrag, 'Erledigt');
    expect(await bestand(artikel)).toBe(42);
  });

  it('zieht bei einem zweiten Abschluss NICHT noch einmal ab', async () => {
    /*
     * Der Fall, wegen dem das eine Datenbankfunktion ist: zwei Klicks auf
     * „Erledigt" — oder ein Klick und ein nachgesendeter aus dem Funkloch.
     */
    const artikel = await material.createMaterial('lager-a', { name: 'Winkel 90', stock: 30 });
    const auftrag = await anforderung('Winkel 90', 5, { materialId: artikel });

    await anforderungen.updateOrderStatus(auftrag, 'Erledigt');
    await anforderungen.updateOrderStatus(auftrag, 'Erledigt');
    expect(await bestand(artikel)).toBe(25);
  });

  it('zieht auch gleichzeitig nur einmal ab', async () => {
    const artikel = await material.createMaterial('lager-a', { name: 'Muffe 28', stock: 40 });
    const auftrag = await anforderung('Muffe 28', 7, { materialId: artikel });

    await Promise.all([
      anforderungen.updateOrderStatus(auftrag, 'Erledigt'),
      anforderungen.updateOrderStatus(auftrag, 'Erledigt'),
      anforderungen.updateOrderStatus(auftrag, 'Erledigt'),
    ]);
    expect(await bestand(artikel)).toBe(33);
  });

  it('findet den Katalogeintrag über den Namen, wenn keine Kennung mitkam', async () => {
    const artikel = await material.createMaterial('lager-a', { name: 'Lötfitting 15', stock: 60 });
    const auftrag = await anforderung('  lötfitting 15 ', 4);

    await anforderungen.updateOrderStatus(auftrag, 'Erledigt');
    expect(await bestand(artikel)).toBe(56);

    // Und hält fest, welcher es war — damit keine spätere Auswertung die
    // Namenssuche wiederholen muss.
    const { data } = await admin.from('material_orders').select('material_id').eq('id', auftrag).single();
    expect(data!.material_id).toBe(artikel);
  });

  it('zieht bei zwei gleichnamigen Artikeln GAR NICHTS ab', async () => {
    // Nicht entscheidbar, welcher gemeint war — dann lieber nichts abziehen
    // als das Falsche.
    const a = await material.createMaterial('lager-a', { name: 'Zweideutig', stock: 10 });
    const b = await material.createMaterial('lager-a', { name: 'Zweideutig', stock: 10 });
    const auftrag = await anforderung('Zweideutig', 3);

    await anforderungen.updateOrderStatus(auftrag, 'Erledigt');
    expect(await bestand(a)).toBe(10);
    expect(await bestand(b)).toBe(10);
  });

  it('zieht bei einem Zwischenschritt nichts ab', async () => {
    const artikel = await material.createMaterial('lager-a', { name: 'Unterwegs', stock: 12 });
    const auftrag = await anforderung('Unterwegs', 2, { materialId: artikel });
    await anforderungen.updateOrderStatus(auftrag, 'Abholbereit');
    expect(await bestand(artikel)).toBe(12);
  });

  it('listet offene Anforderungen — eigene und alle', async () => {
    const offen = await anforderungen.listOpenOrders('lager-a');
    expect(offen.every((o) => o.status !== 'Erledigt')).toBe(true);

    clientEinreichen(monteur.client);
    try {
      const eigene = await anforderungen.listOwnOpenOrders('lager-a', monteur.uid);
      expect(eigene.every((o) => o.userId === monteur.uid)).toBe(true);
    } finally {
      clientEinreichen(verwaltung.client);
    }
  });

  it('meldet eine neue Anforderung live, neueste zuerst', async () => {
    const stände: Array<Array<{ materialName: string }>> = [];
    const ab = anforderungen.subscribeAllOrders('lager-a', 3,
      (z) => stände.push(z), (e) => { throw e; });
    for (let i = 0; i < 80 && stände.length === 0; i += 1) await warte(50);

    await anforderung('Ganz frisch', 1);
    for (let i = 0; i < 100; i += 1) {
      if ((stände[stände.length - 1] ?? []).some((o) => o.materialName === 'Ganz frisch')) break;
      await warte(50);
    }
    expect(stände[stände.length - 1][0].materialName).toBe('Ganz frisch');
    ab();
  });
});

describe('Retoure', () => {
  it('schreibt Beleg und Gutschrift in EINEM Schritt', async () => {
    const artikel = await material.createMaterial('lager-a', { name: 'Rückläufer', stock: 5 });
    clientEinreichen(monteur.client);
    const id = await anforderungen.createReturn('lager-a', {
      materialId: artikel, materialName: 'Rückläufer', quantity: 3,
      userId: monteur.uid, condition: 'neu',
    } as Parameters<typeof anforderungen.createReturn>[1]);
    clientEinreichen(verwaltung.client);

    expect(await bestand(artikel)).toBe(8);
    const { data } = await admin.from('material_orders').select('*').eq('id', id).single();
    expect(data).toMatchObject({
      status: 'Erledigt', transaction_type: 'return', processed: true, condition: 'neu',
    });
  });

  it('bucht beschädigte Ware NICHT zurück', async () => {
    // Was beschädigt zurückkommt, geht nicht wieder ins Regal.
    const artikel = await material.createMaterial('lager-a', { name: 'Kaputt', stock: 5 });
    clientEinreichen(monteur.client);
    await anforderungen.createReturn('lager-a', {
      materialId: artikel, materialName: 'Kaputt', quantity: 2,
      userId: monteur.uid, condition: 'beschädigt',
    } as Parameters<typeof anforderungen.createReturn>[1]);
    clientEinreichen(verwaltung.client);

    expect(await bestand(artikel)).toBe(5);
  });

  it('findet den Katalogeintrag auch hier über den Namen', async () => {
    const artikel = await material.createMaterial('lager-a', { name: 'Namensretoure', stock: 1 });
    clientEinreichen(monteur.client);
    await anforderungen.createReturn('lager-a', {
      materialName: 'namensretoure', quantity: 4,
      userId: monteur.uid, condition: 'neu',
    } as Parameters<typeof anforderungen.createReturn>[1]);
    clientEinreichen(verwaltung.client);

    expect(await bestand(artikel)).toBe(5);
  });
});
