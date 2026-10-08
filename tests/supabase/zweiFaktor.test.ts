/**
 * Zwei-Faktor-Anmeldung (Testbericht Runde 3, H1 Teil 2) — gegen die echte
 * Datenbank und den echten Anmeldedienst.
 *
 * Abnahme aus dem Arbeitsauftrag:
 *   - Anmeldung ohne zweiten Faktor wird für das Plattformkonto abgewiesen
 *     (Datenbank UND Edge Function);
 *   - ein Wiederherstellungscode funktioniert genau einmal.
 * Dazu freiwillige Faktoren im Betrieb, „wer einen hat, braucht ihn“,
 * und das Zurücksetzen über den Notzugang mit Rückruf.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  admin, API, ANON, betriebAnlegen, konto, plattformkonto, zweitenFaktorEinrichten, type Konto,
} from './helfer';
import { totp } from '../totp';

const BETRIEB = 'zf-betrieb';
const PASSWORT = 'stufe-eins-2026';

let plattform: Konto;
let plattformOhne: Konto & { geheimnis: string | null };
let chefin: Konto;
let administrator: Konto;
let monteur: Konto;

async function emailVon(uid: string): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(uid);
  return data.user!.email!;
}

/** Nur mit Passwort angemeldet — die Sitzung trägt `aal1`. */
async function nurPasswort(uid: string): Promise<{ client: SupabaseClient; token: string }> {
  const client = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await client.auth.signInWithPassword({ email: await emailVon(uid), password: PASSWORT });
  if (an.error) throw an.error;
  return { client, token: an.data.session!.access_token };
}

async function mitCode(client: SupabaseClient, geheimnis: string): Promise<void> {
  const { data } = await client.auth.mfa.listFactors();
  const faktor = data!.totp[0];
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: faktor.id, code: totp(geheimnis) });
  if (error) throw error;
}

