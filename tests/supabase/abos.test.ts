/**
 * STUFE 0, dritte Frage: halten die Live-Abonnements die Betriebe auseinander?
 *
 * Das ist keine Fleissaufgabe. In Firestore trug jedes Abo die Sicherheitsregel
 * mit sich; bei Supabase sind Abfrage und Meldeweg ZWEI Wege mit zwei
 * Prüfungen. Eine Tabelle in die Veröffentlichung aufzunehmen, ohne dass eine
 * Lese-Richtlinie greift, schickt jede Änderung an jeden angemeldeten
 * Empfänger — quer durch alle Betriebe, ohne dass eine einzige Abfrage je
 * etwas Falsches zurückgäbe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

async function konto(betrieb: string, email: string) {
  await admin.from('companies').upsert({ id: betrieb, name: betrieb });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'sperrversuch-2026',
    email_confirm: true,
    app_metadata: { company_id: betrieb, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  await admin.from('users').upsert({ id: uid, company_id: betrieb, name: email, email, role: 'Mitarbeiter', active: true });
  const client = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await client.auth.signInWithPassword({ email, password: 'sperrversuch-2026' });
  if (an.error) throw an.error;
  // Der Meldeweg hat eine EIGENE Anmeldung. Ohne diese Zeile hört der Kanal
  // als „anon" zu — und sieht dann gar nichts, was man leicht für „sicher"
  // hält, obwohl nur das Token fehlt.
  await client.realtime.setAuth(an.data.session!.access_token);
  return { client, uid };
}

function buchung(uid: string, betrieb: string, datum: string) {
  return {
    id: crypto.randomUUID(),
    company_id: betrieb,
    user_id: uid,
    date: datum,
    status: 'Anwesend',
    start_time: '07:00',
    end_time: '16:00',
    break_duration: 30,
  };
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hört eine Weile zu und gibt zurück, was angekommen ist. */
function zuhoeren(client: SupabaseClient, name: string) {
  const empfangen: Array<Record<string, unknown>> = [];
  let kanal: RealtimeChannel;
  const bereit = new Promise<void>((gelingt, scheitert) => {
    kanal = client
      .channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'time_entries' }, (n) => {
        empfangen.push(n.new as Record<string, unknown>);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') gelingt();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') scheitert(new Error(status));
      });
  });
  return { empfangen, bereit, schliessen: () => client.removeChannel(kanal!) };
}

/**
 * BEFUND AUS STUFE 0, und einer mit Folgen für Stufe 4.
 *
 * `SUBSCRIBED` sagt, dass der Kanal steht — NICHT, dass das Abonnement
 * serverseitig schon hört. Die Zeile in `realtime.subscription` wird danach
 * geschrieben, und erst dann greift die Fortschreibung. Wer unmittelbar nach
 * `SUBSCRIBED` schreibt, verliert die Meldung lautlos.
 *
 * Für die App heisst das: Abonnieren und den Bestand holen sind zwei
 * Vorgänge mit einer Lücke dazwischen. Firestore hat beides in einem
 * geliefert (der erste Schnappschuss kam aus demselben Abo). Beim Umbau der
 * elf Abonnements in Stufe 4 muss deshalb ZUERST abonniert, DANN der Bestand
 * geholt werden — sonst fehlt genau das, was in der Lücke passiert.
 */
async function warteBisDasAboHoert(
  ohr: { empfangen: Array<Record<string, unknown>> },
  uid: string,
  betrieb: string,
): Promise<void> {
  // Eine feste Wartezeit waere geraten: nach einem Neustart des Stacks braucht
  // der Meldeweg laenger als im warmen Zustand, und ein Test, der mal faellt
  // und mal nicht, ist schlimmer als keiner. Also wird gewartet, bis eine
  // eigens dafuer geschriebene Zeile ANKOMMT — dann steht fest, dass der Weg
  // laeuft.
  for (let i = 0; i < 20; i += 1) {
    const koeder = buchung(uid, betrieb, '2026-12-31');
    await admin.from('time_entries').insert(koeder);
    for (let j = 0; j < 10; j += 1) {
      if (ohr.empfangen.some((z) => z.id === koeder.id)) {
        ohr.empfangen.length = 0; // Der Koeder gehoert nicht zur Messung.
        return;
      }
      await warte(50);
    }
  }
  throw new Error('Das Abonnement hat auch nach 20 Versuchen nichts gemeldet');
}

let perl: Awaited<ReturnType<typeof konto>>;
let huber: Awaited<ReturnType<typeof konto>>;

beforeAll(async () => {
  const s = Date.now();
  perl = await konto('perl', `abo-${s}@perl.test`);
  huber = await konto('huber', `abo-${s}@huber.test`);
}, 60_000);

afterAll(async () => {
  await perl?.client.removeAllChannels();
  await huber?.client.removeAllChannels();
});

describe('Live-Abonnements unter Zeilenschutz', () => {
  it('meldet dem eigenen Betrieb, was im eigenen Betrieb geschieht', async () => {
    const ohr = zuhoeren(perl.client, `perl-${Date.now()}`);
    await ohr.bereit;
    await warteBisDasAboHoert(ohr, perl.uid, 'perl');

    const zeile = buchung(perl.uid, 'perl', '2026-10-01');
    const los = Date.now();
    await admin.from('time_entries').insert(zeile);

    for (let i = 0; i < 60 && ohr.empfangen.length === 0; i += 1) await warte(50);
    const gebraucht = Date.now() - los;

    expect(ohr.empfangen.map((z) => z.id)).toContain(zeile.id);
    // Keine Leistungszusage, nur eine Messung: bleibt das im Sekundenbereich,
    // ist der Meldeweg als Ersatz für onSnapshot brauchbar.
    expect(gebraucht).toBeLessThan(3000);
    ohr.schliessen();
  });

  it('meldet einem fremden Betrieb NICHTS', async () => {
    const perlOhr = zuhoeren(perl.client, `perl-b-${Date.now()}`);
    const huberOhr = zuhoeren(huber.client, `huber-b-${Date.now()}`);
    await Promise.all([perlOhr.bereit, huberOhr.bereit]);
    // BEIDE Kanaele muessen nachweislich hoeren. Sonst waere „huber hat nichts
    // bekommen" auch dann erfuellt, wenn hubers Kanal schlicht noch nicht lief
    // — und der Test bewiese das Gegenteil von dem, was er behauptet.
    await warteBisDasAboHoert(perlOhr, perl.uid, 'perl');
    await warteBisDasAboHoert(huberOhr, huber.uid, 'huber');

    const zeile = buchung(perl.uid, 'perl', '2026-10-02');
    await admin.from('time_entries').insert(zeile);

    // Auf die eigene Meldung warten — erst dann ist belegt, dass der Weg
    // überhaupt lief und das Schweigen beim anderen kein Zufall ist.
    for (let i = 0; i < 60 && perlOhr.empfangen.length === 0; i += 1) await warte(50);
    await warte(500);

    expect(perlOhr.empfangen.map((z) => z.id)).toContain(zeile.id);
    expect(huberOhr.empfangen).toHaveLength(0);

    perlOhr.schliessen();
    huberOhr.schliessen();
  });
});
