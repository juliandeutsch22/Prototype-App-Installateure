import { derClient } from './pg/kern';

/** Was `push-probe` über die Probemeldung sagt (E69). */
export interface ProbeAntwort {
  ergebnis: 'gesendet' | 'unbekannt' | 'abgemeldet' | 'abgelehnt';
  /** Googles Fehlercode, wenn abgelehnt oder abgemeldet. */
  code?: string;
}

/** Eine Probemeldung an dieses Gerät — der Server sendet nur an ein eigenes Zeichen. */
export async function probeSenden(token: string): Promise<ProbeAntwort> {
  const { data, error } = await derClient().functions.invoke('push-probe', { body: { token } });
  if (error) {
    const rumpf = await (error as { context?: Response }).context?.json?.().catch(() => undefined);
    throw new Error(rumpf?.error ?? error.message);
  }
  return data as ProbeAntwort;
}
