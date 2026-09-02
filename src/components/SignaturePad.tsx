import { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 *
 * WARUM DER FINGER ÜBER TOUCH-EREIGNISSE ZEICHNET UND NICHT ÜBER ZEIGER
 * ----------------------------------------------------------------------
 * Aus dem Betrieb zweimal gemeldet: am PC geht es, auf dem iPhone nicht.
 *
 * Nachgemessen in einem echten Browser mit echter Fingereingabe. Wenn der
 * Browser die Geste für sich beansprucht, schickt er ein `pointercancel` —
 * und danach kommt KEIN `pointermove` mehr. Die Zeigerspur war damit tot,
 * der Strich blieb ein Punkt, und das Feld sah aus, als reagiere es nicht.
 *
 * DER MESSWERT, AUF DEM DIESER UMBAU BERUHT: in derselben Geste kamen nach
 * dem Abbruch noch NEUN `touchmove` an. Die Berührungsspur läuft weiter, wenn
 * die Zeigerspur schon abgeräumt ist. Wer mit dem Finger unterschreibt, wird
 * deshalb über `touchstart`/`touchmove` bedient; Maus und Stift laufen
 * weiter über die Zeigerereignisse.
 *
 * Ebenfalls weg: `setPointerCapture`. Es sollte den Strich über den Feldrand
 * hinaus halten, ist aber genau der Aufruf, der auf WebKit im Verdacht steht,
 * den Abbruch überhaupt auszulösen. Für den Finger übernimmt die
 * Berührungsspur diese Aufgabe ohnehin: sie liefert bis zum Loslassen, auch
 * außerhalb des Feldes.
 *
 * DIE LISTENER HÄNGEN NATIV AM ELEMENT, nicht über React. React hängt seine
 * Behandlung an die Wurzel und meldet `touchstart`/`touchmove` dort als
 * passiv an — in einem passiven Listener ist `preventDefault()` wirkungslos,
 * und ohne das scrollt die Seite, statt zu zeichnen.
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
   * darauf zu verlassen, dass React zwischen Beginn und Ende neu gezeichnet
   * hat.
   */
  const gemalt = useRef(false);
  const [hatStriche, setHatStriche] = useState(false);

  /** Zuletzt eingerichtete Zeichenflaeche in Geraetepixeln. */
  const flaeche = useRef({ w: 0, h: 0 });

  /**
   * Die aktuellen Aufrufparameter fuer die nativen Behandler.
   *
   * Sie haengen EINMAL am Element und sollen dort haengen bleiben. Laege
   * `disabled` oder `onChange` in den Abhaengigkeiten, wuerde bei jeder
   * Aenderung neu an- und abgemeldet — mitten in einer Unterschrift.
   */
  const stand = useRef({ disabled, onChange });
  stand.current = { disabled, onChange };

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

  /**
   * Zeichnen — eine Spur, gefuettert aus zwei Quellen.
   *
   * `beginnen`, `ziehen` und `beenden` wissen nicht, ob ein Finger oder eine
   * Maus sie ruft. Sie bekommen nur Koordinaten in CSS-Pixeln.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = () => canvas.getContext('2d');

    const ort = (p: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    };

    const merken = () => {
      gemalt.current = true;
      setHatStriche(true);
    };

    const beginnen = (p: { clientX: number; clientY: number }) => {
      const c = ctx();
      if (!c) return;
      zeichnet.current = true;
      const { x, y } = ort(p);
      c.beginPath();
      c.moveTo(x, y);
      /**
       * Einen Punkt setzen und das sofort als „gezeichnet" merken.
       *
       * Ohne das gab ein kurzer Tipp keinerlei Rückmeldung — das Feld sah aus,
       * als reagiere es nicht. Und schlimmer: das Ende meldete trotzdem ein
       * Bild nach oben, nämlich ein leeres. Der Schein galt damit als
       * unterschrieben, obwohl nichts drinstand.
       */
      c.lineTo(x, y);
      c.stroke();
      merken();
    };

    const ziehen = (p: { clientX: number; clientY: number }) => {
      const c = ctx();
      if (!c) return;
      const { x, y } = ort(p);
      c.lineTo(x, y);
      c.stroke();
      merken();
    };

    /**
     * Den Strich abschliessen und melden.
     *
     * `abgebrochen` unterscheidet das Loslassen vom Eingriff des Browsers.
     * Gemeldet wird in beiden Faellen, denn was auf der Flaeche steht, steht
     * dort — aber ein Abbruch beendet NUR diesen Strich. Die naechste
     * Beruehrung zeichnet weiter, statt dass das Feld tot bleibt.
     */
    const beenden = () => {
      if (!zeichnet.current) return;
      zeichnet.current = false;
      // Nur melden, wenn tatsaechlich etwas auf der Flaeche steht: ein leeres
      // Bild waere eine Unterschrift, die keine ist.
      if (!gemalt.current) return;
      stand.current.onChange(canvas.toDataURL('image/png'));
    };

    // --- Finger und Stift auf dem Glas -----------------------------------
    //
    // Das ist der Weg, der auf dem Telefon zaehlt. `preventDefault()` wirkt
    // hier, weil der Listener nativ und nicht-passiv angemeldet ist — ueber
    // React waere er passiv und die Seite wuerde scrollen statt zu zeichnen.
    const beruehrungBeginn = (e: TouchEvent) => {
      if (stand.current.disabled) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      beginnen(t);
    };
    const beruehrungZug = (e: TouchEvent) => {
      if (!zeichnet.current || stand.current.disabled) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      ziehen(t);
    };
    const beruehrungEnde = () => beenden();

    // --- Maus und Stift ---------------------------------------------------
    //
    // Getrennt gehalten, weil ein Telefon fuer dieselbe Geste ZUSAETZLICH
    // Mausereignisse nachreicht. Das `preventDefault()` oben unterdrueckt
    // sie; die Pruefung auf `zeichnet` faengt ab, was durchkommt.
    const zeigerBeginn = (e: PointerEvent) => {
      if (stand.current.disabled || e.pointerType === 'touch') return;
      e.preventDefault();
      beginnen(e);
      // Fenster statt Feld: so reisst der Strich nicht ab, wenn die Maus
      // kurz ueber den Rand geraet — dieselbe Aufgabe, die frueher
      // `setPointerCapture` hatte, ohne dessen Nebenwirkungen.
      window.addEventListener('pointermove', zeigerZug);
      window.addEventListener('pointerup', zeigerEnde);
      window.addEventListener('pointercancel', zeigerEnde);
    };
    const zeigerZug = (e: PointerEvent) => {
      if (!zeichnet.current || stand.current.disabled) return;
      ziehen(e);
    };
    const zeigerEnde = () => {
      window.removeEventListener('pointermove', zeigerZug);
      window.removeEventListener('pointerup', zeigerEnde);
      window.removeEventListener('pointercancel', zeigerEnde);
      beenden();
    };

    const nichtPassiv: AddEventListenerOptions = { passive: false };
    canvas.addEventListener('touchstart', beruehrungBeginn, nichtPassiv);
    canvas.addEventListener('touchmove', beruehrungZug, nichtPassiv);
    canvas.addEventListener('touchend', beruehrungEnde);
    canvas.addEventListener('touchcancel', beruehrungEnde);
    canvas.addEventListener('pointerdown', zeigerBeginn);

    return () => {
      canvas.removeEventListener('touchstart', beruehrungBeginn, nichtPassiv);
      canvas.removeEventListener('touchmove', beruehrungZug, nichtPassiv);
      canvas.removeEventListener('touchend', beruehrungEnde);
      canvas.removeEventListener('touchcancel', beruehrungEnde);
      canvas.removeEventListener('pointerdown', zeigerBeginn);
      zeigerEnde();
    };
  }, []);

  const leeren = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gemalt.current = false;
    setHatStriche(false);
    onChange(null);
  }, [onChange]);

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
        // `touch-none` steht zusaetzlich als Klasse da. Hier noch einmal fest
        // am Element, weil das Feld ohne diese eine Eigenschaft NICHT
        // funktioniert: im Probestand ohne sie brach der Browser die Geste
        // nach dem ersten Zug ab. Eine Klasse kann ein Build verlieren, diese
        // Zeile nicht.
        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        className={`mt-1 h-40 w-full touch-none select-none rounded border-2 border-dashed bg-surface ${
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
