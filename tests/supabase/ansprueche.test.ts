/**
 * Die Ansprüche im Token — aus der Belegschaft, nie aus einer Eingabe.
 *
 * `app.betrieb()`, `app.rolle()` und `app.aktiv()` lesen sie, und JEDE
 * einzelne Richtlinie hängt daran. Bisher setzten zwei Cloud Functions sie;
 * jetzt zwei Trigger. Geprüft wird deshalb nicht „der Trigger läuft", sondern
 * was daran hängt: kommt der Mitarbeiter nach einer Rollenänderung an das
 * Richtige, und kommt der ausgeschiedene gar nicht mehr herein.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { API, ANON, admin, betriebAnlegen, konto, deaktivieren, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'anspruch-a';
const PASSWORT = 'stufe-eins-2026';

let anton: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  clientEinreichen(anton.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Die Ansprüche, wie sie am Konto stehen. */
async function ansprueche(uid: string): Promise<Record<string, unknown>> {
  const { data } = await admin.auth.admin.getUserById(uid);
  return (data.user!.app_metadata ?? {}) as Record<string, unknown>;
}

/** Frisch anmelden und die Ansprüche aus dem Token lesen. */
async function ausDemToken(email: string): Promise<Record<string, unknown>> {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await c.auth.signInWithPassword({ email, password: PASSWORT });
  if (an.error) throw an.error;
  const nutz = JSON.parse(
    Buffer.from(an.data.session!.access_token.split('.')[1], 'base64').toString('utf8'),
  ) as { app_metadata?: Record<string, unknown> };
  return nutz.app_metadata ?? {};
}

