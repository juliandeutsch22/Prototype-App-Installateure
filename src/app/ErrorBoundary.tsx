import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
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
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-bold text-ink">Da ist etwas schiefgelaufen</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Die Ansicht konnte nicht geladen werden. Deine gespeicherten Daten sind davon
            nicht betroffen.
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
