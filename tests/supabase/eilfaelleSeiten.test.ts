import { beforeAll, afterAll, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto } from './helfer';
import { clientEinreichen, type SeitenZeiger } from '@/lib/db/pg/kern';
import { listOrdersPage } from '@/lib/db/pg/materialOrders';

const betrieb = 'eilfaelle-seiten';
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  const chef = await konto(betrieb, 'Geschäftsführung', 'eilseiten');
  expect((await admin.from('material_orders').insert(Array.from({ length: 151 }, (_, i) => ({
    id: crypto.randomUUID(), company_id: betrieb, user_id: chef.uid,
    material_name: `Artikel ${i}`, quantity: 1, status: 'Offen', transaction_type: 'order',
    is_urgent: i >= 100, created_at: i >= 100 ? '2020-01-01T08:00:00.000001Z' : '2026-10-09T08:00:00.000001Z',
  })))).error).toBeNull();
  expect((await admin.from('material_orders').insert([
    { id: crypto.randomUUID(), company_id: betrieb, user_id: chef.uid, material_name: 'Archiv alt eilig',
      quantity: 1, status: 'Erledigt', transaction_type: 'order', is_urgent: true, created_at: '2020-01-01T08:00:00Z' },
    { id: crypto.randomUUID(), company_id: betrieb, user_id: chef.uid, material_name: 'Archiv neu normal',
      quantity: 1, status: 'Erledigt', transaction_type: 'order', is_urgent: false, created_at: '2026-01-01T08:00:00Z' },
  ])).error).toBeNull();
  clientEinreichen(chef.client);
});
afterAll(() => clientEinreichen(null));

it('zeigt auch alte Eilfälle auf der ersten Seite und blättert über den Prioritätswechsel ohne Lücke', async () => {
  const erste = await listOrdersPage(betrieb, '', 'aktiv');
  expect(erste.zeilen).toHaveLength(50);
  expect(erste.zeilen.every((z) => z.isUrgent)).toBe(true);
  const zeilen = [...erste.zeilen];
  let vor: SeitenZeiger | null = erste.naechste;
  while (vor) {
    const s = await listOrdersPage(betrieb, '', 'aktiv', vor);
    zeilen.push(...s.zeilen); vor = s.naechste;
  }
  expect(zeilen).toHaveLength(151);
  expect(new Set(zeilen.map((z) => z.id)).size).toBe(151);
  expect(zeilen.slice(0, 51).every((z) => z.isUrgent)).toBe(true);
  expect(zeilen.slice(51).every((z) => !z.isUrgent)).toBe(true);
});

it('behält Suche und die zeitliche Sortierung des Archivs bei', async () => {
  expect((await listOrdersPage(betrieb, 'Artikel 150', 'aktiv')).zeilen.map((z) => z.materialName)).toEqual(['Artikel 150']);
  expect((await listOrdersPage(betrieb, '', 'archiv')).zeilen.map((z) => z.materialName))
    .toEqual(['Archiv neu normal', 'Archiv alt eilig']);
});
