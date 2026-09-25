/**
 * Die Fotos am Handwerksschein — im Supabase-Speicher (Stufe 6).
 *
 * Die Grenzen hier sind NICHT dieselben wie bei den Zeilen, und das hat einen
 * Grund: eine Speicherregel sieht die Datei, nicht ihren Inhalt. Sie kann
 * nicht prüfen, ob das Bild zum Schein passt — nur, WER es ablegt, WO, WIE
 * GROSS und von welchem Typ. Was sie nicht kann, tut der Schein: er führt die
 * Liste seiner Fotos samt Inhalts-Hash, und die ist nach der Unterschrift
 * eingefroren.
 *
 * DER PFAD IST DER EMPFINDLICHSTE TEIL. Er geht in die Prüfsumme des Scheins
 * ein; ein Umzug, der ihn umschreibt, macht jeden unterschriebenen Beleg
 * unnachrechenbar. Deshalb prüft der erste Test, dass genau der Pfad
 * entsteht, den `fotoPfad` erzeugt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, nurStatus, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { fotoHochladen, fotoAdresse, fotoEntfernen } from '@/lib/db/pg/scheinFotos';
import { fotoPfad } from '@/features/worksheets/fotos';

const BETRIEB = 'fotos-b';
const FREMD = 'fotos-c';
const SCHEIN = 'schein-1';

let monteur: Konto;
let buero: Konto;
let fremder: Konto;

/** Ein Blob mit erkennbarem Inhalt — der Hash muss darüber gebildet werden. */
const bild = (inhalt: string) => new Blob([inhalt], { type: 'image/jpeg' });

/*
  JEDER ABGEWIESENE UPLOAD BRAUCHT EINEN EIGENEN NAMEN.

  Ohne `upsert` weist der Speicher eine bereits vorhandene Datei zurück — mit
  einem Fehler, der genauso aussieht wie der von einer greifenden Regel. Beim
  zweiten Lauf wäre so ein Test grün, ohne die Regel auch nur zu berühren;
  genau das ist hier einmal passiert. Die Läufe teilen sich den Speicher, denn
  `supabase db reset` leert ihn nicht.
*/
const einmalig = () => crypto.randomUUID();

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'foto-monteur');
  buero = await konto(BETRIEB, 'Verwaltung', 'foto-buero');
  fremder = await konto(FREMD, 'Mitarbeiter', 'foto-fremd');
  clientEinreichen(monteur.client);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Ein Foto geht hoch und kommt wieder herunter', () => {
  it('unter genau dem Pfad, der in der Prüfsumme steht', async () => {
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('ein bild'), 1_700_000_000_000);

    expect(eintrag.pfad).toBe(fotoPfad(BETRIEB, SCHEIN, `${eintrag.hash}.jpg`));
    expect(eintrag.pfad.startsWith(`scheine/${BETRIEB}/${SCHEIN}/`)).toBe(true);
    expect(eintrag.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(eintrag.bytes).toBe(8);
    expect(eintrag.geraetZeit).toBe(1_700_000_000_000);
  }, 60_000);

  it('derselbe Inhalt ergibt denselben Pfad — ein Wiederholen legt nichts doppelt an', async () => {
    /*
      Der Hash IST der Dateiname. Ein abgebrochener Upload, der wiederholt
      wird, schreibt genau dorthin, wo der erste hinwollte — statt eine halbe
      Leiche zurückzulassen.
    */
    const erst = await fotoHochladen(BETRIEB, SCHEIN, bild('gleich'), 1);
    const nochmal = await fotoHochladen(BETRIEB, SCHEIN, bild('gleich'), 2);
    expect(nochmal.pfad).toBe(erst.pfad);
  }, 60_000);

  it('die Adresse zeigt auf den Inhalt und ist befristet', async () => {
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('anschauen'), 1);
    const adresse = await fotoAdresse(eintrag.pfad);

    // Anders als `getDownloadURL` gilt sie nicht für immer.
    expect(adresse).toContain('token=');
    const antwort = await fetch(adresse);
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toBe('anschauen');
  }, 60_000);

  it('das Büro sieht die Bilder des Monteurs', async () => {
    // Wer den Schein sehen darf, darf auch seine Fotos sehen.
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('fuer das buero'), 1);
    clientEinreichen(buero.client);
    try {
      const antwort = await fetch(await fotoAdresse(eintrag.pfad));
      expect(await antwort.text()).toBe('fuer das buero');
    } finally {
      clientEinreichen(monteur.client);
    }
  }, 60_000);
});

