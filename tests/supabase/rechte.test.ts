/**
 * STUFE 1 — hält das neue Modell dieselben Zusagen wie firestore.rules?
 *
 * Die Vorgabe für den ganzen Umzug lautet: keine bestehende Funktion darf
 * fehlen oder falsch werden. Für die Zugriffsregeln heisst das, dass sie
 * Regel für Regel nachgewiesen werden müssen — nicht, dass „RLS an ist".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

let perl: Konto;          // Mitarbeiter
let kollege: Konto;       // Mitarbeiter im selben Betrieb
let leitung: Konto;       // Projektleiter
let buch: Konto;          // Buchhaltung
let chef: Konto;          // Geschäftsführung
let huber: Konto;         // fremder Betrieb
let gesperrt: Konto;      // deaktiviertes Konto

beforeAll(async () => {
  await betriebAnlegen('perl', 'Perl Installationen');
  await betriebAnlegen('huber', 'Huber Haustechnik');
  perl = await konto('perl', 'Mitarbeiter', 'monteur');
  kollege = await konto('perl', 'Mitarbeiter', 'kollege');
  leitung = await konto('perl', 'Projektleiter', 'leitung');
  buch = await konto('perl', 'Buchhaltung', 'buch');
  chef = await konto('perl', 'Geschäftsführung', 'chef');
  huber = await konto('huber', 'Mitarbeiter', 'fremd');
  gesperrt = await konto('perl', 'Mitarbeiter', 'gesperrt', false);
}, 120_000);

describe('Die Betriebe sehen einander nicht', () => {
  const tabellen = [
    'customers', 'projects', 'materials', 'suppliers',
    'time_entries', 'vacations', 'assignments', 'work_sheets',
    'material_orders', 'einsatz_material', 'wartungen', 'follow_ups',
  ];

  it('in keiner einzigen Tabelle', async () => {
    // Je Tabelle eine Zeile im Betrieb perl, mit dem Dienstschlüssel angelegt
    // — damit steht der Bestand unabhängig davon, wer was anlegen darf.
    await admin.from('customers').insert({ company_id: 'perl', name: 'Familie Huber' });
    await admin.from('projects').insert({
      company_id: 'perl', project_number: '2026-001', customer_name: 'Familie Huber', status: 'Aktiv',
    });
    await admin.from('materials').insert({ company_id: 'perl', name: 'Kupferrohr 15mm', stock: 10 });
    await admin.from('suppliers').insert({ company_id: 'perl', name: 'Frauenthal' });
    await admin.from('time_entries').insert(buchung(perl, '2026-03-02'));
    await admin.from('vacations').insert({
      company_id: 'perl', user_id: perl.uid, user_name: 'Monteur',
      von: '2026-07-01', bis: '2026-07-14', tage: 10, status: 'Beantragt',
    });
    await admin.from('assignments').insert({
      company_id: 'perl', date: '2026-03-02', project_number: '2026-001', user_id: perl.uid,
    });
    await admin.from('work_sheets').insert({
      id: crypto.randomUUID(), company_id: 'perl', project_number: '2026-001',
      customer_name: 'Familie Huber', datum: '2026-03-02', status: 'Entwurf',
      abrechnung: 'Regie', erstellt_von_uid: perl.uid, erstellt_von_name: 'Monteur',
    });
    await admin.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: 'perl', material_name: 'Kupferrohr',
      quantity: 5, status: 'Offen', transaction_type: 'order', user_id: perl.uid,
    });
    await admin.from('einsatz_material').insert({
      company_id: 'perl', date: '2026-03-02', project_number: '2026-001',
    });
    await admin.from('wartungen').insert({
      company_id: 'perl',
      customer_id: (await admin.from('customers').select('id').eq('company_id', 'perl').limit(1)).data![0].id,
      customer_name: 'Familie Huber', anlage: 'Therme', intervall_monate: 12, faellig_am: '2027-03-01',
    });
    await admin.from('follow_ups').insert({
      company_id: 'perl', title: 'Rückruf', created_from: 'manual',
    });

    const gesehen: string[] = [];
    for (const tabelle of tabellen) {
      const { data, error } = await huber.client.from(tabelle).select('*');
      if (error) throw new Error(`${tabelle}: ${error.message}`);
      if ((data ?? []).length > 0) gesehen.push(tabelle);
    }
    expect(gesehen).toEqual([]);
  });

  it('auch nicht über die Monatsbilanz', async () => {
    // Eine Sicht ist der klassische Weg, an einer Richtlinie vorbeizukommen.
    const eigene = await chef.client.from('monthly_stats').select('*');
    const fremde = await huber.client.from('monthly_stats').select('*');
    expect(eigene.data!.length).toBeGreaterThan(0);
    expect(fremde.data).toEqual([]);
  });
});

describe('Ein deaktiviertes Konto kommt an nichts', () => {
  it('weder lesen noch schreiben', async () => {
    // Das war Befund A aus der Firestore-Zeit: „deaktiviert" war lange nur
    // eine Anzeigeeinstellung, und wer sein Passwort noch hatte, kam mit dem
    // SDK unverändert an alles.
    const gelesen = await gesperrt.client.from('customers').select('*');
    expect(gelesen.data).toEqual([]);

    const geschrieben = await gesperrt.client.from('time_entries')
      .insert(buchung(gesperrt, '2026-03-03'));
    expect(geschrieben.error?.code).toBe('42501');
  });
});

describe('Wer was darf', () => {
  it('ein Mitarbeiter sieht keine Rechnungen und keine Angebote', async () => {
    await admin.from('invoices').insert({
      company_id: 'perl', invoice_number: 'RE-2026-0001', project_number: '2026-001',
      customer_name: 'Familie Huber', invoice_date: '2026-03-05', due_date: '2026-04-04',
      total_netto: 1000, total_vat: 200, total_brutto: 1200, payment_status: 'Offen',
    });
    expect((await perl.client.from('invoices').select('*')).data).toEqual([]);
    expect((await buch.client.from('invoices').select('*')).data!.length).toBeGreaterThan(0);
    expect((await perl.client.from('quotes').select('*')).data).toEqual([]);
  });

  it('ein Mitarbeiter legt keinen Kunden und keine Baustelle an', async () => {
    const kunde = await perl.client.from('customers').insert({ company_id: 'perl', name: 'Neu' });
    expect(kunde.error?.code).toBe('42501');
    const baustelle = await perl.client.from('projects').insert({
      company_id: 'perl', project_number: '2026-999', customer_name: 'Neu', status: 'Aktiv',
    });
    expect(baustelle.error?.code).toBe('42501');
  });

  it('die Führung sehr wohl', async () => {
    const kunde = await leitung.client.from('customers').insert({ company_id: 'perl', name: 'Gasthaus Adler' });
    expect(kunde.error).toBeNull();
  });

  it('ein Mitarbeiter sieht die Buchungen der Kollegen nicht, die Buchhaltung schon', async () => {
    await admin.from('time_entries').insert(buchung(kollege, '2026-03-04'));
    const eigeneSicht = await perl.client.from('time_entries').select('user_id');
    expect(eigeneSicht.data!.every((z) => z.user_id === perl.uid)).toBe(true);

    const buchSicht = await buch.client.from('time_entries').select('user_id');
    expect(new Set(buchSicht.data!.map((z) => z.user_id)).size).toBeGreaterThan(1);
  });

  it('nur die Buchhaltung rührt den Verrechnungsstand an', async () => {
    const eigene = buchung(perl, '2026-03-06');
    await perl.client.from('time_entries').insert(eigene);

    const vomMonteur = await perl.client.from('time_entries')
      .update({ is_billed: true }).eq('id', eigene.id);
    expect(vomMonteur.error?.code).toBe('42501');

    const vonBuch = await buch.client.from('time_entries')
      .update({ is_billed: true, invoice_number: 'RE-2026-0001' }).eq('id', eigene.id);
    expect(vonBuch.error).toBeNull();
  });

  it('niemand schiebt eine Zeile in einen fremden Betrieb', async () => {
    const eigene = buchung(perl, '2026-03-07');
    await perl.client.from('time_entries').insert(eigene);
    const geschoben = await perl.client.from('time_entries')
      .update({ company_id: 'huber' }).eq('id', eigene.id);
    expect(geschoben.error?.code).toBe('42501');
  });

  it('über den eigenen Urlaub entscheidet man nicht selbst', async () => {
    const antrag = {
      id: crypto.randomUUID(), company_id: 'perl', user_id: perl.uid, user_name: 'Monteur',
      von: '2026-08-03', bis: '2026-08-14', tage: 10, status: 'Beantragt',
    };
    await perl.client.from('vacations').insert(antrag);

    const selbst = await perl.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', antrag.id);
    expect(selbst.error?.code).toBe('42501');

    // Zurückziehen darf er ihn.
    const zurueck = await perl.client.from('vacations')
      .update({ status: 'Storniert' }).eq('id', antrag.id);
    expect(zurueck.error).toBeNull();

    // Die Projektleitung SIEHT den Urlaub, entscheidet aber nicht — ohne
    // eigene Festlegung ist das die Buchhaltung. Dieser Test stand in Stufe 1
    // falsch herum: er hat meinen zu groben Trigger beschrieben statt der
    // Regel aus firestore.rules.
    const vonDerLeitung = await leitung.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', antrag.id);
    expect(vonDerLeitung.error?.code).toBe('42501');

    const vonDerBuchhaltung = await buch.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', antrag.id);
    expect(vonDerBuchhaltung.error).toBeNull();
  });
});
