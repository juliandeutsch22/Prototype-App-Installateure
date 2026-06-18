import type { ReactNode } from 'react';

/** Ladezustand — sichtbar, kein stiller Abbruch (vgl. Spec §11). */
export function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-gray-500" role="status">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-brand"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

/** Fehlerzustand mit optionalem Retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
      <p className="font-medium">Etwas ist schiefgelaufen</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

/** Leerzustand. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
      {children}
    </div>
  );
}
