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
 * ZWEI ZIELE, UND SIE KÖNNEN VERSCHIEDENES. Der Eimer im SELBEN Projekt hilft
 * gegen einen Fehlgriff, eine kaputte Migration, eine versehentlich geleerte
 * Tabelle — sofort und ohne jede Einrichtung. Gegen „der Zugang zum Projekt
 * ist weg" hilft er NICHT; dafür gibt es den Speicher ausserhalb. Ist keiner
 * eingerichtet, ist das eine benannte Lücke, und `system_laeufe.ziel_extern`
 * sagt es auch so.
 *
 * WAS AUSSER DEN ZEILEN MITGEHT. Der Stand sind Tabellenzeilen; die Fotos am
 * Handwerksschein liegen im Speicher, und ihre Zeile nennt nur den Pfad. Ohne
 * die Dateien käme bei einem Wiederanlauf der Schein zurück und seine
 * Beweisfotos nicht — und genau die sind der Grund, warum es den Schein gibt.
 * Sie gehen deshalb mit, aber NUR ausser Haus: sie in den Eimer nebenan zu
 * kopieren verdoppelte den Speicher und schützte gegen nichts.
 *
 * FORMAT. Zeilenweises JSON (`.jsonl`), eine Zeile je Datensatz mit ihrer
 * Tabelle. Ein grosser Stand geht IN TEILEN hinaus (`TEIL_BYTES`), jeder mit
 * einer Kopfzeile, die seinen Lauf und seine Nummer nennt — so hält diese
 * Function nie den ganzen Stand im Speicher, und der Rücklauf
 * (`scripts/ruecklauf.mjs`) erkennt, ob alle Teile beisammen sind. Bis
 * 10.10.2026 ging er in einem Stück und brach ab 256 MB ab.
 */
import {
  abgelaufeneStaende, alleSeitenLesen, ausleitungsPfad, ausleitungsPraefix, inTeilen,
  jsonZeile, ordnungNachSchluessel, TEIL_BYTES, teilPfad, weitererTeil,
} from '../_shared/ausleitungPlan.ts';
import {
  alleDienstSchluessel, dienstKopfzeilen, rufDerMaschine, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import {
  zielAusUmgebung, zielPfad, dateiZielPfad, putAnfrage, type Zielspeicher,
} from '../_shared/ausleitungZiel.ts';
import { inhaltsHash, pfadKodieren } from '../_shared/s3Signatur.ts';
import { mitCors } from '../_eigen/cors.ts';
import { zweiterFaktorFehlt } from '../_eigen/zweiterFaktor.ts';
import { ZWEITER_FAKTOR_FEHLT } from '../_shared/zweiFaktor.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
/*
  ALLE Schlüssel, die diese Umgebung kennt — gesprochen wird mit dem ersten,
  anerkannt wird jeder. Ein Projekt mitten in der Ablösung hat zwei, und
  welcher im Tresor liegt, entscheidet nicht diese Datei.
*/
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const EIMER = Deno.env.get('AUSLEITUNG_EIMER') ?? 'ausleitung';
/** Wie lange Stände aufbewahrt werden. */
const AUFBEWAHRUNG_TAGE = Number(Deno.env.get('AUSLEITUNG_TAGE') ?? 30);
/**
 * Der Speicher AUSSERHALB dieses Projekts — oder `null`, wenn keiner
 * eingerichtet ist.
 *
 * HIER STAND EINE UMGEBUNGSVARIABLE `AUSLEITUNG_ZIEL_EXTERN`, und sie war
 * eine Falle: sie setzte nur die MELDUNG in der Überwachung und bewegte
 * keine Datei. Wer sie einschaltete, brachte den ehrlichen Hinweis zum
 * Schweigen, ohne dass irgendetwas ausser Haus lag — das Gegenteil dessen,
 * wofür die Anzeige gebaut wurde. Sie ist ersatzlos weg.
 *
 * Jetzt entscheidet nicht eine Angabe, sondern der VERSUCH: gemeldet wird
 * „ausser Haus" genau dann, wenn eine Datei dort wirklich angekommen ist.
 *
 * Ein halb eingerichtetes Ziel wirft — siehe `ausleitungZiel.ts`. Das
 * passiert beim Laden der Datei, also beim ersten Aufruf; die Function
 * antwortet dann mit 503 und sagt, welches Feld fehlt.
 */
let ZIEL: Zielspeicher | null = null;
let ZIEL_FEHLER: string | null = null;
try {
  ZIEL = zielAusUmgebung(Deno.env.toObject());
} catch (e) {
  ZIEL_FEHLER = e instanceof Error ? e.message : 'Der Zielspeicher ist nicht lesbar.';
}

/**
 * Wie viele Zeilen je Abfrage. Nicht die Datenbank ist die Grenze, der Speicher.
 *
 * UNTER `max_rows` (1000 in `supabase/config.toml`) und nicht gleich. Das
 * Ende erkennt `alleSeitenLesen` inzwischen an einer LEEREN Seite und nicht
 * mehr an einer kurzen — die Grösse hier ist nur noch die Bitte, nicht die
 * Annahme (Prüflauf 25.09.2026, P3-16).
 */
const SEITE = 500;

/**
 * Wie viele DATEIEN ein Lauf hinausschiebt — und wie viele Bytes dabei.
 *
 * ZWEI GRENZEN, WEIL ES ZWEI ARTEN VON RÜCKSTAND GIBT: sehr viele kleine
 * Bilder und wenige grosse. Beide enden sonst gleich — die Function läuft in
 * ihre Wanduhr und bricht ohne verwertbare Meldung ab, und zwar in jeder
 * Nacht wieder.
 *
 * Mit den Grenzen arbeitet sich ein Rückstand Nacht für Nacht ab, und die
 * Bilanz sagt, wie weit es noch ist. Ein Betrieb, der die Sicherung heute
 * einschaltet und Jahre an Fotos liegen hat, ist damit nicht sofort
 * vollständig gesichert — aber er ist es nach ein paar Nächten, statt nie.
 */
const DATEIEN_JE_LAUF = Number(Deno.env.get('AUSLEITUNG_DATEIEN_JE_LAUF') ?? 200);
const DATEIEN_BYTES_JE_LAUF = Number(
  Deno.env.get('AUSLEITUNG_DATEIEN_BYTES_JE_LAUF') ?? 64 * 1024 * 1024,
);

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
  /** Der erste Teil des Stands — bei einem kleinen Betrieb der ganze. */
  pfad: string;
  /** Alle Teile, der erste vorn. */
  pfade: string[];
  geraeumt: number;
  /** Ist der Stand ausserhalb dieses Projekts angekommen? */
  ausserHaus: boolean;
  /** Wo er liegt — im Klartext, so wie es in der Ansicht steht. */
  ziel: string;
  /** Wie viele Dateien dieser Lauf ausser Haus gelegt hat. */
  dateien: number;
  /** Wie viele danach noch fehlen — 0 heisst: alles draussen. */
  dateienOffen: number;
}

