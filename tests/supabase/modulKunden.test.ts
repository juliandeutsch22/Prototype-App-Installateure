/**
 * Das erste umgestellte Modul, gegen die echte Datenbank.
 *
 * Geprüft wird die Postgres-Fassung unmittelbar — nicht über die Weiche.
 * Welche Fassung gilt, entscheidet ein Schalter, und ein Test, der ihn
 * mitprüft, prüfte am Ende nur noch den Schalter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as kunden from '@/lib/db/pg/customers';
import { clientEinreichen } from '@/lib/db/pg/kern';

let leitung: Konto;
let fremd: Konto;

// Die Postgres-Fassung nimmt den Client, den ihr jemand eingereicht hat.
// Der Test reicht einen angemeldeten ein — derselbe Weg, den die App später
// nach der Anmeldung geht.
beforeAll(async () => {
  await betriebAnlegen('kunden-a');
  await betriebAnlegen('kunden-b');
  leitung = await konto('kunden-a', 'Projektleiter', 'leitung');
  fremd = await konto('kunden-b', 'Projektleiter', 'fremd');

  clientEinreichen(leitung.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Kunden auf Postgres', () => {
  it('legt an, liest alphabetisch und begrenzt', async () => {
    for (const name of ['Zimmerer', 'Auer', 'Müller']) {
      await kunden.createCustomer('kunden-a', { name });
    }
    const alle = await kunden.listCustomers('kunden-a');
    expect(alle.map((k) => k.name)).toEqual(['Auer', 'Müller', 'Zimmerer']);

    const zwei = await kunden.listCustomers('kunden-a', 2);
    expect(zwei).toHaveLength(2);
  });

  it('holt bestimmte Kunden nach Id — ohne die Dreissigerblöcke von früher', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 35; i += 1) {
      ids.push(await kunden.createCustomer('kunden-a', { name: `Block ${i}` }));
    }
    const geholt = await kunden.listCustomersByIds('kunden-a', ids);
    expect(geholt).toHaveLength(35);
  });

  it('gibt bei leerer Liste nichts zurück, ohne zu fragen', async () => {
    expect(await kunden.listCustomersByIds('kunden-a', [])).toEqual([]);
    expect(await kunden.listCustomersByIds('kunden-a', ['', ''])).toEqual([]);
  });

  it('zieht beim Umbenennen die Baustellen mit — oder gar nichts', async () => {
    const id = await kunden.createCustomer('kunden-a', { name: 'Alt GmbH' });
    await admin.from('projects').insert([
      { company_id: 'kunden-a', project_number: '2026-201', customer_id: id,
        customer_name: 'Alt GmbH', status: 'Aktiv' },
      { company_id: 'kunden-a', project_number: '2026-202', customer_id: id,
        customer_name: 'Alt GmbH', status: 'Aktiv' },
    ]);

    const anzahl = await kunden.updateCustomer('kunden-a', id, { name: 'Neu GmbH' });
    expect(anzahl).toBe(2);

    const baustellen = await kunden.listProjectsForCustomer('kunden-a', id);
    expect(baustellen.map((b) => b.customerName)).toEqual(['Neu GmbH', 'Neu GmbH']);
    const [k] = await kunden.listCustomersByIds('kunden-a', [id]);
    expect(k.name).toBe('Neu GmbH');
  });

  it('ändert ohne Namen nur den Kunden und meldet null Baustellen', async () => {
    const id = await kunden.createCustomer('kunden-a', { name: 'Ohne Umbenennung' });
    const anzahl = await kunden.updateCustomer('kunden-a', id, { notes: 'Notiz' });
    expect(anzahl).toBe(0);
    const [k] = await kunden.listCustomersByIds('kunden-a', [id]);
    expect(k.notes).toBe('Notiz');
  });

  it('lässt einen fremden Betrieb nicht umbenennen', async () => {
    const id = await kunden.createCustomer('kunden-a', { name: 'Meiner' });
    const { error } = await fremd.client.rpc('kunde_umbenennen', {
      p_kunde: id, p_name: 'Übernommen', p_rest: {},
    });
    expect(error).not.toBeNull();
    const [k] = await kunden.listCustomersByIds('kunden-a', [id]);
    expect(k.name).toBe('Meiner');
  });

  it('löscht nur einen Kunden ohne Baustellen — und sagt wie viele es sind', async () => {
    const id = await kunden.createCustomer('kunden-a', { name: 'Mit Baustelle' });
    await admin.from('projects').insert({
      company_id: 'kunden-a', project_number: '2026-210', customer_id: id,
      customer_name: 'Mit Baustelle', status: 'Aktiv',
    });
    await expect(kunden.deleteCustomer('kunden-a', id)).rejects.toThrow('noch 1 Baustelle');

    const leer = await kunden.createCustomer('kunden-a', { name: 'Ohne Baustelle' });
    await kunden.deleteCustomer('kunden-a', leer);
    expect(await kunden.listCustomersByIds('kunden-a', [leer])).toEqual([]);
  });

  it('ordnet eine Baustelle nachträglich zu', async () => {
    const id = await kunden.createCustomer('kunden-a', { name: 'Nachzügler' });
    const b = await admin.from('projects').insert({
      company_id: 'kunden-a', project_number: '2026-220',
      customer_name: 'Nachzügler', status: 'Aktiv',
    }).select('id').single();

    await kunden.assignProjectToCustomer(b.data!.id, id, 'Nachzügler');
    const zugeordnet = await kunden.listProjectsForCustomer('kunden-a', id);
    expect(zugeordnet.map((p) => p.projectNumber)).toEqual(['2026-220']);
  });

  it('findet nicht zugeordnete Baustellen — auch hinter fünfzig zugeordneten', async () => {
    /*
     * DER ALTE FEHLER, DER HIER MITERLEDIGT IST.
     *
     * Firestore konnte nicht auf ein FEHLENDES Feld abfragen. Die alte Fassung
     * holte deshalb `max` Baustellen mit passendem Namen und warf danach im
     * Browser alle weg, die schon zugeordnet waren. Sind die ersten fünfzig
     * Treffer bereits zugeordnet, meldete die Kundenakte „keine offenen
     * Baustellen" — obwohl weiter hinten welche lagen.
     */
    const id = await kunden.createCustomer('kunden-a', { name: 'Hausverwaltung' });
    const zugeordnet = Array.from({ length: 55 }, (_, i) => ({
      company_id: 'kunden-a', project_number: `2026-3${String(i).padStart(2, '0')}`,
      customer_id: id, customer_name: 'Hausverwaltung', status: 'Aktiv',
    }));
    await admin.from('projects').insert(zugeordnet);
    await admin.from('projects').insert({
      company_id: 'kunden-a', project_number: '2026-399',
      customer_name: 'Hausverwaltung', status: 'Aktiv',
    });

    const offen = await kunden.listUnlinkedProjectsByName('kunden-a', 'Hausverwaltung');
    expect(offen.map((p) => p.projectNumber)).toEqual(['2026-399']);
  });

  it('sucht nicht nach einem leeren Namen', async () => {
    expect(await kunden.listUnlinkedProjectsByName('kunden-a', '   ')).toEqual([]);
  });
});
