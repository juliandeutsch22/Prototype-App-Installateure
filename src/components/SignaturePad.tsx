import { useEffect, useRef, useState } from 'react';
import Button from './Button';

/**
 * Unterschriftsfeld für Finger oder Stift.
 *
 * BEWUSST OHNE biometrische Erfassung. Schreibgeschwindigkeit und
 * Druckverlauf wären auf kapazitiven Touchscreens ohne Stift überwiegend
 * Fiktion — `PointerEvent.pressure` liefert dort konstant 1.0 — und
 * rechtlich ein biometrisches Datum nach Art. 9 DSGVO, das ausdrückliche
 * Einwilligung und eine Folgenabschätzung verlangt. Der Streitfall ist
 * praktisch nie „diese Unterschrift ist gefälscht", sondern „so viele Stunden
 * waren das nicht"; dagegen hilft der eingefrorene Inhalt, nicht die
 * Strichdynamik.
 *
 * Was bleibt, ist das Bild plus Name in Druckbuchstaben — eine einfache
 * elektronische Signatur, und die genügt für Rapport- und Arbeitsscheine.
 */

interface Props {
  /** Wer unterschreibt — steht über dem Feld. */
  titel: string;
  /** Wird bei jeder Änderung gemeldet: leer = noch nichts gezeichnet. */
  onChange: (bild: string | null) => void;
  disabled?: boolean;
}

