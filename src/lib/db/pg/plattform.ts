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
}

export async function betriebAnlegen(daten: {
  name: string; companyId: string; adminEmail: string; adminName: string;
}): Promise<BetriebAngelegt> {
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
