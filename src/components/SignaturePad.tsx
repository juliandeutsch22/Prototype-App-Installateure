import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import { sichtbar, useFokusFalle } from './fokusFalle';
import { einpassen, type Masse, type Punkt } from './unterschriftEinpassen';

/**
 * Unterschriftsfeld für Finger oder Stift.
 *
 * BEWUSST OHNE biometrische Erfassung. Schreibgeschwindigkeit und
 * Druckverlauf wären auf kapazitiven Touchscreens ohne Stift überwiegend
 * Fiktion — `PointerEvent.pressure` liefert dort konstant 1.0 — und
 * rechtlich ein biometrisches Datum nach Art. 9 DSGVO. Was bleibt, ist das
 * Bild plus Name in Druckbuchstaben; das genügt für Arbeitsscheine.
 *
 *
 * DIE STRICHE SIND DIE WAHRHEIT, DAS CANVAS IST NUR DIE ANSICHT
 * -------------------------------------------------------------
 * Dieses Feld ist dreimal aus dem Betrieb als „geht auf dem Handy nicht"
 * gemeldet worden, zuletzt mit dem entscheidenden Hinweis: „einmal für einen
 * Strich funktioniert, dann nie wieder."
 *
 * Alle bisherigen Anläufe haben am Eingabeweg geschraubt und dabei
 * vorausgesetzt, dass die Zeichenfläche verlässlich ist. Sie ist es nicht.
 * Ein `<canvas>` verliert seinen Inhalt bei jeder Größenänderung, iOS wirft
 * seinen Speicher unter Druck weg, und wer den Inhalt über `toDataURL` rettet
 * und zurückmalt, hängt seine Unterschrift an genau die Sache, die gerade
 * kaputtgegangen ist.
 *
 * Deshalb liegt der Strichverlauf jetzt als Liste von Punkten im Speicher.
 * Das Canvas wird daraus gemalt und kann jederzeit verlorengehen — bei einer
 * Größenänderung, beim Zurückkommen aus dem Hintergrund, wenn iOS aufräumt.
 * `neuMalen()` stellt es aus den Punkten wieder her, in voller Schärfe statt
 * als hochskaliertes Bild.
 *
 * KEIN `toDataURL` WÄHREND DES ZEICHNENS. Vorher entstand bei JEDEM
 * Strichende ein rund hundert Kilobyte grosses PNG, wanderte als Zeichenkette
 * in den Zustand der Elternansicht und löste dort ein Neurendern aus — zwei
 * Felder, jeder Strich. Das ist die mit Abstand teuerste Operation des
 * Formulars und der wahrscheinlichste Grund, warum ein Telefon nach dem
 * ersten Strich aufgibt. Nach oben gemeldet wird jetzt nur noch, OB
 * unterschrieben wurde; das Bild holt sich die Elternansicht einmal, beim
 * Einfrieren.
 *
 * DIE LISTENER HÄNGEN AM LEBENDEN ELEMENT. Sie werden über die
 * Element-Referenz angemeldet, nicht einmalig beim Aufbau: tauscht React den
 * Knoten aus, wandern sie mit. Hängen sie am alten Knoten, ist das Feld
 * stumm — und zwar dauerhaft, was genau wie „einmal ging es, dann nie wieder"
 * aussieht.
 *
 * `preventDefault()` wirkt nur in einem NICHT-passiven Listener, und React
 * meldet Berührungsereignisse an der Wurzel als passiv an. Ohne das scrollt
 * die Seite unter dem Finger weg, statt dass er zeichnet — deshalb nativ.
 *
 *
 * GROSS UNTERSCHREIBEN, AM BESTEN QUER (unter 1024 px)
 * ----------------------------------------------------
 * Unter dem Feld steht „Groß unterschreiben": es öffnet die Zeichenfläche
 * bildschirmfüllend. Das Feld im Formular bleibt, wie es ist — wer dort
 * unterschreibt, braucht keinen Tipp mehr als vorher.
 *
 * GEDREHT WIRD NICHT PER CSS. Eine um 90° gedrehte Fläche verlangte, jede
 * Fingerposition zurückzurechnen, und hinge an Eigenheiten von Safari. Das
 * Blatt nimmt die Lage des Geräts, wie sie ist; im Hochformat steht ein
 * Hinweis, es quer zu halten — unterschreiben geht auch so.
 *
 * DAS BILD FÜR DEN SCHEIN ENTSTEHT WIE BISHER aus dem Feld im Formular. Beim
 * Schliessen des Blatts werden die Striche in das Feld eingepasst
 * (`unterschriftEinpassen.ts`); gespeichert wird dann genau das, was dort zu
 * sehen ist — dasselbe Format, dieselbe Größe wie ohne Blatt.
 */

