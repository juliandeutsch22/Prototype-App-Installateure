/**
 * Nachrichten (M10/B09, E64) — auf Postgres.
 *
 * LESEN NUR ÜBER DIE FUNKTIONEN. Kanäle, Nachrichten, Anhänge und Meldungen
 * hat kein Konto direkt in der Hand; jede Funktion prüft die Teilnahme
 * selbst (`20261108400000_nachrichten.sql`). Hier steht nur, wie die App sie
 * aufruft — und wie eine Nachricht mit Bildern auch im Funkloch hinausgeht.
 *
 * SENDEN OHNE EMPFANG (E49-Muster): die Kennung entsteht auf dem Gerät.
 * Erst gehen die Dateien in den Speicher (unter dem Pfad dieser Nachricht),
 * dann der Aufruf `nachricht_senden`. Beides läuft über das Ausgangsfach:
 * ohne Netz wird vorgemerkt und mit Netz in dieser Reihenfolge gesendet;
 * kommt dieselbe Nachricht zweimal an, erkennt die Datenbank sie wieder.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { derClient, kanalHalten } from './kern';
import { vorgangOhneEmpfang, wartendeVorgaenge } from './ohneEmpfang';
import type { Vormerkung, WriteOutcome } from '@/lib/sync/ausgangsfach';

/** Unter diesem Namen liegen die Vorgänge einer Nachricht im Ausgangsfach — Hochladen und Senden, je Nachricht eine Gruppe. */
export const NACHRICHT_TABELLE = 'nachrichten';

export type KanalArt = 'baustelle' | 'direkt' | 'runde';
export type PostfachAuswahl = 'alle' | 'privat' | 'baustelle' | 'ungelesen';

export interface PostfachZeile {
  kanal: string;
  art: KanalArt;
  titel: string;
  projectId: string | null;
  zuletzt: string;
  letzteText: string | null;
  letzteVon: string | null;
  letzteEigene: boolean;
  ungelesen: number;
  stumm: boolean;
  /** Direktgespräch mit einem deaktivierten Konto: lesbar, aber geschlossen. */
  geschlossen: boolean;
}

export interface PostfachZeiger { zuletzt: string; kanal: string }

export interface Teilnehmer { uid: string; name: string; aktiv: boolean; ich: boolean }

export interface KanalKopf {
  kanal: string;
  art: KanalArt;
  titel: string;
  name: string | null;
  projectId: string | null;
  /** Nur bei privaten Gesprächen — der Thread einer Baustelle gehört allen, die sie sehen. */
  teilnehmer: Teilnehmer[] | null;
  folgt: boolean;
  stumm: boolean;
  ungelesen: number;
  /** Warum hier nicht geschrieben werden kann — oder `null`. */
  sperre: string | null;
}

export interface Anhang {
  id: string;
  eimer: string;
  pfad: string;
  name: string;
  bytes: number;
  inhaltsart: string;
}

export interface Nachricht {
  id: string;
  vonUid: string | null;
  vonName: string;
  eigene: boolean;
  text: string | null;
  gesendetAm: string;
  bearbeitetAm: string | null;
  geloeschtAm: string | null;
  erwaehnt: { uid: string; name: string }[];
  anhaenge: Anhang[];
  uebernommen: boolean;
  gemeldet: boolean;
}

export interface VerlaufZeiger { gesendetAm: string; id: string }

export interface Meldung {
  id: string;
  kanalArt: KanalArt;
  gemeldetVonName: string;
  gemeldetAm: string;
  grund: string | null;
  vonName: string;
  gesendetAm: string;
  textKopie: string | null;
  anhaenge: { eimer: string; pfad: string; name: string; bytes: number; inhaltsart: string }[];
  status: 'offen' | 'erledigt';
  erledigtVonName: string | null;
  erledigtAm: string | null;
  vermerk: string | null;
}

/** Eine Datei, die mit einer Nachricht hinausgeht — vor dem Senden auf dem Gerät. */
export interface NeueDatei { id: string; name: string; inhalt: Blob }

export interface Senden {
  /** Die Kennung vom Gerät. */
  id: string;
  kanal: string;
  /** Ob das Gespräch privat ist — davon hängt der Eimer ab. */
  privat: boolean;
  companyId: string;
  text: string;
  dateien?: NeueDatei[];
  erwaehnt?: string[];
  /** Die eigene private Nachricht, die hiermit in die Baustelle übernommen wird. */
  aus?: string;
}

