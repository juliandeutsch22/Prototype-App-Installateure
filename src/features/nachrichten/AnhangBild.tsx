import { useEffect, useRef, useState } from 'react';

/**
 * EIN BILD IM VERLAUF, DAS GELADEN BLEIBT (L4, 17.11.2026).
 *
 * Die Adresse eines Anhangs gilt zehn Minuten und wird vorher erneuert
 * (`useAnhangAdressen`). Bekäme das `<img>` jede neue Adresse, holte der
 * Browser das Bild jedes Mal noch einmal — alle neun Minuten, solange das
 * Gespräch offen ist. Ein Bild, das schon steht, behält deshalb seine
 * Adresse; nur eines, das noch lädt oder scheiterte (abgelaufen, bevor es
 * an der Reihe war), nimmt die neue.
 */
export default function AnhangBild({ src, alt, onLoad }: { src: string; alt: string; onLoad?: () => void }) {
  const [gezeigt, setGezeigt] = useState(src);
  const geladen = useRef(false);

  useEffect(() => {
    if (!geladen.current) setGezeigt(src);
  }, [src]);

  return (
    <img
      src={gezeigt}
      alt={alt}
      className="nachricht-bild"
      loading="lazy"
      onLoad={() => {
        geladen.current = true;
        onLoad?.();
      }}
      onError={() => {
        geladen.current = false;
        if (gezeigt !== src) setGezeigt(src);
      }}
    />
  );
}
