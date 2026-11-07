import { useEffect, useMemo, useState } from 'react';
import { materialdeckung } from '@/lib/db/materialdeckung';
import { deckungJeEinsatz, einsatzSchluessel, type EinsatzDeckung, type MaterialLage } from './materialDeckung';

/**
 * DIE MATERIALBEREITSCHAFT EINES ZEITRAUMS (M04b, E13) — je Einsatz der
 * zusammengefasste Zustand, für Woche und Tag. Eine Abfrage für den ganzen
 * Zeitraum (`materialdeckung`), gerechnet mit derselben Funktion wie das
 * Formular.
 *
 * `an` ist aus, wenn das Modul fehlt oder die Rolle die Rechnung nicht sehen
 * darf: dann steht nichts da — kein Zustand, kein Fehler. `neu` lädt neu
 * (etwa wenn ein Seitenfenster geschlossen wurde, in dem gespeichert sein
 * kann). Vor der Antwort steht ebenfalls nichts: ein „bereit“ ohne Grundlage
 * wäre eine Entwarnung, die nicht stimmt.
 */
export function useMaterialLage(
  von: string,
  bis: string,
  an: boolean,
  neu: unknown,
): {
  /** Der Zustand eines Einsatzes, sobald geladen; ohne Rüstliste nichts. */
  lageFuer: (tag: string, nummer: string) => MaterialLage | undefined;
  /** Alle Einsätze eines Tages mit Rüstliste — für den Tag. */
  lagenAm: (tag: string) => (MaterialLage | null)[];
  fehler: boolean;
} {
  const [stand, setStand] = useState<Map<string, EinsatzDeckung> | 'fehler' | null>(null);

  useEffect(() => {
    if (!an) {
      setStand(null);
      return;
    }
    let weg = false;
    Promise.resolve()
      .then(() => materialdeckung(von, bis))
      .then((d) => {
        if (!weg) setStand(deckungJeEinsatz(d));
      })
      .catch(() => {
        if (!weg) setStand('fehler');
      });
    return () => {
      weg = true;
    };
  }, [von, bis, an, neu]);

  return useMemo(() => {
    const karte = stand instanceof Map ? stand : null;
    return {
      lageFuer: (tag: string, nummer: string) => karte?.get(einsatzSchluessel(tag, nummer))?.lage ?? undefined,
      lagenAm: (tag: string) => (karte ? [...karte].filter(([k]) => k.startsWith(`${tag}|`)).map(([, d]) => d.lage) : []),
      fehler: stand === 'fehler',
    };
  }, [stand]);
}
