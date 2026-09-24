/**
 * Die Taille der Datenschicht, auf Postgres.
 *
 * Gegenstück zu `src/lib/db/core.ts`. Kernregel unverändert: JEDE Abfrage ist
 * auf `companyId` eingeschränkt, JEDER Schreibvorgang setzt sie aus dem
 * Anmeldekontext und nie aus einer Eingabe. Dieselbe Prüfung erzwingt
 * zusätzlich der Zeilenschutz in der Datenbank — der Client ist die Bequem-
 * lichkeit, die Datenbank ist die Zusage.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient } from '@/lib/supabase';
import type { WithId } from '../core';
import { zeileAlsObjekt, objektAlsZeile } from './felder';
import { meldeVerbindung, vergissVerbindung } from '@/lib/liveVerbindung';

/*
  DIESELBE KENNUNG WIE AUF DER ANDEREN SEITE. Sie hier ein zweites Mal zu
  erklären hiesse, zwei Typen zu haben, die zufällig gleich aussehen — und
  eines Tages nicht mehr.
*/
export type { WithId };

/**
 * Wie lange nach dem Abonnieren noch einmal geholt wird.
 *
 * Gross genug, dass die Anlaufzeit des Meldewegs sicher darin liegt; klein
 * genug, dass eine Ansicht nicht spürbar hinterherhinkt.
 */
export const NACHFASSEN_MS = 1200;

/**
 * Der Client, mit dem diese Schicht arbeitet.
 *
 * Standardmässig der aus `lib/supabase.ts`. Er lässt sich ersetzen, und das
 * ist keine Hintertür für Tests, sondern die Naht, an der die App ihren
 * angemeldeten Client EINMAL hineinreicht, statt ihn durch hundertdreissig
 * Signaturen zu fädeln. Tests benutzen dieselbe Naht — nicht eine eigene.
 */
let eingereicht: SupabaseClient | null = null;

export function clientEinreichen(c: SupabaseClient | null): void {
  eingereicht = c;
}

export function derClient(c?: SupabaseClient): SupabaseClient {
  return c ?? eingereicht ?? supabaseClient();
}

/**
 * Die Bedingungen, die eine Abfrage tragen muss.
 *
 * Bewusst eine kurze, ausdrückliche Liste statt eines allgemeinen Baukastens.
 * Die alte Schicht reichte Firestore-Bedingungen durch; das ging, weil es
 * Firestore-Bedingungen waren. Hier wäre ein „alles geht"-Baukasten der
 * schnellste Weg zu einer Abfrage, die niemand mehr lesen kann — und zu einer,
 * die versehentlich ohne Grenze läuft.
 */
export type Bedingung =
  | { art: 'gleich'; feld: string; wert: unknown }
  | { art: 'ungleich'; feld: string; wert: unknown }
  | { art: 'in'; feld: string; werte: readonly unknown[] }
  | { art: 'ab'; feld: string; wert: unknown }
  | { art: 'bis'; feld: string; wert: unknown }
  /** Der Wert steht IN einem Feld, das eine Liste ist (Firestore: array-contains). */
  | { art: 'enthaelt'; feld: string; wert: unknown }
  /**
   * Das Feld ist leer (`is null`) — etwa „noch nicht geliefert". Eigene Art,
   * weil `gleich` mit `null` in PostgREST nichts findet: `= null` ist in SQL
   * nie wahr.
   */
  | { art: 'leer'; feld: string };

export interface Abfrage {
  wo?: readonly Bedingung[];
  sortiere?: { feld: string; absteigend?: boolean };
  grenze?: number;
  /**
   * Eine fertige `or`-Bedingung — für die Suche über mehrere Spalten.
   *
   * WARUM SIE NICHT ALS `Bedingung` KOMMT. Die anderen Bedingungen sind
   * Paare aus Feld und Wert; diese ist eine ZEICHENKETTE mit eigener Syntax,
   * die `pg/suche.ts` baut und entschärft. Sie hier als etwas anderes
   * auszugeben, als sie ist, hiesse, die Entschärfung aus dem Blick zu
   * verlieren — und genau dort sitzt das Risiko.
   */
  oder?: string | null;
}

/**
 * Nur die Methoden, die diese Datei wirklich aufruft.
 *
 * Der Baukasten von supabase-js trägt drei Typparameter, die hier nichts
 * beitragen und `any` nach sich zögen. Ein eigener, kleiner Ausschnitt sagt
 * genau, worauf sich diese Schicht verlässt — und bricht, wenn sich daran
 * etwas ändert.
 */
