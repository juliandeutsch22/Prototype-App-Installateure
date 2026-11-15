/**
 * GESCHÄFTSFÜHRUNG UND ADMINISTRATOR EINPLANBAR (Durchsicht 15.11.2026, V12,
 * Entscheidung E2) — `20261116010600_leitung_im_einsatzplan.sql`.
 *
 * Gegenprobe: ohne die Migration gibt es die Spalte nicht. „Bleibt gleich“:
 * ab Werk aus; die Einstellung ändert nur, wer die Firmendaten ändert; ein
 * eingeteilter Chef steht im Plan wie jeder andere (die Datenbank fragt beim
 * Einteilen nicht nach der Rolle).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'leitung-plan-v12';
let chef: Konto;
let pl: Konto;

beforeAll(async () => {
  await betriebAnlegen(B);
  chef = await konto(B, 'Geschäftsführung', 'v12chef');
  pl = await konto(B, 'Projektleiter', 'v12pl');
}, 120_000);

afterAll(async () => {
  await admin.from('assignments').delete().eq('company_id', B);
});

describe('leitung_im_einsatzplan', () => {
  it('ist ab Werk aus', async () => {
    const { data } = await admin.from('companies').select('leitung_im_einsatzplan').eq('id', B).single();
    expect(data?.leitung_im_einsatzplan).toBe(false);
  });

  it('die Geschäftsführung schaltet ein; die Projektleitung nicht', async () => {
    await pl.client.from('companies').update({ leitung_im_einsatzplan: true }).eq('id', B);
    expect((await admin.from('companies').select('leitung_im_einsatzplan').eq('id', B).single()).data?.leitung_im_einsatzplan).toBe(false);
    const { error } = await chef.client.from('companies').update({ leitung_im_einsatzplan: true }).eq('id', B);
    expect(error).toBeNull();
    expect((await admin.from('companies').select('leitung_im_einsatzplan').eq('id', B).single()).data?.leitung_im_einsatzplan).toBe(true);
  });

  it('der Chef lässt sich einteilen und sieht seinen Einsatz', async () => {
    const { error } = await pl.client.rpc('einsatz_speichern', {
      p_datum: '2027-12-06', p_baustelle: 'V12-1',
      p_zeilen: [{ user_id: chef.uid, user_name: 'Chef', as_helper: false, comment: 'Bad', created_by: pl.uid }],
    });
    expect(error).toBeNull();
    const { data } = await chef.client.from('assignments').select('user_id').eq('company_id', B).eq('date', '2027-12-06');
    expect(data).toEqual([{ user_id: chef.uid }]);
  });
});