export default function SignaturePad({ titel, onChange, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  /**
   * „Es steht etwas auf der Flaeche" — als Ref UND als Zustand.
   *
   * Der Zustand steuert die Anzeige, die Ref die Entscheidung in den
   * Ereignisbehandlern. Sich dort auf den Zustand zu verlassen hiesse, sich
   * darauf zu verlassen, dass React zwischen `pointerdown` und `pointerup`
   * neu gezeichnet hat.
   */
  const gemalt = useRef(false);
  const [hatStriche, setHatStriche] = useState(false);

  function merken() {
    gemalt.current = true;
    setHatStriche(true);
  }

  /** Zuletzt eingerichtete Zeichenflaeche in Geraetepixeln. */
  const flaeche = useRef({ w: 0, h: 0 });

  /**
   * Die Zeichenfläche an die tatsächliche Anzeigegröße anpassen.
   *
   * Ohne diese Umrechnung zeichnet der Finger neben dem Strich: das
   * canvas-Element wird per CSS skaliert, seine Zeichenfläche aber nicht. Auf
   * einem Telefon mit doppelter Pixeldichte liegt der Strich dann um den
   * Faktor zwei daneben.
   *
   * DER TEIL, DER AUF DEM TELEFON DIE UNTERSCHRIFT GEFRESSEN HAT: `canvas.width`
   * zu setzen LÖSCHT die Zeichenfläche — auch dann, wenn man denselben Wert
   * noch einmal hineinschreibt. Die alte Fassung hing an `window.resize`, und
   * genau dieses Ereignis feuert auf iOS reihenweise, ohne dass sich am Feld
   * etwas ändert: beim Ein- und Ausblenden der Adressleiste, beim Öffnen der
   * Tastatur für das Namensfeld darüber, beim Drehen. Der Strich verschwand
   * dann mitten im Unterschreiben, und `hatStriche` behauptete weiter, es sei
   * unterschrieben.
   *
   * Deshalb: nur anpassen, wenn sich die Größe WIRKLICH geändert hat — und in
   * diesem Fall das Gezeichnete vorher sichern und danach zurückmalen.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const einrichten = (ctx: CanvasRenderingContext2D, dichte: number) => {
      ctx.scale(dichte, dichte);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    };

    const anpassen = () => {
      const rect = canvas.getBoundingClientRect();
      // Ein Feld ohne Ausdehnung hat keine brauchbare Zeichenflaeche. Das
      // passiert waehrend des Aufbaus; der Beobachter meldet sich wieder,
      // sobald es eine hat.
      if (rect.width < 1 || rect.height < 1) return;
      const dichte = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dichte);
      const h = Math.round(rect.height * dichte);
      if (w === flaeche.current.w && h === flaeche.current.h) return;

      // Das Gezeichnete retten, bevor die Flaeche neu gesetzt wird.
      const alt = flaeche.current.w > 0 ? canvas.toDataURL('image/png') : null;
      canvas.width = w;
      canvas.height = h;
      flaeche.current = { w, h };
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      einrichten(ctx, dichte);
      if (alt) {
        const bild = new Image();
        bild.onload = () => ctx.drawImage(bild, 0, 0, rect.width, rect.height);
        bild.src = alt;
      }
    };

    anpassen();

    // Am ELEMENT haengen, nicht am Fenster: nur eine echte Groessenaenderung
    // des Feldes ist ein Grund, die Flaeche anzufassen.
    const beobachter =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(anpassen) : null;
    beobachter?.observe(canvas);
    // Fuer Browser ohne ResizeObserver bleibt das Fenster als Notnagel; die
    // Groessenpruefung oben macht den Aufruf dort folgenlos.
    if (!beobachter) window.addEventListener('resize', anpassen);
    return () => {
      beobachter?.disconnect();
      if (!beobachter) window.removeEventListener('resize', anpassen);
    };
  }, []);

  function punkt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    // Verhindert, dass iOS die Geste als Scrollen oder als Textauswahl
    // deutet, bevor sie beim Zeichnen ankommt.
    e.preventDefault();
    // Den Zeiger festhalten: sonst reißt der Strich ab, sobald der Finger
    // kurz über den Rand des Feldes gerät.
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    zeichnet.current = true;
    const { x, y } = punkt(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    /**
     * Einen Punkt setzen und das sofort als „gezeichnet" merken.
     *
     * Ohne das gab ein kurzer Tipp keinerlei Rückmeldung — das Feld sah aus,
     * als reagiere es nicht. Und schlimmer: `ende()` meldete trotzdem ein
     * Bild nach oben, nämlich ein leeres. Der Schein galt damit als
     * unterschrieben, obwohl nichts drinstand.
     */
    ctx.lineTo(x, y);
    ctx.stroke();
    merken();
  }

  function zeichnen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = punkt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    merken();
  }

  function ende() {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    const canvas = canvasRef.current;
    // Nur melden, wenn tatsaechlich etwas auf der Flaeche steht: ein leeres
    // Bild waere eine Unterschrift, die keine ist.
    if (!canvas || !gemalt.current) return;
    onChange(canvas.toDataURL('image/png'));
  }

  function leeren() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gemalt.current = false;
    setHatStriche(false);
    onChange(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="section-label">{titel}</span>
        {hatStriche && !disabled && (
          <Button type="button" variant="ghost" onClick={leeren}>
            Neu zeichnen
          </Button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={zeichnen}
        onPointerUp={ende}
        // Kein `onPointerLeave`: der Zeiger ist eingefangen, `pointerup`
        // kommt also verlaesslich an. `pointerleave` haette den Strich
        // dagegen schon beendet, wenn der Finger nur kurz ueber den Rand
        // geraet — und genau dagegen ist das Einfangen da.
        onPointerCancel={ende}
        // `touch-none` ist hier keine Kosmetik: ohne das scrollt die Seite,
        // sobald jemand über das Feld wischt, statt zu zeichnen.
        className={`mt-1 h-40 w-full touch-none rounded border-2 border-dashed bg-surface ${
          disabled ? 'border-line opacity-60' : 'border-line'
        }`}
        aria-label={`${titel} — mit dem Finger oder einem Stift unterschreiben`}
      />
      {!hatStriche && !disabled && (
        <p className="mt-1 text-xs text-ink-muted">Mit dem Finger im Feld unterschreiben.</p>
      )}
    </div>
  );
}