interface Filterbar {
  eq(spalte: string, wert: unknown): Filterbar;
  neq(spalte: string, wert: unknown): Filterbar;
  in(spalte: string, werte: unknown[]): Filterbar;
  contains(spalte: string, werte: unknown[]): Filterbar;
  is(spalte: string, wert: null): Filterbar;
  gte(spalte: string, wert: unknown): Filterbar;
  lte(spalte: string, wert: unknown): Filterbar;
  order(spalte: string, wie: { ascending: boolean }): Filterbar;
  limit(anzahl: number): Filterbar;
  or(bedingung: string): Filterbar;
  range(von: number, bis: number): Filterbar;
}

function anwenden(bauer: Filterbar, abfrage: Abfrage, tabelle: string): Filterbar {
  let b = bauer;
  for (const bed of abfrage.wo ?? []) {
    const spalte = alsSpalteSicher(bed.feld);
    if (bed.art === 'gleich') b = b.eq(spalte, bed.wert);
    else if (bed.art === 'ungleich') b = b.neq(spalte, bed.wert);
    else if (bed.art === 'in') b = b.in(spalte, bed.werte as unknown[]);
    else if (bed.art === 'ab') b = b.gte(spalte, bed.wert);
    else if (bed.art === 'bis') b = b.lte(spalte, bed.wert);
    else if (bed.art === 'leer') b = b.is(spalte, null);
    else b = b.contains(spalte, [bed.wert]);
  }
  // VOR dem Sortieren und der Grenze: `or` ist ein Filter wie die anderen,
  // und PostgREST erwartet Filter vor der Reihenfolge.
  if (abfrage.oder) b = b.or(abfrage.oder);
  if (abfrage.sortiere) {
    b = b.order(alsSpalteSicher(abfrage.sortiere.feld), {
      ascending: !abfrage.sortiere.absteigend,
    });
  }
  if (abfrage.grenze !== undefined) b = b.limit(abfrage.grenze);

  /*
    EIN EINDEUTIGER ZWEITSCHLÜSSEL — auch wenn gar nicht sortiert wurde.

    Ohne ihn ist die Reihenfolge bei gleichen Sortierwerten offen, und beim
    BLÄTTERN heisst offen: eine Zeile kann auf zwei Seiten stehen und eine
    andere auf keiner. Das fällt nicht als Fehler auf, sondern als eine Liste,
    in der ein Eintrag doppelt steht und ein anderer fehlt — und niemand
    sucht danach, weil beides für sich richtig aussieht.

    Wo schon sortiert wird, entscheidet er nur den Gleichstand; wo nicht,
    macht er aus einer beliebigen Reihenfolge eine feste. Verloren geht dabei
    nichts: eine beliebige Reihenfolge hat keine Bedeutung, die man behalten
    könnte.
  */
  for (const spalte of zweitschluessel(tabelle)) {
    b = b.order(spalte, { ascending: true });
  }
  return b;
}

/**
 * Die Spalten, die eine Zeile eindeutig machen.
 *
 * FAST IMMER `id` — und die Ausnahme hat mich eingeholt. `monthly_stats` ist
 * seit Stufe 7 eine SICHT und hat keine Kennung; sie wird über `abfragen`
 * gelesen wie jede Tabelle, und ein `order by id` darauf ist schlicht ein
 * Fehler. Gefunden hat das nicht der Kopf, sondern der Prüflauf.
 *
 * Die anderen vier Beziehungen ohne Kennung (`system_laeufe`, `user_prefs`,
 * `number_counters`, `betriebsanlagen`) kommen hier nicht vor, weil sie
 * unmittelbar gelesen werden. `zeilengrenze.test.ts` hält die Liste gegen das
 * echte Schema — eine sechste kann damit nicht still auflaufen.
 */
function zweitschluessel(tabelle: string): string[] {
  // Betrieb, Benutzer und Monat sind in der Sicht zusammen eindeutig; der
  // Betrieb steht ohnehin schon in der Bedingung.
  if (tabelle === 'monthly_stats') return ['user_id', 'monat'];
  return ['id'];
}

/** Feldnamen kommen aus dem Quelltext, nie aus Eingaben — trotzdem geprüft. */
function alsSpalteSicher(feld: string): string {
  const spalte = feld.replace(/[A-Z]/g, (z) => `_${z.toLowerCase()}`);
  if (!/^[a-z][a-z0-9_]*$/.test(spalte)) {
    throw new Error(`Unbrauchbarer Feldname: ${feld}`);
  }
  return spalte;
}

