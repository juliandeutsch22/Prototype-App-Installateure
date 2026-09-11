/**
 * STUFE 0 — DER SPERRVERSUCH.
 *
 * Diese Datei entscheidet, ob der Umzug weitergeht. Sie läuft gegen eine
 * ECHTE Postgres-Datenbank mit eingeschaltetem Zeilenschutz, nicht gegen einen
 * Ersatz, denn genau die Fragen, um die es hier geht — hält RLS, kommt ein
 * nachgesendeter Vorgang zweimal an, erreicht eine Ablehnung den Monteur —
 * lassen sich an einem nachgebauten Server nicht beantworten.
 *
 * Start des Stacks: `npx supabase start`, dann `npm run supabase:test`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { schreiben, nachsenden, beiVormerkungFehlgeschlagen, type Lager, type Vormerkung } from '@/lib/sync/ausgangsfach';
import { supabaseSender } from '@/lib/sync/supabaseSender';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

function lagerImKopf(): Lager & { inhalt: () => Vormerkung[] } {
  let zeilen: Vormerkung[] = [];
  let zaehler = 0;
  return {
    inhalt: () => [...zeilen].sort((a, b) => a.folge - b.folge),
    async alle() { return [...zeilen]; },
    async ablegen(v) { zaehler += 1; zeilen.push({ ...v, folge: zaehler }); return zaehler; },
    async entfernen(folge) { zeilen = zeilen.filter((x) => x.folge !== folge); },
    async ersetzen(v) { zeilen = zeilen.map((x) => (x.folge === v.folge ? v : x)); },
  };
}

/** Legt Betrieb + angemeldeten Monteur an und gibt dessen Client zurück. */
async function betriebMitMonteur(
  betrieb: string,
  email: string,
  rolle = 'Mitarbeiter',
  aktiv = true,
): Promise<{ client: SupabaseClient; uid: string }> {
  await admin.from('companies').upsert({ id: betrieb, name: betrieb });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'sperrversuch-2026',
    email_confirm: true,
    // app_metadata — NICHT user_metadata: dorthin darf nur der Server schreiben.
    app_metadata: { company_id: betrieb, role: rolle, active: aktiv },
  });
  if (error) throw error;
  const uid = data.user!.id;

  await admin.from('users').upsert({ id: uid, company_id: betrieb, name: email, email, role: rolle, active: aktiv });

  const client = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await client.auth.signInWithPassword({ email, password: 'sperrversuch-2026' });
  if (an.error) throw an.error;
  return { client, uid };
}

const buchung = (uid: string, betrieb: string, datum = '2026-09-11') => ({
  company_id: betrieb,
  user_id: uid,
  date: datum,
  status: 'Anwesend',
  start_time: '07:00',
  end_time: '16:00',
  break_duration: 30,
});

let perl: { client: SupabaseClient; uid: string };
let perlBuero: { client: SupabaseClient; uid: string };
let perlKollege: { client: SupabaseClient; uid: string };
let fremd: { client: SupabaseClient; uid: string };

beforeAll(async () => {
  const stempel = Date.now();
  perl = await betriebMitMonteur('perl', `monteur-${stempel}@perl.test`);
  perlKollege = await betriebMitMonteur('perl', `kollege-${stempel}@perl.test`);
  perlBuero = await betriebMitMonteur('perl', `buchhaltung-${stempel}@perl.test`, 'Buchhaltung');
  fremd = await betriebMitMonteur('huber', `monteur-${stempel}@huber.test`);
}, 60_000);

describe('Sperrversuch 1: der Monteur bucht im Funkloch', () => {
  it('merkt ohne Empfang vor und sendet nach — genau einmal', async () => {
    const l = lagerImKopf();
    const sender = supabaseSender(perl.client);
    const zeile = crypto.randomUUID();

    // Im Keller: kein Netz.
    const erg = await schreiben(
      { tabelle: 'time_entries', art: 'anlegen', zeile, daten: buchung(perl.uid, 'perl') },
      l,
      sender,
      () => true,
    );
    expect(erg).toBe('queued');

    // Nichts ist angekommen — der Eintrag liegt nur im Fach.
    const vorher = await perl.client.from('time_entries').select('id').eq('id', zeile);
    expect(vorher.data).toHaveLength(0);

    // Oben angekommen, Netz da.
    expect(await nachsenden(l, sender)).toEqual({ gesendet: 1, abgelehnt: 0, offen: 0 });

    const nachher = await perl.client.from('time_entries').select('id').eq('id', zeile);
    expect(nachher.data).toHaveLength(1);
  });

  it('landet auch dann einmal, wenn derselbe Vorgang zweimal ankommt', async () => {
    // Der Fall, der ohne geräteseitige Kennung nicht zu lösen wäre: der Server
    // hat den Vorgang bekommen, die Antwort ging auf dem Rückweg verloren, das
    // Gerät sendet nach.
    const l = lagerImKopf();
    const sender = supabaseSender(perl.client);
    const zeile = crypto.randomUUID();

    await schreiben(
      { tabelle: 'time_entries', art: 'anlegen', zeile, daten: buchung(perl.uid, 'perl', '2026-09-12') },
      l,
      sender,
      () => true,
    );
    await nachsenden(l, sender);

    // Dasselbe nochmal, als hätte das Gerät die Bestätigung nie gesehen.
    const l2 = lagerImKopf();
    await schreiben(
      { tabelle: 'time_entries', art: 'anlegen', zeile, daten: buchung(perl.uid, 'perl', '2026-09-12') },
      l2,
      sender,
      () => true,
    );
    expect(await nachsenden(l2, sender)).toEqual({ gesendet: 1, abgelehnt: 0, offen: 0 });

    const alle = await perl.client.from('time_entries').select('id').eq('id', zeile);
    expect(alle.data).toHaveLength(1);
  });

  it('hält die Reihenfolge: erst anlegen, dann ändern', async () => {
    const l = lagerImKopf();
    const sender = supabaseSender(perl.client);
    const zeile = crypto.randomUUID();

    await schreiben(
      { tabelle: 'time_entries', art: 'anlegen', zeile, daten: buchung(perl.uid, 'perl', '2026-09-13') },
      l, sender, () => true,
    );
    await schreiben(
      { tabelle: 'time_entries', art: 'aendern', zeile, daten: { comment: 'Notdienst' } },
      l, sender, () => true,
    );

    expect(await nachsenden(l, sender)).toEqual({ gesendet: 2, abgelehnt: 0, offen: 0 });

    const zeilen = await perl.client.from('time_entries').select('comment').eq('id', zeile);
    expect(zeilen.data?.[0].comment).toBe('Notdienst');
  });
});

