/**
 * Fehler vor der Anmeldung — gegen die echte Datenbank.
 *
 * Schreiben darf hier, wer nicht angemeldet ist, also jeder im Netz. Geprüft
 * wird deshalb vor allem, was er NICHT darf: lesen, direkt in die Tabelle
 * schreiben, Felder überlang füllen, eine fremde Art unterschieben, die
 * Tabelle fluten. Und dass die Plattform sieht, was ankommt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, plattformkonto, API, ANON, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { fehlerVorAnmeldungEintragen, plattformFehler } from '@/lib/db/pg/fehlerprotokoll';

const anonym = createClient(API, ANON, { auth: { persistSession: false } });
let plattform: Konto;

const eintrag = (nachricht: string) =>
  ({ art: 'absturz' as const, nachricht, pfad: '/login', fassung: 'test', geraet: 'Prüfung' });

async function anzahl(): Promise<number> {
  const { count } = await admin.from('fehler_vor_anmeldung').select('*', { count: 'exact', head: true });
  return count ?? 0;
}

beforeAll(async () => {
  await admin.from('fehler_vor_anmeldung').delete().gte('created_at', '1970-01-01');
  plattform = await plattformkonto('fvaplatt');
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('fehler_vor_anmeldung').delete().gte('created_at', '1970-01-01');
});

describe('Ohne Anmeldung', () => {
  it('nimmt einen Absturz an — gekürzt, ohne Person', async () => {
    await fehlerVorAnmeldungEintragen({ ...eintrag('Anmeldeseite kaputt'), stapel: 'x'.repeat(5000) }, anonym);
    const { data } = await admin.from('fehler_vor_anmeldung').select('*').eq('nachricht', 'Anmeldeseite kaputt');
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ art: 'absturz', pfad: '/login', fassung: 'test' });
    expect((data![0].stapel as string).length).toBe(4000);
  });

  it('dieselbe Meldung erst nach zehn Minuten wieder', async () => {
    const vorher = await anzahl();
    await fehlerVorAnmeldungEintragen(eintrag('Anmeldeseite kaputt'), anonym);
    expect(await anzahl()).toBe(vorher);
  });

  it('nimmt keine fremde Art und keine leere Meldung', async () => {
    const vorher = await anzahl();
    const { error } = await anonym.rpc('fehler_vor_anmeldung_eintragen', { p_art: 'meldung', p_nachricht: 'Hallo Support' });
    expect(error).toBeNull();
    await fehlerVorAnmeldungEintragen(eintrag('   '), anonym);
    expect(await anzahl()).toBe(vorher);
  });

  it('liest nichts und schreibt nicht an der Funktion vorbei', async () => {
    const lesen = await anonym.from('fehler_vor_anmeldung').select('*');
    expect(lesen.data ?? []).toEqual([]);
    const schreiben = await anonym.from('fehler_vor_anmeldung').insert({ art: 'absturz', nachricht: 'direkt' });
    expect(schreiben.error).not.toBeNull();
  });

  it('flutet nicht: höchstens 100 je Stunde, danach nichts mehr', async () => {
    for (let i = 0; i < 110; i++) {
      await fehlerVorAnmeldungEintragen(eintrag(`Flut ${i}`), anonym);
    }
    expect(await anzahl()).toBe(100);
  });
});

describe('Die Plattform', () => {
  it('sieht sie als „Vor der Anmeldung"', async () => {
    clientEinreichen(plattform.client);
    const liste = await plattformFehler(1);
    const vor = liste.filter((f) => f.betrieb === 'Vor der Anmeldung');
    expect(vor.length).toBeGreaterThan(0);
    expect(vor.some((f) => f.nachricht === 'Anmeldeseite kaputt')).toBe(true);
    expect(vor.every((f) => f.companyId === '' && f.wer === undefined)).toBe(true);
  });

  it('niemand sonst — auch nicht über die Funktion der Plattform', async () => {
    const { data } = await anonym.rpc('fehlerprotokoll_plattform', { p_tage: 1 });
    expect(data ?? []).toEqual([]);
  });
});