/**
 * Wie lang die Werteliste einer `in`-Abfrage werden darf.
 *
 * DIE GRENZE IST NICHT WEG, SIE HAT DIE FORM GEWECHSELT. Firestore liess
 * höchstens 30 Werte je `in` zu; die umgestellten Module haben die
 * Blockbildung darum weggelassen, mit dem Vermerk „hier gibt es diese Grenze
 * nicht". Für Postgres stimmt das — nur steht zwischen der App und Postgres
 * PostgREST, und dort steht die Werteliste in der ADRESSE. Das Gateway weist
 * eine zu lange Adresse mit `414 URI too long` ab.
 *
 * GEMESSEN, NICHT GESCHÄTZT: die Annahme bricht zwischen 8135 und 8145
 * Zeichen Werteliste ab (eingegrenzt gegen den örtlichen Stapel, siehe
 * `tests/supabase/inGrenze.test.ts`). Bei Kennungen sind das gut 220 Stück —
 * erreichbar, sobald jemand einen Monat Scheine oder die Kunden zu 300
 * Baustellen lädt.
 *
 * 4000 ist die Hälfte davon. Der Abstand ist Absicht: die gehostete Anlage
 * muss nicht dieselbe Grenze haben wie die örtliche, und ein Block von rund
 * hundert Kennungen kostet keine spürbare Zeit.
 */
const LISTE_HOECHSTENS = 4000;

/** So lang wird der Wert in der Adresse, grob nach oben geschätzt. */
function adressLaenge(wert: unknown): number {
  // `+3` für das Komma und die Anführungszeichen, die PostgREST um
  // Zeichenketten setzt.
  return encodeURIComponent(String(wert)).length + 3;
}

/** Die `in`-Bedingung, die gestückelt werden muss — oder keine. */
type InBedingung = Extract<Bedingung, { art: 'in' }>;

function zuLangeListe(abfrage: Abfrage): { bed: InBedingung; laenge: number } | null {
  for (const bed of abfrage.wo ?? []) {
    if (bed.art !== 'in') continue;
    const laenge = bed.werte.reduce<number>((summe, w) => summe + adressLaenge(w), 0);
    if (laenge > LISTE_HOECHSTENS) return { bed, laenge };
  }
  return null;
}

/** Die Werte in Blöcke schneiden, die je unter der Grenze bleiben. */
function bloecke(werte: readonly unknown[]): unknown[][] {
  const raus: unknown[][] = [];
  let laufend: unknown[] = [];
  let laenge = 0;
  for (const w of werte) {
    const l = adressLaenge(w);
    if (laufend.length > 0 && laenge + l > LISTE_HOECHSTENS) {
      raus.push(laufend);
      laufend = [];
      laenge = 0;
    }
    laufend.push(w);
    laenge += l;
  }
  if (laufend.length > 0) raus.push(laufend);
  return raus;
}

/**
 * Wie viele Zeilen je Anfrage geholt werden.
 *
 * DIE ZWEITE STILLE GRENZE, und sie wiegt schwerer als die erste. PostgREST
 * gibt höchstens `db-max-rows` Zeilen zurück — im Projekt 1000 — und zwar
 * OHNE Fehler und ohne Hinweis. Gemessen: 1500 Zeilen in der Tabelle, 1000
 * kommen an, der Rest fehlt einfach.
 *
 * Das ist genau die Narbe, die Stufe 7 zu entfernen glaubte. `listengrenzen.ts`
 * ist gelöscht, die Nachladeknöpfe sind weg — die Grenze war aber nie im Code,
 * sie sass eine Ebene tiefer. Für einen Betrieb mit zehn Monteuren erreicht
 * `time_entries` die tausend in etwa vier Monaten; danach zeigte jede
 * Jahresauswertung zu wenig, und nichts daran sähe falsch aus.
 *
 * 500 UND NICHT 1000: die Seitengrösse muss UNTER der Serverobergrenze
 * liegen. Wer 1000 anfordert und 1000 bekommt, weiss nicht, ob das die
 * Antwort war oder die Deckelung; wer 500 anfordert und 500 bekommt, weiss
 * es. Dass 500 wirklich unter der Grenze liegt, ist gemessen und nicht
 * angenommen — siehe `tests/supabase/zeilengrenze.test.ts`.
 */
export const SEITE = 500;

