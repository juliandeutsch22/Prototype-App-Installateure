/**
 * Datenauskunft je Person (DSGVO Art. 15) — gegen die echte Datenbank
 * (offene Punkte B8, Teil 1).
 *
 * Geprüft wird, dass alles darin steht, was zur Person gespeichert ist —
 * über jede Tabelle, die die Funktion anfasst, denn plpgsql prüft die
 * Bezüge erst beim Aufruf —, dass nichts einer ANDEREN Person darin steht
 * und dass sie nur die Geschäftsführung des eigenen Betriebs bekommt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin, betriebAnlegen, buchung, einblickBeginnen, konto, plattformkonto, type Konto,
} from './helfer';

const BETRIEB = 'auskunft-b8';
const FREMD = 'auskunft-b8-fremd';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let fremdChef: Konto;
let kunde: string;
let andererKunde: string;

type Auskunft = {
  art: string;
  person: string;
  daten: Record<string, unknown>;
  anzahl: Record<string, number>;
  als_bearbeiter?: Record<string, number>;
};

async function auskunft(wer: Konto, art: string, id: string, maxBytes?: number) {
  const { data, error } = await wer.client.rpc('person_auskunft', {
    p_art: art, p_id: id, ...(maxBytes ? { p_max_bytes: maxBytes } : {}),
  });
  return { a: data as Auskunft | null, fehler: error };
}

/** Eine Rechnung mit den Pflichtangaben; nur was den Kunden betrifft, ändert sich. */
const rechnungZeile = (felder: Record<string, unknown>) => ({
  company_id: BETRIEB, project_number: 'B-AK-1', due_date: '2099-03-01', vat_rate: 20,
  total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen', ...felder,
});

