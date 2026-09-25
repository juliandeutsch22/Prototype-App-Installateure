import { Children, Fragment, type ReactNode } from 'react';
import Button from './Button';
import Meldung from './Meldung';

/** Ladezustand — sichtbar, kein stiller Abbruch. */
export function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="laden" role="status">
      <span className="laden-kreis" aria-hidden="true" />
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
      <div className="liste" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="platzhalter-zeile">
            <div className="platzhalter-text">
              {/* Zwei unterschiedlich lange Balken: eine Zeile Titel, eine
                  Zeile Untertitel — so sieht jede Liste der App aus. */}
              <div className="skeleton-titel" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
              <div className="skeleton-unter" style={{ width: `${30 + ((i * 17) % 25)}%` }} />
            </div>
            <div className="skeleton-marke" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ladeplatzhalter für die Kennzahlen-Reihe. */
export function SkeletonMetrics({ count = 3 }: { count?: number }) {
  return (
    // Form und Hoehe folgen der Kennzahlen-Leiste — dieselben Klassen,
    // derselbe Trenner. Ein Platzhalter, der anders gebaut ist als sein
    // Inhalt, laesst die Seite beim Eintreffen springen — genau das, was er
    // verhindern soll.
    <div role="status" aria-busy="true" className="kennzahlen">
      <span className="sr-only">Wird geladen …</span>
      {Children.toArray(
        Array.from({ length: count }).map((_, i) => (
          <div key={i} className="kennzahl" aria-hidden="true">
            <div className="skeleton-name" />
            <div className="skeleton-wert" />
          </div>
        )),
      ).map((kind, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="kennzahl-trenner" aria-hidden="true" />}
          {kind}
        </Fragment>
      ))}
    </div>
  );
}

/** Fehlerzustand: erklärt, was war und was zu tun ist. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Meldung ton="gefahr" titel="Das hat nicht geklappt" role="alert">
      <p>{message}</p>
      {onRetry && (
        <Button variant="danger" groesse="klein" className="mt-3" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </Meldung>
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
    <Meldung ton="warnung" role="alert">
      {was} konnte nicht geladen werden.{' '}
      {onRetry && (
        <button type="button" onClick={onRetry} className="textlink-allein">
          Erneut versuchen
        </button>
      )}
    </Meldung>
  );
}

/**
 * Leerzustand — EINE ruhige Zeile, kein umrahmter Platzhalter.
 *
 * Bis zum 25.09.2026 stand hier ein getönter, umrandeter Block mit 24 px
 * Polsterung, mittig gesetzt — „Noch keine Rechnungen" war damit die
 * auffälligste Fläche der Karte. Die Aussage ist eine Zeile wert, nicht mehr.
 * Eine Handlung (`action`) steht in derselben Zeile daneben.
 */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="leer">
      <p>{children}</p>
      {action}
    </div>
  );
}
