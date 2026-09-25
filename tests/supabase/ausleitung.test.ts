/**
 * Die Ausleitung — die Edge Function gegen den laufenden Stapel.
 *
 * WAS AUF DEM PRÜFSTAND STEHT, ist nicht „läuft sie durch", sondern die drei
 * Fragen, an denen eine Sicherung wertlos wird:
 *
 *   Ist der Stand VOLLSTÄNDIG?  Fehlte eine Tabelle, begänne ein Wiederanlauf
 *                               ohne sie — und niemand merkte es, bis er sie
 *                               braucht.
 *   Bleibt der letzte Stand?    Ein Aufräumen, das einen Tag zu weit greift,
 *                               vernichtet genau das, wofür die Sicherung da
 *                               ist.
 *   Sagt die Überwachung die    Ein gescheiterter Lauf, der den Erfolgs-
 *   WAHRHEIT?                   zeitstempel mitzieht, sieht taggleich frisch
 *                               aus. Drei Wochen später fällt es auf.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import {
  admin, API, ANON, SERVICE, betriebAnlegen, konto, buchung, nurStatus, type Konto,
} from './helfer';
import { ausleitungsPfad, ausleitungsPraefix } from '@shared/ausleitungPlan';

const FUNKTION = `${API}/functions/v1/daten-ausleitung`;
const EIMER = 'ausleitung';
const BETRIEB = 'ausleitung-b';
const FREMD = 'ausleitung-c';

let chef: Konto;
let monteur: Konto;
let fremderChef: Konto;
let db: Client;

async function rufen(token: string) {
  const antwort = await fetch(FUNKTION, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quelle: 'test' }),
  });
  return { status: antwort.status, daten: await antwort.json() };
}

/** Den geschriebenen Stand wieder herunterladen — als Text. */
async function standLesen(pfad: string): Promise<string> {
  const { data, error } = await admin.storage.from(EIMER).download(pfad);
  if (error) throw new Error(error.message);
  return await data!.text();
}

const zeilenNach = (inhalt: string) =>
  inhalt.split('\n').filter(Boolean).map((z) => JSON.parse(z) as
    { sammlung: string; daten: Record<string, unknown> });