describe('Sperrversuch 2: die späte Ablehnung erreicht den Monteur', () => {
  it('meldet, wenn der Server einen vorgemerkten Vorgang verweigert', async () => {
    const gemeldet: string[] = [];
    beiVormerkungFehlgeschlagen((f) => gemeldet.push(f.grund));

    const l = lagerImKopf();
    const sender = supabaseSender(perl.client);

    // Eine Buchung auf einen FREMDEN Betrieb — der Zeilenschutz muss sie
    // abweisen. Das ist der Stellvertreter für „Konto inzwischen gesperrt":
    // vorgemerkt, aber am Ende nicht angenommen.
    await schreiben(
      {
        tabelle: 'time_entries',
        art: 'anlegen',
        zeile: crypto.randomUUID(),
        daten: buchung(perl.uid, 'huber'),
      },
      l, sender, () => true,
    );

    const bericht = await nachsenden(l, sender);
    expect(bericht.abgelehnt).toBe(1);
    expect(bericht.offen).toBe(0);
    expect(gemeldet).toHaveLength(1);
    beiVormerkungFehlgeschlagen(null);
  });
});

describe('Sperrversuch 2b: wer was anlegen darf', () => {
  // Diese drei pruefen die ANLEGE-Richtlinie fuer sich. Der Test oben trifft
  // sie naemlich gar nicht: ein `upsert` verlangt von PostgREST auch das
  // Aenderungsrecht, und die Aenderungs-Richtlinie weist den fremden Betrieb
  // schon ab. Ohne die folgenden Zeilen koennte man die Anlege-Richtlinie
  // weit oeffnen, ohne dass eine Pruefung es merkt.

  it('weist eine Buchung auf einen fremden Betrieb ab', async () => {
    const { error } = await perl.client
      .from('time_entries')
      .insert({ id: crypto.randomUUID(), ...buchung(perl.uid, 'huber') });
    expect(error?.code).toBe('42501');
  });

  it('laesst einen Monteur nicht fuer einen Kollegen buchen', async () => {
    const { error } = await perl.client
      .from('time_entries')
      .insert({ id: crypto.randomUUID(), ...buchung(perlKollege.uid, 'perl') });
    expect(error?.code).toBe('42501');
  });

  it('laesst die Buchhaltung sehr wohl fuer einen Monteur buchen', async () => {
    // Ohne diese Zeile waere die Rollen-Klausel auch dann „geprueft", wenn sie
    // schlicht alles verboete.
    const { error } = await perlBuero.client
      .from('time_entries')
      .insert({ id: crypto.randomUUID(), ...buchung(perl.uid, 'perl', '2026-09-20') });
    expect(error).toBeNull();
  });
});

describe('Sperrversuch 3: der Zeilenschutz trennt die Betriebe', () => {
  it('ein fremder Betrieb sieht keine einzige Buchung', async () => {
    const zeile = crypto.randomUUID();
    await schreiben(
      { tabelle: 'time_entries', art: 'anlegen', zeile, daten: buchung(perl.uid, 'perl', '2026-09-14') },
      lagerImKopf(), supabaseSender(perl.client), () => false,
    );

    const fremdeSicht = await fremd.client.from('time_entries').select('id').eq('id', zeile);
    expect(fremdeSicht.error).toBeNull();
    expect(fremdeSicht.data).toHaveLength(0);
  });

  it('ein fremder Betrieb sieht die Baustellenliste des anderen nicht', async () => {
    const eigene = await perl.client.from('users').select('id');
    const fremde = await fremd.client.from('users').select('id');
    expect(eigene.data!.length).toBeGreaterThan(0);
    expect(fremde.data!.map((u) => u.id)).not.toContain(perl.uid);
  });

  it('ein abgemeldetes Konto kommt an gar nichts', async () => {
    const ohne = createClient(API, ANON, { auth: { persistSession: false } });
    const { data, error } = await ohne.from('time_entries').select('id');
    // Postgres wirft hier NICHT, es zeigt schlicht nichts: ohne Token ist
    // app.betrieb() leer, und damit trifft keine Lesezeile zu. Eine leere
    // Liste ist die richtige Antwort — ein Fehler waere sogar gespraechiger,
    // als er sein duerfte.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
