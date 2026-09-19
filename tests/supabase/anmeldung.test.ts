/**
 * Die Anmeldung auf Supabase — gegen den laufenden Stapel.
 *
 * DER LETZTE BLOCK, DER QUER LAG. Bis zum 14.09.2026 sprach `AuthContext`
 * direkt mit Firebase Auth. Damit liess sich der Umzug gar nicht umschalten:
 * die Datenschicht hätte mit Postgres geredet, das Token wäre weiter von
 * Firebase gekommen, und keine einzige Zeilenregel hätte gegriffen.
 *
 * GEPRÜFT WIRD DURCH DIE WEICHE, nicht an ihr vorbei — importiert wird
 * `@/lib/auth/sitzung` und nicht `@/lib/auth/pg/sitzung`.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { admin, betriebAnlegen } from './helfer';


const sitzung = await import('@/lib/auth/sitzung');
const { InactiveUserError } = sitzung;

const BETRIEB = 'anmeldung-b';
const PASSWORT = 'stufe-eins-2026';

interface Konto { uid: string; email: string }

async function kontoMit(
  marke: string, rolle: string, aktiv = true,
): Promise<Konto> {
  const email = `${marke}-${crypto.randomUUID().slice(0, 8)}@anmeldung.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORT, email_confirm: true,
  });
  if (error) throw error;
  const uid = data.user!.id;
  await admin.from('users').upsert({
    id: uid, company_id: BETRIEB, name: marke, email, role: rolle, active: true,
  });
  if (!aktiv) await admin.from('users').update({ active: false }).eq('id', uid);
  return { uid, email };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Perl Installationen');
}, 120_000);

afterEach(async () => {
  await sitzung.abmelden().catch(() => undefined);
  localStorage.clear();
  sessionStorage.clear();
});

describe('Anmelden und abmelden', () => {
  it('meldet an und liefert Kennung und Adresse', async () => {
    const k = await kontoMit('an-monteur', 'Mitarbeiter');
    const gesehen: Array<{ uid: string; email: string } | null> = [];
    const ab = sitzung.beiAenderung((wer) => gesehen.push(wer));

    await sitzung.anmelden(k.email, PASSWORT);
    await new Promise((r) => setTimeout(r, 300));
    ab();

    expect(gesehen[gesehen.length - 1]).toEqual({ uid: k.uid, email: k.email });
  }, 120_000);

  it('ein falsches Passwort wirft — mit einer Meldung', async () => {
    const k = await kontoMit('an-falsch', 'Mitarbeiter');
    await expect(sitzung.anmelden(k.email, 'daneben')).rejects.toThrow();
  }, 120_000);

  it('abmelden meldet ab, und die Weiche merkt es', async () => {
    const k = await kontoMit('an-abmelden', 'Mitarbeiter');
    const gesehen: Array<unknown> = [];
    const ab = sitzung.beiAenderung((wer) => gesehen.push(wer));

    await sitzung.anmelden(k.email, PASSWORT);
    await new Promise((r) => setTimeout(r, 300));
    await sitzung.abmelden();
    await new Promise((r) => setTimeout(r, 300));
    ab();

    expect(gesehen[gesehen.length - 1]).toBeNull();
  }, 120_000);
});

describe('Wo die Sitzung liegt', () => {
  it('mit „merken" im localStorage — sie überlebt den Browser', async () => {
    const k = await kontoMit('an-merken', 'Mitarbeiter');
    await sitzung.anmelden(k.email, PASSWORT, true);

    const imLokalen = Object.keys(localStorage).filter((s) => s.includes('auth-token'));
    expect(imLokalen.length).toBeGreaterThan(0);
    expect(Object.keys(sessionStorage).filter((s) => s.includes('auth-token'))).toEqual([]);
  }, 120_000);

  it('ohne „merken" im sessionStorage — sie endet mit dem Browser', async () => {
    /*
      DAS GETEILTE BAUSTELLEN-TABLET. Unter Firebase entschied das
      `setPersistence`; Supabase kennt die Wahl beim Anmelden nicht, sondern
      nur am Speicher — deshalb ein Adapter, der bei jedem Zugriff neu
      entscheidet. Läge die Sitzung trotzdem im localStorage, bliebe der
      nächste Monteur als sein Vorgänger angemeldet.
    */
    const k = await kontoMit('an-nichtmerken', 'Mitarbeiter');
    await sitzung.anmelden(k.email, PASSWORT, false);

    expect(Object.keys(sessionStorage).filter((s) => s.includes('auth-token')).length)
      .toBeGreaterThan(0);
    expect(Object.keys(localStorage).filter((s) => s.includes('auth-token'))).toEqual([]);
  }, 120_000);
});

