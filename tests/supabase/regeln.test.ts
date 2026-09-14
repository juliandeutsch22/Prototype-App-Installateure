/**
 * STUFE 2 — die 155 Regelprüfungen, portiert.
 *
 * Diese Datei ist die Übersetzung von `tests/firestore.rules.test.ts`. Sie
 * trägt dieselben Blöcke und dieselben Titel, damit sich beide Seiten
 * nebeneinander lesen lassen — und damit `vollstaendigkeit.test.ts`
 * maschinell prüfen kann, dass keine Prüfung beim Umzug unter den Tisch
 * gefallen ist.
 *
 * Nicht neu erfunden, nicht gekürzt. Wo eine Prüfung hier anders aussieht als
 * dort, steht der Grund daneben.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, betriebAnlegen, konto, buchung, API, ANON, type Konto } from './helfer';

let a: Konto;            // Firma A, Mitarbeiter
let aKollege: Konto;
let aLeitung: Konto;     // Projektleiter
let aVerwaltung: Konto;
let aBuch: Konto;
let aChef: Konto;        // Geschäftsführung
let aAdmin: Konto;       // Administrator
let b: Konto;            // Firma B, Mitarbeiter
let aus: Konto;          // deaktiviertes Konto in Firma A

let kundeA: string;
let baustelleA: string;

beforeAll(async () => {
  await betriebAnlegen('firma-a', 'Firma A');
  await betriebAnlegen('firma-b', 'Firma B');
  a = await konto('firma-a', 'Mitarbeiter', 'monteur');
  aKollege = await konto('firma-a', 'Mitarbeiter', 'kollege');
  aLeitung = await konto('firma-a', 'Projektleiter', 'leitung');
  aVerwaltung = await konto('firma-a', 'Verwaltung', 'verwaltung');
  aBuch = await konto('firma-a', 'Buchhaltung', 'buch');
  aChef = await konto('firma-a', 'Geschäftsführung', 'chef');
  aAdmin = await konto('firma-a', 'Administrator', 'admin');
  b = await konto('firma-b', 'Mitarbeiter', 'fremd');
  aus = await konto('firma-a', 'Mitarbeiter', 'deaktiviert', false);

  const k = await admin.from('customers')
    .insert({ company_id: 'firma-a', name: 'Familie Berger' }).select('id').single();
  kundeA = k.data!.id;
  const p = await admin.from('projects').insert({
    company_id: 'firma-a', project_number: '2026-001',
    customer_id: kundeA, customer_name: 'Familie Berger', status: 'Aktiv',
  }).select('id').single();
  baustelleA = p.data!.id;
}, 180_000);

describe('Mandanten-Isolation', () => {
  it('Firma A darf eigene Projekte lesen', async () => {
    const { data } = await a.client.from('projects').select('id');
    expect(data!.map((r) => r.id)).toContain(baustelleA);
  });

  it('Firma B darf KEIN Projekt von Firma A lesen', async () => {
    const { data } = await b.client.from('projects').select('id');
    expect(data).toEqual([]);
  });

  it('Firma B darf KEINEN Zeiteintrag von Firma A lesen', async () => {
    await admin.from('time_entries').insert(buchung(a, '2026-01-07'));
    const { data } = await b.client.from('time_entries').select('id');
    expect(data).toEqual([]);
  });

  it('Firma B darf KEIN Firmendokument von Firma A lesen', async () => {
    const { data } = await b.client.from('companies').select('id');
    expect(data!.map((r) => r.id)).not.toContain('firma-a');
  });

  it('Nicht angemeldet: kein Zugriff', async () => {
    // Abgewiesen wird seit dem 14.09.2026 nicht mehr erst vom Zeilenschutz,
    // sondern schon am Tabellenrecht — `anon` hat keines mehr. Warum, steht
    // in `20260914090000_anon_zumachen.sql`.
    const ohne = createClient(API, ANON, { auth: { persistSession: false } });
    for (const tabelle of ['projects', 'time_entries', 'companies']) {
      const { data, error } = await ohne.from(tabelle).select('id');
      expect({ tabelle, data }).toEqual({ tabelle, data: null });
      expect({ tabelle, code: error?.code }).toEqual({ tabelle, code: '42501' });
    }
  });
});

describe('Schreibregeln', () => {
  it('Mitarbeiter darf eigenen Zeiteintrag mit eigener companyId anlegen', async () => {
    const { error } = await a.client.from('time_entries').insert(buchung(a, '2026-01-08'));
    expect(error).toBeNull();
  });

  it('Mitarbeiter darf KEINEN Eintrag mit fremder companyId schreiben', async () => {
    const { error } = await a.client.from('time_entries')
      .insert({ ...buchung(a, '2026-01-09'), company_id: 'firma-b' });
    expect(error?.code).toBe('42501');
  });

  it('Mitarbeiter darf KEINEN Zeiteintrag für einen anderen Nutzer anlegen', async () => {
    const { error } = await a.client.from('time_entries')
      .insert({ ...buchung(a, '2026-01-10'), user_id: aKollege.uid });
    expect(error?.code).toBe('42501');
  });

  it('Mitarbeiter darf KEIN Projekt anlegen (nur Leitung)', async () => {
    const { error } = await a.client.from('projects').insert({
      company_id: 'firma-a', project_number: '2026-900', customer_name: 'X', status: 'Aktiv',
    });
    expect(error?.code).toBe('42501');
  });

  it('Administrator der Firma A darf ein Projekt anlegen', async () => {
    const { error } = await aAdmin.client.from('projects').insert({
      company_id: 'firma-a', project_number: '2026-002', customer_name: 'X', status: 'Aktiv',
    });
    expect(error).toBeNull();
  });

  it('Mitarbeiter darf KEINE Rechnung lesen', async () => {
    await admin.from('invoices').insert({
      company_id: 'firma-a', invoice_number: 'RE-2026-0001', project_number: '2026-001',
      customer_name: 'Familie Berger', invoice_date: '2026-01-15', due_date: '2026-02-14',
      total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
    });
    expect((await a.client.from('invoices').select('id')).data).toEqual([]);
  });

  it('Administrator darf KEINEN Benutzer mit unbekannter Rolle anlegen', async () => {
    // In Firestore prüfte das validRole(); hier ist es eine Bedingung der
    // Spalte. Beides weist dieselbe Zeile ab, nur mit anderem Fehlercode.
    const { data } = await admin.auth.admin.createUser({
      email: `unbekannt-${crypto.randomUUID().slice(0, 8)}@firma-a.test`,
      password: 'egal-123456', email_confirm: true,
    });
    const { error } = await aAdmin.client.from('users').insert({
      id: data!.user!.id, company_id: 'firma-a', name: 'Seltsam',
      email: 'seltsam@firma-a.test', role: 'Chefsekretär',
    });
    expect(error).not.toBeNull();
  });

  it('Mitarbeiter darf den Zeiteintrag eines KOLLEGEN nicht lesen', async () => {
    await admin.from('time_entries').insert(buchung(aKollege, '2026-01-11'));
    const { data } = await a.client.from('time_entries').select('user_id');
    expect(data!.every((r) => r.user_id === a.uid)).toBe(true);
  });

  it('Mitarbeiter darf den EIGENEN Zeiteintrag lesen', async () => {
    const eigen = buchung(a, '2026-01-12');
    await a.client.from('time_entries').insert(eigen);
    const { data } = await a.client.from('time_entries').select('id').eq('id', eigen.id);
    expect(data).toHaveLength(1);
  });

  it('Buchhaltung darf fremde Zeiteinträge lesen (Lohnverrechnung)', async () => {
    const { data } = await aBuch.client.from('time_entries').select('user_id');
    expect(new Set(data!.map((r) => r.user_id)).size).toBeGreaterThan(1);
  });

  it('Mitarbeiter darf die Bestellung eines Kollegen nicht lesen', async () => {
    await admin.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: 'firma-a', material_name: 'Dichtung',
      quantity: 3, status: 'Offen', transaction_type: 'order', user_id: aKollege.uid,
    });
    const { data } = await a.client.from('material_orders').select('user_id');
    expect(data!.every((r) => r.user_id === a.uid)).toBe(true);
  });

  it('Administrator darf einen Benutzer mit gültiger Rolle anlegen', async () => {
    const { data } = await admin.auth.admin.createUser({
      email: `neu-${crypto.randomUUID().slice(0, 8)}@firma-a.test`,
      password: 'egal-123456', email_confirm: true,
    });
    const { error } = await aAdmin.client.from('users').insert({
      id: data!.user!.id, company_id: 'firma-a', name: 'Neu',
      email: `neu-${data!.user!.id.slice(0, 8)}@firma-a.test`, role: 'Mitarbeiter',
    });
    expect(error).toBeNull();
  });
});

describe('Firmen-Stammdaten und Verrechnungssätze', () => {
  it('Geschäftsführung darf die Sätze der eigenen Firma ändern', async () => {
    const { error } = await aChef.client.from('companies')
      .update({ rates: { fach: 75, helper: 55, vatRate: 20 } }).eq('id', 'firma-a');
    expect(error).toBeNull();
  });

  it('Mitarbeiter darf die Sätze NICHT ändern', async () => {
    const { error, data } = await a.client.from('companies')
      .update({ rates: { fach: 1 } }).eq('id', 'firma-a').select();
    // Ohne Richtlinie trifft der Befehl keine Zeile: kein Fehler, keine Wirkung.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
    const { data: nachher } = await aChef.client.from('companies')
      .select('rates').eq('id', 'firma-a').single();
    expect((nachher!.rates as { fach: number }).fach).toBe(75);
  });

  it('Firma B darf die Sätze von Firma A NICHT ändern', async () => {
    const { data } = await b.client.from('companies')
      .update({ rates: { fach: 1 } }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });

  it('Auch die Leitung darf ihre Firma nicht löschen', async () => {
    await aChef.client.from('companies').delete().eq('id', 'firma-a');
    const { data } = await aChef.client.from('companies').select('id').eq('id', 'firma-a');
    expect(data).toHaveLength(1);
  });
});

describe('userPrefs — persönliche Einstellungen und Push-Tokens', () => {
  it('darf das eigene Dokument anlegen und lesen', async () => {
    const { error } = await a.client.from('user_prefs').insert({
      user_id: a.uid, company_id: 'firma-a', notify_new_order: true, push_tokens: ['abc'],
    });
    expect(error).toBeNull();
    const { data } = await a.client.from('user_prefs').select('*');
    expect(data).toHaveLength(1);
  });

  it('darf das Dokument eines KOLLEGEN nicht lesen', async () => {
    await admin.from('user_prefs').insert({
      user_id: aKollege.uid, company_id: 'firma-a', push_tokens: ['geheim'],
    });
    const { data } = await a.client.from('user_prefs').select('user_id');
    expect(data!.every((r) => r.user_id === a.uid)).toBe(true);
  });

  it('darf sich kein Token in ein fremdes Dokument schreiben', async () => {
    const { data } = await a.client.from('user_prefs')
      .update({ push_tokens: ['eingeschmuggelt'] }).eq('user_id', aKollege.uid).select();
    expect(data ?? []).toEqual([]);
  });

  it('auch der Administrator kommt nicht an fremde Tokens', async () => {
    // Push-Marken sind Geräte, keine Betriebsdaten. Ein Vorgesetzter hat hier
    // nichts zu suchen.
    const { data } = await aAdmin.client.from('user_prefs').select('user_id');
    expect(data!.every((r) => r.user_id === aAdmin.uid)).toBe(true);
  });

  it('Firma B kommt nicht an Einstellungen aus Firma A', async () => {
    const { data } = await b.client.from('user_prefs').select('user_id');
    expect(data).toEqual([]);
  });

  it('niemand darf Einstellungen loeschen', async () => {
    // Gelöscht wird nicht — die Einstellungen gehören zum Konto, und ein
    // gelöschtes Konto räumt sie per Fremdschlüssel selbst weg.
    await a.client.from('user_prefs').delete().eq('user_id', a.uid);
    const { data } = await a.client.from('user_prefs').select('user_id').eq('user_id', a.uid);
    expect(data).toHaveLength(1);
  });
});

describe('Projektleitung — wie die Leitung, aber ohne Zeitkonten', () => {
  it('darf Baustellen anlegen', async () => {
    const { error } = await aLeitung.client.from('projects').insert({
      company_id: 'firma-a', project_number: '2026-003', customer_name: 'Y', status: 'Aktiv',
    });
    expect(error).toBeNull();
  });

  it('darf Material pflegen', async () => {
    const { error } = await aLeitung.client.from('materials')
      .insert({ company_id: 'firma-a', name: 'Muffe 22mm', stock: 40 });
    expect(error).toBeNull();
  });

  it('darf FREMDE Zeiteintraege NICHT lesen', async () => {
    const { data } = await aLeitung.client.from('time_entries').select('user_id');
    expect(data!.every((r) => r.user_id === aLeitung.uid)).toBe(true);
  });

  it('darf fremde Zeiteintraege auch nicht anlegen', async () => {
    const { error } = await aLeitung.client.from('time_entries')
      .insert({ ...buchung(aLeitung, '2026-01-20'), user_id: a.uid });
    expect(error?.code).toBe('42501');
  });

  it('darf die eigene Zeit sehr wohl buchen', async () => {
    const { error } = await aLeitung.client.from('time_entries')
      .insert(buchung(aLeitung, '2026-01-21'));
    expect(error).toBeNull();
  });
});

describe('Administratoren verwaltet nur ein Administrator', () => {
  async function kontoOhneZeile(): Promise<string> {
    const { data } = await admin.auth.admin.createUser({
      email: `frisch-${crypto.randomUUID().slice(0, 8)}@firma-a.test`,
      password: 'egal-123456', email_confirm: true,
    });
    return data!.user!.id;
  }

  it('Geschaeftsfuehrung darf KEINEN Administrator anlegen', async () => {
    const uid = await kontoOhneZeile();
    const { error } = await aChef.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'Möchtegern',
      email: `m-${uid.slice(0, 8)}@firma-a.test`, role: 'Administrator',
    });
    expect(error?.code).toBe('42501');
  });

  it('Geschaeftsfuehrung darf einen bestehenden Administrator nicht aendern', async () => {
    const { error } = await aChef.client.from('users')
      .update({ name: 'Umbenannt' }).eq('id', aAdmin.uid);
    expect(error?.code).toBe('42501');
  });

  it('Administrator darf einen Administrator anlegen', async () => {
    const uid = await kontoOhneZeile();
    const { error } = await aAdmin.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'Zweiter Admin',
      email: `z-${uid.slice(0, 8)}@firma-a.test`, role: 'Administrator',
    });
    expect(error).toBeNull();
  });

  it('Geschaeftsfuehrung darf weiterhin normale Rollen vergeben', async () => {
    const uid = await kontoOhneZeile();
    const { error } = await aChef.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'Normal',
      email: `n-${uid.slice(0, 8)}@firma-a.test`, role: 'Verwaltung',
    });
    expect(error).toBeNull();
  });
});

describe('Rechnungszaehler — monoton und nur fuer Abrechnende', () => {
  /*
    RECHNUNGEN BEGINNEN BEI 1001, Angebote bei 1. „RE-2030-0001" sieht nach
    der ersten Rechnung des Betriebs aus; das ist eine Auskunft an jeden
    Kunden, die niemand geben will. Die Regel stand in `lib/invoiceNumbers`
    und ist mit dem Umzug des Moduls in die Datenbank gewandert — sie gilt
    jetzt auch fuer jeden, der die Funktion an der App vorbei aufruft.
  */
  it('Buchhaltung darf den Zaehler anlegen und hochzaehlen', async () => {
    const erst = await aBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2030 });
    expect(erst.data).toBe(1001);
    const dann = await aBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2030 });
    expect(dann.data).toBe(1002);
  });

  it('der Zaehler darf NICHT zurueckgesetzt werden', async () => {
    // In Firestore war das eine Regel über dem Dokument. Hier ist es eine
    // Eigenschaft der Bauart: an die Tabelle kommt niemand heran, und die
    // Funktion kann nur hochzählen. Was nicht erreichbar ist, lässt sich auch
    // nicht zurücksetzen — das ist die stärkere Zusage.
    const direkt = await aBuch.client.from('number_counters')
      .update({ stand: 0 }).eq('company_id', 'firma-a').select();
    expect(direkt.data ?? []).toEqual([]);
    const weiter = await aBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2030 });
    expect(weiter.data).toBe(1003);
  });

  it('der Zaehler darf nicht geloescht werden', async () => {
    await aBuch.client.from('number_counters').delete().eq('company_id', 'firma-a');
    const weiter = await aBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2030 });
    expect(weiter.data).toBe(1004);
  });

  it('ein Monteur kommt an den Zaehler nicht heran', async () => {
    const { error } = await a.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2030 });
    expect(error).not.toBeNull();
  });

  it('eine fremde Firma kommt an den Zaehler nicht heran', async () => {
    // Sie bekommt ihren EIGENEN Zähler, nicht den fremden — die Funktion
    // liest den Betrieb aus dem Token und nicht aus dem Aufruf.
    const bBuch = await konto('firma-b', 'Buchhaltung', 'b-buch');
    const eigener = await bBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2030 });
    expect(eigener.data).toBe(1001);
    expect((await bBuch.client.from('number_counters').select('*')).data ?? []).toEqual([]);
  });
});

