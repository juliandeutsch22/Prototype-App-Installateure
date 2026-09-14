/**
 * Einen Betrieb anlegen — die Edge Function gegen den laufenden Stapel.
 *
 * WARUM DAS HIER EINE EDGE FUNCTION IST UND SONST FAST NICHTS. Ein
 * ANMELDEKONTO entsteht im Anmeldedienst, nicht in einer Tabelle: sein
 * Passwort wird dort gehasht, seine Kennung dort vergeben, sein Rücksetzlink
 * dort signiert. Von Hand in `auth.users` zu schreiben hiesse, all das
 * nachzubauen — und beim nächsten Update des Dienstes wäre es falsch.
 *
 * WAS AUF DEM PRÜFSTAND STEHT, sind die beiden Zustände, die wehtun: ein
 * Anmeldekonto ohne Betrieb (die nächste Anlage mit derselben Adresse
 * scheitert, ohne dass irgendwo stünde warum) und ein Betrieb ohne
 * Administrator (nicht zu betreten und nicht zu reparieren, weil sich
 * niemand anmelden kann, um den fehlenden anzulegen).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, API, ANON } from './helfer';

const FUNKTION = `${API}/functions/v1/betrieb-anlegen`;
const PASSWORT = 'stufe-eins-2026';

let plattformToken: string;
let mitarbeiterToken: string;

/** Ein Konto anlegen und sein Token holen — die Function sieht nur das Token. */
async function kontoMitToken(marke: string): Promise<{ uid: string; token: string }> {
  const email = `${marke}-${crypto.randomUUID().slice(0, 8)}@anlage.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORT, email_confirm: true,
  });
  if (error) throw error;
  return { uid: data.user!.id, token: await anmelden(email) };
}

async function anmelden(email: string): Promise<string> {
  const antwort = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORT }),
  });
  const daten = await antwort.json();
  if (!daten.access_token) throw new Error(JSON.stringify(daten));
  return daten.access_token as string;
}

async function anlegen(token: string | null, rumpf: unknown) {
  const antwort = await fetch(FUNKTION, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(rumpf),
  });
  return { status: antwort.status, daten: await antwort.json() };
}

const gueltig = (kennung: string) => ({
  name: 'Gruber Installationen',
  companyId: kennung,
  adminEmail: `chef-${crypto.randomUUID().slice(0, 8)}@gruber.test`,
  adminName: 'Franz Gruber',
});

beforeAll(async () => {
  const plattform = await kontoMitToken('anlage-plattform');
  const { error } = await admin.from('platform_admins')
    .insert({ id: plattform.uid, name: 'Plattform' });
  if (error) throw new Error(error.message);
  // NACH dem Eintrag neu anmelden: der Anspruch steht im Token, und das alte
  // trägt ihn noch nicht.
  plattformToken = plattform.token;

  const mitarbeiter = await kontoMitToken('anlage-mitarbeiter');
  mitarbeiterToken = mitarbeiter.token;
}, 180_000);

describe('Wer einen Betrieb anlegen darf', () => {
  it('ohne Anmeldung niemand', async () => {
    const { status } = await anlegen(null, gueltig('kein-token'));
    expect(status).toBe(401);
  }, 60_000);

  it('ein gewöhnliches Konto nicht', async () => {
    const { status, daten } = await anlegen(mitarbeiterToken, gueltig('kein-admin'));
    expect(status).toBe(403);
    expect(daten.error).toContain('globale Administrator');
  }, 60_000);

  it('ein entzogenes Plattformkonto auch nicht — obwohl sein Token es noch behauptet', async () => {
    /*
      DER PUNKT, UM DEN ES GEHT. Der Anspruch steht im Token und gilt dort bis
      zu einer Stunde weiter. Wer heute früh entzogen wurde, legte sonst noch
      bis Mittag Betriebe an. Gefragt wird deshalb die Tabelle — so wie
      `app.aktiv()` die Belegschaft fragt statt das Token.
    */
    const weg = await kontoMitToken('anlage-entzogen');
    await admin.from('platform_admins').insert({ id: weg.uid, name: 'Kurz' });
    const mitAnspruch = await anmelden(
      (await admin.auth.admin.getUserById(weg.uid)).data.user!.email!,
    );
    await admin.from('platform_admins').delete().eq('id', weg.uid);

    const { status } = await anlegen(mitAnspruch, gueltig('entzogen'));
    expect(status).toBe(403);
  }, 120_000);
});

describe('Ein Betrieb entsteht vollständig oder gar nicht', () => {
  it('legt Firma, ersten Administrator und Protokolleintrag an', async () => {
    const eingabe = gueltig(`anlage-${crypto.randomUUID().slice(0, 6)}`);
    const { status, daten } = await anlegen(plattformToken, eingabe);
    expect(status).toBe(200);
    expect(daten.companyId).toBe(eingabe.companyId);
    expect(daten.ersterAdminUid).toMatch(/^[0-9a-f-]{36}$/);
    // Der Link kommt ZURÜCK, statt versendet zu werden: der Betrieb versendet
    // seine Post selbst.
    expect(daten.passwortLink).toContain('token=');

    const { data: firma } = await admin.from('companies')
      .select('name, rates').eq('id', eingabe.companyId).single();
    expect(firma!.name).toBe('Gruber Installationen');
    // Die Vorgabewerte stehen vom ersten Tag an: sonst stünde auf der ersten
    // Rechnung eine Null, und niemand suchte den Fehler in einem leeren Feld.
    expect(firma!.rates).toMatchObject({ fach: 65, helper: 45, vatRate: 0.2, dueDays: 14 });

    const { data: chef } = await admin.from('users')
      .select('role, active, company_id, name').eq('id', daten.ersterAdminUid).single();
    expect(chef).toMatchObject({
      role: 'Administrator', active: true, company_id: eingabe.companyId,
      name: 'Franz Gruber',
    });

    const { data: protokoll } = await admin.from('betriebsanlagen')
      .select('name, erster_admin_uid').eq('betrieb_kennung', eingabe.companyId).single();
    expect(protokoll!.erster_admin_uid).toBe(daten.ersterAdminUid);
  }, 120_000);

  it('weist eine vergebene Kennung ab und lässt kein Konto zurück', async () => {
    /*
      HIER ENTSTÜNDE SONST DER TEURE REST. Das Anmeldekonto wird zuerst
      angelegt, die Zeilen danach; scheitern die, bleibt ein Konto ohne
      Betrieb liegen — und die nächste Anlage mit derselben Adresse scheitert
      an genau diesem Rest, ohne dass irgendwo stünde warum.
    */
    const kennung = `doppelt-${crypto.randomUUID().slice(0, 6)}`;
    const erste = gueltig(kennung);
    expect((await anlegen(plattformToken, erste)).status).toBe(200);

    const zweite = gueltig(kennung);
    const { status, daten } = await anlegen(plattformToken, zweite);
    expect(status).toBe(409);
    expect(daten.error).toContain('vergeben');

    // Und die Adresse der zweiten Anlage ist wieder frei.
    const { data } = await admin.auth.admin.listUsers();
    expect(data.users.some((u) => u.email === zweite.adminEmail)).toBe(false);
  }, 180_000);

  it('weist eine bereits vergebene Adresse ab', async () => {
    /*
      Ein Konto gehört zu genau einem Betrieb. Bekäme dieselbe Person eine
      zweite Zeile in einem zweiten Betrieb, entschiede allein die Reihenfolge
      der Trigger, in welchem sie landet — und sie stünde eines Morgens im
      falschen Betrieb, ohne dass jemand etwas geändert hätte.
    */
    const erste = gueltig(`adresse-a-${crypto.randomUUID().slice(0, 6)}`);
    expect((await anlegen(plattformToken, erste)).status).toBe(200);

    const zweite = { ...gueltig(`adresse-b-${crypto.randomUUID().slice(0, 6)}`),
      adminEmail: erste.adminEmail };
    const { status, daten } = await anlegen(plattformToken, zweite);
    expect(status).toBe(409);
    expect(daten.error).toContain('gehört zu genau einem Betrieb');

    // Der zweite Betrieb ist NICHT halb entstanden.
    const { data: firma } = await admin.from('companies')
      .select('id').eq('id', zweite.companyId).maybeSingle();
    expect(firma).toBeNull();
  }, 180_000);
});

describe('Die Eingabe wird serverseitig geprüft', () => {
  it('dieselben Regeln wie im Browser', async () => {
    // Der Browser prüft, damit niemand ins Leere tippt; die Function, weil sie
    // die einzige ist, die zählt. Beide lesen `shared/plattform.ts`.
    const faelle: Array<[string, Record<string, unknown>]> = [
      ['Namen', { ...gueltig('ohne-name'), name: '  ' }],
      ['Kleinbuchstaben', { ...gueltig('x'), companyId: 'Nicht Erlaubt!' }],
      ['E-Mail', { ...gueltig('ohne-mail'), adminEmail: 'kein-mail' }],
      ['Administrator', { ...gueltig('ohne-admin'), adminName: '' }],
    ];
    for (const [was, eingabe] of faelle) {
      const { status, daten } = await anlegen(plattformToken, eingabe);
      expect({ was, status }).toEqual({ was, status: 400 });
      expect(daten.error).toBeTruthy();
    }
  }, 120_000);

  it('eine Kennung in Grossbuchstaben wird angenommen und klein gespeichert', async () => {
    // Wer „Perl" eintippt, meint dieselbe Kennung wie „perl". Ihn dafür
    // abzuweisen wäre eine Regel, die sich niemandem erschliesst.
    const kennung = `Gross-${crypto.randomUUID().slice(0, 6)}`;
    const { status, daten } = await anlegen(plattformToken, gueltig(kennung));
    expect(status).toBe(200);
    expect(daten.companyId).toBe(kennung.toLowerCase());
  }, 120_000);
});