describe('Die Mandantengrenze im Speicher', () => {
  it('ein fremder Betrieb legt nichts in diesem Ordner ab', async () => {
    clientEinreichen(fremder.client);
    try {
      await expect(fotoHochladen(BETRIEB, SCHEIN, bild('eindringling'), 1))
        .rejects.toThrow();
    } finally {
      clientEinreichen(monteur.client);
    }
  }, 60_000);

  it('und bekommt auch keine Adresse auf ein fremdes Bild', async () => {
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('geheim'), 1);
    clientEinreichen(fremder.client);
    try {
      await expect(fotoAdresse(eintrag.pfad)).rejects.toThrow();
    } finally {
      clientEinreichen(monteur.client);
    }
  }, 60_000);

  it('ein Pfad ohne den Abschnitt „scheine" trägt gar keinen Betrieb', async () => {
    /*
      Die Regel liest den Betrieb aus dem zweiten Abschnitt — aber nur, wenn
      der erste `scheine` heisst. Sonst wäre `irgendwas/fotos-b/…` ein
      Freibrief, den Eimer als Ablage zu benutzen.
    */
    const { error } = await monteur.client.storage
      .from('scheinfotos')
      .upload(`irgendwas/${BETRIEB}/${einmalig()}.jpg`, bild('daneben'),
              { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  }, 60_000);
});

describe('Was der Eimer selbst abweist', () => {
  it('kein Bild über zwei Megabyte', async () => {
    /*
      Der Browser verkleinert auf 1600 Bildpunkte und JPEG — das landet bei
      zwei- bis vierhundert Kilobyte. Die Grenze fängt also nicht den
      Normalfall ab, sondern den Fehler: eine Fassung, die das Verkleinern
      überspringt, und jeden Versuch, den Eimer als Ablage zu benutzen.
    */
    const dick = new Blob(['x'.repeat(3 * 1024 * 1024)], { type: 'image/jpeg' });
    await expect(fotoHochladen(BETRIEB, SCHEIN, dick, 1)).rejects.toThrow();
  }, 60_000);

  it('nichts, was kein Bild ist', async () => {
    const { error } = await monteur.client.storage
      .from('scheinfotos')
      .upload(`scheine/${BETRIEB}/${SCHEIN}/${einmalig()}.csv`,
              new Blob(['a;b'], { type: 'text/csv' }), { contentType: 'text/csv' });
    expect(error).not.toBeNull();
  }, 60_000);

  it('und er ist nicht öffentlich', async () => {
    /*
      Ein öffentlicher Eimer gäbe jedes Foto ohne Anmeldung heraus — die
      Kundenadresse auf dem Typenschild, das offene Rohr in der Wohnung. Die
      befristete Adresse wäre dann nur noch Zierde.
    */
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('nicht oeffentlich'), 1);
    const { data } = monteur.client.storage.from('scheinfotos').getPublicUrl(eintrag.pfad);
    const antwort = await fetch(data.publicUrl);
    expect(await nurStatus(antwort)).toBe(400);
  }, 60_000);
});