describe('Das Profil hinter der Anmeldung', () => {
  it('kommt mit Betrieb, Rolle und Namen', async () => {
    const k = await kontoMit('an-profil', 'Buchhaltung');
    await sitzung.anmelden(k.email, PASSWORT);

    const profil = await sitzung.profilVomServer(k.uid, k.email);
    expect(profil).toMatchObject({
      uid: k.uid, companyId: BETRIEB, role: 'Buchhaltung', email: k.email,
    });
  }, 120_000);

  it('ein deaktiviertes Konto kommt gar nicht erst herein', async () => {
    /*
      DIE ERSTE SPERRE, und sie ist neu gegenüber Firestore: das Konto wird
      beim Deaktivieren serverseitig gesperrt, die Anmeldung scheitert also
      schon am Anmeldedienst. Dort gab es dieses Fenster noch — das
      ausgestellte Token trug bis zu einer Stunde weiter, was zuletzt galt.
    */
    const k = await kontoMit('an-gesperrt', 'Mitarbeiter', false);
    await expect(sitzung.anmelden(k.email, PASSWORT)).rejects.toThrow();
  }, 120_000);

  it('wer MITTEN IN DER SITZUNG deaktiviert wird, liest das auch so', async () => {
    /*
      DIE ZWEITE SPERRE, UND DIE INTERESSANTERE. Gemessen: der Zeilenschutz
      filtert die eigene Zeile weg, sobald das Konto inaktiv ist — die Abfrage
      gelingt und liefert NICHTS. `active: false` ist nirgends zu sehen.

      Ohne Rückfrage stünde vor dem gerade Ausgeschiedenen „Kein
      Benutzerprofil für dieses Konto gefunden". Nicht falsch, und trotzdem
      die schlechtere Auskunft. `public.mein_zustand()` sieht an der Regel
      vorbei und beantwortet genau eine Frage über den Aufrufer.
    */
    const k = await kontoMit('an-mitten', 'Mitarbeiter');
    await sitzung.anmelden(k.email, PASSWORT);
    expect(await sitzung.profilVomServer(k.uid, k.email)).not.toBeNull();

    await admin.from('users').update({ active: false }).eq('id', k.uid);
    await expect(sitzung.profilVomServer(k.uid, k.email))
      .rejects.toBeInstanceOf(InactiveUserError);
  }, 180_000);

  it('ein Plattformkonto hat gar keines — und bekommt keinen Fehler', async () => {
    /*
      HIER LÄUFT POSTGRES RUHIGER ALS FIRESTORE. Dort war die fehlende Zeile
      ein ABGEWIESENER ZUGRIFF: die Regel las `resource.data.companyId`, und
      bei einem Dokument, das es nicht gibt, ist `resource` leer. Genau daran
      ist die Anmeldung des globalen Administrators einmal gescheitert.

      Der Zeilenschutz filtert stattdessen — keine Zeile, kein Fehler.
    */
    const email = `an-plattform-${crypto.randomUUID().slice(0, 8)}@anmeldung.test`;
    const { data } = await admin.auth.admin.createUser({
      email, password: PASSWORT, email_confirm: true,
    });
    await admin.from('platform_admins').insert({ id: data.user!.id, name: 'Plattform' });

    await sitzung.anmelden(email, PASSWORT);
    expect(await sitzung.profilVomServer(data.user!.id, email)).toBeNull();
    expect(await sitzung.istPlattformAdmin()).toBe(true);
  }, 120_000);

  it('ein gewöhnliches Konto trägt den Plattform-Anspruch nicht', async () => {
    const k = await kontoMit('an-kein-plattform', 'Geschäftsführung');
    await sitzung.anmelden(k.email, PASSWORT);
    expect(await sitzung.istPlattformAdmin()).toBe(false);
  }, 120_000);
});

