import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

/*
  WEISSE KARTE MIT FARBIGER KANTE, keine gesättigte Fläche. Grün und Rot
  vollflächig waren die einzigen lauten Farbflächen der ganzen App ausser
  Petrol — dieselbe Regel, nach der Abzeichen einen Punkt tragen statt einer
  Pille (Prüflauf 24.09.2026, C14; siehe `Badge.tsx`). Die Kante trägt den
  Ton, der Text bleibt dunkel und lesbar.
*/
const toneClasses: Record<ToastTone, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  info: 'border-l-brand-fixed',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const api = useRef<ToastApi>({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-sm rounded border border-l-4 border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-lg ${toneClasses[t.tone]}`}
          >
            {t.message}
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
