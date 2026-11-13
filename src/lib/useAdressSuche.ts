import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * DER SUCHBEGRIFF AUS DER ADRESSE (`?suche=`), AUCH AUF EINER OFFENEN SEITE
 * (C3, E91).
 *
 * Die Seiten lasen ihn nur beim ersten Aufbau (`useState(() => …)`). Das
 * reichte, solange nur Verweise von anderen Seiten kamen. „Suchen oder
 * springen“ führt aber auch von der Seite auf sich selbst — wer in den
 * Rechnungen steht und eine andere Nummer sucht, sah sonst weiter die alte
 * Suche, und die gesuchte Rechnung öffnete nicht.
 *
 * Den Anfangszustand liest die Seite weiter selbst; dieser Haken ruft
 * `uebernehmen`, sobald die Adresse danach einen anderen Begriff bringt. Das
 * eigene Tippen ins Suchfeld berührt die Adresse nicht und wird nicht
 * überschrieben.
 */
export function useAdressSuche(uebernehmen: (wert: string) => void): void {
  const [adresse] = useSearchParams();
  const wert = adresse.get('suche');
  const zuletzt = useRef(wert);
  useEffect(() => {
    if (wert === zuletzt.current) return;
    zuletzt.current = wert;
    if (wert !== null) uebernehmen(wert);
  }, [wert, uebernehmen]);
}
