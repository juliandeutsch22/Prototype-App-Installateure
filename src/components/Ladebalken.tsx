import { useEffect, useState } from 'react';
import { useAnsichtLaedt } from '@/lib/ansichten';

/** Erst ab dieser Wartezeit: ein schneller Wechsel soll nicht flackern. */
export const BALKEN_AB_MS = 150;

/**
 * Der dünne Balken am oberen Rand, solange ein Seitenwechsel auf den
 * Baustein seiner Ansicht wartet (Analyse 10.10.2026).
 *
 * WARUM ÜBERHAUPT. Bis der Baustein da ist, bleibt die alte Seite stehen —
 * richtig, sonst stünde kurz eine leere Fläche da. Ohne Zeichen wirkte das
 * aber wie ein Klick, der nicht ankam. Der Balken sagt „läuft“, ohne die
 * Seite zu verdecken; nach dem Vorladen (`lib/ansichten.ts`) ist er meist
 * gar nicht zu sehen.
 */
export default function Ladebalken() {
  const laedt = useAnsichtLaedt();
  const [zustand, setZustand] = useState<'aus' | 'laeuft' | 'fertig'>('aus');

  useEffect(() => {
    if (laedt) {
      const t = window.setTimeout(() => setZustand('laeuft'), BALKEN_AB_MS);
      return () => window.clearTimeout(t);
    }
    // Lief er, läuft er zu Ende und blendet aus; stand er noch nicht, bleibt er weg.
    setZustand((z) => (z === 'laeuft' ? 'fertig' : 'aus'));
    return undefined;
  }, [laedt]);

  useEffect(() => {
    if (zustand !== 'fertig') return undefined;
    const t = window.setTimeout(() => setZustand('aus'), 300);
    return () => window.clearTimeout(t);
  }, [zustand]);

  if (zustand === 'aus') return null;
  return (
    <div
      className="ladebalken"
      data-zustand={zustand}
      role="progressbar"
      aria-label="Seite wird geladen"
    />
  );
}
