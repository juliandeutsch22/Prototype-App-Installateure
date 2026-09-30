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
}

export async function plattformBetriebe(): Promise<PlattformBetrieb[]> {
  const { data, error } = await derClient().rpc('plattform_betriebe');
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    kennung: string; name: string; angelegt_am: string; leitungskonten: number;
    leitung_mit_mail: number; notzugang_bis: string | null;
  }[]).map((z) => ({
    kennung: z.kennung,
    name: z.name,
    angelegtAm: z.angelegt_am,
    leitungskonten: Number(z.leitungskonten),
    leitungMitMail: Number(z.leitung_mit_mail),
    notzugangBis: z.notzugang_bis,
  }));
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