interface OffeneDatei {
  eimer: string;
  pfad: string;
  bytes: number;
}

/**
 * Eine Seite aus einer Tabelle — PostgREST zählt Zeilen über `Range`.
 *
 * `ordnung` ist der Primärschlüssel der Tabelle (`auszug_schluessel`): ohne
 * feste Reihenfolge wäre „die Zeilen 500 bis 999" bei jeder Abfrage eine
 * andere Auswahl.
 */
async function seite(
  tabelle: string, betrieb: string, von: number, bis: number, ordnung: string | null,
): Promise<Record<string, unknown>[]> {
  const sortiert = ordnung ? `&order=${ordnung}` : '';
  const r = await fetch(
    `${URL_BASIS}/rest/v1/${tabelle}?select=*&company_id=eq.${encodeURIComponent(betrieb)}${sortiert}`,
    { headers: { ...alsDienst, Range: `${von}-${bis}` } },
  );
  if (!r.ok) throw new Error(`${tabelle}: ${await r.text()}`);
  return await r.json();
}

/**
 * Einen Betrieb zusammenschreiben, Teil für Teil.
 *
 * DIE FIRMA ZUERST, weil sie an der Kennung hängt und nicht an einer Spalte
 * `company_id` — sie fiele sonst aus der Katalogliste heraus, und ein
 * Wiederanlauf begänne ohne Stundensätze und Steuersatz.
 *
 * Jeder fertige Teil geht an `abgeben`, bevor der nächste entsteht; der erste
 * kommt zuletzt (siehe `inTeilen`).
 */