export interface SignaturePadHandle {
  /** Das fertige Bild — einmal beim Einfrieren, nicht bei jedem Strich. */
  bildLesen: () => string | null;
}

interface Props {
  /** Wer unterschreibt — steht über dem Feld. */
  titel: string;
  /** Meldet, OB unterschrieben ist. Bewusst kein Bild: siehe oben. */
  onChange: (hatUnterschrift: boolean) => void;
  disabled?: boolean;
}

/*
  WAS ALS UNTERSCHRIFT ZÄHLT, in CSS-Pixeln (Launch-Check 25.09.2026: ein
  einzelner Strich ging durch). Nicht die Zahl der Striche — viele Menschen
  unterschreiben in einem Zug —, sondern die Ausdehnung: breit genug für
  einen Namenszug und hoch genug, dass es keine gerade Linie ist. Ein
  Antippen, ein Komma, ein Strich quer durchs Feld zählen nicht.
*/
const MIN_BREITE = 40;
const MIN_HOEHE = 12;

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { titel, onChange, disabled = false },
  ref,
) {
  /** Die Fläche, auf der gerade gezeichnet wird — im Formular oder im Blatt. */
  const [feld, setFeld] = useState<HTMLCanvasElement | null>(null);
  /** Ist das große Blatt offen? */
  const [offen, setOffen] = useState(false);
  const grossKnopf = useRef<HTMLButtonElement>(null);
  const blatt = useRef<HTMLDivElement>(null);
  const wurzel = useRef<HTMLDivElement>(null);
  const blattTitel = useId();
  const [hatStriche, setHatStriche] = useState(false);
  /** Genug für eine Unterschrift — siehe `MIN_BREITE`. */
  const [reicht, setReicht] = useState(false);
  /** Die Ausdehnung aller Striche bisher. */
  const rahmen = useRef({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  /** Der Strichverlauf in CSS-Pixeln, relativ zur linken oberen Ecke. */
  const striche = useRef<Punkt[][]>([]);
  const zeichnet = useRef(false);
  /**
   * Wurde „ist unterschrieben" schon nach oben gemeldet?
   *
   * DAS MUSS EINE REFERENZ SEIN, KEIN ZUSTAND. Stand `hatStriche` in den
   * Abhängigkeiten des Zeichen-Effekts, meldete der erste Strich die
   * Unterschrift, löste ein Neurendern aus — und der Effekt lief mitten in
   * der laufenden Geste erneut: Listener ab, Listener an, die restlichen
   * Bewegungen verloren. Nachgemessen: der erste Strich hinterliess 42 statt
   * 7500 Pixel. Auf einem Telefon sieht das aus wie „das Feld reagiert
   * einmal und dann nicht mehr".
   */
  const gemeldet = useRef(false);
  /** Zuletzt eingerichtete Fläche in Gerätepixeln. */
  const flaeche = useRef({ w: 0, h: 0 });
  /**
   * Maße der Fläche in CSS-Pixeln, auf die sich die Striche beziehen. Beim
   * Wechsel zwischen Feld und Blatt werden die Striche damit umgerechnet.
   */
  const strichFlaeche = useRef<Masse | null>(null);
  /** Wohin der Wechsel geht: ins Blatt vergrößern oder zurück einpassen. */
  const wechsel = useRef<'ins-blatt' | 'ins-feld' | null>(null);

  /**
   * Die aktuellen Aufrufparameter für die nativen Behandler.
   *
   * Sie liegen in einer Referenz, damit das An- und Abmelden nicht bei jeder
   * Änderung von `disabled` oder `onChange` erneut läuft — mitten in einer
   * Unterschrift wäre das ein abgerissener Strich.
   */
  const stand = useRef({ disabled, onChange });
  stand.current = { disabled, onChange };

  /** Stift, Linienbreite, Skalierung — nach jedem Setzen von `width` neu. */
  const einrichten = useCallback((c: CanvasRenderingContext2D, dichte: number) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.scale(dichte, dichte);
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // `--text` der Oberfläche statt des Graublaus einer fremden Bibliothek
    // (#111827, Prüflauf C5). Ein Canvas liest keine CSS-Variablen; der
    // Wert steht deshalb hier ausgeschrieben.
    c.strokeStyle = '#0a2030';
  }, []);

  /**
   * Alles aus den Punkten neu malen.
   *
   * Der einzige Weg, wie Inhalt auf die Fläche kommt — beim Zeichnen wie nach
   * einem Verlust. Damit gibt es keinen Zustand, der nur im Canvas existiert
   * und deshalb verlorengehen könnte.
   */
  const neuMalen = useCallback(() => {
    if (!feld) return;
    const c = feld.getContext('2d');
    if (!c) return;
    const dichte = flaeche.current.w > 0 ? flaeche.current.w / (feld.clientWidth || 1) : 1;
    einrichten(c, dichte);
    c.clearRect(0, 0, feld.clientWidth, feld.clientHeight);
    for (const strich of striche.current) {
      if (strich.length === 0) continue;
      c.beginPath();
      c.moveTo(strich[0].x, strich[0].y);
      // Ein einzelner Tipp ist ein Punkt: Linie auf sich selbst, damit
      // `lineCap: round` einen sichtbaren Kreis zeichnet.
      if (strich.length === 1) c.lineTo(strich[0].x, strich[0].y);
      else for (const p of strich.slice(1)) c.lineTo(p.x, p.y);
      c.stroke();
    }
  }, [feld, einrichten]);

  /**
   * Die Fläche an die Anzeigegröße anpassen.
   *
   * `canvas.width` zu setzen LÖSCHT den Inhalt — auch beim gleichen Wert.
   * Früher wurde er vorher als Bild gesichert und danach zurückgemalt; jetzt
   * wird er einfach aus den Punkten neu gezeichnet. Das ist nicht nur
   * einfacher, sondern auch schärfer: ein hochskaliertes Bild wird bei jeder
   * Drehung des Telefons unschärfer, gezeichnete Linien nicht.
   */
  useEffect(() => {
    if (!feld) return;
    // Eine NEUE Fläche (Blatt auf oder zu) hat ihre Grundgröße von 300 × 150
    // und muss eingerichtet werden, auch wenn die vorige gleich groß war.
    flaeche.current = { w: 0, h: 0 };

    const anpassen = () => {
      const rect = feld.getBoundingClientRect();
      // Während des Aufbaus hat das Feld keine Ausdehnung; der Beobachter
      // meldet sich wieder, sobald es eine hat.
      if (rect.width < 1 || rect.height < 1) return;
      /*
        BEIM WECHSEL ZWISCHEN FELD UND BLATT werden die Striche
        umgerechnet — nicht bei jeder Größenänderung. Dreht jemand das
        Telefon und alles passt noch, bleiben sie, wo sie sind (wie bisher).
      */
      const von = strichFlaeche.current;
      const ziel = { w: rect.width, h: rect.height };
      /*
        Und wenn die Striche nach einer Größenänderung nicht mehr ins Feld
        passen — quer im Blatt unterschrieben, „Fertig", Telefon zurück ins
        Hochformat —, werden sie eingepasst statt abgeschnitten. Was passt,
        bleibt unberührt.
      */
      const r0 = rahmen.current;
      const ragtHeraus =
        striche.current.length > 0 && (r0.maxX > ziel.w || r0.maxY > ziel.h);
      if ((wechsel.current && von && striche.current.length > 0) || ragtHeraus) {
        const hoechstens =
          wechsel.current === 'ins-blatt' && von
            ? Math.min(ziel.w / von.w, ziel.h / von.h)
            : 1;
        striche.current = einpassen(striche.current, ziel, hoechstens);
        const r = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        for (const strich of striche.current) {
          for (const pt of strich) {
            r.minX = Math.min(r.minX, pt.x);
            r.maxX = Math.max(r.maxX, pt.x);
            r.minY = Math.min(r.minY, pt.y);
            r.maxY = Math.max(r.maxY, pt.y);
          }
        }
        rahmen.current = r;
      }
      wechsel.current = null;
      strichFlaeche.current = ziel;
      const dichte = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dichte);
      const h = Math.round(rect.height * dichte);
      if (w === flaeche.current.w && h === flaeche.current.h) return;
      feld.width = w;
      feld.height = h;
      flaeche.current = { w, h };
      neuMalen();
    };

    anpassen();
    const beobachter =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(anpassen) : null;
    beobachter?.observe(feld);
    if (!beobachter) window.addEventListener('resize', anpassen);

    /**
     * Beim Zurückkommen neu malen — ohne Bedingung.
     *
     * iOS friert eine Startbildschirm-App ein und darf dabei den Speicher der
     * Zeichenfläche wegwerfen. Sie ist danach leer, ohne dass ein Ereignis das
     * meldet. Aus den Punkten neu zu malen kostet nichts und macht diesen Fall
     * folgenlos.
     */
    const zurueck = () => {
      if (document.visibilityState === 'visible') neuMalen();
    };
    document.addEventListener('visibilitychange', zurueck);
    window.addEventListener('pageshow', zurueck);

    return () => {
      beobachter?.disconnect();
      if (!beobachter) window.removeEventListener('resize', anpassen);
      document.removeEventListener('visibilitychange', zurueck);
      window.removeEventListener('pageshow', zurueck);
    };
  }, [feld, neuMalen]);

  /**
   * Zeichnen. Eine Spur, gefüttert aus zwei Quellen — Finger und Zeiger.
   *
   * Die Abhängigkeit auf `feld` ist der Punkt: tauscht React den Knoten aus,
   * läuft dieser Effekt erneut und die Listener hängen wieder am lebenden
   * Element. Das war die Schwachstelle der vorherigen Fassung.
   */
  useEffect(() => {
    if (!feld) return;

    const ort = (p: { clientX: number; clientY: number }): Punkt => {
      const rect = feld.getBoundingClientRect();
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    };

    const strichZeichnen = () => {
      const c = feld.getContext('2d');
      const aktuell = striche.current[striche.current.length - 1];
      if (!c || !aktuell || aktuell.length === 0) return;
      c.beginPath();
      if (aktuell.length === 1) {
        c.moveTo(aktuell[0].x, aktuell[0].y);
        c.lineTo(aktuell[0].x, aktuell[0].y);
      } else {
        const vor = aktuell[aktuell.length - 2];
        const jetzt = aktuell[aktuell.length - 1];
        c.moveTo(vor.x, vor.y);
        c.lineTo(jetzt.x, jetzt.y);
      }
      c.stroke();
    };

    /*
      Nach oben gemeldet wird EINMAL, sobald die Striche als Unterschrift
      reichen — nicht bei jeder Bewegung, das wären sechzig Neuzeichnungen in
      der Sekunde je Feld.
    */
    const vermerken = (pt: Punkt) => {
      const r = rahmen.current;
      r.minX = Math.min(r.minX, pt.x);
      r.maxX = Math.max(r.maxX, pt.x);
      r.minY = Math.min(r.minY, pt.y);
      r.maxY = Math.max(r.maxY, pt.y);
      if (!gemeldet.current && r.maxX - r.minX >= MIN_BREITE && r.maxY - r.minY >= MIN_HOEHE) {
        gemeldet.current = true;
        setReicht(true);
        stand.current.onChange(true);
      }
    };

    const beginnen = (p: { clientX: number; clientY: number }) => {
      zeichnet.current = true;
      const pt = ort(p);
      striche.current.push([pt]);
      strichZeichnen();
      // Der Knopf „Neu zeichnen" erscheint mit dem ersten Strich — auch ein
      // zu kurzer soll sich wegwischen lassen.
      if (striche.current.length === 1) setHatStriche(true);
      vermerken(pt);
    };

    const ziehen = (p: { clientX: number; clientY: number }) => {
      const aktuell = striche.current[striche.current.length - 1];
      if (!aktuell) return;
      const pt = ort(p);
      aktuell.push(pt);
      strichZeichnen();
      vermerken(pt);
    };

    /**
     * Den Strich abschliessen.
     *
     * Es wird NICHTS nach oben gemeldet — das ist beim ersten Strich schon
     * geschehen, und das Bild holt sich die Elternansicht beim Einfrieren.
     * Ein Abbruch durch den Browser beendet damit nur diesen einen Strich;
     * der nächste Fingerkontakt zeichnet weiter.
     */
    const beenden = () => {
      zeichnet.current = false;
    };

    // --- Finger und Stift auf dem Glas ---
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

    // --- Maus und Stift ---
    // Getrennt gehalten, weil ein Telefon für dieselbe Geste ZUSÄTZLICH
    // Zeigerereignisse schickt. `pointerType === 'touch'` fliegt hier raus,
    // sonst zeichnete jede Berührung doppelt.
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
    const zeigerBeginn = (e: PointerEvent) => {
      if (stand.current.disabled || e.pointerType === 'touch') return;
      e.preventDefault();
      beginnen(e);
      // Am Fenster, nicht am Feld: so reisst der Strich nicht ab, wenn die
      // Maus über den Rand gerät. Dieselbe Aufgabe hatte früher
      // `setPointerCapture` — das aber auf WebKit im Verdacht steht, die
      // Geste selbst abzubrechen.
      window.addEventListener('pointermove', zeigerZug);
      window.addEventListener('pointerup', zeigerEnde);
      window.addEventListener('pointercancel', zeigerEnde);
    };

    const nichtPassiv: AddEventListenerOptions = { passive: false };
    feld.addEventListener('touchstart', beruehrungBeginn, nichtPassiv);
    feld.addEventListener('touchmove', beruehrungZug, nichtPassiv);
    feld.addEventListener('touchend', beenden);
    feld.addEventListener('touchcancel', beenden);
    feld.addEventListener('pointerdown', zeigerBeginn);

    return () => {
      feld.removeEventListener('touchstart', beruehrungBeginn, nichtPassiv);
      feld.removeEventListener('touchmove', beruehrungZug, nichtPassiv);
      feld.removeEventListener('touchend', beenden);
      feld.removeEventListener('touchcancel', beenden);
      feld.removeEventListener('pointerdown', zeigerBeginn);
      zeigerEnde();
    };
  }, [feld]);

  useImperativeHandle(
    ref,
    () => ({
      bildLesen: () => {
        if (!feld || striche.current.length === 0) return null;
        // Vor dem Lesen neu malen: falls die Fläche zwischenzeitlich geleert
        // wurde, stünde sonst eine leere Unterschrift auf dem Schein.
        neuMalen();
        return feld.toDataURL('image/png');
      },
    }),
    [feld, neuMalen],
  );

  /** Das Blatt öffnen oder schliessen — die Striche kommen mit. */
  const blattOeffnen = useCallback(() => {
    wechsel.current = 'ins-blatt';
    setOffen(true);
  }, []);
  const blattSchliessen = useCallback(() => {
    wechsel.current = 'ins-feld';
    setOffen(false);
  }, []);

  /*
    SOLANGE DAS BLATT OFFEN IST, steht die Seite dahinter still (sonst
    scrollte sie auf iOS unter dem Blatt mit), „Fertig" hat den Fokus, und
    Escape schliesst wie bei jedem Dialog. Danach geht der Fokus zurück an
    „Groß unterschreiben".
  */
  useEffect(() => {
    if (!offen) return;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    blatt.current?.querySelector<HTMLButtonElement>('[data-fertig]')?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') blattSchliessen();
    };
    window.addEventListener('keydown', taste);
    const knopf = grossKnopf.current;
    // Die Hülle bleibt dieselbe; die Zeichenfläche darin wird erst beim
    // Schliessen gesucht — dann steht wieder die im Formular.
    const huelle = wurzel.current;
    return () => {
      document.body.style.overflow = vorher;
      window.removeEventListener('keydown', taste);
      /*
        IST DER KNOPF WEG, BEKOMMT DAS FELD DEN FOKUS. „Groß unterschreiben"
        ist ab 1024 px ausgeblendet — wer das Tablet im Blatt quer dreht,
        kommt dort an, und der Fokus fiel ins Leere (an `body`). Dann geht er
        an die Zeichenfläche im Formular, auf der die Unterschrift jetzt steht
        (Prüflauf 25.09.2026, P4-14).
      */
      if (knopf && knopf.isConnected && sichtbar(knopf)) knopf.focus();
      else huelle?.querySelector<HTMLCanvasElement>('canvas')?.focus();
    };
  }, [offen, blattSchliessen]);

  // Tab bleibt im Blatt (Prüflauf 25.09.2026, P4-05); Fokus hinein und
  // zurück regelt der Effekt oben.
  useFokusFalle(blatt, offen);

  const leeren = useCallback(() => {
    striche.current = [];
    gemeldet.current = false;
    rahmen.current = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    setHatStriche(false);
    setReicht(false);
    neuMalen();
    onChange(false);
  }, [neuMalen, onChange]);

  const zuWenig = hatStriche && !reicht;
  const hinweis = zuWenig
    ? 'Das reicht noch nicht für eine Unterschrift — bitte den Namen schreiben.'
    : 'Mit dem Finger im Feld unterschreiben.';

  /** Die Zeichenfläche — im Formular oder im Blatt, dieselben Eigenschaften. */
  const zeichenflaeche = (klasse: string) => (
    <canvas
      ref={setFeld}
      // `touch-none` steht zusätzlich als Klasse da. Hier noch einmal fest
      // am Element: ohne diese eine Eigenschaft bricht der Browser die
      // Geste nach dem ersten Zug ab, und eine Klasse kann ein Build
      // verlieren.
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={klasse}
      aria-label={`${titel} — mit dem Finger oder einem Stift unterschreiben`}
      // Fokussierbar nur per Programm (kein Tab-Stopp): Rückfallziel, wenn
      // „Groß unterschreiben" nach dem Blatt nicht zu sehen ist (P4-14).
      tabIndex={-1}
    />
  );

  return (
    <div ref={wurzel}>
      {/*
        DER PLATZ IST IMMER DA, auch wenn der Knopf noch nicht sichtbar ist.
        Erschien er erst beim ersten Strich, sprang das Feld in genau dem
        Moment nach unten, in dem der Finger schon aufgesetzt hatte — der
        Anfang der Unterschrift landete daneben oder ausserhalb. Nachgemessen:
        der erste Strich hinterliess dadurch ein Drittel weniger als jeder
        folgende. Ein Eingabefeld darf sich unter dem Finger nicht bewegen.
      */}
      <div className="flex min-h-touch items-center justify-between">
        <span className="section-label">{titel}</span>
        <Button
          type="button"
          variant="ghost"
          onClick={leeren}
          className={hatStriche && !disabled ? undefined : 'invisible'}
          tabIndex={hatStriche && !disabled ? undefined : -1}
          aria-hidden={hatStriche && !disabled ? undefined : true}
        >
          Neu zeichnen
        </Button>
      </div>
      {/*
        Solange das Blatt offen ist, steht hier ein Platzhalter in derselben
        Höhe: die Seite dahinter soll beim Schliessen nicht springen.
      */}
      {offen ? (
        <div className="mt-1 h-40 w-full rounded border border-line bg-surface" aria-hidden="true" />
      ) : (
        zeichenflaeche(
          `mt-1 h-40 w-full touch-none select-none rounded border bg-surface ${
            disabled ? 'border-line opacity-60' : 'border-line'
          }`,
        )
      )}
      {/* Ebenfalls immer da — verschwände er, ruckte das Feld nach unten. */}
      <div className="flex items-start justify-between gap-2">
        <p
          className={`mt-1 text-xs ${zuWenig ? 'text-warning' : 'text-ink-muted'} ${
            (hatStriche && reicht) || disabled ? 'invisible' : ''
          }`}
        >
          {hinweis}
        </p>
        {/*
          Am Telefon und Tablet: dieselbe Zeichenfläche bildschirmfüllend.
          Am Schreibtisch nicht — dort ist das Feld breit genug, und
          unterschrieben wird mit der Maus.
        */}
        {!disabled && (
          <button
            ref={grossKnopf}
            type="button"
            onClick={blattOeffnen}
            className="link inline-flex min-h-touch shrink-0 items-center text-sm lg:hidden"
          >
            Groß unterschreiben
          </button>
        )}
      </div>

      {offen &&
        createPortal(
          <div
            ref={blatt}
            role="dialog"
            aria-modal="true"
            aria-labelledby={blattTitel}
            /*
              Die sichere Zone (Notch, Home-Leiste) kommt zum Innenabstand
              dazu — quer liegt sie links oder rechts.
            */
            className="fixed inset-0 z-50 flex flex-col gap-2 bg-surface-2 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={blattTitel} className="text-lg font-semibold text-ink">
                {titel}
              </h2>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={leeren} disabled={!hatStriche}>
                  Neu zeichnen
                </Button>
                <Button type="button" onClick={blattSchliessen} data-fertig="">
                  Fertig
                </Button>
              </div>
            </div>
            <p className="text-sm text-ink-muted landscape:hidden">
              Quer halten, dann ist mehr Platz. Unterschreiben geht auch so.
            </p>
            <div className="min-h-0 flex-1">
              {zeichenflaeche('h-full w-full touch-none select-none rounded border border-line bg-surface')}
            </div>
            <p className={`text-xs ${zuWenig ? 'text-warning' : 'text-ink-muted'}`}>{hinweis}</p>
          </div>,
          document.body,
        )}
    </div>
  );
});

export default SignaturePad;
