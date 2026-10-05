import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFokusFalle } from './fokusFalle';

/** Ab wie vielen Pixeln nach unten das Blatt losgelassen als „zu" gilt. */
const SCHWELLE = 90;
/** Schnelles Wischen schliesst auch bei kurzer Strecke (px pro Millisekunde). */
const TEMPO = 0.5;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Beschriftung für die Vorlesehilfe. */
  label: string;
  /**
   * Auch ab Tablet-Breite zeigen — dort als Fenster in der Mitte. Ohne die
   * Angabe gibt es das Blatt nur am Telefon (das „Mehr“-Menü).
   */
  auchBreit?: boolean;
  children: ReactNode;
}

/**
 * Blatt, das von unten hereinkommt — und sich nach unten wegziehen lässt.
 *
 * Der Griff oben war bisher reine Dekoration: er sah aus wie zum Ziehen, ging
 * aber nur durch einen Tipp daneben wieder weg. Eine Zierleiste, die eine
 * Bedienung verspricht und keine hat, ist schlechter als gar keine.
 *
 * Gezogen wird am Griff, und zusätzlich am Inhalt, solange dieser ganz oben
 * steht. Sonst nähme das Blatt jede Wischbewegung entgegen und die Liste
 * darin liesse sich nicht mehr scrollen.
 *
 * Pointer-Events statt Touch-Events: dieselbe Behandlung für Finger, Stift
 * und Maus, ohne drei Wege zu pflegen.
 */
export default function BottomSheet({ open, onClose, label, auchBreit = false, children }: BottomSheetProps) {
  const [dy, setDy] = useState(0);
  const [zieht, setZieht] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blattRef = useRef<HTMLDivElement>(null);
  /*
    DER FOKUS KOMMT HEREIN UND GEHT ZURÜCK. Vorher blieb er beim Öffnen auf
    dem Auslöser hinter dem Blatt, Tab lief in die verdeckte Seite, und nach
    dem Schliessen stand er irgendwo (Prüflauf 25.09.2026, P4-05). Fokussiert
    wird das Blatt selbst, nicht der Knopf „Schließen": der wird beim Fokus
    sichtbar, und wer mit dem Finger öffnet, soll davon nichts sehen.
  */
  useFokusFalle(blattRef, open, { hineinHolen: 'behaelter', zurueckGeben: true });

  const schliessen = useCallback(() => {
    setDy(0);
    setZieht(false);
    start.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setDy(0);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && schliessen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, schliessen]);

  if (!open) return null;

  function beginn(e: React.PointerEvent, nurWennOben: boolean) {
    // Vom Inhalt aus nur ziehen, wenn er nicht gescrollt ist — sonst kaempfen
    // Wischen und Scrollen gegeneinander.
    if (nurWennOben && (scrollRef.current?.scrollTop ?? 0) > 0) return;
    // Als Fenster in der Mitte wird nicht gezogen: wer mit der Maus Text
    // markiert, soll das Fenster dabei nicht nach unten wegschieben.
    if (auchBreit && window.matchMedia?.('(min-width: 768px)').matches) return;
    start.current = { y: e.clientY, t: e.timeStamp };
    setZieht(true);
  }

  function bewegung(e: React.PointerEvent) {
    if (!start.current) return;
    const d = e.clientY - start.current.y;
    // Nur nach unten. Nach oben zu ziehen soll das Blatt nicht anheben.
    setDy(d > 0 ? d : 0);
  }

  function ende(e: React.PointerEvent) {
    if (!start.current) {
      setZieht(false);
      return;
    }
    const d = e.clientY - start.current.y;
    const dauer = Math.max(e.timeStamp - start.current.t, 1);
    start.current = null;
    setZieht(false);
    if (d > SCHWELLE || d / dauer > TEMPO) schliessen();
    else setDy(0);
  }

  return (
    /*
      AB TABLET-BREITE NUR AUF AUSDRÜCKLICHEN WUNSCH. Das Blatt war fürs
      Telefon gebaut und dort `md:hidden` — die Rechnung, die es seit dem
      30.09.2026 zeigt, öffnete sich am Schreibtisch deshalb unsichtbar
      (gemeldet am 05.10.2026). Mit `auchBreit` steht es dort als Fenster in
      der Mitte; Wischen braucht es da nicht, Escape und der Rand schliessen.
    */
    <div
      className={`fixed inset-0 z-40 bg-ink/40 ${auchBreit ? 'md:flex md:items-center md:justify-center md:p-6' : 'md:hidden'}`}
      onClick={schliessen}
      // Der Hintergrund verblasst mit, während das Blatt nach unten geht —
      // ohne das wirkt die Bewegung, als klebe der Schatten fest.
      style={{ opacity: dy > 0 ? Math.max(0.15, 1 - dy / 320) : 1 }}
    >
      <div
        ref={blattRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 rounded-t-lg border border-b-0 border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg focus-visible:outline-none${
          auchBreit ? ' md:relative md:inset-auto md:w-full md:max-w-xl md:rounded-lg md:border-b' : ''
        }`}
        style={{
          transform: `translateY(${dy}px)`,
          // Während des Ziehens keine Übergangszeit: sonst hinkt das Blatt
          // dem Finger sichtbar hinterher.
          transition: zieht ? 'none' : 'transform 180ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={bewegung}
        onPointerUp={ende}
        onPointerCancel={ende}
      >
        {/* Grosszuegige Grifffläche: die sichtbare Leiste ist 4 px hoch, das
            Ziel darunter misst die volle Touch-Höhe. */}
        <div
          onPointerDown={(e) => beginn(e, false)}
          className={`-mt-4 cursor-grab touch-none px-4 pb-2 pt-4 active:cursor-grabbing${auchBreit ? ' md:hidden' : ''}`}
          aria-hidden="true"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-line" />
        </div>

        {/* Für die Tastatur, die nicht wischen kann. */}
        <button
          type="button"
          onClick={schliessen}
          className="sr-only focus:not-sr-only focus:mb-2 focus:block focus:min-h-touch focus:w-full focus:rounded focus:border focus:border-line"
        >
          Schließen
        </button>

        <div
          ref={scrollRef}
          onPointerDown={(e) => beginn(e, true)}
          className={`max-h-[60vh] overflow-y-auto${auchBreit ? ' md:max-h-[80vh]' : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