async function standSchreiben(
  betrieb: string, tabellen: string[], schluessel: Record<string, string[]>,
  lauf: string, abgeben: (text: string, nr: number) => Promise<void>,
): Promise<{ teile: number; zeilen: number; bytes: number }> {
  const stand = inTeilen(lauf, TEIL_BYTES, abgeben);
  const firma = await fetch(
    `${URL_BASIS}/rest/v1/companies?select=*&id=eq.${encodeURIComponent(betrieb)}`,
    { headers: alsDienst },
  );
  for (const zeile of firma.ok ? await firma.json() : []) {
    await stand.anhaengen(jsonZeile('companies', zeile));
  }

  for (const tabelle of tabellen) {
    const ordnung = ordnungNachSchluessel(schluessel[tabelle]);
    /*
      ANGEHÄNGT WIRD BEIM HOLEN DER SEITE, nicht je Zeile: `alleSeitenLesen`
      wartet nicht auf den Rückruf je Zeile, und ein Teil, der hinausgeht,
      muss fertig sein, bevor der nächste wächst.
    */
    await alleSeitenLesen(
      async (von, bis) => {
        const zeilen = await seite(tabelle, betrieb, von, bis, ordnung);
        for (const z of zeilen) await stand.anhaengen(jsonZeile(tabelle, entschaerft(tabelle, z)));
        return zeilen;
      },
      SEITE,
      () => undefined,
    );
  }
  return await stand.abschliessen();
}

/** Ein kurzer Name für einen Lauf — er steht in den Pfaden der weiteren Teile. */
const neuerLauf = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

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

/**
 * Die weiteren Teile anderer Läufe von heute räumen — erst, wenn der neue
 * Stand vollständig liegt. Dann gehören sie zu einem überschriebenen Stand
 * oder zu einem gescheiterten Lauf und sind nichts mehr wert.
 */
async function fremdeTeileRaeumen(betrieb: string, lauf: string, heute: Date): Promise<void> {
  const r = await fetch(`${URL_BASIS}/storage/v1/object/list/${EIMER}`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({ prefix: ausleitungsPraefix(betrieb), limit: 1000 }),
  });
  if (!r.ok) return;
  const weg = ((await r.json()) as Array<{ name: string }>)
    .map((d) => `${ausleitungsPraefix(betrieb)}${d.name}`)
    .filter((p) => p.startsWith(ausleitungsPfad(betrieb, heute).replace(/\.jsonl$/, '.')))
    .filter((p) => {
      const t = weitererTeil(p);
      return t !== null && t.lauf !== lauf;
    });
  if (weg.length === 0) return;
  const geloescht = await fetch(`${URL_BASIS}/storage/v1/object/${EIMER}`, {
    method: 'DELETE', headers: alsDienst, body: JSON.stringify({ prefixes: weg }),
  });
  await geloescht.body?.cancel();
}

async function festhalten(
  betrieb: string, erfolg: boolean, meldung: string | null, zeilen: number | null,
  ausserHaus = false,
): Promise<void> {
  await fetch(`${URL_BASIS}/rest/v1/rpc/lauf_festhalten`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({
      p_betrieb: betrieb, p_art: 'ausleitung', p_erfolg: erfolg,
      p_meldung: meldung, p_kennzahl: zeilen,
      p_kennzahl_einheit: zeilen === null ? null : 'Zeilen',
      p_ziel_extern: ausserHaus,
    }),
  }).catch(() => undefined);
}

/**
 * Den Stand ausser Haus legen.
 *
 * DER EINE SCHRITT, UM DEN ES BEI DIESER FUNKTION GEHT. Alles davor schützt
 * gegen einen Fehlgriff; erst das hier schützt gegen den Verlust des
 * Zugangs — dagegen, dass dieses Projekt morgen gesperrt, gelöscht oder
 * übernommen ist.
 *
 * ÜBER DIE S3-SCHNITTSTELLE, nicht über die Google-eigene: derselbe Code
 * trägt damit auch zu einem anderen Anbieter. Bei einer Sicherung ist das
 * keine Kleinigkeit — sie soll den Anbieter überleben, gegen dessen Ausfall
 * sie gebaut ist.
 */
async function ausserHausLegen(
  ziel: Zielspeicher, pfad: string, inhalt: string, jetzt: Date,
): Promise<string> {
  const { url, kopfzeilen } = await putAnfrage(ziel, pfad, inhalt, jetzt);

  const r = await fetch(url, { method: 'PUT', headers: kopfzeilen, body: inhalt });
  if (!r.ok) {
    /*
      DIE ANTWORT KOMMT MIT IN DIE MELDUNG. Ein blosses „ging nicht" hiesse,
      dass jemand nachts zwischen abgelaufenem Schlüssel, falschem Eimer und
      fehlender Berechtigung raten müsste; der Zielspeicher sagt es in seiner
      Antwort ziemlich genau. Auf 400 Zeichen gekürzt, weil sie in eine
      Protokollzeile passen muss.
    */
    const text = (await r.text()).slice(0, 400);
    throw new Error(`Sicherung außer Haus (${r.status}): ${text}`);
  }
  return `${ziel.eimer}/${pfad}`;
}

