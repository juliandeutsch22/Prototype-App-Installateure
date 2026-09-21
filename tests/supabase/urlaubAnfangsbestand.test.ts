/**
 * Der Anfangsbestand an Urlaubstagen — durch die echte Datenbank.
 *
 * WARUM DAS NICHT DIE REINE RECHNUNG GENÜGT. `tests/unit/urlaubsstand.test.ts`
 * prüft die Regel. Sie nützt aber nichts, wenn die Zahl den Weg vom Formular
 * bis zur Ansicht gar nicht übersteht: ein Feld, das die Erlaubnisliste in
 * `updateUserProfile` nicht kennt, wird beim Speichern lautlos verworfen —
 * die Maske zeigt danach weiter den eingetippten Wert, bis jemand neu lädt.
 * Genau diese Sorte Lücke ist mit blosser Logikprüfung unsichtbar.
 *
 * Geprüft wird deshalb der ganze Weg: anlegen, lesen, ändern, leeren.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { createUserDoc, getUserByUid, updateUserProfile, listUsers } from '@/lib/db/pg/users';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { urlaubsStand } from '@/lib/time';
import { aliquoterAnspruch } from '@/features/users/benutzerEntwurf';

const BETRIEB = 'urlaub-bestand';

let chef: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  clientEinreichen(chef.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Ein frisches Anmeldekonto, dessen Profil die Prüfung selbst schreibt. */
async function frischeKennung(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `bestand-${crypto.randomUUID().slice(0, 8)}@${BETRIEB}.test`,
    password: 'stufe-eins-2026',
    email_confirm: true,
    app_metadata: { company_id: BETRIEB, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  return data.user!.id;
}

const profil = (uid: string, rest: Record<string, unknown> = {}) => ({
  name: `Petra ${uid.slice(0, 4)}`,
  email: `petra-${uid.slice(0, 4)}@${BETRIEB}.test`,
  role: 'Mitarbeiter' as const,
  active: true,
  appStartDate: '2026-09-15',
  ...rest,
});

describe('Der Anfangsbestand übersteht den Weg', () => {
  it('wird beim Anlegen geschrieben und kommt unverändert zurück', async () => {
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, { yearlyVacationDays: 25, initialVacationDays: 7 }));

    const gelesen = await getUserByUid(BETRIEB, uid);
    expect(gelesen?.initialVacationDays).toBe(7);
  });

  it('bleibt `null`, wenn nichts angegeben wurde', async () => {
    /*
      NICHT 0 UND NICHT 25. „Nicht angegeben" ist eine eigene Aussage: die
      App rechnet dann mit dem vollen Jahresanspruch. Käme hier eine Zahl
      zurück, hätte die Datenbank eine Entscheidung erfunden, die niemand
      getroffen hat.
    */
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, { yearlyVacationDays: 25 }));

    const gelesen = await getUserByUid(BETRIEB, uid);
    expect(gelesen?.initialVacationDays).toBeNull();
  });

  it('lässt sich nachtragen — das ist der häufige Fall', async () => {
    // Beim Anlegen denkt niemand daran; auffallen wird es, wenn der erste
    // Antrag mit einer zu hohen Zahl dasteht. Dann muss es nachtragbar sein.
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, { yearlyVacationDays: 25 }));

    await updateUserProfile(uid, { initialVacationDays: 7 });

    expect((await getUserByUid(BETRIEB, uid))?.initialVacationDays).toBe(7);
  });

  it('lässt sich auch wieder leeren', async () => {
    // Wer ihn irrtümlich gesetzt hat, muss zurück auf „nicht angegeben"
    // kommen. Ohne diesen Weg bliebe eine falsche Zahl für immer stehen.
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, { initialVacationDays: 7 }));

    await updateUserProfile(uid, { initialVacationDays: null });

    expect((await getUserByUid(BETRIEB, uid))?.initialVacationDays).toBeNull();
  });

  it('steht auch in der Liste, aus der die Buchhaltung rechnet', async () => {
    /*
      `listUsers` ist der Weg, den die Mitarbeiterübersicht nimmt — nicht
      `getUserByUid`. Zwei Lesewege, und nur einer geprüft, wäre genau die
      Hälfte, die hinterher fehlt: die Buchhaltung sähe weiter die alte Zahl.
    */
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, { yearlyVacationDays: 25, initialVacationDays: 3 }));

    const ausListe = (await listUsers(BETRIEB)).find((u) => u.uid === uid);
    expect(ausListe?.initialVacationDays).toBe(3);
  });

  it('ergibt am Ende die Zahl, die der Mitarbeiter sieht', async () => {
    /*
      DER DURCHSTICH. Die Rechnung gegen einen Benutzer, der wirklich durch
      die Datenbank gegangen ist — nicht gegen ein im Test gebautes Objekt.
      Zwischen beiden liegt die Spalte, die Umrechnung der Feldnamen und die
      Erlaubnisliste beim Schreiben.
    */
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, { yearlyVacationDays: 25, initialVacationDays: 7 }));
    const benutzer = await getUserByUid(BETRIEB, uid);

    const stand = urlaubsStand(benutzer!, 2026, [{ von: '2026-10-05', tage: 4 }]);
    expect(stand.anspruch).toBe(7);
    expect(stand.rest).toBe(3);

    // Die Gegenprobe: ohne Anfangsbestand stünden hier 25 und 21.
    const ohne = await frischeKennung();
    await createUserDoc(BETRIEB, ohne, profil(ohne, { yearlyVacationDays: 25 }));
    const ohneBestand = urlaubsStand((await getUserByUid(BETRIEB, ohne))!, 2026, [
      { von: '2026-10-05', tage: 4 },
    ]);
    expect(ohneBestand.anspruch).toBe(25);
    expect(ohneBestand.rest).toBe(21);
  });

  /*
    ANTEILIGE TAGE — DIE LÜCKE, DIE DIESE DATEI HATTE.

    Alle Fälle oben rechnen mit ganzen Tagen: 7, 3, null. Genau deshalb ist
    unbemerkt geblieben, dass `initial_vacation_days` `integer` war, während
    die Anlagemaske für einen Neueintritt `Jahresanspruch × Monate / 12`
    vorschlägt — für den 20.09. also 8,33. Die Datenbank wies das ab, das
    Anmeldekonto war da schon angelegt, und die Adresse war verbrannt.

    Gefunden hat es der Probelauf eines echten Betriebs. Die Prüfung nimmt
    ihre Zahl deshalb NICHT von Hand, sondern aus derselben Funktion, aus der
    sie die Maske nimmt: eine hier eingetippte 8.33 wäre in dem Moment
    wertlos, in dem sich die Rechnung ändert.
  */
  it('nimmt den anteiligen Vorschlag eines Neueintritts an', async () => {
    const vorschlag = aliquoterAnspruch(25, '2026-09-20').tage;
    expect(vorschlag).not.toBe(Math.round(vorschlag)); // sonst prüft der Fall nichts

    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, {
      yearlyVacationDays: 25,
      initialVacationDays: vorschlag,
    }));

    expect((await getUserByUid(BETRIEB, uid))?.initialVacationDays).toBe(vorschlag);
  });

  it('rechnet mit den Nachkommastellen weiter, statt sie zu runden', async () => {
    // 8,33 Tage Anspruch, 4 genommen: 4,33 übrig. Würde die Spalte runden,
    // stünden hier 4 — ein Drittel Tag, den niemand verschenkt hat.
    const uid = await frischeKennung();
    await createUserDoc(BETRIEB, uid, profil(uid, {
      yearlyVacationDays: 25,
      initialVacationDays: aliquoterAnspruch(25, '2026-09-20').tage,
    }));

    const stand = urlaubsStand((await getUserByUid(BETRIEB, uid))!, 2026, [
      { von: '2026-10-05', tage: 4 },
    ]);
    expect(stand.anspruch).toBe(8.33);
    expect(stand.rest).toBe(4.33);
  });
});
