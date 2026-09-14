/**
 * Die Ausleitung: der Bestand jedes Betriebs an einen zweiten Ort.
 *
 * WOFÜR. Fällt das Projekt aus, wird der Zugang gesperrt oder löscht jemand
 * versehentlich eine Tabelle, sind die Daten des Betriebs nicht greifbar —
 * Rechnungen, Zeitkonten, Kundenstamm. Das ist die einzige Lücke, die nicht
 * nur die App betrifft, sondern den Betrieb.
 *
 * ZWEI WEGE IN DIESELBE FUNCTION, weil es zwei Fragen sind:
 *
 *   Der Nachtlauf   ruft mit dem Dienstschlüssel und nimmt ALLE Betriebe.
 *   Der Knopf       ruft mit dem Token eines Menschen und nimmt nur DESSEN
 *                   Betrieb — Geschäftsführung oder Administration.
 *
 * Warum es den Knopf gibt: eine Sicherung, die niemand auslösen kann, prüft
 * niemand; und eine, die niemand je geprüft hat, ist keine. Einmal drücken
 * zeigt in einem Zug, ob die Berechtigungen stimmen, ob das Ziel erreichbar
 * ist und wie gross der Stand tatsächlich ist.
 *
 * WIE EHRLICH DIESE LÖSUNG IST. Das Ziel ist heute ein Eimer im SELBEN
 * Projekt. Gegen einen Fehlgriff, eine kaputte Migration oder eine
 * versehentlich geleerte Tabelle hilft das sofort. Gegen „der Zugang zum
 * Projekt ist weg" hilft es NICHT — dafür muss das Ziel ausserhalb liegen.
 * Solange es das nicht tut, ist die halbe Strecke gewonnen und nicht die
 * ganze, und `system_laeufe.ziel_extern` sagt das auch so.
 *
 * FORMAT. Zeilenweises JSON (`.jsonl`), eine Zeile je Datensatz mit ihrer
 * Tabelle. So lässt sich der Stand wieder einlesen, ohne ihn je vollständig
 * im Speicher zu halten — beim LESEN. Beim Schreiben hält diese Function ihn
 * sehr wohl vollständig, weil ein Speicher-Upload ein Vorgang ist und kein
 * Strom; bei einem Betrieb mit Jahren an Historie ist das die Grenze, die
 * zuerst reisst. Sie ist gemessen und steht unten bei `GRENZE_BYTES`.
 */
