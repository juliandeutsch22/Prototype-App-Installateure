/**
 * DER DURCHSTICH, DER DIE SICHERUNG ERST ZU EINER MACHT.
 *
 * Bis hierher gab es den Weg hinaus — nächtliche Ausleitung, Eimer ausser
 * Haus — und keinen zurück. Das heisst im Klartext: niemand wusste, ob die
 * abgelegten Dateien überhaupt etwas taugen. Eine Sicherung, die nie
 * zurückgespielt wurde, ist keine.
 *
 * Diese Prüfung geht den ganzen Weg, und zwar mit den ECHTEN Teilen:
 *
 *   1. Ein Betrieb mit Daten wird angelegt.
 *   2. Die echte Edge Function leitet ihn aus — dieselbe, die nachts läuft.
 *   3. Die Datei wird aus dem Speicher geholt, so wie ein Mensch sie holte.
 *   4. Der Betrieb wird GELÖSCHT. Vollständig, samt Anmeldekonten.
 *   5. Das echte Werkzeug `scripts/ruecklauf.mjs` spielt ihn zurück.
 *   6. Verglichen wird, was danach dasteht.
 *
 * Nichts davon ist nachgebildet. Genau deshalb beantwortet es die Frage, die
 * keine Rechenprüfung beantworten kann: kommt der Betrieb wieder?
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admin, API, ANON, SERVICE, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const lauf = promisify(execFile);
const BETRIEB = 'ruecklauf';
const VERWORFENES_ANGEBOT = crypto.randomUUID();
const VERWORFENER_SCHEIN = crypto.randomUUID();
const LINK_ANGEBOT = crypto.randomUUID();
const EINGANG = crypto.randomUUID();
const ZEIT_MIT_FELDERN = crypto.randomUUID();
let linkSchluessel = '';

let chef: Konto;
let monteur: Konto;

/**
 * Alles eines Betriebs löschen — in Runden, weil die Fremdschlüssel eine
 * Reihenfolge erzwingen, die sich hier niemand merken will.
 */