async function einfuegen(tabelle: string, zeile: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(tabelle).insert(zeile).select('id').single();
  if (error) throw new Error(`${tabelle}: ${error.message}`);
  return (data as { id: string }).id;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Auskunft GmbH');
  await betriebAnlegen(FREMD, 'Fremd GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'akchef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'akbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'akmon');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'akfremd');
  await admin.from('users').update({ name: 'Max Monteur' }).eq('id', monteur.uid);

  kunde = await einfuegen('customers', {
    company_id: BETRIEB, name: 'Familie Auskunft', email: 'auskunft@example.at', contact_phone: '0664 1',
  });
  andererKunde = await einfuegen('customers', { company_id: BETRIEB, name: 'Familie Andere' });
  await einfuegen('projects', {
    company_id: BETRIEB, project_number: 'B-AK-1', customer_id: kunde, customer_name: 'Familie Auskunft',
    status: 'Aktiv', assigned_employees: [monteur.uid], project_managers: [chef.uid],
  });

  // Die Belegschaft
  await einfuegen('time_entries', buchung(monteur, '2099-02-02', { project_number: 'B-AK-1' }));
  await einfuegen('vacations', {
    company_id: BETRIEB, user_id: monteur.uid, user_name: 'Max Monteur', von: '2099-03-02', bis: '2099-03-03',
    tage: 2, status: 'Genehmigt', entschieden_von_uid: chef.uid, entschieden_von_name: 'Chef',
  });
  await einfuegen('krankmeldungen', {
    company_id: BETRIEB, user_id: monteur.uid, user_name: 'Max Monteur', von: '2099-04-01', bis: '2099-04-02',
    gemeldet_von_uid: chef.uid, gemeldet_von_name: 'Chef',
  });
  await einfuegen('assignments', {
    company_id: BETRIEB, date: '2099-02-02', project_number: 'B-AK-1', user_id: monteur.uid, user_name: 'Max Monteur',
  });
  await admin.from('user_prefs').upsert({ user_id: monteur.uid, company_id: BETRIEB, push_tokens: ['geheim-1', 'geheim-2'] });

  // Der Kunde
  const angebot = await einfuegen('quotes', {
    company_id: BETRIEB, quote_number: 'AN-AK-1', customer_id: kunde, customer_name: 'Familie Auskunft',
    quote_date: '2099-01-10', valid_until: '2099-02-10', status: 'Angenommen', vat_rate: 20,
  });
  await einfuegen('quote_lines', {
    company_id: BETRIEB, quote_id: angebot, position: 0, label: 'Therme tauschen', qty: 1, unit: 'Stk',
    unit_price: 100, netto: 100, ist_arbeitszeit: false,
  });
  const rechnung = await einfuegen('invoices', rechnungZeile({
    invoice_number: 'RE-AK-1', customer_id: kunde, customer_name: 'Familie Auskunft', invoice_date: '2099-02-15',
  }));
  await einfuegen('invoice_lines', {
    company_id: BETRIEB, invoice_id: rechnung, position: 0, label: 'Therme', qty: 1, unit: 'Stk', unit_price: 100, netto: 100,
  });
  await einfuegen('zahlungseingaenge', {
    company_id: BETRIEB, invoice_id: rechnung, datum: '2099-02-20', betrag: 50, art: 'Überweisung',
    erfasst_von: chef.uid, erfasst_von_name: 'Chef',
  });
  // Aus einer frühen Fassung: nur der Name, keine Kennung.
  await einfuegen('invoices', rechnungZeile({
    invoice_number: 'RE-AK-0', customer_name: 'familie auskunft ', invoice_date: '2099-01-15',
  }));
  await einfuegen('invoices', rechnungZeile({
    invoice_number: 'RE-AK-X', customer_id: andererKunde, customer_name: 'Familie Andere', invoice_date: '2099-01-20',
  }));
  const schein = await einfuegen('work_sheets', {
    id: crypto.randomUUID(), abrechnung: 'Regie', company_id: BETRIEB, project_number: 'B-AK-1', customer_id: kunde, customer_name: 'Familie Auskunft',
    datum: '2099-02-02', status: 'Entwurf', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max Monteur',
    unterschrift_monteur: { bild: 'monteur-strich' }, unterschrift_kunde: { bild: 'kunde-strich' },
  });
  await einfuegen('work_sheet_hours', {
    company_id: BETRIEB, work_sheet_id: schein, position: 0, datum: '2099-02-02', mitarbeiter: 'Max Monteur',
    von: '07:00', bis: '11:00', pause_min: 0, minuten: 240, taetigkeit: 'Therme',
  });
  await einfuegen('wartungen', {
    company_id: BETRIEB, customer_id: kunde, customer_name: 'Familie Auskunft', anlage: 'Therme',
    intervall_monate: 12, faellig_am: '2100-02-02',
  });
}, 180_000);

afterAll(async () => {
  for (const b of [BETRIEB, FREMD]) {
    await admin.from('support_zugriffe').delete().eq('company_id', b);
    await admin.from('support_freigaben').delete().eq('company_id', b);
  }
});

describe('Die Auskunft über eine Person der Belegschaft', () => {
  it('enthält, was zu ihr gespeichert ist', async () => {
    const { a, fehler } = await auskunft(chef, 'mitarbeiter', monteur.uid);
    expect(fehler).toBeNull();
    expect(a!.art).toBe('mitarbeiter');
    expect(a!.person).toBe('Max Monteur');
    expect(a!.anzahl).toMatchObject({
      zeitbuchungen: 1, urlaube_und_zeitausgleich: 1, krankmeldungen: 1, einsaetze: 1,
      baustellen: 1, scheine_erstellt: 1, stunden_auf_scheinen: 1, konto: 1, anmeldung: 1,
    });
    expect((a!.daten.anmeldung as { anmeldename: string }).anmeldename).toContain('akmon');
    expect(a!.daten.baustellen).toEqual([{ baustelle: 'B-AK-1', als: 'Team' }]);
  });

  it('nennt die Geräte für Mitteilungen nur mit ihrer Zahl', async () => {
    const { a } = await auskunft(chef, 'mitarbeiter', monteur.uid);
    const text = JSON.stringify(a);
    expect(text).not.toContain('geheim-1');
    expect(a!.daten.einstellungen).toMatchObject({ geraete_fuer_mitteilungen: 2 });
  });

  it('bei dem, was sie für andere bearbeitet hat, nur die Anzahl', async () => {
    const { a } = await auskunft(chef, 'mitarbeiter', chef.uid);
    expect(a!.als_bearbeiter).toMatchObject({
      urlaube_entschieden: 1, krankmeldungen_eingetragen: 1, zahlungen_erfasst: 1,
    });
    // Die Gegenprobe: der Urlaub selbst ist der des Monteurs, nicht ihrer.
    expect(a!.daten.urlaube_und_zeitausgleich).toEqual([]);
    expect(JSON.stringify(a)).not.toContain('Max Monteur');
  });
});

