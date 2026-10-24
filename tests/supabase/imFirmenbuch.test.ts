/**
 * IM FIRMENBUCH EINGETRAGEN (A12 der Durchsicht vom 24.10.2026) — die eigene
 * Angabe des Betriebs. Ab Werk leer (der Name entscheidet); die
 * Geschäftsführung setzt sie, ein Monteur nicht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'im-firmenbuch';
let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'ifgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ifmon');
}, 60_000);

const angabe = async () =>
  (await admin.from('companies').select('im_firmenbuch').eq('id', BETRIEB).single()).data?.im_firmenbuch;

describe('Im Firmenbuch eingetragen', () => {
  it('ab Werk leer; die Geschäftsführung setzt die eigene Angabe und nimmt sie zurück', async () => {
    expect(await angabe()).toBeNull();
    expect((await chefin.client.from('companies').update({ im_firmenbuch: true }).eq('id', BETRIEB)).error).toBeNull();
    expect(await angabe()).toBe(true);
    expect((await chefin.client.from('companies').update({ im_firmenbuch: null }).eq('id', BETRIEB)).error).toBeNull();
    expect(await angabe()).toBeNull();
  });

  it('Gegenprobe: ein Monteur nicht', async () => {
    const { count } = await monteur.client.from('companies')
      .update({ im_firmenbuch: true }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    expect(await angabe()).toBeNull();
  });
});
