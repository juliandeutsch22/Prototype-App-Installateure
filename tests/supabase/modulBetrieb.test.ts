/**
 * Wartungen, Nachfassungen und Belegschaft auf Postgres.
 *
 * Drei kleine Module, zwei davon mit einer Eigenheit, die der Umzug auflöst:
 * die fälligen Wartungen brauchten einen Nachfilter im Browser, und die
 * Belegschaft trug ihre Felder teils in `snake_case` und teils nicht.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as wartungen from '@/lib/db/pg/wartungen';
import * as nachfassen from '@/lib/db/pg/followUps';
import * as belegschaft from '@/lib/db/pg/users';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'betrieb-a';

let chef: Konto;
let anton: Konto;
let kundeId = '';

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  const { data } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Hausverwaltung Huber' }).select('id').single();
  kundeId = data!.id as string;
  clientEinreichen(chef.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

async function leeren(): Promise<void> {
  await admin.from('wartungen').delete().eq('company_id', BETRIEB);
  await admin.from('follow_ups').delete().eq('company_id', BETRIEB);
}

const vereinbarung = (rest: Record<string, unknown> = {}) => ({
  customerId: kundeId,
  customerName: 'Hausverwaltung Huber',
  anlage: 'Therme Vaillant ecoTEC, Keller',
  address: 'Hauptstraße 1',
  intervallMonate: 12,
  faelligAm: '2026-05-04',
  aktiv: true,
  ...rest,
});

describe('Wartungen', () => {
  afterEach(() => clientEinreichen(chef.client));

  it('legt an, ändert und löscht', async () => {
    await leeren();
    const id = await wartungen.createWartung(BETRIEB, vereinbarung());
    let [w] = await wartungen.listWartungen(BETRIEB);
    expect(w).toMatchObject({
      customerName: 'Hausverwaltung Huber', intervallMonate: 12,
      faelligAm: '2026-05-04', aktiv: true,
    });

    await wartungen.updateWartung(id, { hinweis: 'Schlüssel bei der Hausmeisterin' });
    [w] = await wartungen.listWartungen(BETRIEB);
    expect(w.hinweis).toBe('Schlüssel bei der Hausmeisterin');

    await wartungen.deleteWartung(id);
    expect(await wartungen.listWartungen(BETRIEB)).toEqual([]);
  });

  it('sortiert nach Termin, nicht nach Name', async () => {
    // Diese Liste beantwortet „was kommt", nicht „wo steht Huber".
    await leeren();
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'A', faelligAm: '2026-09-01' }));
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'Z', faelligAm: '2026-03-01' }));
    const rows = await wartungen.listWartungen(BETRIEB);
    expect(rows.map((w) => w.anlage)).toEqual(['Z', 'A']);
  });

  it('die fälligen lassen ruhende Vereinbarungen aus — in der Abfrage', async () => {
    /*
      DER NACHFILTER IM BROWSER IST WEG, und sein Grund gleich mit. In
      Firestore fand eine Abfrage Dokumente nicht, denen das Feld ganz fehlt;
      eine Vereinbarung ohne `aktiv` wäre stillschweigend aus der Liste der
      fälligen Wartungen verschwunden. Eine Spalte kann nicht fehlen.
    */
    await leeren();
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'Läuft', faelligAm: '2026-03-01' }));
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'Ruht', faelligAm: '2026-03-01', aktiv: false }));
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'Später', faelligAm: '2027-03-01' }));

    const rows = await wartungen.listFaelligeWartungen(BETRIEB, '2026-06-30');
    expect(rows.map((w) => w.anlage)).toEqual(['Läuft']);
  });

  it('die Obergrenze greift auf die richtige Menge', async () => {
    /*
      DER GEWINN. Lief der Ruht-Filter im Browser, schnitt die Grenze VOR ihm
      — eine Grenze von 1 konnte eine ruhende Vereinbarung liefern, die der
      Filter danach verwarf: Ergebnis leer, obwohl eine Wartung fällig war.
    */
    await leeren();
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'Ruht', faelligAm: '2026-01-01', aktiv: false }));
    await wartungen.createWartung(BETRIEB, vereinbarung({ anlage: 'Läuft', faelligAm: '2026-02-01' }));

    const rows = await wartungen.listFaelligeWartungen(BETRIEB, '2026-06-30', 1);
    expect(rows.map((w) => w.anlage)).toEqual(['Läuft']);
  });

  it('die Vereinbarungen eines Kunden', async () => {
    await leeren();
    const { data: k2 } = await admin.from('customers')
      .insert({ company_id: BETRIEB, name: 'Familie Maier' }).select('id').single();
    await wartungen.createWartung(BETRIEB, vereinbarung());
    await wartungen.createWartung(BETRIEB, vereinbarung({
      customerId: k2!.id, customerName: 'Familie Maier', anlage: 'Boiler',
    }));

    const rows = await wartungen.listWartungenForCustomer(BETRIEB, kundeId);
    expect(rows.map((w) => w.anlage)).toEqual(['Therme Vaillant ecoTEC, Keller']);
  });

  it('erledigt setzen rückt den Termin und räumt die Vormerkung weg', async () => {
    /*
      DER SCHRITT, AN DEM DIE VEREINBARUNG LEBT. Ohne ihn wäre die Liste nach
      dem ersten Frühjahr eine Sammlung überfälliger Zeilen, die niemand mehr
      ernst nimmt. Und die eingeplante Baustelle ist mit dem Eintrag gewesen:
      bliebe sie stehen, führe der Monteur beim nächsten Mal auf eine
      abgeschlossene Baustelle.
    */
    await leeren();
    const id = await wartungen.createWartung(BETRIEB, vereinbarung());
    await wartungen.wartungEingeplant(id, 'B-500');
    let [w] = await wartungen.listWartungen(BETRIEB);
    expect(w.offeneBaustelle).toBe('B-500');

    await wartungen.wartungErledigt(id, {
      erledigtAm: '2026-05-06', intervallMonate: 12, projectNumber: 'B-500',
    });
    [w] = await wartungen.listWartungen(BETRIEB);
    expect(w).toMatchObject({
      zuletztAm: '2026-05-06', faelligAm: '2027-05-06',
      intervallMonate: 12, letzteBaustelle: 'B-500',
    });
    expect(w.offeneBaustelle).toBeUndefined();
  });

  it('ein geändertes Intervall gilt schon für den nächsten Termin', async () => {
    // Wer aus zwei Jahren eines macht, erwartet, dass der neue Termin schon
    // danach rechnet — sonst greift die Änderung erst in zwei Jahren.
    await leeren();
    const id = await wartungen.createWartung(BETRIEB, vereinbarung({ intervallMonate: 24 }));
    await wartungen.wartungErledigt(id, { erledigtAm: '2026-05-06', intervallMonate: 12 });
    const [w] = await wartungen.listWartungen(BETRIEB);
    expect(w).toMatchObject({ faelligAm: '2027-05-06', intervallMonate: 12 });
  });

  it('ein unbrauchbares Intervall kommt als abgelehntes Versprechen zurück', async () => {
    /*
      `naechsterTermin` wirft SYNCHRON. Ohne `async` flöge der Fehler an jedem
      `.catch()` vorbei, und der Aufrufer sähe einen Absturz statt einer
      Meldung.
    */
    await leeren();
    const id = await wartungen.createWartung(BETRIEB, vereinbarung());
    await expect(
      wartungen.wartungErledigt(id, { erledigtAm: '2026-05-06', intervallMonate: 0 }),
    ).rejects.toThrow();
  });

  it('ein Monteur sieht die Wartungen, legt aber keine an', async () => {
    await leeren();
    await wartungen.createWartung(BETRIEB, vereinbarung());
    clientEinreichen(anton.client);
    expect(await wartungen.listWartungen(BETRIEB)).toHaveLength(1);
    await expect(wartungen.createWartung(BETRIEB, vereinbarung())).rejects.toThrow();
  });
});

