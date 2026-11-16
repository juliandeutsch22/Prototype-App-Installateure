import { useEffect, useState } from 'react';

/**
 * „GESPEICHERT“ NUR NACH BESTÄTIGTEM SCHREIBEN (V10, Implementierungsauftrag
 * 9.2) — für die Speicherleiste (U1). Die Seite ruft `bestaetigen()`, wenn
 * die Datenbank das Speichern bestätigt hat; die nächste Änderung nimmt die
 * Bestätigung zurück. Nie als zeitgesteuerte Vermutung.
 */
export function useSpeicherstand(geaendert: boolean): { gespeichert: boolean; bestaetigen: () => void } {
  const [bestaetigt, setBestaetigt] = useState(false);
  useEffect(() => {
    if (geaendert) setBestaetigt(false);
  }, [geaendert]);
  return { gespeichert: bestaetigt && !geaendert, bestaetigen: () => setBestaetigt(true) };
}