describe('Urlaub — beantragen darf jeder, entscheiden nicht', () => {
  const antrag = (k: Konto, von: string, bis: string, rest: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(), company_id: k.betrieb, user_id: k.uid, user_name: 'Antrag',
    von, bis, tage: 5, status: 'Beantragt', ...rest,
  });

  it('ein Monteur stellt einen Antrag fuer sich selbst', async () => {
    const { error } = await a.client.from('vacations').insert(antrag(a, '2026-02-02', '2026-02-06'));
    expect(error).toBeNull();
  });

  it('aber nicht fuer jemand anderen', async () => {
    const { error } = await a.client.from('vacations')
      .insert({ ...antrag(a, '2026-02-09', '2026-02-13'), user_id: aKollege.uid });
    expect(error?.code).toBe('42501');
  });

  it('und nicht gleich als genehmigt', async () => {
    const { error } = await a.client.from('vacations')
      .insert(antrag(a, '2026-02-16', '2026-02-20', { status: 'Genehmigt' }));
    expect(error?.code).toBe('42501');
  });

  it('ein Monteur genehmigt seinen eigenen Urlaub NICHT', async () => {
    const eigen = antrag(a, '2026-03-02', '2026-03-06');
    await a.client.from('vacations').insert(eigen);
    const { error } = await a.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error?.code).toBe('42501');
  });

  it('ein Monteur darf seinen offenen Antrag noch aendern', async () => {
    const eigen = antrag(a, '2026-03-09', '2026-03-13');
    await a.client.from('vacations').insert(eigen);
    const { error } = await a.client.from('vacations')
      .update({ notiz: 'doch eine Woche später' }).eq('id', eigen.id);
    expect(error).toBeNull();
  });

  it('aber nicht mehr, nachdem entschieden wurde', async () => {
    const eigen = antrag(a, '2026-03-16', '2026-03-20');
    await a.client.from('vacations').insert(eigen);
    await aBuch.client.from('vacations').update({ status: 'Genehmigt' }).eq('id', eigen.id);
    const { error } = await a.client.from('vacations')
      .update({ notiz: 'nachträglich' }).eq('id', eigen.id);
    expect(error?.code).toBe('42501');
  });

  it('die Geschaeftsfuehrung genehmigt', async () => {
    const eigen = antrag(a, '2026-04-06', '2026-04-10');
    await a.client.from('vacations').insert(eigen);
    const { error } = await aChef.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error).toBeNull();
  });

  it('die Projektleitung SIEHT den Urlaub, entscheidet aber nicht', async () => {
    const eigen = antrag(a, '2026-04-13', '2026-04-17');
    await a.client.from('vacations').insert(eigen);
    const gesehen = await aLeitung.client.from('vacations').select('id').eq('id', eigen.id);
    expect(gesehen.data).toHaveLength(1);
    const { error } = await aLeitung.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error?.code).toBe('42501');
  });

  it('ein entschiedener Antrag wird nicht geloescht', async () => {
    const eigen = antrag(a, '2026-04-20', '2026-04-24');
    await a.client.from('vacations').insert(eigen);
    await aBuch.client.from('vacations').update({ status: 'Genehmigt' }).eq('id', eigen.id);
    await a.client.from('vacations').delete().eq('id', eigen.id);
    const { data } = await a.client.from('vacations').select('id').eq('id', eigen.id);
    expect(data).toHaveLength(1);
  });

  it('eine fremde Firma sieht den Antrag nicht', async () => {
    const { data } = await b.client.from('vacations').select('id');
    expect(data).toEqual([]);
  });
});

