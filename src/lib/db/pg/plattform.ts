/**
 * Einen Betrieb anlegen — über die Edge Function.
 *
 * SIE IST DIE EINE STELLE, DIE KEINE DATENBANKFUNKTION WERDEN KONNTE. Ein
 * Anmeldekonto entsteht im Anmeldedienst, nicht in einer Tabelle; Passwort,
 * Kennung und Rücksetzlink kommen von dort. Der Rest — Firma, erster
 * Administrator, Protokolleintrag — läuft in `public.betrieb_anlegen` und
 * damit in einer Transaktion.
 */
import { derClient } from './kern';
import type { NeuerBetrieb } from '@shared/plattform';

export interface BetriebAngelegt {
  companyId: string;
  ersterAdminUid: string;
  /**
   * Der Link, mit dem der erste Administrator sein Passwort setzt.
   *
   * Er kommt ZURÜCK, statt versendet zu werden: der Betrieb versendet seine
   * Post selbst, und eine Mailanbindung wäre ein weiterer Dienst mit einem
   * weiteren Auftragsverarbeitungsvertrag.
   */
  passwortLink: string;
  /**
   * Mit Benutzername (P1): das Startpasswort, einmal hier und nirgends
   * gespeichert. Beim ersten Anmelden verlangt die App ein eigenes.
   */
  startpasswort?: string | null;
  benutzername?: string;
  /** Was beim Anlegen nur halb klappte — etwa der Vermerk „Testbetrieb“ (Paket D). */
  hinweis?: string;
}

export async function betriebAnlegen(daten: NeuerBetrieb): Promise<BetriebAngelegt> {
  const { data, error } = await derClient().functions.invoke('betrieb-anlegen', {
    body: daten,
  });
  /*
    DIE MELDUNG DER FUNCTION DURCHREICHEN, nicht den nackten Status.

    `functions.invoke` wirft bei jedem Status ausserhalb 2xx und legt den
    Rumpf in `context`. Ohne dieses Auspacken stünde vor dem globalen
    Administrator „Edge Function returned a non-2xx status code" — statt
    „Die Kennung „perl" ist vergeben".
  */
  if (error) {
    const rumpf = await (error as { context?: Response }).context?.json?.()
      .catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  return data as BetriebAngelegt;
}

/** Ein Betrieb in der Liste der Plattform — ohne Inhalte (Testbericht 30.09.2026, M43). */
export interface PlattformBetrieb {
  kennung: string;
  name: string;
  angelegtAm: string;
  /** Aktive Konten mit Administration oder Geschäftsführung. */
  leitungskonten: number;
  /** Wie viele davon eine E-Mail haben — ohne sie gibt es kein „Passwort vergessen“. */
  leitungMitMail: number;
  /** Bis wann ein Notzugang offen ist — sonst `null`. */
  notzugangBis: string | null;
  /** Test- oder Vorführbetrieb: löschbar ohne Export und ohne Frist (Paket D). */
  testbetrieb: boolean;
  /** Seit wann deaktiviert — sonst `null`. */
  deaktiviertAm: string | null;
  deaktiviertGrund: string | null;
  /** Wann zuletzt die Übergabe (vollständiger Export) erstellt wurde. */
  exportAm: string | null;
  /** Ab wann die Löschung ausgeführt werden kann — sonst `null`. */
  loeschungGeplantFuer: string | null;
  /**
   * Warum sich der Betrieb nicht mehr nachträglich als Testbetrieb
   * kennzeichnen lässt (Runde 3, H1) — etwa „er hat Rechnungen“; `null`,
   * solange er keine echten Daten hat.
   */
  echteDaten: string | null;
}

export async function plattformBetriebe(): Promise<PlattformBetrieb[]> {
  const { data, error } = await derClient().rpc('plattform_betriebe');
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    kennung: string; name: string; angelegt_am: string; leitungskonten: number;
    leitung_mit_mail: number; notzugang_bis: string | null;
    testbetrieb?: boolean | null; deaktiviert_am?: string | null; deaktiviert_grund?: string | null;
    export_am?: string | null; loeschung_geplant_fuer?: string | null; echte_daten?: string | null;
  }[]).map((z) => ({
    kennung: z.kennung,
    name: z.name,
    angelegtAm: z.angelegt_am,
    leitungskonten: Number(z.leitungskonten),
    leitungMitMail: Number(z.leitung_mit_mail),
    notzugangBis: z.notzugang_bis,
    testbetrieb: z.testbetrieb === true,
    deaktiviertAm: z.deaktiviert_am ?? null,
    deaktiviertGrund: z.deaktiviert_grund ?? null,
    exportAm: z.export_am ?? null,
    loeschungGeplantFuer: z.loeschung_geplant_fuer ?? null,
    echteDaten: z.echte_daten ?? null,
  }));
}

/*
  BETRIEBE DEAKTIVIEREN UND LÖSCHEN (Nachtest 01.10.2026, Paket D). Jede
  Bedingung steht in der Datenbank; die Meldungen kommen von dort.
*/