async function neuesKonto(marke: string): Promise<{ uid: string; email: string }> {
  const email = `${marke}-${crypto.randomUUID().slice(0, 8)}@${BETRIEB}.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORT, email_confirm: true,
  });
  if (error) throw error;
  return { uid: data.user!.id, email };
}

describe('Die Belegschaft setzt die Ansprüche', () => {
  it('ein neu angelegter Mitarbeiter bekommt Betrieb, Rolle und Zustand', async () => {
    /*
      OHNE ANSPRÜCHE GEHT GAR NICHTS: `app.darf()` fragt nach dem Betrieb im
      Token. Ein Konto, das ohne sie angelegt wird, kann sich anmelden und
      sieht nichts — der Fehler, der wie „leere Datenbank" aussieht.
    */
    const { uid, email } = await neuesKonto('neu');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Neu', email, role: 'Verwaltung',
    });

    expect(await ansprueche(uid)).toMatchObject({
      company_id: BETRIEB, role: 'Verwaltung', active: true,
    });
    // Und im Token steht dasselbe — darauf kommt es an.
    expect(await ausDemToken(email)).toMatchObject({
      company_id: BETRIEB, role: 'Verwaltung', active: true,
    });
  }, 30_000);

  it('eine geänderte Rolle steht im nächsten Token', async () => {
    const { uid, email } = await neuesKonto('rolle');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Rolle', email, role: 'Mitarbeiter',
    });
    await admin.from('users').update({ role: 'Buchhaltung' }).eq('id', uid);

    expect(await ausDemToken(email)).toMatchObject({ role: 'Buchhaltung' });
  }, 30_000);

  it('die Anmeldeart bleibt stehen', async () => {
    /*
      In `raw_app_meta_data` stehen auch `provider` und `providers`; die
      braucht die Anmeldung selbst. Ein vollständiges Ersetzen — was
      `setCustomUserClaims` in Firebase tat — würde sie wegräumen, und
      niemand käme mehr herein.
    */
    expect(await ansprueche(anton.uid)).toMatchObject({ provider: 'email' });
  });
});

describe('Ein deaktiviertes Konto kommt nicht mehr herein', () => {
  it('die Anmeldung wird abgewiesen', async () => {
    /*
      DER UNTERSCHIED ZWISCHEN „DEAKTIVIERT" UND „AUSGEBLENDET".

      Stand die Prüfung nur im Browser, behielt ein ausgeschiedener
      Mitarbeiter ein gültiges Konto: mit seinem Passwort und der
      Schnittstelle kam er unverändert an Kunden, Baustellen und Scheine — die
      App liess ihn nur nicht mehr hinein.
    */
    const { uid, email } = await neuesKonto('weg');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Weg', email, role: 'Mitarbeiter',
    });
    await ausDemToken(email); // solange er dabei ist, geht es

    await deaktivieren(uid);
    const c = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await c.auth.signInWithPassword({ email, password: PASSWORT });
    expect(an.error?.code).toBe('user_banned');
  }, 30_000);

  it('und seine laufende Sitzung lässt sich nicht erneuern', async () => {
    /*
      Ohne das Löschen der Sitzung liefe das Konto weiter: das Zugangstoken
      ist kurzlebig, das Erneuerungstoken nicht. Genau darüber hätte sich ein
      ausgeschiedener Mitarbeiter beliebig lange frische Token geholt.
    */
    const { uid, email } = await neuesKonto('sitzung');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Sitzung', email, role: 'Mitarbeiter',
    });
    const c = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await c.auth.signInWithPassword({ email, password: PASSWORT });
    expect(an.error).toBeNull();

    await deaktivieren(uid);
    const erneuert = await c.auth.refreshSession({
      refresh_token: an.data.session!.refresh_token,
    });
    expect(erneuert.error).not.toBeNull();
  }, 30_000);

  it('und sein altes Token kommt SOFORT an nichts mehr', async () => {
    /*
      DAS FENSTER, DAS ES NICHT MEHR GIBT — gemessen, nicht vermutet.

      Ein Zugangstoken trägt seine Ansprüche IN SICH. Nach dem Deaktivieren
      steht darin weiter `active: true`, und solange die Regeln nur das Token
      lasen, konnte ein ausgeschiedener Mitarbeiter bis zu einer Stunde
      weiterlesen und weiterschreiben. Unter Firestore war das genauso; der
      dritte „Riegel" hat dieses Fenster nie geschlossen.

      Jetzt fragt `app.aktiv()` die Belegschaft statt das Token. Das kostet
      einen Zugriff über den Primärschlüssel — Firestore konnte es nicht, dort
      hätte jede Regelprüfung eine gezählte Leseoperation gekostet.
    */
    const { uid, email } = await neuesKonto('sofort');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Sofort', email, role: 'Mitarbeiter',
    });
    await admin.from('customers').insert({ company_id: BETRIEB, name: 'Kunde' });

    const c = createClient(API, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: PASSWORT });
    expect((await c.from('customers').select('*')).data).toHaveLength(1);

    await deaktivieren(uid);
    // Dasselbe Token, dieselbe Sitzung — und nichts mehr zu sehen.
    expect((await c.from('customers').select('*')).data).toEqual([]);
  }, 30_000);

  it('wieder eingestellt kommt er wieder herein', async () => {
    // Ohne das Zurücknehmen der Sperre käme er nie mehr herein, und niemand
    // fände den Grund — in der Belegschaft sähe alles richtig aus.
    const { uid, email } = await neuesKonto('zurueck');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Zurück', email, role: 'Mitarbeiter',
    });
    await deaktivieren(uid);
    await admin.from('users').update({ active: true }).eq('id', uid);

    expect(await ausDemToken(email)).toMatchObject({ active: true });
  }, 30_000);
});

describe('Ein Plattformkonto gehört zu keinem Betrieb', () => {
  it('es bekommt seinen Anspruch und keinen Betrieb', async () => {
    const { uid } = await neuesKonto('plattform');
    await admin.from('platform_admins').insert({ id: uid, name: 'Plattform' });

    const a = await ansprueche(uid);
    expect(a).toMatchObject({ plattform_admin: true });
    expect(a.company_id).toBeUndefined();
    expect(a.role).toBeUndefined();
  }, 30_000);

  it('eine Kennung aus einem Betrieb wird abgewiesen', async () => {
    /*
      GÄBE ES BEIDES FÜR DIESELBE KENNUNG, entschiede allein die Reihenfolge
      der beiden Trigger, welche Ansprüche am Ende stehen: mal ein
      Plattformkonto, mal ein Konto MIT Betrieb — und mit einem Betrieb im
      Token greift jede einzelne Leseregel. Ein Zufall entschiede über
      Leserechte an fremden Kundendaten.

      Anders als bisher wird das nicht protokolliert und durchgelassen,
      sondern abgelehnt: eine Zeile, die etwas behauptet, was nicht gilt, ist
      schlimmer als eine Fehlermeldung.
    */
    const { error } = await admin.from('platform_admins')
      .insert({ id: anton.uid, name: 'Doppelrolle' });
    expect(error).not.toBeNull();
    expect(await ansprueche(anton.uid)).toMatchObject({ company_id: BETRIEB });
  });

  it('und ein Plattformkonto wird in keinen Betrieb aufgenommen', async () => {
    // Dieselbe Grenze von der anderen Seite her.
    const { uid, email } = await neuesKonto('quer');
    await admin.from('platform_admins').insert({ id: uid, name: 'Quer' });

    const { error } = await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Quer', email, role: 'Mitarbeiter',
    });
    expect(error).not.toBeNull();
  }, 30_000);

  it('wer aus einem Betrieb ausscheidet, nimmt dessen Ansprüche nicht mit', async () => {
    /*
      DER ERREICHBARE FALL, UND DESHALB GEPRÜFT. Eine Kennung war in einem
      Betrieb, die Zeile wurde entfernt, und daraus wird ein Plattformkonto.
      Blieben `company_id` und `role` stehen, hätte ein Konto, das in keinen
      Betrieb sehen darf, im Token einen Betrieb — und damit griffe jede
      einzelne Leseregel.
    */
    const { uid, email } = await neuesKonto('wechsel');
    await admin.from('users').insert({
      id: uid, company_id: BETRIEB, name: 'Wechsel', email, role: 'Buchhaltung',
    });
    expect(await ansprueche(uid)).toMatchObject({ company_id: BETRIEB });

    await admin.from('users').delete().eq('id', uid);
    await admin.from('platform_admins').insert({ id: uid, name: 'Wechsel' });

    const a = await ansprueche(uid);
    expect(a).toMatchObject({ plattform_admin: true });
    expect(a.company_id).toBeUndefined();
    expect(a.role).toBeUndefined();
    expect(a.active).toBeUndefined();
  }, 30_000);

  it('wird es entfernt, ist der Anspruch weg', async () => {
    const { uid } = await neuesKonto('temporaer');
    await admin.from('platform_admins').insert({ id: uid, name: 'Temporär' });
    await admin.from('platform_admins').delete().eq('id', uid);

    expect((await ansprueche(uid)).plattform_admin).toBeUndefined();
  }, 30_000);
});