async function rufe(fn: string, token: string, rumpf: unknown) {
  const antwort = await fetch(`${API}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(rumpf),
  });
  return { status: antwort.status, daten: await antwort.json().catch(() => ({})) as Record<string, unknown> };
}

async function siehtSichSelbst(client: SupabaseClient, uid: string): Promise<boolean> {
  const { data } = await client.from('users').select('id').eq('id', uid);
  return (data ?? []).length === 1;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  plattform = await plattformkonto('zf');
  plattformOhne = await plattformkonto('zfohne', { zweiterFaktor: false });
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'zfgf');
  administrator = await konto(BETRIEB, 'Administrator', 'zfadm');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zfmont');
}, 120_000);

describe('Plattformkonto: zweiter Faktor ist Pflicht', () => {
  it('ohne zweiten Faktor: angemeldet, aber jede Plattformfunktion abgewiesen', async () => {
    const liste = await plattformOhne.client.rpc('plattform_betriebe');
    expect(liste.error?.code).toBe('42501');
    const { data: stand } = await plattformOhne.client.rpc('mein_zweiter_faktor');
    expect(stand).toMatchObject({ pflicht: true, plattform: true, eingerichtet: false });
  });

  it('ohne zweiten Faktor: auch die Edge Function weist ab', async () => {
    const r = await rufe('betrieb-anlegen', plattformOhne.token, { name: 'Versuch GmbH', companyId: 'zf-versuch' });
    expect(r.status).toBe(403);
    expect(String(r.daten.error)).toMatch(/Zwei-Faktor/);
  });

  it('Gegenprobe: mit zweitem Faktor geht es', async () => {
    const liste = await plattform.client.rpc('plattform_betriebe');
    expect(liste.error).toBeNull();
  });

  it('mit Faktor eingerichtet, aber nur mit Passwort angemeldet: wieder abgewiesen', async () => {
    const { client } = await nurPasswort(plattform.uid);
    const { data: stufe } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(stufe).toMatchObject({ currentLevel: 'aal1', nextLevel: 'aal2' });
    expect((await client.rpc('plattform_betriebe')).error?.code).toBe('42501');
  });
});

describe('Leitung im Betrieb', () => {
  it('ohne Pflicht und ohne Faktor: wie bisher', async () => {
    expect(await siehtSichSelbst(chefin.client, chefin.uid)).toBe(true);
    const { data } = await chefin.client.rpc('mein_zweiter_faktor');
    expect(data).toMatchObject({ angeboten: true, pflicht: false, eingerichtet: false });
    const { data: m } = await monteur.client.rpc('mein_zweiter_faktor');
    expect(m).toMatchObject({ angeboten: false, pflicht: false });
  });

  it('der Betrieb kann keine Zwei-Faktor-Pflicht einschalten', async () => {
    const ohne = await chefin.client.from('companies').update({ zwei_faktor_pflicht: true }).eq('id', BETRIEB);
    expect(ohne.error?.code).toBe('42501');
  });

  let geheimnisChefin = '';
  it('wer einen zweiten Faktor hat, braucht ihn — mit Passwort allein sieht er nichts', async () => {
    geheimnisChefin = await zweitenFaktorEinrichten(chefin.client);
    const { client } = await nurPasswort(chefin.uid);
    expect(await siehtSichSelbst(client, chefin.uid)).toBe(false);
    await mitCode(client, geheimnisChefin);
    expect(await siehtSichSelbst(client, chefin.uid)).toBe(true);
  });

  it('auch die Edge Functions verlangen ihn', async () => {
    const { token } = await nurPasswort(chefin.uid);
    const r = await rufe('mitarbeiter-anlegen', token, { email: 'neu@zf-betrieb.test', passwort: 'Lang-genug-2026' });
    expect(r.status).toBe(403);
  });

  it('auch mit eigenem Faktor keine Betriebspflicht; ein historischer Schalter sperrt niemanden', async () => {
    const r = await chefin.client.from('companies').update({ zwei_faktor_pflicht: true }).eq('id', BETRIEB);
    expect(r.error?.code).toBe('42501');
    expect((await admin.from('companies').update({ zwei_faktor_pflicht: true }).eq('id', BETRIEB)).error).toBeNull();
    const adm = await nurPasswort(administrator.uid);
    expect(await siehtSichSelbst(adm.client, administrator.uid)).toBe(true);
    const { data } = await adm.client.rpc('mein_zweiter_faktor');
    expect(data).toMatchObject({ pflicht: false, eingerichtet: false, betrieb_pflicht: false });
    const mont = await nurPasswort(monteur.uid);
    expect(await siehtSichSelbst(mont.client, monteur.uid)).toBe(true);
    // Freiwillige Einrichtung bleibt möglich.
    await zweitenFaktorEinrichten(adm.client);
    expect(await siehtSichSelbst(adm.client, administrator.uid)).toBe(true);
  });

  it('die Datenauskunft nennt den zweiten Faktor, nie das Geheimnis', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chefin.uid });
    expect(error).toBeNull();
    const text = JSON.stringify(data);
    expect((data as { daten?: { anmeldung?: Record<string, unknown> } }).daten?.anmeldung?.zweiter_faktor_seit
      ?? JSON.parse(text).anmeldung?.zweiter_faktor_seit).toBeTruthy();
    expect(text).not.toContain(geheimnisChefin);
  });
});

describe('Wiederherstellungscodes', () => {
  let codes: string[] = [];
  let konto2: Konto;
  beforeAll(async () => {
    konto2 = await konto(BETRIEB, 'Geschäftsführung', 'zfcodes');
  });

  it('gibt es nur mit bestätigtem zweiten Faktor', async () => {
    const ohne = await konto2.client.rpc('zwei_faktor_codes_erzeugen');
    expect(ohne.error?.code).toBe('42501');
    await zweitenFaktorEinrichten(konto2.client);
    const { data, error } = await konto2.client.rpc('zwei_faktor_codes_erzeugen');
    expect(error).toBeNull();
    codes = data as string[];
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const { rows } = { rows: (await admin.from('zwei_faktor_codes').select('code_hash').eq('user_id', konto2.uid)).data ?? [] };
    expect(JSON.stringify(rows)).not.toContain(codes[0]);
  });

  it('ein Code funktioniert genau einmal — und entfernt den zweiten Faktor', async () => {
    const { client } = await nurPasswort(konto2.uid);
    // Der freiwillig eingerichtete Faktor schützt das Konto auch ohne Betriebspflicht.
    expect(await siehtSichSelbst(client, konto2.uid)).toBe(false);
    const falsch = await client.rpc('zwei_faktor_code_einloesen', { p_code: 'AAAA-AAAA' });
    expect(falsch.data).toBe(false);
    const richtig = await client.rpc('zwei_faktor_code_einloesen', { p_code: codes[3].toLowerCase().replace('-', ' ') });
    expect(richtig.error).toBeNull();
    expect(richtig.data).toBe(true);
    const { data: faktoren } = await admin.auth.admin.mfa.listFactors({ userId: konto2.uid });
    expect(faktoren?.factors ?? []).toHaveLength(0);
    // Derselbe Code ein zweites Mal: abgewiesen. Ein anderer Code dieses Satzes ebenso.
    expect((await client.rpc('zwei_faktor_code_einloesen', { p_code: codes[3] })).data).toBe(false);
    expect((await client.rpc('zwei_faktor_code_einloesen', { p_code: codes[4] })).data).toBe(false);
    // Nach Wiederherstellung ist die erneute Einrichtung freiwillig.
    await client.auth.refreshSession();
    expect((await client.rpc('mein_zweiter_faktor')).data).toMatchObject({ pflicht: false, eingerichtet: false });
    expect(await siehtSichSelbst(client, konto2.uid)).toBe(true);
    await zweitenFaktorEinrichten(client);
    expect(await siehtSichSelbst(client, konto2.uid)).toBe(true);
  });

  it('nach fünf falschen Codes in einer Viertelstunde ist Schluss', async () => {
    const k = await konto(BETRIEB, 'Geschäftsführung', 'zfsperre');
    await zweitenFaktorEinrichten(k.client);
    for (let i = 0; i < 5; i += 1) {
      expect((await k.client.rpc('zwei_faktor_code_einloesen', { p_code: `FALS-CH0${i}` })).data).toBe(false);
    }
    const gesperrt = await k.client.rpc('zwei_faktor_code_einloesen', { p_code: 'FALS-CH99' });
    expect(gesperrt.error?.message).toMatch(/Zu viele/);
  });
});

describe('Zurücksetzen über den Notzugang', () => {
  it('Gegenprobe: ohne Notzugang abgewiesen', async () => {
    const r = await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: chefin.uid, p_grund: 'Telefon verloren', p_rueckruf: '+43 1 234 56 78',
    });
    expect(r.error?.code).toBe('42501');
  });

  it('mit Notzugang, Grund und Rückruf: Faktor weg, Sitzungen beendet, im Protokoll', async () => {
    const auf = await plattform.client.rpc('support_notzugang', { p_company: BETRIEB, p_grund: 'Telefon verloren', p_stunden: 2 });
    expect(auf.error).toBeNull();
    const { data: liste } = await plattform.client.rpc('plattform_leitung_mit_zweitem_faktor', { p_company: BETRIEB });
    expect((liste as { uid: string }[]).map((k) => k.uid)).toContain(chefin.uid);
    const ohneRueckruf = await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: chefin.uid, p_grund: 'Telefon verloren', p_rueckruf: ' ',
    });
    expect(ohneRueckruf.error?.code).toBe('22023');
    const monteurGeht = await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: monteur.uid, p_grund: 'x', p_rueckruf: '+43 1',
    });
    expect(monteurGeht.error?.code).toBe('42501');

    const r = await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: chefin.uid, p_grund: 'Telefon verloren', p_rueckruf: '+43 1 234 56 78',
    });
    expect(r.error).toBeNull();
    const { data: faktoren } = await admin.auth.admin.mfa.listFactors({ userId: chefin.uid });
    expect(faktoren?.factors ?? []).toHaveLength(0);
    const { data: prot } = await admin.from('support_zugriffe').select('bereich').eq('company_id', BETRIEB);
    expect((prot ?? []).map((z) => z.bereich).join('\n'))
      .toMatch(/Zwei-Faktor-Anmeldung von .* zurückgesetzt .*Rückruf an \+43 1 234 56 78/);
  });

  it('ohne zweiten Faktor darf auch die Plattform das nicht', async () => {
    const r = await plattformOhne.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: administrator.uid, p_grund: 'x', p_rueckruf: 'y',
    });
    expect(r.error?.code).toBe('42501');
  });
});

/*
  DEN NOTZUGANG WIEDER SCHLIESSEN. `support_freigaben_offen` nennt der
  Plattform alle offenen Freigaben aller Betriebe — ein hier offen gelassener
  Notzugang stünde sonst im Ergebnis von `supportzugang.test.ts`, je nachdem,
  welche Datei zuerst läuft.
*/
afterAll(async () => {
  await admin.from('support_freigaben').update({ widerrufen_am: new Date().toISOString() })
    .eq('company_id', BETRIEB).is('widerrufen_am', null);
});
