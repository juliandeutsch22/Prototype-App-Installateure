/**
 * Testbericht 30.09.2026, P2 — ein ausgesperrter Betrieb bekommt über den
 * Notzugang wieder ein Passwort, eng begrenzt:
 *   - nur der globale Administrator,
 *   - nur mit offenem Notzugang,
 *   - nur ein aktives Benutzernamen-Konto der Administration oder
 *     Geschäftsführung,
 *   - mit Grund und Identitätsprüfung,
 *   - Startpasswort, alle Sitzungen beendet, Eintrag im Protokoll.
 * Die Gegenproben aus dem Arbeitsauftrag: E-Mail-Konten,
 * Mitarbeiter-Konten und fehlender Notzugang.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';
import { kunstadresse } from '../../shared/benutzername';

const FUNKTION = `${API}/functions/v1/notzugang-passwort`;
const BETRIEB = 'p2-notzugang';
const OHNE = 'p2-ohne-notzugang';
const PASSWORT_ALT = 'Anfang-2026!';

let plattform: Konto;
let chefinMitMail: Konto;
let admin1 = { uid: '', name: '' };
let monteurBn = { uid: '', name: '' };
let adminOhne = { uid: '', name: '' };

async function benutzerkonto(betrieb: string, rolle: string) {
  const name = `p2.${crypto.randomUUID().slice(0, 8)}`;
  const email = kunstadresse(name);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORT_ALT, email_confirm: true,
    app_metadata: { company_id: betrieb, role: rolle, active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: f } = await admin.from('users').upsert({ id: uid, company_id: betrieb, name, email, role: rolle, active: true });
  if (f) throw new Error(f.message);
  return { uid, name };
}

async function rufe(token: string | null, rumpf: unknown) {
  const kopf: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) kopf.Authorization = `Bearer ${token}`;
  const antwort = await fetch(FUNKTION, { method: 'POST', headers: kopf, body: JSON.stringify(rumpf) });
  return { status: antwort.status, daten: await antwort.json().catch(() => ({})) };
}

const anfrage = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, grund: 'Passwort vergessen, einziges Leitungskonto', rueckruf: '+43 1 234 56 78',
  identitaetBestaetigt: true, ...extra,
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(OHNE);
  chefinMitMail = await konto(BETRIEB, 'Geschäftsführung', 'p2gf');
  admin1 = await benutzerkonto(BETRIEB, 'Administrator');
  monteurBn = await benutzerkonto(BETRIEB, 'Mitarbeiter');
  adminOhne = await benutzerkonto(OHNE, 'Administrator');
  plattform = await plattformkonto('p2');
  const auf = await plattform.client.rpc('support_notzugang', { p_company: BETRIEB, p_grund: 'Betrieb ausgesperrt', p_stunden: 2 });
  if (auf.error) throw new Error(auf.error.message);
}, 180_000);

describe('Passwort über den Notzugang (P2)', () => {
  it('die Auswahl zeigt nur Leitungskonten mit Benutzername', async () => {
    const { data, error } = await plattform.client.rpc('plattform_leitungskonten', { p_company: BETRIEB });
    expect(error).toBeNull();
    const uids = (data as { uid: string }[]).map((k) => k.uid);
    expect(uids).toContain(admin1.uid);
    expect(uids).not.toContain(monteurBn.uid);
    expect(uids).not.toContain(chefinMitMail.uid);
  });

  it('setzt ein Startpasswort, beendet die Sitzungen und schreibt ins Protokoll', async () => {
    // Eine offene Sitzung vorher — sie muss danach tot sein.
    const alt = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await alt.auth.signInWithPassword({ email: kunstadresse(admin1.name), password: PASSWORT_ALT });
    expect(an.error).toBeNull();
    const erneuerung = an.data.session!.refresh_token;

    const { status, daten } = await rufe(plattform.token, anfrage(admin1.uid));
    expect(status).toBe(200);
    expect(String(daten.startpasswort)).toMatch(/^[A-Za-z0-9]{14}$/);

    // Mit dem Startpasswort geht es, mit dem alten nicht mehr.
    const neu = createClient(API, ANON, { auth: { persistSession: false } });
    const mitNeu = await neu.auth.signInWithPassword({ email: kunstadresse(admin1.name), password: daten.startpasswort });
    expect(mitNeu.error).toBeNull();
    expect(mitNeu.data.user?.user_metadata?.startpasswort).toBe(true);
    const mitAlt = await createClient(API, ANON, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email: kunstadresse(admin1.name), password: PASSWORT_ALT });
    expect(mitAlt.error).not.toBeNull();

    // Die alte Sitzung lässt sich nicht mehr erneuern.
    const erneuert = await createClient(API, ANON, { auth: { persistSession: false } })
      .auth.refreshSession({ refresh_token: erneuerung });
    expect(erneuert.error).not.toBeNull();

    // Im Protokoll des Betriebs — lesbar für die Leitung.
    const { data: protokoll } = await chefinMitMail.client.from('support_zugriffe')
      .select('bereich').eq('company_id', BETRIEB);
    expect((protokoll ?? []).map((z) => z.bereich).join('\n'))
      .toMatch(/Passwort von .* neu gesetzt .*Grund: Passwort vergessen.*Rückruf an \+43 1 234 56 78/);
  });

  it('Gegenprobe: ein Konto mit E-Mail — das setzt sein Passwort selbst', async () => {
    const { status } = await rufe(plattform.token, anfrage(chefinMitMail.uid));
    expect(status).toBe(403);
  });

  it('Gegenprobe: ein Mitarbeiter-Konto — das setzt der Betrieb zurück', async () => {
    const { status } = await rufe(plattform.token, anfrage(monteurBn.uid));
    expect(status).toBe(403);
  });

  it('Gegenprobe: ohne offenen Notzugang', async () => {
    const { status, daten } = await rufe(plattform.token, anfrage(adminOhne.uid));
    expect(status).toBe(403);
    expect(String(daten.error)).toMatch(/kein Notzugang offen/);
  });

  it('Gegenprobe: ohne Identitätsprüfung', async () => {
    const { status } = await rufe(plattform.token, anfrage(admin1.uid, { identitaetBestaetigt: false }));
    expect(status).toBe(400);
  });

  it('Gegenprobe: ein Konto eines Betriebs ruft die Function nicht', async () => {
    const { status } = await rufe(chefinMitMail.token, anfrage(admin1.uid));
    expect(status).toBe(403);
  });

  it('Schema-Wächter: die beiden Datenbankfunktionen ruft kein angemeldetes Konto direkt', async () => {
    const a = await plattform.client.rpc('notzugang_passwort_pruefen', { p_admin: plattform.uid, p_uid: admin1.uid });
    expect(a.error).not.toBeNull();
    const b = await plattform.client.rpc('notzugang_passwort_festhalten', {
      p_admin: plattform.uid, p_uid: admin1.uid, p_grund: 'x', p_rueckruf: 'y',
    });
    expect(b.error).not.toBeNull();
  });
});
