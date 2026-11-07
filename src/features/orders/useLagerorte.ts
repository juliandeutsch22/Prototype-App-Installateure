import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useModul } from '@/lib/useModule';
import { listFahrzeuge, listLagerorte } from '@/lib/db/lagerorte';
import type { Fahrzeug, Lagerort } from '@/types';
import { weitereOrte } from './lagerorte';

/**
 * Die Lagerorte und Fahrzeuge des Betriebs — nur, wenn „Lagerorte und
 * Fahrzeuglager“ an ist (N02).
 *
 * IST ES AUS, GIBT ES NUR DAS HAUPTLAGER: die Liste bleibt leer, jede Wahl
 * eines Ortes verschwindet, und jeder Weg bucht wie vor den Lagerorten. Die
 * Bestände an weiteren Orten bleiben in der Datenbank — sie sind nur nicht
 * zu sehen.
 *
 * KOMMEN DIE ORTE NICHT, gilt dasselbe: eine Wahl, deren Liste fehlt, ist
 * keine; gebucht wird dann ins Hauptlager wie bisher.
 */
export function useLagerorte(): {
  /** Ist die Fähigkeit an? */
  an: boolean;
  /** Alle Orte (auch stillgelegte), wenn an — sonst leer. */
  orte: Lagerort[];
  fahrzeuge: Fahrzeug[];
  /** Gibt es überhaupt einen weiteren, aktiven Ort? Erst dann lohnt eine Wahl. */
  mitWeiteren: boolean;
  neuLaden: () => void;
} {
  const { user } = useAuth();
  const an = useModul('material.lagerorte_fahrzeuglager');
  const [orte, setOrte] = useState<Lagerort[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [stand, setStand] = useState(0);
  const firma = user?.companyId;

  useEffect(() => {
    if (!firma || !an) {
      setOrte([]);
      setFahrzeuge([]);
      return;
    }
    let weg = false;
    Promise.resolve()
      .then(() => Promise.all([listLagerorte(firma), listFahrzeuge(firma)]))
      .then(([o, f]) => {
        if (weg) return;
        setOrte(o);
        setFahrzeuge(f);
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [firma, an, stand]);

  const neuLaden = useCallback(() => setStand((n) => n + 1), []);
  return { an, orte: an ? orte : [], fahrzeuge: an ? fahrzeuge : [], mitWeiteren: an && weitereOrte(orte).length > 0, neuLaden };
}
