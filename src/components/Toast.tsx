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
}

interface ToastApi {
  success: (message: string, aktion?: MeldungAktion) => void;
  error: (message: string) => void;
  info: (message: string, aktion?: MeldungAktion) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

/** Mit „Rückgängig“ bleibt die Meldung länger stehen: man muss sie lesen und dann noch treffen. */
const DAUER = 3500;
const DAUER_MIT_AKTION = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  /*
    DIE UHREN GEHEN MIT DEM ANBIETER. Lief eine Meldung noch, als der Anbieter
    verschwand (Abmelden, Seitenwechsel, Ende eines Tests), setzte ihr Ablauf
    danach einen Zustand, den es nicht mehr gab — im Test als „window is not
    defined“ nach dem Abbau der Umgebung.
  */
  const uhren = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const laufend = uhren.current;
    return () => {
      for (const u of laufend) clearTimeout(u);
      laufend.clear();
    };
  }, []);

  const weg = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((tone: ToastTone, message: string, aktion?: MeldungAktion) => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, tone, message, aktion }]);
    const uhr = setTimeout(() => {
      uhren.current.delete(uhr);
      weg(id);
    }, aktion ? DAUER_MIT_AKTION : DAUER);
    uhren.current.add(uhr);
  }, [weg]);

  const api = useRef<ToastApi>({
    success: (m, a) => push('success', m, a),
    error: (m) => push('error', m),
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
        {toasts.map((t) => (
          <div key={t.id} className={t.tone === 'error' ? 'meldung-fehler' : 'meldung'}>
            <span className="meldung-text">{t.message}</span>
            {t.aktion && (
              <button
                type="button"
                className="meldung-knopf"
                onClick={() => {
                  weg(t.id);
                  t.aktion!.onClick();
                }}
              >
                {t.aktion.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
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
