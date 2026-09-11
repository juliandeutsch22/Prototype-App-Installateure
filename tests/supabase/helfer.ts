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
  await admin.from('users').upsert({
    id: uid, company_id: betrieb, name: email, email, role: rolle, active: aktiv,
  });

  const client = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await client.auth.signInWithPassword({ email, password: PASSWORT });
  if (an.error) throw an.error;
  await client.realtime.setAuth(an.data.session!.access_token);
  return { client, uid, betrieb, rolle };
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
