/**
 * Angebots- und Baustellennummern nehmen das Jahr vom Server
 * (Durchsicht 15.11.2026, G10).
 *
 * Vorher schickte die App das Jahr ihrer Uhr: ein Gerät im Jahr 2020 zog
 * „AN-2020-0001“ und eröffnete einen Zähler für 2020. Ohne
 * `20261116051000_nummernjahr_vom_server.sql` gibt der erste Aufruf eine
 * Nummer und `naechste_belegnummer` gibt es nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { reserveQuoteNumber } from '@/lib/db/pg/quotes';
import { reserveProjectNumber } from '@/lib/db/pg/projects';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { naechsteNummernImJahr } from '@/lib/db/pg/company';

const BETRIEB = 'jahr-g10';
let chefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'g10chef');
  clientEinreichen(chefin.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

const JAHR = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date()).slice(0, 4));

describe('Nummernjahr vom Server (G10)', () => {
  it('ein Gerät mit falschem Jahr bekommt keine Nummer — und es entsteht kein Zähler dafür', async () => {
    const { error } = await chefin.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: 2020 });
    expect(error?.message).toMatch(/nicht das laufende Jahr/);
    const { data } = await admin.from('number_counters').select('jahr').eq('company_id', BETRIEB).eq('jahr', 2020);
    expect(data ?? []).toEqual([]);
  });

  it('die App bekommt die fertige Nummer mit dem Jahr vom Server', async () => {
    expect(await reserveQuoteNumber(BETRIEB, 'AN')).toMatch(new RegExp(`^AN-${JAHR}-\\d{4,}$`));
    expect(await reserveProjectNumber(BETRIEB, { seedFrom: 0, praefix: 'B' })).toMatch(new RegExp(`^B-${JAHR}-\\d{4,}$`));
  });

  // Bleibt gleich: die alte App schickt das laufende Jahr mit — wie bisher.
  it('die alte App mit richtigem Jahr: wie bisher', async () => {
    const a = await chefin.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: JAHR });
    const b = await chefin.client.rpc('naechste_nummer', { p_art: 'projects', p_jahr: JAHR });
    expect(b.data).toBe((a.data as number) + 1);
  });

  /*
    G12: die Vorschau der Einstellungen. Vorher fragte sie mit dem Jahr des
    Geräts und baute die Nummer damit; ohne
    `20261117030000_naechste_nummern_serverjahr.sql` gibt es die Funktion nicht.
  */
  it('die Vorschau der nächsten Nummern kommt mit dem Jahr vom Server und verbraucht nichts', async () => {
    const vorher = await naechsteNummernImJahr();
    expect(vorher.jahr).toBe(JAHR);
    const wieBisher = await chefin.client.rpc('naechste_nummern', { p_jahr: JAHR });
    const je = new Map((wieBisher.data as { art: string; naechste: number }[]).map((z) => [z.art, z.naechste]));
    expect(vorher).toEqual({ jahr: JAHR, rechnung: je.get('invoices'), angebot: je.get('quotes'), baustelle: je.get('projects') });
    // Bleibt gleich: die Vorschau zieht keine Nummer.
    expect(await naechsteNummernImJahr()).toEqual(vorher);
  });

  it('die Vorschau gibt es nur angemeldet', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { API, ANON } = await import('./helfer');
    const anonym = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anonym.rpc('naechste_nummern_vorschau');
    expect(error).not.toBeNull();
  });
});