describe('Der eigene Zwischenspeicher', () => {
  it('zeigt beim nächsten Start sofort, was zuletzt galt', async () => {
    /*
      WAS FIRESTORE VON SELBST TAT UND SUPABASE NICHT. Das Firestore-SDK legte
      jedes gelesene Dokument ab, und der Start las daraus, bevor er das Netz
      fragte. Ohne Ersatz stünde der Monteur im Keller bei jedem Start vor
      einem Ladebalken — genau die Sekunden, die dieses Projekt einmal mühsam
      weggeräumt hat.
    */
    const k = await kontoMit('an-schnell', 'Mitarbeiter');
    await sitzung.anmelden(k.email, PASSWORT);

    // Vor dem ersten Merken ist nichts da — und das ist keine Ausnahme,
    // sondern die allererste Anmeldung auf einem Gerät.
    expect(await sitzung.profilSchnell(k.uid, k.email)).toBeNull();

    const profil = await sitzung.profilVomServer(k.uid, k.email);
    const firma = { id: BETRIEB, name: 'Perl Installationen' };
    sitzung.profilMerken(profil!, firma);

    expect(await sitzung.profilSchnell(k.uid, k.email)).toMatchObject({
      uid: k.uid, companyId: BETRIEB, role: 'Mitarbeiter',
    });
    expect(await sitzung.firmaSchnell(BETRIEB)).toMatchObject({ id: BETRIEB });
  }, 120_000);

  it('und nichts, wenn nach einer fremden Firma gefragt wird', async () => {
    const k = await kontoMit('an-fremd-cache', 'Mitarbeiter');
    await sitzung.anmelden(k.email, PASSWORT);
    const profil = await sitzung.profilVomServer(k.uid, k.email);
    sitzung.profilMerken(profil!, { id: BETRIEB, name: 'Perl' });

    expect(await sitzung.firmaSchnell('gibtesnicht')).toBeNull();
  }, 120_000);
});

describe('Ein Mitarbeiterkonto anlegen', () => {
  it('legt es an, OHNE die eigene Sitzung zu verlieren', async () => {
    /*
      DER FALLSTRICK. Beide Anmeldungen melden den gerade Angelegten sofort
      an — die Anlegende stünde als der neue Mitarbeiter da und hätte dessen
      Rechte. Unter Firebase brauchte es dafür eine zweite App; unter Postgres
      hat sich das Problem aufgelöst, weil `mitarbeiter-anlegen` das Konto
      serverseitig anlegt und dabei niemanden anmeldet.

      HIER STAND „Verwaltung", UND DAS WAR EIN BEFUND. Über `signUp` durfte
      jede Rolle ein Anmeldekonto erzeugen — auch eine, die die Zeile in der
      Belegschaft nie schreiben kann: `users_anlegen` verlangt
      `app.ist_spitze()`, und die Benutzerverwaltung steht in der Navigation
      ohnehin nur der Spitze offen. Herausgekommen wäre genau das Waisenkonto,
      vor dem `provisionUser` warnt: jemand, der sich anmelden kann und nichts
      sieht.

      Die Function zieht die Grenze jetzt dort, wo die Datenbank sie zieht.
      Deshalb legt hier die Geschäftsführung an — nicht, damit die Prüfung
      grün wird, sondern weil das der Weg ist, den es wirklich gibt.
    */
    const verwaltung = await kontoMit('an-verwaltung', 'Geschäftsführung');
    await sitzung.anmelden(verwaltung.email, PASSWORT);

    const neueAdresse = `neu-${crypto.randomUUID().slice(0, 8)}@anmeldung.test`;
    const neueUid = await sitzung.kontoAnlegen(neueAdresse, 'Anfang-2026!x');
    expect(neueUid).toMatch(/^[0-9a-f-]{36}$/);

    // Die Sitzung gehört weiter der Verwaltung.
    const { data } = await (await import('@/lib/supabase')).supabaseClient().auth.getUser();
    expect(data.user?.id).toBe(verwaltung.uid);
  }, 180_000);
});
