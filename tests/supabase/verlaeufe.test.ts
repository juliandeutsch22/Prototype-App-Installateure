/**
 * Verläufe mit Datum (12.10.2026, Plan 17 G) — gegen die echte Datenbank.
 *
 * Angebot: wann versendet, angenommen, abgelehnt. Urlaub und Sonderurlaub:
 * die Genehmigung bleibt nach einer Rücknahme. Wartung: jede Ausführung —
 * auch in der Datenauskunft des Kunden.
 * Festgehalten von Triggern, also für jeden Weg, der den Status ändert.
 *
 * Gegenprobe: ohne `20261012200000_verlaeufe.sql` gibt es die Spalten und
 * die Tabelle nicht (rot). Gleich bleibt: der Rücklauf einer Sicherung
 * (Dienst) spielt zurück, was war — kein Trigger setzt dort „jetzt“ ein.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as wartungen from '@/lib/db/pg/wartungen';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'verlauf-a';

let chef: Konto;
let verwalterin: Konto;
let monteur: Konto;
let kunde: string;

async function angebot(nr: string): Promise<string> {
  const { data, error } = await chef.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: { quote_number: nr, customer_name: 'Familie Huber', quote_date: '2026-10-01', valid_until: '2026-11-01', vat_rate: 0.2 },
    p_positionen: [{ label: 'Arbeitszeit', qty: 2, unit: 'h', unit_price: 80, netto: 160, ist_arbeitszeit: true }],
  });
  if (error) throw new Error(error.message);
  return data as string;
}

async function zeile(tabelle: string, id: string, spalten: string) {
  const { data, error } = await admin.from(tabelle).select(spalten).eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, string | null>;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'vlchef');
  verwalterin = await konto(BETRIEB, 'Administrator', 'vladm');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'vlmont');
  const { data, error } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Huber' })
    .select('id').single();
  if (error) throw new Error(error.message);
  kunde = (data as { id: string }).id;
}, 180_000);

describe('Angebot: wann versendet, angenommen, abgelehnt', () => {
  it('jeder Status bekommt seinen Zeitpunkt — der frühere bleibt', async () => {
    const id = await angebot('AN-2026-0901');
    expect(await zeile('quotes', id, 'versendet_am, angenommen_am, abgelehnt_am'))
      .toEqual({ versendet_am: null, angenommen_am: null, abgelehnt_am: null });

    expect((await chef.client.from('quotes').update({ status: 'Versendet' }).eq('id', id)).error).toBeNull();
    const versendet = await zeile('quotes', id, 'versendet_am, angenommen_am');
    expect(versendet.versendet_am).toBeTruthy();
    expect(versendet.angenommen_am).toBeNull();

    expect((await chef.client.from('quotes').update({ status: 'Angenommen' }).eq('id', id)).error).toBeNull();
    const angenommen = await zeile('quotes', id, 'versendet_am, angenommen_am');
    expect(angenommen.versendet_am).toBe(versendet.versendet_am);
    expect(angenommen.angenommen_am).toBeTruthy();

    const zwei = await angebot('AN-2026-0902');
    await chef.client.from('quotes').update({ status: 'Abgelehnt' }).eq('id', zwei);
    expect((await zeile('quotes', zwei, 'abgelehnt_am')).abgelehnt_am).toBeTruthy();
  });

  it('ein Speichern ohne Statuswechsel ändert keinen Zeitpunkt', async () => {
    const id = await angebot('AN-2026-0903');
    await chef.client.from('quotes').update({ status: 'Versendet' }).eq('id', id);
    const vorher = (await zeile('quotes', id, 'versendet_am')).versendet_am;
    await new Promise((r) => setTimeout(r, 20));
    await chef.client.from('quotes').update({ status: 'Versendet', address: 'Hauptstraße 2' }).eq('id', id);
    expect((await zeile('quotes', id, 'versendet_am')).versendet_am).toBe(vorher);
  });

  it('gleich geblieben: der Dienst spielt zurück, was war', async () => {
    const id = await angebot('AN-2026-0904');
    const { error } = await admin.from('quotes')
      .update({ status: 'Versendet', versendet_am: '2025-01-02T03:04:05+00:00' }).eq('id', id);
    expect(error).toBeNull();
    expect((await zeile('quotes', id, 'versendet_am')).versendet_am).toBe('2025-01-02T03:04:05+00:00');
  });
});

describe('Urlaub und Sonderurlaub: die Genehmigung bleibt nach der Rücknahme', () => {
  it('Urlaub: genehmigt, dann storniert — der Tag der Genehmigung steht noch da', async () => {
    const { data, error } = await admin.from('vacations').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', von: '2027-03-01', bis: '2027-03-01',
      tage: 1, status: 'Beantragt',
    }).select('id').single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;

    const ja = await chef.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: 'Genehmigt', p_grund: '' });
    expect(ja.error).toBeNull();
    const genehmigt = await zeile('vacations', id, 'genehmigt_am, entschieden_am');
    expect(genehmigt.genehmigt_am).toBe(genehmigt.entschieden_am);

    const nein = await verwalterin.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Storniert', p_grund: 'doch gebraucht',
    });
    expect(nein.error).toBeNull();
    const storniert = await zeile('vacations', id, 'status, genehmigt_am, entschieden_am');
    expect(storniert.status).toBe('Storniert');
    expect(storniert.genehmigt_am).toBe(genehmigt.genehmigt_am);
    expect(storniert.entschieden_am).not.toBe(genehmigt.entschieden_am);
  });

  it('Sonderurlaub: bestätigt, dann storniert — ebenso', async () => {
    const { data, error } = await monteur.client.rpc('freistellung_beantragen', {
      p_art: 'dienstverhinderung', p_anlass: 'musterung', p_ereignis: '2027-03-08', p_von: '2027-03-08', p_bis: '2027-03-08',
      p_zeit_von: null, p_zeit_bis: null, p_kind_unter_12: false, p_zusatzwoche: false, p_notiz: null,
    });
    expect(error).toBeNull();
    const id = data as string;
    const entscheiden = (k: Konto, e: string, grund = '') => k.client.rpc('freistellung_entscheiden', {
      p_id: id, p_entscheidung: e, p_grund: grund, p_nachweis_geprueft: true, p_kuerzung: null,
    });
    expect((await entscheiden(chef, 'Bestätigt')).error).toBeNull();
    const bestaetigt = await zeile('freistellungen', id, 'bestaetigt_am, entschieden_am');
    expect(bestaetigt.bestaetigt_am).toBe(bestaetigt.entschieden_am);

    expect((await entscheiden(verwalterin, 'Storniert', 'doch nicht')).error).toBeNull();
    const storniert = await zeile('freistellungen', id, 'status, bestaetigt_am');
    expect(storniert).toEqual({ status: 'Storniert', bestaetigt_am: bestaetigt.bestaetigt_am });
  });

  it('eine Ablehnung setzt keinen Tag der Genehmigung', async () => {
    const { data } = await admin.from('vacations').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur', von: '2027-03-02', bis: '2027-03-02',
      tage: 1, status: 'Beantragt',
    }).select('id').single();
    const id = (data as { id: string }).id;
    await chef.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: 'Abgelehnt', p_grund: 'Engpass' });
    expect((await zeile('vacations', id, 'genehmigt_am')).genehmigt_am).toBeNull();
  });
});

describe('Wartung: jede Ausführung', () => {
  const vereinbarung = () => ({
    customerId: kunde, customerName: 'Familie Huber', anlage: 'Gastherme', intervallMonate: 12,
    faelligAm: '2026-03-01', aktiv: true,
  });

  async function ausfuehrungen(id: string) {
    const { data } = await admin.from('wartung_ausfuehrungen').select('am, baustelle').eq('wartung_id', id).order('am');
    return data ?? [];
  }

  it('hält jede Ausführung fest — derselbe Tag bleibt eine', async () => {
    clientEinreichen(chef.client);
    const id = await wartungen.createWartung(BETRIEB, { ...vereinbarung(), zuletztAm: '2025-03-01' } as Parameters<typeof wartungen.createWartung>[1]);
    expect(await ausfuehrungen(id)).toEqual([{ am: '2025-03-01', baustelle: null }]);

    await wartungen.wartungErledigt(id, { erledigtAm: '2026-03-04', intervallMonate: 12, projectNumber: 'B-2026-0010' });
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-03-04', intervallMonate: 12, projectNumber: 'B-2026-0010' });
    expect(await ausfuehrungen(id)).toEqual([
      { am: '2025-03-01', baustelle: null },
      { am: '2026-03-04', baustelle: 'B-2026-0010' },
    ]);
    // Lesen geht für jeden im Betrieb — über dieselbe Funktion wie die App.
    clientEinreichen(monteur.client);
    expect((await wartungen.listAusfuehrungen(BETRIEB, id)).map((a) => a.am)).toEqual(['2026-03-04', '2025-03-01']);
    clientEinreichen(null);
  });

  it('stehen in der Datenauskunft des Kunden bei ihrer Wartung', async () => {
    const { data, error } = await chef.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
    expect(error).toBeNull();
    const liste = (data as { daten: { wartungen: { anlage: string; ausfuehrungen: unknown[] }[] } }).daten.wartungen;
    expect(liste.find((w) => w.anlage === 'Gastherme')?.ausfuehrungen).toEqual([
      { am: '2025-03-01', baustelle: null },
      { am: '2026-03-04', baustelle: 'B-2026-0010' },
    ]);
  });

  it('schreiben kann sie niemand von Hand — auch die Führung nicht', async () => {
    const { data } = await admin.from('wartungen').select('id').eq('company_id', BETRIEB).limit(1).single();
    const id = (data as { id: string }).id;
    const r = await chef.client.from('wartung_ausfuehrungen').insert({ company_id: BETRIEB, wartung_id: id, am: '2020-01-01' });
    expect(r.error).not.toBeNull();
  });

  it('mit der Wartung gelöscht', async () => {
    clientEinreichen(chef.client);
    const id = await wartungen.createWartung(BETRIEB, { ...vereinbarung(), anlage: 'Boiler', zuletztAm: '2025-05-05' } as Parameters<typeof wartungen.createWartung>[1]);
    expect(await ausfuehrungen(id)).toHaveLength(1);
    await wartungen.deleteWartung(id);
    expect(await ausfuehrungen(id)).toEqual([]);
    clientEinreichen(null);
  });

  it('übernimmt beim Einspielen den Bestand: die letzte Wartung einer älteren Anlage', async () => {
    // Wie eine Anlage von vor dieser Fassung: über den Dienst angelegt, also ohne Ausführung.
    const { data } = await admin.from('wartungen').insert({
      company_id: BETRIEB, customer_id: kunde, customer_name: 'Familie Huber', anlage: 'Speicher',
      intervall_monate: 12, zuletzt_am: '2025-07-07', letzte_baustelle: 'B-2025-0077', faellig_am: '2026-07-07',
    }).select('id').single();
    const id = (data as { id: string }).id;
    expect(await ausfuehrungen(id)).toEqual([]);

    const db = new Client({
      connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
    await db.connect();
    try {
      /*
        EINGESPIELT WIE IM BETRIEB: diese Migration UND alle danach, in ihrer
        Reihenfolge. Nur diese eine Datei setzte Funktionen, die eine spätere
        neu fasst (Stand 18, G2), auf den alten Stand zurück — und jede
        Prüfung danach liefe gegen eine Datenbank, die es so nie gibt.
      */
      /*
        DIE MONATSSICHT VORHER WEG (27.10.2026). Eine spätere Migration hängt
        ihr eine Spalte an (`schultage`, Testbericht Runde 6, M1); die älteren
        Fassungen hier davor können sie nicht ohne diese Spalte neu fassen
        („cannot drop columns from view“). Der Abbruch mitten im Einspielen
        ließ ältere Funktionsrümpfe zurück, und Prüfungen in anderen Dateien
        liefen danach gegen sie. Die Migrationen bauen die Sicht wieder auf.
      */
      await db.query('drop view if exists public.monthly_stats');
      const ordner = join(__dirname, '../../supabase/migrations');
      for (const datei of readdirSync(ordner).filter((d) => d >= '20261012200000' && d.endsWith('.sql')).sort()) {
        await db.query(readFileSync(join(ordner, datei), 'utf8'));
      }
      await db.query('grant select on public.monthly_stats to authenticated');
    } finally {
      await db.end();
    }
    expect(await ausfuehrungen(id)).toEqual([{ am: '2025-07-07', baustelle: 'B-2025-0077' }]);
  });

  it('gleich geblieben: der Dienst spielt Wartungen ohne erfundene Ausführung zurück', async () => {
    const { data, error } = await admin.from('wartungen').insert({
      company_id: BETRIEB, customer_id: kunde, customer_name: 'Familie Huber', anlage: 'Pumpe', intervall_monate: 12,
      zuletzt_am: '2024-06-06', faellig_am: '2025-06-06', aktiv: true,
    }).select('id').single();
    expect(error).toBeNull();
    expect(await ausfuehrungen((data as { id: string }).id)).toEqual([]);
  });
});