describe('Urlaub — Genehmigende sind einstellbar', () => {
  const antrag = (k: Konto, von: string) => ({
    id: crypto.randomUUID(), company_id: k.betrieb, user_id: k.uid, user_name: 'Antrag',
    von, bis: von, tage: 1, status: 'Beantragt',
  });

  async function listeSetzen(uids: string[]): Promise<void> {
    const { error } = await aChef.client.from('companies')
      .update({ vacation_approvers: uids }).eq('id', 'firma-a');
    if (error) throw error;
  }

  it('ohne Festlegung entscheidet die Buchhaltung wie bisher', async () => {
    await listeSetzen([]);
    const eigen = antrag(a, '2026-05-04');
    await a.client.from('vacations').insert(eigen);
    const { error } = await aBuch.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error).toBeNull();
  });

  it('mit Festlegung entscheidet, wer daraufsteht — auch die Verwaltung', async () => {
    await listeSetzen([aVerwaltung.uid]);
    const eigen = antrag(a, '2026-05-05');
    await a.client.from('vacations').insert(eigen);
    const { error } = await aVerwaltung.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error).toBeNull();
  });

  it('und die Buchhaltung dann NICHT mehr, wenn sie nicht daraufsteht', async () => {
    await listeSetzen([aVerwaltung.uid]);
    const eigen = antrag(a, '2026-05-06');
    await a.client.from('vacations').insert(eigen);
    const { error } = await aBuch.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error?.code).toBe('42501');
  });

  it('die Geschaeftsfuehrung entscheidet IMMER, auch ausserhalb der Liste', async () => {
    // Ein Betrieb, der sich selbst aussperrt, weil jemand die Liste falsch
    // gepflegt hat, wäre ein schlechter Tausch für Sauberkeit im Modell.
    await listeSetzen([aVerwaltung.uid]);
    const eigen = antrag(a, '2026-05-07');
    await a.client.from('vacations').insert(eigen);
    const { error } = await aChef.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error).toBeNull();
  });

  it('ein Monteur kommt auch mit Liste nicht an die Genehmigung', async () => {
    await listeSetzen([aVerwaltung.uid]);
    const eigen = antrag(a, '2026-05-08');
    await a.client.from('vacations').insert(eigen);
    const { error } = await a.client.from('vacations')
      .update({ status: 'Genehmigt' }).eq('id', eigen.id);
    expect(error?.code).toBe('42501');
  });

  it('die Liste aendert nur die Geschaeftsfuehrung', async () => {
    const { error } = await aChef.client.from('companies')
      .update({ vacation_approvers: [aBuch.uid] }).eq('id', 'firma-a');
    expect(error).toBeNull();
  });

  it('die Projektleitung aendert die Liste NICHT', async () => {
    const { data } = await aLeitung.client.from('companies')
      .update({ vacation_approvers: [aLeitung.uid] }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });

  it('die Projektleitung aendert am Firmendokument gar nichts mehr', async () => {
    const { data } = await aLeitung.client.from('companies')
      .update({ bank_name: 'Irgendeine Bank' }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });
});