describe('Ein Foto entfernen', () => {
  it('nimmt es aus dem Speicher', async () => {
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('weg damit'), 1);
    await fotoEntfernen(eintrag.pfad);
    await expect(fotoAdresse(eintrag.pfad)).rejects.toThrow();
  }, 60_000);

  it('ein zweites Mal ist kein Fehler — das Ziel ist „die Datei ist weg"', async () => {
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('zweimal weg'), 1);
    await fotoEntfernen(eintrag.pfad);
    await expect(fotoEntfernen(eintrag.pfad)).resolves.toBeUndefined();
  }, 60_000);

  it('ein fremder Betrieb entfernt nichts', async () => {
    const eintrag = await fotoHochladen(BETRIEB, SCHEIN, bild('bleibt liegen'), 1);
    clientEinreichen(fremder.client);
    try {
      await fotoEntfernen(eintrag.pfad).catch(() => undefined);
    } finally {
      clientEinreichen(monteur.client);
    }
    /*
      Entscheidend ist nicht die Meldung, sondern dass das Bild noch da ist —
      und WORAN es scheitert, ist hier nicht zu sehen: der Speicherdienst
      sucht vor dem Löschen das Objekt, und daran kommt ein fremder Betrieb
      schon nicht vorbei. Die Löschregel selbst ist damit heute unerreichbar;
      warum sie trotzdem steht, sagt die Migration.
    */
    const antwort = await fetch(await fotoAdresse(eintrag.pfad));
    expect(await antwort.text()).toBe('bleibt liegen');
  }, 60_000);
});

describe('Nach der Unterschrift bleiben die Fotos liegen', () => {
  /*
    PRÜFLAUF 25.09.2026 (P1-10, P3-11). Ersetzen und Löschen fragten nur nach
    dem Betrieb. Jedes Mitglied konnte das Foto eines unterschriebenen
    Scheins entfernen oder überschreiben — die Prüfsumme hätte den Verlust
    hinterher gezeigt, aber das Bild, das der Kunde gesehen hat, wäre weg.
  */
  async function schein(): Promise<string> {
    const id = crypto.randomUUID();
    const { error } = await admin.from('work_sheets').insert({
      id, company_id: BETRIEB, project_number: 'F-1', customer_name: 'Familie Huber',
      datum: '2026-04-01', status: 'Entwurf', abrechnung: 'Regie',
      erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
    });
    if (error) throw new Error(error.message);
    return id;
  }

  async function setzen(id: string, status: string): Promise<void> {
    const { error } = await admin.from('work_sheets').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  it('lässt das Foto eines unterschriebenen Scheins nicht löschen', async () => {
    const id = await schein();
    const eintrag = await fotoHochladen(BETRIEB, id, bild(`beleg ${id}`), 1);
    await setzen(id, 'Unterschrieben');

    await fotoEntfernen(eintrag.pfad).catch(() => undefined);
    const antwort = await fetch(await fotoAdresse(eintrag.pfad));
    expect(await antwort.text()).toBe(`beleg ${id}`);
  }, 60_000);

  it('und nicht mit anderem Inhalt überschreiben — auch nicht nach dem Storno', async () => {
    const id = await schein();
    const eintrag = await fotoHochladen(BETRIEB, id, bild(`echt ${id}`), 1);
    await setzen(id, 'Unterschrieben');
    await setzen(id, 'Storniert');

    const { error } = await monteur.client.storage.from('scheinfotos')
      .upload(eintrag.pfad, bild('ausgetauscht'), { contentType: 'image/jpeg', upsert: true });
    expect(error).not.toBeNull();
    const antwort = await fetch(await fotoAdresse(eintrag.pfad));
    expect(await antwort.text()).toBe(`echt ${id}`);
  }, 60_000);

  it('am Entwurf bleibt Löschen erlaubt — ein Fehlgriff muss vor der Unterschrift weg', async () => {
    const id = await schein();
    const eintrag = await fotoHochladen(BETRIEB, id, bild(`fehlgriff ${id}`), 1);
    await fotoEntfernen(eintrag.pfad);
    await expect(fotoAdresse(eintrag.pfad)).rejects.toThrow();
  }, 60_000);
});
