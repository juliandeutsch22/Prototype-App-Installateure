import { useAuth } from '@/app/AuthContext';
import { ladeStartseiteWahl } from '@/lib/db/startseiteWahl';
import { abfrageSpeicher, schluessel, useZwischengespeichert } from '@/lib/zwischenspeicher';
import type { StartWahl } from './einrichtung';

/**
 * Die eigene Einrichtung der Startseite (E68) — einmal geladen, für die
 * Startseite und die Timer-Leiste (die auf der Startseite steht, wenn dort
 * der Arbeitstag ausgeblendet ist). Im Einblick des Supports gilt die
 * Vorgabe: er sieht die Seite der Rolle, nicht die einer Person.
 *
 * Scheitert das Laden, gilt ebenfalls die Vorgabe — die Startseite wartet nie
 * auf ihre Einrichtung.
 */
export function useStartWahl(aktiv = true): { wahl: StartWahl | null; laedt: boolean } {
  const { user, einblick } = useAuth();
  const an = aktiv && !!user && !einblick;
  const abfrage = useZwischengespeichert<StartWahl | null>({
    queryKey: user ? schluessel('startseite-wahl', user) : ['startseite-wahl'],
    enabled: an,
    queryFn: () => ladeStartseiteWahl(user!.uid),
  });
  return { wahl: an ? abfrage.data ?? null : null, laedt: an && abfrage.isLoading };
}

/** Nach dem Speichern: neu laden, damit Startseite und Leiste die neue Wahl zeigen. */
export function startWahlNeuLaden(wer: { uid: string; companyId: string }): Promise<void> {
  return abfrageSpeicher.invalidateQueries({ queryKey: schluessel('startseite-wahl', wer) });
}
