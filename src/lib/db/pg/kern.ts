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
import { zeileAlsObjekt, objektAlsZeile } from './felder';

export type WithId<T> = T & { id: string };

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
  | { art: 'enthaelt'; feld: string; wert: unknown };

export interface Abfrage {
  wo?: readonly Bedingung[];
  sortiere?: { feld: string; absteigend?: boolean };
  grenze?: number;
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
  gte(spalte: string, wert: unknown): Filterbar;
  lte(spalte: string, wert: unknown): Filterbar;
  order(spalte: string, wie: { ascending: boolean }): Filterbar;
  limit(anzahl: number): Filterbar;
}

function anwenden(bauer: Filterbar, abfrage: Abfrage): Filterbar {
  let b = bauer;
  for (const bed of abfrage.wo ?? []) {
    const spalte = alsSpalteSicher(bed.feld);
    if (bed.art === 'gleich') b = b.eq(spalte, bed.wert);
    else if (bed.art === 'ungleich') b = b.neq(spalte, bed.wert);
    else if (bed.art === 'in') b = b.in(spalte, bed.werte as unknown[]);
    else if (bed.art === 'ab') b = b.gte(spalte, bed.wert);
    else if (bed.art === 'bis') b = b.lte(spalte, bed.wert);
    else b = b.contains(spalte, [bed.wert]);
  }
  if (abfrage.sortiere) {
    b = b.order(alsSpalteSicher(abfrage.sortiere.feld), {
      ascending: !abfrage.sortiere.absteigend,
    });
  }
  if (abfrage.grenze !== undefined) b = b.limit(abfrage.grenze);
  return b;
}

/** Feldnamen kommen aus dem Quelltext, nie aus Eingaben — trotzdem geprüft. */
function alsSpalteSicher(feld: string): string {
  const spalte = feld.replace(/[A-Z]/g, (z) => `_${z.toLowerCase()}`);
  if (!/^[a-z][a-z0-9_]*$/.test(spalte)) {
    throw new Error(`Unbrauchbarer Feldname: ${feld}`);
  }
  return spalte;
}

/** Abfrage innerhalb eines Mandanten. */
export async function abfragen<T>(
  tabelle: string,
  companyId: string,
  abfrage: Abfrage = {},
  client?: SupabaseClient,
): Promise<WithId<T>[]> {
  const c = derClient(client);
  const bauer = anwenden(
    c.from(tabelle).select('*').eq('company_id', companyId) as unknown as Filterbar,
    abfrage,
  );
  const { data, error } = await (bauer as unknown as PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => zeileAlsObjekt<WithId<T>>(tabelle, z));
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
 * Live-Abonnement innerhalb eines Mandanten.
 *
 * DREI ENTSCHEIDUNGEN, JEDE AUS EINEM FEHLSCHLAG GELERNT.
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

  const kanal = c
    .channel(`${tabelle}-${companyId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tabelle, filter: `company_id=eq.${companyId}` },
      (n) => {
        const aenderung = {
          typ: n.eventType,
          neu: n.new as Record<string, unknown>,
          alt: n.old as Record<string, unknown>,
        };
        if (!bereit) { puffer.push(aenderung); return; }
        anwendenAenderung(aenderung);
        melden();
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(new Error(`Live-Abonnement für ${tabelle}: ${status}`));
        return;
      }
      if (status !== 'SUBSCRIBED') return;

      void laden().then(() => {
        // Das Nachfassen. Siehe Punkt 3 im Kopf dieser Funktion.
        nachfassen = setTimeout(() => { void laden(); }, NACHFASSEN_MS);
      });
    });

  return () => {
    if (nachfassen) clearTimeout(nachfassen);
    void c.removeChannel(kanal);
  };
}
