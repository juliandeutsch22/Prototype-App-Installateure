import { useEffect, useState } from 'react';
import { aktualisierenAusloesen } from '@/lib/aktualisieren';
import Icon from './Icon';

/**
 * ZIEHEN ZUM AKTUALISIEREN (Plan 15.11.2026, F15) — wie am iPhone.
 *
 * Als App vom Home-Bildschirm (ohne Browserleiste) gibt es kein Ziehen von
 * oben, das die Seite neu holt; im Browser schon (dort lädt es die ganze
 * Seite neu). Hier: oben auf der Seite den Finger nach unten ziehen, ein
 * Zeichen kommt mit; über der Schwelle losgelassen, holen alle Listen der
 * Seite jetzt nach (`aktualisieren.ts`) — ohne die Seite neu zu laden, ohne
 * Eingaben zu verlieren.
 *
 * NUR ALS INSTALLIERTE APP. Im Browser zöge sonst zweierlei: das eigene
 * Neuladen des Browsers und dieses. Nur mit dem Finger, nur wenn die Seite
 * ganz oben steht und kein Fenster offen ist, und nie aus einem Bereich, der
 * selbst nach oben rollen kann. Die Geste hört nur zu (`passive`): das
 * Rollen der Seite bleibt, wie es ist.
 */
const SCHWELLE = 72;
const HOECHSTENS = 96;

function istApp(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

/** Kann das Ziel (oder etwas darüber) selbst noch nach oben rollen? Dann gehört der Finger dorthin. */
function rolltSelbst(ziel: EventTarget | null): boolean {
  for (let el = ziel instanceof Element ? ziel : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

export default function ZiehenZumAktualisieren() {
  const [weg, setWeg] = useState(0);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (!istApp()) return;
    let start: { y: number } | null = null;
    let jetzt = 0;
    const anfang = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1 || window.scrollY > 0 || document.querySelector('[aria-modal="true"]') || rolltSelbst(e.target)) return;
      start = { y: e.touches[0].clientY };
    };
    const bewegen = (e: TouchEvent) => {
      if (!start) return;
      const d = e.touches[0].clientY - start.y;
      // Nach oben, oder die Seite rollt inzwischen: keine Geste mehr.
      if (d <= 0 || window.scrollY > 0) { start = null; jetzt = 0; setWeg(0); return; }
      jetzt = Math.min(HOECHSTENS, d * 0.5);
      setWeg(jetzt);
    };
    const ende = () => {
      if (!start) return;
      start = null;
      if (jetzt * 2 >= SCHWELLE) {
        setLaeuft(true);
        aktualisierenAusloesen();
        window.setTimeout(() => setLaeuft(false), 700);
      }
      jetzt = 0;
      setWeg(0);
    };
    window.addEventListener('touchstart', anfang, { passive: true });
    window.addEventListener('touchmove', bewegen, { passive: true });
    window.addEventListener('touchend', ende);
    window.addEventListener('touchcancel', ende);
    return () => {
      window.removeEventListener('touchstart', anfang);
      window.removeEventListener('touchmove', bewegen);
      window.removeEventListener('touchend', ende);
      window.removeEventListener('touchcancel', ende);
    };
  }, []);

  const bereit = weg * 2 >= SCHWELLE;
  if (!weg && !laeuft) return null;
  return (
    <div
      className="ziehen-aktualisieren"
      data-bereit={bereit || laeuft ? '' : undefined}
      data-laeuft={laeuft ? '' : undefined}
      style={{ transform: `translate(-50%, ${laeuft ? SCHWELLE / 2 : weg}px) rotate(${laeuft ? 0 : Math.round((weg / (SCHWELLE / 2)) * 180)}deg)` }}
      role="status"
      aria-label={laeuft ? 'Wird aktualisiert' : bereit ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen'}
    >
      {/* Die zwei Pfeile im Kreis — dasselbe Zeichen wie „Baustelle wechseln“ am Arbeitstag. */}
      <Icon name="wechsel" size={20} aria-hidden="true" />
    </div>
  );
}
