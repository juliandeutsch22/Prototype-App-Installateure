/**
 * Die DATEIEN in der Sicherung — die Fotos am Handwerksschein.
 *
 * WAS HIER AUF DEM PRÜFSTAND STEHT. Die Ausleitung schreibt Tabellenzeilen;
 * ein Foto ist keine Zeile. Ohne die Dateien käme bei einem Wiederanlauf der
 * Schein zurück und seine Beweisfotos nicht — und genau die sind der Grund,
 * warum es den Schein gibt.
 *
 * DREI TEILE, UND JEDER HAT SEINE EIGENE ART ZU SCHEITERN:
 *
 *   DIE AUSWAHL    „welche Datei fehlt noch draussen?" — gegen die echte
 *                  Datenbank, samt Mandantengrenze und Obergrenze.
 *   DIE BUCHFÜHRUNG „was liegt schon draussen?" — sie muss es sein, weil das
 *                  Dienstkonto im Zielspeicher nicht nachsehen darf.
 *   DER TRANSPORT  der signierte PUT — gegen einen ECHTEN S3-Dienst.
 *
 * DASS DER TRANSPORT HIER WIRKLICH LÄUFT, ist keine Selbstverständlichkeit.
 * Der Zielspeicher liegt im Betrieb ausserhalb dieses Projekts, und den gibt
 * es im lokalen Stapel nicht. Wohl aber spricht der Supabase-Speicher selbst
 * die S3-Schnittstelle — mit einem echten Server, der eine falsche Signatur
 * mit 403 abweist. Bis hierher war die Signatur nur gegen die
 * veröffentlichten AWS-Testvektoren gerechnet; das ist viel, aber es ist
 * Papier. Jetzt nimmt sie ein Server an.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, API, SERVICE, betriebAnlegen, konto, type Konto } from './helfer';
import { fotoPfad } from '@/features/worksheets/fotos';
import { dateiZielPfad, putAnfrage } from '@shared/ausleitungZiel';
import { pfadKodieren } from '@shared/s3Signatur';

const EIMER = 'scheinfotos';
const BETRIEB = 'ausl-dat-b';
const FREMD = 'ausl-dat-c';

let chef: Konto;
let db: Client;

/** Ein Bild mit erkennbarer Länge — die Bytes zählen hier wirklich. */
const bild = (inhalt: string) => new Blob([inhalt], { type: 'image/jpeg' });

