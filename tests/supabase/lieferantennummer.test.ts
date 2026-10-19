/**
 * Die Lieferantennummer beim Kunden (E-Rechnung, 19.10.2026) — in der
 * Datenbank geprüft: wer Kunden pflegt, speichert sie; die Rechnungen lesen
 * sie über den Namen des Kunden; mehr als 64 Zeichen nimmt die Tabelle nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { kundenNachNamen, updateCustomer } from '@/lib/db/pg/customers';

const BETRIEB = 'lieferantennummer';
let chefin: Konto;
let kundeId = '';

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'lief-gf');
  const { data, error } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Bundesamt für Wasser' }).select('id').single();
  if (error) throw new Error(error.message);
  kundeId = data.id as string;
  clientEinreichen(chefin.client);
}, 60_000);

afterAll(() => clientEinreichen(null));

describe('Lieferantennummer beim Kunden', () => {
  it('ohne Angabe leer — wie bei jedem bestehenden Kunden', async () => {
    const [k] = await kundenNachNamen(BETRIEB, ['Bundesamt für Wasser']);
    expect(k.lieferantennummer ?? null).toBeNull();
  });

  it('wer Kunden pflegt, speichert sie; die Rechnung findet sie über den Namen', async () => {
    await updateCustomer(BETRIEB, kundeId, { lieferantennummer: '50012345' });
    const [k] = await kundenNachNamen(BETRIEB, ['Bundesamt für Wasser']);
    expect(k.lieferantennummer).toBe('50012345');
  });

  it('mehr als 64 Zeichen nimmt die Tabelle nicht', async () => {
    await expect(updateCustomer(BETRIEB, kundeId, { lieferantennummer: 'x'.repeat(65) })).rejects.toThrow();
  });
});