describe('Nachfassungen', () => {
  afterEach(() => clientEinreichen(chef.client));

  it('legt an, listet die offenen und hakt ab', async () => {
    await leeren();
    const id = await nachfassen.createFollowUp(BETRIEB, {
      title: 'Bei Huber wegen der Therme anrufen',
      projectNumber: 'B-100',
      dueWeek: '2026-W19',
      createdFrom: 'voice',
      done: false,
    });
    let rows = await nachfassen.listOpenFollowUps(BETRIEB);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Bei Huber wegen der Therme anrufen', dueWeek: '2026-W19', createdFrom: 'voice',
    });

    await nachfassen.markFollowUpDone(id);
    rows = await nachfassen.listOpenFollowUps(BETRIEB);
    expect(rows).toEqual([]);
  });

  it('auch ein Monteur darf nachfassen', async () => {
    // Die Nachfassung entsteht meist aus einer Sprachnotiz auf der Baustelle.
    await leeren();
    clientEinreichen(anton.client);
    await nachfassen.createFollowUp(BETRIEB, {
      title: 'Dichtung nachbestellen', createdFrom: 'voice', done: false,
    });
    expect(await nachfassen.listOpenFollowUps(BETRIEB)).toHaveLength(1);
  });
});

describe('Belegschaft', () => {
  afterEach(() => clientEinreichen(chef.client));

  it('liest die Stammdaten, und `uid` ist die Kennung', async () => {
    /*
      In Firestore war die Dokumentkennung die Auth-Kennung und `uid` stand
      zusätzlich im Dokument. Hier IST `id` die Auth-Kennung; ein zweites Feld
      dafür wäre eine Kopie, die auseinanderlaufen kann. Für die Ansichten
      wird es gespiegelt.
    */
    const alle = await belegschaft.listUsers(BETRIEB);
    const ich = alle.find((u) => u.id === chef.uid);
    expect(ich!.uid).toBe(chef.uid);
    expect(ich!.role).toBe('Geschäftsführung');
  });

  it('legt ein Profil an und liest es über die Kennung zurück', async () => {
    const { data } = await admin.auth.admin.createUser({
      email: `neu-${crypto.randomUUID().slice(0, 8)}@${BETRIEB}.test`,
      password: 'stufe-eins-2026',
      email_confirm: true,
      app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
    });
    const uid = data.user!.id;

    await belegschaft.createUserDoc(BETRIEB, uid, {
      name: 'Neuer Kollege',
      email: data.user!.email!,
      role: 'Mitarbeiter',
      active: true,
      weeklyTargetHours: 38.5,
      workDays: [1, 2, 3, 4],
      initialOvertime: -12.5,
      appStartDate: '2026-04-01',
    });

    const u = await belegschaft.getUserByUid(BETRIEB, uid);
    expect(u).toMatchObject({
      id: uid, uid, name: 'Neuer Kollege', role: 'Mitarbeiter', active: true,
      weeklyTargetHours: 38.5, initialOvertime: -12.5, appStartDate: '2026-04-01',
    });
    expect(u!.workDays).toEqual([1, 2, 3, 4]);
    // Vorgabe, wo nichts gesetzt ist — dieselbe Zahl wie in `lib/time.ts`.
    expect(u!.yearlyVacationDays).toBe(25);
  });

  it('zweimal anlegen gibt kein zweites Profil', async () => {
    // Beim Einladen eines Benutzers, dessen Konto schon besteht, ist genau
    // das der Normalfall.
    const vorher = (await belegschaft.listUsers(BETRIEB)).length;
    await belegschaft.createUserDoc(BETRIEB, anton.uid, {
      name: 'Anton, neu benannt', email: `a-${anton.uid.slice(0, 8)}@${BETRIEB}.test`,
      role: 'Mitarbeiter', active: true,
    });
    const nachher = await belegschaft.listUsers(BETRIEB);
    expect(nachher).toHaveLength(vorher);
    expect(nachher.find((u) => u.id === anton.uid)!.name).toBe('Anton, neu benannt');
  });

  it('ein Teilschreiben lässt die anderen Felder stehen', async () => {
    await belegschaft.updateUserProfile(anton.uid, { weeklyTargetHours: 20 });
    const u = await belegschaft.getUserByUid(BETRIEB, anton.uid);
    expect(u).toMatchObject({ weeklyTargetHours: 20, active: true, role: 'Mitarbeiter' });
    expect(u!.name).not.toBe('');
  });

  it('die E-Mail lässt sich über das Profil nicht ändern', async () => {
    /*
      Sie ist der Anmeldename und gehört zum Konto, nicht zum Profil. Käme sie
      hier durch, hiesse die Zeile anders als das Konto, mit dem sich der
      Mitarbeiter anmeldet — und er sperrte sich aus, ohne es zu merken.
    */
    const vorher = (await belegschaft.getUserByUid(BETRIEB, anton.uid))!.email;
    await belegschaft.updateUserProfile(anton.uid, {
      name: 'Anton', email: 'woanders@example.test',
    } as Parameters<typeof belegschaft.updateUserProfile>[1]);
    const u = await belegschaft.getUserByUid(BETRIEB, anton.uid);
    expect(u!.email).toBe(vorher);
  });

  it('„nicht gesetzt" heisst bei appStartDate ausdrücklich null', async () => {
    // Der Typ sagt `string | null`. „Gilt von Anfang an" ist eine Aussage,
    // keine Lücke — und das Zeitkonto rechnet danach.
    await belegschaft.updateUserProfile(anton.uid, { appStartDate: null });
    const u = await belegschaft.getUserByUid(BETRIEB, anton.uid);
    expect(u!.appStartDate).toBeNull();
  });

  it('einen Benutzer, den es nicht gibt, gibt es nicht — ohne Fehler', async () => {
    expect(await belegschaft.getUserByUid(BETRIEB, crypto.randomUUID())).toBeNull();
  });

  it('ein Monteur sieht die Belegschaft, ändert aber nichts', async () => {
    clientEinreichen(anton.client);
    expect((await belegschaft.listUsers(BETRIEB)).length).toBeGreaterThan(0);
    await expect(
      belegschaft.updateUserProfile(anton.uid, { role: 'Geschäftsführung' }),
    ).rejects.toThrow();
  });
});