/** Wieviele Zeilen eine Seite des Posteingangs bzw. des Verlaufs hat. */
export const POSTFACH_SEITE = 30;
export const VERLAUF_SEITE = 50;

function fehler(e: { message: string; code?: string }): Error {
  return Object.assign(new Error(e.message), { code: e.code });
}

async function aufruf<T>(f: string, p: Record<string, unknown>, client?: SupabaseClient): Promise<T> {
  const { data, error } = await derClient(client).rpc(f, p);
  if (error) throw fehler(error);
  return data as T;
}

function alsPostfach(z: Record<string, unknown>): PostfachZeile {
  return {
    kanal: String(z.kanal),
    art: z.art as KanalArt,
    titel: String(z.titel ?? ''),
    projectId: (z.project_id as string | null) ?? null,
    zuletzt: String(z.zuletzt),
    letzteText: (z.letzte_text as string | null) ?? null,
    letzteVon: (z.letzte_von as string | null) ?? null,
    letzteEigene: z.letzte_eigene === true,
    ungelesen: Number(z.ungelesen ?? 0),
    stumm: z.stumm === true,
    geschlossen: z.geschlossen === true,
  };
}

/** Der Posteingang, jüngstes Gespräch zuerst — seitenweise. */
export async function postfach(
  auswahl: PostfachAuswahl,
  suche: string,
  nach?: PostfachZeiger | null,
  client?: SupabaseClient,
): Promise<{ zeilen: PostfachZeile[]; weiter: PostfachZeiger | null }> {
  const roh = await aufruf<Record<string, unknown>[]>('nachrichten_postfach', {
    p_art: auswahl === 'alle' ? null : auswahl,
    p_suche: suche.trim() || null,
    p_vor: nach?.zuletzt ?? null,
    p_vor_id: nach?.kanal ?? null,
    p_anzahl: POSTFACH_SEITE + 1,
  }, client);
  const zeilen = (roh ?? []).map(alsPostfach);
  const mehr = zeilen.length > POSTFACH_SEITE;
  const seite = mehr ? zeilen.slice(0, POSTFACH_SEITE) : zeilen;
  const letzte = seite[seite.length - 1];
  return { zeilen: seite, weiter: mehr && letzte ? { zuletzt: letzte.zuletzt, kanal: letzte.kanal } : null };
}

export async function kanalKopf(kanal: string, client?: SupabaseClient): Promise<KanalKopf> {
  const k = await aufruf<Record<string, unknown>>('nachrichten_kanal', { p_kanal: kanal }, client);
  return {
    kanal: String(k.kanal),
    art: k.art as KanalArt,
    titel: String(k.titel ?? ''),
    name: (k.name as string | null) ?? null,
    projectId: (k.project_id as string | null) ?? null,
    teilnehmer: (k.teilnehmer as Teilnehmer[] | null) ?? null,
    folgt: k.folgt === true,
    stumm: k.stumm === true,
    ungelesen: Number(k.ungelesen ?? 0),
    sperre: (k.sperre as string | null) ?? null,
  };
}

function alsNachricht(z: Record<string, unknown>): Nachricht {
  return {
    id: String(z.id),
    vonUid: (z.von_uid as string | null) ?? null,
    vonName: String(z.von_name ?? ''),
    eigene: z.eigene === true,
    text: (z.text as string | null) ?? null,
    gesendetAm: String(z.gesendet_am),
    bearbeitetAm: (z.bearbeitet_am as string | null) ?? null,
    geloeschtAm: (z.geloescht_am as string | null) ?? null,
    erwaehnt: (z.erwaehnt as { uid: string; name: string }[] | null) ?? [],
    anhaenge: ((z.anhaenge as Record<string, unknown>[] | null) ?? []).map((a) => ({
      id: String(a.id), eimer: String(a.eimer), pfad: String(a.pfad), name: String(a.name),
      bytes: Number(a.bytes ?? 0), inhaltsart: String(a.inhaltsart ?? ''),
    })),
    uebernommen: z.uebernommen === true,
    gemeldet: z.gemeldet === true,
  };
}

