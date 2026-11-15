/**
 * V11 (Durchsicht 15.11.2026): ZURÜCKGEBEN AUS DER ANFORDERUNG — AUCH FRISCH
 * GETIPPTE WARE.
 *
 * Die Datenbank nahm eine Retoure ohne Katalogartikel schon an; die Ansicht
 * verlangte einen. Hier, was die Retoure ohne Katalogartikel tut: sie wird
 * erfasst, die Höchstmenge zählt über den Namen, und gutgeschrieben wird
 * nichts. Gegenprobe der Höchstmenge: ohne 20261116060500 gehen 5 durch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createReturn } from '@/lib/db/pg/materialOrders';

const A = 'v11-retoure';
const NR = '2026-220';
let max: Konto;

beforeAll(async () => {
  await betriebAnlegen(A);
  max = await konto(A, 'Mitarbeiter', 'v11max');
  const { error } = await admin.from('material_orders').insert({
    id: randomUUID(), company_id: A, material_name: 'Sonderdichtung  DN20', quantity: 3, status: 'Erledigt',
    transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: NR,
  });
  if (error) throw new Error(error.message);
  clientEinreichen(max.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

const frei = (menge: number, name = 'sonderdichtung dn20') => createReturn(A, {
  materialId: null, materialName: name, quantity: menge, condition: 'neu',
  projectNumber: NR, userId: max.uid, userName: 'Max',
} as never);

describe('V11: frei getippte Ware zurückgeben', () => {
  it('höchstens, was unter diesem Namen ausgegeben wurde — Schreibweise egal', async () => {
    await expect(frei(5)).rejects.toThrow(/wurden 3 ausgegeben/);
    const id = await frei(2);
    const { data } = await admin.from('material_orders').select('material_id, processed, quantity').eq('id', id).single();
    // Ohne Katalogartikel nichts gutzuschreiben — also auch nichts anzunehmen.
    expect(data).toEqual({ material_id: null, processed: true, quantity: 2 });
    await expect(frei(2)).rejects.toThrow(/schon zurück — mehr als 1/);
  });
});
