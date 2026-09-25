/**
 * STUFE 1 — was eingefroren ist, bleibt eingefroren.
 *
 * Der Handwerksschein und die Rechnung sind die beiden Stellen, an denen der
 * Kunde etwas in der Hand hat und § 132 BAO sieben Jahre mitredet. Dass sie
 * sich nachträglich nicht mehr ändern lassen, ist keine Vorsichtsmassnahme,
 * sondern der Sinn der Sache.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

let monteur: Konto;
let leitung: Konto;
let buch: Konto;
let fremd: Konto;

beforeAll(async () => {
  await betriebAnlegen('belege');
  await betriebAnlegen('andere');
  monteur = await konto('belege', 'Mitarbeiter', 'monteur');
  leitung = await konto('belege', 'Projektleiter', 'leitung');
  buch = await konto('belege', 'Buchhaltung', 'buch');
  fremd = await konto('andere', 'Buchhaltung', 'fremd');
}, 120_000);

async function scheinAnlegen(status = 'Entwurf'): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await monteur.client.from('work_sheets').insert({
    id, company_id: 'belege', project_number: '2026-100',
    customer_name: 'Familie Berger', datum: '2026-04-01', status: 'Entwurf',
    abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
  });
  if (error) throw error;
  if (status !== 'Entwurf') {
    // Positionen erst, Status danach — die Reihenfolge ist Pflicht, weil die
    // Positionen mit der Unterschrift zugehen.
    await monteur.client.from('work_sheet_hours').insert({
      company_id: 'belege', work_sheet_id: id, position: 1, datum: '2026-04-01',
      mitarbeiter: 'Anton Huber', von: '07:00', bis: '16:00', pause_min: 30, minuten: 510,
    });
    // Mit beiden Unterschriften — ohne sie wird seit dem Prüflauf vom
    // 25.09.2026 (P3-10) kein Entwurf mehr „Unterschrieben“.
    const unterschrift = { name: 'Unterschrift', bild: 'data:image/png;base64,AAA', geraetZeit: 1776000000000 };
    const { error: e2 } = await monteur.client.from('work_sheets')
      .update({
        status, unterschrieben_am: new Date().toISOString(),
        unterschrift_monteur: unterschrift, unterschrift_kunde: unterschrift,
      }).eq('id', id);
    if (e2) throw e2;
  }
  return id;
}

describe('Der Handwerksschein', () => {
  it('wird nur als Entwurf und nur auf den eigenen Namen angelegt', async () => {
    const fremderName = await monteur.client.from('work_sheets').insert({
      id: crypto.randomUUID(), company_id: 'belege', project_number: '2026-100',
      customer_name: 'X', datum: '2026-04-01', status: 'Entwurf', abrechnung: 'Regie',
      erstellt_von_uid: leitung.uid, erstellt_von_name: 'Leitung',
    });
    expect(fremderName.error?.code).toBe('42501');

    const gleichUnterschrieben = await monteur.client.from('work_sheets').insert({
      id: crypto.randomUUID(), company_id: 'belege', project_number: '2026-100',
      customer_name: 'X', datum: '2026-04-01', status: 'Unterschrieben', abrechnung: 'Regie',
      erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
    });
    expect(gleichUnterschrieben.error?.code).toBe('42501');
  });

  it('friert seine Positionen mit der Unterschrift ein', async () => {
    const id = await scheinAnlegen('Unterschrieben');

    const neu = await monteur.client.from('work_sheet_hours').insert({
      company_id: 'belege', work_sheet_id: id, position: 2, datum: '2026-04-01',
      mitarbeiter: 'Noch jemand', minuten: 120,
    });
    expect(neu.error?.code).toBe('42501');

    const geaendert = await monteur.client.from('work_sheet_hours')
      .update({ minuten: 999 }).eq('work_sheet_id', id);
    expect(geaendert.error?.code).toBe('42501');

    const geloescht = await monteur.client.from('work_sheet_hours')
      .delete().eq('work_sheet_id', id);
    expect(geloescht.error?.code).toBe('42501');

    // Und die Stunden stehen unverändert da.
    const zeilen = await monteur.client.from('work_sheet_hours')
      .select('minuten').eq('work_sheet_id', id);
    expect(zeilen.data).toEqual([{ minuten: 510 }]);
  });

  it('geht nach der Unterschrift nur noch in den Storno — und nur von oben', async () => {
    const id = await scheinAnlegen('Unterschrieben');

    const zurueck = await monteur.client.from('work_sheets')
      .update({ status: 'Entwurf' }).eq('id', id);
    expect(zurueck.error?.code).toBe('42501');

    const vomMonteur = await monteur.client.from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'Irrtum' }).eq('id', id);
    expect(vomMonteur.error?.code).toBe('42501');

    const ohneGrund = await leitung.client.from('work_sheets')
      .update({ status: 'Storniert' }).eq('id', id);
    expect(ohneGrund.error?.code).toBe('42501');

    const richtig = await leitung.client.from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'Auftrag geplatzt' }).eq('id', id);
    expect(richtig.error).toBeNull();
  });

  it('lässt einen verworfenen Entwurf wieder aufnehmen', async () => {
    const id = await scheinAnlegen();
    await monteur.client.from('work_sheets').update({ status: 'Verworfen' }).eq('id', id);
    const wieder = await monteur.client.from('work_sheets')
      .update({ status: 'Entwurf' }).eq('id', id);
    expect(wieder.error).toBeNull();
  });

  it('lässt sich nie löschen', async () => {
    const id = await scheinAnlegen();
    const geloescht = await leitung.client.from('work_sheets').delete().eq('id', id);
    // Ohne Löschrichtlinie trifft der Befehl keine Zeile — er wirft nicht,
    // er tut nichts. Der Schein steht danach noch da, und darauf kommt es an.
    expect(geloescht.error).toBeNull();
    const noch = await monteur.client.from('work_sheets').select('id').eq('id', id);
    expect(noch.data).toHaveLength(1);
  });

  it('trägt die Zeiten als KOPIE, nicht als Verweis auf die Buchung', async () => {
    // Die folgenreichste Entscheidung des Modells: Scheinzeit und Buchung
    // dürfen auseinanderlaufen — genau darauf beruht die Meldung „Scheine
    // warten noch auf deine Zeitbuchung".
    const id = await scheinAnlegen('Unterschrieben');
    const zeilen = await monteur.client.from('work_sheet_hours')
      .select('*').eq('work_sheet_id', id);
    // Der Mitarbeiter steht als NAME da. Gäbe es hier eine Kennung, wäre der
    // Beleg an eine veränderliche Zeile gebunden.
    expect(zeilen.data![0]).toHaveProperty('mitarbeiter', 'Anton Huber');
    expect(zeilen.data![0]).not.toHaveProperty('time_entry_id');
    expect(zeilen.data![0]).not.toHaveProperty('user_id');
  });
});

describe('Die Rechnung', () => {
  async function rechnungAnlegen(nummer: string): Promise<string> {
    const id = crypto.randomUUID();
    const { error } = await buch.client.from('invoices').insert({
      id, company_id: 'belege', invoice_number: nummer, project_number: '2026-100',
      customer_name: 'Familie Berger', invoice_date: '2026-04-10', due_date: '2026-05-10',
      total_netto: 1000, total_vat: 200, total_brutto: 1200, vat_rate: 20,
      payment_status: 'Offen',
    });
    if (error) throw error;
    return id;
  }

  it('lässt ihren Betrag nach dem Ausstellen nicht mehr ändern', async () => {
    const id = await rechnungAnlegen('RE-2026-0010');
    const betrag = await buch.client.from('invoices')
      .update({ total_brutto: 1 }).eq('id', id);
    expect(betrag.error?.code).toBe('42501');

    const nummer = await buch.client.from('invoices')
      .update({ invoice_number: 'RE-2026-9999' }).eq('id', id);
    expect(nummer.error?.code).toBe('42501');
  });

  it('lässt das Mahnwesen und den Verzug weiterlaufen', async () => {
    const id = await rechnungAnlegen('RE-2026-0011');

    /*
      „ÜBERFÄLLIG" HÄNGT AM DATUM und darf weiter von Hand gesetzt werden.
      Die Ansicht tut genau das beim Laden, für jede Rechnung, deren Frist
      abgelaufen ist.
    */
    const verzug = await buch.client.from('invoices')
      .update({ payment_status: 'Überfällig' }).eq('id', id);
    expect(verzug.error).toBeNull();

    const gemahnt = await buch.client.from('invoices')
      .update({ mahnstufe: 1, gemahnt_am: '2026-05-20' }).eq('id', id);
    expect(gemahnt.error).toBeNull();
  });

  /*
    SEIT STUFE 10.1 IST „BEZAHLT" KEINE EINGABE MEHR, sondern ein Ergebnis.
    Vorher stand an dieser Stelle die umgekehrte Zusage — der Haken liess sich
    setzen —, und genau daran hing, dass eine Rechnung als erledigt galt, ohne
    dass je ein Betrag oder ein Datum erfasst worden wäre.
  */
  it('lässt „Bezahlt" nicht mehr von Hand setzen', async () => {
    const id = await rechnungAnlegen('RE-2026-0014');
    const bezahlt = await buch.client.from('invoices')
      .update({ payment_status: 'Bezahlt' }).eq('id', id);
    expect(bezahlt.error?.code).toBe('42501');
  });

  it('wird storniert, nicht gelöscht', async () => {
    const id = await rechnungAnlegen('RE-2026-0012');
    await buch.client.from('invoices').delete().eq('id', id);
    const noch = await buch.client.from('invoices').select('id').eq('id', id);
    expect(noch.data).toHaveLength(1);

    /*
      DER STORNO GEHT ÜBER SEINE FUNKTION (Prüflauf 25.09.2026, P2-15). Per
      `update` liess er sich setzen und wieder wegnehmen — ohne die Belege
      freizugeben und vorbei an der Regel „aufheben nur am selben Tag".
    */
    const direkt = await buch.client.from('invoices').update({
      payment_status: 'Storniert', cancellation_note: 'Doppelt gestellt',
      cancelled_at: new Date().toISOString(),
    }).eq('id', id);
    expect(direkt.error?.code).toBe('42501');

    const storno = await buch.client.rpc('rechnung_stornieren', {
      p_id: id, p_grund: 'Doppelt gestellt',
    });
    expect(storno.error).toBeNull();
  });

  it('hält ihre Positionen endgültig fest', async () => {
    /*
      DIE POSITION ENTSTEHT MIT DER RECHNUNG, in `rechnung_anlegen`. Bis zum
      Prüflauf 25.09.2026 (P2-15) stand hier ein eigenes `insert` in
      `invoice_lines` — genau der Weg, auf dem eine verschickte Rechnung
      nachträglich eine Zeile dazubekam. Er ist jetzt zu.
    */
    const { data: id, error: angelegt } = await buch.client.rpc('rechnung_anlegen', {
      p_kopf: {
        invoice_number: 'RE-2026-0013', project_number: '2026-100',
        customer_name: 'Familie Berger', invoice_date: '2026-04-10', due_date: '2026-05-10',
        total_netto: 600, total_vat: 120, total_brutto: 720, vat_rate: 0.2,
        payment_status: 'Offen',
      },
      p_positionen: [{ label: 'Facharbeit', qty: 8, unit: 'Std', unit_price: 75, netto: 600 }],
      p_belege: {},
    });
    expect(angelegt).toBeNull();

    const dazu = await buch.client.from('invoice_lines').insert({
      company_id: 'belege', invoice_id: id, position: 1,
      label: 'Nachtrag', qty: 1, unit: 'Stk', unit_price: 1, netto: 1,
    });
    expect(dazu.error?.code).toBe('42501');

    const geaendert = await buch.client.from('invoice_lines')
      .update({ netto: 1 }).eq('invoice_id', id);
    expect(geaendert.error).toBeNull(); // keine Richtlinie: trifft keine Zeile
    const unveraendert = await buch.client.from('invoice_lines')
      .select('netto').eq('invoice_id', id);
    expect(Number(unveraendert.data![0].netto)).toBe(600);
  });
});

