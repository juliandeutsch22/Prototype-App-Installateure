/**
 * Suche über alle Angebote und Anforderungen (12.10.2026, Plan 17 I) —
 * gegen die echte Datenbank.
 *
 * Die Listen laden die jüngsten; ein älteres Angebot oder eine Anforderung
 * im Archiv fand die Suche im Geladenen nicht. Jetzt sucht der Server über
 * alle — mit denselben Feldern, im eigenen Betrieb, und ein Komma oder ein
 * Prozentzeichen im Begriff bricht nichts.
 *
 * Gegenprobe: ohne `sucheAngebote` und `sucheAnforderungen` gibt es nichts
 * zu rufen (rot).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as angebote from '@/lib/db/quotes';
import * as anforderungen from '@/lib/db/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'suche-server';
const FREMD = 'suche-server-b';

let chef: Konto;
let fremd: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'sschef');
  fremd = await konto(FREMD, 'Geschäftsführung', 'ssfremd');
  clientEinreichen(chef.client);
  // Ein altes Angebot, dann so viele neue, dass es aus der Liste fällt.
  await angebote.createQuote(BETRIEB, {
    quoteNumber: 'AN-2024-0007', customerName: 'Huber, Franz', address: 'Lindengasse 3, 1070 Wien',
    quoteDate: '2024-03-01', validUntil: '2024-04-01', status: 'Entwurf', vatRate: 0.2,
    positions: [{ label: 'Therme tauschen', qty: 1, unit: 'Stk', unitPrice: 2400, netto: 2400 }],
  } as Parameters<typeof angebote.createQuote>[1]);
  for (let i = 0; i < 3; i += 1) {
    await angebote.createQuote(BETRIEB, {
      quoteNumber: `AN-2026-01${i}`, customerName: 'Familie Neu', quoteDate: '2026-10-01', validUntil: '2026-11-01',
      status: 'Entwurf', vatRate: 0.2, positions: [{ label: 'Arbeitszeit', qty: 1, unit: 'h', unitPrice: 80, netto: 80 }],
    } as Parameters<typeof angebote.createQuote>[1]);
  }
  const { error } = await admin.from('material_orders').insert([
    { id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Kupferrohr 15mm', quantity: 2, project_number: 'B-2024-0003',
      status: 'Erledigt', transaction_type: 'order', user_id: chef.uid, user_name: 'Chef', note: 'Rabatt 50% vereinbart',
      created_at: '2024-02-01T08:00:00Z' },
    { id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Pressfitting 22', quantity: 4, project_number: 'B-2026-0001',
      status: 'Offen', transaction_type: 'order', user_id: chef.uid, user_name: 'Chef', note: null,
      created_at: '2026-10-01T08:00:00Z' },
    { id: crypto.randomUUID(), company_id: FREMD, material_name: 'Kupferrohr 15mm', quantity: 1, status: 'Offen',
      transaction_type: 'order', user_id: fremd.uid, user_name: 'Fremd', project_number: null, note: null,
      created_at: '2026-10-01T08:00:00Z' },
  ]);
  if (error) throw new Error(error.message);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Angebote suchen — über alle', () => {
  it('findet das alte Angebot, das die Liste nicht mehr lädt — samt Positionen', async () => {
    clientEinreichen(chef.client);
    const liste = await angebote.listRecentQuotes(BETRIEB, 3);
    expect(liste.map((q) => q.quoteNumber)).not.toContain('AN-2024-0007');
    const treffer = await angebote.sucheAngebote(BETRIEB, 'Lindengasse');
    expect(treffer.map((q) => q.quoteNumber)).toEqual(['AN-2024-0007']);
    expect(treffer[0].positions).toHaveLength(1);
  });

  it('über Nummer, Kunde und Baustelle — ein Komma im Namen bricht nichts', async () => {
    clientEinreichen(chef.client);
    expect((await angebote.sucheAngebote(BETRIEB, '2024-0007')).length).toBe(1);
    expect((await angebote.sucheAngebote(BETRIEB, 'Huber, Fr')).length).toBe(1);
  });

  it('nicht im fremden Betrieb, und ohne Begriff nichts', async () => {
    clientEinreichen(fremd.client);
    expect(await angebote.sucheAngebote(BETRIEB, 'Huber')).toEqual([]);
    clientEinreichen(chef.client);
    expect(await angebote.sucheAngebote(BETRIEB, '   ')).toEqual([]);
  });
});

describe('Anforderungen suchen — über alle', () => {
  it('findet die erledigte aus dem Archiv, auch jenseits der geladenen', async () => {
    clientEinreichen(chef.client);
    const treffer = await anforderungen.sucheAnforderungen(BETRIEB, 'B-2024');
    expect(treffer.map((o) => o.materialName)).toEqual(['Kupferrohr 15mm']);
    expect(treffer[0].status).toBe('Erledigt');
  });

  it('ein Prozentzeichen ist ein Prozentzeichen, kein Joker — und der fremde Betrieb bleibt draussen', async () => {
    clientEinreichen(chef.client);
    expect((await anforderungen.sucheAnforderungen(BETRIEB, '50%')).length).toBe(1);
    expect(await anforderungen.sucheAnforderungen(BETRIEB, '5%0')).toEqual([]);
    expect((await anforderungen.sucheAnforderungen(BETRIEB, 'Kupferrohr')).length).toBe(1);
  });
});