describe('Module stellt nur die Administration', () => {
  it('der Administrator schaltet ein Modul ab', async () => {
    const { error } = await aAdmin.client.from('companies')
      .update({ modules: { wartungen: false } }).eq('id', 'firma-a');
    expect(error).toBeNull();
  });

  it('die Geschaeftsfuehrung NICHT', async () => {
    const { error } = await aChef.client.from('companies')
      .update({ modules: { wartungen: true } }).eq('id', 'firma-a');
    expect(error?.code).toBe('42501');
  });

  it('die Projektleitung schaltet sich NICHTS frei', async () => {
    const { data } = await aLeitung.client.from('companies')
      .update({ modules: { alles: true } }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });

  it('die Buchhaltung auch nicht', async () => {
    const { data } = await aBuch.client.from('companies')
      .update({ modules: { alles: true } }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });

  it('ein Monteur kommt an die Firmendaten ohnehin nicht', async () => {
    const { data } = await a.client.from('companies')
      .update({ name: 'Meine Firma' }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });

  it('eine fremde Firma aendert die Liste nicht', async () => {
    const { data } = await b.client.from('companies')
      .update({ modules: { alles: true } }).eq('id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
  });

  it('auch nicht als Beifang in einem sonst erlaubten Schreibvorgang', async () => {
    // Der eigentliche Trick: das Modul neben einer erlaubten Änderung
    // mitschicken. Eine Richtlinie sieht das nicht, ein Trigger schon.
    const { error } = await aChef.client.from('companies')
      .update({ bank_name: 'Sparkasse', modules: { alles: true } }).eq('id', 'firma-a');
    expect(error?.code).toBe('42501');
  });

  it('die Geschaeftsfuehrung darf alles ANDERE weiterhin aendern', async () => {
    const { error } = await aChef.client.from('companies')
      .update({ bank_name: 'Raiffeisen', iban: 'AT00 0000 0000 0000 0000' }).eq('id', 'firma-a');
    expect(error).toBeNull();
  });
});

describe('Benutzerverwaltung — wer Rollen vergibt', () => {
  async function frisch(): Promise<string> {
    const { data } = await admin.auth.admin.createUser({
      email: `bv-${crypto.randomUUID().slice(0, 8)}@firma-a.test`,
      password: 'egal-123456', email_confirm: true,
    });
    return data!.user!.id;
  }

  it('die Geschaeftsfuehrung legt einen Benutzer an', async () => {
    const uid = await frisch();
    const { error } = await aChef.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'Neu', email: `a${uid.slice(0, 8)}@firma-a.test`,
      role: 'Mitarbeiter',
    });
    expect(error).toBeNull();
  });

  it('die Projektleitung NICHT', async () => {
    const uid = await frisch();
    const { error } = await aLeitung.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'Neu', email: `b${uid.slice(0, 8)}@firma-a.test`,
      role: 'Mitarbeiter',
    });
    expect(error?.code).toBe('42501');
  });

  it('die Projektleitung stuft auch niemanden hoch', async () => {
    const { data } = await aLeitung.client.from('users')
      .update({ role: 'Geschäftsführung' }).eq('id', a.uid).select();
    expect(data ?? []).toEqual([]);
  });

  it('die Buchhaltung erst recht nicht', async () => {
    const { data } = await aBuch.client.from('users')
      .update({ role: 'Geschäftsführung' }).eq('id', a.uid).select();
    expect(data ?? []).toEqual([]);
  });

  it('lesen darf die Projektleitung weiterhin', async () => {
    const { data } = await aLeitung.client.from('users').select('id');
    expect(data!.length).toBeGreaterThan(1);
  });

  it('einen Administrator legt nur ein Administrator an', async () => {
    const uid = await frisch();
    const vonChef = await aChef.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'X', email: `c${uid.slice(0, 8)}@firma-a.test`,
      role: 'Administrator',
    });
    expect(vonChef.error?.code).toBe('42501');
    const vonAdmin = await aAdmin.client.from('users').insert({
      id: uid, company_id: 'firma-a', name: 'X', email: `c${uid.slice(0, 8)}@firma-a.test`,
      role: 'Administrator',
    });
    expect(vonAdmin.error).toBeNull();
  });
});

describe('Deaktivierte Konten kommen an gar nichts', () => {
  it('liest die eigenen Zeiteintraege NICHT mehr', async () => {
    await admin.from('time_entries').insert(buchung(aus, '2026-06-01'));
    const { data } = await aus.client.from('time_entries').select('id');
    expect(data).toEqual([]);
  });

  it('liest keine Baustellen und keine Firmendaten mehr', async () => {
    expect((await aus.client.from('projects').select('id')).data).toEqual([]);
    expect((await aus.client.from('companies').select('id')).data).toEqual([]);
  });

  it('schreibt auch nichts mehr', async () => {
    const { error } = await aus.client.from('time_entries').insert(buchung(aus, '2026-06-02'));
    expect(error?.code).toBe('42501');
  });

  it('das aktive Konto derselben Person arbeitet weiter', async () => {
    const { error } = await a.client.from('time_entries').insert(buchung(a, '2026-06-03'));
    expect(error).toBeNull();
  });

  it('ein Token OHNE das Merkmal gilt als aktiv', async () => {
    // Übernommene Altbestände tragen das Feld nicht, und ein Import dürfte
    // niemanden aussperren, der nie deaktiviert wurde.
    const ohne = await konto('firma-a', 'Mitarbeiter', 'ohne-merkmal');
    await admin.auth.admin.updateUserById(ohne.uid, {
      app_metadata: { company_id: 'firma-a', role: 'Mitarbeiter' },
    });
    const frisch = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await frisch.auth.signInWithPassword({
      email: (await admin.from('users').select('email').eq('id', ohne.uid).single()).data!.email,
      password: 'stufe-eins-2026',
    });
    expect(an.error).toBeNull();
    const { error } = await frisch.from('time_entries')
      .insert({ ...buchung(ohne, '2026-06-04'), user_id: ohne.uid });
    expect(error).toBeNull();
  });
});

