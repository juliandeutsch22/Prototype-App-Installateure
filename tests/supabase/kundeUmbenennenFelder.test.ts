/**
 * Kunde speichern MIT Namen (Kundenakte, Kundenliste) — jedes Feld der Maske
 * kommt an (Durchsicht 15.11.2026, A2).
 *
 * Mit Namen geht `updateCustomer` über `kunde_umbenennen`, damit der Name in
 * derselben Transaktion an die Baustellen wandert. Die Funktion zählt ihre
 * Spalten auf, und zweimal fehlte eine neue darin (30.09.: Straße, PLZ, Ort,
 * Land, Kundennummer; seit 19.10.: die Lieferantennummer) — gespeichert
 * wurde ohne sie, die Maske meldete „Gespeichert“. `lieferantennummer.test.ts`
 * sah das nicht, weil es ohne Namen speichert und damit den anderen Zweig
 * trifft.
 *
 * Darum hier: über den echten Weg, mit dem ganzen Entwurf, wie die Akte ihn
 * schickt, und Spalte für Spalte zurückgelesen. Kommt eine Spalte dazu, fällt
 * dieser Test um, bis sie hier einen Prüfwert hat — und die Funktion weist
 * sie ab, bis sie dort steht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listCustomersByIds, updateCustomer, type NewCustomer } from '@/lib/db/pg/customers';

const BETRIEB = 'a2-kunde-felder';
let chefin: Konto;

/** Ein Kunde, der in JEDEM Feld etwas anderes trägt als der Entwurf unten. */
async function kundeAnlegen(): Promise<string> {
  const { data, error } = await admin.from('customers').insert({
    company_id: BETRIEB,
    name: `A2 Alt ${crypto.randomUUID().slice(0, 6)}`,
    strasse: 'Gartengasse 12', plz: '2700', ort: 'Wiener Neustadt', land: 'AT',
    kundennummer: `K-ALT-${crypto.randomUUID().slice(0, 6)}`,
    lieferantennummer: null,
    contact_name: 'Herr Alt', contact_phone: '01 111', email: 'alt@example.at',
    vat_id: null, kundenart: 'privat', notes: 'alt', active: true,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function zeile(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from('customers').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

/*
  Was die Datenbank selbst führt — kein Feld der Maske. Jede andere Spalte
  braucht unten einen Prüfwert; so fällt die nächste neue Spalte hier auf.
*/
const VON_DER_DATENBANK = ['id', 'company_id', 'created_at', 'updated_at', 'adresse_pruefen', 'angaben_pruefen'];

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'a2gf');
  clientEinreichen(chefin.client);
}, 60_000);

afterAll(() => clientEinreichen(null));

describe('Speichern mit Namen nimmt jedes Feld der Maske mit', () => {
  it('Kundenakte/Kundenliste: alle Felder geändert, alle zurückgelesen — auch die Lieferantennummer', async () => {
    const id = await kundeAnlegen();
    const kundennummer = `K-NEU-${id.slice(0, 6)}`;
    // Dieselben Schlüssel wie `alsEntwurf` (Kundenakte) und das „Bearbeiten“ der Kundenliste.
    const entwurf: NewCustomer = {
      name: `A2 Neu ${id.slice(0, 6)}`,
      address: 'Hauptstraße 1, 80331 München, Deutschland',
      strasse: 'Hauptstraße 1',
      plz: '80331',
      ort: 'München',
      land: 'DE',
      kundennummer,
      lieferantennummer: '50012345',
      contactName: 'Frau Huber',
      contactPhone: '0664 1234567',
      email: 'huber@example.at',
      vatId: 'DE123456789',
      kundenart: 'unternehmen',
      notes: 'Notiz A2',
      active: false,
    };
    await updateCustomer(BETRIEB, id, entwurf);

    const erwartet: Record<string, unknown> = {
      name: entwurf.name,
      address: 'Hauptstraße 1, 80331 München, Deutschland',
      strasse: 'Hauptstraße 1',
      plz: '80331',
      ort: 'München',
      land: 'DE',
      kundennummer,
      lieferantennummer: '50012345',
      contact_name: 'Frau Huber',
      contact_phone: '0664 1234567',
      email: 'huber@example.at',
      vat_id: 'DE123456789',
      kundenart: 'unternehmen',
      notes: 'Notiz A2',
      active: false,
    };
    const z = await zeile(id);
    const ohnePruefwert = Object.keys(z).filter((s) => !VON_DER_DATENBANK.includes(s) && !(s in erwartet));
    expect(ohnePruefwert, 'Neue Spalte am Kunden: in kunde_umbenennen übernehmen und hier prüfen').toEqual([]);
    for (const [spalte, wert] of Object.entries(erwartet)) {
      expect({ spalte, wert: z[spalte] }).toEqual({ spalte, wert });
    }

    // Und so, wie die Akte nach dem Speichern neu lädt.
    const [k] = await listCustomersByIds(BETRIEB, [id]);
    expect(k.lieferantennummer).toBe('50012345');
  });

  it('geleerte Felder bleiben leer — wie die Maske sie schickt', async () => {
    const id = await kundeAnlegen();
    await updateCustomer(BETRIEB, id, { name: `A2 Leer ${id.slice(0, 6)}`, lieferantennummer: '50012345' });
    await updateCustomer(BETRIEB, id, {
      name: `A2 Leer ${id.slice(0, 6)}`, lieferantennummer: '', kundennummer: '', vatId: '', kundenart: 'privat',
    });
    const z = await zeile(id);
    expect(z.lieferantennummer ?? '').toBe('');
    expect(z.kundennummer).toBeNull();
    expect(z.kundenart).toBe('privat');
  });

  it('die Lieferantennummer lässt sich auch mit null leeren (wie im E-Rechnungs-Dialog)', async () => {
    const id = await kundeAnlegen();
    await updateCustomer(BETRIEB, id, { name: `A2 Null ${id.slice(0, 6)}`, lieferantennummer: '50012345' });
    await updateCustomer(BETRIEB, id, { name: `A2 Null ${id.slice(0, 6)}`, lieferantennummer: null });
    expect((await zeile(id)).lieferantennummer).toBeNull();
  });
});

describe('Ein unbekannter Schlüssel wird abgewiesen statt verschluckt', () => {
  it('über die Funktion: Meldung nennt den Schlüssel, nichts wird gespeichert', async () => {
    const id = await kundeAnlegen();
    const vorher = await zeile(id);
    const { error } = await chefin.client.rpc('kunde_umbenennen', {
      p_kunde: id, p_name: 'Darf nicht ankommen', p_rest: { gibt_es_nicht: 'x', contact_phone: '0999' },
    });
    expect(error?.message).toMatch(/nicht gespeichert/);
    expect(error?.message).toMatch(/gibt_es_nicht/);
    const nachher = await zeile(id);
    expect(nachher.name).toBe(vorher.name);
    expect(nachher.contact_phone).toBe(vorher.contact_phone);
  });

  it('über updateCustomer: ein Feld, das die Datenbank nicht kennt, scheitert laut', async () => {
    const id = await kundeAnlegen();
    await expect(
      updateCustomer(BETRIEB, id, { name: 'Darf nicht ankommen', gibtEsNicht: 'x' } as unknown as Partial<NewCustomer>),
    ).rejects.toThrow(/gibt_es_nicht/);
  });
});

describe('Bleibt gleich', () => {
  it('Spalten, die die Datenbank führt, werden übergangen — kein Fehler, kein Überschreiben', async () => {
    const id = await kundeAnlegen();
    const vorher = await zeile(id);
    const { error } = await chefin.client.rpc('kunde_umbenennen', {
      p_kunde: id,
      p_name: String(vorher.name),
      p_rest: {
        id: crypto.randomUUID(), company_id: 'fremd', created_at: '2000-01-01T00:00:00Z',
        updated_at: '2000-01-01T00:00:00Z', adresse_pruefen: true, angaben_pruefen: true,
        contact_phone: '01 222',
      },
    });
    expect(error).toBeNull();
    const nachher = await zeile(id);
    expect(nachher).toMatchObject({
      id, company_id: BETRIEB, created_at: vorher.created_at, adresse_pruefen: false, angaben_pruefen: false,
      contact_phone: '01 222',
    });
  });

  it('bei den älteren Feldern heisst null weiter „unverändert“', async () => {
    const id = await kundeAnlegen();
    const { error } = await chefin.client.rpc('kunde_umbenennen', {
      p_kunde: id, p_name: `A2 Bleibt ${id.slice(0, 6)}`, p_rest: { email: null, contact_name: null, active: null },
    });
    expect(error).toBeNull();
    expect(await zeile(id)).toMatchObject({ email: 'alt@example.at', contact_name: 'Herr Alt', active: true });
  });

  it('der Name wandert weiter an die Baustellen des Kunden', async () => {
    const id = await kundeAnlegen();
    const nummer = `A2-${id.slice(0, 8)}`;
    const { error: e1 } = await admin.from('projects').insert({
      company_id: BETRIEB, project_number: nummer, status: 'Aktiv', customer_id: id, customer_name: 'A2 Alt',
    });
    if (e1) throw new Error(e1.message);
    const nachgezogen = await updateCustomer(BETRIEB, id, { name: `A2 Umbenannt ${id.slice(0, 6)}`, lieferantennummer: '7' });
    expect(nachgezogen).toBe(1);
    const { data } = await admin.from('projects').select('customer_name').eq('project_number', nummer).eq('company_id', BETRIEB).single();
    expect(data!.customer_name).toBe(`A2 Umbenannt ${id.slice(0, 6)}`);
  });

  it('ohne Anmeldung ist die Funktion nicht aufrufbar', async () => {
    const id = await kundeAnlegen();
    const anonym = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anonym.rpc('kunde_umbenennen', { p_kunde: id, p_name: 'Anonym', p_rest: {} });
    expect(error?.message).toMatch(/permission denied/);
    expect((await zeile(id)).name).not.toBe('Anonym');
  });
});
