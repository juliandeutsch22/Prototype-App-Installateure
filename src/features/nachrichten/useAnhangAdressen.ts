import { useEffect, useState } from 'react';
import { anhangAdressen, ANHANG_ADRESSE_GUELTIG_S } from '@/lib/db/nachrichten';

/** Eine Minute vor Ablauf neu holen — ein Tipp kurz vor der Grenze soll noch tragen. */
export const erneuernNachMs = () => (ANHANG_ADRESSE_GUELTIG_S - 60) * 1000;

/**
 * DIE KURZLEBIGEN ADRESSEN DER ANHÄNGE, FRISCH GEHALTEN (K7, Durchsicht
 * 15.11.2026).
 *
 * Die Adresse eines Anhangs gilt zehn Minuten; neu geholt wurde sie nur, wenn
 * sich der Verlauf änderte. Ein Gespräch mit dem Plan-PDF, nach einer
 * Viertelstunde Ruhe angetippt, endete auf der Fehlerseite des Speichers, und
 * Bilder, die erst beim Scrollen laden, blieben leer. Jetzt werden die
 * Adressen kurz vor Ablauf erneuert, solange das Gespräch offen ist — und
 * sofort, wenn die App nach längerer Zeit wieder in den Vordergrund kommt
 * (im Hintergrund schlafen die Zeitgeber am Telefon).
 *
 * `anhaenge` ist der Schlüssel: dieselbe Liste (gleiche Pfade) holt nicht neu.
 */
export function useAnhangAdressen(anhaenge: { eimer: string; pfad: string }[]): Map<string, string> {
  const [adressen, setAdressen] = useState<Map<string, string>>(new Map());
  const schluessel = anhaenge.length ? JSON.stringify(anhaenge.map((a) => [a.eimer, a.pfad])) : '';

  useEffect(() => {
    if (!schluessel) {
      setAdressen(new Map());
      return undefined;
    }
    const liste = (JSON.parse(schluessel) as [string, string][]).map(([eimer, pfad]) => ({ eimer, pfad }));
    const erneuern = erneuernNachMs();
    let weg = false;
    let geholt = 0;
    let takt: number | undefined;

    const holen = () => {
      window.clearTimeout(takt);
      geholt = Date.now();
      void anhangAdressen(liste)
        .then((m) => { if (!weg) setAdressen(m); })
        .catch(() => undefined);
      takt = window.setTimeout(holen, erneuern);
    };
    const zurueck = () => {
      if (document.visibilityState === 'visible' && Date.now() - geholt >= erneuern) holen();
    };

    holen();
    document.addEventListener('visibilitychange', zurueck);
    return () => {
      weg = true;
      window.clearTimeout(takt);
      document.removeEventListener('visibilitychange', zurueck);
    };
  }, [schluessel]);

  return adressen;
}