describe('Einsatzplanung — planen darf nur die Leitung', () => {
  let einteilung: string;

  it('der Monteur sieht die Einteilung', async () => {
    const { data } = await admin.from('assignments').insert({
      company_id: 'firma-a', date: '2026-07-06', project_number: '2026-001', user_id: a.uid,
    }).select('id').single();
    einteilung = data!.id;
    const gesehen = await a.client.from('assignments').select('id').eq('id', einteilung);
    expect(gesehen.data).toHaveLength(1);
  });

  it('der Monteur setzt sich NICHT selbst auf eine andere Baustelle', async () => {
    const { data } = await a.client.from('assignments')
      .update({ project_number: '2026-002' }).eq('id', einteilung).select();
    expect(data ?? []).toEqual([]);
  });

  it('der Monteur legt keine Einteilung an und loescht keine', async () => {
    const angelegt = await a.client.from('assignments').insert({
      company_id: 'firma-a', date: '2026-07-07', project_number: '2026-001', user_id: a.uid,
    });
    expect(angelegt.error?.code).toBe('42501');

    await a.client.from('assignments').delete().eq('id', einteilung);
    const { data } = await a.client.from('assignments').select('id').eq('id', einteilung);
    expect(data).toHaveLength(1);
  });

  it('die Projektleitung plant, anlegen bis loeschen', async () => {
    const neu = await aLeitung.client.from('assignments').insert({
      company_id: 'firma-a', date: '2026-07-08', project_number: '2026-001', user_id: a.uid,
    }).select('id').single();
    expect(neu.error).toBeNull();

    const geaendert = await aLeitung.client.from('assignments')
      .update({ comment: 'früher anfangen' }).eq('id', neu.data!.id);
    expect(geaendert.error).toBeNull();

    await aLeitung.client.from('assignments').delete().eq('id', neu.data!.id);
    const { data } = await aLeitung.client.from('assignments').select('id').eq('id', neu.data!.id);
    expect(data).toEqual([]);
  });
});

describe('Rüstliste — planen darf die Leitung, abhaken der Eingeteilte', () => {
  let liste: string;

  it('die fremde Firma kommt nicht heran', async () => {
    const { data } = await admin.from('einsatz_material').insert({
      company_id: 'firma-a', date: '2026-08-03', project_number: '2026-001', uids: [a.uid],
    }).select('id').single();
    liste = data!.id;
    expect((await b.client.from('einsatz_material').select('id')).data).toEqual([]);
  });

  it('die Projektleitung legt an, ändert und löscht', async () => {
    const neu = await aLeitung.client.from('einsatz_material').insert({
      company_id: 'firma-a', date: '2026-08-04', project_number: '2026-001', uids: [a.uid],
    }).select('id').single();
    expect(neu.error).toBeNull();

    const geaendert = await aLeitung.client.from('einsatz_material')
      .update({ uids: [a.uid, aKollege.uid] }).eq('id', neu.data!.id);
    expect(geaendert.error).toBeNull();

    await aLeitung.client.from('einsatz_material').delete().eq('id', neu.data!.id);
    expect((await aLeitung.client.from('einsatz_material')
      .select('id').eq('id', neu.data!.id)).data).toEqual([]);
  });

  it('der eingeteilte Monteur hakt ab', async () => {
    const { error } = await a.client.from('einsatz_material')
      .update({ geladen: { [a.uid]: { von: 'Monteur', am: Date.now() } } }).eq('id', liste);
    expect(error).toBeNull();
  });

  it('der eingeteilte Monteur ändert die LISTE nicht', async () => {
    const { error } = await a.client.from('einsatz_material')
      .update({ project_number: '2026-002' }).eq('id', liste);
    expect(error?.code).toBe('42501');
  });

  it('ein NICHT eingeteilter Mitarbeiter hakt nichts ab', async () => {
    // Sonst bestätigte jemand das Verladen von Material, das er nie gesehen hat.
    const { error } = await aKollege.client.from('einsatz_material')
      .update({ geladen: { [aKollege.uid]: { von: 'Kollege', am: Date.now() } } }).eq('id', liste);
    expect(error?.code).toBe('42501');
  });

  it('der Monteur legt keine Liste an und löscht keine', async () => {
    const angelegt = await a.client.from('einsatz_material').insert({
      company_id: 'firma-a', date: '2026-08-05', project_number: '2026-001', uids: [a.uid],
    });
    expect(angelegt.error?.code).toBe('42501');

    await a.client.from('einsatz_material').delete().eq('id', liste);
    expect((await a.client.from('einsatz_material').select('id').eq('id', liste)).data)
      .toHaveLength(1);
  });

  it('die Buchhaltung sieht die Liste, plant sie aber nicht', async () => {
    expect((await aBuch.client.from('einsatz_material').select('id').eq('id', liste)).data)
      .toHaveLength(1);
    const { error } = await aBuch.client.from('einsatz_material')
      .update({ uids: [] }).eq('id', liste);
    expect(error?.code).toBe('42501');
  });
});