/** Abfrage innerhalb eines Mandanten. */
export async function abfragen<T>(
  tabelle: string,
  companyId: string,
  abfrage: Abfrage = {},
  client?: SupabaseClient,
): Promise<WithId<T>[]> {
  const lang = zuLangeListe(abfrage);
  if (lang) {
    /*
      MIT GRENZE WÄRE DIE STÜCKELUNG EINE STILLE LÜGE. Jeder Block brächte
      seine eigenen `grenze` Zeilen mit, und zusammengelegt stünde eine andere
      Auswahl da als die, die gefragt war. Das nachträglich in der App zu
      sortieren hiesse, die Sortierregeln von Postgres nachzubauen — für
      Umlaute gehen die beiden auseinander.

      Heute ruft niemand so; deshalb bricht es laut ab, statt etwas
      Unauffälliges zurückzugeben. Wer die Verbindung braucht, erfährt es
      sofort und nicht über eine Liste, die fast stimmt.
    */
    if (abfrage.grenze !== undefined) {
      throw new Error(
        `Abfrage auf ${tabelle}: eine Werteliste von ${lang.laenge} Zeichen zusammen mit einer `
          + 'Grenze lässt sich nicht stückeln, ohne die Auswahl zu verändern.',
      );
    }
    const teile = await Promise.all(
      bloecke(lang.bed.werte).map((block) =>
        abfragen<T>(
          tabelle,
          companyId,
          {
            ...abfrage,
            wo: (abfrage.wo ?? []).map((b) =>
              b === lang.bed ? { ...lang.bed, werte: block } : b,
            ),
          },
          client,
        ),
      ),
    );
    return teile.flat();
  }

  const c = derClient(client);
  const gesamt: Record<string, unknown>[] = [];

  for (let von = 0; ; von += SEITE) {
    /*
      WIE VIELE ZEILEN DIESE SEITE HOLEN DARF. Mit `grenze` nie mehr als noch
      fehlen — sonst käme aus einer Abfrage mit `grenze: 10` eine Seite mit
      500 Zeilen, von denen 490 weggeworfen würden.
    */
    const rest = abfrage.grenze === undefined
      ? SEITE
      : Math.min(SEITE, abfrage.grenze - gesamt.length);
    if (rest <= 0) break;

    const bauer = anwenden(
      c.from(tabelle).select('*').eq('company_id', companyId) as unknown as Filterbar,
      // `grenze` wird HIER nicht mitgegeben: sie steckt schon in `rest`, und
      // ein `limit` neben einem `range` liefert deren Schnittmenge — also
      // beim zweiten Durchgang nichts mehr.
      { ...abfrage, grenze: undefined },
      tabelle,
    ).range(von, von + rest - 1);

    const { data, error } = await (bauer as unknown as PromiseLike<{
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    }>);
    if (error) throw new Error(error.message);

    const zeilen = data ?? [];
    gesamt.push(...zeilen);

    /*
      EINE NICHT VOLLE SEITE IST DIE LETZTE. Genau dafür liegt `SEITE` unter
      der Serverobergrenze: käme die Deckelung ins Spiel, wäre eine volle
      Seite nicht mehr von einer gedeckelten zu unterscheiden, und das
      Blättern hörte an derselben Stelle auf wie vorher.
    */
    if (zeilen.length < rest) break;
  }

  return gesamt.map((z) => zeileAlsObjekt<WithId<T>>(tabelle, z));
}

