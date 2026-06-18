import type { ReactNode } from 'react';

/** Ladezustand — sichtbar, kein stiller Abbruch. */
export function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-ink-muted" role="status">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

/** Fehlerzustand: erklärt, was war und was zu tun ist. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded border border-danger/30 bg-danger-bg p-4 text-danger" role="alert">
      <p className="font-semibold">Das hat nicht geklappt</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 min-h-touch rounded bg-danger px-3 py-1.5 text-sm font-semibold text-white transition active:scale-[0.98]"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

/** Leerzustand — eine Einladung zu handeln, keine leere weiße Fläche. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-line bg-surface-2 p-8 text-center text-ink-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}