describe('Verrechnet-Kennzeichen — setzt nur, wer abrechnet', () => {
  let eigeneZeit: string;
  let eigeneAnforderung: string;

  it('der Monteur setzt es an seinem EIGENEN Zeiteintrag NICHT', async () => {
    const z = buchung(a, '2026-09-01');
    await a.client.from('time_entries').insert(z);
    eigeneZeit = z.id;
    const { error } = await a.client.from('time_entries')
      .update({ is_billed: true }).eq('id', eigeneZeit);
    expect(error?.code).toBe('42501');
  });

  it('der Monteur schmuggelt es nicht neben einer echten Korrektur mit', async () => {
    const { error } = await a.client.from('time_entries')
      .update({ comment: 'korrigiert', is_billed: true }).eq('id', eigeneZeit);
    expect(error?.code).toBe('42501');
  });

  it('der Monteur legt keinen bereits verrechneten Eintrag an', async () => {
    const { error } = await a.client.from('time_entries')
      .insert({ ...buchung(a, '2026-09-02'), is_billed: true });
    expect(error?.code).toBe('42501');
  });

  it('der Monteur setzt es auch an seiner eigenen Anforderung NICHT', async () => {
    const id = crypto.randomUUID();
    await a.client.from('material_orders').insert({
      id, company_id: 'firma-a', material_name: 'Winkel', quantity: 2,
      status: 'Offen', transaction_type: 'order', user_id: a.uid,
    });
    eigeneAnforderung = id;
    const { error } = await a.client.from('material_orders')
      .update({ is_billed: true }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('die Buchhaltung setzt es — sie stellt die Rechnung', async () => {
    const { error } = await aBuch.client.from('time_entries')
      .update({ is_billed: true, invoice_number: 'RE-2026-0001' }).eq('id', eigeneZeit);
    expect(error).toBeNull();
  });

  it('die Buchhaltung gibt einen Storno auch wieder frei', async () => {
    const { error } = await aBuch.client.from('time_entries')
      .update({ is_billed: false, invoice_number: null }).eq('id', eigeneZeit);
    expect(error).toBeNull();
  });

  it('der Monteur korrigiert seine Zeit unverändert', async () => {
    const { error } = await a.client.from('time_entries')
      .update({ comment: 'Pause war länger', break_duration: 45 }).eq('id', eigeneZeit);
    expect(error).toBeNull();
  });

  it('der Monteur bucht weiterhin eine neue Zeit', async () => {
    const { error } = await a.client.from('time_entries').insert(buchung(a, '2026-09-03'));
    expect(error).toBeNull();
  });

  it('der Monteur bestätigt weiterhin seine Abholung', async () => {
    const { error } = await a.client.from('material_orders')
      .update({ status: 'Erledigt' }).eq('id', eigeneAnforderung);
    expect(error).toBeNull();
  });

  it('der Monteur gibt weiterhin eine Anforderung auf', async () => {
    const { error } = await a.client.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: 'firma-a', material_name: 'Dichtring',
      quantity: 10, status: 'Offen', transaction_type: 'order', user_id: a.uid,
    });
    expect(error).toBeNull();
  });

  it('die Buchhaltung korrigiert einen fremden Eintrag weiterhin', async () => {
    const fremd = buchung(aKollege, '2026-09-04');
    await admin.from('time_entries').insert(fremd);
    const { error } = await aBuch.client.from('time_entries')
      .update({ comment: 'von der Buchhaltung geprüft' }).eq('id', fremd.id);
    expect(error).toBeNull();
  });
});

describe('Materialstamm — Bestand bewegt jeder, gepflegt wird er von der Verwaltung', () => {
  let artikel: string;

  it('der Monteur sieht den Katalog', async () => {
    const { data } = await admin.from('materials').insert({
      company_id: 'firma-a', name: 'Kupferrohr 15mm', stock: 100,
      unit: 'm', verkaufspreis: 9.9,
    }).select('id').single();
    artikel = data!.id;
    expect((await a.client.from('materials').select('id').eq('id', artikel)).data).toHaveLength(1);
  });

  it('der Monteur bucht seine Abholung vom Bestand ab', async () => {
    const { error } = await a.client.from('materials')
      .update({ stock: 95 }).eq('id', artikel);
    expect(error).toBeNull();
  });

  it('der Monteur schreibt eine Retoure zurück', async () => {
    const { error } = await a.client.from('materials')
      .update({ stock: 97 }).eq('id', artikel);
    expect(error).toBeNull();
  });

  it('der Monteur ändert die Bezeichnung NICHT', async () => {
    const { error } = await a.client.from('materials')
      .update({ name: 'Anders' }).eq('id', artikel);
    expect(error?.code).toBe('42501');
  });

  it('der Monteur ändert den Preis NICHT', async () => {
    const { error } = await a.client.from('materials')
      .update({ verkaufspreis: 1 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
  });

  it('der Monteur schmuggelt den Preis NICHT neben dem Bestand mit', async () => {
    const { error } = await a.client.from('materials')
      .update({ stock: 90, verkaufspreis: 1 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
  });

  it('der Monteur legt kein Material an und löscht keines', async () => {
    const angelegt = await a.client.from('materials')
      .insert({ company_id: 'firma-a', name: 'Eigenbau', stock: 1 });
    expect(angelegt.error?.code).toBe('42501');
    await a.client.from('materials').delete().eq('id', artikel);
    expect((await a.client.from('materials').select('id').eq('id', artikel)).data).toHaveLength(1);
  });

  it('der fremde Betrieb bewegt den Bestand NICHT', async () => {
    const { data } = await b.client.from('materials')
      .update({ stock: 0 }).eq('id', artikel).select();
    expect(data ?? []).toEqual([]);
  });

  it('die Verwaltung pflegt den Katalog vollständig', async () => {
    const { error } = await aVerwaltung.client.from('materials')
      .update({ name: 'Kupferrohr 15 mm', unit: 'lfm', verkaufspreis: 10.5 }).eq('id', artikel);
    expect(error).toBeNull();
  });

  it('die Verwaltung setzt den Einkaufspreis NICHT', async () => {
    // Der Einkaufspreis ist die Marge. Wer ihn neben dem Verkaufspreis sieht,
    // kennt den Aufschlag des Betriebs.
    const { error } = await aVerwaltung.client.from('materials')
      .update({ einkaufspreis: 4 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
  });

  it('die Verwaltung schmuggelt ihn auch nicht neben der Bezeichnung mit', async () => {
    const { error } = await aVerwaltung.client.from('materials')
      .update({ name: 'Kupferrohr', einkaufspreis: 4 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
  });

  it('die Verwaltung legt auch kein neues Material MIT Einkaufspreis an', async () => {
    const { error } = await aVerwaltung.client.from('materials')
      .insert({ company_id: 'firma-a', name: 'Neu mit Marge', stock: 1, einkaufspreis: 3 });
    expect(error?.code).toBe('42501');
  });

  it('die Projektleitung ebenfalls nicht — sie sieht keine Marge', async () => {
    const { error } = await aLeitung.client.from('materials')
      .update({ einkaufspreis: 4 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
  });

  it('die Geschäftsführung setzt ihn — beim Anlegen wie beim Ändern', async () => {
    const geaendert = await aChef.client.from('materials')
      .update({ einkaufspreis: 4.2 }).eq('id', artikel);
    expect(geaendert.error).toBeNull();
    const angelegt = await aChef.client.from('materials')
      .insert({ company_id: 'firma-a', name: 'Mit Marge', stock: 5, einkaufspreis: 2.1 });
    expect(angelegt.error).toBeNull();
  });

  it('die Verwaltung pflegt weiter, was neben einem gesetzten Einkaufspreis steht', async () => {
    // Der gesetzte Einkaufspreis darf den Katalog nicht einfrieren.
    const { error } = await aVerwaltung.client.from('materials')
      .update({ category: 'Rohre', article_number: 'CU-15' }).eq('id', artikel);
    expect(error).toBeNull();
  });
});

describe('Der Dienstschluessel kommt durch — durch manche Trigger', () => {
  /*
   * NICHT AUS firestore.rules PORTIERT, sondern beim Portieren GEFUNDEN.
   *
   * Postgres umgeht den Zeilenschutz für den Dienstschlüssel, Trigger aber
   * nicht. In Firestore umging das Admin-SDK die Regeln vollständig. Ohne
   * diesen Unterschied im Kopf sperrt der Riegel gegen die Ernennung von
   * Administratoren ausgerechnet die Funktion aus, die den ersten
   * Administrator eines neuen Betriebs anlegt.
   */
  it('legt den ersten Administrator eines Betriebs an', async () => {
    const { data } = await admin.auth.admin.createUser({
      email: `erster-${crypto.randomUUID().slice(0, 8)}@firma-b.test`,
      password: 'egal-123456', email_confirm: true,
    });
    const { error } = await admin.from('users').insert({
      id: data!.user!.id, company_id: 'firma-b', name: 'Erster Admin',
      email: `erster-${data!.user!.id.slice(0, 8)}@firma-b.test`, role: 'Administrator',
    });
    expect(error).toBeNull();
  });

  it('schreibt die Pruefsumme auf einen unterschriebenen Schein', async () => {
    const id = crypto.randomUUID();
    await a.client.from('work_sheets').insert({
      id, company_id: 'firma-a', project_number: '2026-001', customer_name: 'Berger',
      datum: '2026-09-10', status: 'Entwurf', abrechnung: 'Regie',
      erstellt_von_uid: a.uid, erstellt_von_name: 'Monteur',
    });
    await a.client.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', id);

    // Ohne Durchlass wäre der Manipulationsschutz das Erste, was am
    // Manipulationsschutz scheitert.
    const { error } = await admin.from('work_sheets')
      .update({ inhalt_hash: 'a'.repeat(64) }).eq('id', id);
    expect(error).toBeNull();
  });

  it('schiebt aber KEINE Zeile in einen anderen Betrieb', async () => {
    // Was den Beleg selbst schützt, gilt auch für den Server.
    const z = buchung(a, '2026-09-11');
    await admin.from('time_entries').insert(z);
    const { error } = await admin.from('time_entries')
      .update({ company_id: 'firma-b' }).eq('id', z.id);
    expect(error?.code).toBe('42501');
  });

  it('und aendert KEINE ausgestellte Rechnung', async () => {
    const { data } = await admin.from('invoices').insert({
      company_id: 'firma-a', invoice_number: 'RE-2026-7777', project_number: '2026-001',
      customer_name: 'Berger', invoice_date: '2026-09-01', due_date: '2026-10-01',
      total_netto: 500, total_vat: 100, total_brutto: 600, payment_status: 'Offen',
    }).select('id').single();
    const { error } = await admin.from('invoices')
      .update({ total_brutto: 1 }).eq('id', data!.id);
    expect(error?.code).toBe('42501');
  });
});

describe('Rechnungen — geloescht wird gar keine', () => {
  async function rechnung(nummer: string, stand = 'Offen'): Promise<string> {
    const { data, error } = await aBuch.client.from('invoices').insert({
      company_id: 'firma-a', invoice_number: nummer, project_number: '2026-001',
      customer_name: 'Berger', invoice_date: '2026-10-01', due_date: '2026-10-31',
      total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: stand,
    }).select('id').single();
    if (error) throw error;
    return data!.id;
  }

  it('eine offene Rechnung bleibt stehen', async () => {
    const id = await rechnung('RE-2026-1001');
    await aBuch.client.from('invoices').delete().eq('id', id);
    expect((await aBuch.client.from('invoices').select('id').eq('id', id)).data).toHaveLength(1);
  });

  it('eine bezahlte auch', async () => {
    const id = await rechnung('RE-2026-1002', 'Bezahlt');
    await aBuch.client.from('invoices').delete().eq('id', id);
    expect((await aBuch.client.from('invoices').select('id').eq('id', id)).data).toHaveLength(1);
  });

  it('und die stornierte ebenfalls', async () => {
    const id = await rechnung('RE-2026-1003', 'Storniert');
    await aBuch.client.from('invoices').delete().eq('id', id);
    expect((await aBuch.client.from('invoices').select('id').eq('id', id)).data).toHaveLength(1);
  });

  it('auch die Administration kommt nicht daran vorbei', async () => {
    const id = await rechnung('RE-2026-1004');
    await aAdmin.client.from('invoices').delete().eq('id', id);
    expect((await aBuch.client.from('invoices').select('id').eq('id', id)).data).toHaveLength(1);
  });

  it('stornieren geht weiter — das ist die Korrektur', async () => {
    const id = await rechnung('RE-2026-1005');
    const { error } = await aBuch.client.from('invoices').update({
      payment_status: 'Storniert', cancellation_note: 'Doppelt gestellt',
      cancelled_at: new Date().toISOString(),
    }).eq('id', id);
    expect(error).toBeNull();
  });
});

describe('Angebotszaehler — steigend, Neubeginn nur zum Jahreswechsel', () => {
  it('die Leitung zaehlt im laufenden Jahr hoch', async () => {
    const erst = await aLeitung.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: 2040 });
    const dann = await aLeitung.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: 2040 });
    expect(dann.data).toBe((erst.data as number) + 1);
  });

  it('zurueck geht im laufenden Jahr NICHT', async () => {
    const vorher = (await aLeitung.client.from('quotes').select('id')).data;
    void vorher;
    // Zurücksetzen ist hier kein verbotener Vorgang, sondern ein unmöglicher:
    // an den Zähler kommt niemand, und die Funktion kennt nur eine Richtung.
    const direkt = await aLeitung.client.from('number_counters')
      .update({ stand: 1 }).eq('art', 'quotes').select();
    expect(direkt.data ?? []).toEqual([]);
    const weiter = await aLeitung.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: 2040 });
    expect(weiter.data).toBe(3);
  });

  it('zum Jahreswechsel beginnt er bei genau 1', async () => {
    const neu = await aLeitung.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: 2041 });
    expect(neu.data).toBe(1);
  });

  it('der Jahreswechsel ist kein Freibrief fuer irgendeine Zahl', async () => {
    // In Firestore musste die Regel prüfen, dass der Neubeginn genau 1 ist —
    // der Client schlug die Zahl ja vor. Hier schlägt niemand etwas vor.
    const zweiter = await aLeitung.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: 2041 });
    expect(zweiter.data).toBe(2);
  });

  it('der Rechnungskreis laeuft ueber den Jahreswechsel weiter', async () => {
    // Zwei Kreise, zwei Zähler: das Angebot beginnt neu, die Rechnung nicht.
    const r1 = await aBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2041 });
    const r2 = await aBuch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2041 });
    expect(r2.data).toBe((r1.data as number) + 1);
  });
});

