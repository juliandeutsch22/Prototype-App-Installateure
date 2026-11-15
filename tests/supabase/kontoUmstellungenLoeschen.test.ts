/**
 * K9 (Paket 8, 16.11.2026; Durchsicht N5): `konto_umstellungen` geht mit der
 * Löschung einer Person und steht im Bericht.
 *
 * VORHER: die Zeilen standen in der Datenauskunft, `person_loeschen` ließ sie
 * aber stehen und nannte sie nicht.
 *
 * GEGENPROBE (Erwartung): ohne `20261116077000_konto_umstellungen_loeschen.sql`
 * sind „gehen mit“ und „im Bericht“ rot (Zeile bleibt, Schlüssel fehlt);
 * „steht in der Auskunft“ ist in beiden Fassungen grün.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';

const BETRIEB = 'k9-umstellungen';
let chefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'k9-chefin');
}, 120_000);

async function umstellung(user: string, durch: string, grund: string) {
  const { error } = await admin.from('konto_umstellungen').insert({
    company_id: BETRIEB, user_id: user, nach: 'benutzername', grund, durch, durch_name: 'Name von durch',
  });
  if (error) throw new Error(error.message);
}

describe('Kontoumstellungen und die Löschung einer Person', () => {
  it('bleibt gleich: stehen in der Datenauskunft', async () => {
    const m = await konto(BETRIEB, 'Mitarbeiter', 'k9-m0');
    await umstellung(m.uid, chefin.uid, 'kein Postfach');
    const { data } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: m.uid });
    expect((data as { daten: { kontoumstellungen: unknown[] } }).daten.kontoumstellungen).toHaveLength(1);
  }, 60_000);

  it('gehen mit und stehen im Bericht — die über andere bleiben, ohne den Namen der gelöschten Person', async () => {
    const m = await konto(BETRIEB, 'Mitarbeiter', 'k9-m1');
    const anderer = await konto(BETRIEB, 'Mitarbeiter', 'k9-m2');
    await umstellung(m.uid, chefin.uid, 'eigene');
    await umstellung(anderer.uid, m.uid, 'vom Gelöschten');
    await deaktivieren(m.uid);

    const { data: probe } = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: m.uid, p_nur_pruefen: true });
    expect((probe as { sofort: Record<string, number> }).sofort.kontoumstellungen).toBe(2);

    const { error } = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: m.uid, p_nur_pruefen: false });
    expect(error).toBeNull();
    const { data: eigene } = await admin.from('konto_umstellungen').select('id').eq('user_id', m.uid);
    expect(eigene ?? []).toHaveLength(0);
    const { data: fremd } = await admin.from('konto_umstellungen').select('durch, durch_name, grund').eq('user_id', anderer.uid);
    expect(fremd).toEqual([{ durch: null, durch_name: null, grund: 'vom Gelöschten' }]);
  }, 120_000);
});