async function rpcOhneErgebnis(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await derClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

/** Function aufrufen und bei Ablehnung ihren Grund zeigen, nicht „non-2xx“. */
async function functionAufrufen<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await derClient().functions.invoke(name, { body });
  if (error) {
    const rumpf = await (error as { context?: Response }).context?.json?.()
      .catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  return data as T;
}

export async function betriebDeaktivieren(kennung: string, grund: string): Promise<void> {
  await rpcOhneErgebnis('plattform_betrieb_deaktivieren', { p_kennung: kennung, p_grund: grund });
}

export async function betriebAktivieren(kennung: string, grund: string): Promise<void> {
  await rpcOhneErgebnis('plattform_betrieb_aktivieren', { p_kennung: kennung, p_grund: grund });
}

export async function testbetriebSetzen(kennung: string, testbetrieb: boolean, grund: string): Promise<void> {
  await rpcOhneErgebnis('plattform_testbetrieb', { p_kennung: kennung, p_testbetrieb: testbetrieb, p_grund: grund });
}

/** Plant die Löschung; zurück kommt, ab wann sie ausgeführt werden kann. */
export async function loeschungPlanen(kennung: string, grund: string, tage?: number): Promise<string> {
  return String(await rpcOhneErgebnis('plattform_loeschung_planen', {
    p_kennung: kennung, p_grund: grund, ...(tage == null ? {} : { p_tage: tage }),
  }));
}

export async function loeschungAbbrechen(kennung: string, grund: string): Promise<void> {
  await rpcOhneErgebnis('plattform_loeschung_abbrechen', { p_kennung: kennung, p_grund: grund });
}

export interface BetriebProtokollEintrag {
  kennung: string;
  aktion: 'deaktiviert' | 'aktiviert' | 'testbetrieb' | 'export' | 'loeschung_geplant' | 'loeschung_abgebrochen' | 'geloescht';
  grund: string | null;
  am: string;
  angaben: Record<string, unknown>;
}

export async function betriebProtokoll(kennung: string | null, grenze = 50): Promise<BetriebProtokollEintrag[]> {
  const daten = (await rpcOhneErgebnis('plattform_betrieb_protokoll', { p_kennung: kennung, p_grenze: grenze })) as {
    betrieb_kennung: string; aktion: BetriebProtokollEintrag['aktion']; grund: string | null; am: string;
    angaben: Record<string, unknown> | null;
  }[] | null;
  return (daten ?? []).map((z) => ({
    kennung: z.betrieb_kennung, aktion: z.aktion, grund: z.grund, am: z.am, angaben: z.angaben ?? {},
  }));
}

export interface GeloeschterBetrieb {
  kennung: string;
  name: string;
  geloeschtAm: string;
  testbetrieb: boolean;
}

export async function geloeschteBetriebe(): Promise<GeloeschterBetrieb[]> {
  const daten = (await rpcOhneErgebnis('plattform_geloeschte_betriebe', {})) as {
    kennung: string; name: string; geloescht_am: string; testbetrieb: boolean;
  }[] | null;
  return (daten ?? []).map((z) => ({
    kennung: z.kennung, name: z.name, geloeschtAm: z.geloescht_am, testbetrieb: z.testbetrieb === true,
  }));
}

export interface Uebergabe {
  zeilen: number;
  dateien: number;
  datenLink: string | null;
  dateienLink: string | null;
  gueltigBis: string;
}

/** Vollständiger Export für einen deaktivierten Betrieb, Links eine Woche gültig. */
export function betriebUebergabe(kennung: string, grund: string): Promise<Uebergabe> {
  return functionAufrufen<Uebergabe>('daten-ausleitung', { betrieb: kennung, grund });
}

export interface BetriebGeloescht {
  zeilen: number;
  dateien: number;
  konten: number;
  kontenOffen: string[];
}

export function betriebLoeschen(kennung: string, bestaetigung: string, grund: string): Promise<BetriebGeloescht> {
  return functionAufrufen<BetriebGeloescht>('betrieb-loeschen', { kennung, bestaetigung, grund });
}

/** Ein Leitungskonto mit Benutzername, solange ein Notzugang offen ist (P2). */
export interface Leitungskonto {
  uid: string;
  name: string;
  rolle: string;
  benutzername: string;
}

export async function leitungskontenImNotzugang(kennung: string): Promise<Leitungskonto[]> {
  const { data, error } = await derClient().rpc('plattform_leitungskonten', { p_company: kennung });
  if (error) throw new Error(error.message);
  return (data ?? []) as Leitungskonto[];
}

/**
 * Ein neues Startpasswort über den Notzugang (P2) — mit Grund und
 * Identitätsprüfung. Zurück kommt das Startpasswort, einmal.
 */
export async function notzugangPasswort(eingabe: {
  uid: string; grund: string; rueckruf: string; identitaetBestaetigt: boolean;
}): Promise<string> {
  const { data, error } = await derClient().functions.invoke('notzugang-passwort', { body: eingabe });
  if (error) {
    const rumpf = await (error as { context?: Response }).context?.json?.()
      .catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  return String((data as { startpasswort?: string })?.startpasswort ?? '');
}

/** Ein Leitungskonto mit eingerichtetem zweiten Faktor, solange ein Notzugang offen ist (Runde 3, H1). */
export interface LeitungMitZweitemFaktor {
  uid: string;
  name: string;
  rolle: string;
}

export async function leitungMitZweitemFaktor(kennung: string): Promise<LeitungMitZweitemFaktor[]> {
  const { data, error } = await derClient().rpc('plattform_leitung_mit_zweitem_faktor', { p_company: kennung });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeitungMitZweitemFaktor[];
}

/** Den zweiten Faktor über den Notzugang entfernen — mit Grund und Rückruf. */
export async function zweitenFaktorZuruecksetzen(eingabe: { uid: string; grund: string; rueckruf: string }): Promise<void> {
  await rpcOhneErgebnis('plattform_zweiter_faktor_zuruecksetzen', {
    p_uid: eingabe.uid, p_grund: eingabe.grund, p_rueckruf: eingabe.rueckruf,
  });
}
