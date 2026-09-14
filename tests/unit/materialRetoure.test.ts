import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Eine Retoure ist ein Beleg UND eine Gutschrift — und beides muss zusammen
 * gelingen oder zusammen scheitern.
 *
 * Vorher lief es in zwei Schritten: erst der Beleg, danach die Gutschrift.
 * Scheiterte der zweite — kein Empfang im Keller, eine Regel, die nicht
 * greift —, stand der Beleg bereits in der Datenbank, mit `processed: true`,
 * und der Bestand war trotzdem nicht erhöht. Die Ansicht meldete dann „Die
 * Retoure konnte nicht erfasst werden", und das war falsch: erfasst war sie.
 * Wer es noch einmal versuchte, legte einen ZWEITEN Beleg an.
 *
 * Geprüft ist hier die Entscheidung, nicht das Schreiben: die Firestore-
 * Schicht ist ersetzt. Was sie festhält, ist die ZAHL der Schreibvorgänge
 * und ihre Gruppierung — genau daran hing der Fehler.
 */

interface Schreibvorgang {
  art: 'set' | 'update';
  ziel: string;
  daten: Record<string, unknown>;
}

let transaktionen: Schreibvorgang[][] = [];
let materialVorhanden = true;
let transaktionScheitert = false;
const queryTenant = vi.fn();
/**
 * Der Weg AN der Transaktion VORBEI. Die alte Fassung legte den Beleg über
 * `createInTenant` an, also mit einem eigenen Schreibvorgang ausserhalb jeder
 * Transaktion — genau der, der bei einem Fehlschlag zurueckblieb. Wird er
 * hier nicht mitgezaehlt, sieht ein Test „kein Schreibvorgang" auch dann,
 * wenn der Beleg laengst geschrieben ist.
 */
const createInTenant = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/lib/db/fs/core', () => ({
  queryTenant: (...a: unknown[]) => queryTenant(...a),
  subscribeTenant: vi.fn(),
  createInTenant: (...a: unknown[]) => createInTenant(...a),
  updateInTenant: vi.fn(),
  deleteInTenant: vi.fn(),
  stripUndefined: (d: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
}));

vi.mock('firebase/firestore', () => ({
  where: (...a: unknown[]) => ({ where: a }),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'ZEITSTEMPEL',
  increment: (n: number) => ({ increment: n }),
  collection: (_db: unknown, name: string) => ({ pfad: name }),
  doc: (...a: unknown[]) => {
    // doc(collection) → neue Kennung; doc(db, sammlung, id) → bestehendes Dokument.
    if (a.length === 1) return { id: 'neuer-beleg', pfad: 'materialOrders/neuer-beleg' };
    return { id: a[2] as string, pfad: `${a[1] as string}/${a[2] as string}` };
  },
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: { pfad: string }) => Promise<{ exists: () => boolean; data: () => unknown }>;
      set: (ref: { pfad: string }, d: Record<string, unknown>) => void;
      update: (ref: { pfad: string }, d: Record<string, unknown>) => void;
    }) => Promise<void>,
  ) => {
    const vorgaenge: Schreibvorgang[] = [];
    transaktionen.push(vorgaenge);
    if (transaktionScheitert) throw new Error('Transaktion abgebrochen');
    await fn({
      get: async () => ({ exists: () => materialVorhanden, data: () => ({ stock: 5 }) }),
      set: (ref, d) => vorgaenge.push({ art: 'set', ziel: ref.pfad, daten: d }),
      update: (ref, d) => vorgaenge.push({ art: 'update', ziel: ref.pfad, daten: d }),
    });
  },
}));

const { createReturn } = await import('@/lib/db/materialOrders');

const RETOURE = {
  materialId: 'm1',
  materialName: 'Kupferrohr 15mm',
  quantity: 3,
  userId: 'u1',
  userName: 'Max Mustermann',
  note: '',
  projectNumber: '',
};

beforeEach(() => {
  transaktionen = [];
  materialVorhanden = true;
  transaktionScheitert = false;
  queryTenant.mockReset().mockResolvedValue([]);
  createInTenant.mockReset().mockResolvedValue('beleg-daneben');
});