/** Der Verlauf, jüngste zuerst — „Ältere laden“ holt die nächste Seite rückwärts. */
export async function verlauf(
  kanal: string,
  vor?: VerlaufZeiger | null,
  client?: SupabaseClient,
): Promise<{ nachrichten: Nachricht[]; weiter: VerlaufZeiger | null }> {
  const roh = await aufruf<Record<string, unknown>[]>('nachrichten_verlauf', {
    p_kanal: kanal,
    p_vor: vor?.gesendetAm ?? null,
    p_vor_id: vor?.id ?? null,
    p_anzahl: VERLAUF_SEITE + 1,
  }, client);
  const alle = (roh ?? []).map(alsNachricht);
  const mehr = alle.length > VERLAUF_SEITE;
  const seite = mehr ? alle.slice(0, VERLAUF_SEITE) : alle;
  const aelteste = seite[seite.length - 1];
  return { nachrichten: seite, weiter: mehr && aelteste ? { gesendetAm: aelteste.gesendetAm, id: aelteste.id } : null };
}

export const kanalDirekt = (mit: string, client?: SupabaseClient) =>
  aufruf<string>('nachrichten_kanal_direkt', { p_mit: mit }, client);
export const kanalRunde = (name: string, personen: string[], client?: SupabaseClient) =>
  aufruf<string>('nachrichten_kanal_runde', { p_name: name.trim() || null, p_teilnehmer: personen }, client);
export const kanalBaustelle = (projekt: string, client?: SupabaseClient) =>
  aufruf<string>('nachrichten_kanal_baustelle', { p_projekt: projekt }, client);

export async function baustelleStand(projekt: string, client?: SupabaseClient): Promise<{
  kanal: string | null; anzahl: number; zuletzt: string | null; ungelesen: number; folgt: boolean;
}> {
  const s = await aufruf<Record<string, unknown>>('nachrichten_baustelle_stand', { p_projekt: projekt }, client);
  return {
    kanal: (s.kanal as string | null) ?? null,
    anzahl: Number(s.anzahl ?? 0),
    zuletzt: (s.zuletzt as string | null) ?? null,
    ungelesen: Number(s.ungelesen ?? 0),
    folgt: s.folgt === true,
  };
}

/** Der Eimer eines Gesprächs: private Anhänge gehen nie in die Sicherung außer Haus. */
export function eimerFuer(privat: boolean): string {
  return privat ? 'nachrichten-privat' : 'nachrichten';
}

export function dateiPfad(companyId: string, kanal: string, nachricht: string, anhang: string): string {
  return `nachrichten/${companyId}/${kanal}/${nachricht}/${anhang}`;
}

/** Die Parameter von `nachricht_senden` — dieselben im Fach wie direkt. */
function sendeParameter(s: Senden): Record<string, unknown> {
  return {
    p_id: s.id,
    p_kanal: s.kanal,
    p_text: s.text,
    p_anhaenge: (s.dateien ?? []).map((d) => ({ id: d.id, name: d.name })),
    p_erwaehnt: s.erwaehnt ?? [],
    p_geraet_zeit: new Date().toISOString(),
    p_aus: s.aus ?? null,
  };
}

/**
 * Eine Nachricht senden — bestätigt oder vorgemerkt.
 *
 * Wirft nur, wenn sie WIRKLICH nicht angekommen ist (abgelehnt, oder ohne
 * Ausgangsfach ohne Netz). Die Bytes liegen im Fach als ArrayBuffer — ein
 * Blob ginge in Safari nicht hinein (E49).
 */
export async function nachrichtSenden(s: Senden, client?: SupabaseClient): Promise<WriteOutcome> {
  let stand: WriteOutcome = 'confirmed';
  for (const d of s.dateien ?? []) {
    const r = await vorgangOhneEmpfang({
      tabelle: NACHRICHT_TABELLE,
      art: 'hochladen',
      zeile: s.id,
      daten: {
        eimer: eimerFuer(s.privat),
        pfad: dateiPfad(s.companyId, s.kanal, s.id, d.id),
        inhalt: await d.inhalt.arrayBuffer(),
        inhaltsart: d.inhalt.type || 'application/octet-stream',
        kanal: s.kanal,
        name: d.name,
      },
    }, client);
    if (r === 'queued') stand = 'queued';
  }
  const r = await vorgangOhneEmpfang({
    tabelle: NACHRICHT_TABELLE,
    art: 'aufruf',
    zeile: s.id,
    daten: { funktion: 'nachricht_senden', parameter: sendeParameter(s) },
  }, client);
  return r === 'queued' || stand === 'queued' ? 'queued' : 'confirmed';
}