describe('Handwerksschein: verwerfen, zurueckholen, einfrieren', () => {
  async function schein(): Promise<string> {
    const id = crypto.randomUUID();
    const { error } = await a.client.from('work_sheets').insert({
      id, company_id: 'firma-a', project_number: '2026-001', customer_name: 'Berger',
      datum: '2026-11-02', status: 'Entwurf', abrechnung: 'Regie',
      erstellt_von_uid: a.uid, erstellt_von_name: 'Monteur',
    });
    if (error) throw error;
    return id;
  }

  async function unterschrieben(): Promise<string> {
    const id = await schein();
    await a.client.from('work_sheet_photos').insert({
      company_id: 'firma-a', work_sheet_id: id, pfad: 'a/b.jpg',
      hash: 'x'.repeat(64), bytes: 1000, geraet_zeit: new Date().toISOString(),
    });
    await a.client.from('work_sheets')
      .update({ status: 'Unterschrieben', unterschrieben_am: new Date().toISOString() })
      .eq('id', id);
    return id;
  }

  it('der Entwurf laesst sich verwerfen', async () => {
    const id = await schein();
    const { error } = await a.client.from('work_sheets')
      .update({ status: 'Verworfen', verworfen_von_name: 'Monteur' }).eq('id', id);
    expect(error).toBeNull();
  });

  it('der verworfene Entwurf kommt zurueck', async () => {
    const id = await schein();
    await a.client.from('work_sheets').update({ status: 'Verworfen' }).eq('id', id);
    const { error } = await a.client.from('work_sheets')
      .update({ status: 'Entwurf' }).eq('id', id);
    expect(error).toBeNull();
  });

  it('beim Zurueckholen darf sich der Inhalt NICHT aendern', async () => {
    const id = await schein();
    await a.client.from('work_sheets').update({ status: 'Verworfen' }).eq('id', id);
    // Der Inhalt eines verworfenen Entwurfs ist beim Zurückholen tabu; geändert
    // wird er danach, im Zustand Entwurf.
    const { error } = await a.client.from('work_sheets')
      .update({ status: 'Entwurf', customer_name: 'Jemand anderer' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('aus dem verworfenen Entwurf wird KEIN unterschriebener Schein', async () => {
    const id = await schein();
    await a.client.from('work_sheets').update({ status: 'Verworfen' }).eq('id', id);
    const { error } = await a.client.from('work_sheets')
      .update({ status: 'Unterschrieben' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('der UNTERSCHRIEBENE Schein bleibt unveraenderbar', async () => {
    const id = await unterschrieben();
    const { error } = await a.client.from('work_sheets')
      .update({ notizen: 'nachträglich' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('die Fotoliste laesst sich beim Storno nicht mitaendern', async () => {
    const id = await unterschrieben();
    const { error } = await aLeitung.client.from('work_sheet_photos').insert({
      company_id: 'firma-a', work_sheet_id: id, pfad: 'a/c.jpg',
      hash: 'y'.repeat(64), bytes: 500, geraet_zeit: new Date().toISOString(),
    });
    expect(error?.code).toBe('42501');
  });

  it('der Storno geht mit unveraenderter Fotoliste durch', async () => {
    const id = await unterschrieben();
    const { error } = await aLeitung.client.from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'Auftrag geplatzt' }).eq('id', id);
    expect(error).toBeNull();
  });

  it('und der Storno eines Scheins OHNE Fotofeld geht weiterhin', async () => {
    const id = await schein();
    await a.client.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', id);
    const { error } = await aLeitung.client.from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'Irrtum' }).eq('id', id);
    expect(error).toBeNull();
  });

  it('auch die Geschaeftsfuehrung kann den unterschriebenen Schein nicht verwerfen', async () => {
    const id = await unterschrieben();
    const { error } = await aChef.client.from('work_sheets')
      .update({ status: 'Verworfen' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('der stornierte Schein bleibt eingefroren', async () => {
    const id = await unterschrieben();
    await aLeitung.client.from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'x' }).eq('id', id);
    const { error } = await aLeitung.client.from('work_sheets')
      .update({ notizen: 'doch noch etwas' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('geloescht wird kein Schein, in keinem Zustand', async () => {
    const entwurf = await schein();
    const fertig = await unterschrieben();
    for (const id of [entwurf, fertig]) {
      await aAdmin.client.from('work_sheets').delete().eq('id', id);
      expect((await a.client.from('work_sheets').select('id').eq('id', id)).data).toHaveLength(1);
    }
  });

  it('die fremde Firma kommt an den Schein nicht heran', async () => {
    const id = await schein();
    expect((await b.client.from('work_sheets').select('id').eq('id', id)).data).toEqual([]);
    const { data } = await b.client.from('work_sheets')
      .update({ notizen: 'fremd' }).eq('id', id).select();
    expect(data ?? []).toEqual([]);
  });
});

describe('Einen Administrator entfernt nur ein Administrator', () => {
  let opfer: string;

  it('die Geschäftsführung darf ihn nicht löschen', async () => {
    const { data } = await admin.auth.admin.createUser({
      email: `opfer-${crypto.randomUUID().slice(0, 8)}@firma-a.test`,
      password: 'egal-123456', email_confirm: true,
    });
    opfer = data!.user!.id;
    await admin.from('users').insert({
      id: opfer, company_id: 'firma-a', name: 'Admin zum Entfernen',
      email: `opfer-${opfer.slice(0, 8)}@firma-a.test`, role: 'Administrator',
    });
    const { error } = await aChef.client.from('users').delete().eq('id', opfer);
    expect(error?.code).toBe('42501');
  });

  it('ein Administrator darf', async () => {
    const { error } = await aAdmin.client.from('users').delete().eq('id', opfer);
    expect(error).toBeNull();
    expect((await aAdmin.client.from('users').select('id').eq('id', opfer)).data).toEqual([]);
  });

  it('die Geschäftsführung kann sich auch nicht selbst befördern', async () => {
    const { error } = await aChef.client.from('users')
      .update({ role: 'Administrator' }).eq('id', aChef.uid);
    expect(error?.code).toBe('42501');
  });
});

describe('Die Überwachung schreibt nur der Server', () => {
  it('die Leitung darf den Zustand lesen', async () => {
    await admin.from('system_laeufe').upsert({
      company_id: 'firma-a', art: 'ausleitung', erfolg: true,
      zuletzt_erfolg: new Date().toISOString(), kennzahl: 1234, kennzahl_einheit: 'Zeilen',
    });
    const { data } = await aChef.client.from('system_laeufe').select('*');
    expect(data).toHaveLength(1);
  });

  it('der Monteur nicht', async () => {
    expect((await a.client.from('system_laeufe').select('*')).data).toEqual([]);
  });

  it('NIEMAND darf schreiben — auch die Administration nicht', async () => {
    const { data } = await aAdmin.client.from('system_laeufe')
      .update({ erfolg: false }).eq('company_id', 'firma-a').select();
    expect(data ?? []).toEqual([]);
    const { data: unveraendert } = await aChef.client.from('system_laeufe')
      .select('erfolg').eq('art', 'ausleitung').single();
    expect(unveraendert!.erfolg).toBe(true);
  });

  it('und keiner legt einen eigenen an', async () => {
    const { error } = await aAdmin.client.from('system_laeufe')
      .insert({ company_id: 'firma-a', art: 'bilanzen', erfolg: true });
    expect(error?.code).toBe('42501');
  });

  it('die fremde Firma sieht nichts', async () => {
    const bChef = await konto('firma-b', 'Geschäftsführung', 'b-chef');
    expect((await bChef.client.from('system_laeufe').select('*')).data).toEqual([]);
  });
});

describe('Wartungen — anlegen und verschieben darf nur die Leitung', () => {
  let wartung: string;

  it('der Monteur darf lesen — er fährt hin', async () => {
    const { data } = await admin.from('wartungen').insert({
      company_id: 'firma-a', customer_id: kundeA, customer_name: 'Familie Berger',
      anlage: 'Therme Vaillant', intervall_monate: 12, faellig_am: '2027-01-15',
    }).select('id').single();
    wartung = data!.id;
    expect((await a.client.from('wartungen').select('id').eq('id', wartung)).data).toHaveLength(1);
  });

  it('aber nicht schreiben', async () => {
    const { data } = await a.client.from('wartungen')
      .update({ faellig_am: '2030-01-01' }).eq('id', wartung).select();
    expect(data ?? []).toEqual([]);
  });

  it('die Leitung darf anlegen, ändern und löschen', async () => {
    const neu = await aLeitung.client.from('wartungen').insert({
      company_id: 'firma-a', customer_id: kundeA, customer_name: 'Familie Berger',
      anlage: 'Boiler', intervall_monate: 24, faellig_am: '2028-01-15',
    }).select('id').single();
    expect(neu.error).toBeNull();

    const verschoben = await aLeitung.client.from('wartungen')
      .update({ faellig_am: '2028-03-01' }).eq('id', neu.data!.id);
    expect(verschoben.error).toBeNull();

    await aLeitung.client.from('wartungen').delete().eq('id', neu.data!.id);
    expect((await aLeitung.client.from('wartungen').select('id').eq('id', neu.data!.id)).data)
      .toEqual([]);
  });

  it('die fremde Firma sieht und ändert nichts', async () => {
    expect((await b.client.from('wartungen').select('id')).data).toEqual([]);
    const { data } = await b.client.from('wartungen')
      .update({ aktiv: false }).eq('id', wartung).select();
    expect(data ?? []).toEqual([]);
  });

  it('und niemand schiebt eine Wartung in eine fremde Firma', async () => {
    const { error } = await aLeitung.client.from('wartungen')
      .update({ company_id: 'firma-b' }).eq('id', wartung);
    expect(error?.code).toBe('42501');
  });
});

describe('Der globale Administrator', () => {
  /*
   * Er gehört zu KEINEM Betrieb — deshalb trägt sein Token kein company_id,
   * und app.darf() ist für ihn nie wahr. In Firestore war das dieselbe Idee:
   * die Regeln prüfen gegen tokenCompany(), und ohne die passt keine.
   */
  let global: Awaited<ReturnType<typeof plattformKonto>>;

  async function plattformKonto() {
    const email = `plattform-${crypto.randomUUID().slice(0, 8)}@plattform.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: 'plattform-2026', email_confirm: true,
      app_metadata: { plattform_admin: true },
    });
    if (error) throw error;
    await admin.from('platform_admins').insert({ id: data!.user!.id, name: 'Global' });
    const client = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await client.auth.signInWithPassword({ email, password: 'plattform-2026' });
    if (an.error) throw an.error;
    return { client, uid: data!.user!.id };
  }

  beforeAll(async () => { global = await plattformKonto(); }, 60_000);

  it('kommt an kein Dokument eines Betriebs', async () => {
    for (const tabelle of ['companies', 'users', 'customers', 'projects',
                           'time_entries', 'invoices', 'work_sheets']) {
      const { data } = await global.client.from(tabelle).select('*');
      expect({ tabelle, zeilen: data }).toEqual({ tabelle, zeilen: [] });
    }
  });

  it('schreibt auch nichts hinein', async () => {
    const { error } = await global.client.from('customers')
      .insert({ company_id: 'firma-a', name: 'Von der Plattform' });
    expect(error?.code).toBe('42501');
  });

  it('kommt nicht einmal an seine eigene Ernennung', async () => {
    const { data } = await global.client.from('platform_admins').select('*');
    expect(data ?? []).toEqual([]);
  });

  it('liest auch das Anlageprotokoll nicht', async () => {
    await admin.from('betriebsanlagen').insert({
      betrieb_kennung: 'firma-a', name: 'Firma A',
      angelegt_von: global.uid, erster_admin_uid: aAdmin.uid,
    });
    expect((await global.client.from('betriebsanlagen').select('*')).data ?? []).toEqual([]);
  });

  it('und ein Betrieb sieht das Anlageprotokoll ebenso wenig', async () => {
    expect((await aAdmin.client.from('betriebsanlagen').select('*')).data ?? []).toEqual([]);
  });
});
