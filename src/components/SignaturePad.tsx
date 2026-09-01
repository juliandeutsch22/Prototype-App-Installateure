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
  const [hatStriche, setHatStriche] = useState(false);

  /**
   * Die Zeichenfläche an die tatsächliche Anzeigegröße anpassen.
   *
   * Ohne diese Umrechnung zeichnet der Finger neben dem Strich: das
   * canvas-Element wird per CSS skaliert, seine Zeichenfläche aber nicht. Auf
   * einem Telefon mit doppelter Pixeldichte liegt der Strich dann um den
   * Faktor zwei daneben.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anpassen = () => {
      const rect = canvas.getBoundingClientRect();
      const dichte = window.devicePixelRatio || 1;
      canvas.width = rect.width * dichte;
      canvas.height = rect.height * dichte;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dichte, dichte);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    };
    anpassen();
    window.addEventListener('resize', anpassen);
    return () => window.removeEventListener('resize', anpassen);
  }, []);

  function punkt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    // Den Zeiger festhalten: sonst reißt der Strich ab, sobald der Finger
    // kurz über den Rand des Feldes gerät.
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    zeichnet.current = true;
    const { x, y } = punkt(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function zeichnen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = punkt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hatStriche) setHatStriche(true);
  }

  function ende() {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL('image/png'));
  }

  function leeren() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        onPointerLeave={ende}
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
