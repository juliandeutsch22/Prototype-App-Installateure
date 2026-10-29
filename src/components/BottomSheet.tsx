import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { istOben, tabZiele, useFokusFalle } from './fokusFalle';
import { AB_TABLET } from '@/lib/breiten';
import { ImFenster } from './imFenster';
import { useHintergrundSperre } from './hintergrundSperre';
import { useOverlayAnwesenheit } from '@/lib/useOverlayAnwesenheit';
import { useBlattGeste } from './useBlattGeste';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Beschriftung für die Vorlesehilfe. */
  label: string;
  /**
   * Auch ab Tablet-Breite zeigen — dort als Seitenfenster rechts (Linie
   * „Lot“, Regel 8). Ohne die Angabe gibt es das Blatt nur am Telefon (das
   * „Mehr“-Menü).
   */
  auchBreit?: boolean;
  /**
   * Sichtbarer Titel mit „Schließen“ im Kopf des Fensters. Ohne ihn bleibt
   * das Fenster, wie es war: der Aufrufer setzt seinen eigenen Kopf, und
   * „Schließen“ gibt es für die Tastatur.
   */
  titel?: string;
  /**
   * Das breitere Seitenfenster (480 statt 440 px) — für Inhalte mit
   * Kennzahlen nebeneinander und Zeilen mit Knopf, etwa „Person im Monat“
   * (Runde 4). Am Handy ohne Wirkung.
   */
  breit?: boolean;
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
 * Am Griff laufen Pointer-Events für Finger, Stift und Maus. Im scrollbaren
 * Inhalt trennt ein nativer Touch-Listener die Schließgeste vom Scrollen;
 * Abbrüche und seitliche Gesten schließen das Blatt nicht.
 */