/** Eine Zahl aus einer RPC, die genau eine zurückgibt. */
async function zahlAusRpc(name: string, koerper: unknown): Promise<number> {
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify(koerper),
  });
  if (!r.ok) throw new Error(`${name}: ${await r.text()}`);
  return Number(await r.json());
}

/**
 * Vermerken, dass eine Datei draussen liegt.
 *
 * SOFORT NACH JEDER EINZELNEN und nicht gesammelt am Ende: bricht der Lauf in
 * der Mitte ab, versuchte der nächste sonst genau die Dateien noch einmal, die
 * schon oben sind — und der Zielspeicher wiese sie ab, weil er nicht
 * überschreiben lässt. Ein Fehlschlag machte damit jeden weiteren Lauf
 * unmöglich, dauerhaft.
 *
 * `merge-duplicates`, damit auch ein Vermerk, der zweimal geschrieben wird,
 * durchgeht — etwa nach einem Netzabbruch zwischen Antwort und Eintrag.
 */
async function vermerken(
  betrieb: string, datei: OffeneDatei, hash: string, bytes: number,
): Promise<void> {
  const r = await fetch(`${URL_BASIS}/rest/v1/ausleitung_dateien`, {
    method: 'POST',
    headers: { ...alsDienst, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      company_id: betrieb, eimer: datei.eimer, pfad: datei.pfad, hash, bytes,
    }),
  });
  if (!r.ok) throw new Error(`Vermerk ${datei.pfad}: ${await r.text()}`);
}

/**
 * Die Dateien eines Betriebs ausser Haus legen.
 *
 * DER RÜCKSTAND WIRD ABGEARBEITET, NICHT ERLEDIGT. Ein Lauf nimmt so viele
 * Dateien, wie in seine Wanduhr passen (`DATEIEN_JE_LAUF`,
 * `DATEIEN_BYTES_JE_LAUF`), und meldet, wie viele danach noch fehlen. Das ist
 * der Unterschied zwischen einer Sicherung, die sich in drei Nächten einholt,
 * und einer, die jede Nacht an derselben Stelle abbricht.
 *
 * EIN FEHLSCHLAG BRICHT AB UND ZÄHLT ALS FEHLSCHLAG. Die bereits vermerkten
 * Dateien bleiben vermerkt, der nächste Lauf macht dort weiter. Die
 * Alternative — weitermachen und am Ende „ging überwiegend gut" melden —
 * hiesse, dass eine dauerhaft kaputte Datei nie auffiele.
 */
async function dateienAusserHaus(
  ziel: Zielspeicher, betrieb: string, jetzt: Date,
): Promise<{ anzahl: number; offen: number }> {
  const liste = await fetch(`${URL_BASIS}/rest/v1/rpc/sicherungs_dateien`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({ p_betrieb: betrieb, p_grenze: DATEIEN_JE_LAUF }),
  });
  if (!liste.ok) throw new Error(`Dateiliste: ${await liste.text()}`);
  const offene = (await liste.json()) as OffeneDatei[];

  let anzahl = 0;
  let bytes = 0;
  for (const datei of offene) {
    if (bytes >= DATEIEN_BYTES_JE_LAUF) break;

    const herunter = await fetch(
      `${URL_BASIS}/storage/v1/object/${datei.eimer}/${pfadKodieren(datei.pfad)}`,
      { headers: alsDienst },
    );
    if (!herunter.ok) {
      throw new Error(`Datei ${datei.eimer}/${datei.pfad}: ${await herunter.text()}`);
    }
    /*
      DER TYP KOMMT VOM SPEICHER, nicht aus dem Dateinamen. Der Eimer nimmt
      JPEG, PNG, WebP und HEIC an; ihn zu raten hiesse, im Zielspeicher etwas
      anderes zu behaupten, als die Datei ist.
    */
    const typ = herunter.headers.get('Content-Type') ?? 'application/octet-stream';
    const inhalt = new Uint8Array(await herunter.arrayBuffer());

    const imZiel = dateiZielPfad(betrieb, datei.eimer, datei.pfad);
    const { url, kopfzeilen } = await putAnfrage(ziel, imZiel, inhalt, jetzt, typ);
    const r = await fetch(url, { method: 'PUT', headers: kopfzeilen, body: inhalt });
    if (!r.ok) {
      const text = (await r.text()).slice(0, 400);
      throw new Error(`Datei außer Haus (${r.status}) ${imZiel}: ${text}`);
    }

    /*
      GEHASHT WIRD, WAS HOCHGEGANGEN IST. In `work_sheet_photos` steht schon
      ein Hash — den von der Aufnahme. Ihn hier abzuschreiben wäre bequem und
      wertlos: er sagte dann nichts über die gesicherte Datei aus, sondern
      wiederholte nur eine Behauptung.
    */
    await vermerken(betrieb, datei, await inhaltsHash(inhalt), inhalt.length);
    anzahl += 1;
    bytes += inhalt.length;
  }

  return {
    anzahl,
    offen: await zahlAusRpc('sicherungs_dateien_offen', { p_betrieb: betrieb }),
  };
}

