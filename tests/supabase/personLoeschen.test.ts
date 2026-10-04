/**
 * Löschen je Person (DSGVO Art. 17) — gegen die echte Datenbank (offene
 * Punkte B8, Teil 2).
 *
 * Geprüft wird beides: was sofort geht, ist danach weg — und was
 * aufbewahrt werden muss, steht danach noch da, mit dem Datum, bis zu dem
 * es bleibt. Dazu der Probelauf, der nichts anfasst, und wer es darf.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'loeschen-b8';
const FREMD = 'loeschen-b8-fremd';

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let kollege: Konto;
let fremdChef: Konto;
let baustelle: string;

type Bericht = {
  art: string;
  geloescht: boolean;
  ganz: boolean;
  sofort: Record<string, number>;
  aufbewahren: { was: string; anzahl: number; bis: string; grund: string }[];
};

async function loeschen(wer: Konto, art: string, id: string, nurPruefen = true) {
  const { data, error } = await wer.client.rpc('person_loeschen', {
    p_art: art, p_id: id, p_nur_pruefen: nurPruefen,
  });
  return { b: data as Bericht | null, fehler: error };
}

async function einfuegen(tabelle: string, zeile: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(tabelle).insert(zeile).select('id').single();
  if (error) throw new Error(`${tabelle}: ${error.message}`);
  return (data as { id: string }).id;
}

const zaehle = async (tabelle: string, spalte: string, wert: string) => {
  const { count } = await admin.from(tabelle).select('*', { count: 'exact', head: true }).eq(spalte, wert);
  return count ?? 0;
};

const rechnung = (felder: Record<string, unknown>) => ({
  company_id: BETRIEB, project_number: 'B-LO-1', invoice_date: '2099-02-15', due_date: '2099-03-01',
  vat_rate: 20, total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen', ...felder,
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Löschen GmbH');
  await betriebAnlegen(FREMD, 'Fremd GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'lochef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'lobuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'lomon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'lokol');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'lofremd');

  baustelle = await einfuegen('projects', {
    company_id: BETRIEB, project_number: 'B-LO-1', customer_name: 'Irgendwer', status: 'Aktiv',
    assigned_employees: [monteur.uid, kollege.uid], project_managers: [monteur.uid],
  });
  await einfuegen('time_entries', buchung(monteur, '2099-02-02', { project_number: 'B-LO-1' }));
  await einfuegen('krankmeldungen', {
    company_id: BETRIEB, user_id: monteur.uid, user_name: 'M', von: '2099-04-01', bis: '2099-04-02',
  });
  await einfuegen('assignments', {
    company_id: BETRIEB, date: '2099-02-02', project_number: 'B-LO-1', user_id: monteur.uid,
  });
  await einfuegen('assignments', {
    company_id: BETRIEB, date: '2099-02-02', project_number: 'B-LO-1', user_id: kollege.uid,
  });
  await einfuegen('einsatz_material', {
    company_id: BETRIEB, date: '2099-02-02', project_number: 'B-LO-1', uids: [monteur.uid, kollege.uid],
  });
  await admin.from('user_prefs').upsert({ user_id: monteur.uid, company_id: BETRIEB, push_tokens: ['t'] });
  // Die Kennung setzt ein Auslöser aus der Anmeldung — also schreibt der Monteur selbst.
  const { error } = await monteur.client.from('fehlerprotokoll').insert({ company_id: BETRIEB, art: 'fehler', nachricht: 'Absturz' });
  if (error) throw new Error(`fehlerprotokoll: ${error.message}`);
}, 180_000);

describe('Eine Person der Belegschaft', () => {
  it('muss zuerst deaktiviert sein', async () => {
    const { b, fehler } = await loeschen(chef, 'mitarbeiter', monteur.uid);
    expect(b).toBeNull();
    expect(fehler?.code).toBe('55000');
  });

  it('der Probelauf nennt, was geht und was bleibt — und fasst nichts an', async () => {
    await admin.from('users').update({ active: false }).eq('id', monteur.uid);
    const { b, fehler } = await loeschen(chef, 'mitarbeiter', monteur.uid);
    expect(fehler).toBeNull();
    expect(b!.geloescht).toBe(false);
    expect(b!.sofort).toEqual({ einstellungen: 1, fehlerprotokoll: 1, einsaetze: 1, ruestlisten: 1, baustellen: 1, termine: 0 });
    expect(b!.aufbewahren).toEqual([
      { was: 'Zeitbuchungen', anzahl: 1, bis: '2106-12-31', grund: expect.stringContaining('§ 132 BAO') },
      { was: 'Krankmeldungen', anzahl: 1, bis: '2106-12-31', grund: expect.stringContaining('§ 132 BAO') },
      // Entsteht aus der Zeitbuchung (Auslöser der Monatsbilanz) und ist Lohnunterlage wie sie.
      { was: 'Monatsbilanzen', anzahl: 1, bis: '2106-12-31', grund: expect.stringContaining('§ 132 BAO') },
    ]);
    expect(await zaehle('assignments', 'user_id', monteur.uid)).toBe(1);
    expect(await zaehle('user_prefs', 'user_id', monteur.uid)).toBe(1);
  });

  it('löscht die Planung und die Einstellungen — Zeiten und Krankmeldungen bleiben', async () => {
    const { b, fehler } = await loeschen(chef, 'mitarbeiter', monteur.uid, false);
    expect(fehler).toBeNull();
    expect(b!.geloescht).toBe(true);
    for (const t of ['assignments', 'user_prefs', 'fehlerprotokoll']) {
      expect({ t, n: await zaehle(t, 'user_id', monteur.uid) }).toEqual({ t, n: 0 });
    }
    const { data: bau } = await admin.from('projects')
      .select('assigned_employees, project_managers').eq('id', baustelle).single();
    expect(bau).toEqual({ assigned_employees: [kollege.uid], project_managers: [] });
    const { data: ruest } = await admin.from('einsatz_material').select('uids').eq('project_number', 'B-LO-1').single();
    expect(ruest).toEqual({ uids: [kollege.uid] });

    // Die Gegenprobe: was aufbewahrt werden muss, und was dem Kollegen gehört.
    expect(await zaehle('time_entries', 'user_id', monteur.uid)).toBe(1);
    expect(await zaehle('krankmeldungen', 'user_id', monteur.uid)).toBe(1);
    expect(await zaehle('users', 'id', monteur.uid)).toBe(1);
    expect(await zaehle('assignments', 'user_id', kollege.uid)).toBe(1);
  });
});

describe('Ein Kunde', () => {
  it('mit Belegen: Wartungen und Kontaktdaten gehen, Belege bleiben, der Kunde wird inaktiv', async () => {
    const kunde = await einfuegen('customers', {
      company_id: BETRIEB, name: 'Familie Beleg', email: 'beleg@example.at', contact_phone: '0664 2', notes: 'Hund',
    });
    const bau = await einfuegen('projects', {
      company_id: BETRIEB, project_number: 'B-LO-2', customer_id: kunde, customer_name: 'Familie Beleg',
      status: 'Aktiv', contact_name: 'Frau Beleg', contact_phone: '0664 3',
    });
    await einfuegen('invoices', rechnung({ invoice_number: 'RE-LO-1', customer_id: kunde, customer_name: 'Familie Beleg' }));
    await einfuegen('wartungen', {
      company_id: BETRIEB, customer_id: kunde, customer_name: 'Familie Beleg', anlage: 'Therme',
      intervall_monate: 12, faellig_am: '2100-01-01',
    });

    const probe = await loeschen(chef, 'kunde', kunde);
    expect(probe.b!.ganz).toBe(false);
    expect(probe.b!.sofort).toEqual({ wartungen: 1, kontaktdaten: 2, termine: 0 });
    expect(probe.b!.aufbewahren.map((a) => [a.was, a.anzahl, a.bis])).toEqual([
      ['Rechnungen samt Zahlungen', 1, '2106-12-31'],
      ['Baustellen mit Name und Adresse', 1, expect.stringMatching(/-12-31$/)],
    ]);
    expect(await zaehle('wartungen', 'customer_id', kunde)).toBe(1);

    await loeschen(chef, 'kunde', kunde, false);
    expect(await zaehle('wartungen', 'customer_id', kunde)).toBe(0);
    const { data: k } = await admin.from('customers')
      .select('name, email, contact_phone, notes, active').eq('id', kunde).single();
    expect(k).toEqual({ name: 'Familie Beleg', email: null, contact_phone: null, notes: null, active: false });
    const { data: b } = await admin.from('projects').select('contact_name, contact_phone').eq('id', bau).single();
    expect(b).toEqual({ contact_name: null, contact_phone: null });
    expect(await zaehle('invoices', 'customer_id', kunde)).toBe(1);
  });

  it('ohne Belege geht ganz', async () => {
    const kunde = await einfuegen('customers', { company_id: BETRIEB, name: 'Familie Ohne', email: 'o@example.at' });
    await einfuegen('wartungen', {
      company_id: BETRIEB, customer_id: kunde, customer_name: 'Familie Ohne', anlage: 'Therme',
      intervall_monate: 12, faellig_am: '2100-01-01',
    });
    const { b } = await loeschen(chef, 'kunde', kunde, false);
    expect(b!.ganz).toBe(true);
    expect(await zaehle('customers', 'id', kunde)).toBe(0);
    expect(await zaehle('wartungen', 'customer_id', kunde)).toBe(0);
  });

  it('ein Beleg nur über den Namen hält ihn gesperrt — und bleibt selbst unberührt', async () => {
    const kunde = await einfuegen('customers', { company_id: BETRIEB, name: 'Familie Namensgleich' });
    const alt = await einfuegen('invoices', rechnung({ invoice_number: 'RE-LO-ALT', customer_name: 'familie namensgleich' }));
    const { b } = await loeschen(chef, 'kunde', kunde, false);
    expect(b!.ganz).toBe(false);
    expect(await zaehle('customers', 'id', kunde)).toBe(1);
    const { data } = await admin.from('invoices').select('customer_name').eq('id', alt).single();
    expect(data).toEqual({ customer_name: 'familie namensgleich' });
  });
});

describe('Wer löschen darf', () => {
  it('nicht die Buchhaltung — und für einen fremden Betrieb gibt es die Person nicht', async () => {
    const vorher = await zaehle('time_entries', 'user_id', monteur.uid);
    const a = await loeschen(buch, 'mitarbeiter', monteur.uid, false);
    expect(a.fehler?.code).toBe('42501');
    const f = await loeschen(fremdChef, 'mitarbeiter', monteur.uid, false);
    expect(f.fehler?.code).toBe('P0002');
    expect(await zaehle('time_entries', 'user_id', monteur.uid)).toBe(vorher);
  });
});