async function betriebLoeschen(betrieb: string, tabellen: string[]): Promise<void> {
  let offen = [...tabellen];
  while (offen.length > 0) {
    const gescheitert: string[] = [];
    for (const t of offen) {
      const { error } = await admin.from(t).delete().eq('company_id', betrieb);
      if (error) gescheitert.push(t);
    }
    if (gescheitert.length === offen.length) {
      throw new Error(`Aufräumen kam nicht weiter: ${gescheitert.join(', ')}`);
    }
    offen = gescheitert;
  }
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Rücklauf GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');

  // Etwas Bestand, der über mehrere Tabellen und über einen Fremdschlüssel
  // hinweg zusammenhängt — sonst prüfte der Rücklauf nur flache Zeilen.
  const { data: kunde } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Familie Huber', address: 'Hauptstrasse 1' })
    .select('id').single();
  await admin.from('projects').insert({
    company_id: BETRIEB, project_number: 'R-2026-001', customer_id: kunde!.id,
    customer_name: 'Familie Huber', status: 'Aktiv',
  });
  await admin.from('time_entries').insert([
    { ...buchung(monteur, '2026-09-01'), project_number: 'R-2026-001' },
    { ...buchung(monteur, '2026-09-02'), status: 'Urlaub' },
  ]);
  /*
    DAS ÄNDERUNGSJOURNAL (M01b) entsteht nur aus Änderungen mit einem
    Anmeldetoken — also ändert die Chefin selbst. Die Sicherung muss es
    mitbringen, und der Rücklauf darf beim Einspielen keine eigenen Zeilen
    dazuschreiben.
  */
  /*
    DER PAPIERKORB (M01d): ein verworfenes Angebot und ein verworfener Schein,
    mit wer und wann. Die Sicherung bringt sie mit, und der Rücklauf schreibt
    sie so zurück, wie sie waren — die Trigger, die diese Felder sonst
    setzen, lassen den Dienstschlüssel durch. Eingelegt mit dem
    Dienstschlüssel, damit das Journal unten bei seinen zwei Zeilen bleibt.
  */
  const papierkorb = await Promise.all([
    admin.from('quotes').insert({
      id: VERWORFENES_ANGEBOT, company_id: BETRIEB, quote_number: 'AN-R-1', customer_name: 'Familie Huber',
      quote_date: '2026-10-01', valid_until: '2026-11-01', status: 'Verworfen', vat_rate: 20,
      verworfen_am: '2026-10-02T08:00:00+00:00', verworfen_von_uid: chef.uid, verworfen_von_name: 'Chef',
    }),
    admin.from('work_sheets').insert({
      id: VERWORFENER_SCHEIN, company_id: BETRIEB, project_number: 'R-2026-001', customer_name: 'Familie Huber',
      datum: '2026-10-01', status: 'Verworfen', abrechnung: 'Regie', erstellt_von_uid: monteur.uid,
      erstellt_von_name: 'Monteur', verworfen_von_name: 'Monteur', verworfen_am: '2026-10-03T08:00:00+00:00',
    }),
  ]);
  expect(papierkorb.map((r) => r.error)).toEqual([null, null]);
  /*
    LAGERORTE, FAHRZEUG, UMLAGERUNG (M04a): das Hauptlager, ein Fahrzeug mit
    seinem Fahrzeuglager, ein Artikel und eine Umlagerung dorthin — also ein
    Ortsbestand mit Revision, zwei Bewegungen mit Ort, Gegenort und Vorgang
    und ein Schreibbefehl. Der Rücklauf bringt alles mit; er legt weder ein
    zweites Hauptlager an noch schreibt er eigene Bewegungen.
  */
  expect((await admin.from('lagerorte').insert({ company_id: BETRIEB, art: 'haupt', bezeichnung: 'Hauptlager' })).error).toBeNull();
  const fz = await chef.client.rpc('fahrzeug_speichern', { p_fahrzeug: { kennzeichen: 'W-RUECK1', standardfahrer_uid: monteur.uid, aktiv: true } });
  expect(fz.error).toBeNull();
  const busOrt = (await admin.from('lagerorte').select('id').eq('fahrzeug_id', fz.data).single()).data!.id as string;
  const artikel = await chef.client.from('materials')
    .insert({ company_id: BETRIEB, name: 'Rücklaufrohr', unit: 'Stk', stock: 10 }).select('id').single();
  expect(artikel.error).toBeNull();
  const um = await chef.client.rpc('umlagern', { p_befehl: {
    vorgang: crypto.randomUUID(), aktion: 'umlagerung', ziel: { artikel: artikel.data!.id, von: null, nach: busOrt },
    erwartet: { bestand_von: 10 }, menge: 4, einheit: 'Stk' } });
  expect(um.error).toBeNull();
  expect(um.data.ergebnis).toBe('ausgefuehrt');
  /*
    BESTELLVORSCHLAG (M04b): ein Artikel mit Mindestmenge, Sollbestand und
    Verpackungseinheit, sein Vorschlag übernommen — ein Posten der
    Einkaufsliste und ein zweiter Schreibbefehl. Der Rücklauf bringt beides
    mit, die neuen Spalten des Artikels eingeschlossen.
  */
  const ventil = await chef.client.from('materials')
    .insert({ company_id: BETRIEB, name: 'Rücklaufventil', unit: 'Stk', stock: 0, lagerartikel: true, mindestmenge: 5, sollbestand: 12, verpackungseinheit: 6 })
    .select('id').single();
  expect(ventil.error).toBeNull();
  const ueber = await chef.client.rpc('bestellvorschlaege_uebernehmen', { p_befehl: {
    vorgang: crypto.randomUUID(), aktion: 'bestellvorschlaege',
    posten: [{ artikel: ventil.data!.id, menge: 12, lieferant: null, erwartet: { menge: 12 } }] } });
  expect(ueber.error).toBeNull();
  expect(ueber.data.angelegt).toHaveLength(1);

  /*
    EIN OFFENER ANNAHME-LINK (M02a): die Sicherung bringt ihn samt Hashwert
    mit — nach dem Rücklauf gilt er weiter. Das Angebot ist schon versendet,
    das Erzeugen schreibt also keine Journalzeile.
  */
  expect((await admin.from('quotes').insert({
    id: LINK_ANGEBOT, company_id: BETRIEB, quote_number: 'AN-R-2', customer_name: 'Familie Huber',
    quote_date: '2026-10-01', valid_until: '2099-11-01', status: 'Versendet', vat_rate: 20,
  })).error).toBeNull();
  const link = await chef.client.rpc('angebot_link_erzeugen', { p_angebot: LINK_ANGEBOT, p_abrechnung: 'Regie', p_praefix: 'R' });
  expect(link.error).toBeNull();
  linkSchluessel = (link.data as { schluessel: string }).schluessel;
  /*
    EIN AUFTRAGSEINGANG (M02b) mit Nummer, Kunde und wer erfasst hat: der
    Rücklauf bringt ihn Spalte für Spalte zurück — die Auslöser, die Nummer
    und Namen sonst setzen, lassen den Dienstschlüssel durch. Eingelegt mit
    dem Dienstschlüssel, damit das Journal bei seinen zwei Zeilen bleibt.
  */
  expect((await admin.from('auftragseingaenge').insert({
    id: EINGANG, company_id: BETRIEB, nummer: 'EG-2026-0042', quelle: 'versicherung', auftraggeber_nummer: 'SCH-1',
    customer_id: kunde!.id, kunde_name: 'Familie Huber', anliegen: 'Wasserschaden', dringlichkeit: 'notfall',
    erfasst_von_uid: chef.uid, erfasst_von_name: 'Chef', eingegangen_am: '2026-11-01T08:00:00+00:00',
  })).error).toBeNull();
  /*
    FREIE ZEITFELDER (M06b): ein Feld, seine Fassung und eine Buchung des
    Monteurs mit Wert. Der Rücklauf bringt Definition, Fassung, Wert und die
    Fassung an der Buchung zurück — die Auslöser, die sie sonst setzen,
    lassen den Dienstschlüssel durch, und die Buchung kommt vor ihrem Wert.
  */
  const zf = await chef.client.rpc('zeitfeld_speichern', { p_feld: { name: 'Kostenstelle', typ: 'text', pflicht: 'beim_buchen' } });
  expect(zf.error).toBeNull();
  const zfId = (zf.data as { id: string; fassung: number }).id;
  expect((await monteur.client.from('time_entries').insert({
    ...buchung(monteur, '2026-09-03'), id: ZEIT_MIT_FELDERN, project_number: 'R-2026-001',
    zeitfelder: { fassung: (zf.data as { fassung: number }).fassung, werte: { [zfId]: 'KS-4711' } },
  })).error).toBeNull();
  const { error: e1 } = await chef.client.from('customers').update({ contact_phone: '0664 1' }).eq('id', kunde!.id);
  const { error: e2 } = await chef.client.from('projects').update({ status: 'Pausiert' }).eq('project_number', 'R-2026-001');
  expect([e1, e2]).toEqual([null, null]);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Aus der Sicherung wird wieder ein Betrieb', () => {
  it('geht den ganzen Weg: ausleiten, löschen, zurückspielen', async () => {
    /*
      1. WAS DER BETRIEB HAT — gemessen VOR der Ausleitung.

      Die Reihenfolge ist kein Zufall. Die Ausleitung hält ihren EIGENEN Lauf
      in `system_laeufe` fest, und zwar NACH dem Schreiben der Datei; die
      Datei kann diesen Eintrag also gar nicht enthalten. Wer erst danach
      misst, vergleicht den Rücklauf gegen eine Zeile, die es beim Ausleiten
      noch nicht gab — und hält ein richtiges Ergebnis für falsch. Genau
      darüber bin ich beim ersten Lauf gestolpert.
    */
    const tabellen = (await admin.rpc('auszug_tabellen')).data as string[];
    const vorher: Record<string, number> = {};
    for (const t of tabellen) {
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true })
        .eq('company_id', BETRIEB);
      if (count) vorher[t] = count;
    }
    expect(Object.keys(vorher).length).toBeGreaterThan(2);
    const linkVorher = (await admin.from('angebot_links').select('*').eq('quote_id', LINK_ANGEBOT).single()).data;
    const eingangVorher = (await admin.from('auftragseingaenge').select('*').eq('id', EINGANG).single()).data;
    const zeitfelderVorher = async () => ({
      definitionen: (await admin.from('zeitfeld_definitionen').select('*').eq('company_id', BETRIEB).order('id')).data,
      fassungen: (await admin.from('zeitfeld_fassungen').select('*').eq('company_id', BETRIEB).order('id')).data,
      werte: (await admin.from('zeitbuchung_feldwerte').select('*').eq('company_id', BETRIEB).order('id')).data,
      buchung: (await admin.from('time_entries').select('zeitfeld_fassung, zeitfelder').eq('id', ZEIT_MIT_FELDERN).single()).data,
    });
    const zfVorher = await zeitfelderVorher();
    expect(zfVorher.werte).toEqual([expect.objectContaining({ wert: 'KS-4711', eintrag_id: ZEIT_MIT_FELDERN })]);
    expect(zfVorher.buchung).toEqual({ zeitfeld_fassung: 1, zeitfelder: null });
    expect(eingangVorher).toMatchObject({ nummer: 'EG-2026-0042', erfasst_von_name: 'Chef', kunde_name: 'Familie Huber' });
    expect(linkVorher).not.toBeNull();
    const journalVorher = ((await admin.from('aenderungsjournal').select('id, objekt_id, art, aenderungen, von_uid')
      .eq('company_id', BETRIEB).order('id')).data ?? []);
    expect(journalVorher).toHaveLength(2);
    // M04a: Orte, Ortsbestand, Bewegungen und Befehle — Zeile für Zeile.
    const lagerVorher = async () => ({
      orte: (await admin.from('lagerorte').select('id, art, bezeichnung, fahrzeug_id, aktiv').eq('company_id', BETRIEB).order('id')).data,
      fahrzeuge: (await admin.from('fahrzeuge').select('id, kennzeichen, standardfahrer_uid, aktiv').eq('company_id', BETRIEB).order('id')).data,
      bestaende: (await admin.from('lagerbestaende').select('lagerort_id, material_id, menge, revision').eq('company_id', BETRIEB).order('lagerort_id')).data,
      bewegungen: (await admin.from('lagerbewegungen').select('id, art, menge, bestand_nachher, lagerort_id, gegenort_id, vorgang')
        .eq('company_id', BETRIEB).order('id')).data,
      befehle: (await admin.from('befehle_vorgaenge').select('vorgang, befehl, nutzlast_hash, ergebnis, von_uid')
        .eq('company_id', BETRIEB).order('vorgang')).data,
      // M04b: Sollbestand und Verpackungseinheit am Artikel, der übernommene Vorschlag als Posten.
      vorschlag: (await admin.from('materials').select('id, mindestmenge, sollbestand, verpackungseinheit')
        .eq('company_id', BETRIEB).eq('name', 'Rücklaufventil')).data,
      posten: (await admin.from('einkauf_posten').select('id, material_id, menge, supplier_id, angelegt_von_uid, bestellt_am')
        .eq('company_id', BETRIEB).order('id')).data,
    });
    const lager = await lagerVorher();
    expect(lager.orte!.map((o) => o.art).sort()).toEqual(['fahrzeug', 'haupt']);
    expect(lager.bestaende).toEqual([expect.objectContaining({ menge: 4, revision: 1 })]);
    expect(lager.bewegungen!.filter((b) => b.art === 'umlagerung')).toHaveLength(2);
    expect(lager.befehle).toHaveLength(2);
    expect(lager.vorschlag).toEqual([expect.objectContaining({ mindestmenge: 5, sollbestand: 12, verpackungseinheit: 6 })]);
    expect(lager.posten).toEqual([expect.objectContaining({ menge: 12, bestellt_am: null })]);

    /*
      2. Ausleiten — mit dem Token eines Menschen, also der Knopf aus den
      Einstellungen, nicht der Nachtlauf.

      `apikey` ist der ÖFFENTLICHE Schlüssel, so wie der Browser ihn schickt.
      Mit dem Dienstschlüssel darin gälte der Aufruf als Maschine, und die
      Function nähme den Nachtlauf-Weg über alle Betriebe — der antwortet
      ohne `pfad`, weil er nicht EINEN Stand schreibt. Genau darüber bin ich
      beim ersten Lauf gestolpert.
    */
    const antwort = await fetch(`${API}/functions/v1/daten-ausleitung`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${chef.token}` },
    });
    expect(antwort.status).toBe(200);
    const bilanz = await antwort.json();
    expect(bilanz.zeilen).toBeGreaterThan(0);

    /* 3. Die Datei holen, so wie ein Mensch sie aus dem Eimer holte. */
    const { data: blob, error: holFehler } = await admin.storage
      .from('ausleitung').download(bilanz.pfad);
    expect(holFehler).toBeNull();
    const inhalt = await blob!.text();
    // Seit N1 (24.10.2026) schreibt die Datenbank die Zeilen; das Textformat
    // ist ihres, der Inhalt derselbe — deshalb gelesen statt verglichen.
    const sammlungen = inhalt.split('\n').filter(Boolean).map((z) => (JSON.parse(z) as { sammlung: string }).sammlung);
    expect(sammlungen).toContain('companies');

    /* 4. DEN BETRIEB LÖSCHEN. Der Ernstfall, nachgestellt. */
    await betriebLoeschen(BETRIEB, tabellen);
    for (const uid of [chef.uid, monteur.uid]) await admin.auth.admin.deleteUser(uid);
    await admin.from('companies').delete().eq('id', BETRIEB);
    const { count: weg } = await admin.from('customers')
      .select('*', { count: 'exact', head: true }).eq('company_id', BETRIEB);
    expect(weg).toBe(0);

    /* 5. Zurückspielen — mit dem echten Werkzeug, als eigener Vorgang. */
    const datei = join(mkdtempSync(join(tmpdir(), 'ruecklauf-')), 'stand.jsonl');
    /*
      Dazu eine Zeile aus einer Tabelle, die es nicht mehr gibt — so sieht
      eine Sicherung von vor dem 30.09.2026 aus. Sie darf den Rücklauf nicht
      kippen, und sie muss genannt werden.
    */
    const wiedervorlage = JSON.stringify({
      sammlung: 'follow_ups',
      daten: { id: crypto.randomUUID(), company_id: BETRIEB, title: 'Alt', created_from: 'voice', done: false },
    });
    writeFileSync(datei, `${inhalt.trimEnd()}\n${wiedervorlage}\n`);
    const { stdout } = await lauf('node', ['scripts/ruecklauf.mjs', datei, '--schreiben'], {
      env: { ...process.env, RUECKLAUF_URL: API, RUECKLAUF_DIENSTSCHLUESSEL: SERVICE },
      cwd: process.cwd(),
    });
    expect(stdout).toContain('Fertig.');
    expect(stdout).toContain('übergangen: follow_ups (1 Zeilen)');

    /* 6. Und nun der Vergleich. */
    for (const [t, anzahl] of Object.entries(vorher)) {
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true })
        .eq('company_id', BETRIEB);
      expect(count, `Tabelle ${t}`).toBe(anzahl);
    }

    // Das Journal kam mit, Zeile für Zeile — und nichts doppelt: der Rücklauf selbst schrieb keine.
    const journalNachher = ((await admin.from('aenderungsjournal').select('id, objekt_id, art, aenderungen, von_uid')
      .eq('company_id', BETRIEB).order('id')).data ?? []);
    expect(journalNachher).toEqual(journalVorher);

    // M04a: dieselben Orte (ein Hauptlager), Bestände mit Revision, Bewegungen und Befehle — nichts dazu.
    expect(await lagerVorher()).toEqual(lager);
    // M06b: Definition, Fassung, Wert und die Fassung an der Buchung — Spalte für Spalte.
    expect(await zeitfelderVorher()).toEqual(zfVorher);

    // Nicht nur die Anzahl: der Inhalt muss stimmen, sonst hätte auch eine
    // Handvoll leerer Zeilen bestanden.
    const [firma] = (await admin.from('companies').select('name').eq('id', BETRIEB)).data!;
    expect(firma.name).toBe('Rücklauf GmbH');
    const [baustelle] = (await admin.from('projects')
      .select('project_number, customer_name, customer_id').eq('company_id', BETRIEB)).data!;
    expect(baustelle.project_number).toBe('R-2026-001');
    // Der Fremdschlüssel zeigt wieder auf einen Kunden, den es gibt.
    const { count: kundeDa } = await admin.from('customers')
      .select('*', { count: 'exact', head: true }).eq('id', baustelle.customer_id);
    expect(kundeDa).toBe(1);

    // Der Papierkorb (M01d): wer und wann kommen unverändert zurück — nicht neu gesetzt.
    const [angebot] = (await admin.from('quotes')
      .select('status, verworfen_am, verworfen_von_uid, verworfen_von_name').eq('id', VERWORFENES_ANGEBOT)).data!;
    expect(angebot).toEqual({
      status: 'Verworfen', verworfen_am: '2026-10-02T08:00:00+00:00', verworfen_von_uid: chef.uid, verworfen_von_name: 'Chef',
    });
    const [schein] = (await admin.from('work_sheets')
      .select('status, verworfen_am').eq('id', VERWORFENER_SCHEIN)).data!;
    expect(schein).toEqual({ status: 'Verworfen', verworfen_am: '2026-10-03T08:00:00+00:00' });
    // Der Auftragseingang (M02b) kommt Spalte für Spalte zurück — Nummer, Kunde, wer erfasst hat.
    expect((await admin.from('auftragseingaenge').select('*').eq('id', EINGANG).single()).data).toEqual(eingangVorher);
    // Der Annahme-Link kommt Spalte für Spalte zurück — und der Schlüssel gilt wieder.
    expect((await admin.from('angebot_links').select('*').eq('quote_id', LINK_ANGEBOT).single()).data).toEqual(linkVorher);
    const abruf = await admin.rpc('angebot_link_abruf', {
      p_hash: createHash('sha256').update(linkSchluessel).digest('hex'),
    });
    expect(abruf.data).toMatchObject({ zustand: 'offen' });
    // Die Prüfsumme bleibt nachrechenbar: der Stand kommt als derselbe Text zurück.
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await db.connect();
    try {
      const { rows } = await db.query<{ gleich: boolean }>(
        `select encode(sha256(convert_to(schnappschuss::text, 'UTF8')), 'hex') = schnappschuss_hash as gleich
           from public.angebot_links where quote_id = $1`, [LINK_ANGEBOT]);
      expect(rows).toEqual([{ gleich: true }]);
    } finally {
      await db.end();
    }
    /*
      Nicht liegen lassen: `verlaeufe` und `urlaubNurUeberAntrag` spielen
      ältere Migrationen erneut ein, und die Prüfung der Stände von damals
      kennt „Verworfen“ nicht (siehe `papierkorb.test.ts`).
    */
    expect((await admin.from('quotes').delete().eq('id', VERWORFENES_ANGEBOT)).error).toBeNull();
  }, 240_000);

  it('legt die Anmeldekonten unter DERSELBEN Kennung wieder an', async () => {
    /*
      Der Punkt, an dem ein Rücklauf sonst scheitert. Die Konten stehen NICHT
      in der Sicherung — sie tragen kein `company_id` und fallen aus der
      Ausleitung heraus. Bekämen sie beim Wiederanlauf neue Kennungen, zeigte
      jede Zeiteintragung, jeder Schein und jede Zuordnung ins Leere.
    */
    const { data } = await admin.auth.admin.listUsers();
    const wieder = data.users.filter((u) => u.app_metadata?.company_id === BETRIEB);
    expect(wieder.map((u) => u.id).sort()).toEqual([chef.uid, monteur.uid].sort());

    // Und mit den richtigen Ansprüchen — daran hängt der ganze Zeilenschutz.
    const chefWieder = wieder.find((u) => u.id === chef.uid);
    expect(chefWieder?.app_metadata?.role).toBe('Geschäftsführung');

    // Die Buchungen zeigen wieder auf einen Menschen, den es gibt.
    const { data: zeiten } = await admin.from('time_entries')
      .select('user_id').eq('company_id', BETRIEB);
    expect(zeiten!.every((z) => z.user_id === monteur.uid)).toBe(true);
  });
});
