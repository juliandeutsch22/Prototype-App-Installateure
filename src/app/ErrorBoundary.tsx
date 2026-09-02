import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Ist das ein fehlgeschlagenes Nachladen einer Ansicht?
 *
 * Seit dem Code-Splitting laedt jede Ansicht erst beim Oeffnen nach. Kommt in
 * der Zwischenzeit ein Deploy, zeigt die laufende Seite auf Dateinamen, die
 * es auf dem Server nicht mehr gibt — Hosting kennt nach einem Deploy nur die
 * neuen. Der Fehler heisst je nach Browser anders; deshalb mehrere Muster.
 */
export function istNachladeFehler(error: { name?: string; message?: string }): boolean {
  const text = `${error.name ?? ''} ${error.message ?? ''}`;
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk \S+ failed/i.test(
    text,
  );
}

/** Merker gegen eine Schleife aus Neuladen und Scheitern. */
const NEULADE_MERKER = 'perl:nachladefehler';
/**
 * Wie lange ein Neuladen als „gerade erst versucht" gilt.
 *
 * Ohne diese Frist gaebe es zwei schlechte Auswege: ohne Merker eine
 * Endlosschleife aus Laden und Scheitern, mit dauerhaftem Merker keine
 * Reparatur mehr fuer den zweiten Deploy derselben Sitzung.
 */
const NEULADE_SPERRE_MS = 10_000;

function darfNeuLaden(): boolean {
  try {
    const zuletzt = Number(sessionStorage.getItem(NEULADE_MERKER) ?? 0);
    if (Date.now() - zuletzt < NEULADE_SPERRE_MS) return false;
    sessionStorage.setItem(NEULADE_MERKER, String(Date.now()));
    return true;
  } catch {
    // Privates Fenster oder abgeschaltete Website-Daten: dann lieber einmal
    // zu wenig neu laden als in einer Schleife zu landen.
    return false;
  }
}

/**
 * Fängt Render-Fehler ab. Ohne das führt ein einziger Fehler in einer
 * Komponente zur weißen Seite — auf der Baustelle wäre die App damit
 * schlicht kaputt, ohne Hinweis, was zu tun ist.
 *
 * Bewusst eine Klassenkomponente: React bietet für Fehlergrenzen bis heute
 * keinen Hook.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kein externer Dienst: die Meldung bleibt im Gerät des Nutzers (DSGVO).
    console.error('Unerwarteter Fehler:', error, info.componentStack);

    /**
     * EIN NACHLADEFEHLER HEILT NUR DURCH NEULADEN.
     *
     * „Erneut versuchen" hilft hier nicht, und das ist keine Meinung: React
     * merkt sich das abgelehnte Versprechen eines `lazy`-Imports. Derselbe
     * Versuch scheitert danach sofort wieder, ohne das Netz auch nur zu
     * fragen. Der Monteur tippte also auf einen Knopf, der nichts tun KANN.
     *
     * Beim Neuladen greift die neue `index.html`, die der Service Worker beim
     * Erkennen des Deploys bereits abgelegt hat — sie zeigt auf die Namen,
     * die es auf dem Server noch gibt.
     */
    if (istNachladeFehler(error) && darfNeuLaden()) window.location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-bold text-ink">Da ist etwas schiefgelaufen</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {istNachladeFehler(error)
              ? 'Die Ansicht konnte nicht nachgeladen werden — meist, weil es gerade eine neue Fassung gibt. „Zur Startseite" holt sie. Deine gespeicherten Daten sind davon nicht betroffen.'
              : 'Die Ansicht konnte nicht geladen werden. Deine gespeicherten Daten sind davon nicht betroffen.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="min-h-touch rounded-sm bg-brand px-4 py-2 font-semibold text-brand-fg"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="min-h-touch rounded-sm border border-line px-4 py-2 font-medium text-ink"
            >
              Zur Startseite
            </button>
          </div>
          <details className="mt-4 text-xs text-ink-muted">
            <summary className="cursor-pointer">Technische Details</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
