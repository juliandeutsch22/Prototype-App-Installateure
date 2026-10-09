import { beforeAll, afterAll, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listOrderProjects } from '@/lib/db/pg/materialOrders';

const betrieb = 'anforderung-baustellen';
let chef: Konto;
let monteur: Konto;
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  await betriebAnlegen(`${betrieb}-fremd`);
  chef = await konto(betrieb, 'Geschäftsführung', 'filter-chef');
  monteur = await konto(betrieb, 'Mitarbeiter', 'filter-monteur');
  const basis = { company_id: betrieb, user_id: chef.uid, material_name: 'Ventil', quantity: 1,
    status: 'Offen', transaction_type: 'order' };
  const zeilen = Array.from({ length: 1001 }, (_, i) => ({ ...basis, id: crypto.randomUUID(), project_number: `B-${String(i).padStart(4, '0')}` }));
  for (let ab = 0; ab < zeilen.length; ab += 500) {
    expect((await admin.from('material_orders').insert(zeilen.slice(ab, ab + 500))).error).toBeNull();
  }
  expect((await admin.from('material_orders').insert([
    { ...basis, id: crypto.randomUUID(), project_number: 'B-0000', user_id: monteur.uid },
    { ...basis, id: crypto.randomUUID(), project_number: 'RET', transaction_type: 'return' },
    { ...basis, id: crypto.randomUUID(), project_number: null },
    { ...basis, id: crypto.randomUUID(), company_id: `${betrieb}-fremd`, project_number: 'FREMD' },
  ])).error).toBeNull();
});
afterAll(() => clientEinreichen(null));

it('liefert alle 1.001 Baustellen, eindeutig und ohne Retouren oder fremde Betriebsdaten', async () => {
  clientEinreichen(chef.client);
  const nummern = await listOrderProjects(betrieb);
  expect(nummern).toHaveLength(1001);
  expect(new Set(nummern).size).toBe(1001);
  expect(nummern[0]).toBe('B-0000');
  expect(nummern[nummern.length - 1]).toBe('B-1000');
});

it('gibt Mitarbeitern nur die Baustellennummern ihrer eigenen Anforderungen', async () => {
  clientEinreichen(monteur.client);
  expect(await listOrderProjects(betrieb)).toEqual(['B-0000']);
});

it('weist eine fremde Betriebskennung auch beim direkten Funktionsaufruf ab', async () => {
  clientEinreichen(chef.client);
  expect(await listOrderProjects(`${betrieb}-fremd`)).toEqual([]);
});