beforeAll(async () => {
  db = new Client({ connectionString:
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();

  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  await betriebAnlegen(FREMD, 'Gruber Installationen');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'aus-chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'aus-monteur');
  fremderChef = await konto(FREMD, 'Geschäftsführung', 'aus-fremd');

  const { error } = await admin.from('time_entries').insert([
    buchung(monteur, '2026-05-04', { project_number: 'B-1', user_name: 'Monteur' }),
    buchung(monteur, '2026-05-05', { project_number: 'B-1', user_name: 'Monteur' }),
  ]);
  if (error) throw new Error(error.message);

  // Ein Push-Token, das NICHT mitgehen darf.
  await admin.from('user_prefs').insert({
    user_id: monteur.uid, company_id: BETRIEB, push_tokens: ['gerät-abc'],
  });
}, 240_000);

afterAll(async () => { await db.end(); });

describe('Der Stand ist vollständig', () => {
  it('enthält jede Tabelle mit Zeilen — und den Betrieb selbst', async () => {
    const { status, daten } = await rufen(chef.token);
    expect(status).toBe(200);
    expect(daten.pfad).toBe(ausleitungsPfad(BETRIEB, new Date()));

    const zeilen = zeilenNach(await standLesen(daten.pfad));
    const tabellen = new Set(zeilen.map((z) => z.sammlung));

    // Der Betrieb hängt an der Kennung und nicht an einer Spalte `company_id`
    // — er fiele sonst aus der Katalogliste heraus, und ein Wiederanlauf
    // begänne ohne Stundensätze und Steuersatz.
    expect(tabellen.has('companies')).toBe(true);
    expect(tabellen.has('users')).toBe(true);
    expect(tabellen.has('time_entries')).toBe(true);
    expect(zeilen.filter((z) => z.sammlung === 'time_entries')).toHaveLength(2);

    // Und die Zeilenzahl in der Antwort stimmt mit der Datei überein.
    expect(daten.zeilen).toBe(zeilen.length);
  }, 180_000);

  it('ohne Push-Tokens — ein Gerätekanal ist kein Geschäftsdatum', async () => {
    const { daten } = await rufen(chef.token);
    const vorgaben = zeilenNach(await standLesen(daten.pfad))
      .filter((z) => z.sammlung === 'user_prefs');
    expect(vorgaben).toHaveLength(1);
    expect('push_tokens' in vorgaben[0].daten).toBe(false);
    expect('notify_new_order' in vorgaben[0].daten).toBe(true);
  }, 180_000);

  it('und ohne eine einzige Zeile eines fremden Betriebs', async () => {
    const { daten } = await rufen(chef.token);
    const zeilen = zeilenNach(await standLesen(daten.pfad));
    const fremde = zeilen.filter((z) =>
      z.daten.company_id !== undefined && z.daten.company_id !== BETRIEB);
    expect(fremde).toEqual([]);
  }, 180_000);
});

describe('Ein grosser Betrieb wird nicht stillschweigend abgeschnitten', () => {
  it('liest über die Seitengrenze hinaus weiter', async () => {
    /*
      DIE GEFÄHRLICHSTE ART VON FEHLER IN DIESER FUNCTION. Der Bestand wird
      seitenweise gelesen — tausend Zeilen je Abfrage, weil nicht die
      Datenbank die Grenze ist, sondern der Speicher. Bräche die Schleife nach
      der ersten Seite ab, wäre der Stand vollständig AUSSEHEND und
      unvollständig: Datei da, Lauf grün, Überwachung zufrieden, und beim
      Wiederanlauf fehlen vier Fünftel der Zeiteinträge.

      Bemerkt würde es nie — es sei denn hier. Deshalb bekommt dieser Betrieb
      1200 Buchungen, und die Prüfung zählt sie in der geschriebenen Datei
      nach.
    */
    const gross = 'ausleitung-gross';
    await betriebAnlegen(gross, 'Viel Betrieb');
    const chefGross = await konto(gross, 'Geschäftsführung', 'aus-gross');
    const monteurGross = await konto(gross, 'Mitarbeiter', 'aus-gross-m');

    // Je Tag eine Buchung: die Doppelbuchungsregel greift damit nicht, und
    // 1200 Zeilen liegen sicher über der Seitengrenze von 1000.
    await db.query(
      `insert into time_entries
         (id, company_id, user_id, date, status, start_time, end_time,
          break_duration, project_number, user_name)
       select gen_random_uuid(), $1, $2, date '2020-01-01' + i,
              'Anwesend', '07:00', '16:00', 30, 'B-' || i, 'Monteur'
         from generate_series(0, 1199) i`,
      [gross, monteurGross.uid],
    );

    const { status, daten } = await rufen(chefGross.token);
    expect(status).toBe(200);

    const zeilen = zeilenNach(await standLesen(daten.pfad));
    expect(zeilen.filter((z) => z.sammlung === 'time_entries')).toHaveLength(1200);
    // Und jede genau einmal: ohne feste Ordnung beim Blättern kann eine Zeile
    // fehlen und eine andere doppelt dastehen — die Zahl stimmte trotzdem.
    const kennungen = zeilen.filter((z) => z.sammlung === 'time_entries').map((z) => z.daten.id);
    expect(new Set(kennungen).size).toBe(1200);
  }, 300_000);

  it('kennt für jede Tabelle ihren Primärschlüssel — die Ordnung beim Blättern', async () => {
    /*
      PRÜFLAUF 25.09.2026 (P3-16). Geblättert wurde ohne `order`. Die Ordnung
      ist jetzt der Primärschlüssel, und der ist nicht überall `id`.
    */
    const { data: tabellen } = await admin.rpc('auszug_tabellen');
    const { data: schluessel, error } = await admin.rpc('auszug_schluessel');
    expect(error).toBeNull();
    const karte = schluessel as Record<string, string[]>;
    const ohne = (tabellen as string[]).filter((t) => !(karte[t]?.length > 0));
    expect(ohne).toEqual([]);
    expect(karte.time_entries).toEqual(['id']);
    expect(karte.number_counters).toEqual(['company_id', 'art', 'jahr']);
  });

  it('gibt die Schlüssel nur dem Dienst heraus', async () => {
    const { error } = await chef.client.rpc('auszug_schluessel');
    expect(error).not.toBeNull();
  });
});

describe('Wer die Ausleitung auslösen darf', () => {
  it('ein Monteur nicht', async () => {
    const { status, daten } = await rufen(monteur.token);
    expect(status).toBe(403);
    expect(daten.error).toContain('Geschäftsführung');
  }, 60_000);

  /*
    WARUM EIN LEERZEICHEN EINEN EIGENEN FALL BEKOMMT. Der Dienstschlüssel
    wird von Hand in den Tresor gelegt, und beim Einfügen rutscht Leerraum
    mit. Der Aufruf sähe danach aus wie ein falscher Schlüssel: 401, „Keine
    Anmeldung.", gesucht wird am Wert, und der ist richtig.

    GEPRÜFT WIRD DER FALL, DER AUCH ANKOMMT: ein Umbruch am Ende taugt dafür
    nicht — den schneidet schon die HTTP-Schicht ab, der Code sieht ihn nie,
    und die Prüfung wäre grün, ohne irgendetwas zu prüfen (nachgemessen: mit
    entferntem `trim` antwortet der Umbruch-Fall weiter 200, dieser hier
    401). Ein zweites Leerzeichen hinter „Bearer" gehört dagegen zum Wert
    und kommt durch.
  */
  it('nimmt den Dienstschlüssel auch mit Leerraum davor', async () => {
    const antwort = await fetch(FUNKTION, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer  ${SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quelle: 'test' }),
    });
    expect(antwort.status).toBe(200);
    // Der Dienstweg, nicht der Knopf: er zählt Mandanten statt einen Betrieb.
    expect(await antwort.json()).toHaveProperty('mandanten');
  }, 120_000);

  it('ohne Anmeldung niemand', async () => {
    const antwort = await fetch(FUNKTION, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(await nurStatus(antwort)).toBe(401);
  }, 60_000);

  it('der Knopf nimmt nur den EIGENEN Betrieb', async () => {
    const { daten } = await rufen(fremderChef.token);
    expect(daten.companyId).toBe(FREMD);
    // Der fremde Stand liegt in seinem eigenen Verzeichnis.
    expect(daten.pfad.startsWith(ausleitungsPraefix(FREMD))).toBe(true);
  }, 180_000);

  it('der Dienstschlüssel nimmt ALLE Betriebe', async () => {
    const { status, daten } = await rufen(SERVICE);
    expect(status).toBe(200);
    expect(daten.mandanten).toBeGreaterThanOrEqual(2);
    expect(daten.gescheitert).toEqual([]);
  }, 300_000);
});

describe('Die Überwachung sagt die Wahrheit', () => {
  it('ein erfolgreicher Lauf setzt Versuch UND Erfolg', async () => {
    await rufen(chef.token);
    const { data } = await admin.from('system_laeufe').select('*')
      .eq('company_id', BETRIEB).eq('art', 'ausleitung').single();
    expect(data!.erfolg).toBe(true);
    expect(data!.zuletzt_erfolg).not.toBeNull();
    expect(Number(data!.kennzahl)).toBeGreaterThan(0);
    expect(data!.kennzahl_einheit).toBe('Zeilen');
    // Solange das Ziel im selben Projekt liegt, sagt die Überwachung das auch.
    expect(data!.ziel_extern).toBe(false);
  }, 180_000);

  it('ein gescheiterter Lauf zieht den Erfolgszeitstempel NICHT mit', async () => {
    /*
      DER FEHLER, DER ERST NACH DREI WOCHEN AUFFÄLLT. Setzte ein Fehlschlag
      `zuletzt_erfolg` mit, sähe eine Sicherung, die seit Wochen scheitert,
      taggleich frisch aus — und die Ansicht meldete nichts.
    */
    const { data: vorher } = await admin.from('system_laeufe')
      .select('zuletzt_erfolg').eq('company_id', BETRIEB).eq('art', 'ausleitung').single();

    await db.query(`select public.lauf_festhalten($1, 'ausleitung', false, $2, null, null, false)`,
      [BETRIEB, 'Speicher nicht erreichbar']);

    const { data: nachher } = await admin.from('system_laeufe').select('*')
      .eq('company_id', BETRIEB).eq('art', 'ausleitung').single();
    expect(nachher!.erfolg).toBe(false);
    expect(nachher!.meldung).toBe('Speicher nicht erreichbar');
    expect(nachher!.zuletzt_erfolg).toBe(vorher!.zuletzt_erfolg);
    // Der Versuch ist aber neu — sonst sähe es aus, als hätte es niemand
    // probiert.
    expect(new Date(nachher!.zuletzt_versuch).getTime())
      .toBeGreaterThan(new Date(vorher!.zuletzt_erfolg as string).getTime());
  }, 120_000);
});

describe('Der Speicher gehört niemandem ausser dem Dienst', () => {
  it('die Geschäftsführung kommt nicht an den Eimer', async () => {
    /*
      Ein Stand ist der ganze Betrieb in EINER Datei. Wer ihn braucht, holt
      ihn über den DSGVO-Auszug, der die Rolle prüft und nur den eigenen
      Betrieb liefert. Ein Leserecht auf den Eimer wäre ein zweiter Weg an
      dieselben Daten, mit eigener Regel und eigener Gelegenheit, sich zu
      vertun.
    */
    const { data, error } = await chef.client.storage.from(EIMER)
      .list(ausleitungsPraefix(BETRIEB));
    expect(error === null ? data : []).toEqual([]);
  }, 60_000);
});