async function hochladen(betrieb: string, schein: string, name: string, inhalt: string) {
  const pfad = fotoPfad(betrieb, schein, name);
  const { error } = await admin.storage
    .from(EIMER)
    .upload(pfad, bild(inhalt), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return pfad;
}

async function offene(betrieb: string, grenze = 100) {
  const { data, error } = await admin.rpc('sicherungs_dateien', {
    p_betrieb: betrieb, p_grenze: grenze,
  });
  if (error) throw new Error(error.message);
  return data as Array<{ eimer: string; pfad: string; bytes: number }>;
}

async function offenAnzahl(betrieb: string) {
  const { data, error } = await admin.rpc('sicherungs_dateien_offen', { p_betrieb: betrieb });
  if (error) throw new Error(error.message);
  return Number(data);
}

/**
 * Den Speicher der beiden Prüfbetriebe leeren.
 *
 * `supabase db reset` LEERT DEN SPEICHER NICHT — die Dateien früherer Läufe
 * bleiben liegen. Ohne dieses Aufräumen zählte die Prüfung beim zweiten Lauf
 * andere Zahlen als beim ersten und wäre grün oder rot je nachdem, wie oft
 * sie schon gelaufen ist.
 */
async function speicherLeeren(betrieb: string) {
  const { data } = await admin.storage.from(EIMER).list(`scheine/${betrieb}`);
  for (const ordner of data ?? []) {
    const { data: dateien } = await admin.storage
      .from(EIMER).list(`scheine/${betrieb}/${ordner.name}`);
    const pfade = (dateien ?? []).map((d) => `scheine/${betrieb}/${ordner.name}/${d.name}`);
    if (pfade.length > 0) await admin.storage.from(EIMER).remove(pfade);
  }
  await admin.from('ausleitung_dateien').delete().eq('company_id', betrieb);
}

beforeAll(async () => {
  db = new Client({ connectionString:
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();

  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  await betriebAnlegen(FREMD, 'Gruber Installationen');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'ausl-dat-chef');

  await speicherLeeren(BETRIEB);
  await speicherLeeren(FREMD);
}, 240_000);

afterAll(async () => { await db.end(); });

describe('Welche Dateien noch hinaus müssen', () => {
  it('nennt jedes Foto des Betriebs — mit Eimer, Pfad und Grösse', async () => {
    const pfad = await hochladen(BETRIEB, 'schein-a', 'aaa.jpg', 'kurz');

    const liste = await offene(BETRIEB);
    const treffer = liste.find((d) => d.pfad === pfad);
    expect(treffer).toBeDefined();
    expect(treffer!.eimer).toBe(EIMER);
    /*
      DIE GRÖSSE KOMMT MIT, weil der Lauf sie braucht, um seine Bytegrenze zu
      halten. Stünde dort eine 0, nähme ein Lauf beliebig viele grosse Bilder
      auf einmal und liefe in seine Wanduhr.
    */
    expect(treffer!.bytes).toBe(new Blob(['kurz']).size);
  }, 60_000);

  it('nennt NICHT die Fotos eines fremden Betriebs', async () => {
    /*
      DIE MANDANTENGRENZE AM SPEICHER. Sie steht im Pfad und wird von
      `app.foto_betrieb` gezogen — derselben Funktion, an der auch die
      Leseregel des Eimers hängt. Griffe sie hier daneben, landeten die
      Bilder des einen Betriebs in der Sicherung des anderen.
    */
    const fremd = await hochladen(FREMD, 'schein-f', 'fff.jpg', 'fremdes bild');

    const liste = await offene(BETRIEB);
    expect(liste.map((d) => d.pfad)).not.toContain(fremd);
    expect((await offene(FREMD)).map((d) => d.pfad)).toContain(fremd);
  }, 60_000);

  it('nennt auch eine Datei OHNE Zeile im Schein', async () => {
    /*
      GEFRAGT WIRD DER SPEICHER, NICHT DIE ZEILEN. Ginge die Liste über
      `work_sheet_photos`, fiele jede Datei heraus, deren Zeile fehlt — und
      genau die bräuchte man am dringendsten. Hier gibt es zu keinem der
      hochgeladenen Bilder eine Zeile, und gesichert werden sie trotzdem.
    */
    const waise = await hochladen(BETRIEB, 'schein-ohne-zeile', 'www.jpg', 'mittellanges bild');

    const { count } = await admin
      .from('work_sheet_photos')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', BETRIEB);
    expect(count).toBe(0);
    expect((await offene(BETRIEB)).map((d) => d.pfad)).toContain(waise);
  }, 60_000);

  it('hält die Obergrenze ein — und gibt bei jedem Aufruf dieselbe Reihenfolge', async () => {
    /*
      OHNE FESTE REIHENFOLGE ARBEITET SICH EIN RÜCKSTAND NIE AB. Griffe jeder
      Lauf eine andere Auswahl, nähme er womöglich immer wieder dieselben
      ersten Dateien — und die letzten kämen nie hinaus. Das fiele niemandem
      auf, weil jeder einzelne Lauf erfolgreich aussieht.
    */
    /*
      DIE GRÖSSEN SIND ABSICHTLICH GEGENLÄUFIG ZUM PFAD — die längste Datei
      liegt in der Mitte. Wären sie mit dem Pfad gleichlaufend, ginge eine
      Sortierung nach Grösse hier genauso durch, und die Prüfung sagte nichts
      darüber aus, wonach wirklich sortiert wird. Genau das ist einmal
      passiert.
    */
    await hochladen(BETRIEB, 'schein-b', 'bbb.jpg', 'das ist mit Abstand das längste Bild in dieser Prüfung');

    const alle = await offene(BETRIEB);
    expect(alle.length).toBeGreaterThan(2);
    expect(alle.map((d) => `${d.eimer}/${d.pfad}`))
      .toEqual([...alle.map((d) => `${d.eimer}/${d.pfad}`)].sort());

    const zwei = await offene(BETRIEB, 2);
    expect(zwei).toHaveLength(2);
    expect(zwei.map((d) => d.pfad)).toEqual(alle.slice(0, 2).map((d) => d.pfad));
  }, 60_000);

  it('zählt die offenen — und die Zahl passt zur Liste', async () => {
    const liste = await offene(BETRIEB, 1000);
    expect(await offenAnzahl(BETRIEB)).toBe(liste.length);
  }, 60_000);
});

describe('Was schon draussen liegt, geht nicht noch einmal hinaus', () => {
  it('fällt nach dem Vermerk aus der Liste — und die Zahl sinkt', async () => {
    /*
      WARUM ÜBERHAUPT BUCH GEFÜHRT WIRD. Das Dienstkonto im Zielspeicher darf
      anlegen und sonst nichts — nicht lesen, nicht auflisten. Das ist der
      Sinn der Übung: wer den Schlüssel erbeutet, kann die Sicherung nicht
      vernichten. Der Preis steht hier: „liegt das schon draussen?"
      beantwortet der Zielspeicher nicht, also muss es die Datenbank tun.

      Und der Vermerk ist nicht kosmetisch: das Konto darf auch nicht
      ÜBERSCHREIBEN. Ein zweiter Versuch derselben Datei liefe in eine
      Abweisung, die wie ein kaputter Zugang aussieht.
    */
    const pfad = await hochladen(BETRIEB, 'schein-c', 'ccc.jpg', 'schon oben');
    const vorher = await offenAnzahl(BETRIEB);
    expect((await offene(BETRIEB, 1000)).map((d) => d.pfad)).toContain(pfad);

    const { error } = await admin.from('ausleitung_dateien').insert({
      company_id: BETRIEB, eimer: EIMER, pfad, hash: 'a'.repeat(64), bytes: 10,
    });
    expect(error).toBeNull();

    expect((await offene(BETRIEB, 1000)).map((d) => d.pfad)).not.toContain(pfad);
    expect(await offenAnzahl(BETRIEB)).toBe(vorher - 1);
  }, 60_000);

  it('der Vermerk eines Betriebs befreit den anderen NICHT', async () => {
    /*
      Zwei Betriebe können denselben Objektnamen gar nicht haben — der
      Betrieb steht im Pfad. Aber der Vermerk trägt `company_id`, und ein
      Abgleich, der sie vergässe, liesse die Dateien des einen Betriebs
      verschwinden, sobald der andere gesichert ist.
    */
    const fremd = await hochladen(FREMD, 'schein-g', 'ggg.jpg', 'fremdes zweites');
    await admin.from('ausleitung_dateien').insert({
      company_id: BETRIEB, eimer: EIMER, pfad: fremd, hash: 'b'.repeat(64), bytes: 10,
    });

    expect((await offene(FREMD, 1000)).map((d) => d.pfad)).toContain(fremd);
  }, 60_000);
});

describe('Kein Eimer fällt stillschweigend heraus', () => {
  it('jeder Eimer im Projekt steht in `app.datei_eimer()` — mit ja oder nein', async () => {
    /*
      DER STOLPERDRAHT. Legt jemand einen neuen Eimer an und trägt ihn hier
      nicht ein, fiele dessen Inhalt aus der Sicherung heraus — und bemerkt
      würde es am Tag des Wiederanlaufs. Diese Prüfung zwingt zur
      Entscheidung, nicht zu einer bestimmten Antwort: `false` ist erlaubt,
      Schweigen nicht.
    */
    const { rows } = await db.query<{ fehlt: string }>(
      /*
        `pruefung-…` BLEIBT AUSSEN VOR. Diese Datei legt selbst einen Eimer
        an, um den Weg nach draussen gegen einen echten S3-Dienst zu gehen.
        Er gehört nicht zum Projekt, und ohne diese Zeile meldete der
        Stolperdraht die Prüfung selbst als Versäumnis — ein Alarm, den man
        nach dem zweiten Mal abschaltet.
      */
      `select b.id as fehlt from storage.buckets b
        where b.id not like 'pruefung-%'
          and not exists (select 1 from app.datei_eimer() e where e.eimer = b.id)`,
    );
    expect(rows.map((r) => r.fehlt)).toEqual([]);
  });

  it('nennt keine Datei aus einem Eimer, der NICHT gesichert wird', async () => {
    /*
      `ausleitung` ist die Sicherung selbst. Sie noch einmal als „Datei"
      mitzunehmen wäre ein Kreis — und einer, der mit jedem Lauf wächst.

      GEPRÜFT WIRD MIT EINER ECHTEN DATEI IN DIESEM EIMER, und das ist der
      Punkt: `app.datei_betrieb` erkennt den Betrieb dort sehr wohl. Die
      Entscheidung liegt also allein an `app.datei_eimer()`. Ohne diese Zeile
      wäre die Prüfung auch dann grün, wenn die Einschränkung gar nicht mehr
      wirkte — es läge schlicht nichts da, was sie hätte abweisen können.
    */
    const stand = `ausleitung/${BETRIEB}/2026-09-16.jsonl`;
    const { error } = await admin.storage
      .from('ausleitung')
      .upload(stand, new Blob(['{}\n']), { contentType: 'application/x-ndjson', upsert: true });
    expect(error).toBeNull();

    const { rows } = await db.query<{ betrieb: string | null }>(
      'select app.datei_betrieb($1, $2) as betrieb', ['ausleitung', stand],
    );
    expect(rows[0].betrieb).toBe(BETRIEB);

    const liste = await offene(BETRIEB, 1000);
    expect(liste.map((d) => d.pfad)).not.toContain(stand);
    expect(new Set(liste.map((d) => d.eimer))).toEqual(new Set([EIMER]));
  }, 60_000);
});

describe('Die Buchführung gehört dem Server', () => {
  it('die Geschäftsführung sieht die Liste der gesicherten Dateien nicht', async () => {
    /*
      KEINE RICHTLINIE HEISST: ZU. Es ist eine Liste von Speicherpfaden, kein
      Geschäftsdatum; sie gehört in die Ausleitung und nicht in die
      Oberfläche. Was hier zählt, ist die LEERE Antwort ohne Fehler — so
      wirkt der Zeilenschutz, und ein Test, der auf eine Fehlermeldung
      wartete, wäre grün, sobald jemand eine Lese-Richtlinie ergänzt.
    */
    const { data, error } = await chef.client.from('ausleitung_dateien').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 60_000);

  it('die Geschäftsführung darf die Dateiliste nicht abfragen', async () => {
    const { error } = await chef.client.rpc('sicherungs_dateien', {
      p_betrieb: BETRIEB, p_grenze: 10,
    });
    expect(error).not.toBeNull();
  }, 60_000);

  it('und auch nichts hineinschreiben', async () => {
    // Sonst liesse sich eine Datei als „gesichert" eintragen, die nie
    // hinausging — die stillste Art, eine Sicherung auszuhöhlen.
    const { error } = await chef.client.from('ausleitung_dateien').insert({
      company_id: BETRIEB, eimer: EIMER, pfad: 'scheine/x/y/z.jpg',
      hash: 'c'.repeat(64), bytes: 1,
    });
    expect(error).not.toBeNull();
  }, 60_000);
});

/**
 * Die Zugangsdaten des lokalen S3-Zugangs.
 *
 * Wie die Schlüssel in `helfer.ts`: die Entwicklungsvorgaben der Supabase-CLI,
 * auf jedem Rechner dieselben, und der Stapel hört nur auf 127.0.0.1. Ein
 * Geheimnis ist hier keines.
 */
const S3 = {
  endpunkt: process.env.SUPABASE_S3_URL ?? `${API}/storage/v1/s3`,
  region: process.env.SUPABASE_S3_REGION ?? 'local',
  eimer: 'pruefung-ausser-haus',
  schluessel: process.env.SUPABASE_S3_SCHLUESSEL ?? '625729a08b95bf1b7ff351a663f3a23c',
  geheimnis: process.env.SUPABASE_S3_GEHEIMNIS
    ?? '850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907',
};

const alsDienst = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

describe('Der Weg einer Datei nach draussen', () => {
  /*
    WAS DIESE PRÜFUNG IST UND WAS NICHT.

    Sie geht denselben Weg wie `daten-ausleitung`, Schritt für Schritt: die
    Liste über dieselbe RPC, das Herunterladen über dieselbe Speicheradresse,
    den PUT über dasselbe `putAnfrage`, den Vermerk über dieselbe Tabelle.
    Geteilt ist dabei alles, woran gerechnet wird — Pfadregel und Signatur
    sind derselbe Code, nicht eine Nachbildung.

    NICHT geprüft ist damit die Reihenfolge IN der Function; dafür müsste der
    Zielspeicher in der Umgebung der Edge Function stehen, und der liegt
    ausserhalb. Was hier steht, ist die Antwort auf „hält jede einzelne
    Schnittstelle, die sie anspricht?" — und das war die offene Frage.
  */
  it('wird heruntergeladen, angenommen und vermerkt — Byte für Byte', async () => {
    const { error: eimerFehler } = await admin.storage.createBucket(S3.eimer, { public: false });
    // Ein zweiter Lauf findet den Eimer vor; das ist kein Fehler.
    if (eimerFehler && !/exist/i.test(eimerFehler.message)) throw new Error(eimerFehler.message);

    /*
      BYTES, DIE ALS TEXT NICHT HEIL ÜBERLEBEN. Ein JPEG besteht fast nur aus
      solchen. Ginge auch nur eines unterwegs durch eine Kodierung, stimmte
      die Signatur nicht mehr mit dem Inhalt überein — und der Zielspeicher
      antwortete mit 403, ohne zu sagen warum.
    */
    const rohbytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x80, 0xfe]);
    const pfad = fotoPfad(BETRIEB, 'schein-transport', 'transport.jpg');
    const { error: hochFehler } = await admin.storage
      .from(EIMER).upload(pfad, new Blob([rohbytes], { type: 'image/jpeg' }),
        { contentType: 'image/jpeg', upsert: true });
    if (hochFehler) throw new Error(hochFehler.message);

    // 1. Die Function fragt die Liste — die Datei muss darin stehen.
    expect((await offene(BETRIEB, 1000)).map((d) => d.pfad)).toContain(pfad);

    // 2. Sie lädt sie über die Speicheradresse herunter, die sie selbst baut.
    const herunter = await fetch(
      `${API}/storage/v1/object/${EIMER}/${pfadKodieren(pfad)}`, { headers: alsDienst },
    );
    expect(herunter.status).toBe(200);
    const typ = herunter.headers.get('Content-Type');
    expect(typ).toBe('image/jpeg');
    const inhalt = new Uint8Array(await herunter.arrayBuffer());
    expect([...inhalt]).toEqual([...rohbytes]);

    // 3. Sie schiebt sie signiert hinaus — an einen echten S3-Dienst.
    const imZiel = dateiZielPfad(BETRIEB, EIMER, pfad);
    const { url, kopfzeilen } = await putAnfrage(S3, imZiel, inhalt, new Date(), typ!);
    const hinaus = await fetch(url, { method: 'PUT', headers: kopfzeilen, body: inhalt });
    expect(hinaus.status).toBe(200);

    // 4. Und was ankam, ist dasselbe — nicht bloss „irgendetwas".
    const { data: zurueck, error: ladeFehler } = await admin.storage
      .from(S3.eimer).download(imZiel);
    expect(ladeFehler).toBeNull();
    expect([...new Uint8Array(await zurueck!.arrayBuffer())]).toEqual([...rohbytes]);

    // 5. Der Vermerk — über denselben Weg wie die Function, PostgREST.
    const vermerk = await fetch(`${API}/rest/v1/ausleitung_dateien`, {
      method: 'POST',
      headers: { ...alsDienst, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        company_id: BETRIEB, eimer: EIMER, pfad, hash: 'd'.repeat(64), bytes: inhalt.length,
      }),
    });
    expect(vermerk.status).toBeLessThan(300);

    // 6. Und damit ist sie für den nächsten Lauf erledigt.
    expect((await offene(BETRIEB, 1000)).map((d) => d.pfad)).not.toContain(pfad);
  }, 120_000);

  it('weist eine falsche Signatur ab — der Dienst prüft wirklich', async () => {
    /*
      OHNE DIESE ZEILE WÄRE DIE PRÜFUNG OBEN WERTLOS. Nähme der Dienst auch
      eine falsch gerechnete Signatur an, sagte ein erfolgreicher PUT nichts
      über die Signatur aus — und die Prüfung wäre grün, egal was `signiere`
      rechnet.
    */
    const falsch = { ...S3, geheimnis: 'das-ist-nicht-das-geheimnis' };
    const { url, kopfzeilen } = await putAnfrage(
      falsch, 'dateien/pruefung/falsch.jpg', new Uint8Array([1, 2, 3]), new Date(), 'image/jpeg',
    );
    const r = await fetch(url, { method: 'PUT', headers: kopfzeilen, body: new Uint8Array([1, 2, 3]) });
    await r.body?.cancel().catch(() => undefined);
    expect(r.ok).toBe(false);
  }, 60_000);
});