describe('Retoure — Beleg und Gutschrift', () => {
  it('schreibt beides in EINER Transaktion', async () => {
    await createReturn('perl', { ...RETOURE, condition: 'neu' });

    expect(transaktionen).toHaveLength(1);
    const [vorgaenge] = transaktionen;
    expect(vorgaenge.map((v) => `${v.art} ${v.ziel}`)).toEqual([
      'set materialOrders/neuer-beleg',
      'update materials/m1',
    ]);
  });

  it('schreibt den Beleg NICHT, wenn die Transaktion scheitert', async () => {
    /**
     * DER FALL, DER DOPPELTE BELEGE ERZEUGT HAT. Bleibt bei einem Fehlschlag
     * ein Beleg zurück, ist die Fehlermeldung eine Lüge und der zweite
     * Versuch legt einen weiteren an.
     */
    transaktionScheitert = true;
    await expect(createReturn('perl', { ...RETOURE, condition: 'neu' })).rejects.toThrow();

    expect(transaktionen.flat()).toHaveLength(0);
    // Und kein Beleg an der Transaktion vorbei — sonst bliebe genau der
    // zurueck, der die falsche Meldung und den zweiten Versuch ausloest.
    expect(createInTenant).not.toHaveBeenCalled();
  });

  it('bucht bei „gebraucht" nur den Beleg, ohne Gutschrift', async () => {
    // Gebrauchtes Material geht nicht ins Regal zurück. Es wird erfasst,
    // damit die Rückgabe nachvollziehbar bleibt — mehr nicht.
    await createReturn('perl', { ...RETOURE, condition: 'gebraucht' });

    const [vorgaenge] = transaktionen;
    expect(vorgaenge).toHaveLength(1);
    expect(vorgaenge[0]).toMatchObject({ art: 'set', ziel: 'materialOrders/neuer-beleg' });
  });

  it('bucht bei „defekt" ebenfalls nur den Beleg', async () => {
    await createReturn('perl', { ...RETOURE, condition: 'defekt' });
    expect(transaktionen[0]).toHaveLength(1);
  });

  it('schreibt den Beleg auch dann, wenn der Katalogeintrag fehlt', async () => {
    // Der Katalogeintrag ist gelöscht, die Rückgabe hat trotzdem
    // stattgefunden. Sie zu verwerfen hieße, ein Stück Wirklichkeit nicht
    // aufzuschreiben.
    materialVorhanden = false;
    await createReturn('perl', { ...RETOURE, condition: 'neu' });

    const [vorgaenge] = transaktionen;
    expect(vorgaenge).toHaveLength(1);
    expect(vorgaenge[0].art).toBe('set');
  });

  it('schreibt die Gutschrift als increment, nicht als errechneten Wert', async () => {
    // Zwei Retouren zur selben Zeit — mit einem errechneten Wert überschriebe
    // die zweite die erste, und ein Stück wäre nicht im Bestand.
    await createReturn('perl', { ...RETOURE, condition: 'neu', quantity: 3 });
    expect(transaktionen[0][1].daten).toEqual({ stock: { increment: 3 } });
  });

  it('setzt companyId, Art und Status selbst — nicht aus der Eingabe', async () => {
    await createReturn('perl', { ...RETOURE, condition: 'neu' });
    expect(transaktionen[0][0].daten).toMatchObject({
      companyId: 'perl',
      transactionType: 'return',
      status: 'Erledigt',
      processed: true,
      quantity: 3,
    });
  });
});

describe('Retoure — Anforderung ohne Verweis auf den Katalog', () => {
  it('findet den Katalogeintrag über den Namen', async () => {
    /**
     * Der Altbestand kennt Positionen ohne `materialId`, und eine per Sprache
     * erfasste Zeile kann sie verlieren. Ohne diesen Weg wäre die Retoure
     * Material, das im Regal steht und in den Büchern fehlt.
     */
    queryTenant.mockResolvedValue([{ id: 'm-gefunden', name: 'Kupferrohr 15mm' }]);
    await createReturn('perl', { ...RETOURE, materialId: '', condition: 'neu' });

    const [vorgaenge] = transaktionen;
    expect(vorgaenge[1].ziel).toBe('materials/m-gefunden');
    // Und der gefundene Eintrag wird am Beleg vermerkt, damit ihn keine
    // spätere Auswertung noch einmal suchen muss.
    expect(vorgaenge[0].daten.materialId).toBe('m-gefunden');
  });

  it('bucht NICHTS zurück, wenn zwei Einträge denselben Namen tragen', async () => {
    // Welcher gemeint war, ist nicht entscheidbar. Dann lieber gar nichts
    // gutschreiben als das Falsche.
    queryTenant.mockResolvedValue([
      { id: 'm1', name: 'Kupferrohr 15mm' },
      { id: 'm2', name: 'Kupferrohr 15mm' },
    ]);
    await createReturn('perl', { ...RETOURE, materialId: '', condition: 'neu' });

    expect(transaktionen[0]).toHaveLength(1);
  });
});