async function betriebAusleiten(
  betrieb: string, tabellen: string[], schluessel: Record<string, string[]>, heute: Date,
): Promise<Bilanz> {
  const pfad = ausleitungsPfad(betrieb, heute);
  const lauf = neuerLauf();
  const draussenPfad = ZIEL ? zielPfad(betrieb, heute) : null;
  let draussenFehler: Error | null = null;
  let ziel = `${EIMER} (Eimer im selben Projekt)`;
  const pfade: string[] = [];

  /*
    ERST DER EIGENE SPEICHER, DANN DAS HAUS VERLASSEN — je Teil, und in dieser
    Reihenfolge aus einem Grund: scheitert der Weg nach draussen, liegt der
    Stand wenigstens drinnen. Andersherum stünde man am Ende mit gar nichts
    da. Deshalb hält ein Fehler nach draussen den eigenen Speicher nicht auf:
    er wird gemerkt, die übrigen Teile gehen nur noch nach drinnen, und erst
    danach zählt er.
  */
  const { zeilen, bytes } = await standSchreiben(betrieb, tabellen, schluessel, lauf, async (text, nr) => {
    const eigener = teilPfad(pfad, lauf, nr);
    /*
      EIN STAND JE TAG. Läuft die Ausleitung an einem Tag zweimal — etwa nach
      einem Fehlschlag von Hand angestossen —, überschreibt der zweite den
      ersten, statt eine zweite Datei danebenzulegen. Sonst wüchse der
      Speicher mit jedem Wiederholungsversuch, und beim Wiederanlauf müsste
      jemand raten, welche der beiden die vollständige ist. Deshalb `upsert`
      — für den ersten Teil, der zuletzt geht; die weiteren tragen ihren Lauf
      im Namen.
    */
    const hoch = await fetch(`${URL_BASIS}/storage/v1/object/${EIMER}/${eigener}`, {
      method: 'POST',
      headers: {
        ...alsDienst,
        'Content-Type': 'application/x-ndjson',
        'x-upsert': 'true',
      },
      body: text,
    });
    if (!hoch.ok) throw new Error(`Speicher: ${await hoch.text()}`);
    await hoch.body?.cancel();
    pfade.push(eigener);

    if (ZIEL && draussenPfad && !draussenFehler) {
      try {
        const da = await ausserHausLegen(ZIEL, teilPfad(draussenPfad, lauf, nr), text, heute);
        if (nr === 1) ziel = da;
      } catch (e) {
        draussenFehler = e instanceof Error ? e : new Error(String(e));
      }
    }
  });
  pfade.reverse();
  await fremdeTeileRaeumen(betrieb, lauf, heute);

  /*

    UND DER FEHLSCHLAG NACH DRAUSSEN IST EIN FEHLSCHLAG. Ihn als Erfolg mit
    Fussnote zu melden wäre die bequeme Fassung und die falsche: die
    Überwachung soll ausschlagen, wenn die Sicherung ausser Haus ausbleibt.
    Genau dieses Ausbleiben ist der stille Ausfall, gegen den das Ganze
    gebaut ist. Ist gar kein Ziel eingerichtet, ist das etwas anderes — eine
    benannte Lücke, kein Fehler, und der Lauf gilt als erfolgreich.
  */
  let ausserHaus = false;
  /*
    DIE DATEIEN GEHEN NUR AUSSER HAUS, und ohne Ziel gehen sie gar nicht.

    Sie liegen bereits im Speicher DIESES Projekts; sie in den Eimer nebenan
    zu kopieren verdoppelte den Platz und schützte gegen nichts — fällt das
    Projekt aus, fällt beides aus. Ohne eingerichteten Zielspeicher ist das
    also keine ausgelassene Arbeit, sondern keine.
  */
  let dateien = 0;
  let dateienOffen = 0;
  if (draussenFehler) throw draussenFehler;
  if (ZIEL) {
    ausserHaus = true;
    const bilanz = await dateienAusserHaus(ZIEL, betrieb, heute);
    dateien = bilanz.anzahl;
    dateienOffen = bilanz.offen;
  }

  const geraeumt = await alteStaendeRaeumen(betrieb, heute);
  await festhalten(betrieb, true, null, zeilen, ausserHaus);
  return {
    companyId: betrieb, zeilen, bytes, pfad, pfade, geraeumt, ausserHaus, ziel,
    dateien, dateienOffen,
  };
}

