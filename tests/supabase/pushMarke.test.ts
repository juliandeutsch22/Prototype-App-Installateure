/**
 * Eine Push-Marke gehört genau einem Konto (Prüflauf 25.09.2026, P1-18).
 *
 * Die Marke bezeichnet ein GERÄT. Auf dem geteilten Baustellen-Tablet stand
 * sie nach zwei Anmeldungen bei zwei Konten, und das Tablet bekam die
 * Meldungen beider — auch die des Kollegen, der längst abgemeldet war.
 * `push_marke_setzen` räumt sie deshalb beim Setzen von den anderen Konten
 * des Betriebs weg; über die Betriebsgrenze greift sie nicht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, betriebAnlegen, konto, API, ANON, type Konto } from './helfer';

const BETRIEB = 'pushmarke-a';
const FREMD = 'pushmarke-b';
const GERAET = 'tablet-baustelle-1';

let max: Konto;
let erna: Konto;
let fremd: Konto;

async function marken(uid: string): Promise<string[]> {
  const { data, error } = await admin
    .from('user_prefs').select('push_tokens').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.push_tokens as string[] | undefined) ?? [];
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  await betriebAnlegen(FREMD, 'Anderer Betrieb');
  max = await konto(BETRIEB, 'Mitarbeiter', 'push-max');
  erna = await konto(BETRIEB, 'Mitarbeiter', 'push-erna');
  fremd = await konto(FREMD, 'Mitarbeiter', 'push-fremd');
}, 120_000);

describe('push_marke_setzen', () => {
  it('trägt die Marke beim eigenen Konto ein', async () => {
    const { error } = await max.client.rpc('push_marke_setzen', { p_token: GERAET, p_an: true });
    expect(error).toBeNull();
    expect(await marken(max.uid)).toEqual([GERAET]);
  });

  it('nimmt dasselbe Gerät dem vorigen Konto im Betrieb weg', async () => {
    // Max hat die Marke (Test darüber) und ein zweites, eigenes Gerät.
    await max.client.rpc('push_marke_setzen', { p_token: 'telefon-max', p_an: true });
    // Ein Konto in einem ANDEREN Betrieb mit derselben Marke — bleibt unberührt.
    await admin.from('user_prefs').upsert({
      user_id: fremd.uid, company_id: FREMD, push_tokens: [GERAET],
    });

    const { error } = await erna.client.rpc('push_marke_setzen', { p_token: GERAET, p_an: true });
    expect(error).toBeNull();

    expect(await marken(erna.uid)).toEqual([GERAET]);
    // Bei Max ist nur das geteilte Gerät weg, sein Telefon bleibt.
    expect(await marken(max.uid)).toEqual(['telefon-max']);
    expect(await marken(fremd.uid)).toEqual([GERAET]);
  });

  it('entfernt beim Abschalten nur die eigene Marke', async () => {
    await admin.from('user_prefs').update({ push_tokens: ['telefon-max', 'gemeinsam'] })
      .eq('user_id', max.uid);
    await admin.from('user_prefs').update({ push_tokens: ['gemeinsam'] }).eq('user_id', erna.uid);

    const { error } = await erna.client.rpc('push_marke_setzen', { p_token: 'gemeinsam', p_an: false });
    expect(error).toBeNull();
    expect(await marken(erna.uid)).toEqual([]);
    expect(await marken(max.uid)).toEqual(['telefon-max', 'gemeinsam']);
  });

  it('bleibt ohne Anmeldung verschlossen', async () => {
    const anonym = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anonym.rpc('push_marke_setzen', { p_token: 'telefon-max', p_an: true });
    expect(error).not.toBeNull();
    expect(await marken(max.uid)).toContain('telefon-max');
  });

  it('lehnt eine leere Marke weiterhin ab', async () => {
    const { error } = await max.client.rpc('push_marke_setzen', { p_token: '', p_an: true });
    expect(error?.code).toBe('22023');
  });
});