/** Eine Nachricht, die auf diesem Gerät noch wartet — für die Anzeige im Gespräch. */
export interface VorgemerkteNachricht {
  id: string;
  kanal: string;
  text: string;
  dateien: { id: string; name: string; inhalt: Blob }[];
  seit: number;
}

/** Was im Ausgangsfach für dieses Gespräch wartet, in der Reihenfolge, in der es geschrieben wurde. */
export function vorgemerkteNachrichten(vormerkungen: readonly Vormerkung[], kanal: string): VorgemerkteNachricht[] {
  const dateien = new Map<string, { id: string; name: string; inhalt: Blob }[]>();
  const raus: VorgemerkteNachricht[] = [];
  for (const v of [...vormerkungen].sort((a, b) => a.folge - b.folge)) {
    if (v.tabelle !== NACHRICHT_TABELLE) continue;
    if (v.art === 'hochladen') {
      const d = v.daten as { pfad?: string; inhalt?: ArrayBuffer; inhaltsart?: string; kanal?: string; name?: string };
      if (d.kanal !== kanal || !d.inhalt || !d.pfad) continue;
      const id = d.pfad.split('/').pop() ?? '';
      dateien.set(v.zeile, [...(dateien.get(v.zeile) ?? []), { id, name: d.name ?? 'Anhang', inhalt: new Blob([d.inhalt], { type: d.inhaltsart }) }]);
      continue;
    }
    if (v.art !== 'aufruf') continue;
    const { funktion, parameter } = v.daten as { funktion?: string; parameter?: Record<string, unknown> };
    if (funktion !== 'nachricht_senden' || parameter?.p_kanal !== kanal) continue;
    raus.push({ id: v.zeile, kanal, text: String(parameter.p_text ?? ''), dateien: [], seit: v.angelegt });
  }
  for (const n of raus) n.dateien = dateien.get(n.id) ?? [];
  return raus;
}

export async function wartendeNachrichten(kanal: string, client?: SupabaseClient): Promise<VorgemerkteNachricht[]> {
  return vorgemerkteNachrichten(await wartendeVorgaenge(client), kanal);
}

export const nachrichtBearbeiten = (id: string, text: string, client?: SupabaseClient) =>
  aufruf<void>('nachricht_bearbeiten', { p_id: id, p_text: text }, client);
export const nachrichtLoeschen = (id: string, client?: SupabaseClient) =>
  aufruf<void>('nachricht_loeschen', { p_id: id }, client);
export const gelesen = (kanal: string, client?: SupabaseClient) =>
  aufruf<void>('nachrichten_gelesen', { p_kanal: kanal }, client);
export const stummSchalten = (kanal: string, stumm: boolean, client?: SupabaseClient) =>
  aufruf<void>('nachrichten_stumm', { p_kanal: kanal, p_stumm: stumm }, client);
export const folgen = (kanal: string, an: boolean, client?: SupabaseClient) =>
  aufruf<void>('nachrichten_folgen', { p_kanal: kanal, p_folgen: an }, client);
export const rundeVerlassen = (kanal: string, client?: SupabaseClient) =>
  aufruf<void>('nachrichten_verlassen', { p_kanal: kanal }, client);
export const rundeHinzufuegen = (kanal: string, personen: string[], client?: SupabaseClient) =>
  aufruf<void>('nachrichten_hinzufuegen', { p_kanal: kanal, p_personen: personen }, client);
export const rundeBenennen = (kanal: string, name: string, client?: SupabaseClient) =>
  aufruf<void>('nachrichten_umbenennen', { p_kanal: kanal, p_name: name.trim() || null }, client);
export const nachrichtMelden = (id: string, grund: string, client?: SupabaseClient) =>
  aufruf<string>('nachricht_melden', { p_nachricht: id, p_grund: grund.trim() || null }, client);

function alsMeldung(z: Record<string, unknown>): Meldung {
  return {
    id: String(z.id),
    kanalArt: z.kanal_art as KanalArt,
    gemeldetVonName: String(z.gemeldet_von_name ?? ''),
    gemeldetAm: String(z.gemeldet_am),
    grund: (z.grund as string | null) ?? null,
    vonName: String(z.von_name ?? ''),
    gesendetAm: String(z.gesendet_am),
    textKopie: (z.text_kopie as string | null) ?? null,
    anhaenge: (z.anhaenge as Meldung['anhaenge'] | null) ?? [],
    status: z.status as Meldung['status'],
    erledigtVonName: (z.erledigt_von_name as string | null) ?? null,
    erledigtAm: (z.erledigt_am as string | null) ?? null,
    vermerk: (z.vermerk as string | null) ?? null,
  };
}

