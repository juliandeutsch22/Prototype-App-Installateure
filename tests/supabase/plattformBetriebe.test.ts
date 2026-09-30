/**
 * Testbericht 30.09.2026, M43 — die Liste der Betriebe für den globalen
 * Administrator: Name, Kennung, Leitungskonten, ob eine E-Mail da ist, ein
 * offener Notzugang. Gegenprobe: ein Konto eines Betriebs bekommt sie nicht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'm43-liste';
let plattform: Konto;
let chefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'M43 Installationen');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'm43gf');
  await konto(BETRIEB, 'Mitarbeiter', 'm43mo');
  plattform = await plattformkonto('m43');
}, 120_000);

describe('Die Liste der Betriebe (M43)', () => {
  it('die Plattform sieht den Betrieb mit seinen Leitungskonten', async () => {
    const { data, error } = await plattform.client.rpc('plattform_betriebe');
    expect(error).toBeNull();
    const zeile = (data as { kennung: string; leitungskonten: number; leitung_mit_mail: number; notzugang_bis: string | null }[])
      .find((z) => z.kennung === BETRIEB);
    expect(zeile).toMatchObject({ leitungskonten: 1, leitung_mit_mail: 1, notzugang_bis: null });
  });

  it('ein offener Notzugang steht dabei', async () => {
    const auf = await plattform.client.rpc('support_notzugang', { p_company: BETRIEB, p_grund: 'Test M43', p_stunden: 2 });
    expect(auf.error).toBeNull();
    const { data } = await plattform.client.rpc('plattform_betriebe');
    const zeile = (data as { kennung: string; notzugang_bis: string | null }[]).find((z) => z.kennung === BETRIEB);
    expect(zeile?.notzugang_bis).not.toBeNull();
    await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
  });

  it('Gegenprobe: ein Konto eines Betriebs bekommt die Liste nicht', async () => {
    const { error } = await chefin.client.rpc('plattform_betriebe');
    expect(error?.code).toBe('42501');
  });
});