import {
  abgelaufeneStaende, ausleitungsPfad, ausleitungsPraefix, jsonZeile,
} from '../_shared/ausleitungPlan.ts';
import {
  dienstKopfzeilen, dienstSchluessel, rufDerMaschine, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const DIENST = dienstSchluessel(Deno.env.toObject());
const EIMER = Deno.env.get('AUSLEITUNG_EIMER') ?? 'ausleitung';
/** Wie lange Stände aufbewahrt werden. */
const AUFBEWAHRUNG_TAGE = Number(Deno.env.get('AUSLEITUNG_TAGE') ?? 30);
/**
 * Liegt das Ziel AUSSERHALB dieses Projekts?
 *
 * Heute nein. Die Angabe steht trotzdem hier und wandert in `system_laeufe`,
 * damit die Überwachung nicht „gesichert" meldet, wo „gesichert, aber am
 * selben Ort" gemeint ist.
 */
const ZIEL_EXTERN = (Deno.env.get('AUSLEITUNG_ZIEL_EXTERN') ?? 'false') === 'true';

/** Wie viele Zeilen je Abfrage. Nicht die Datenbank ist die Grenze, der Speicher. */
const SEITE = 1000;

/**
 * Bei welcher Grösse ein Stand als zu gross gilt.
 *
 * Kein Schutz der Datenbank, sondern eine ehrliche Absage: ein Lauf, der am
 * Speicher scheitert, bricht ohne verwertbare Meldung ab. Lieber hier
 * abbrechen und es in die Überwachung schreiben — dann steht in der Ansicht,
 * dass die Sicherung NICHT läuft, statt dass sie still ausbleibt.
 */
const GRENZE_BYTES = 256 * 1024 * 1024;

/*
  Fehlt der Schlüssel, sind diese Kopfzeilen leer — benutzt werden sie dann
  nie, weil die Function vorher mit 503 antwortet. Sie stehen hier, weil sie
  beim Laden der Datei gebaut werden und nicht beim Aufruf.
*/
const alsDienst = dienstKopfzeilen(DIENST);

const antwort = (inhalt: unknown, status = 200) =>
  new Response(JSON.stringify(inhalt), {
    status, headers: { 'Content-Type': 'application/json' },
  });
const fehler = (text: string, status: number) => antwort({ error: text }, status);

interface Bilanz {
  companyId: string;
  zeilen: number;
  bytes: number;
  pfad: string;
  geraeumt: number;
}

/** Eine Seite aus einer Tabelle — PostgREST zählt Zeilen über `Range`. */
async function seite(
  tabelle: string, betrieb: string, von: number,
): Promise<Record<string, unknown>[]> {
  const r = await fetch(
    `${URL_BASIS}/rest/v1/${tabelle}?select=*&company_id=eq.${encodeURIComponent(betrieb)}`,
    { headers: { ...alsDienst, Range: `${von}-${von + SEITE - 1}` } },
  );
  if (!r.ok) throw new Error(`${tabelle}: ${await r.text()}`);
  return await r.json();
}

/**
 * Einen Betrieb zusammenschreiben.
 *
 * DIE FIRMA ZUERST, weil sie an der Kennung hängt und nicht an einer Spalte
 * `company_id` — sie fiele sonst aus der Katalogliste heraus, und ein
 * Wiederanlauf begänne ohne Stundensätze und Steuersatz.
 */
async function standSchreiben(betrieb: string, tabellen: string[]): Promise<string> {
  const teile: string[] = [];
  let bytes = 0;

  const anhaengen = (tabelle: string, zeile: Record<string, unknown>) => {
    const text = jsonZeile(tabelle, zeile);
    bytes += text.length;
    if (bytes > GRENZE_BYTES) {
      throw new Error(
        'Der Bestand ist zu gross für einen Lauf in einem Stück. ' +
        'Die Ausleitung muss auf ein Ziel umgestellt werden, das strömend schreibt.',
      );
    }
    teile.push(text);
  };

  const firma = await fetch(
    `${URL_BASIS}/rest/v1/companies?select=*&id=eq.${encodeURIComponent(betrieb)}`,
    { headers: alsDienst },
  );
  for (const zeile of firma.ok ? await firma.json() : []) anhaengen('companies', zeile);

  for (const tabelle of tabellen) {
    for (let von = 0; ; von += SEITE) {
      const zeilen = await seite(tabelle, betrieb, von);
      for (const zeile of zeilen) anhaengen(tabelle, entschaerft(tabelle, zeile));
      if (zeilen.length < SEITE) break;
    }
  }
  return teile.join('');
}

/**
 * Felder, die aus dem Stand herausfallen, mit Grund.
 *
 * Push-Tokens sind Kanäle auf die Geräte einzelner Mitarbeiter, kein
 * Geschäftsdatum. Für einen Wiederanlauf taugen sie nichts — beim nächsten
 * Anmelden entstehen sie neu —, in einer abgelegten Datei wären sie nur ein
 * Risiko. Dieselbe Entscheidung wie beim DSGVO-Auszug.
 */
function entschaerft(
  tabelle: string, zeile: Record<string, unknown>,
): Record<string, unknown> {
  if (tabelle !== 'user_prefs') return zeile;
  const ohne = { ...zeile };
  delete ohne.push_tokens;
  return ohne;
}

/** Alte Stände wegräumen — was weg darf, entscheidet `ausleitungPlan.ts`. */
async function alteStaendeRaeumen(betrieb: string, heute: Date): Promise<number> {
  const r = await fetch(`${URL_BASIS}/storage/v1/object/list/${EIMER}`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({ prefix: ausleitungsPraefix(betrieb), limit: 1000 }),
  });
  if (!r.ok) return 0;
  const dateien = (await r.json()) as Array<{ name: string }>;
  const weg = abgelaufeneStaende(
    dateien.map((d) => `${ausleitungsPraefix(betrieb)}${d.name}`),
    heute,
    AUFBEWAHRUNG_TAGE,
  );
  if (weg.length === 0) return 0;

  const geloescht = await fetch(`${URL_BASIS}/storage/v1/object/${EIMER}`, {
    method: 'DELETE',
    headers: alsDienst,
    body: JSON.stringify({ prefixes: weg }),
  });
  return geloescht.ok ? weg.length : 0;
}

