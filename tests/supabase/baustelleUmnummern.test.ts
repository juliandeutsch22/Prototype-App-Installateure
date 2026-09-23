/**
 * Die Baustellennummer ändern — alles, was an ihr hängt, geht mit.
 *
 * GEFUNDEN AM 23.09.2026: die Nummer liess sich ändern, die Buchungen
 * blieben auf der alten. Die Baustelle stand danach mit null Stunden da.
 * Geprüft wird hier nicht nur, DASS etwas mitgeht, sondern dass ALLES
 * mitgeht — und dass die Nummer bleibt, sobald sie auf einem Beleg steht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'umnummern-a';
const FREMD = 'umnummern-b';

let leitung: Konto;
let buero: Konto;
let monteur: Konto;
let fremd: Konto;

let zaehler = 0;
const nummer = () => `U-${Date.now()}-${(zaehler += 1)}`;

async function baustelle(nr: string, betrieb = BETRIEB): Promise<string> {
  const { data, error } = await admin.from('projects')
    .insert({ company_id: betrieb, project_number: nr, customer_name: 'Familie Huber', status: 'Aktiv' })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function umnummern(k: Konto, id: string, neu: string) {
  return k.client.rpc('baustelle_umnummern', { p_projekt: id, p_neu: neu });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  leitung = await konto(BETRIEB, 'Projektleiter', 'leitung');
  buero = await konto(BETRIEB, 'Verwaltung', 'buero');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  fremd = await konto(FREMD, 'Geschäftsführung', 'fremd');
}, 120_000);

describe('Die Nummer ändern', () => {
  it('nimmt Buchungen, Einsätze, Rüstliste, Schein-Entwurf, Anforderung, Angebot und Wiedervorlage mit', async () => {
    const alt = nummer();
    const neu = nummer();
    const id = await baustelle(alt);

    const setzen = [
      admin.from('time_entries').insert(buchung(monteur, '2026-09-21', { project_number: alt })),
      admin.from('assignments').insert({ company_id: BETRIEB, date: '2026-09-21', project_number: alt, user_id: monteur.uid }),
      admin.from('einsatz_material').insert({ company_id: BETRIEB, date: '2026-09-21', project_number: alt }),
      admin.from('work_sheets').insert({
        id: crypto.randomUUID(), company_id: BETRIEB, project_number: alt, customer_name: 'Familie Huber',
        datum: '2026-09-21', status: 'Entwurf', abrechnung: 'Regie',
        erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
      }),
      admin.from('material_orders').insert({
        id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Eckventil', quantity: 2,
        project_number: alt, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
      }),
      admin.from('quotes').insert({
        company_id: BETRIEB, quote_number: `AN-${alt}`, customer_name: 'Familie Huber',
        quote_date: '2026-09-01', valid_until: '2026-10-01', status: 'Angenommen', vat_rate: 20,
        project_number: alt,
      }),
      admin.from('follow_ups').insert({ company_id: BETRIEB, title: 'Nachfassen', created_from: 'manual', project_number: alt }),
    ];
    for (const s of setzen) {
      const { error } = await s;
      if (error) throw new Error(error.message);
    }

    const { data, error } = await umnummern(leitung, id, neu);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      geaendert: true, alt, neu,
      bewegt: { buchungen: 1, einsaetze: 1, ruestlisten: 1, scheine: 1, anforderungen: 1, angebote: 1, wiedervorlagen: 1 },
    });

    for (const tabelle of ['time_entries', 'assignments', 'einsatz_material', 'work_sheets', 'material_orders', 'quotes', 'follow_ups']) {
      const aufAlt = await admin.from(tabelle).select('id', { count: 'exact', head: true })
        .eq('company_id', BETRIEB).eq('project_number', alt);
      expect({ tabelle, rest: aufAlt.count }).toEqual({ tabelle, rest: 0 });
      // Und die Kennung zeigt weiterhin auf dieselbe Baustelle.
      const aufNeu = await admin.from(tabelle).select('project_id')
        .eq('company_id', BETRIEB).eq('project_number', neu);
      expect({ tabelle, ids: (aufNeu.data ?? []).map((z) => z.project_id) })
        .toEqual({ tabelle, ids: [id] });
    }
    const p = await admin.from('projects').select('project_number').eq('id', id).single();
    expect(p.data?.project_number).toBe(neu);
  });

  it('lässt eine vergebene Nummer nicht zu', async () => {
    const a = nummer();
    const b = nummer();
    const id = await baustelle(a);
    await baustelle(b);
    const { error } = await umnummern(leitung, id, b);
    expect(error?.message).toMatch(/schon vergeben/);
  });

  it('lässt eine leere Nummer nicht zu', async () => {
    const id = await baustelle(nummer());
    const { error } = await umnummern(leitung, id, '   ');
    expect(error?.message).toMatch(/Ohne Projektnummer/);
  });
});

describe('Wann die Nummer bleibt', () => {
  it('sobald ein Schein unterschrieben ist — und dann bewegt sich GAR NICHTS', async () => {
    const alt = nummer();
    const id = await baustelle(alt);
    await admin.from('time_entries').insert(buchung(monteur, '2026-09-22', { project_number: alt }));
    const { error: e1 } = await admin.from('work_sheets').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, project_number: alt, customer_name: 'Familie Huber',
      datum: '2026-09-22', status: 'Unterschrieben', abrechnung: 'Regie',
      erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
    });
    if (e1) throw new Error(e1.message);

    const { error } = await umnummern(leitung, id, nummer());
    expect(error?.message).toMatch(/steht schon auf Belegen.*unterschriebene/);

    // Alles oder nichts: auch die Buchung ist auf der alten Nummer geblieben.
    const p = await admin.from('projects').select('project_number').eq('id', id).single();
    expect(p.data?.project_number).toBe(alt);
    const b = await admin.from('time_entries').select('id', { count: 'exact', head: true })
      .eq('company_id', BETRIEB).eq('project_number', alt);
    expect(b.count).toBe(1);
  });

  it('sobald eine Rechnung auf der Nummer steht — auch eine stornierte', async () => {
    const alt = nummer();
    const id = await baustelle(alt);
    const { error: e1 } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: `RE-${alt}`, project_number: alt,
      customer_name: 'Familie Huber', invoice_date: '2026-09-20', due_date: '2026-10-04',
      total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Storniert',
    });
    if (e1) throw new Error(e1.message);
    const { error } = await umnummern(leitung, id, nummer());
    expect(error?.message).toMatch(/1 Rechnung/);
  });

  it('sobald eine Buchung verrechnet ist', async () => {
    const alt = nummer();
    const id = await baustelle(alt);
    await admin.from('time_entries').insert(buchung(monteur, '2026-09-23', {
      project_number: alt, is_billed: true, invoice_number: 'RE-TEST',
    }));
    const { error } = await umnummern(leitung, id, nummer());
    expect(error?.message).toMatch(/verrechnete Buchung/);
  });
});

describe('Wer darf', () => {
  it('nicht die Verwaltung, nicht der Monteur — wie beim Ändern der Baustelle', async () => {
    const alt = nummer();
    const id = await baustelle(alt);
    for (const k of [buero, monteur]) {
      const { error } = await umnummern(k, id, nummer());
      expect(error?.message).toMatch(/nur die Leitung/);
    }
    const p = await admin.from('projects').select('project_number').eq('id', id).single();
    expect(p.data?.project_number).toBe(alt);
  });

  it('nicht über die Betriebsgrenze — die fremde Baustelle gibt es für ihn nicht', async () => {
    const alt = nummer();
    const id = await baustelle(alt);
    const { error } = await umnummern(fremd, id, nummer());
    expect(error?.message).toMatch(/gibt es nicht/);
    const p = await admin.from('projects').select('project_number').eq('id', id).single();
    expect(p.data?.project_number).toBe(alt);
  });
});
