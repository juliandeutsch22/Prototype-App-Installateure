import { useEffect, useState } from 'react';
import { anhangAdressen, ANHANG_ADRESSE_GUELTIG_S } from '@/lib/db/nachrichten';

/** Eine Minute vor Ablauf neu holen — ein Tipp kurz vor der Grenze soll noch tragen. */
export const erneuernNachMs = () => (ANHANG_ADRESSE_GUELTIG_S - 60) * 1000;

/** Wie lange vor Ablauf eine Adresse als auslaufend gilt. */
const vorlaufMs = () => ANHANG_ADRESSE_GUELTIG_S * 1000 - erneuernNachMs();

/**
 * GEMERKTE ADRESSEN JE DATEI (L4, 17.11.2026). Eine neu signierte Adresse ist
 * eine neue Adresse — der Browser hält ein Bild dafür nicht vor und holt es
 * noch einmal. Bis hierher bekam jeder Anhang des Gesprächs eine neue, sobald
 * eine Nachricht mit Anhang dazukam oder ältere nachgeladen wurden, und beim
 * nächsten Öffnen des Gesprächs ebenso. Jetzt gilt eine Adresse, bis sie bald
 * abläuft, für jede Ansicht, die dieselbe Datei zeigt; signiert wird nur, was
 * fehlt oder ausläuft.
 *
 * Nur im Arbeitsspeicher und nur so lange, wie die Adresse ohnehin gilt
 * (zehn Minuten) — nach dem Löschen eines Anhangs gilt sie nicht länger als
 * bisher.
 */
const GEMERKT = new Map<string, { url: string; bis: number }>();

/** Für Prüfungen: alles vergessen. */
export function adressenVergessen(): void {
  GEMERKT.clear();
}

const schluesselVon = (a: { eimer: string; pfad: string }) => `${a.eimer}/${a.pfad}`;

/** Fehlt die Adresse, oder läuft sie in der nächsten Minute ab? */
function laeuftAus(schluessel: string, jetzt: number): boolean {
  const g = GEMERKT.get(schluessel);
  return !g || g.bis - jetzt <= vorlaufMs();
}

/**
 * DIE KURZLEBIGEN ADRESSEN DER ANHÄNGE, FRISCH GEHALTEN (K7, Durchsicht
 * 15.11.2026).
 *
 * Die Adresse eines Anhangs gilt zehn Minuten. Ein Gespräch mit dem Plan-PDF,
 * nach einer Viertelstunde Ruhe angetippt, endete sonst auf der Fehlerseite
 * des Speichers, und Bilder, die erst beim Scrollen laden, blieben leer. Die
 * Adressen werden deshalb kurz vor Ablauf erneuert, solange das Gespräch
 * offen ist — und sofort, wenn die App nach längerer Zeit wieder in den
 * Vordergrund kommt (im Hintergrund schlafen die Zeitgeber am Telefon).
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
    let weg = false;
    let takt: number | undefined;

    const zeigen = () => {
      const m = new Map<string, string>();
      for (const a of liste) {
        const g = GEMERKT.get(schluesselVon(a));
        if (g) m.set(schluesselVon(a), g.url);
      }
      if (!weg) setAdressen(m);
    };
    // Der nächste Lauf, wenn die erste der Adressen ausläuft.
    // Ohne Netz gescheitert: nicht jede Sekunde, sondern nach einer halben Minute wieder.
    const planen = (gescheitert = false) => {
      window.clearTimeout(takt);
      const frueheste = Math.min(...liste.map((a) => GEMERKT.get(schluesselVon(a))?.bis ?? Date.now()));
      takt = window.setTimeout(holen, Math.max(gescheitert ? 30_000 : 1000, frueheste - vorlaufMs() - Date.now()));
    };
    function holen() {
      const jetzt = Date.now();
      for (const [k, g] of GEMERKT) if (g.bis <= jetzt) GEMERKT.delete(k);
      const fehlt = liste.filter((a) => laeuftAus(schluesselVon(a), jetzt));
      if (!fehlt.length) {
        zeigen();
        planen();
        return;
      }
      zeigen();
      void anhangAdressen(fehlt).then(
        (m) => {
          const bis = jetzt + ANHANG_ADRESSE_GUELTIG_S * 1000;
          for (const [k, url] of m) GEMERKT.set(k, { url, bis });
          zeigen();
          if (!weg) planen();
        },
        () => { if (!weg) planen(true); },
      );
    }
    const zurueck = () => {
      if (document.visibilityState === 'visible' && liste.some((a) => laeuftAus(schluesselVon(a), Date.now()))) holen();
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
