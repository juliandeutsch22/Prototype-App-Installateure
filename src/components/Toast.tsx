import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';

/** Eine Aktion in der Meldung — gedacht für „Rückgängig“ (Linie „Lot“, Regel 10). */
export interface MeldungAktion {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  aktion?: MeldungAktion;
  dauerhaft?: boolean;
}

interface ToastApi {
  success: (message: string, aktion?: MeldungAktion) => void;
  error: (message: string) => void;
  wichtig: (message: string) => void;
  info: (message: string, aktion?: MeldungAktion) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

/** Mit „Rückgängig“ bleibt die Meldung länger stehen: man muss sie lesen und dann noch treffen. */
const DAUER = 3500;
const DAUER_MIT_AKTION = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const weg = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: ToastTone, message: string, aktion?: MeldungAktion, dauerhaft = false) => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, tone, message, aktion, dauerhaft }]);
  }, []);

  const api = useRef<ToastApi>({
    success: (m, a) => push('success', m, a),
    error: (m) => push('error', m),
    wichtig: (m) => push('error', m, undefined, true),
    info: (m, a) => push('info', m, a),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        DIE MELDUNG DER LINIE „LOT“: eine dunkle Zeile, keine farbige Fläche.
        Ob etwas gelungen ist, sagt der Text; nur ein Fehler trägt eine rote
        Kante. Lage siehe `.meldungen` in src/styles/lot.css.
      */}
      <div className="meldungen" aria-live="polite" role="status">
        {toasts.map((t) => <ToastZeile key={t.id} meldung={t} weg={weg} />)}
      </div>
    </ToastContext.Provider>
  );
}

/** Jede Uhr gehört zur sichtbaren Zeile. Hover UND Fokus pausieren unabhängig. */
function ToastZeile({ meldung: t, weg }: { meldung: Toast; weg: (id: number) => void }) {
  const zeile = useRef<HTMLDivElement>(null);
  const rest = useRef(t.aktion ? DAUER_MIT_AKTION : DAUER);
  const [hover, setHover] = useState(false);
  const [fokus, setFokus] = useState(false);
  useEffect(() => {
    // Die Meldung lässt Klicks zur Seite durch (pointer-events: none).
    // Ihren geometrischen Hover deshalb beobachten, ohne eine Klickfläche zu schaffen.
    const bewegen = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || (window.matchMedia && !window.matchMedia('(hover: hover)').matches)) return;
      const r = zeile.current?.getBoundingClientRect();
      setHover(!!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    };
    document.addEventListener('pointermove', bewegen, { passive: true });
    return () => document.removeEventListener('pointermove', bewegen);
  }, []);
  useEffect(() => {
    if (t.dauerhaft || hover || fokus) return;
    // Eine Änderung der Systemzeit darf die Restdauer nicht verlängern.
    const start = performance.now();
    const uhr = setTimeout(() => weg(t.id), rest.current);
    return () => { clearTimeout(uhr); rest.current = Math.max(0, rest.current - (performance.now() - start)); };
  }, [t.dauerhaft, t.id, weg, hover, fokus]);
  return (
    <div
      ref={zeile}
      className={t.tone === 'error' ? 'meldung-fehler lot-menue' : 'meldung lot-menue'}
      role={t.dauerhaft ? 'alert' : undefined}
      onMouseEnter={() => { if (!window.matchMedia || window.matchMedia('(hover: hover)').matches) setHover(true); }}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFokus(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFokus(false); }}
    >
      <span className="meldung-text">{t.message}</span>
      {t.aktion && <button type="button" className="meldung-knopf" onClick={() => { weg(t.id); t.aktion!.onClick(); }}>{t.aktion.label}</button>}
      {t.dauerhaft && <button type="button" className="meldung-knopf" onClick={() => weg(t.id)}>Gelesen</button>}
    </div>
  );
}

/**
 * Dasselbe, aber ohne zu werfen, wenn kein Anbieter da ist.
 *
 * Für Bausteine, die auf der FEHLERTAFEL stehen: dort darf nichts mehr
 * scheitern, sonst wird aus der Tafel doch noch die weisse Seite.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToastWennDa(): ToastApi | null {
  return useContext(ToastContext) ?? null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast muss innerhalb von <ToastProvider> verwendet werden.');
  return ctx;
}
