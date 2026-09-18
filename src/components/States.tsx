import type { ReactNode } from 'react';
import { GUTER_RAND } from './Metric';

/** Ladezustand — sichtbar, kein stiller Abbruch. */
export function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-6 text-ink-muted" role="status">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent-deep"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

/**
 * Ladeplatzhalter in Listenform.
 *
 * Gegenüber dem Spinner hat er zwei Vorteile: die Fläche behält die Höhe,
 * die der Inhalt gleich einnehmen wird — nichts springt beim Eintreffen —
 * und die App wirkt schneller, weil schon eine Struktur dasteht.
 *
 * Für Screenreader bleibt es EINE Statusmeldung; die grauen Balken selbst
 * sind bedeutungslos und deshalb versteckt.
 */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Wird geladen …</span>
      <div className="divide-y divide-line" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              {/* Zwei unterschiedlich lange Balken: eine Zeile Titel, eine
                  Zeile Untertitel — so sieht jede Liste der App aus. */}
              <div className="skeleton h-4" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
              <div className="skeleton h-3" style={{ width: `${30 + ((i * 17) % 25)}%` }} />
            </div>
            <div className="skeleton h-6 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ladeplatzhalter für die Kennzahlen-Reihe. */
export function SkeletonMetrics({ count = 3 }: { count?: number }) {
  return (
    // Form und Hoehe folgen der Kennzahlen-Leiste. Ein Platzhalter, der
    // anders gebaut ist als sein Inhalt, laesst die Seite beim Eintreffen
    // springen — genau das, was er verhindern soll.
    <div
      role="status"
      aria-busy="true"
      className={`flex items-stretch divide-x divide-line ${GUTER_RAND}`}
    >
      <span className="sr-only">Wird geladen …</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0" aria-hidden="true">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-2 h-6 w-16 sm:h-8" />
        </div>
      ))}
    </div>
  );
}

/** Fehlerzustand: erklärt, was war und was zu tun ist. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded border-l-[3px] border-danger bg-surface-2 p-4 text-danger" role="alert">
      <p className="font-semibold">Das hat nicht geklappt</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 min-h-touch rounded bg-danger px-3 py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

/**
 * Ein NEBENSCHAUPLATZ ist ausgefallen — die Ansicht selbst steht noch.
 *
 * WOFÜR DAS DA IST. Viele Ansichten laden neben ihrem Hauptinhalt noch eine
 * kleine Liste: die Baustellen für ein Auswahlfeld, die Kunden, die
 * Belegschaft. Schlägt so ein Nebenladevorgang fehl, war die bisherige
 * Antwort `catch(() => undefined)` — das Auswahlfeld blieb dann einfach leer.
 * „Es gibt keine Baustellen" und „die Baustellen konnten nicht geladen
 * werden" sahen identisch aus, und genau dieser Unterschied hat schon einmal
 * als Fehler aus dem Betrieb zurückgemeldet werden müssen („leeres
 * Auswahlfeld beim Schein").
 *
 * WARUM NICHT `ErrorState`. Der ersetzt den ganzen Inhalt. Wenn die
 * Kundenliste fehlt, ist die Rechnungsliste deswegen nicht weg — sie
 * unsichtbar zu machen wäre eine größere Störung als die, die gemeldet wird.
 */
export function TeilFehler({ was, onRetry }: { was: string; onRetry?: () => void }) {
  return (
    <p className="rounded border-l-[3px] border-warning bg-surface-2 px-3 py-2 text-sm text-warning" role="alert">
      {was} konnte nicht geladen werden.{' '}
      {onRetry && (
        <button onClick={onRetry} className="min-h-touch font-semibold underline">
          Erneut versuchen
        </button>
      )}
    </p>
  );
}

/** Leerzustand — eine Einladung zu handeln, keine leere weiße Fläche. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-line bg-surface-2 p-6 text-center text-ink-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}
