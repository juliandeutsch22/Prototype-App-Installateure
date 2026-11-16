import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * `?neu` IN DER ADRESSE ÖFFNET DAS FORMULAR FÜR „NEU …“ (F15, Aktionen in
 * „Suchen oder springen“). Nur, wo die Seite den Knopf selbst zeigt (`darf`);
 * danach verschwindet der Parameter, sonst öffnete jedes Neuladen das
 * Formular wieder.
 *
 * NUR DAS BLOSSE `?neu`. `?neu=fuer&kunde=…` (aus der Kundenakte,
 * `neuFuer.ts`) liest die Seite schon selbst, mit Vorbelegung — das bleibt
 * unberührt.
 */
export function useNeuAusAdresse(oeffnen: () => void, darf: boolean): void {
  const [adresse, setAdresse] = useSearchParams();
  useEffect(() => {
    if (adresse.get('neu') !== '' || !darf) return;
    oeffnen();
    setAdresse((alt) => {
      const rest = new URLSearchParams(alt);
      rest.delete('neu');
      return rest;
    }, { replace: true });
    // Nur beim Ankommen über die Adresse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse, darf]);
}