/** Wie lange die Links einer Übergabe gelten: eine Woche. */
const UEBERGABE_SEKUNDEN = 7 * 24 * 60 * 60;

async function signieren(eimer: string, pfade: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (let i = 0; i < pfade.length; i += 500) {
    const teil = pfade.slice(i, i + 500);
    const r = await fetch(`${URL_BASIS}/storage/v1/object/sign/${encodeURIComponent(eimer)}`, {
      method: 'POST', headers: alsDienst,
      body: JSON.stringify({ expiresIn: UEBERGABE_SEKUNDEN, paths: teil }),
    });
    if (!r.ok) throw new Error(`Speicher (${eimer}): ${await r.text()}`);
    for (const e of (await r.json()) as Array<{ path: string; signedURL?: string | null }>) {
      if (e.signedURL) links.set(e.path, `${URL_BASIS}/storage/v1${e.signedURL}`);
    }
  }
  return links;
}

async function ablegen(pfad: string, inhalt: string, typ: string): Promise<void> {
  const r = await fetch(`${URL_BASIS}/storage/v1/object/${EIMER}/${pfad}`, {
    method: 'POST',
    headers: { ...alsDienst, 'Content-Type': typ, 'x-upsert': 'true' },
    body: inhalt,
  });
  if (!r.ok) throw new Error(`Speicher: ${await r.text()}`);
  await r.body?.cancel();
}

/**
 * DIE ÜBERGABE AN EINEN DEAKTIVIERTEN BETRIEB (Nachtest 01.10.2026, Paket D),
 * vor seiner Löschung: alle Tabellen als ein Stand (dasselbe Format wie die
 * Sicherung, also auch für `scripts/ruecklauf.mjs` lesbar) und ein
 * Verzeichnis aller Scheinfotos und Baustellendokumente mit Links. Alles mit
 * einer Woche Gültigkeit, das Datum steht im Protokoll der Plattform.
 *
 * Belege als PDF erzeugt die App im Browser; der Stand enthält ihre Daten
 * vollständig, Unterschriften eingeschlossen.
 */
