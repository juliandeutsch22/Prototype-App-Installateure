import { useLayoutEffect, useState } from 'react';

/** Ein schließendes Overlay behält Sperre und Fokus bis zum letzten Bild.
 * Ein erneutes Öffnen bricht den Abbau ab. Ohne Animation/bei Reduce sofort. */
export function useOverlayAnwesenheit(offen: boolean) {
  const [vorhanden, setVorhanden] = useState(offen);
  useLayoutEffect(() => {
    if (offen) {
      setVorhanden(true);
      return;
    }
    if (!vorhanden) return;
    const frage = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!frage || frage.matches || typeof Element.prototype.animate !== 'function') {
      setVorhanden(false);
      return;
    }
    const fertig = () => setVorhanden(false);
    const uhr = setTimeout(fertig, 140);
    const weniger = () => { if (frage.matches) fertig(); };
    frage.addEventListener?.('change', weniger);
    return () => {
      clearTimeout(uhr);
      frage.removeEventListener?.('change', weniger);
    };
  }, [offen, vorhanden]);
  return { sichtbar: offen || vorhanden, phase: offen ? 'offen' : 'schliesst' } as const;
}