export default function BottomSheet({ open, onClose, label, auchBreit = false, titel, breit = false, children }: BottomSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const blattRef = useRef<HTMLDivElement>(null);
  const { sichtbar, phase } = useOverlayAnwesenheit(open);
  const abTablet = useAbTablet();
  const modalSichtbar = sichtbar && (auchBreit || !abTablet);
  const geste = useBlattGeste({ open, aktiv: !abTablet, blatt: blattRef, inhalt: scrollRef, onClose });
  const { dy, zieht } = geste;
  /*
    DER FOKUS KOMMT HEREIN UND GEHT ZURÜCK. Vorher blieb er beim Öffnen auf
    dem Auslöser hinter dem Blatt, Tab lief in die verdeckte Seite, und nach
    dem Schliessen stand er irgendwo (Prüflauf 25.09.2026, P4-05). Fokussiert
    wird das Blatt selbst, nicht der Knopf „Schließen": der wird beim Fokus
    sichtbar, und wer mit dem Finger öffnet, soll davon nichts sehen.
  */
  useFokusFalle(blattRef, modalSichtbar, { hineinHolen: 'behaelter', zurueckGeben: true });

  /*
    DIE SEITE DAHINTER STEHT STILL, solange das Blatt zu sehen ist
    (`hintergrundSperre.ts`). Ohne `auchBreit` gibt es das Blatt nur am
    Handy; dreht jemand das Tablet bei offenem „Mehr“ über 760 px, ist es
    ausgeblendet — dann darf es die Seite nicht festhalten.
  */
  useHintergrundSperre(modalSichtbar);

  const schliessen = useCallback(() => {
    if (!open) return;
    onClose();
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && istOben(blattRef) && schliessen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, schliessen]);

  /*
    DER INHALT IST MIT DER TASTATUR ERREICHBAR (axe, Stand 18, K2): steht im
    Fenster nur Text — die Hilfe zu einer Seite —, nimmt darin nichts den
    Fokus, und ein langer Text liesse sich ohne Maus nicht rollen. Dann wird
    der Inhalt selbst ein Halt. NUR DANN: wo Knöpfe oder Felder darin stehen,
    rollt der Fokus über sie mit, und ein weiterer Halt vor jedem Formular
    wäre nur ein Tab mehr. Der Inhalt kann sich nach dem Öffnen ändern (es
    lädt), deshalb wird bei jeder Änderung neu entschieden.
  */
  useEffect(() => {
    const inhalt = scrollRef.current;
    if (!open || !inhalt) return;
    const entscheiden = () => {
      const nurText = tabZiele(inhalt).length === 0;
      // Nur bei einem Wechsel schreiben: das Schreiben selbst meldet der Beobachter wieder.
      if (nurText && inhalt.getAttribute('tabindex') !== '0') inhalt.setAttribute('tabindex', '0');
      else if (!nurText && inhalt.hasAttribute('tabindex')) inhalt.removeAttribute('tabindex');
    };
    entscheiden();
    const beobachter = new MutationObserver(entscheiden);
    beobachter.observe(inhalt, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'tabindex', 'href', 'hidden'],
    });
    return () => beobachter.disconnect();
  }, [open]);

  if (!sichtbar) return null;

  return (
    /*
      AB DEM TABLET EIN SEITENFENSTER RECHTS, am Handy ein Blatt von unten
      (Linie „Lot“, Regel 8): die Übersicht bleibt dahinter stehen. Bis zum
      Umbau stand das breite Fenster in der Mitte; davor (bis 05.10.2026)
      war es ab Tablet-Breite gar nicht zu sehen. Ohne `auchBreit` gibt es
      das Blatt weiter nur am Telefon (das „Mehr“-Menü).
    */
    <div
      className={auchBreit ? 'schleier lot-overlay' : 'schleier lot-overlay md:hidden'}
      data-phase={phase}
      onClick={schliessen}
      onClickCapture={(e) => { if (!open) { e.preventDefault(); e.stopPropagation(); } }}
      style={{
        opacity: phase === 'schliesst' ? 0 : dy > 0 ? Math.max(0.15, 1 - dy / 320) : 1,
        transition: zieht ? 'none' : 'opacity var(--motion-exit) var(--ease-response)',
      }}
    >
      <div
        ref={blattRef}
        data-lot-inhalt=""
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${auchBreit ? (breit ? 'fenster-breit' : 'fenster') : 'blatt'} pb-[max(1rem,env(safe-area-inset-bottom))] focus-visible:outline-none`}
        style={{
          transform: `translateY(${dy}px)`,
          transition: zieht ? 'none' : phase === 'schliesst' ? 'transform var(--motion-exit) var(--ease-response)' : 'transform 180ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={geste.bewegung}
        onPointerUp={geste.ende}
        onPointerCancel={geste.abbruch}
        onLostPointerCapture={geste.abbruch}
      >
        {/* Grosszuegige Grifffläche: die sichtbare Leiste ist 4 px hoch, das
            Ziel darunter misst die volle Touch-Höhe. */}
        <div
          onPointerDown={(e) => geste.beginn(e, true)}
          className={auchBreit ? 'fenster-griff' : 'blatt-griff'}
          aria-hidden="true"
        >
          <div className="blatt-griff-strich" />
        </div>

        {titel ? (
          <div className="fenster-kopf">
            <h2 className="fenster-titel">{titel}</h2>
            <button type="button" onClick={schliessen} className="fenster-schliessen">
              Schließen
            </button>
          </div>
        ) : (
          /* Für die Tastatur, die nicht wischen kann. */
          <button
            type="button"
            onClick={schliessen}
            className="sr-only focus:not-sr-only focus:mb-2 focus:block focus:min-h-touch focus:w-full focus:rounded focus:border focus:border-line"
          >
            Schließen
          </button>
        )}

        <div
          ref={scrollRef}
          onPointerDown={(e) => geste.beginn(e, false)}
          className={auchBreit ? 'fenster-inhalt' : 'blatt-inhalt'}
        >
          <ImFenster>{children}</ImFenster>
        </div>
      </div>
    </div>
  );
}

/** Steht die Seite ab Tablet-Breite? Ohne Medienabfrage (Tests): nein. */
function useAbTablet(): boolean {
  const frage = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(AB_TABLET).matches;
  const [ab, setAb] = useState(frage);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const abfrage = window.matchMedia(AB_TABLET);
    const neu = () => setAb(abfrage.matches);
    neu();
    // Ältere Safari kennen nur addListener.
    if (abfrage.addEventListener) abfrage.addEventListener('change', neu);
    else abfrage.addListener?.(neu);
    return () => {
      if (abfrage.removeEventListener) abfrage.removeEventListener('change', neu);
      else abfrage.removeListener?.(neu);
    };
  }, []);
  return ab;
}