describe('Die Nummernvergabe', () => {
  it('zählt je Betrieb und je Jahr getrennt hoch', async () => {
    const a = await buch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2026 });
    const b = await buch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2026 });
    expect(b.data).toBe((a.data as number) + 1);

    /*
      Neues Jahr, neuer Anfang — Rechnungsnummern tragen das Jahr. Und zwar
      bei 1001 und nicht bei 1: „RE-2027-0001" sieht nach der ersten Rechnung
      des Betriebs aus, und das ist eine Auskunft an jeden Kunden, die
      niemand geben will.
    */
    const neuesJahr = await buch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2027 });
    expect(neuesJahr.data).toBe(1001);

    // Anderer Betrieb, eigener Zähler.
    const andere = await fremd.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2026 });
    expect(andere.data).toBe(1001);
  });

  it('gibt einem Mitarbeiter keine Rechnungsnummer', async () => {
    const versuch = await monteur.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: 2026 });
    expect(versuch.error).not.toBeNull();
  });

  it('lässt niemanden direkt an den Zähler', async () => {
    const gelesen = await buch.client.from('number_counters').select('*');
    expect(gelesen.data ?? []).toEqual([]);
  });
});

describe('Die Monatsbilanz rechnet wie die App', () => {
  it('summiert Arbeitszeit, Krank- und Urlaubstage', async () => {
    await betriebAnlegen('bilanz');
    const k = await konto('bilanz', 'Geschäftsführung', 'chef');
    await admin.from('time_entries').insert([
      buchung(k, '2026-05-04'),                                        // 8,5 h
      buchung(k, '2026-05-05', { start_time: '08:00', end_time: '12:00', break_duration: 0 }), // 4 h
      buchung(k, '2026-05-06', { status: 'Krank', start_time: null, end_time: null }),
      buchung(k, '2026-05-07', { status: 'Urlaub', start_time: null, end_time: null }),
    ]);

    const { data } = await k.client.from('monthly_stats').select('*').eq('monat', '2026-05');
    expect(data).toHaveLength(1);
    expect(Number(data![0].anwesend_min)).toBe(510 + 240);
    expect(Number(data![0].krank_tage)).toBe(1);
    expect(Number(data![0].urlaub_tage)).toBe(1);
    expect(data![0].tage).toEqual(['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07']);
  });

  it('bezahlt die Nacht über Mitternacht', async () => {
    // 22:00–06:00 ergab in der alten Rechnung glatt null Stunden — die Nacht
    // war schlicht nicht bezahlt. calcWorkMin behandelt das eigens, und die
    // Sicht muss es genauso tun.
    await betriebAnlegen('nacht');
    const k = await konto('nacht', 'Geschäftsführung', 'chef');
    await admin.from('time_entries').insert(
      buchung(k, '2026-06-01', { start_time: '22:00', end_time: '06:00', break_duration: 0 }),
    );
    const { data } = await k.client.from('monthly_stats').select('*').eq('monat', '2026-06');
    expect(Number(data![0].anwesend_min)).toBe(8 * 60);
  });
});