async function festhalten(
  betrieb: string, erfolg: boolean, meldung: string | null, zeilen: number | null,
): Promise<void> {
  await fetch(`${URL_BASIS}/rest/v1/rpc/lauf_festhalten`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({
      p_betrieb: betrieb, p_art: 'ausleitung', p_erfolg: erfolg,
      p_meldung: meldung, p_kennzahl: zeilen,
      p_kennzahl_einheit: zeilen === null ? null : 'Zeilen',
      p_ziel_extern: ZIEL_EXTERN,
    }),
  }).catch(() => undefined);
}

async function betriebAusleiten(
  betrieb: string, tabellen: string[], heute: Date,
): Promise<Bilanz> {
  const inhalt = await standSchreiben(betrieb, tabellen);
  const pfad = ausleitungsPfad(betrieb, heute);

  /*
    EIN STAND JE TAG. Läuft die Ausleitung an einem Tag zweimal — etwa nach
    einem Fehlschlag von Hand angestossen —, überschreibt der zweite den
    ersten, statt eine zweite Datei danebenzulegen. Sonst wüchse der Speicher
    mit jedem Wiederholungsversuch, und beim Wiederanlauf müsste jemand
    raten, welche der beiden die vollständige ist. Deshalb `upsert`.
  */
  const hoch = await fetch(`${URL_BASIS}/storage/v1/object/${EIMER}/${pfad}`, {
    method: 'POST',
    headers: {
      ...alsDienst,
      'Content-Type': 'application/x-ndjson',
      'x-upsert': 'true',
    },
    body: inhalt,
  });
  if (!hoch.ok) throw new Error(`Speicher: ${await hoch.text()}`);

  const geraeumt = await alteStaendeRaeumen(betrieb, heute);
  const zeilen = inhalt === '' ? 0 : inhalt.split('\n').length - 1;
  await festhalten(betrieb, true, null, zeilen);
  return { companyId: betrieb, zeilen, bytes: inhalt.length, pfad, geraeumt };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);

  const kopf = req.headers.get('Authorization') ?? '';
  const apikeyKopf = req.headers.get('apikey') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  if (!token && !apikeyKopf) return fehler('Keine Anmeldung.', 401);

  /*
    ZUERST DIE EIGENE AUSRÜSTUNG, DANN DER ANRUFER.

    Ohne Dienstschlüssel kann diese Function gar nichts — sie liest ja auch
    ihre eigenen Tabellen damit. Stünde die Prüfung weiter unten, liefe der
    Aufruf in `/auth/v1/user` und käme als „Keine Anmeldung." zurück: eine
    Meldung über den Anrufer, wo der Dienst gemeint ist. Der Nachtlauf sähe
    im Protokoll 401 und suchte den Fehler beim Schlüssel im Tresor, der
    stimmt. 503 heisst „an mir liegt es", und der Name steht dabei.
  */
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const tabellenAntwort = await fetch(`${URL_BASIS}/rest/v1/rpc/auszug_tabellen`, {
    method: 'POST', headers: alsDienst, body: '{}',
  });
  if (!tabellenAntwort.ok) return fehler('Die Tabellenliste ist nicht lesbar.', 500);
  const tabellen = (await tabellenAntwort.json()) as string[];
  const heute = new Date();

  /*
    DER NACHTLAUF: mit dem Dienstschlüssel, über alle Betriebe.

    Verglichen wird der ganze Schlüssel, nicht eine Eigenschaft daraus — wer
    ihn hat, ist die Maschine, und etwas anderes soll hier auch nicht
    durchkommen.
  */
  if (rufDerMaschine(kopf, apikeyKopf, DIENST)) {
    const firmen = await fetch(`${URL_BASIS}/rest/v1/companies?select=id`, {
      headers: alsDienst,
    });
    if (!firmen.ok) return fehler('Die Betriebe sind nicht lesbar.', 500);

    const bilanzen: Bilanz[] = [];
    const gescheitert: Array<{ companyId: string; meldung: string }> = [];
    for (const { id } of (await firmen.json()) as Array<{ id: string }>) {
      try {
        bilanzen.push(await betriebAusleiten(id, tabellen, heute));
      } catch (e) {
        /*
          WEITERMACHEN: ein Betrieb, der scheitert, darf die übrigen nicht
          mitreissen. Der Fehlschlag steht in der Überwachung, und der
          jüngste Stand dieses Betriebs bleibt beim Aufräumen ausdrücklich
          verschont.
        */
        const meldung = e instanceof Error ? e.message : 'Unbekannter Fehler';
        await festhalten(id, false, meldung, null);
        gescheitert.push({ companyId: id, meldung });
      }
    }
    return antwort({
      mandanten: bilanzen.length,
      zeilen: bilanzen.reduce((s, b) => s + b.zeilen, 0),
      bytes: bilanzen.reduce((s, b) => s + b.bytes, 0),
      gescheitert,
      zielExtern: ZIEL_EXTERN,
    });
  }

  /*
    DER KNOPF: mit dem Token eines Menschen, nur für DESSEN Betrieb.

    Gefragt werden Betrieb und Rolle bei der Belegschaft und nicht im Token —
    dieselbe Entscheidung wie überall sonst: ein ausgestelltes Token trägt
    seinen Anspruch bis zu einer Stunde weiter.
  */
  const werAntwort = await fetch(`${URL_BASIS}/auth/v1/user`, {
    headers: { apikey: DIENST ?? '', Authorization: `Bearer ${token}` },
  });
  if (!werAntwort.ok) return fehler('Keine Anmeldung.', 401);
  const wer = await werAntwort.json();

  const profilAntwort = await fetch(
    `${URL_BASIS}/rest/v1/users?select=company_id,role,active&id=eq.${wer.id}`,
    { headers: alsDienst },
  );
  const [profil] = profilAntwort.ok ? await profilAntwort.json() : [];
  if (!profil?.active) return fehler('Keine Anmeldung.', 401);
  if (profil.role !== 'Geschäftsführung' && profil.role !== 'Administrator') {
    return fehler('Nur Geschäftsführung oder Administration.', 403);
  }

  try {
    const bilanz = await betriebAusleiten(profil.company_id, tabellen, heute);
    /*
      `ziel` STEHT IM KLARTEXT IN DER ANSICHT — und soll dort die Wahrheit
      sagen. „Eimer im selben Projekt" ist ein Satz, den jemand liest und
      versteht; ein `false` in einem Feld namens `zielExtern` ist einer, den
      niemand liest.
    */
    return antwort({
      ...bilanz,
      zielExtern: ZIEL_EXTERN,
      ziel: ZIEL_EXTERN ? EIMER : `${EIMER} (Eimer im selben Projekt)`,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : 'Unbekannter Fehler';
    await festhalten(profil.company_id, false, meldung, null);
    return fehler(meldung, 500);
  }
});
