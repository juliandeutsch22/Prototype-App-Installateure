/**
 * Persönliche Einstellungen — auf Postgres.
 *
 * Getrennt von der Belegschaft, weil dort nur die Geschäftsführung schreiben
 * darf. Was jemand an Meldungen bekommen will und auf welchen Geräten,
 * entscheidet er selbst — der Zeilenschutz lässt deshalb genau die eigene
 * Zeile zu, und zwar auch beim LESEN: die Push-Marken eines fremden Geräts
 * gehen auch einen Vorgesetzten nichts an.
 *
 * DIE ZEILE IST NACH DER PERSON GESCHLÜSSELT, nicht über eine eigene Kennung.
 * `user_prefs.user_id` ist der Primärschlüssel; die App kennt das Feld `id`
 * und meint dasselbe. Gespiegelt wird es beim Lesen.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPrefs } from '@/types';
import { derClient, kanalHalten, NACHFASSEN_MS } from './kern';
import type { NotifyPrefs } from '../meldungsvorgaben';
import { zeileAlsObjekt } from './felder';

const EINSTELLUNGEN = 'user_prefs';

function alsEinstellungen(zeile: Record<string, unknown>): UserPrefs {
  const p = zeileAlsObjekt<UserPrefs>(EINSTELLUNGEN, zeile);
  return { ...p, id: p.userId };
}

export async function getPrefs(uid: string): Promise<UserPrefs | null> {
  const { data, error } = await derClient()
    .from(EINSTELLUNGEN).select('*').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? alsEinstellungen(data as Record<string, unknown>) : null;
}

/**
 * Die eigenen Einstellungen, live.
 *
 * Beobachtet wird nur die eigene Zeile; der Kanal filtert auf sie, und der
 * Zeilenschutz bestätigt es. Nach dem Anmelden wird einmal nachgefasst —
 * `SUBSCRIBED` sagt, dass der Kanal steht, nicht dass die Datenbank schon
 * meldet.
 *
 * Gibt es die Zeile noch nicht, meldet der erste Aufruf `null`. Das ist der
 * Normalfall für jemanden, der noch nie etwas eingestellt hat, und die
 * Ansicht setzt dann die Vorgaben ein.
 */
export function subscribePrefs(
  uid: string,
  cb: (p: UserPrefs | null) => void,
  onError?: (e: Error) => void,
  client?: SupabaseClient,
): () => void {
  const c = derClient(client);
  let gestoppt = false;
  let nachfassen: ReturnType<typeof setTimeout> | undefined;

  const holen = () => {
    void getPrefs(uid)
      .then((p) => { if (!gestoppt) cb(p); })
      .catch((e: unknown) => { if (!gestoppt) onError?.(e as Error); });
  };

  /*
    DER KANAL BAUT SICH SELBST WIEDER AUF. Hier stand vorher ein sofortiges
    `onError` bei `CHANNEL_ERROR` — und damit meldete ein blosser
    Tab-Wechsel einen Fehler, den niemand beheben kann und der von selbst
    vorbei ist. `kanalHalten` versucht es erst mehrfach und meldet den
    Vorbehalt dann dorthin, wo er auch wieder zurückgenommen wird.
  */
  const stoppKanal = kanalHalten({
    tabelle: EINSTELLUNGEN,
    filter: `user_id=eq.${uid}`,
    beiAenderung: () => holen(),
    beiBereit: () => {
      holen();
      nachfassen = setTimeout(holen, NACHFASSEN_MS);
    },
    client: c,
  });

  return () => {
    gestoppt = true;
    if (nachfassen) clearTimeout(nachfassen);
    stoppKanal();
  };
}

/**
 * Schreibt die Auswahl.
 *
 * Die Gerätemarken bleiben unangetastet: `upsert` schreibt nur die genannten
 * Spalten, und `push_tokens` steht nicht dabei. Wer seine Meldungen umstellt,
 * meldet damit kein Gerät ab.
 */
export async function savePrefs(
  companyId: string,
  uid: string,
  prefs: NotifyPrefs,
): Promise<void> {
  const { error } = await derClient().from(EINSTELLUNGEN).upsert(
    {
      user_id: uid,
      company_id: companyId,
      notify_new_order: prefs.notifyNewOrder ?? false,
      notify_order_ready: prefs.notifyOrderReady ?? false,
      notify_urgent_delivery: prefs.notifyUrgentDelivery ?? false,
      // Fehlt die Angabe, bleibt sie an: abgeschaltet wird nur ausdrücklich.
      notify_abwesenheit: prefs.notifyAbwesenheit ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
}

/**
 * Gerät für Push registrieren — in EINER Anweisung.
 *
 * Nicht Lesen-Ändern-Schreiben: meldet sich jemand auf Telefon und Rechner
 * kurz nacheinander an, läsen zwei Aufrufe denselben Stand und schrieben ihre
 * jeweils eine Marke zurück. Die zuerst geschriebene wäre weg, und genau
 * dieses Gerät bekäme keine Meldungen mehr.
 */
export async function addPushToken(
  companyId: string,
  uid: string,
  token: string,
): Promise<void> {
  void companyId;
  void uid;
  const { error } = await derClient().rpc('push_marke_setzen', { p_token: token, p_an: true });
  if (error) throw new Error(error.message);
}

/** Gerät abmelden — beim Abschalten der Benachrichtigungen oder beim Logout. */
export async function removePushToken(uid: string, token: string): Promise<void> {
  void uid;
  const { error } = await derClient().rpc('push_marke_setzen', { p_token: token, p_an: false });
  if (error) throw new Error(error.message);
}
