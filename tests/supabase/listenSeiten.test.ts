import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen, type SeitenZeiger } from '@/lib/db/pg/kern';
import { listQuotesPage } from '@/lib/db/pg/quotes';
import { listOrdersPage, listPurchasingOrders } from '@/lib/db/pg/materialOrders';
import { anforderungsFilterAmServer } from '@/features/orders/anforderungStand';

const betrieb = 'seitenliste';
const selten = 'Huber, 50%_(Nord)';
let chef: Konto;
const anzahl = 251;
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  await betriebAnlegen(`${betrieb}-fremd`);
  chef = await konto(betrieb, 'Geschäftsführung', 'seitenchef');
  for (const [tabelle, zeilen] of [
    ['quotes', Array.from({ length: anzahl }, (_, i) => ({ company_id: betrieb,
      quote_number: `AN-2026-${i}`, customer_name: i === 250 ? selten : 'Archivkunde',
      address: 'Ring 1', quote_date: '2026-01-01', valid_until: '2026-02-01', status: 'Versendet',
      vat_rate: 0.2, created_at: '2026-01-01T08:00:00.000001Z' }))],
    ['material_orders', Array.from({ length: anzahl }, (_, i) => ({ id: crypto.randomUUID(),
      company_id: betrieb, user_id: chef.uid, user_name: 'Archivchef', material_name: i === 250 ? selten : 'Archivartikel',
      quantity: 1, status: 'Offen', transaction_type: 'order', is_urgent: i === 250,
      beschaffung: 'einkauf', created_at: '2026-01-01T08:00:00.000001Z' }))],
  ] as const) {
    const r = await admin.from(tabelle).insert(zeilen as Record<string, unknown>[]);
    if (r.error) throw r.error;
  }
  clientEinreichen(chef.client);
});
afterAll(() => clientEinreichen(null));

describe('Serversuche und 50er-Seiten', () => {
  it('findet alte Angebote hinter der Arbeitslistengrenze samt Satzzeichen', async () => {
    const s = await listQuotesPage(betrieb, selten, 'alle');
    expect(s.zeilen.map((q) => q.customerName)).toEqual([selten]);
    expect(s.naechste).toBeNull();
  });
  it('findet alte Anforderungen hinter Zeile 200 samt Satzzeichen', async () => {
    const s = await listOrdersPage(betrieb, selten, 'aktiv');
    expect(s.zeilen.map((o) => o.materialName)).toEqual([selten]);
    expect(s.naechste).toBeNull();
  });
  it('blättert bei identischem Mikrosekunden-Zeitstempel ohne Doppler oder Lücke', async () => {
    const ids: string[] = [];
    let vor: SeitenZeiger | null = null;
    do {
      const s = await listQuotesPage(betrieb, '', 'alle', vor);
      expect(s.zeilen.length).toBeLessThanOrEqual(50);
      ids.push(...s.zeilen.map((q) => q.id));
      vor = s.naechste;
    } while (vor);
    expect(ids).toHaveLength(anzahl);
    expect(new Set(ids).size).toBe(anzahl);
  });
  it('sucht auch beim Weiterblättern im ganzen Bestand', async () => {
    const a = await listQuotesPage(betrieb, 'Archiv', 'alle');
    const b = await listQuotesPage(betrieb, 'Archiv', 'alle', a.naechste);
    expect([a.zeilen.length, b.zeilen.length]).toEqual([50, 50]);
    expect(new Set([...a.zeilen, ...b.zeilen].map((q) => q.id)).size).toBe(100);
    expect(b.zeilen.every((q) => q.customerName === 'Archivkunde')).toBe(true);
  });
  it('neue Zeilen vor dem Zeiger verschieben die nächsten Seiten nicht', async () => {
    const a = await listOrdersPage(betrieb, '', 'aktiv');
    const neu = crypto.randomUUID();
    expect((await admin.from('material_orders').insert({ id: neu, company_id: betrieb,
      user_id: chef.uid, user_name: 'Archivchef', material_name: 'Neu', quantity: 1,
      status: 'Offen', transaction_type: 'order', created_at: '2026-10-08T09:00:00Z' })).error).toBeNull();
    const ids = a.zeilen.map((o) => o.id);
    let vor = a.naechste;
    while (vor) {
      const s = await listOrdersPage(betrieb, '', 'aktiv', vor);
      ids.push(...s.zeilen.map((o) => o.id)); vor = s.naechste;
    }
    expect(ids).toHaveLength(anzahl);
    expect(new Set(ids).size).toBe(anzahl);
    expect(ids).not.toContain(neu);
    expect((await listOrdersPage(betrieb, '', 'aktiv')).zeilen.filter((o) => !o.isUrgent)[0].id).toBe(neu);
  });
  it('wendet Startseitenfilter vor der Seitengrenze an und hält Einkaufssummen vollständig', async () => {
    const s = await listOrdersPage(betrieb, '', 'aktiv', null, {
      filter: anforderungsFilterAmServer('eil', '2026-10-08', Date.now()),
    });
    expect(s.zeilen.map((o) => o.materialName)).toEqual([selten]);
    expect(await listPurchasingOrders(betrieb)).toHaveLength(anzahl);
    expect((await listOrdersPage(betrieb, '', 'archiv')).zeilen).toEqual([]);
  });
  it('bleibt mandantengeschützt und weist manipulierte Zeiger ab', async () => {
    expect((await listQuotesPage(`${betrieb}-fremd`, '', 'alle')).zeilen).toEqual([]);
    expect((await listOrdersPage(`${betrieb}-fremd`, '', 'aktiv')).zeilen).toEqual([]);
    await expect(listOrdersPage(betrieb, '', 'aktiv', { id: 'x),company_id.neq.x', zeit: '2026-01-01T00:00:00Z' }))
      .rejects.toThrow('ungültig');
  });
});