async function uebergabe(
  admin: string, betrieb: string, grund: string,
  tabellen: string[], schluessel: Record<string, string[]>,
): Promise<Response> {
  const liste = await fetch(`${URL_BASIS}/rest/v1/rpc/betrieb_uebergabe_dateien`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify({ p_admin: admin, p_kennung: betrieb }),
  });
  const dateien = await liste.json().catch(() => null);
  if (!liste.ok) {
    const d = dateien as { message?: string; code?: string } | null;
    return fehler(String(d?.message ?? 'Abgewiesen.'), d?.code === '42501' ? 403 : 409);
  }

  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  const datenPfad = `uebergabe/${betrieb}/${stempel}-daten.jsonl`;
  const lauf = neuerLauf();
  const datenPfade: string[] = [];
  const { zeilen, bytes } = await standSchreiben(betrieb, tabellen, schluessel, lauf, async (text, nr) => {
    const p = teilPfad(datenPfad, lauf, nr);
    await ablegen(p, text, 'application/x-ndjson');
    datenPfade.push(p);
  });
  datenPfade.reverse();

  const jeEimer = new Map<string, string[]>();
  for (const d of (dateien ?? []) as Array<{ eimer: string; pfad: string }>) {
    jeEimer.set(d.eimer, [...(jeEimer.get(d.eimer) ?? []), d.pfad]);
  }
  const verzeichnis: Array<{ eimer: string; pfad: string; link: string | null }> = [];
  for (const [eimer, pfade] of jeEimer) {
    const links = await signieren(eimer, pfade);
    for (const p of pfade) verzeichnis.push({ eimer, pfad: p, link: links.get(p) ?? null });
  }
  const gueltigBis = new Date(Date.now() + UEBERGABE_SEKUNDEN * 1000).toISOString();
  const verzeichnisPfad = `uebergabe/${betrieb}/${stempel}-dateien.json`;
  await ablegen(
    verzeichnisPfad,
    JSON.stringify({ betrieb, erstellt: new Date().toISOString(), gueltigBis, dateien: verzeichnis }, null, 2),
    'application/json',
  );
  const eigene = await signieren(EIMER, [...datenPfade, verzeichnisPfad]);

  const fest = await fetch(`${URL_BASIS}/rest/v1/rpc/betrieb_export_festhalten`, {
    method: 'POST', headers: alsDienst,
    body: JSON.stringify({
      p_admin: admin, p_kennung: betrieb, p_grund: grund,
      p_angaben: { zeilen, bytes, teile: datenPfade.length, dateien: verzeichnis.length, gueltig_bis: gueltigBis },
    }),
  });
  if (!fest.ok) {
    const d = await fest.json().catch(() => ({}));
    return fehler(`Der Export liegt bereit, der Vermerk im Protokoll wurde aber abgewiesen: ${String(d?.message ?? '')}`, 500);
  }
  await fest.body?.cancel();

  return antwort({
    companyId: betrieb,
    zeilen,
    bytes,
    dateien: verzeichnis.length,
    datenLink: eigene.get(datenPfad) ?? null,
    // Ein grosser Betrieb kommt in mehreren Teilen; alle gehören zusammen.
    datenLinks: datenPfade.map((p) => eigene.get(p) ?? null),
    dateienLink: eigene.get(verzeichnisPfad) ?? null,
    gueltigBis,
  });
}

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
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
  /*
    Dieselbe Sorte Auskunft wie beim fehlenden Dienstschlüssel: „an mir liegt
    es", mit dem Namen des fehlenden Feldes. Ohne diese Zeile liefe der Lauf
    los, schriebe in den eigenen Speicher und meldete „liegt im selben
    Projekt" — die richtige Meldung für den falschen Grund, und niemand
    suchte nach dem fünften Feld.
  */
  if (ZIEL_FEHLER) return fehler(ZIEL_FEHLER, 503);

  const tabellenAntwort = await fetch(`${URL_BASIS}/rest/v1/rpc/auszug_tabellen`, {
    method: 'POST', headers: alsDienst, body: '{}',
  });
  if (!tabellenAntwort.ok) return fehler('Die Tabellenliste ist nicht lesbar.', 500);
  const tabellen = (await tabellenAntwort.json()) as string[];
  /*
    DER PRIMÄRSCHLÜSSEL JE TABELLE — die Ordnung beim Blättern. Fehlt die
    Antwort (eine Datenbank vor `20260926114000`), wird ohne Ordnung gelesen
    wie bisher, statt die Sicherung ganz ausfallen zu lassen.
  */
  const schluesselAntwort = await fetch(`${URL_BASIS}/rest/v1/rpc/auszug_schluessel`, {
    method: 'POST', headers: alsDienst, body: '{}',
  });
  let schluessel: Record<string, string[]> = {};
  if (schluesselAntwort.ok) {
    schluessel = ((await schluesselAntwort.json()) as Record<string, string[]> | null) ?? {};
  } else {
    await schluesselAntwort.body?.cancel();
  }
  const heute = new Date();

  /*
    DER NACHTLAUF: mit dem Dienstschlüssel, über alle Betriebe.

    Verglichen wird der ganze Schlüssel, nicht eine Eigenschaft daraus — wer
    ihn hat, ist die Maschine, und etwas anderes soll hier auch nicht
    durchkommen.
  */
  if (rufDerMaschine(kopf, apikeyKopf, SCHLUESSEL)) {
    const firmen = await fetch(`${URL_BASIS}/rest/v1/companies?select=id`, {
      headers: alsDienst,
    });
    if (!firmen.ok) return fehler('Die Betriebe sind nicht lesbar.', 500);

    /*
      EIN DEAKTIVIERTER BETRIEB RUHT (Nachtest 01.10.2026, Paket D): kein
      neuer Stand, kein Aufräumen — der letzte Stand bleibt, wie er ist.
    */
    const ruhendAntwort = await fetch(
      `${URL_BASIS}/rest/v1/betrieb_zustand?select=betrieb_kennung&deaktiviert_am=not.is.null`,
      { headers: alsDienst },
    );
    const ruhend = new Set(
      ruhendAntwort.ok
        ? ((await ruhendAntwort.json()) as Array<{ betrieb_kennung: string }>).map((z) => z.betrieb_kennung)
        : [],
    );

    const bilanzen: Bilanz[] = [];
    const gescheitert: Array<{ companyId: string; meldung: string }> = [];
    for (const { id } of (await firmen.json()) as Array<{ id: string }>) {
      if (ruhend.has(id)) continue;
      try {
        bilanzen.push(await betriebAusleiten(id, tabellen, schluessel, heute));
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
      ruhend: ruhend.size,
      zeilen: bilanzen.reduce((s, b) => s + b.zeilen, 0),
      bytes: bilanzen.reduce((s, b) => s + b.bytes, 0),
      gescheitert,
      dateien: bilanzen.reduce((s, b) => s + b.dateien, 0),
      dateienOffen: bilanzen.reduce((s, b) => s + b.dateienOffen, 0),
      // ALLE oder keiner: ein Lauf, bei dem die Hälfte der Betriebe nach
      // draussen kam, ist kein „ausser Haus".
      zielExtern: bilanzen.length > 0 && bilanzen.every((b) => b.ausserHaus),
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
  // Runde 3, H1: wer einen zweiten Faktor braucht, kommt ohne ihn auch hier nicht weiter.
  if (await zweiterFaktorFehlt(URL_BASIS, alsDienst, String(wer.id), token)) return fehler(ZWEITER_FAKTOR_FEHLT, 403);

  const profilAntwort = await fetch(
    `${URL_BASIS}/rest/v1/users?select=company_id,role,active&id=eq.${wer.id}`,
    { headers: alsDienst },
  );
  const [profil] = profilAntwort.ok ? await profilAntwort.json() : [];
  if (!profil) {
    /*
      DER GLOBALE ADMINISTRATOR hat keine Zeile in einer Belegschaft. Er darf
      genau eines: die Übergabe an einen deaktivierten Betrieb — mit Grund.
      Die Plattformtabelle entscheidet, nicht das Token.
    */
    const adminAntwort = await fetch(
      `${URL_BASIS}/rest/v1/platform_admins?id=eq.${wer.id}&select=id`, { headers: alsDienst },
    );
    const admins = adminAntwort.ok ? await adminAntwort.json() : [];
    if (!Array.isArray(admins) || admins.length === 0) return fehler('Keine Anmeldung.', 401);
    let eingabe: { betrieb?: unknown; grund?: unknown } = {};
    try {
      eingabe = await req.json();
    } catch {
      return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
    }
    const betrieb = String(eingabe?.betrieb ?? '').trim();
    const grund = String(eingabe?.grund ?? '').trim();
    if (!betrieb) return fehler('Welcher Betrieb, steht nicht in der Anfrage.', 400);
    if (!grund) return fehler('Ohne Grund keine Übergabe — er steht im Protokoll.', 400);
    try {
      return await uebergabe(wer.id, betrieb, grund, tabellen, schluessel);
    } catch (e) {
      return fehler(e instanceof Error ? e.message : 'Die Übergabe ist gescheitert.', 500);
    }
  }
  if (!profil.active) return fehler('Keine Anmeldung.', 401);
  // Ein noch gültiges Token aus einem deaktivierten Betrieb stösst nichts mehr an.
  const ruhtAntwort = await fetch(
    `${URL_BASIS}/rest/v1/betrieb_zustand?select=betrieb_kennung&deaktiviert_am=not.is.null&betrieb_kennung=eq.${encodeURIComponent(profil.company_id)}`,
    { headers: alsDienst },
  );
  const ruht = ruhtAntwort.ok ? ((await ruhtAntwort.json()) as unknown[]).length > 0 : false;
  if (ruht) return fehler('Keine Anmeldung.', 401);
  if (profil.role !== 'Geschäftsführung' && profil.role !== 'Administrator') {
    return fehler('Nur Geschäftsführung oder Administration.', 403);
  }

  try {
    const bilanz = await betriebAusleiten(profil.company_id, tabellen, schluessel, heute);
    /*
      `ziel` STEHT IM KLARTEXT IN DER ANSICHT — und soll dort die Wahrheit
      sagen. „Eimer im selben Projekt" ist ein Satz, den jemand liest und
      versteht; ein `false` in einem Feld namens `zielExtern` ist einer, den
      niemand liest. Beides kommt jetzt aus der Bilanz, also aus dem, was
      wirklich geschah.
    */
    return antwort({ ...bilanz, zielExtern: bilanz.ausserHaus });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : 'Unbekannter Fehler';
    await festhalten(profil.company_id, false, meldung, null);
    return fehler(meldung, 500);
  }
}));