/** Schreibt ein neues Dokument; companyId kommt aus dem Anmeldekontext. */
export async function anlegen(
  tabelle: string,
  companyId: string,
  daten: Record<string, unknown>,
  client?: SupabaseClient,
): Promise<string> {
  const c = derClient(client);
  const zeile = { ...objektAlsZeile(tabelle, daten), company_id: companyId };
  const { data, error } = await c.from(tabelle).insert(zeile).select('id').single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

/**
 * Legt an ODER überschreibt — mit einer Kennung vom Gerät.
 *
 * Der Weg für alles, was ohne Empfang entstehen darf: nur wenn die Kennung
 * schon feststeht, bevor der Server sie bestätigt, kann derselbe Vorgang
 * zweimal ankommen, ohne zweimal zu landen (siehe `lib/sync/ausgangsfach.ts`).
 */
export async function anlegenMitKennung(
  tabelle: string,
  companyId: string,
  id: string,
  daten: Record<string, unknown>,
  client?: SupabaseClient,
): Promise<string> {
  const c = derClient(client);
  const zeile = { ...objektAlsZeile(tabelle, daten), company_id: companyId, id };
  const { error } = await c.from(tabelle).upsert(zeile, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  return id;
}

/**
 * EIN SCHREIBVORGANG, DER NICHTS TRIFFT, IST EIN FEHLER — KEIN ERFOLG.
 *
 * Das ist der Unterschied, der beim Umzug am leichtesten durchrutscht.
 * Firestore WARF, wenn ein Dokument fehlte oder die Regeln es verwehrten. Der
 * Zeilenschutz antwortet anders: eine Zeile, die man nicht ändern darf, ist
 * für die Anweisung schlicht nicht da. PostgREST meldet dann keinen Fehler,
 * sondern null geänderte Zeilen — und der Aufrufer sieht einen geglückten
 * Schreibvorgang.
 *
 * Was das draussen heisst: die Verwaltung ändert die Wochenstunden eines
 * Mitarbeiters, bekommt „gespeichert" und sieht beim nächsten Laden den alten
 * Wert. Oder ein Antrag wird „zurückgezogen" und steht am nächsten Tag wieder
 * da. Kein Fehler, keine Meldung, kein Hinweis.
 *
 * `count: 'exact'` zählt die Zeilen, die die ANWEISUNG bewegt hat — nicht die,
 * die der Aufrufer danach lesen dürfte. Damit lässt sich „nichts getroffen"
 * von „erledigt" unterscheiden, und der Aufrufer bekommt dieselbe Auskunft
 * wie vorher.
 */
function pruefeTreffer(tabelle: string, anzahl: number | null): void {
  if (anzahl === 0) {
    throw new Error(
      `Kein Datensatz in ${tabelle} geändert — es gibt ihn nicht, oder er gehört nicht zu diesem Betrieb.`,
    );
  }
}

/** Aktualisiert; companyId wird NICHT verändert. */
export async function aendern(
  tabelle: string,
  id: string,
  daten: Record<string, unknown>,
  client?: SupabaseClient,
): Promise<void> {
  const c = derClient(client);
  const { companyId: _weg, ...rest } = daten;
  void _weg;
  const zeile = objektAlsZeile(tabelle, rest);
  /*
    NICHTS ZU SCHREIBEN IST KEIN FEHLSCHLAG. Ein Aufruf, in dem jedes Feld
    `undefined` war, will nichts ändern — dann darf er auch nicht daran
    scheitern, dass er nichts getroffen hat. Firestore hat einen leeren
    Schreibvorgang ebenso stillschweigend hingenommen.
  */
  if (Object.keys(zeile).length === 0) return;
  const { error, count } = await c
    .from(tabelle)
    .update(zeile, { count: 'exact' })
    .eq('id', id);
  if (error) throw new Error(error.message);
  pruefeTreffer(tabelle, count);
}

/** Löscht. Die Mandantenprüfung erzwingt der Zeilenschutz. */
export async function loeschen(
  tabelle: string,
  id: string,
  client?: SupabaseClient,
): Promise<void> {
  const c = derClient(client);
  const { error, count } = await c.from(tabelle).delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(error.message);
  pruefeTreffer(tabelle, count);
}

/**
 * Ein Kanal, der sich selbst wieder aufbaut — und selbst Bescheid gibt.
 *
 * EIN ABGERISSENER KANAL IST KEIN FEHLER, SONDERN DER NORMALFALL. Das
 * Live-Abonnement hängt an einer WebSocket-Verbindung. Schickt das Telefon
 * die App in den Hintergrund — Anruf, Bildschirmsperre, ein Blick in die
 * Karten-App —, schliesst das Betriebssystem sie. Am Schreibtisch reicht ein
 * Wechsel in einen anderen Browser-Tab: der Browser drosselt die Zeitgeber,
 * der Herzschlag der Verbindung bleibt aus, und der Server legt auf.
 *
 * WARUM DAS HIER STEHT UND NICHT VIERMAL. Es gab diesen Wiederaufbau genau
 * einmal, in `abonnieren`. Die drei anderen Abonnements der App — die
 * Einstellungen, die Rechnungen, die Rüstliste — meldeten einen Abriss
 * SOFORT als Fehler. Ein kurzer Blick in einen anderen Tab, und in der
 * Rechnungsansicht stand ein roter Kasten. Ein Wiederaufbau, den drei von
 * vier Wegen nicht haben, ist keiner.
 *
 * DREI ENTSCHEIDUNGEN, und die erste ist die, die gefehlt hat:
 *
 *   1. IM HINTERGRUND WIRD NICHT GEZÄHLT. Liegt der Tab im Hintergrund, ist
 *      ein geschlossener Kanal zu erwarten und ein Wiederaufbau zwecklos —
 *      der Browser drosselt ihn ohnehin. Ohne diese Zeile lief die Leiter
 *      der Wartezeiten ungesehen ab, und der Nutzer fand beim Zurückkommen
 *      eine Meldung vor über etwas, das in seiner Abwesenheit geschah und
 *      längst behoben war.
 *   2. WIEDERAUFBAU MIT WACHSENDEM ABSTAND. Gemeldet wird erst, wenn auch
 *      die letzte Stufe nicht greift; dann steht wirklich etwas an.
 *   3. GEMELDET WIRD AN `liveVerbindung`, NICHT AN DIE ANSICHT. Alle
 *      Abonnements hängen an derselben Verbindung; es ist ein Zustand der
 *      App und keiner dieser Liste. Und er lässt sich dort wieder
 *      ZURÜCKNEHMEN — was über `onError` nie ging.
 */
const ABSTAENDE_MS = [1000, 2000, 4000, 8000, 15000];

interface KanalAuftrag {
  tabelle: string;
  /** PostgREST-Filter für den Kanal, z. B. `company_id=eq.perl`. */
  filter: string;
  beiAenderung: (n: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => void;
  /** Läuft nach jedem geglückten Aufbau — auch nach einem Wiederaufbau. */
  beiBereit: () => void;
  client: SupabaseClient;
}

export function kanalHalten(a: KanalAuftrag): () => void {
  /*
    DER SCHLÜSSEL IST JE ABONNEMENT EINDEUTIG, nicht je Tabelle: dieselbe
    Tabelle kann in zwei Ansichten gleichzeitig abonniert sein, und wenn
    beide denselben Schlüssel benutzten, räumte das Abmelden der einen den
    Vorbehalt der anderen weg.
  */
  const schluessel = `${a.tabelle}-${Math.random().toString(36).slice(2)}`;
  let versuch = 0;
  /*
    EIN WIEDERAUFBAU IST SCHON EINGEPLANT — ALSO NICHT NOCH EINER.

    GEMESSEN, NICHT VERMUTET, und es war der eigentliche Grund für die
    Meldung aus dem Betrieb. Ein sterbender Kanal ruft seinen Rückruf nicht
    EINMAL, sondern mehrfach in einem Atemzug — `CHANNEL_ERROR`, dann
    `CLOSED`, und vor allem: `removeChannel` selbst meldet noch einmal
    `CLOSED`, und zwar SYNCHRON aus dem Rückruf heraus, der es gerade
    aufgerufen hat. Ohne diese Sperre lief die Behandlung also in sich
    selbst, fünf Ebenen tief, und die unterste meldete den Vorbehalt.

    Nachgemessen im echten Browser mit gekapptem Socket: der Hinweis stand
    nach ZWEI ZEHNTELSEKUNDEN da statt nach dreissig Sekunden — und zwar
    schon vor diesem Umbau. „Kurz den Tab gewechselt, sofort die Meldung"
    ist genau das.
  */
  let wartet = false;
  let beendet = false;
  let neuAufbau: ReturnType<typeof setTimeout> | undefined;
  let kanal: ReturnType<SupabaseClient['channel']> | null = null;

  /*
    OHNE `document` GILT „SICHTBAR". Im Prüflauf und auf dem Server gibt es
    keinen Tab, der in den Hintergrund rutschen könnte; „unsichtbar"
    anzunehmen hiesse, den Wiederaufbau dort stillzulegen.
  */
  const sichtbar = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

  const anmelden = () => {
    if (beendet) return;
    kanal = a.client
      .channel(`${a.tabelle}-${schluessel}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: a.tabelle, filter: a.filter },
        (n) => a.beiAenderung(n as unknown as {
          eventType: string;
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }),
      )
      .subscribe((status) => {
        if (beendet) return;

        if (status === 'SUBSCRIBED') {
          versuch = 0;
          wartet = false;
          meldeVerbindung(schluessel, true);
          a.beiBereit();
          return;
        }

        /*
          `CLOSED` kommt auch beim eigenen Abmelden — dann steht `beendet`
          schon, und wir sind oben heraus. Bleibt der Fall, in dem die
          Verbindung von aussen wegbricht.
        */
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;

        /*
          IM HINTERGRUND: NICHTS TUN, NICHTS ZÄHLEN, NICHTS MELDEN. Der
          Wiederaufbau beginnt bei `wiederDa` — und der läuft, sobald jemand
          wieder hinsieht.
        */
        if (!sichtbar()) return;

        // Der zweite Ruf desselben sterbenden Kanals ist keine zweite
        // Störung — siehe `wartet` oben.
        if (wartet) return;

        if (versuch >= ABSTAENDE_MS.length) {
          meldeVerbindung(schluessel, false);
          return;
        }
        /*
          DIE SPERRE ZUERST, DANN DAS AUFRÄUMEN — und diese Reihenfolge ist
          das ganze Kunststück.

          `removeChannel` meldet den Kanal ab, und das ruft DIESEN Rückruf
          synchron noch einmal auf, mit `CLOSED`. Stünde `wartet = true`
          dahinter, liefe der Rückruf in sich selbst: fünf Ebenen tief, und
          die unterste meldete den Vorbehalt — alles im selben Atemzug. Die
          Leiter von dreissig Sekunden wäre nach zwei Zehntelsekunden abgelaufen.

          Im echten Browser nachgemessen, und es ist die Ursache der Meldung
          aus dem Betrieb: „kurz den Tab gewechselt, sofort die Meldung".
        */
        const wartezeit = ABSTAENDE_MS[versuch];
        versuch += 1;
        wartet = true;
        if (kanal) void a.client.removeChannel(kanal);
        kanal = null;
        neuAufbau = setTimeout(() => { wartet = false; anmelden(); }, wartezeit);
      });
  };

  /*
    ZURÜCK AUS DEM HINTERGRUND: sofort, nicht erst nach dem Abstand.

    Ohne das läge zwischen „App wieder da" und „Daten wieder aktuell" die
    gerade laufende Wartezeit — und der Monteur sähe seinen eben gebuchten
    Eintrag bis zu fünfzehn Sekunden lang nicht.
  */
  const wiederDa = () => {
    if (beendet) return;
    if (!sichtbar()) return;
    versuch = 0;
    wartet = false;
    if (neuAufbau) { clearTimeout(neuAufbau); neuAufbau = undefined; }
    if (kanal) { void a.client.removeChannel(kanal); kanal = null; }
    anmelden();
  };

  const horcht = typeof document !== 'undefined' && typeof window !== 'undefined';
  if (horcht) {
    document.addEventListener('visibilitychange', wiederDa);
    window.addEventListener('online', wiederDa);
  }

  anmelden();

  return () => {
    beendet = true;
    if (neuAufbau) clearTimeout(neuAufbau);
    if (horcht) {
      document.removeEventListener('visibilitychange', wiederDa);
      window.removeEventListener('online', wiederDa);
    }
    vergissVerbindung(schluessel);
    if (kanal) void a.client.removeChannel(kanal);
  };
}

/**
 * Live-Abonnement innerhalb eines Mandanten.
 *
 * VIER ENTSCHEIDUNGEN, JEDE AUS EINEM FEHLSCHLAG GELERNT.
 *
 * 1. ERST ABONNIEREN, DANN HOLEN. Firestore lieferte den ersten Bestand aus
 *    demselben Abo; hier sind das zwei Vorgänge. Wer zuerst holt und dann
 *    abonniert, verliert alles, was dazwischen passiert — lautlos.
 *
 * 2. WAS WÄHREND DES HOLENS HEREINKOMMT, WIRD GEPUFFERT. Zwischen dem Abzug,
 *    den die Abfrage zurückbringt, und dem Augenblick, in dem das Abonnement
 *    als bereit gilt, liegt eine kurze Zeit. Ohne Puffer fiele sie hinein.
 *
 * 3. EINMAL WIRD NACHGEFASST. Das ist der unangenehme Teil: `SUBSCRIBED`
 *    sagt, dass der KANAL steht — nicht, dass das Abonnement serverseitig
 *    schon hört. Zwischen beidem liegen je nach Auslastung einige hundert
 *    Millisekunden, und was in dieser Zeit geschrieben wird, meldet niemand.
 *    Beobachtbar ist dieser Zustand von aussen nicht. Also wird nach einer
 *    kurzen Frist ein zweites Mal geholt und der Bestand abgeglichen; eine
 *    Abfrage mehr je Abonnement ist der Preis dafür, dass keine Zeile fehlt.
 *
 *    Ohne dieses Nachfassen flatterten die Prüfungen dieser Datei — und ein
 *    Flattern im Test heisst draussen: die Liste des Monteurs ist manchmal
 *    unvollständig, ohne dass es jemand merkt.
 *
 * 4. EIN ABGERISSENER KANAL WIRD NEU AUFGEBAUT, NICHT GEMELDET. Das erledigt
 *    `kanalHalten` darüber, mitsamt der Begründung. `onError` ist hier
 *    seither NUR noch für ein gescheitertes LADEN da — dafür hat die Ansicht
 *    keine Daten, und das gehört dorthin, wo die Daten stehen sollten. Ein
 *    Verbindungsabriss dagegen lässt die Daten stehen; er ist ein Vorbehalt
 *    und steht in `liveVerbindung`.
 *
 * Gefiltert wird im Kanal nur nach dem Betrieb. Alles Weitere (Zeitraum,
 * Person) prüft der Client an der eingehenden Zeile: Supabase kann nur EINEN
 * Filter je Kanal, und ein zweiter Kanal je Bedingung wäre teurer als die
 * paar Meldungen, die hier zu viel ankommen.
 */
export function abonnieren<T>(
  tabelle: string,
  companyId: string,
  cb: (zeilen: WithId<T>[]) => void,
  onError: (e: Error) => void,
  abfrage: Abfrage = {},
  client?: SupabaseClient,
): () => void {
  const c = derClient(client);
  const bestand = new Map<string, WithId<T>>();
  let bereit = false;
  let nachfassen: ReturnType<typeof setTimeout> | undefined;
  const puffer: Array<{ typ: string; neu?: Record<string, unknown>; alt?: Record<string, unknown> }> = [];

  const passt = (z: WithId<T>): boolean => {
    const w = z as unknown as Record<string, unknown>;
    for (const bed of abfrage.wo ?? []) {
      const wert = w[bed.feld];
      if (bed.art === 'leer') {
        if (wert !== null && wert !== undefined) return false;
        continue;
      }
      if (bed.art === 'gleich' && wert !== bed.wert) return false;
      if (bed.art === 'ungleich' && wert === bed.wert) return false;
      if (bed.art === 'in' && !bed.werte.includes(wert)) return false;
      if (bed.art === 'ab' && (wert as never) < (bed.wert as never)) return false;
      if (bed.art === 'bis' && (wert as never) > (bed.wert as never)) return false;
      if (bed.art === 'enthaelt' && !(Array.isArray(wert) && wert.includes(bed.wert))) return false;
    }
    return true;
  };

  const melden = () => {
    let zeilen = [...bestand.values()];
    if (abfrage.sortiere) {
      const f = abfrage.sortiere.feld;
      const richtung = abfrage.sortiere.absteigend ? -1 : 1;
      zeilen = zeilen.sort((x, y) => {
        const a = (x as unknown as Record<string, never>)[f];
        const b = (y as unknown as Record<string, never>)[f];
        return a === b ? 0 : (a < b ? -1 : 1) * richtung;
      });
    }
    if (abfrage.grenze !== undefined) zeilen = zeilen.slice(0, abfrage.grenze);
    cb(zeilen);
  };

  const anwendenAenderung = (n: { typ: string; neu?: Record<string, unknown>; alt?: Record<string, unknown> }) => {
    if (n.typ === 'DELETE') {
      const id = String((n.alt ?? {}).id ?? '');
      if (id) bestand.delete(id);
      return;
    }
    const zeile = zeileAlsObjekt<WithId<T>>(tabelle, n.neu ?? {});
    const id = String((zeile as unknown as { id: string }).id ?? '');
    if (!id) return;
    if (passt(zeile)) bestand.set(id, zeile);
    else bestand.delete(id);
  };

  /**
   * Holt den Bestand und gleicht ab, was währenddessen hereinkam.
   *
   * Ersetzt den Bestand vollständig, statt nur hinzuzufügen: eine Zeile, die
   * inzwischen gelöscht wurde oder nicht mehr zur Abfrage passt, muss auch
   * verschwinden. Ein reines Zusammenlegen liesse sie stehen.
   */
  const laden = async (): Promise<void> => {
    bereit = false;
    try {
      const zeilen = await abfragen<T>(tabelle, companyId, abfrage, c);
      bestand.clear();
      for (const z of zeilen) bestand.set((z as unknown as { id: string }).id, z);
      for (const n of puffer) anwendenAenderung(n);
      puffer.length = 0;
      bereit = true;
      melden();
    } catch (e) {
      bereit = true;
      onError(e as Error);
    }
  };

  const stoppKanal = kanalHalten({
    tabelle,
    filter: `company_id=eq.${companyId}`,
    beiAenderung: (n) => {
      const aenderung = {
        typ: n.eventType as string,
        neu: n.new as Record<string, unknown>,
        alt: n.old as Record<string, unknown>,
      };
      if (!bereit) { puffer.push(aenderung); return; }
      anwendenAenderung(aenderung);
      melden();
    },
    beiBereit: () => {
      void laden().then(() => {
        // Das Nachfassen. Siehe Punkt 4 im Kopf dieser Funktion.
        nachfassen = setTimeout(() => { void laden(); }, NACHFASSEN_MS);
      });
    },
    client: c,
  });

  return () => {
    if (nachfassen) clearTimeout(nachfassen);
    stoppKanal();
  };
}
