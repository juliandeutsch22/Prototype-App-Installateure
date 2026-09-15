/**
 * Gemeinsames Gerüst für die Prüfungen gegen die echte Datenbank.
 *
 * Die Schlüssel sind die öffentlichen Entwicklungsschlüssel der Supabase-CLI
 * — sie stehen so in deren Ausgabe und sind auf jedem Rechner dieselben. Ein
 * Geheimnis ist hier keines; der Stack hört nur auf 127.0.0.1.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

export type Rolle =
  | 'Mitarbeiter' | 'Verwaltung' | 'Buchhaltung'
  | 'Projektleiter' | 'Geschäftsführung' | 'Administrator';

export interface Konto {
  client: SupabaseClient;
  uid: string;
  betrieb: string;
  rolle: Rolle;
  /**
   * Das Anmeldetoken, roh.
   *
   * Der Client trägt es ohnehin mit; herausgereicht wird es für die Edge
   * Functions, die kein `SupabaseClient` aufruft, sondern ein `fetch` mit
   * einem `Authorization`-Kopf. Ohne diese Zeile müsste jede solche Prüfung
   * sich noch einmal selbst anmelden — und prüfte dann ein anderes Token als
   * das, mit dem der Rest der Prüfung arbeitet.
   */
  token: string;
}

const PASSWORT = 'stufe-eins-2026';

export async function betriebAnlegen(id: string, name = id): Promise<void> {
  await admin.from('companies').upsert({ id, name });
}

export async function konto(
  betrieb: string,
  rolle: Rolle,
  marke: string,
  aktiv = true,
): Promise<Konto> {
  const email = `${marke}-${crypto.randomUUID().slice(0, 8)}@${betrieb}.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORT,
    email_confirm: true,
    // app_metadata — NICHT user_metadata: dorthin darf nur der Server
    // schreiben. Die Entsprechung zu den Firebase Custom Claims.
    app_metadata: { company_id: betrieb, role: rolle, active: aktiv },
  });
  if (error) throw error;
  const uid = data.user!.id;
  /*
    ANGELEGT WIRD IMMER AKTIV, GESPERRT WIRD DANACH.

    Ein Konto, das von Anfang an deaktiviert ist, kann sich gar nicht mehr
    anmelden — es bekäme nie ein Token und könnte über die Regeln nichts
    aussagen. Der wirkliche Ablauf ist ohnehin ein anderer: jemand arbeitet,
    und dann wird er deaktiviert. Genau das wird hier nachgestellt.

    Dass dieses Konto danach an nichts mehr herankommt, liegt nicht am Token
    — das trägt noch den alten Anspruch — sondern daran, dass `app.aktiv()`
    die Belegschaft fragt und nicht das Token.
  */
  await admin.from('users').upsert({
    id: uid, company_id: betrieb, name: email, email, role: rolle, active: true,
  });

  const client = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await client.auth.signInWithPassword({ email, password: PASSWORT });
  if (an.error) throw an.error;
  await client.realtime.setAuth(an.data.session!.access_token);
  if (!aktiv) await deaktivieren(uid);
  return { client, uid, betrieb, rolle, token: an.data.session!.access_token };
}

/**
 * Ein Konto wirklich deaktivieren — so, wie es die Verwaltung tut.
 *
 * Der Trigger an der Belegschaft zieht daraus alles Weitere: die Ansprüche,
 * die Kontosperre und das Löschen der Sitzungen.
 */
export async function deaktivieren(uid: string): Promise<void> {
  const { error } = await admin.from('users').update({ active: false }).eq('id', uid);
  if (error) throw new Error(error.message);
}

export const buchung = (k: Konto, datum: string, rest: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  company_id: k.betrieb,
  user_id: k.uid,
  date: datum,
  status: 'Anwesend',
  start_time: '07:00',
  end_time: '16:00',
  break_duration: 30,
  ...rest,
});

/**
 * Den Status einer Antwort lesen und ihren Rumpf WEGRÄUMEN.
 *
 * WARUM DAS NICHT WEGGELASSEN WERDEN DARF, und warum es einen Namen hat statt
 * einer Zeile, die beim nächsten Aufräumen als überflüssig gilt:
 *
 * `fetch` in Node hält die Verbindung offen, solange der Rumpf einer Antwort
 * weder gelesen noch verworfen ist — sie bleibt im Verbindungsvorrat belegt.
 * Bei einer Handvoll Aufrufen fällt das nie auf. In einem Lauf mit
 * sechshundert Prüfungen gegen dieselbe Adresse wartet irgendwann eine
 * Anfrage auf eine Verbindung, die nie frei wird, und stirbt an ihrer Frist —
 * an einer Stelle, die mit der Ursache nichts zu tun hat.
 *
 * Verworfen wird VOR der Behauptung: scheitert sie, wird der Rumpf sonst
 * gerade dann liegengelassen, wenn ohnehin etwas schiefläuft.
 */
export async function nurStatus(antwort: Response): Promise<number> {
  await antwort.body?.cancel().catch(() => undefined);
  return antwort.status;
}
