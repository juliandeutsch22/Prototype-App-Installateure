import type { ReactNode } from 'react';
import Button from './Button';
import Hinweiszeile from './Hinweiszeile';
import LotLeerzeichnung from './LotLeerzeichnung';

/**
 * Ladezustand — sichtbar, kein stiller Abbruch. Erst nach 200 ms
 * (`laden-verzoegert`): ein schnelles Laden blitzt sonst nur kurz auf.
 *
 * `sofort` nur für den ersten Bildschirm beim App-Start: dort ist er das
 * erste, was überhaupt erscheint. Verzögert zählte der Browser ihn nicht
 * als erste Anzeige, und die Seite blieb eine halbe Sekunde länger weiß
 * (Messung 17.10.2026, `docs/ui-umbau/messung-nachher.md`).
 */
export function LoadingState({ label = 'Wird geladen …', sofort = false }: { label?: string; sofort?: boolean }) {
  return (
    <div
      className={`${sofort ? '' : 'laden-verzoegert '}flex items-center justify-center gap-3 p-6 text-ink-muted`}
      role="status"
    >
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

/**
 * Platzhalter in der Form einer Seite: Überschrift und eine Liste.
 *
 * Steht, solange eine Ansicht beim allerersten Öffnen noch nicht da ist
 * (`Suspense` in `App.tsx`). Vorher stand dort ein Kreisel mitten auf der
 * Fläche, und beim Eintreffen sprang die ganze Seite an ihren Platz.
 */
export function SeitenPlatzhalter() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Wird geladen …</span>
      <div aria-hidden="true" className="mb-6 space-y-2">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-3 w-64 max-w-full" />
      </div>
      <SkeletonList rows={6} />
    </div>
  );
}

/** Ladeplatzhalter für den Stand im Seitenkopf (`MetricRow`). */
export function SkeletonMetrics({ count = 3, zusatz = true }: { count?: number; zusatz?: boolean }) {
  return (
    // Dieselben Bausteine wie der Stand selbst — Zeile, Eintrag, Beschriftung,
    // Wert —, damit er beim Eintreffen in jeder Breite dieselbe Höhe findet.
    // Ein Platzhalter, der anders gebaut ist als sein Inhalt, lässt die Seite
    // springen — genau das, was er verhindern soll.
    <div role="status" aria-busy="true">
      <span className="sr-only">Wird geladen …</span>
      <div className="lage-zeile" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="lage-punkt">
            <div className="lage-eintrag">
              <span className="lage-name"><span className="skeleton skeleton-text" data-muster="Beschriftung" /></span>
              <span className="lage-wert"><span className="skeleton skeleton-text" data-muster="€ 00 000,00" /></span>
              {/* Am Handy steht der Zusatz in einer eigenen Zeile — der Platzhalter hält sie frei. */}
              {zusatz && <span className="lage-zusatz"><span className="skeleton skeleton-text" data-muster="00 von 00 Tagen" /></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fehlerzustand: erklärt, was war und was zu tun ist. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  // Als Hinweiszeile, nicht als roter Kasten (Designlinie „Fassung 3"): das
  // rote Symbol sagt „Fehler", der Satz sagt, was war.
  return (
    <Hinweiszeile stufe="fehl" role="alert">
      <p>
        <b>Das hat nicht geklappt</b>
      </p>
      <p className="mt-0.5">{message}</p>
      {onRetry && (
        <Button variant="secondary" groesse="klein" className="mt-2" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </Hinweiszeile>
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
    <Hinweiszeile stufe="warn" role="alert">
      <p>
        {was} konnte nicht geladen werden.{' '}
        {onRetry && (
          <button onClick={onRetry} className="link-hinweis min-h-touch">
            Erneut versuchen
          </button>
        )}
      </p>
    </Hinweiszeile>
  );
}

/**
 * Leerzustand — eine Einladung zu handeln, keine leere weiße Fläche.
 *
 * OHNE KASTEN (Designlinie „Fassung 3"): ein getönter Rahmen um „Noch nichts
 * da" stand in einer Karte wie eine zweite Karte und war damit lauter als
 * der Inhalt, der sonst dort steht. Ein ruhiger, zentrierter Satz genügt.
 */
export function EmptyState({ children, action, titel, zeichnung }: { children: ReactNode; action?: ReactNode; titel?: string; zeichnung?: 'baustelle' | 'angebot' }) {
  return (
    <div className={zeichnung ? 'lot-erstnutzung' : 'flex flex-col items-center gap-3 px-4 py-6 text-center text-ink-muted'}>
      {zeichnung && <LotLeerzeichnung art={zeichnung} />}
      {titel && <h2>{titel}</h2>}
      <p>{children}</p>
      {action}
    </div>
  );
}