describe('Die Auskunft über einen Kunden', () => {
  it('enthält Stammdaten, Baustellen, Angebote, Rechnungen samt Zahlungen, Scheine und Wartungen', async () => {
    const { a, fehler } = await auskunft(chef, 'kunde', kunde);
    expect(fehler).toBeNull();
    expect(a!.anzahl).toMatchObject({
      stammdaten: 1, baustellen: 1, angebote: 1, rechnungen: 2, scheine: 1, wartungen: 1,
    });
    const rechnungen = a!.daten.rechnungen as { invoice_number: string; positionen: unknown[]; zahlungen: unknown[] }[];
    expect(rechnungen.map((r) => r.invoice_number)).toEqual(['RE-AK-0', 'RE-AK-1']);
    expect(rechnungen[1].positionen).toHaveLength(1);
    expect(rechnungen[1].zahlungen).toEqual([{ datum: '2099-02-20', betrag: 50, art: 'Überweisung', hinweis: null }]);
    expect((a!.daten.angebote as { positionen: unknown[] }[])[0].positionen).toHaveLength(1);
  });

  it('ohne die Daten anderer: keine fremde Rechnung, keine Monteurkennungen, keine Monteurunterschrift', async () => {
    const { a } = await auskunft(chef, 'kunde', kunde);
    const text = JSON.stringify(a);
    expect(text).not.toContain('RE-AK-X');
    expect(text).not.toContain(monteur.uid);
    expect(text).not.toContain('monteur-strich');
    // Die Gegenprobe: die eigene Unterschrift und die Stunden am Beleg stehen darin.
    expect(text).toContain('kunde-strich');
    const [schein] = a!.daten.scheine as { stunden: { mitarbeiter: string }[] }[];
    expect(schein.stunden[0].mitarbeiter).toBe('Max Monteur');
  });
});

describe('Wer sie bekommt', () => {
  it('nicht die Buchhaltung und nicht die Person selbst — die Geschäftsführung gibt sie weiter', async () => {
    for (const k of [buch, monteur]) {
      const { a, fehler } = await auskunft(k, 'mitarbeiter', monteur.uid);
      expect(a).toBeNull();
      expect(fehler?.code).toBe('42501');
    }
  });

  it('nicht ein fremder Betrieb — für ihn gibt es die Person nicht', async () => {
    const { a, fehler } = await auskunft(fremdChef, 'mitarbeiter', monteur.uid);
    expect(a).toBeNull();
    expect(fehler?.code).toBe('P0002');
    const k = await auskunft(fremdChef, 'kunde', kunde);
    expect(k.fehler?.code).toBe('P0002');
  });

  it('nicht der Support, auch nicht mit „mitarbeiten"', async () => {
    const plattform = await plattformkonto('akplatt');
    const { data: f } = await chef.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chef.uid, grund: 'Hilfe', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    await einblickBeginnen(plattform, BETRIEB, (f as { id: string }).id);
    const { a, fehler } = await auskunft(plattform, 'mitarbeiter', monteur.uid);
    expect(a).toBeNull();
    expect(fehler?.code).toBe('42501');
  });
});

describe('Grenzen', () => {
  it('bricht über der Grössengrenze mit einer klaren Meldung ab', async () => {
    const { fehler } = await auskunft(chef, 'kunde', kunde, 200);
    expect(fehler?.code).toBe('54000');
    expect(fehler?.message).toMatch(/zu groß/);
  });

  it('kennt nur Belegschaft und Kunden', async () => {
    const { fehler } = await auskunft(chef, 'lieferant', kunde);
    expect(fehler?.code).toBe('22023');
  });
});