export async function meldungen(client?: SupabaseClient): Promise<Meldung[]> {
  return ((await aufruf<Record<string, unknown>[]>('nachricht_meldungen', { p_status: null }, client)) ?? []).map(alsMeldung);
}
export const meldungenOffen = (client?: SupabaseClient) =>
  aufruf<number>('nachricht_meldungen_offen', {}, client).then((n) => Number(n ?? 0));
export const meldungErledigen = (id: string, vermerk: string, client?: SupabaseClient) =>
  aufruf<void>('nachricht_meldung_erledigen', { p_meldung: id, p_vermerk: vermerk.trim() || null }, client);
export const meldungLoeschen = (id: string, client?: SupabaseClient) =>
  aufruf<void>('nachricht_meldung_loeschen', { p_meldung: id }, client);

export const selbstexport = (client?: SupabaseClient) =>
  aufruf<Record<string, unknown>>('nachrichten_selbstexport', {}, client);
export const aufbewahrungSetzen = (monate: 6 | 12 | 24 | null, client?: SupabaseClient) =>
  aufruf<void>('nachrichten_aufbewahrung_setzen', { p_monate: monate }, client);

/**
 * Die eigene Zahl ungelesener Nachrichten — vom Server, nicht aus den eigenen
 * Teilnahmen summiert: dort stünde auch der Thread einer Baustelle, die man
 * nicht mehr sieht, und die Zahl bliebe stehen, ohne dass der Posteingang
 * ihn zeigt (`nachrichten_ungelesen`). Die Kennung der Person bleibt für die
 * Aufrufer stehen; der Server zählt für die angemeldete.
 */
export async function ungeleseneZahl(_uid: string, client?: SupabaseClient): Promise<number> {
  return Number((await aufruf<number | string | null>('nachrichten_ungelesen', {}, client)) ?? 0);
}

/** Hat diese Person überhaupt Gespräche? Die eigene Teilnahme ist die eine direkt lesbare Zeile. */
export async function hatGespraeche(uid: string, client?: SupabaseClient): Promise<boolean> {
  const { count, error } = await derClient(client).from('nachrichten_teilnehmer')
    .select('kanal_id', { count: 'exact', head: true }).eq('user_id', uid);
  if (error) throw fehler(error);
  return (count ?? 0) > 0;
}

/**
 * Eine kurzlebige Adresse je Anhang — die Speicherregel gibt sie nur, wer
 * das Gespräch lesen darf (bzw. der Führung für eine gemeldete Datei).
 */
export async function anhangAdressen(
  anhaenge: { eimer: string; pfad: string }[],
  client?: SupabaseClient,
): Promise<Map<string, string>> {
  const c = derClient(client);
  const raus = new Map<string, string>();
  const jeEimer = new Map<string, string[]>();
  for (const a of anhaenge) jeEimer.set(a.eimer, [...(jeEimer.get(a.eimer) ?? []), a.pfad]);
  for (const [eimer, pfade] of jeEimer) {
    const { data, error } = await c.storage.from(eimer).createSignedUrls(pfade, 600);
    if (error) throw fehler(error);
    for (const d of data ?? []) if (d.signedUrl && d.path) raus.set(`${eimer}/${d.path}`, d.signedUrl);
  }
  return raus;
}

/**
 * „Es gibt Neues“ — live, ohne Inhalt. Gemeldet wird jede Änderung an den
 * EIGENEN Teilnahmen (der Zeilenschutz lässt keine fremde durch); die
 * Ansicht holt daraufhin selbst nach, was sie braucht. Nach jedem
 * (Wieder-)Aufbau des Kanals wird einmal gemeldet: was in der Lücke kam,
 * fehlt sonst.
 */
export function abonniereNachrichtenStand(
  uid: string,
  cb: (kanal: string | null) => void,
  client?: SupabaseClient,
): () => void {
  return kanalHalten({
    tabelle: 'nachrichten_teilnehmer',
    filter: `user_id=eq.${uid}`,
    beiAenderung: (n) => cb(String((n.new?.kanal_id ?? n.old?.kanal_id) ?? '') || null),
    beiBereit: () => cb(null),
    client: derClient(client),
  });
}
