import { useEffect } from 'react';

/** Was als Fehlermeldung gilt: rote Alarmzeilen und die Hinweiszeile „fehl“. */
export const FEHLER_AUSWAHL = '[role="alert"][class*="text-danger"], .hinweiszeile-fehl[role="alert"]';

function sichtbar(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight);
}

/**
 * FEHLERMELDUNGEN INS BLICKFELD (Testbericht 30.09.2026, G10).
 *
 * Scheiterte ein Speichern, stand die Meldung oft oberhalb oder unterhalb des
 * sichtbaren Bereichs — der Knopf schien nichts zu tun. Jetzt wird eine neu
 * erscheinende Fehlermeldung sanft ins Bild geholt, wenn sie nicht schon zu
 * sehen ist. EINE Stelle für alle Ansichten statt eines Aufrufs in jedem
 * Formular; Warnungen (gelb) bleiben, wo sie sind — sie erscheinen oft beim
 * Tippen, und ein Sprung dabei wäre störend.
 */
export default function FehlerInsBlickfeld() {
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const beobachter = new MutationObserver((aenderungen) => {
      for (const a of aenderungen) {
        for (const knoten of a.addedNodes) {
          if (!(knoten instanceof Element)) continue;
          const fehler = knoten.matches(FEHLER_AUSWAHL) ? knoten : knoten.querySelector(FEHLER_AUSWAHL);
          if (fehler && !sichtbar(fehler)) {
            fehler.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            return;
          }
        }
      }
    });
    beobachter.observe(document.body, { childList: true, subtree: true });
    return () => beobachter.disconnect();
  }, []);
  return null;
}
