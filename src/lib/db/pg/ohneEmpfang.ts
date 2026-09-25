/**
 * Die Brücke zwischen der Datenschicht und dem Ausgangsfach.
 *
 * WAS HIER FEHLTE — und es ist die Bedingung, unter der dieser ganze Umzug
 * beschlossen wurde: „der Schreibweg ohne Empfang wird zuerst gebaut und
 * bewiesen." Gebaut wurde er (`lib/sync/ausgangsfach.ts`), bewiesen auch
 * (`tests/supabase/durchstich0.test.ts`, gegen die echte Datenbank). Nur
 * ANGESCHLOSSEN war er an keiner einzigen Stelle.
 *
 * Solange das so war, sagte die App dem Monteur im Keller:
 *
 *   „Änderung übernommen — ohne Verbindung gespeichert, wird automatisch
 *    gesendet."
 *
 * Unter Firestore stimmte dieser Satz: das SDK legte den Vorgang lokal ab und
 * sendete ihn nach. Unter Postgres stimmte davon nichts. Der Aufruf scheiterte,
 * die Buchung war weg, und auf dem Bildschirm stand eine Zusage, die niemand
 * hielt. Eine falsche Bestätigung ist schlimmer als eine ehrliche
 * Fehlermeldung — und eine verlorene Arbeitsstunde merkt man erst am
 * Monatsende, wenn niemand mehr weiss, welcher Tag es war.
 *
 * WARUM NUR ANLEGEN UND ÄNDERN, und nicht jeder Schreibvorgang: nachsenden
 * lässt sich nur, was ohne den Server entschieden werden kann. Eine
 * Datenbankfunktion, die Lagerstände verrechnet, eine Rechnungsnummer zieht
 * oder eine Transaktion über mehrere Tabellen führt, kann das nicht — sie
 * braucht den Stand von jetzt. Das ist keine Einschränkung dieser Datei,
 * sondern die Natur der Sache, und sie steht hier, damit niemand später die
 * Liste stillschweigend erweitert.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  schreiben, gehoert, type Auftrag, type Bericht, type Lager, type WriteOutcome,
} from '@/lib/sync/ausgangsfach';
import { lagerImBrowser, lagerVerfuegbar } from '@/lib/sync/lagerIndexedDB';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import { nachsenden } from '@/lib/sync/ausgangsfach';
import { derClient } from './kern';
import { objektAlsZeile } from './felder';

/**
 * Das Lager wird EINMAL geöffnet und gemerkt.
 *
 * Zwei Verbindungen auf dieselbe IndexedDB-Datenbank sind nicht falsch, aber
 * jede kostet beim Öffnen — und der erste Schreibvorgang nach dem Start ist
 * genau der, bei dem der Monteur schon wartet.
 */
let gemerktesLager: Lager | null = null;

function lager(): Lager | null {
  // Ein eingereichtes Lager gilt, ohne nachzufragen: in der Prüfung gibt es
  // kein IndexedDB, und `lagerVerfuegbar()` würde es vor der Benutzung wieder
  // wegwerfen.
  if (gemerktesLager) return gemerktesLager;
  if (!lagerVerfuegbar()) return null;
  gemerktesLager = lagerImBrowser();
  return gemerktesLager;
}

/** Nur für Prüfungen: ein eigenes Lager unterschieben. */
export function lagerEinreichen(eigenes: Lager | null): void {
  gemerktesLager = eigenes;
}

/*
  WER GERADE ANGEMELDET IST (Prüflauf 25.09.2026, P1-05) — gesetzt von der
  Anmeldung, sobald sie ein Konto kennt.

  Nicht allein aus der Sitzung des Clients gelesen: die Zugangsmarke läuft
  nach einer Stunde ab, und ohne Netz lässt sie sich nicht erneuern — dann
  meldet `getSession` keine Sitzung, obwohl der Monteur ganz normal
  angemeldet ist und im Keller weiterbucht. Genau diese Vormerkungen
  bekämen sonst keinen Besitzer.
*/
let angemeldetesKonto: string | null = null;

export function ausgangsfachKonto(uid: string | null): void {
  angemeldetesKonto = uid;
}

/** Das Konto der Sitzung, mit der der Client gerade senden würde — oder null. */
async function sitzungsKonto(c: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await c.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Wem eine neue Vormerkung gehört. */
async function besitzer(c: SupabaseClient): Promise<string | undefined> {
  return angemeldetesKonto ?? (await sitzungsKonto(c)) ?? undefined;
}

/**
 * Ohne IndexedDB gibt es kein Vormerken — und dann auch kein Versprechen.
 *
 * Privates Fenster, gesperrter Speicher, ein sehr alter Browser: dann wird
 * geschrieben wie bisher, und ein Fehlschlag ist ein Fehlschlag. Das ist die
 * ehrliche Fassung; „wird nachgesendet" zu melden, wo nichts gelagert werden
 * kann, wäre dieselbe Lüge in neuen Kleidern.
 */
function ohneLager<T>(tun: () => Promise<T>): Promise<T> {
  return tun();
}

/**
 * Anlegen mit einer Kennung VOM GERÄT — bestätigt oder vorgemerkt.
 *
 * Die Kennung steht fest, bevor der Server sie bestätigt hat. Nur deshalb
 * darf derselbe Vorgang zweimal ankommen, ohne zweimal zu landen: der Sender
 * schreibt mit `upsert` auf ebendiese Kennung.
 */
export async function anlegenOhneEmpfang(
  tabelle: string,
  companyId: string,
  daten: Record<string, unknown>,
  client?: SupabaseClient,
): Promise<{ id: string; stand: WriteOutcome }> {
  const id = crypto.randomUUID();
  const zeile = { ...objektAlsZeile(tabelle, daten), company_id: companyId };
  const fach = lager();

  if (!fach) {
    await ohneLager(async () => {
      const c = derClient(client);
      const { error } = await c.from(tabelle).upsert({ ...zeile, id }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    });
    return { id, stand: 'confirmed' };
  }

  const c = derClient(client);
  const auftrag: Auftrag = { tabelle, art: 'anlegen', zeile: id, daten: zeile, uid: await besitzer(c) };
  const stand = await schreiben(auftrag, fach, supabaseSender(c));
  return { id, stand };
}

/** Ändern — bestätigt oder vorgemerkt. */
export async function aendernOhneEmpfang(
  tabelle: string,
  id: string,
  daten: Record<string, unknown>,
  client?: SupabaseClient,
): Promise<WriteOutcome> {
  const zeile = objektAlsZeile(tabelle, daten);
  const fach = lager();

  if (!fach) {
    await ohneLager(async () => {
      const c = derClient(client);
      const { error } = await c.from(tabelle).update(zeile).eq('id', id);
      if (error) throw new Error(error.message);
    });
    return 'confirmed';
  }

  const c = derClient(client);
  const auftrag: Auftrag = { tabelle, art: 'aendern', zeile: id, daten: zeile, uid: await besitzer(c) };
  return schreiben(auftrag, fach, supabaseSender(c));
}

/** Der gerade laufende Nachsendelauf, falls einer läuft. */
let laufend: Promise<Bericht> | null = null;

/**
 * Was noch im Fach liegt, jetzt nachsenden.
 *
 * Gibt zurück, wie viele Vorgänge durchgingen — der Aufrufer entscheidet, ob
 * er das zeigt. Ohne Lager gibt es nichts nachzusenden, und das ist kein
 * Fehler.
 */
export async function nachsendenJetzt(client?: SupabaseClient): Promise<Bericht> {
  /*
    EIN LAUF ZUR ZEIT. Zeitgeber, `online` und die Rückkehr zur App können
    zusammenfallen; zwei Läufe über dasselbe Fach schickten dieselbe
    Vormerkung doppelt und räumten sie doppelt weg.
  */
  if (laufend) return laufend;
  laufend = (async () => {
    const fach = lager();
    if (!fach) return { gesendet: 0, abgelehnt: 0, offen: 0 };
    const c = derClient(client);
    /*
      NUR MIT EINER GÜLTIGEN SITZUNG, und nur deren eigene Vormerkungen
      (Prüflauf 25.09.2026, P1-05). Ohne Sitzung ging der Aufruf als „anon"
      hinaus, mit der eines Kollegen unter dessen Namen — beide lehnt der
      Zeilenschutz ab, und das Fach warf die Buchung als endgültig verloren
      weg. Jetzt bleibt sie liegen, bis ihr Besitzer wieder angemeldet ist.
    */
    return nachsenden(fach, supabaseSender(c), await sitzungsKonto(c));
  })();
  try {
    return await laufend;
  } finally {
    laufend = null;
  }
}

/**
 * Wie viele Vorgänge warten? Für die Anzeige, nicht für Entscheidungen.
 *
 * Mit einem Konto: nur die, die mit dessen Sitzung hinausgehen — seine
 * eigenen und die ohne Besitzer. Für die Warnung beim Abmelden.
 */
export async function offeneVormerkungen(uid?: string): Promise<number> {
  const fach = lager();
  if (!fach) return 0;
  const alle = await fach.alle();
  return uid ? alle.filter((v) => gehoert(v, uid)).length : alle.length;
}
